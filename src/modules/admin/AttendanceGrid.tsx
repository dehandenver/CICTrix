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

import { useEffect, useMemo, useState } from 'react';
import { Info, X } from 'lucide-react';
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

  const [attendance, setAttendance] = useState<AttendanceMap>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [excuse, setExcuse] = useState<{
    enrollmentId: string; dayKey: string; session: SessionHalf;
    attendee: string; dayLabel: string; note: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = await listAttendance(attendees.map((a) => a.enrollmentId));
      if (!cancelled) setAttendance(map);
    })();
    return () => { cancelled = true; };
  }, [attendees]);

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

  const commit = async (enrollmentId: string, dayKey: string, session: SessionHalf, status: DayStatus | null, note?: string | null) => {
    setBusy(`${enrollmentId}:${dayKey}:${session}`);
    const res = await setDayAttendance({ enrollmentId, dayKey, session, status, note });
    setBusy(null);
    if (!res.ok) { alert(res.error); return; }
    applyLocal(enrollmentId, dayKey, session, status, status === 'Excused' ? (note ?? '') : null);
  };

  const clickStatus = (enrollmentId: string, dayKey: string, session: SessionHalf, status: DayStatus) => {
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

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-left text-sm">
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
                                disabled={cellBusy}
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
                              onClick={() => clickStatus(att.enrollmentId, d.key, half, 'Excused')}
                              title="View excuse note"
                              className="text-amber-500 hover:text-amber-600"
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

      {/* Excuse note popup */}
      {excuse && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setExcuse(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-5 pt-5 pb-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">Excuse note</h3>
                <p className="text-xs text-slate-500">{excuse.attendee} · {excuse.dayLabel}</p>
              </div>
              <button type="button" onClick={() => setExcuse(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 pb-5">
              <textarea
                rows={3}
                value={excuse.note}
                onChange={(e) => setExcuse({ ...excuse, note: e.target.value })}
                placeholder="Reason for the excused absence (required)…"
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="mt-3 flex items-center justify-between">
                {cellOf(excuse.enrollmentId, excuse.dayKey, excuse.session).status === 'Excused' ? (
                  <button
                    type="button"
                    onClick={() => { void commit(excuse.enrollmentId, excuse.dayKey, excuse.session, null); setExcuse(null); }}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    Clear
                  </button>
                ) : <span />}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setExcuse(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                  <button
                    type="button"
                    disabled={!excuse.note.trim()}
                    onClick={() => { void commit(excuse.enrollmentId, excuse.dayKey, excuse.session, 'Excused', excuse.note); setExcuse(null); }}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    Save excuse
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceGrid;
