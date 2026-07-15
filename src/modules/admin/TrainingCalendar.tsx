import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Rows3,
  Sparkles,
  Target,
  User,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import {
  cancelCalendarEvent,
  createCalendarEvent,
  listCalendarEvents,
  setAttendance,
  updateCalendarEvent,
  type AttendanceStatus,
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarEventStatus,
} from '../../lib/api/trainingCalendar';
import { countRecommendedByCourse, generateRecommendations } from '../../lib/api/trainingRecommendations';
import { RecommendedEmployees } from './RecommendedEmployees';
import { TRAINING_CATEGORIES, categoryColor, type TrainingCategory } from './trainingCategories';

const EVENT_STATUSES: CalendarEventStatus[] = ['Scheduled', 'Ongoing', 'Completed', 'Cancelled'];
const ATTENDANCE_OPTIONS: AttendanceStatus[] = ['Present', 'Absent', 'Excused'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_BADGE: Record<CalendarEventStatus, string> = {
  Scheduled: 'bg-blue-100 text-blue-700',
  Ongoing: 'bg-amber-100 text-amber-700',
  Completed: 'bg-emerald-100 text-emerald-700',
  Cancelled: 'bg-red-100 text-red-700',
};

const ATTENDANCE_BADGE: Record<AttendanceStatus, string> = {
  Present: 'bg-emerald-600 text-white',
  Absent: 'bg-red-600 text-white',
  Excused: 'bg-amber-500 text-white',
};

// ── Date helpers ──────────────────────────────────────────────────────────────
// The calendar grid works in the viewer's local timezone; the API stores UTC
// timestamps. Everything crossing that boundary goes through these two.

/** Local date-only key, e.g. "2026-07-09". Used to bucket events into day cells. */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ISO timestamp -> value for an <input type="datetime-local">, in local time. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fromLocalInput = (value: string) => new Date(value).toISOString();

const formatDayRange = (event: CalendarEvent) => {
  const start = new Date(event.startDate);
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
  if (!event.endDate) return start.toLocaleDateString('en-US', opts);
  const end = new Date(event.endDate);
  if (dayKey(start) === dayKey(end)) return start.toLocaleDateString('en-US', opts);
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
};

const formatTimeRange = (event: CalendarEvent) => {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const start = new Date(event.startDate).toLocaleTimeString('en-US', opts);
  if (!event.endDate) return start;
  return `${start} – ${new Date(event.endDate).toLocaleTimeString('en-US', opts)}`;
};

/** Every local day an event touches, so multi-day events render on each cell. */
const eventDayKeys = (event: CalendarEvent): string[] => {
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : start;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const keys: string[] = [];
  // Bounded so a bad end_date can't spin the render.
  while (cursor <= last && keys.length < 366) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
};

/** Leading blanks + day cells for a month grid. */
const monthGrid = (year: number, month: number): (Date | null)[] => {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
};

// ── Event form modal ──────────────────────────────────────────────────────────

type EventFormProps = {
  /** Prefilled start date when created by clicking an empty calendar day. */
  initialDate?: Date;
  event?: CalendarEvent;
  onClose: () => void;
  onSaved: () => void;
};

const EventFormModal = ({ initialDate, event, onClose, onSaved }: EventFormProps) => {
  const isEdit = !!event;

  const defaultStart = () => {
    if (event) return toLocalInput(event.startDate);
    const d = initialDate ?? new Date();
    return `${dayKey(d)}T09:00`;
  };
  const defaultEnd = () => {
    if (event?.endDate) return toLocalInput(event.endDate);
    if (event) return '';
    const d = initialDate ?? new Date();
    return `${dayKey(d)}T17:00`;
  };

  const [title, setTitle] = useState(event?.title ?? '');
  const [category, setCategory] = useState<string>(event?.category ?? '');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [speaker, setSpeaker] = useState(event?.speaker ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [objectives, setObjectives] = useState((event?.objectives ?? []).join('\n'));
  const [status, setStatus] = useState<CalendarEventStatus>(event?.status ?? 'Scheduled');
  const [capacity, setCapacity] = useState(event?.capacity ? String(event.capacity) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (endDate && new Date(endDate) < new Date(startDate)) {
      setError('End date cannot be before the start date.');
      return;
    }
    setSaving(true);
    setError(null);

    const input: CalendarEventInput = {
      title: title.trim(),
      category: category as TrainingCategory,
      startDate: fromLocalInput(startDate),
      endDate: endDate ? fromLocalInput(endDate) : null,
      speaker: speaker.trim(),
      location: location.trim(),
      objectives: objectives.split('\n'),
      status,
      capacity: Number(capacity) || 0,
    };

    const result = isEdit
      ? await updateCalendarEvent(event.id, input)
      : await createCalendarEvent(input);

    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not save the training.');
      return;
    }
    onSaved();
    onClose();
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Training' : 'New Training'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className={labelClass}>Title / Topic</label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ethical Conduct in Public Service" className={inputClass} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Category</label>
              <select required value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                <option value="" disabled>Select category</option>
                {TRAINING_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as CalendarEventStatus)} className={inputClass}>
                {EVENT_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Starts</label>
              <input type="datetime-local" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Ends</label>
              <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
              <p className="mt-1 text-xs text-gray-400">Leave blank for a single-day training. Span days for a multi-day one.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Speaker / Facilitator</label>
              <input type="text" value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="e.g. Dr. Maria Santos" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Location</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Main Conference Room" className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Capacity</label>
            <input type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 30" className={`${inputClass} sm:w-1/2`} />
          </div>

          <div>
            <label className={labelClass}>Objectives</label>
            <textarea
              rows={4}
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              placeholder={'One goal per line, e.g.\nExplain the Code of Conduct\nApply it to three case studies'}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">One goal per line. Blank lines are ignored.</p>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Training'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Event detail panel ────────────────────────────────────────────────────────

type DetailProps = {
  event: CalendarEvent;
  recommendedCount: number;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
  onViewRecommended: () => void;
};

const EventDetailPanel = ({ event, recommendedCount, onClose, onEdit, onChanged, onViewRecommended }: DetailProps) => {
  const [busyEnrollmentId, setBusyEnrollmentId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const color = categoryColor(event.category);

  const handleAttendance = async (enrollmentId: string, next: AttendanceStatus | null) => {
    setBusyEnrollmentId(enrollmentId);
    const result = await setAttendance(enrollmentId, next);
    setBusyEnrollmentId(null);
    if (!result.ok) {
      alert(`Could not update attendance: ${result.error}`);
      return;
    }
    onChanged();
  };

  const handleCancelTraining = async () => {
    if (!window.confirm(`Cancel "${event.title}"? The training and its roster are kept, but it will show as Cancelled.`)) return;
    setCancelling(true);
    const result = await cancelCalendarEvent(event.id);
    setCancelling(false);
    if (!result.ok) {
      alert(`Could not cancel the training: ${result.error}`);
      return;
    }
    onChanged();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ backgroundColor: `${color}1a`, color }}
                >
                  {event.category ?? 'Uncategorized'}
                </span>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[event.status]}`}>
                  {event.status}
                </span>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{event.title}</h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              {event.status !== 'Cancelled' && (
                <button type="button" onClick={handleCancelTraining} disabled={cancelling} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 transition">
                  {cancelling ? 'Cancelling…' : 'Cancel training'}
                </button>
              )}
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Logistics — kept visually distinct from Objectives so L&D can scan
              "what is this training for" without wading through time/place. */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Logistics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-start gap-2.5 text-sm text-gray-700">
                <CalendarDays className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <span>{formatDayRange(event)}</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-gray-700">
                <Clock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <span>{formatTimeRange(event)}</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-gray-700">
                <User className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <span>{event.speaker || 'Speaker to be announced'}</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-gray-700">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <span>{event.location || 'Location to be announced'}</span>
              </div>
            </div>
          </section>

          {/* Objectives — the "what is this for" section. */}
          <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              <Target className="h-3.5 w-3.5" /> Objectives
            </h3>
            {event.objectives.length === 0 ? (
              <p className="text-sm text-gray-400">No objectives recorded for this training yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {event.objectives.map((objective, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-800">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span>{objective}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* IPCR-driven recommendations — the admin counterpart to the roster.
              Only shown for competency-tagged, still-active courses. */}
          {event.competency && event.status !== 'Cancelled' && event.status !== 'Completed' && (
            <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                    <Sparkles className="h-3.5 w-3.5" /> IPCR Recommendations
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    {recommendedCount > 0
                      ? `${recommendedCount} employee${recommendedCount === 1 ? '' : 's'} recommended for `
                      : 'No pending recommendations for '}
                    <span className="font-medium text-gray-800">{event.competency}</span>
                    {recommendedCount > 0 ? ', based on finalized IPCR competency gaps.' : '.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onViewRecommended}
                  className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition"
                >
                  View Recommended{recommendedCount > 0 ? ` (${recommendedCount})` : ''}
                </button>
              </div>
            </section>
          )}

          {/* Roster — read-only membership, editable attendance. */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Attendees {event.attendees.length > 0 && `(${event.attendees.length}${event.capacity ? ` / ${event.capacity}` : ''})`}
              </h3>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                <Lock className="h-3 w-3" /> Managed in Seminar Enrollment
              </span>
            </div>

            {!event.rosterFinalizedAt ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
                <p className="text-sm font-medium text-gray-600">Roster not finalized yet</p>
                <p className="mt-1 text-xs text-gray-400">
                  Attendees appear here once this training's roster is finalized in Seminar Enrollment.
                </p>
              </div>
            ) : event.attendees.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
                <p className="text-sm font-medium text-gray-600">No attendees enrolled</p>
                <p className="mt-1 text-xs text-gray-400">The roster was finalized with no employees enrolled.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Employee</th>
                      <th className="px-4 py-2.5 font-semibold">Department</th>
                      <th className="px-4 py-2.5 font-semibold">Enrollment</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {event.attendees.map((attendee) => (
                      <tr key={attendee.enrollmentId} className="hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{attendee.name}</p>
                          <p className="text-xs text-gray-500">{attendee.position}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{attendee.department}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            attendee.enrollmentStatus === 'Confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {attendee.enrollmentStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {ATTENDANCE_OPTIONS.map((option) => {
                              const active = attendee.attendanceStatus === option;
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  disabled={busyEnrollmentId === attendee.enrollmentId}
                                  // Clicking the active option clears it back to unmarked.
                                  onClick={() => handleAttendance(attendee.enrollmentId, active ? null : option)}
                                  className={[
                                    'rounded-md px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50',
                                    active ? ATTENDANCE_BADGE[option] : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                                  ].join(' ')}
                                >
                                  {option}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

export const TrainingCalendar = () => {
  const currentYear = new Date().getFullYear();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth());
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [viewRecommendedId, setViewRecommendedId] = useState<string | null>(null);
  const [recommendedCounts, setRecommendedCounts] = useState<Map<string, number>>(new Map());
  const [regenerating, setRegenerating] = useState(false);
  const [formState, setFormState] = useState<{ event?: CalendarEvent; initialDate?: Date } | null>(null);

  const refresh = useCallback(async () => {
    const data = await listCalendarEvents(currentYear);
    setEvents(data);
    setLoading(false);
    // Recommendation counts feed the "N recommended" badge in the detail panel.
    setRecommendedCounts(await countRecommendedByCourse(data.map((e) => e.id)));
  }, [currentYear]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    const result = await generateRecommendations();
    setRegenerating(false);
    if (!result.ok) {
      alert(`Could not regenerate recommendations: ${result.error}`);
      return;
    }
    await refresh();
    alert(
      `Recommendations updated — ${result.upserted ?? 0} match(es) across ${result.employeesConsidered ?? 0} employee(s) with finalized-IPCR development gaps.`,
    );
  };

  // Read the selected event out of `events` rather than snapshotting it, so a
  // roster change upstream is reflected in the open panel instead of going stale.
  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      for (const key of eventDayKeys(event)) {
        const list = map.get(key);
        if (list) list.push(event);
        else map.set(key, [event]);
      }
    }
    return map;
  }, [events]);

  const cells = useMemo(() => monthGrid(currentYear, month), [currentYear, month]);
  const monthEvents = useMemo(
    () => events.filter((e) => new Date(e.startDate).getMonth() === month),
    [events, month]
  );

  const monthName = new Date(currentYear, month).toLocaleString('en-US', { month: 'long' });
  const todayKey = dayKey(new Date());

  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* Header */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">
            <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Training Calendar
          </p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Training Calendar {currentYear}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Trainings scheduled or running this year. Click any empty date to add one.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === 'calendar' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Calendar
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === 'list' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <Rows3 className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            title="Recompute training recommendations from the latest finalized IPCR data"
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60 transition"
          >
            <Sparkles className="h-4 w-4" /> {regenerating ? 'Regenerating…' : 'Regenerate recommendations'}
          </button>
          <button
            type="button"
            onClick={() => setFormState({})}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm"
          >
            <Plus className="h-4 w-4" /> New Training
          </button>
        </div>
      </section>

      {/* Category legend — same four colors as the dashboard. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {TRAINING_CATEGORIES.map((cat) => (
          <div key={cat} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: categoryColor(cat) }} />
            {cat}
          </div>
        ))}
      </div>

      {view === 'calendar' ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 relative">
          {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 rounded-2xl" />}

          {/* Month nav — bounded to the current year, since Page 3 is this year only. */}
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth((m) => Math.max(0, m - 1))}
              disabled={month === 0}
              className="rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900">{monthName} {currentYear}</h2>
            <button
              type="button"
              onClick={() => setMonth((m) => Math.min(11, m + 1))}
              disabled={month === 11}
              className="rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden border border-gray-200">
            {WEEKDAYS.map((day) => (
              <div key={day} className="bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-gray-500">
                {day}
              </div>
            ))}

            {cells.map((date, i) => {
              if (!date) return <div key={`blank-${i}`} className="bg-gray-50/50 min-h-[110px]" />;
              const key = dayKey(date);
              const dayEvents = eventsByDay.get(key) ?? [];
              const isToday = key === todayKey;

              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setFormState({ initialDate: date })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setFormState({ initialDate: date });
                    }
                  }}
                  className="bg-white min-h-[110px] p-1.5 text-left align-top hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 transition cursor-pointer"
                >
                  <span className={[
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                    isToday ? 'bg-blue-600 text-white' : 'text-gray-600',
                  ].join(' ')}>
                    {date.getDate()}
                  </span>

                  <div className="mt-1 space-y-1">
                    {dayEvents.map((event) => {
                      const color = categoryColor(event.category);
                      const cancelled = event.status === 'Cancelled';
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEventId(event.id);
                          }}
                          title={`${event.title} — ${event.category ?? 'Uncategorized'}`}
                          className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-medium transition hover:brightness-95"
                          style={{
                            backgroundColor: `${color}1f`,
                            color,
                            textDecoration: cancelled ? 'line-through' : undefined,
                            opacity: cancelled ? 0.6 : 1,
                          }}
                        >
                          {event.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && monthEvents.length === 0 && (
            <p className="mt-4 text-center text-xs text-gray-400">
              No trainings starting in {monthName}. Click a date to schedule one.
            </p>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 relative">
          {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 rounded-2xl" />}
          {!loading && events.length === 0 ? (
            <EmptyState title="No trainings this year" description={`No trainings have been scheduled for ${currentYear} yet.`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Training</th>
                    <th className="px-4 py-3 font-semibold">Schedule</th>
                    <th className="px-4 py-3 font-semibold">Speaker</th>
                    <th className="px-4 py-3 font-semibold">Location</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Attendees</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {events.map((event) => {
                    const color = categoryColor(event.category);
                    return (
                      <tr
                        key={event.id}
                        onClick={() => setSelectedEventId(event.id)}
                        className="cursor-pointer hover:bg-gray-50 transition"
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{event.title}</p>
                          <span className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${color}1a`, color }}>
                            {event.category ?? 'Uncategorized'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          <p>{formatDayRange(event)}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{formatTimeRange(event)}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{event.speaker || '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{event.location || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[event.status]}`}>
                            {event.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {event.rosterFinalizedAt ? (
                            <>
                              <span className="font-medium text-blue-600">{event.attendees.length}</span>
                              {event.capacity > 0 && <span className="text-gray-400 text-xs ml-1">/ {event.capacity}</span>}
                            </>
                          ) : (
                            <span className="text-xs text-gray-400">Not finalized</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          recommendedCount={recommendedCounts.get(selectedEvent.id) ?? 0}
          onClose={() => setSelectedEventId(null)}
          onEdit={() => setFormState({ event: selectedEvent })}
          onChanged={() => void refresh()}
          onViewRecommended={() => setViewRecommendedId(selectedEvent.id)}
        />
      )}

      {viewRecommendedId && selectedEvent && (
        <RecommendedEmployees
          sessionId={viewRecommendedId}
          courseTitle={selectedEvent.title}
          onChanged={() => void refresh()}
          onClose={() => setViewRecommendedId(null)}
        />
      )}

      {formState && (
        <EventFormModal
          event={formState.event}
          initialDate={formState.initialDate}
          onClose={() => setFormState(null)}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  );
};
