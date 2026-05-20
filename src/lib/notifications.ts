import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';

export type DivisionKey = 'pm' | 'lnd' | 'rsp' | 'super';

export type NotificationSource = 'pm' | 'applicant' | 'evaluation' | 'employee_doc';

export interface NotificationItem {
  id: string;
  source: NotificationSource;
  title: string;
  message: string;
  createdAt: string;
  isUnread: boolean;
  payload: {
    /** PM → L&D report id (only set when source = 'pm') */
    reportId?: string;
    /** Department / office tied to the event, when known */
    department?: string;
    /** Reporting period (PM → L&D) */
    period?: string;
    /** Applicant UUID — set for applicant + evaluation events */
    applicantId?: string;
    /** Applicant display name — convenience for routing pages that show context */
    applicantName?: string;
    /** Employee UUID — set for employee_doc events */
    employeeId?: string;
    /** employee_documents.id (the actual row) */
    documentId?: string;
    /** Document type label, e.g. "NBI Clearance" */
    documentType?: string;
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
    const lastSeen = lastSeenRef.current;
    const decorateUnread = (createdAt: string): boolean =>
      !lastSeen || (Boolean(createdAt) && new Date(createdAt) > new Date(lastSeen));

    let mapped: NotificationItem[] = [];

    try {
      if (division === 'lnd') {
        const { data, error } = await supabase
          .from('pm_lnd_reports')
          .select('id, department, period, created_at')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;

        mapped = (data ?? []).map((row: Record<string, unknown>) => {
          const createdAt = String(row.created_at ?? '');
          const dept = String(row.department ?? '');
          return {
            id: String(row.id),
            source: 'pm' as const,
            title: `Summary of Ratings — ${dept || 'Unknown department'}`,
            message: `You've received a document from PM Division${dept ? ` (${dept})` : ''}`,
            createdAt,
            isUnread: decorateUnread(createdAt),
            payload: {
              reportId: String(row.id),
              department: dept,
              period: String(row.period ?? ''),
            },
          };
        });
      } else if (division === 'rsp') {
        mapped = await fetchRspNotifications(decorateUnread);
      } else {
        // No notifications wired for this division yet.
        setItems([]);
        setLoading(false);
        knownIdsRef.current = new Set();
        return;
      }

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
 * Build the unified notification feed for the RSP module.
 *
 * Pulls from three operational tables and merges newest-first:
 *   1. `applicants`            → "New applicant submitted an application"
 *   2. `evaluations`           → "<rater> evaluated <applicant>"
 *   3. `employee_documents`    → "<employee> submitted <document>"
 *
 * No new schema is required — these notifications are derived from existing
 * activity that's already happening, just like the PM → L&D feed mirrors
 * `pm_lnd_reports` directly.
 */
const fetchRspNotifications = async (
  decorateUnread: (createdAt: string) => boolean,
): Promise<NotificationItem[]> => {
  // Fetch the three sources in parallel; any individual failure should not
  // sink the whole feed, so we swallow per-source errors with a warning.
  const [applicantsResult, evaluationsResult, documentsResult] = await Promise.all([
    (supabase as any)
      .from('applicants')
      .select('id, first_name, last_name, position, office, status, created_at')
      .order('created_at', { ascending: false })
      .limit(25)
      .then((r: any) => r)
      .catch((e: unknown) => ({ data: null, error: e })),
    (supabase as any)
      .from('evaluations')
      .select('id, applicant_id, rater_email, rater_name, total_score, created_at')
      .order('created_at', { ascending: false })
      .limit(25)
      .then((r: any) => r)
      .catch((e: unknown) => ({ data: null, error: e })),
    (supabase as any)
      .from('employee_documents')
      .select('id, employee_id, document_type, file_name, uploaded_at')
      .order('uploaded_at', { ascending: false })
      .limit(25)
      .then((r: any) => r)
      .catch((e: unknown) => ({ data: null, error: e })),
  ]);

  if (applicantsResult?.error) console.warn('rsp notifications: applicants fetch failed', applicantsResult.error);
  if (evaluationsResult?.error) console.warn('rsp notifications: evaluations fetch failed', evaluationsResult.error);
  if (documentsResult?.error) console.warn('rsp notifications: employee_documents fetch failed', documentsResult.error);

  const items: NotificationItem[] = [];

  // ── Applicant submissions ───────────────────────────────────────────────
  for (const row of (applicantsResult?.data ?? []) as any[]) {
    const createdAt = String(row?.created_at ?? '');
    const fullName = [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim() || 'Unknown applicant';
    const position = String(row?.position ?? 'an open position').trim();
    items.push({
      id: `applicant-${String(row?.id ?? '')}`,
      source: 'applicant',
      title: `New application — ${fullName}`,
      message: `${fullName} applied for ${position}${row?.office ? ` (${row.office})` : ''}.`,
      createdAt,
      isUnread: decorateUnread(createdAt),
      payload: {
        applicantId: String(row?.id ?? ''),
        applicantName: fullName,
        department: row?.office ? String(row.office) : undefined,
      },
    });
  }

  // ── Evaluations completed by interviewers ───────────────────────────────
  // We need the applicant's name for context. Fetch in one round-trip after the
  // evaluation list lands.
  const evaluationRows = (evaluationsResult?.data ?? []) as any[];
  const applicantIdsToResolve = Array.from(
    new Set(evaluationRows.map((row) => String(row?.applicant_id ?? '')).filter(Boolean)),
  );

  let applicantNameById = new Map<string, string>();
  if (applicantIdsToResolve.length > 0) {
    const namesResult = await (supabase as any)
      .from('applicants')
      .select('id, first_name, last_name')
      .in('id', applicantIdsToResolve)
      .then((r: any) => r)
      .catch((e: unknown) => ({ data: null, error: e }));
    for (const row of (namesResult?.data ?? []) as any[]) {
      const fullName = [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim() || 'Unknown applicant';
      applicantNameById.set(String(row.id), fullName);
    }
  }

  for (const row of evaluationRows) {
    const createdAt = String(row?.created_at ?? '');
    const applicantId = String(row?.applicant_id ?? '');
    const applicantName = applicantNameById.get(applicantId) ?? 'an applicant';
    const rater = String(row?.rater_name ?? row?.rater_email ?? 'An interviewer').trim();
    const score = typeof row?.total_score === 'number' ? row.total_score.toFixed(2) : null;
    items.push({
      id: `eval-${String(row?.id ?? '')}`,
      source: 'evaluation',
      title: `Evaluation submitted — ${applicantName}`,
      message: `${rater} evaluated ${applicantName}${score ? ` (score ${score})` : ''}.`,
      createdAt,
      isUnread: decorateUnread(createdAt),
      payload: {
        applicantId: applicantId || undefined,
        applicantName,
      },
    });
  }

  // ── Employee document submissions ──────────────────────────────────────
  for (const row of (documentsResult?.data ?? []) as any[]) {
    const createdAt = String(row?.uploaded_at ?? '');
    const docType = String(row?.document_type ?? 'a document').trim();
    items.push({
      id: `doc-${String(row?.id ?? '')}`,
      source: 'employee_doc',
      title: `Document submitted — ${docType}`,
      message: `An employee uploaded ${docType}${row?.file_name ? ` (${row.file_name})` : ''}.`,
      createdAt,
      isUnread: decorateUnread(createdAt),
      payload: {
        documentId: String(row?.id ?? ''),
        documentType: docType,
        employeeId: row?.employee_id ? String(row.employee_id) : undefined,
      },
    });
  }

  // Newest first, hard cap at 50 to match the PM→L&D feed.
  items.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  return items.slice(0, 50);
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
