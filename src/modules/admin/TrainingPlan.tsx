import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Lightbulb,
  Lock,
  LockOpen,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { getDepartmentIdOptions, type DepartmentOption } from '../../lib/api/departments';
import { getOfficeDeptHead } from '../../lib/api/officeRoles';
import type { PhaseMode } from '../../lib/api/phaseSchedules';
import {
  createPlanEntry,
  deletePlanEntry,
  dismissRecommendation,
  getPlanPublication,
  getPlanningWindow,
  listPlanEntries,
  listRecommendations,
  promotePlanEntry,
  publishTrainingPlan,
  reschedulePlanEntry,
  rolloverTrainingPlan,
  setPlanningWindow,
  unpublishTrainingPlan,
  updatePlanEntry,
  PLAN_STATUSES,
  type PlanEntry,
  type PlanEntryInput,
  type PlanPublication,
  type PlanStatus,
  type PlanningWindow,
  type Recommendation,
  type RecommendedFrom,
} from '../../lib/api/trainingPlan';
import { NoDeptHeadNotice } from './components/NoDeptHeadNotice';
import { TRAINING_CATEGORIES, categoryColor, type TrainingCategory } from './trainingCategories';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PLAN_STATUS_BADGE: Record<PlanStatus, string> = {
  'Proposed': 'bg-slate-100 text-slate-700',
  'Approved': 'bg-blue-100 text-blue-700',
  'Needs Budget': 'bg-amber-100 text-amber-700',
  'Confirmed': 'bg-emerald-100 text-emerald-700',
};

const SOURCE_BADGE: Record<RecommendedFrom, string> = {
  'Training Request': 'bg-violet-100 text-violet-700',
  'Rating Suggestion': 'bg-cyan-100 text-cyan-700',
  'LND Planning': 'bg-gray-100 text-gray-600',
};

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5';

// ── Date helpers (local-time grid over UTC timestamps) ───────────────────────

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const entryDayKeys = (entry: PlanEntry): string[] => {
  const start = new Date(entry.startDate);
  const end = entry.endDate ? new Date(entry.endDate) : start;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const keys: string[] = [];
  while (cursor <= last && keys.length < 366) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
};

// ── Window state ─────────────────────────────────────────────────────────────

/**
 * Resolve the window into what the banner actually needs to say. `isOpen` alone
 * cannot distinguish "never configured" from "configured and since passed",
 * which are the same lock but very different admin next-steps.
 */
type WindowState =
  | { kind: 'unset' }
  | { kind: 'open'; until: string | null }
  | { kind: 'pending'; opensOn: string }
  | { kind: 'closed'; closedOn: string | null };

const windowState = (win: PlanningWindow): WindowState => {
  if (win.isOpen) return { kind: 'open', until: win.deadlineDate };
  if (win.schedule?.mode === 'Closed') return { kind: 'closed', closedOn: win.deadlineDate };
  if (!win.schedule || !win.startDate || !win.deadlineDate) return { kind: 'unset' };
  // Auto with both dates set, but resolved Closed: either not yet started or over.
  const today = new Date().toISOString().slice(0, 10);
  if (today < win.startDate) return { kind: 'pending', opensOn: win.startDate };
  return { kind: 'closed', closedOn: win.deadlineDate };
};

const monthGrid = (year: number, month: number): (Date | null)[] => {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
};

// ── Planning window control ───────────────────────────────────────────────────

const WindowSettingsModal = ({
  window: win,
  onClose,
  onSaved,
}: {
  window: PlanningWindow;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [mode, setMode] = useState<PhaseMode>(win.schedule?.mode ?? 'Auto');
  const [startDate, setStartDate] = useState(win.startDate ?? '');
  const [deadlineDate, setDeadlineDate] = useState(win.deadlineDate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'Auto' && (!startDate || !deadlineDate)) {
      setError('Auto mode needs both a start and an end date, otherwise the window stays closed.');
      return;
    }
    if (startDate && deadlineDate && deadlineDate < startDate) {
      setError('The end date cannot be before the start date.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await setPlanningWindow({
      mode,
      startDate: startDate || null,
      deadlineDate: deadlineDate || null,
      updatedBy: 'L&D Admin',
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not save the planning window.');
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <form onSubmit={submit} className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Planning window</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Page 4 accepts edits only while this window is open.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div>
          <label className={labelClass}>Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as PhaseMode)} className={inputClass}>
            <option value="Auto">Auto — open only between the dates below</option>
            <option value="Open">Open — always editable</option>
            <option value="Closed">Closed — always locked</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Opens</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Closes</label>
            <input type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} className={inputClass} />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Dates are inclusive. Shift them each year rather than changing code.
        </p>

        {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy ? 'Saving…' : 'Save window'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ── Entry form ────────────────────────────────────────────────────────────────

type Prefill = {
  initialDate?: Date;
  recommendation?: Recommendation;
};

const EntryFormModal = ({
  planYear,
  entry,
  prefill,
  departments,
  onClose,
  onSaved,
}: {
  planYear: number;
  entry?: PlanEntry;
  prefill?: Prefill;
  departments: DepartmentOption[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const isEdit = !!entry;
  const rec = prefill?.recommendation;

  const defaultStart = () => {
    if (entry) return toLocalInput(entry.startDate);
    const d = prefill?.initialDate ?? new Date(planYear, 0, 15);
    return `${dayKey(d)}T09:00`;
  };

  const [title, setTitle] = useState(entry?.title ?? rec?.title ?? '');
  const [category, setCategory] = useState(entry?.category ?? rec?.category ?? '');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(toLocalInput(entry?.endDate ?? null));
  const [speaker, setSpeaker] = useState(entry?.speaker ?? '');
  const [location, setLocation] = useState(entry?.location ?? '');
  const [capacity, setCapacity] = useState(entry?.capacity ? String(entry.capacity) : '');
  const [departmentId, setDepartmentId] = useState(entry?.departmentId ?? '');
  const [planStatus, setPlanStatus] = useState<PlanStatus>(entry?.planStatus ?? 'Proposed');
  const [objectives, setObjectives] = useState((entry?.objectives ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Provenance is set once, at creation, and never editable afterwards.
  const recommendedFrom: RecommendedFrom = entry?.recommendedFrom ?? (rec ? 'Training Request' : 'LND Planning');
  const sourceRequestId = entry?.sourceRequestId ?? rec?.requestId ?? null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (endDate && new Date(endDate) < new Date(startDate)) {
      setError('End date cannot be before the start date.');
      return;
    }
    setBusy(true);
    setError(null);

    const input: PlanEntryInput = {
      planYear,
      title: title.trim(),
      category: category as TrainingCategory,
      startDate: new Date(startDate).toISOString(),
      endDate: endDate ? new Date(endDate).toISOString() : null,
      speaker: speaker.trim(),
      location: location.trim(),
      objectives: objectives.split('\n'),
      capacity: Number(capacity) || 0,
      departmentId: departmentId || null,
      planStatus,
      recommendedFrom,
      sourceRequestId,
    };

    const result = isEdit ? await updatePlanEntry(entry.id, input) : await createPlanEntry(input, 'L&D Admin');
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not save the planned training.');
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Edit Planned Training' : 'New Planned Training'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          {rec && (
            <div className="flex items-start gap-2.5 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
              <p className="text-sm text-violet-900">
                Pre-filled from <span className="font-semibold">{rec.employeeName}</span>'s training request.
                {rec.competency ? ` Competency: ${rec.competency}.` : ''}
              </p>
            </div>
          )}

          <div>
            <label className={labelClass}>Title / Topic</label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Category</label>
              <select required value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                <option value="" disabled>Select category</option>
                {TRAINING_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select value={planStatus} onChange={(e) => setPlanStatus(e.target.value as PlanStatus)} className={inputClass}>
                {PLAN_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Tentative start</label>
              <input type="datetime-local" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Tentative end</label>
              <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Speaker / Facilitator</label>
              <input type="text" value={speaker} onChange={(e) => setSpeaker(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Location</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Department</label>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputClass}>
                <option value="">Not decided yet</option>
                {departments.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
              </select>
              <p className="mt-1 text-xs text-gray-400">Required before this entry can be promoted.</p>
            </div>
            <div>
              <label className={labelClass}>Capacity</label>
              <input type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Objectives</label>
            <textarea rows={3} value={objectives} onChange={(e) => setObjectives(e.target.value)} placeholder="One goal per line" className={inputClass} />
          </div>

          {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Add to Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Entry detail ──────────────────────────────────────────────────────────────

const EntryDetail = ({
  entry,
  editable,
  onClose,
  onEdit,
  onChanged,
}: {
  entry: PlanEntry;
  editable: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deptHead, setDeptHead] = useState<{ employeeName: string | null } | null>(null);
  const [headChecked, setHeadChecked] = useState(false);
  const color = categoryColor(entry.category);

  // Promotion creates a Training Courses draft, which a Dept Head must review.
  // If the office has none, say so here rather than failing at the click.
  useEffect(() => {
    let cancelled = false;
    if (!entry.departmentId) {
      setHeadChecked(true);
      return;
    }
    void getOfficeDeptHead(entry.departmentId).then((h) => {
      if (cancelled) return;
      setDeptHead(h);
      setHeadChecked(true);
    });
    return () => { cancelled = true; };
  }, [entry.departmentId]);

  const currentYear = new Date().getFullYear();
  const yearArrived = entry.planYear <= currentYear;
  const canPromote =
    editable && entry.planStatus === 'Confirmed' && !entry.promotedDraftId &&
    !!entry.departmentId && !!deptHead && yearArrived;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, thenClose = false) => {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Action failed.');
      return;
    }
    onChanged();
    if (thenClose) onClose();
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete "${entry.title}" from the ${entry.planYear} plan? This cannot be undone.`)) return;
    void run(() => deletePlanEntry(entry.id), true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${color}1a`, color }}>
                  {entry.category}
                </span>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${PLAN_STATUS_BADGE[entry.planStatus]}`}>
                  {entry.planStatus}
                </span>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${SOURCE_BADGE[entry.recommendedFrom]}`}>
                  From: {entry.recommendedFrom}
                </span>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{entry.title}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {formatDate(entry.startDate)}
                {entry.endDate ? ` – ${formatDate(entry.endDate)}` : ''}
                {entry.location ? ` · ${entry.location}` : ''}
                {entry.speaker ? ` · ${entry.speaker}` : ''}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {entry.departmentName ?? 'No department assigned'} · Plan year {entry.planYear}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {editable && !entry.promotedDraftId && (
                <>
                  <button type="button" onClick={onEdit} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    Edit
                  </button>
                  <button type="button" onClick={handleDelete} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </>
              )}
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          {error && <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="px-6 py-5 space-y-5">
          <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Objectives</h3>
            {entry.objectives.length === 0 ? (
              <p className="text-sm text-gray-400">No objectives recorded yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {entry.objectives.map((o, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-800">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {entry.promotedDraftId ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm text-emerald-800">
                Promoted into a Training Courses draft. Recommend its attendees there; once finalized it
                appears on the Training Calendar.
              </p>
            </div>
          ) : (
            <section className="space-y-3">
              {!entry.departmentId && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm text-amber-900">
                    No department assigned. Set one before promoting — a Training Courses draft needs a
                    Dept Head to review it.
                  </p>
                </div>
              )}

              {entry.departmentId && headChecked && !deptHead && (
                <NoDeptHeadNotice
                  departmentName={entry.departmentName}
                  context="This entry cannot be promoted: the Training Courses draft it would create would have nobody to review it."
                />
              )}

              {entry.planStatus === 'Confirmed' && !yearArrived && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm text-slate-600">
                    Confirmed. It rolls into the Training Calendar once {entry.planYear} begins.
                  </p>
                </div>
              )}

              <button
                type="button"
                disabled={!canPromote || busy}
                onClick={() => void run(() => promotePlanEntry(entry.id, 'L&D Admin'))}
                title={
                  entry.planStatus !== 'Confirmed'
                    ? 'Only a Confirmed entry can be promoted.'
                    : !yearArrived
                      ? `Waiting for ${entry.planYear} to begin.`
                      : undefined
                }
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <ArrowUpRight className="h-4 w-4" />
                {busy ? 'Promoting…' : 'Promote to Training Courses'}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Dismiss modal ─────────────────────────────────────────────────────────────

const DismissModal = ({
  rec,
  onClose,
  onConfirm,
}: {
  rec: Recommendation;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <form onSubmit={submit} className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Dismiss this suggestion</h2>
        <p className="text-sm text-gray-600">
          "{rec.title}" — requested by {rec.employeeName}. The request itself is not rejected; it just
          leaves this feed. You can restore it later.
        </p>
        <div>
          <label className={labelClass}>Reason</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Why is this not being planned?" />
        </div>
        {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60">
            {busy ? 'Dismissing…' : 'Dismiss'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

export const TrainingPlan = () => {
  const currentYear = new Date().getFullYear();
  // Page 4 plans the *next* year. The current year is selectable because a
  // Confirmed entry can only be promoted once its plan year has arrived.
  const [planYear, setPlanYear] = useState(currentYear + 1);
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [win, setWin] = useState<PlanningWindow>({ schedule: null, isOpen: false, startDate: null, deadlineDate: null });
  const [publication, setPublication] = useState<PlanPublication | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(0);

  const [categoryFilter, setCategoryFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | PlanStatus>('All');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, setFormState] = useState<{ entry?: PlanEntry; prefill?: Prefill } | null>(null);
  const [showWindowSettings, setShowWindowSettings] = useState(false);
  const [dismissing, setDismissing] = useState<Recommendation | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [e, r, w, p] = await Promise.all([
      listPlanEntries(planYear),
      listRecommendations(),
      getPlanningWindow(),
      getPlanPublication(planYear),
    ]);
    setEntries(e);
    setRecommendations(r);
    setWin(w);
    setPublication(p);
    setLoading(false);
  }, [planYear]);

  useEffect(() => {
    void refresh();
    void getDepartmentIdOptions().then(setDepartments);
  }, [refresh]);

  // A published plan is frozen regardless of the window: sign-off is the point
  // at which the year stops moving.
  const editable = win.isOpen && !publication;
  const wState = useMemo(() => windowState(win), [win]);
  const lockReason = publication
    ? `The ${planYear} plan is published.`
    : wState.kind === 'unset'
      ? 'No planning window has been set.'
      : 'Planning window closed.';

  // Publish blocks on these; surfacing them here means the admin can fix them
  // before clicking rather than reading a wall of titles out of an exception.
  const blockers = useMemo(() => {
    const unsettled = entries.filter((e) => e.planStatus !== 'Confirmed');
    const noDept = entries.filter((e) => !e.departmentId);
    return { unsettled, noDept, total: unsettled.length + noDept.length };
  }, [entries]);

  const canPublish = !publication && entries.length > 0 && blockers.total === 0;
  const yearArrived = planYear <= currentYear;

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (categoryFilter === 'All' || e.category === categoryFilter) &&
          (departmentFilter === 'All' || e.departmentId === departmentFilter) &&
          (statusFilter === 'All' || e.planStatus === statusFilter)
      ),
    [entries, categoryFilter, departmentFilter, statusFilter]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, PlanEntry[]>();
    for (const entry of filtered) {
      for (const key of entryDayKeys(entry)) {
        const list = map.get(key);
        if (list) list.push(entry);
        else map.set(key, [entry]);
      }
    }
    return map;
  }, [filtered]);

  const selected = useMemo(() => entries.find((e) => e.id === selectedId) ?? null, [entries, selectedId]);
  const cells = useMemo(() => monthGrid(planYear, month), [planYear, month]);
  const monthName = new Date(planYear, month).toLocaleString('en-US', { month: 'long' });

  const [publishing, setPublishing] = useState(false);

  const handlePublish = async () => {
    if (!window.confirm(
      `Publish the ${planYear} plan?\n\n${entries.length} confirmed entries will be frozen and the planning window will close. ` +
      `They roll into Training Courses in January ${planYear}, not now.`
    )) return;
    setPublishing(true);
    const result = await publishTrainingPlan(planYear, 'L&D Admin');
    setPublishing(false);
    if (!result.ok) { setError(result.error ?? 'Could not publish the plan.'); return; }
    await refresh();
  };

  const handleUnpublish = async () => {
    if (!window.confirm(`Reopen the ${planYear} plan for editing? The planning window will reopen.`)) return;
    setPublishing(true);
    const result = await unpublishTrainingPlan(planYear, 'L&D Admin');
    setPublishing(false);
    if (!result.ok) { setError(result.error ?? 'Could not unpublish the plan.'); return; }
    await refresh();
  };

  const handleRollover = async () => {
    if (!window.confirm(
      `Roll the ${planYear} plan into Training Courses?\n\n` +
      `This creates a draft per entry, each needing Dept Head review. Safe to re-run if it stops partway.`
    )) return;
    setPublishing(true);
    const result = await rolloverTrainingPlan(planYear, 'L&D Admin');
    setPublishing(false);
    if (!result.ok) { setError(result.error ?? 'Could not roll the plan over.'); return; }
    await refresh();
  };

  const handleDrop = async (date: Date) => {
    const entry = entries.find((e) => e.id === draggingId);
    setDraggingId(null);
    if (!entry || !editable) return;
    if (dayKey(new Date(entry.startDate)) === dayKey(date)) return;
    const result = await reschedulePlanEntry(entry, date);
    if (!result.ok) {
      setError(result.error ?? 'Could not reschedule.');
      return;
    }
    await refresh();
  };

  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* Header */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">
            <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Training Plan
          </p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Training Plan {planYear}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tentative calendar for next year. Confirmed entries roll into Training Courses once the year begins.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={planYear}
            onChange={(e) => { setPlanYear(Number(e.target.value)); setLoading(true); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            <option value={currentYear}>{currentYear}</option>
            <option value={currentYear + 1}>{currentYear + 1}</option>
          </select>
          <button
            type="button"
            onClick={() => setShowWindowSettings(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Settings2 className="h-3.5 w-3.5" /> Planning window
          </button>
          <button
            type="button"
            disabled={!editable}
            onClick={() => setFormState({})}
            title={editable ? undefined : lockReason}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
          >
            <Plus className="h-4 w-4" /> New Planned Training
          </button>
          {!publication && (
            <button
              type="button"
              disabled={!canPublish || publishing}
              onClick={() => void handlePublish()}
              title={
                entries.length === 0
                  ? 'Add entries before publishing.'
                  : blockers.total > 0
                    ? `${blockers.total} entr${blockers.total === 1 ? 'y' : 'ies'} must be resolved first.`
                    : undefined
              }
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
            >
              <CheckCircle2 className="h-4 w-4" />
              {publishing ? 'Publishing…' : `Publish ${planYear} Plan`}
            </button>
          )}
        </div>
      </section>

      {/* Publish blockers — the same rules publish_training_plan() enforces, shown
          before the click so they can be fixed rather than read out of an error. */}
      {!publication && entries.length > 0 && blockers.total > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              {planYear} plan is not ready to publish
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-amber-800">
              {blockers.unsettled.length > 0 && (
                <li>
                  <span className="font-semibold">{blockers.unsettled.length}</span> not Confirmed —
                  only Confirmed entries roll into Training Courses:{' '}
                  <span className="text-amber-700">
                    {blockers.unsettled.slice(0, 4).map((e) => e.title).join(', ')}
                    {blockers.unsettled.length > 4 ? ` +${blockers.unsettled.length - 4} more` : ''}
                  </span>
                </li>
              )}
              {blockers.noDept.length > 0 && (
                <li>
                  <span className="font-semibold">{blockers.noDept.length}</span> with no department —
                  a draft needs a Dept Head to review it:{' '}
                  <span className="text-amber-700">
                    {blockers.noDept.slice(0, 4).map((e) => e.title).join(', ')}
                    {blockers.noDept.length > 4 ? ` +${blockers.noDept.length - 4} more` : ''}
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Window banner */}
      {publication ? (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-indigo-900">
              {planYear} plan published — {publication.entryCount} entries locked.
            </p>
            <p className="mt-0.5 text-sm text-indigo-700">
              {publication.rolledOverAt
                ? `Rolled into Training Courses on ${formatDate(publication.rolledOverAt)} — ${publication.draftCount} drafts created. See them on the Training Calendar.`
                : yearArrived
                  ? 'Ready to roll into Training Courses. Each entry becomes a draft for its Dept Head to review.'
                  : `Rolls into Training Courses in January ${planYear}. Nothing moves before then.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!publication.rolledOverAt && yearArrived && (
              <button type="button" onClick={() => void handleRollover()} disabled={publishing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                <ArrowUpRight className="h-3.5 w-3.5" />
                {publishing ? 'Rolling over…' : 'Roll into Training Courses'}
              </button>
            )}
            {!publication.rolledOverAt && (
              <button type="button" onClick={() => void handleUnpublish()} disabled={publishing}
                title="Reopens the plan for editing. Only possible before rollover."
                className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60">
                Unpublish
              </button>
            )}
          </div>
        </div>
      ) : wState.kind === 'open' ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <LockOpen className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              {wState.until
                ? `Planning window open — editable through ${formatDate(wState.until)}.`
                : `Planning window open — stays open until the full ${planYear} plan is set and published.`}
            </p>
            <p className="mt-0.5 text-sm text-emerald-700">
              Add entries from the calendar or the New Planned Training button.
              {!wState.until && ' Close it under Planning window once the plan is published.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {wState.kind === 'unset'
                ? 'No planning window set — this page is view-only'
                : wState.kind === 'pending'
                  ? `Planning window not open yet — opens ${formatDate(wState.opensOn)}`
                  : wState.closedOn
                    ? `Planning window closed — closed on ${formatDate(wState.closedOn)}`
                    : 'Planning window closed — this page is view-only'}
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              {wState.kind === 'unset'
                ? 'No planning dates have been set yet. Set them under Planning window.'
                : wState.kind === 'pending'
                  ? 'The page unlocks on its own once that date arrives.'
                  : 'Reopen it under Planning window to make changes.'}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filters + legend */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={`${inputClass} w-56`}>
          <option value="All">All categories</option>
          {TRAINING_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className={`${inputClass} w-56`}>
          <option value="All">All departments</option>
          {departments.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'All' | PlanStatus)} className={`${inputClass} w-48`}>
          <option value="All">All statuses</option>
          {PLAN_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
        <span className="text-xs text-gray-400">{filtered.length} of {entries.length} shown</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Calendar */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 relative">
          {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 rounded-2xl" />}

          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={() => setMonth((m) => Math.max(0, m - 1))} disabled={month === 0}
              className="rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900">{monthName} {planYear}</h2>
            <button type="button" onClick={() => setMonth((m) => Math.min(11, m + 1))} disabled={month === 11}
              className="rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl overflow-hidden border border-gray-200">
            {WEEKDAYS.map((d) => (
              <div key={d} className="bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-gray-500">{d}</div>
            ))}

            {cells.map((date, i) => {
              if (!date) return <div key={`b-${i}`} className="bg-gray-50/50 min-h-[104px]" />;
              const key = dayKey(date);
              const dayEntries = byDay.get(key) ?? [];

              return (
                <div
                  key={key}
                  onClick={() => editable && setFormState({ prefill: { initialDate: date } })}
                  onDragOver={(e) => { if (editable && draggingId) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); void handleDrop(date); }}
                  className={`bg-white min-h-[104px] p-1.5 transition ${editable ? 'cursor-pointer hover:bg-blue-50/40' : ''}`}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-gray-600">
                    {date.getDate()}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayEntries.map((entry) => {
                      // Two-tone by commitment, not category: Confirmed is the only
                      // status that will actually roll into Training Courses, so the
                      // calendar reads as "settled vs still moving" at a glance.
                      const confirmed = entry.planStatus === 'Confirmed';
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          draggable={editable && !entry.promotedDraftId}
                          onDragStart={() => setDraggingId(entry.id)}
                          onDragEnd={() => setDraggingId(null)}
                          onClick={(e) => { e.stopPropagation(); setSelectedId(entry.id); }}
                          title={`${entry.title} — ${entry.planStatus}`}
                          className={`block w-full truncate rounded border px-1.5 py-1 text-left text-[11px] font-medium transition hover:brightness-95 ${
                            confirmed
                              ? 'border-blue-500 bg-blue-100 text-blue-800'
                              : 'border-dashed border-gray-400 bg-gray-100 text-gray-600'
                          }`}
                          style={{ opacity: draggingId === entry.id ? 0.4 : 1 }}
                        >
                          {entry.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded border border-dashed border-gray-400 bg-gray-100" /> Draft (tentative)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded border border-blue-500 bg-blue-100" /> Confirmed
            </span>
            {editable && <span>Drag a chip to another day to reschedule.</span>}
          </p>
        </section>

        {/* Recommendation feed */}
        <aside className="rounded-2xl border border-gray-200 bg-white p-5 h-fit">
          <div className="mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-800">Suggestions</h2>
            <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
              {recommendations.length}
            </span>
          </div>
          <p className="mb-4 text-xs text-gray-400">
            Pending training requests not yet on the plan.
          </p>

          {recommendations.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nothing to action"
              description="Every pending training request has been planned or dismissed."
            />
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto">
              {recommendations.map((rec) => {
                const color = categoryColor(rec.category);
                return (
                  <div key={rec.requestId} className="rounded-xl border border-gray-200 p-3">
                    <p className="text-sm font-semibold text-gray-900">{rec.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {rec.employeeName}{rec.department ? ` · ${rec.department}` : ''}
                    </p>
                    {rec.category && (
                      <span className="mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${color}1a`, color }}>
                        {rec.category}
                      </span>
                    )}
                    {rec.justification && (
                      <p className="mt-2 line-clamp-3 text-xs text-gray-600">{rec.justification}</p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => setFormState({ prefill: { recommendation: rec } })}
                        title={editable ? undefined : `${lockReason} Accepting creates a plan entry.`}
                        className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Accept
                      </button>
                      {/* Dismiss is queue triage — it writes nothing to the plan, so it
                          stays available year-round even while the window is closed. */}
                      <button
                        type="button"
                        onClick={() => setDismissing(rec)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {selected && (
        <EntryDetail
          entry={selected}
          editable={editable}
          onClose={() => setSelectedId(null)}
          onEdit={() => setFormState({ entry: selected })}
          onChanged={() => void refresh()}
        />
      )}

      {formState && (
        <EntryFormModal
          planYear={planYear}
          entry={formState.entry}
          prefill={formState.prefill}
          departments={departments}
          onClose={() => setFormState(null)}
          onSaved={() => void refresh()}
        />
      )}

      {showWindowSettings && (
        <WindowSettingsModal window={win} onClose={() => setShowWindowSettings(false)} onSaved={() => void refresh()} />
      )}

      {dismissing && (
        <DismissModal
          rec={dismissing}
          onClose={() => setDismissing(null)}
          onConfirm={async (reason) => {
            const result = await dismissRecommendation(dismissing.requestId, 'L&D Admin', reason);
            if (!result.ok) throw new Error(result.error ?? 'Could not dismiss.');
            await refresh();
          }}
        />
      )}
    </div>
  );
};
