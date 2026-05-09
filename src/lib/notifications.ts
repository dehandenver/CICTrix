import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';

export type DivisionKey = 'pm' | 'lnd' | 'rsp' | 'super';

export interface NotificationItem {
  id: string;
  source: 'pm';
  title: string;
  message: string;
  createdAt: string;
  isUnread: boolean;
  payload: {
    reportId: string;
    department: string;
    period: string;
  };
}

const LAST_SEEN_KEY = (division: DivisionKey) => `cictrix_notif_last_seen_${division}`;
const POLL_INTERVAL_MS = 30_000;

const readLastSeen = (division: DivisionKey): string | null => {
  try {
    return localStorage.getItem(LAST_SEEN_KEY(division));
  } catch {
    return null;
  }
};

const writeLastSeen = (division: DivisionKey, iso: string) => {
  try {
    localStorage.setItem(LAST_SEEN_KEY(division), iso);
  } catch {
    /* storage may be unavailable; non-fatal */
  }
};

/**
 * Polling hook that surfaces inter-module documents as notifications for the
 * given division. v1 only handles PM → L&D (pm_lnd_reports).
 *
 * - `items` is the recent notification list (newest first, max 50).
 * - `unreadCount` is items whose created_at > localStorage last_seen.
 * - `arrivedDuringSession` is the latest item that appeared on a poll *after*
 *    the first fetch — used to drive the bell speech-bubble toast.
 * - `markAllRead` advances last_seen to now and clears unread state.
 */
export const useDivisionNotifications = (division: DivisionKey) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [arrivedDuringSession, setArrivedDuringSession] = useState<NotificationItem | null>(null);

  const lastSeenRef = useRef<string | null>(readLastSeen(division));
  const knownIdsRef = useRef<Set<string> | null>(null); // null => first fetch hasn't completed yet

  const fetchItems = useCallback(async () => {
    if (division !== 'lnd') {
      setItems([]);
      setLoading(false);
      knownIdsRef.current = new Set();
      return;
    }

    try {
      const { data, error } = await supabase
        .from('pm_lnd_reports')
        .select('id, department, period, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const lastSeen = lastSeenRef.current;
      const mapped: NotificationItem[] = (data ?? []).map((row: Record<string, unknown>) => {
        const createdAt = String(row.created_at ?? '');
        const dept = String(row.department ?? '');
        return {
          id: String(row.id),
          source: 'pm' as const,
          title: `Summary of Ratings — ${dept || 'Unknown department'}`,
          message: `You've received a document from PM Division${dept ? ` (${dept})` : ''}`,
          createdAt,
          isUnread: !lastSeen || (createdAt && new Date(createdAt) > new Date(lastSeen)),
          payload: {
            reportId: String(row.id),
            department: dept,
            period: String(row.period ?? ''),
          },
        };
      });

      // Diff against previously-known ids to detect items that appeared during this session.
      // Skip the diff on the very first fetch — those are "already there", not new arrivals.
      if (knownIdsRef.current !== null) {
        const known = knownIdsRef.current;
        const arrivals = mapped.filter(n => !known.has(n.id));
        if (arrivals.length > 0) {
          // Newest arrival drives the toast; mapped is sorted newest-first.
          setArrivedDuringSession(arrivals[0]);
        }
      }
      knownIdsRef.current = new Set(mapped.map(n => n.id));

      setItems(mapped);
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    } finally {
      setLoading(false);
    }
  }, [division]);

  useEffect(() => {
    void fetchItems();
    const id = setInterval(() => {
      void fetchItems();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchItems]);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    writeLastSeen(division, now);
    lastSeenRef.current = now;
    setItems(prev => prev.map(item => ({ ...item, isUnread: false })));
  }, [division]);

  const dismissArrivedToast = useCallback(() => {
    setArrivedDuringSession(null);
  }, []);

  const unreadCount = useMemo(() => items.filter(i => i.isUnread).length, [items]);

  return {
    items,
    unreadCount,
    arrivedDuringSession,
    loading,
    markAllRead,
    dismissArrivedToast,
    refresh: fetchItems,
  };
};

/**
 * "2m ago" / "3h ago" / "5d ago" / fallback to local date.
 */
export const formatRelative = (iso: string): string => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.max(0, (Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 7 * 86_400) return `${Math.floor(diffSec / 86_400)}d ago`;
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};
