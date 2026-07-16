/**
 * IPCR Demo — notification bell.
 *
 * Every signed-in account gets this in the header. Polls the notifications table
 * for the account and shows an unread count; opening the dropdown marks them
 * read. The poll (every 5s) is what makes a hand-off "appear in real time" in
 * the receiving tab during the live demo.
 */

import { useEffect, useRef, useState } from 'react';
import { listNotifications, markNotificationsRead } from './workflow';
import type { DemoNotification } from './types';

export function NotificationBell({ accountId, onChange }: { accountId: string; onChange?: () => void }) {
  const [items, setItems] = useState<DemoNotification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    const res = await listNotifications(accountId);
    if (res.ok) setItems(res.data);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const unread = items.filter((i) => !i.is_read).length;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await markNotificationsRead(accountId);
      setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
      onChange?.();
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative rounded-xl border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Notifications</div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">No notifications yet.</div>
            ) : (
              items.map((n) => (
                <div key={n.id} className="border-b border-slate-50 px-4 py-3 last:border-0">
                  <p className="text-sm text-slate-700">{n.message}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
