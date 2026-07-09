import {
  BadgeCheck,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Lock,
  MapPin,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { listEmployeeOptions, type EmployeeOption } from '../../lib/api/officeRoles';
import {
  addRosterAttendee,
  advanceRosterStatus,
  canRemoveAttendee,
  listRosterSessions,
  removalBlockedReason,
  removeRosterAttendee,
  setRosterEnrollmentStatus,
  type ActorRole,
  type RosterSession,
  type RosterStatus,
} from '../../lib/api/trainingPipeline';
import { ActorRoleSwitch } from './components/ActorRoleSwitch';
import { TRAINING_CATEGORIES, categoryColor } from './trainingCategories';

const ROSTER_STATUS_BADGE: Record<RosterStatus, string> = {
  'Draft': 'bg-gray-100 text-gray-700',
  'Sent to Dept Head': 'bg-blue-100 text-blue-700',
  'Dept Head Confirmed': 'bg-indigo-100 text-indigo-700',
  'Pending Final Approval': 'bg-amber-100 text-amber-700',
  'Approved': 'bg-emerald-100 text-emerald-700',
};

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5';

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// ── Add attendee ──────────────────────────────────────────────────────────────

const AddAttendeeModal = ({
  session,
  employees,
  actorRole,
  actorName,
  onClose,
  onSaved,
}: {
  session: RosterSession;
  employees: EmployeeOption[];
  actorRole: ActorRole;
  actorName: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enrolledIds = useMemo(() => new Set(session.attendees.map((a) => a.employeeId)), [session.attendees]);

  const candidates = useMemo(() => {
    const q = query.toLowerCase();
    return employees.filter(
      (e) =>
        e.status === 'Active' &&
        !enrolledIds.has(e.id) &&
        (e.full_name.toLowerCase().includes(q) ||
          (e.department ?? '').toLowerCase().includes(q) ||
          (e.position ?? '').toLowerCase().includes(q))
    );
  }, [employees, enrolledIds, query]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleAdd = async () => {
    setBusy(true);
    setError(null);
    for (const employeeId of selected) {
      const result = await addRosterAttendee({ sessionId: session.id, employeeId, actorRole, actorName });
      if (!result.ok) {
        setBusy(false);
        setError(result.error ?? 'Could not add attendee.');
        return;
      }
    }
    setBusy(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add Attendees</h2>
            <p className="text-xs text-gray-500 mt-0.5">{session.title}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, position, or department…"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 min-h-[240px]">
          {candidates.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">No matching employees available to add.</p>
          ) : (
            candidates.map((emp) => (
              <label key={emp.id} className="flex items-center gap-3 px-6 py-3 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.has(emp.id)}
                  onChange={() => toggle(emp.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{emp.full_name}</p>
                  <p className="text-xs text-gray-500">{emp.position ?? '—'} · {emp.department ?? '—'}</p>
                </div>
              </label>
            ))
          )}
        </div>

        {error && <p className="mx-6 mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <span className="text-sm text-gray-500">{selected.size} selected</span>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={() => void handleAdd()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" /> {busy ? 'Adding…' : `Add ${selected.size || ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Remove attendee (reason required) ─────────────────────────────────────────

const RemoveAttendeeModal = ({
  attendeeName,
  onClose,
  onConfirm,
}: {
  attendeeName: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
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
      <form onSubmit={handleSubmit} className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Remove {attendeeName}</h2>
        <div>
          <label className={labelClass}>Reason <span className="text-red-500">*</span></label>
          <textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          <p className="mt-1 text-xs text-gray-400">The attendee is kept on record as removed, with this reason.</p>
        </div>
        {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={!reason.trim() || busy} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? 'Removing…' : 'Remove with Reason'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ── Workflow bar ──────────────────────────────────────────────────────────────

const RosterWorkflow = ({
  session,
  actorRole,
  busy,
  onAdvance,
}: {
  session: RosterSession;
  actorRole: ActorRole;
  busy: boolean;
  onAdvance: (next: RosterStatus) => void;
}) => {
  const isLnd = actorRole === 'LND';

  if (session.rosterStatus === 'Approved') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5">
        <BadgeCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        <p className="text-sm text-emerald-800">
          Roster approved — it now appears on the Training Calendar.
        </p>
      </div>
    );
  }

  const btn = 'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';

  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
      {session.rosterStatus === 'Draft' && (
        isLnd ? (
          <button type="button" disabled={busy || session.attendees.length === 0} onClick={() => onAdvance('Sent to Dept Head')} className={`${btn} bg-blue-600 hover:bg-blue-700`}>
            <Send className="h-4 w-4" /> Send to Dept Head
          </button>
        ) : (
          <p className="text-sm text-gray-500">L&D is still building this roster.</p>
        )
      )}

      {session.rosterStatus === 'Sent to Dept Head' && (
        actorRole === 'DeptHead' ? (
          <button type="button" disabled={busy} onClick={() => onAdvance('Dept Head Confirmed')} className={`${btn} bg-indigo-600 hover:bg-indigo-700`}>
            <CheckCircle2 className="h-4 w-4" /> Confirm roster
          </button>
        ) : (
          <p className="text-sm text-gray-500">Waiting on the Dept Head to confirm. Switch to Dept Head to act on their behalf.</p>
        )
      )}

      {session.rosterStatus === 'Dept Head Confirmed' && (
        isLnd ? (
          <button type="button" disabled={busy} onClick={() => onAdvance('Pending Final Approval')} className={`${btn} bg-amber-600 hover:bg-amber-700`}>
            <Send className="h-4 w-4" /> Finalize &amp; send for final approval
          </button>
        ) : (
          <p className="text-sm text-gray-500">Confirmed. L&D will finalize and re-send for approval.</p>
        )
      )}

      {session.rosterStatus === 'Pending Final Approval' && (
        actorRole === 'DeptHead' ? (
          <button type="button" disabled={busy} onClick={() => onAdvance('Approved')} className={`${btn} bg-emerald-600 hover:bg-emerald-700`}>
            <ShieldCheck className="h-4 w-4" /> Approve roster
          </button>
        ) : (
          <p className="text-sm text-gray-500">Awaiting final approval. Once approved, the roster appears on the Training Calendar.</p>
        )
      )}
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

export const SeminarEnrollment = () => {
  const [sessions, setSessions] = useState<RosterSession[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | RosterStatus>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [actorRole, setActorRole] = useState<ActorRole>('LND');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [addModal, setAddModal] = useState<RosterSession | null>(null);
  const [removeModal, setRemoveModal] = useState<{ session: RosterSession; enrollmentId: string; name: string } | null>(null);

  const actorName = actorRole === 'LND' ? 'L&D Admin' : 'Dept Head';

  const refresh = useCallback(async () => {
    const data = await listRosterSessions();
    setSessions(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    void listEmployeeOptions().then(setEmployees);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => {
      const matchesSearch =
        s.title.toLowerCase().includes(q) ||
        (s.category ?? '').toLowerCase().includes(q) ||
        (s.instructorName ?? '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'All' || s.rosterStatus === statusFilter;
      const matchesCategory = categoryFilter === 'All' || s.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [sessions, searchQuery, statusFilter, categoryFilter]);

  const totals = useMemo(
    () => ({
      total: sessions.length,
      approved: sessions.filter((s) => s.rosterStatus === 'Approved').length,
      pending: sessions.filter((s) => s.rosterStatus !== 'Approved').length,
      enrolled: sessions.reduce((sum, s) => sum + s.attendees.length, 0),
    }),
    [sessions]
  );

  const handleAdvance = async (session: RosterSession, next: RosterStatus) => {
    setBusyId(session.id);
    setError(null);
    const result = await advanceRosterStatus(session.id, next);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error ?? 'Could not update the roster status.');
      return;
    }
    await refresh();
  };

  const handleToggleEnrollment = async (enrollmentId: string, current: 'Confirmed' | 'Pending') => {
    const result = await setRosterEnrollmentStatus(enrollmentId, current === 'Confirmed' ? 'Pending' : 'Confirmed');
    if (!result.ok) {
      setError(result.error ?? 'Could not update enrollment status.');
      return;
    }
    await refresh();
  };

  return (
    <div className="space-y-6 p-6 md:p-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500">
            <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Seminar Enrollment
          </p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Seminar Enrollment</h1>
          <p className="mt-1 text-sm text-gray-500">
            Confirm each training's roster with the Dept Head. Approval publishes it to the Training Calendar.
          </p>
        </div>
        <ActorRoleSwitch value={actorRole} onChange={setActorRole} />
      </section>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-600 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Totals */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-gray-200 pb-4 text-sm">
        <div><span className="font-semibold text-gray-900 text-lg mr-1">{totals.total}</span><span className="text-gray-500">Trainings</span></div>
        <div><span className="font-semibold text-amber-600 text-lg mr-1">{totals.pending}</span><span className="text-gray-500">Awaiting approval</span></div>
        <div><span className="font-semibold text-emerald-600 text-lg mr-1">{totals.approved}</span><span className="text-gray-500">Approved</span></div>
        <div><span className="font-semibold text-blue-600 text-lg mr-1">{totals.enrolled}</span><span className="text-gray-500">Total enrolled</span></div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search trainings, categories, or speakers"
            className={`${inputClass} pl-9`}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'All' | RosterStatus)} className={`${inputClass} w-56`}>
          <option value="All">All roster statuses</option>
          {(Object.keys(ROSTER_STATUS_BADGE) as RosterStatus[]).map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={`${inputClass} w-56`}>
          <option value="All">All categories</option>
          {TRAINING_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
      </div>

      {/* Sessions */}
      <div className="space-y-4 relative min-h-[200px]">
        {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 rounded-2xl" />}
        {!loading && filtered.length === 0 ? (
          <EmptyState
            title="No trainings to enroll"
            description="Finalize a draft in Training Courses, or add a training directly on the Training Calendar."
          />
        ) : (
          filtered.map((session) => {
            const color = categoryColor(session.category);
            const expanded = expandedId === session.id;
            const slotsLeft = session.capacity - session.attendees.length;
            const progress = session.capacity > 0 ? Math.min((session.attendees.length / session.capacity) * 100, 100) : 0;
            const fromDraft = session.sourceDraftId !== null;
            const removalBlocked = removalBlockedReason(session, actorRole);
            const locked = session.rosterStatus === 'Approved';

            return (
              <div key={session.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-5 cursor-pointer" onClick={() => setExpandedId(expanded ? null : session.id)}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${ROSTER_STATUS_BADGE[session.rosterStatus]}`}>
                        {session.rosterStatus}
                      </span>
                      {session.category && (
                        <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${color}1a`, color }}>
                          {session.category}
                        </span>
                      )}
                      {fromDraft && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          <Lock className="h-3 w-3" /> From Training Courses
                        </span>
                      )}
                    </div>

                    <div className="flex items-start gap-3">
                      <div>
                        <p className="text-xs font-semibold text-right mb-1">
                          {session.attendees.length}{session.capacity > 0 ? ` / ${session.capacity}` : ''} enrolled
                        </p>
                        {session.capacity > 0 && (
                          <>
                            <div className="w-28 h-1.5 bg-gray-200 rounded-full">
                              <div className="h-1.5 bg-blue-600 rounded-full" style={{ width: `${progress}%` }} />
                            </div>
                            <p className="text-xs text-gray-400 text-right mt-1">{slotsLeft} slots left</p>
                          </>
                        )}
                      </div>
                      {expanded ? <ChevronUp className="h-4 w-4 text-gray-500 mt-1" /> : <ChevronDown className="h-4 w-4 text-gray-500 mt-1" />}
                    </div>
                  </div>

                  <h2 className="text-lg font-bold text-gray-900 mt-2 mb-3">{session.title}</h2>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span className="inline-flex items-center"><User className="w-3.5 h-3.5 mr-1" />{session.instructorName || 'TBA'}</span>
                    <span className="inline-flex items-center"><Calendar className="w-3.5 h-3.5 mr-1" />{formatDate(session.startDate)}</span>
                    <span className="inline-flex items-center"><Clock className="w-3.5 h-3.5 mr-1" />{formatTime(session.startDate)}</span>
                    <span className="inline-flex items-center"><MapPin className="w-3.5 h-3.5 mr-1" />{session.location || 'TBA'}</span>
                  </div>
                </div>

                {expanded && (
                  <>
                    <div className="px-5 pb-4">
                      <RosterWorkflow
                        session={session}
                        actorRole={actorRole}
                        busy={busyId === session.id}
                        onAdvance={(next) => void handleAdvance(session, next)}
                      />
                    </div>

                    {/* The rule, stated where it bites. */}
                    {removalBlocked && !locked && (
                      <div className="mx-5 mb-4 flex items-start gap-2.5 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                        <Lock className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-slate-600">{removalBlocked}</p>
                      </div>
                    )}

                    <div className="overflow-x-auto border-t border-gray-100">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                          <tr>
                            <th className="px-4 py-3 font-semibold">#</th>
                            <th className="px-4 py-3 font-semibold">Employee</th>
                            <th className="px-4 py-3 font-semibold">Department</th>
                            <th className="px-4 py-3 font-semibold">Enrollment</th>
                            <th className="px-4 py-3 font-semibold">Added by</th>
                            <th className="px-4 py-3 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {session.attendees.length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No attendees on this roster yet.</td></tr>
                          ) : (
                            session.attendees.map((a, i) => (
                              <tr key={a.enrollmentId} className="hover:bg-gray-50/50">
                                <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                                <td className="px-4 py-3">
                                  <p className="font-semibold text-gray-900">{a.name}</p>
                                  <p className="text-xs text-gray-500">{a.position}</p>
                                </td>
                                <td className="px-4 py-3 text-gray-700">{a.department}</td>
                                <td className="px-4 py-3">
                                  <button
                                    type="button"
                                    disabled={locked}
                                    onClick={() => void handleToggleEnrollment(a.enrollmentId, a.enrollmentStatus)}
                                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:cursor-default ${
                                      a.enrollmentStatus === 'Confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}
                                  >
                                    {a.enrollmentStatus}
                                  </button>
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-500">
                                  {a.addedByRole === 'DeptHead' ? 'Dept Head' : a.addedByRole === 'LND' ? 'L&D' : (a.addedBy ?? '—')}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {locked ? (
                                    <span className="text-xs text-gray-400">Locked</span>
                                  ) : canRemoveAttendee(session, actorRole) ? (
                                    <button
                                      type="button"
                                      onClick={() => setRemoveModal({ session, enrollmentId: a.enrollmentId, name: a.name })}
                                      className="text-gray-400 hover:text-red-500"
                                      title="Remove attendee"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  ) : (
                                    <span title={removalBlocked ?? undefined} className="inline-flex text-gray-300 cursor-not-allowed">
                                      <Trash2 className="h-4 w-4" />
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {!locked && (
                      <div className="flex items-center justify-between p-4 border-t border-gray-100">
                        <p className="text-sm text-gray-500">
                          {session.attendees.length} enrolled
                          {session.capacity > 0 && ` · ${slotsLeft} slots remaining`}
                        </p>
                        {/* Adding is always permitted, for both roles. */}
                        <button
                          type="button"
                          onClick={() => setAddModal(session)}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                          <UserPlus className="h-4 w-4" /> Add employee
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {addModal && (
        <AddAttendeeModal
          session={addModal}
          employees={employees}
          actorRole={actorRole}
          actorName={actorName}
          onClose={() => setAddModal(null)}
          onSaved={() => void refresh()}
        />
      )}

      {removeModal && (
        <RemoveAttendeeModal
          attendeeName={removeModal.name}
          onClose={() => setRemoveModal(null)}
          onConfirm={async (reason) => {
            const result = await removeRosterAttendee({
              session: removeModal.session,
              enrollmentId: removeModal.enrollmentId,
              reason,
              actorRole,
            });
            if (!result.ok) throw new Error(result.error ?? 'Could not remove the attendee.');
            await refresh();
          }}
        />
      )}
    </div>
  );
};
