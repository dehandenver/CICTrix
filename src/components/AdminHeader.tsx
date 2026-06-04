import { Bell, FileText, HelpCircle, MessageSquare, UserCircle2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  type DivisionKey,
  type NotificationItem,
  formatRelative,
  useDivisionNotifications,
} from '../lib/notifications';
import { LogoutConfirmPopover } from './LogoutConfirmPopover';

interface AdminHeaderProps {
  /** Display name shown next to the avatar (e.g. "Alex Gonzales") */
  userName?: string;
  /** Division/role label shown below the user name (e.g. "L&D Division") */
  divisionLabel?: string;
  /** Drives notification scoping. Omit/use 'pm','rsp','super' for divisions that don't yet receive notifications. */
  division?: DivisionKey;
  /** Called when a notification entry is clicked. Caller is responsible for routing. */
  onNotificationClick?: (item: NotificationItem) => void;
}

const SPEECH_BUBBLE_AUTO_DISMISS_MS = 7000;

/**
 * Shared sticky header used across all admin modules.
 * The bell is functional when `division` is provided — it polls Supabase for
 * inter-module documents addressed to that division and renders an unread
 * badge, scrollable dropdown, and an in-session arrival speech bubble.
 */
export const AdminHeader = ({
  userName = 'Admin',
  divisionLabel = 'HRIS Admin',
  division,
  onNotificationClick,
}: AdminHeaderProps) => {
  const {
    items,
    unreadCount,
    arrivedDuringSession,
    markAllRead,
    dismissArrivedToast,
  } = useDivisionNotifications(division ?? 'super');

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Click-outside + ESC to close dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [dropdownOpen]);

  // Auto-dismiss the speech bubble after a few seconds
  useEffect(() => {
    if (!arrivedDuringSession) return;
    const t = setTimeout(dismissArrivedToast, SPEECH_BUBBLE_AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [arrivedDuringSession, dismissArrivedToast]);

  const handleBellClick = () => {
    dismissArrivedToast();
    setDropdownOpen(open => !open);
  };

  const handleEntryClick = (item: NotificationItem) => {
    setDropdownOpen(false);
    dismissArrivedToast();
    markAllRead();
    onNotificationClick?.(item);
  };

  const handleSpeechBubbleClick = () => {
    if (arrivedDuringSession) {
      const item = arrivedDuringSession;
      dismissArrivedToast();
      setDropdownOpen(false);
      markAllRead();
      onNotificationClick?.(item);
    }
  };

  const showBadge = division !== undefined && unreadCount > 0;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left — Logo & Title */}
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-[#363EE8] text-white grid place-content-center text-lg font-bold">
            AB
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">Abyan HRIS</h1>
            <p className="text-xs text-slate-500">Human Resource Information System</p>
          </div>
        </div>

        {/* Right — Actions, User & Logout */}
        <div className="flex items-center gap-4 text-slate-500">
          <button className="rounded-full p-2 hover:bg-slate-100" type="button" aria-label="Help">
            <HelpCircle className="h-5 w-5" />
          </button>

          {/* Bell + dropdown + speech bubble live in a single positioned wrapper */}
          <div className="relative" ref={containerRef}>
            <button
              type="button"
              onClick={handleBellClick}
              className="rounded-full p-2 hover:bg-slate-100 relative"
              aria-label={`Notifications${showBadge ? ` (${unreadCount} unread)` : ''}`}
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
            >
              <Bell className="h-5 w-5" />
              {showBadge && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Speech bubble (toast) — only when a notification arrived during this session */}
            {arrivedDuringSession && !dropdownOpen && (
              <div
                role="status"
                onClick={handleSpeechBubbleClick}
                className="absolute right-0 top-full mt-3 w-72 cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl"
              >
                {/* pointer arrow up toward the bell */}
                <span
                  aria-hidden="true"
                  className="absolute right-3 -top-2 h-3 w-3 rotate-45 border-l border-t border-slate-200 bg-white"
                />
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 rounded-lg bg-blue-100 p-1.5 text-blue-600">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 leading-tight">
                      {arrivedDuringSession.message}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{formatRelative(arrivedDuringSession.createdAt)} • Click to view</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissArrivedToast();
                    }}
                    className="rounded p-0.5 text-slate-400 hover:text-slate-600"
                    aria-label="Dismiss notification toast"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Dropdown */}
            {dropdownOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
                    <p className="text-[11px] text-slate-500">
                      {division ? `Scoped to ${divisionLabel}` : 'Notifications are not enabled for this division'}
                    </p>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {items.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-500">
                      {division
                        ? "You're all caught up — no notifications yet."
                        : 'Notifications are not enabled for this view.'}
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {items.map(item => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => handleEntryClick(item)}
                            className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                              item.isUnread ? 'bg-blue-50/40' : ''
                            }`}
                          >
                            <div className={`mt-0.5 rounded-lg p-1.5 ${item.isUnread ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-sm ${item.isUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'} leading-tight truncate`}>
                                  {item.title}
                                </p>
                                {item.isUnread && (
                                  <span className="shrink-0 inline-block h-2 w-2 rounded-full bg-blue-500" aria-label="unread" />
                                )}
                              </div>
                              <p className="text-xs text-slate-600 mt-0.5">{item.message}</p>
                              <p className="text-[11px] text-slate-400 mt-1">{formatRelative(item.createdAt)}</p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="h-8 w-px bg-slate-200" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-600 text-white grid place-content-center">
              <UserCircle2 className="h-6 w-6" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-800">{userName}</p>
              <p className="text-xs text-slate-500">{divisionLabel}</p>
            </div>
          </div>
          <LogoutConfirmPopover />
        </div>
      </div>
    </header>
  );
};
