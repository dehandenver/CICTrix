import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Filter,
  History,
  Plus,
  Send,
  Undo2,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { getDepartmentIdOptions, type DepartmentOption } from '../../lib/api/departments';
import { listEmployeeOptions, type EmployeeOption } from '../../lib/api/officeRoles';
import {
  addDraftMember,
  createCourseDraft,
  finalizeCourseDraft,
  listCourseDrafts,
  listDraftAuditTrail,
  removeDraftMember,
  returnDraftToLnd,
  sendDraftToDeptHead,
  updateCourseDraft,
  type ActorRole,
  type CourseDraft,
  type CourseDraftInput,
  type DraftAuditEvent,
  type DraftStatus,
} from '../../lib/api/trainingPipeline';
import { ActorRoleSwitch } from './components/ActorRoleSwitch';
import { TRAINING_CATEGORIES, categoryColor, type TrainingCategory } from './trainingCategories';

const DRAFT_STATUSES: DraftStatus[] = ['Draft', 'Sent to Dept Head', 'Returned', 'Finalized'];

const STATUS_BADGE: Record<DraftStatus, string> = {
  'Draft': 'bg-gray-100 text-gray-700',
  'Sent to Dept Head': 'bg-blue-100 text-blue-700',
  'Returned': 'bg-amber-100 text-amber-700',
  'Finalized': 'bg-emerald-100 text-emerald-700',
};

const ACTOR_LABEL: Record<ActorRole, string> = { LND: 'L&D', DeptHead: 'Dept Head' };

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5';

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

// ── Draft form modal ──────────────────────────────────────────────────────────

const DraftFormModal = ({
  draft,
  departments,
  actorName,
  onClose,
  onSaved,
}: {
  draft?: CourseDraft;
  departments: DepartmentOption[];
  actorName: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const isEdit = !!draft;
  const [title, setTitle] = useState(draft?.title ?? '');
  const [category, setCategory] = useState(draft?.category ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [objectives, setObjectives] = useState((draft?.objectives ?? []).join('\n'));
  const [instructorName, setInstructorName] = useState(draft?.instructorName ?? '');
  const [instructorTitle, setInstructorTitle] = useState(draft?.instructorTitle ?? '');
  const [startDate, setStartDate] = useState(toLocalInput(draft?.startDate ?? null));
  const [endDate, setEndDate] = useState(toLocalInput(draft?.endDate ?? null));
  const [location, setLocation] = useState(draft?.location ?? '');
  const [capacity, setCapacity] = useState(draft?.capacity ? String(draft.capacity) : '');
  const [targetDepartmentId, setTargetDepartmentId] = useState(draft?.targetDepartmentId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (endDate && startDate && new Date(endDate) < new Date(startDate)) {
      setError('End date cannot be before the start date.');
      return;
    }
    setSaving(true);
    setError(null);

    const input: CourseDraftInput = {
      title: title.trim(),
      category: category as TrainingCategory,
      description: description.trim(),
      objectives: objectives.split('\n'),
      instructorName: instructorName.trim(),
      instructorTitle: instructorTitle.trim(),
      startDate: startDate ? new Date(startDate).toISOString() : null,
      endDate: endDate ? new Date(endDate).toISOString() : null,
      location: location.trim(),
      capacity: Number(capacity) || 0,
      targetDepartmentId,
    };

    const result = isEdit
      ? await updateCourseDraft(draft.id, input)
      : await createCourseDraft(input, actorName);

    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not save the draft.');
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Draft' : 'New Training Draft'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className={labelClass}>Training Title</label>
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
              <label className={labelClass}>Send to Department</label>
              <select required value={targetDepartmentId} onChange={(e) => setTargetDepartmentId(e.target.value)} className={inputClass}>
                <option value="" disabled>Select department</option>
                {departments.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Speaker / Facilitator</label>
              <input type="text" value={instructorName} onChange={(e) => setInstructorName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Speaker Title</label>
              <input type="text" value={instructorTitle} onChange={(e) => setInstructorTitle(e.target.value)} className={inputClass} />
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
              <p className="mt-1 text-xs text-gray-400">Leave blank for a single-day training.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Venue</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Total Slots</label>
              <input type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Learning Objectives</label>
            <textarea
              rows={3}
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              placeholder={'One goal per line'}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">One goal per line. Carried onto the calendar event on finalize.</p>
          </div>

          {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Reason-gated add / remove modal ───────────────────────────────────────────

const ReasonModal = ({
  mode,
  employees,
  employeeName,
  onClose,
  onConfirm,
}: {
  mode: 'add' | 'remove';
  /** Only for 'add' — the pool to choose from. */
  employees?: EmployeeOption[];
  /** Only for 'remove' — who is being removed. */
  employeeName?: string;
  onClose: () => void;
  onConfirm: (employeeId: string, reason: string) => Promise<void>;
}) => {
  const [employeeId, setEmployeeId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdd = mode === 'add';
  const canSubmit = reason.trim().length > 0 && (!isAdd || !!employeeId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(employeeId, reason.trim());
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
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">
            {isAdd ? 'Add Employee to Recommendation' : `Remove ${employeeName}`}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isAdd && (
            <div>
              <label className={labelClass}>Employee</label>
              <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass}>
                <option value="" disabled>Select employee</option>
                {(employees ?? []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} — {emp.department ?? '—'}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelClass}>
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isAdd ? 'Why is this employee recommended for this training?' : 'Why is this employee being removed?'}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">
              Recorded permanently against this draft. Every add and removal needs one.
            </p>
          </div>

          {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || busy}
              className={`rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 ${
                isAdd ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {busy ? 'Saving…' : isAdd ? 'Add with Reason' : 'Remove with Reason'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Draft detail ──────────────────────────────────────────────────────────────

const DraftDetail = ({
  draft,
  employees,
  actorRole,
  actorName,
  onClose,
  onEdit,
  onChanged,
}: {
  draft: CourseDraft;
  employees: EmployeeOption[];
  actorRole: ActorRole;
  actorName: string;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) => {
  const [reasonModal, setReasonModal] = useState<{ mode: 'add' | 'remove'; member?: { id: string; name: string } } | null>(null);
  const [audit, setAudit] = useState<DraftAuditEvent[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState('');

  const color = categoryColor(draft.category);
  const included = draft.members.filter((m) => m.state === 'Included');
  const excluded = draft.members.filter((m) => m.state === 'Excluded');
  const locked = draft.status === 'Finalized';

  useEffect(() => {
    void listDraftAuditTrail(draft.id).then(setAudit);
  }, [draft.id, draft.members]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of draft.members) map.set(m.employeeId, m.name);
    return map;
  }, [draft.members]);

  // Already-included employees shouldn't appear in the add picker.
  const addableEmployees = useMemo(() => {
    const takenIds = new Set(included.map((m) => m.employeeId));
    return employees.filter((e) => e.status === 'Active' && !takenIds.has(e.id));
  }, [employees, included]);

  const runAction = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Action failed.');
      return;
    }
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${color}1a`, color }}>
                  {draft.category}
                </span>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[draft.status]}`}>
                  {draft.status}
                </span>
                {draft.targetDepartmentName && (
                  <span className="text-xs text-gray-500">→ {draft.targetDepartmentName}</span>
                )}
              </div>
              <h2 className="text-xl font-bold text-gray-900">{draft.title}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {formatDateTime(draft.startDate)}
                {draft.endDate ? ` – ${formatDateTime(draft.endDate)}` : ''}
                {draft.location ? ` · ${draft.location}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!locked && (
                <button type="button" onClick={onEdit} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                  Edit
                </button>
              )}
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {draft.returnNote && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-xs font-semibold text-amber-800">Dept Head note</p>
              <p className="text-sm text-amber-900 mt-0.5">{draft.returnNote}</p>
            </div>
          )}
          {error && <p className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Recommended list */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Recommended employees ({included.length}{draft.capacity ? ` / ${draft.capacity}` : ''})
              </h3>
              {!locked && (
                <button
                  type="button"
                  onClick={() => setReasonModal({ mode: 'add' })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add employee
                </button>
              )}
            </div>

            {included.length === 0 ? (
              <EmptyState title="No employees recommended yet" description="Add the employees this training is intended for. Each add needs a reason." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Employee</th>
                      <th className="px-4 py-2.5 font-semibold">Department</th>
                      <th className="px-4 py-2.5 font-semibold">Reason</th>
                      <th className="px-4 py-2.5 font-semibold">By</th>
                      {!locked && <th className="px-4 py-2.5 font-semibold text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {included.map((m) => (
                      <tr key={m.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{m.name}</p>
                          <p className="text-xs text-gray-500">{m.position}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{m.department}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs">{m.reason}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{ACTOR_LABEL[m.actorRole]}</td>
                        {!locked && (
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setReasonModal({ mode: 'remove', member: { id: m.employeeId, name: m.name } })}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                            >
                              <UserMinus className="h-3.5 w-3.5" /> Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Excluded — kept visible so the reasoned trail isn't hidden */}
          {excluded.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Removed from this draft ({excluded.length})
              </h3>
              <div className="rounded-xl border border-dashed border-gray-300 divide-y divide-gray-100">
                {excluded.map((m) => (
                  <div key={m.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-500 line-through">{m.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{m.reason}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">by {ACTOR_LABEL[m.actorRole]}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Audit trail */}
          <section>
            <button
              type="button"
              onClick={() => setShowAudit((s) => !s)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
            >
              <History className="h-3.5 w-3.5" /> Audit trail ({audit.length})
              <ChevronDown className={`h-3.5 w-3.5 transition ${showAudit ? 'rotate-180' : ''}`} />
            </button>
            {showAudit && (
              <div className="mt-3 rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {audit.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">No changes recorded yet.</p>
                ) : (
                  audit.map((e) => (
                    <div key={e.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-gray-800">
                          <span className={`font-semibold ${e.action === 'Added' ? 'text-emerald-700' : 'text-red-700'}`}>
                            {e.action}
                          </span>{' '}
                          {nameById.get(e.employeeId) ?? 'employee'}
                        </p>
                        <span className="text-xs text-gray-400 shrink-0">
                          {ACTOR_LABEL[e.actorRole]} · {formatDateTime(e.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{e.reason}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          {/* Workflow actions */}
          {!locked && (
            <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Workflow</h3>

              {draft.status === 'Draft' && (
                <button
                  type="button"
                  disabled={busy || included.length === 0}
                  onClick={() => void runAction(() => sendDraftToDeptHead(draft.id))}
                  title={included.length === 0 ? 'Recommend at least one employee first.' : undefined}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" /> Send to Dept Head
                </button>
              )}

              {draft.status === 'Sent to Dept Head' && (
                actorRole === 'DeptHead' ? (
                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      value={returnNote}
                      onChange={(e) => setReturnNote(e.target.value)}
                      placeholder="Optional note back to L&D…"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction(() => returnDraftToLnd(draft.id, returnNote))}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      <Undo2 className="h-4 w-4" /> Return to L&D
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Waiting on {draft.targetDepartmentName ?? 'the Dept Head'} to review and return this draft.
                    Switch to <span className="font-semibold">Dept Head</span> above to act on their behalf.
                  </p>
                )
              )}

              {draft.status === 'Returned' && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    The Dept Head has returned this draft. Finalizing creates the calendar event and seeds its roster in Seminar Enrollment.
                  </p>
                  <button
                    type="button"
                    disabled={busy || included.length === 0}
                    onClick={() => void runAction(() => finalizeCourseDraft(draft.id, actorName))}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Finalize
                  </button>
                </div>
              )}
            </section>
          )}

          {locked && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm text-emerald-800">
                Finalized. The roster is now in <span className="font-semibold">Seminar Enrollment</span> awaiting confirmation.
                Because it came from this draft, the Dept Head can add attendees there but must return here to remove any.
              </p>
            </div>
          )}
        </div>
      </div>

      {reasonModal && (
        <ReasonModal
          mode={reasonModal.mode}
          employees={addableEmployees}
          employeeName={reasonModal.member?.name}
          onClose={() => setReasonModal(null)}
          onConfirm={async (employeeId, reason) => {
            const result =
              reasonModal.mode === 'add'
                ? await addDraftMember({ draftId: draft.id, employeeId, reason, actorRole, actorName })
                : await removeDraftMember({
                    draftId: draft.id,
                    employeeId: reasonModal.member!.id,
                    reason,
                    actorRole,
                    actorName,
                  });
            if (!result.ok) throw new Error(result.error ?? 'Action failed.');
            onChanged();
          }}
        />
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

export const TrainingCourses = () => {
  const [drafts, setDrafts] = useState<CourseDraft[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | DraftStatus>('All');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, setFormState] = useState<{ draft?: CourseDraft } | null>(null);
  const [actorRole, setActorRole] = useState<ActorRole>('LND');

  const actorName = actorRole === 'LND' ? 'L&D Admin' : 'Dept Head';

  const refresh = useCallback(async () => {
    const data = await listCourseDrafts();
    setDrafts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    void listEmployeeOptions().then(setEmployees);
    void getDepartmentIdOptions().then(setDepartments);
  }, [refresh]);

  // Read from `drafts` rather than snapshotting, so the open panel reflects edits.
  const selected = useMemo(() => drafts.find((d) => d.id === selectedId) ?? null, [drafts, selectedId]);

  const filtered = useMemo(
    () => (statusFilter === 'All' ? drafts : drafts.filter((d) => d.status === statusFilter)),
    [drafts, statusFilter]
  );

  return (
    <div className="space-y-6 p-6 md:p-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">
            <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Training Courses
          </p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Training Courses</h1>
          <p className="mt-1 text-sm text-gray-500">
            Draft a training and its recommended attendees, route it through the Dept Head, then finalize it onto the calendar.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ActorRoleSwitch value={actorRole} onChange={setActorRole} />
          <button
            type="button"
            onClick={() => setFormState({})}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm"
          >
            <Plus className="h-4 w-4" /> New Draft
          </button>
        </div>
      </section>

      {/* Status filter */}
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setIsFilterOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Filter className="h-4 w-4 text-gray-400" />
          {statusFilter === 'All' ? 'All Statuses' : statusFilter}
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>
        {isFilterOpen && (
          <div className="absolute left-0 top-full mt-1 z-20 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {(['All', ...DRAFT_STATUSES] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setStatusFilter(s as 'All' | DraftStatus); setIsFilterOpen(false); }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${statusFilter === s ? 'font-semibold text-blue-600' : 'text-gray-700'}`}
              >
                {s === 'All' ? 'All Statuses' : s}
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 relative min-h-[220px]">
        {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 rounded-2xl" />}
        {!loading && filtered.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No training drafts"
            description={statusFilter === 'All' ? 'Create your first training draft to get started.' : `No drafts with status "${statusFilter}".`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Training</th>
                  <th className="px-4 py-3 font-semibold">Dept Head</th>
                  <th className="px-4 py-3 font-semibold">Schedule</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Recommended</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((draft) => {
                  const color = categoryColor(draft.category);
                  const includedCount = draft.members.filter((m) => m.state === 'Included').length;
                  return (
                    <tr key={draft.id} onClick={() => setSelectedId(draft.id)} className="cursor-pointer hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{draft.title}</p>
                        <span className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${color}1a`, color }}>
                          {draft.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{draft.targetDepartmentName ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{formatDateTime(draft.startDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[draft.status]}`}>
                          {draft.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium text-blue-600">{includedCount}</span>
                        {draft.capacity > 0 && <span className="text-gray-400 text-xs ml-1">/ {draft.capacity}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <DraftDetail
          draft={selected}
          employees={employees}
          actorRole={actorRole}
          actorName={actorName}
          onClose={() => setSelectedId(null)}
          onEdit={() => setFormState({ draft: selected })}
          onChanged={() => void refresh()}
        />
      )}

      {formState && (
        <DraftFormModal
          draft={formState.draft}
          departments={departments}
          actorName={actorName}
          onClose={() => setFormState(null)}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  );
};
