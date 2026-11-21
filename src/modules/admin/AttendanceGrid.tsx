/**
 * Per-half-day attendance grid (§5).
 *
 * Rows = enrolled attendees. Each training day splits into a Morning and an
 * Afternoon column, because attendance is taken twice a day — recording once
 * made a half-day absence unrepresentable. Each cell is Present / Absent /
 * Excused; an excused half-day opens a required-note popup, and the note shows
 * again when the Excused badge is reopened. A day can only be marked once it has
 * started — future-day cells are disabled. A roll-up per attendee summarises
 * present / absent / excused across all half-days.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import {
  cellKey,
  listAttendance,
  setDayAttendance,
  SESSION_HALVES,
  SESSION_LABEL,
  type AttendanceMap,
  type DayStatus,
  type SessionHalf,
} from '../../lib/api/trainingAttendance';
import { Modal } from '../../components/modal';

type Attendee = { enrollmentId: string; name: string; department: string };

type Props = {
  startDate: string;
  endDate: string | null;
  attendees: Attendee[];
};

const dayKeyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Each local calendar day the training spans, start → end inclusive. */
const trainingDays = (startDate: string, endDate: string | null): { key: string; label: string }[] => {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : start;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const days: { key: string; label: string }[] = [];
  while (cursor <= last && days.length < 366) {
    days.push({ key: dayKeyOf(cursor), label: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

const STATUS_STYLE: Record<DayStatus, string> = {
  Present: 'bg-emerald-600 text-white',
  Absent: 'bg-red-600 text-white',
  Excused: 'bg-amber-500 text-white',
};

export const AttendanceGrid = ({ startDate, endDate, attendees }: Props) => {
  const days = useMemo(() => trainingDays(startDate, endDate), [startDate, endDate]);
  const todayKey = dayKeyOf(new Date());

  const enrollmentIds = useMemo(
    () => [...new Set(attendees.map((a) => a.enrollmentId).filter(Boolean))].sort(),
    [attendees],
  );
  const enrollmentIdsKey = enrollmentIds.join(',');
  const scopeKey = `${startDate}|${endDate ?? ''}|${enrollmentIdsKey}`;

  const [attendance, setAttendance] = useState<AttendanceMap>(new Map());
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [excuse, setExcuse] = useState<{
    enrollmentId: string; dayKey: string; session: SessionHalf;
    attendee: string; dayLabel: string; note: string;
  } | null>(null);

  const loadGenRef = useRef(0);
  const loadedScopeRef = useRef<string | null>(null);
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;

  const loadAttendanceData = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const targetScope = scopeKeyRef.current;
      const targetIds = enrollmentIdsKey ? enrollmentIdsKey.split(',') : [];
      const gen = ++loadGenRef.current;
      if (mode === 'initial' || loadedScopeRef.current !== targetScope) {
        setHasLoaded(false);
        setAttendance(new Map());
      }
      setLoading(true);
      setLoadError(null);
      setMutationError(null);
      try {
        const map = await listAttendance(targetIds);
        if (gen !== loadGenRef.current || targetScope !== scopeKeyRef.current) return;
        loadedScopeRef.current = targetScope;
        setAttendance(map);
        setHasLoaded(true);
        setLoadError(null);
      } catch (err) {
        if (gen !== loadGenRef.current || targetScope !== scopeKeyRef.current) return;
        setLoadError(err instanceof Error && err.message ? err.message : 'Could not load attendance records.');
      } finally {
        if (gen === loadGenRef.current) setLoading(false);
      }
    },
    [enrollmentIdsKey],
  );

  useEffect(() => {
    loadedScopeRef.current = null;
    setHasLoaded(false);
    setAttendance(new Map());
    setLoadError(null);
    setMutationError(null);
    setExcuse(null);
    void loadAttendanceData('initial');
    return () => {
      loadGenRef.current += 1;
    };
  }, [scopeKey, loadAttendanceData]);

  const staleBlocked = Boolean(loadError);

  const cellOf = (enrollmentId: string, dayKey: string, session: SessionHalf) =>
    attendance.get(enrollmentId)?.get(cellKey(dayKey, session))
      ?? { status: null as DayStatus | null, note: null as string | null };

  const applyLocal = (enrollmentId: string, dayKey: string, session: SessionHalf, status: DayStatus | null, note: string | null) =>
    setAttendance((prev) => {
      const next = new Map(prev);
      const inner = new Map(next.get(enrollmentId) ?? []);
      inner.set(cellKey(dayKey, session), { status, note });
      next.set(enrollmentId, inner);
      return next;
    });

  const commit = async (
    enrollmentId: string,
    dayKey: string,
    session: SessionHalf,
    status: DayStatus | null,
    note?: string | null,
  ): Promise<boolean> => {
    if (!hasLoaded || staleBlocked) return false;
    setBusy(`${enrollmentId}:${dayKey}:${session}`);
    setMutationError(null);
    const res = await setDayAttendance({ enrollmentId, dayKey, session, status, note });
    setBusy(null);
    if (res.ok !== true) {
      setMutationError(res.error || 'Could not save attendance.');
      return false;
    }
    applyLocal(enrollmentId, dayKey, session, status, status === 'Excused' ? (note ?? '') : null);
    return true;
  };

  const clickStatus = (enrollmentId: string, dayKey: string, session: SessionHalf, status: DayStatus) => {
    if (!hasLoaded || staleBlocked) return;
    setMutationError(null);
    const cell = cellOf(enrollmentId, dayKey, session);
    if (status === 'Excused') {
      const attendee = attendees.find((a) => a.enrollmentId === enrollmentId)?.name ?? '';
      const dayLabel = `${days.find((d) => d.key === dayKey)?.label ?? dayKey} · ${SESSION_LABEL[session]}`;
      setExcuse({ enrollmentId, dayKey, session, attendee, dayLabel, note: cell.note ?? '' });
      return;
    }
    // Clicking the active Present/Absent clears it.
    void commit(enrollmentId, dayKey, session, cell.status === status ? null : status);
  };

  const rollup = (enrollmentId: string) => {
    let p = 0, a = 0, e = 0;
    for (const d of days) {
      for (const half of SESSION_HALVES) {
        const s = cellOf(enrollmentId, d.key, half).status;
        if (s === 'Present') p++;
        else if (s === 'Absent') a++;
        else if (s === 'Excused') e++;
      }
    }
    return { p, a, e };
  };

  if (!hasLoaded) {
    if (loadError) {
      return (
        <div
          role="alert"
          className="abyan-tokens flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--error-300)] bg-[var(--error-100)] p-4 text-sm text-[var(--error-700)]"
        >
          <span>Could not load attendance records: {loadError}</span>
          <button
            type="button"
            onClick={() => void loadAttendanceData('initial')}
            className="btn btn-sm btn-secondary"
          >
            Retry
          </button>
        </div>
      );
    }
    return (
      <p role="status" className="abyan-tokens p-4 text-sm text-[var(--neutral-500)]">
        Loading attendance…
      </p>
    );
  }

  return (
    <div className="abyan-tokens space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void loadAttendanceData('refresh')}
          disabled={loading}
          className="btn btn-sm btn-secondary"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--warning-300)] bg-[var(--warning-100)] p-3 text-sm text-[var(--warning-700)]"
        >
          <span>Showing stale attendance data — refresh failed ({loadError}). Editing is disabled until refreshed.</span>
          <button
            type="button"
            onClick={() => void loadAttendanceData('refresh')}
            disabled={loading}
            className="btn btn-sm btn-secondary"
          >
            Retry refresh
          </button>
        </div>
      )}

      {mutationError && !excuse && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--error-300)] bg-[var(--error-100)] p-3 text-sm text-[var(--error-700)]"
        >
          <span>{mutationError}</span>
          <button
            type="button"
            onClick={() => setMutationError(null)}
            className="btn btn-sm btn-secondary"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="abyan-table-wrap">
      <table className="abyan-table w-full text-left">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
          <tr>
            <th rowSpan={2} className="px-4 py-2.5 font-semibold sticky left-0 bg-gray-50 align-bottom">Attendee</th>
            {days.map((d) => (
              <th
                key={d.key}
                colSpan={2}
                className="px-3 py-2 font-semibold text-center whitespace-nowrap border-l border-gray-200"
              >
                {d.label}
              </th>
            ))}
            <th rowSpan={2} className="px-4 py-2.5 font-semibold text-right whitespace-nowrap align-bottom border-l border-gray-200">Roll-up</th>
          </tr>
          <tr>
            {days.flatMap((d) =>
              SESSION_HALVES.map((half) => (
                <th
                  key={`${d.key}-${half}`}
                  className={[
                    'px-2 pb-2 text-[10px] font-medium text-center whitespace-nowrap',
                    half === 'AM' ? 'border-l border-gray-200' : '',
                  ].join(' ')}
                >
                  {half}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {attendees.map((att) => {
            const r = rollup(att.enrollmentId);
            return (
              <tr key={att.enrollmentId} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 sticky left-0 bg-white">
                  <p className="font-semibold text-gray-900 whitespace-nowrap">{att.name}</p>
                  <p className="text-xs text-gray-500 whitespace-nowrap">{att.department}</p>
                </td>
                {days.flatMap((d) =>
                  SESSION_HALVES.map((half) => {
                    const cell = cellOf(att.enrollmentId, d.key, half);
                    const future = d.key > todayKey;
                    const cellBusy = busy === `${att.enrollmentId}:${d.key}:${half}`;
                    const edge = half === 'AM' ? 'border-l border-gray-200' : '';
                    if (future) {
                      return (
                        <td key={`${d.key}-${half}`} className={`px-2 py-3 text-center ${edge}`}>
                          <span className="text-[10px] text-gray-300">—</span>
                        </td>
                      );
                    }
                    return (
                      <td key={`${d.key}-${half}`} className={`px-2 py-3 ${edge}`}>
                        <div className="flex items-center justify-center gap-0.5">
                          {(['Present', 'Absent', 'Excused'] as DayStatus[]).map((s) => {
                            const active = cell.status === s;
                            return (
                              <button
                                key={s}
                                type="button"
                                disabled={cellBusy || staleBlocked}
                                onClick={() => clickStatus(att.enrollmentId, d.key, half, s)}
                                title={
                                  s === 'Excused' && active && cell.note
                                    ? cell.note
                                    : `${s} · ${SESSION_LABEL[half]}`
                                }
                                className={[
                                  'h-5 w-5 rounded text-[10px] font-bold transition disabled:opacity-50',
                                  active ? STATUS_STYLE[s] : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                                ].join(' ')}
                              >
                                {s[0]}
                              </button>
                            );
                          })}
                          {cell.status === 'Excused' && cell.note && (
                            <button
                              type="button"
                              disabled={staleBlocked}
                              onClick={() => clickStatus(att.enrollmentId, d.key, half, 'Excused')}
                              title="View excuse note"
                              className="text-amber-500 hover:text-amber-600 disabled:opacity-50"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })
                )}
                <td className="px-4 py-3 text-right whitespace-nowrap text-xs text-gray-600 border-l border-gray-200">
                  <span className="text-emerald-600 font-semibold">{r.p}P</span>{' · '}
                  <span className="text-red-600 font-semibold">{r.a}A</span>{' · '}
                  <span className="text-amber-600 font-semibold">{r.e}E</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* Excuse note popup */}
      <Modal
        open={Boolean(excuse)}
        onClose={() => { setExcuse(null); setMutationError(null); }}
        size="sm"
        title="Excuse note"
        subtitle={excuse ? `${excuse.attendee} · ${excuse.dayLabel}` : undefined}
        footer={excuse && (
          <>
            {cellOf(excuse.enrollmentId, excuse.dayKey, excuse.session).status === 'Excused' && (
              <button
                type="button"
                disabled={staleBlocked || busy !== null}
                onClick={async () => {
                  const ok = await commit(excuse.enrollmentId, excuse.dayKey, excuse.session, null);
                  if (ok) setExcuse(null);
                }}
                className="btn btn-md btn-secondary mr-auto"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => { setExcuse(null); setMutationError(null); }}
              className="btn btn-md btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={staleBlocked || busy !== null || !excuse.note.trim()}
              onClick={async () => {
                const ok = await commit(excuse.enrollmentId, excuse.dayKey, excuse.session, 'Excused', excuse.note);
                if (ok) setExcuse(null);
              }}
              className="btn btn-md btn-primary"
            >
              Save Excuse
            </button>
          </>
        )}
      >
        {excuse && (
          <div className="space-y-3">
            {mutationError && (
              <div
                role="alert"
                className="rounded-lg border border-[var(--error-300)] bg-[var(--error-100)] p-2.5 text-sm text-[var(--error-700)]"
              >
                {mutationError}
              </div>
            )}
            <div>
              <label htmlFor="excuse-note" className="mb-1.5 block text-[13px] font-medium text-[var(--neutral-800)]">
                Reason for the excused absence <span className="text-[var(--error-500)]">*</span>
              </label>
              <textarea
                id="excuse-note"
                rows={3}
                value={excuse.note}
                onChange={(e) => setExcuse({ ...excuse, note: e.target.value })}
                placeholder="e.g. Medical appointment, with certificate"
                className="w-full rounded-lg border border-[var(--neutral-200)] p-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[rgba(54,62,232,.15)]"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AttendanceGrid;
