import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getAdminEmail } from '../lib/adminSession';
import {
  Building2,
  ChevronRight,
  ChevronDown,
  Plus,
  AlertTriangle,
  Users,
  RefreshCw,
  // Still used by the candidate rows (edit note / remove candidate) — the
  // position rows themselves are read-only for RSP.
  Pencil,
  Trash2,
  X,
  User,
  Search,
  Award,
  ShieldAlert,
} from 'lucide-react';
import { Button } from './Button';
import {
  listDepartmentSummaries,
  listCriticalPositions,
  listCandidates,
  addCandidate,
  updateCandidateNote,
  removeCandidate,
  listEmployeeOptions,
  listCompetencyRequirements,
  listPositionQualificationsForDepartment,
  diffQualifications,
  type DepartmentSummary,
  type CriticalPosition,
  type RankedCandidate,
  type EmployeeOption,
  type CompetencyRequirement,
  type QualificationDrift,
  type PositionQualifications,
} from '../lib/api/succession';

// The Succession Planning view lives inside the RSP Portal, which is already
// access-gated to the RSP admin. Management actions therefore key off "am I in
// this portal"; the acting admin's email (for created_by / added_by audit) comes
// from the same admin session the rest of RSPDashboard reads.
const getCurrentAdmin = (): string => getAdminEmail('rsp-admin');

const adjectivalTone = (adj: string | null): string => {
  switch (adj) {
    case 'Outstanding': return 'bg-green-50 text-green-700 border-green-200';
    case 'Very Satisfactory': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'Satisfactory': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Unsatisfactory': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'Poor': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-200';
  }
};

// Critical positions are authored solely by the Department Head, in the Critical
// Positions tab of their Office Account console. RSP reads them here and manages
// the successor pipeline; it does not create, edit, or remove the positions
// themselves. That keeps the two screens structurally incapable of disagreeing —
// there is no second write path that could produce a position with a free-text
// title or no qualifications attached.
export const SuccessionPlanningPage = () => {
  const admin = useMemo(getCurrentAdmin, []);

  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);
  const [expandedPositionId, setExpandedPositionId] = useState<string | null>(null);

  const [positionsByDept, setPositionsByDept] = useState<Record<string, CriticalPosition[]>>({});
  const [loadingPositions, setLoadingPositions] = useState<Record<string, boolean>>({});
  const [candidatesByPosition, setCandidatesByPosition] = useState<Record<string, RankedCandidate[]>>({});
  const [loadingCandidates, setLoadingCandidates] = useState<Record<string, boolean>>({});

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [candidateModal, setCandidateModal] = useState<
    | { positionId: string; positionTitle: string; departmentName: string }
    | null
  >(null);
  const [candidatePick, setCandidatePick] = useState<{ employeeId: string; note: string; search: string }>({
    employeeId: '',
    note: '',
    search: '',
  });
  const [saving, setSaving] = useState(false);

  // ── Loaders ─────────────────────────────────────────────────────────────
  const loadDepartments = async () => {
    setLoadingDepts(true);
    const res = await listDepartmentSummaries();
    if (res.ok === false) setError(res.error);
    else setDepartments(res.data);
    setLoadingDepts(false);
  };

  const loadPositions = async (departmentId: string) => {
    setLoadingPositions((p) => ({ ...p, [departmentId]: true }));
    const res = await listCriticalPositions(departmentId);
    if (res.ok === false) setError(res.error);
    else setPositionsByDept((prev) => ({ ...prev, [departmentId]: res.data }));
    setLoadingPositions((p) => ({ ...p, [departmentId]: false }));
  };

  const loadCandidates = async (positionId: string) => {
    setLoadingCandidates((p) => ({ ...p, [positionId]: true }));
    const res = await listCandidates(positionId);
    if (res.ok === false) setError(res.error);
    else setCandidatesByPosition((prev) => ({ ...prev, [positionId]: res.data }));
    setLoadingCandidates((p) => ({ ...p, [positionId]: false }));
  };

  useEffect(() => {
    loadDepartments();
    listEmployeeOptions().then(setEmployees);
  }, []);

  // ── Expand / collapse ─────────────────────────────────────────────────────
  const toggleDept = (deptId: string) => {
    setExpandedPositionId(null);
    if (expandedDeptId === deptId) {
      setExpandedDeptId(null);
      return;
    }
    setExpandedDeptId(deptId);
    // Always refetch, never serve the cached list. A Department Head can flag a
    // new critical position at any moment; caching on first expand meant RSP
    // kept showing a stale list until a full browser reload. The previously
    // loaded rows stay on screen while this runs, so there's no flicker.
    loadPositions(deptId);
  };

  const togglePosition = (positionId: string) => {
    if (expandedPositionId === positionId) {
      setExpandedPositionId(null);
      return;
    }
    setExpandedPositionId(positionId);
    if (!candidatesByPosition[positionId]) loadCandidates(positionId);
  };

  // ── Refresh ───────────────────────────────────────────────────────────────
  // Pulls the department counts and whatever is currently expanded, so RSP can
  // pick up a Department Head's edits mid-session without reloading the page.
  const refreshAll = async () => {
    setRefreshing(true);
    setError(null);
    await Promise.all([
      loadDepartments(),
      expandedDeptId ? loadPositions(expandedDeptId) : Promise.resolve(),
      expandedPositionId ? loadCandidates(expandedPositionId) : Promise.resolve(),
    ]);
    setRefreshing(false);
  };

  // ── Candidate CRUD ────────────────────────────────────────────────────────
  const openAddCandidate = (position: CriticalPosition, departmentName: string) => {
    setCandidatePick({ employeeId: '', note: '', search: '' });
    setCandidateModal({ positionId: position.id, positionTitle: position.title, departmentName });
  };

  const saveCandidate = async () => {
    if (!candidateModal || !candidatePick.employeeId) return;
    setSaving(true);
    const res = await addCandidate({
      criticalPositionId: candidateModal.positionId,
      employeeId: candidatePick.employeeId,
      note: candidatePick.note || null,
      addedBy: admin,
    });
    setSaving(false);
    if (res.ok === false) {
      setError(res.error);
      return;
    }
    const positionId = candidateModal.positionId;
    setCandidateModal(null);
    await loadCandidates(positionId);
  };

  const editNote = async (candidate: RankedCandidate) => {
    const next = window.prompt('Note for this candidate:', candidate.note ?? '');
    if (next === null) return;
    const res = await updateCandidateNote(candidate.id, next);
    if (res.ok === false) {
      setError(res.error);
      return;
    }
    if (expandedPositionId) loadCandidates(expandedPositionId);
  };

  const confirmRemoveCandidate = async (candidate: RankedCandidate) => {
    if (!window.confirm(`Remove ${candidate.employeeName} from this succession list?`)) return;
    const res = await removeCandidate(candidate.id);
    if (res.ok === false) {
      setError(res.error);
      return;
    }
    if (expandedPositionId) loadCandidates(expandedPositionId);
  };

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  const expandedDept = departments.find((d) => d.departmentId === expandedDeptId) ?? null;
  const expandedPosition =
    expandedDeptId && expandedPositionId
      ? (positionsByDept[expandedDeptId] ?? []).find((p) => p.id === expandedPositionId) ?? null
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="!mb-1 text-2xl font-bold text-[var(--text-primary)]">Succession Planning</h1>
          <p className="!mb-0 text-sm text-[var(--text-secondary)]">
            Drill down by department to review critical positions and build their successor pipelines. Positions are
            flagged by each office's Department Head; candidates are ranked live by their latest completed IPCR score.
          </p>
        </div>
        <Button variant="secondary" onClick={refreshAll} loading={refreshing}>
          <RefreshCw size={15} /> Refresh
        </Button>
      </div>

      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm">
        <button
          onClick={() => { setExpandedDeptId(null); setExpandedPositionId(null); }}
          className={`font-medium ${expandedDept ? 'text-blue-600 hover:underline' : 'text-[var(--text-primary)]'}`}
        >
          Departments
        </button>
        {expandedDept && (
          <>
            <ChevronRight size={14} className="text-[var(--text-muted)]" />
            <button
              onClick={() => setExpandedPositionId(null)}
              className={`font-medium ${expandedPosition ? 'text-blue-600 hover:underline' : 'text-[var(--text-primary)]'}`}
            >
              {expandedDept.departmentName}
            </button>
          </>
        )}
        {expandedPosition && (
          <>
            <ChevronRight size={14} className="text-[var(--text-muted)]" />
            <span className="font-medium text-[var(--text-primary)]">{expandedPosition.title}</span>
          </>
        )}
      </nav>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
        </div>
      )}

      {/* Departments table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-white shadow-sm">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-600">
            <tr>
              <th className="px-5 py-4">Department</th>
              <th className="px-5 py-4 text-center">Critical Positions</th>
              <th className="px-5 py-4 text-center">Vacant Critical</th>
              <th className="px-5 py-4 text-right">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {loadingDepts && (
              <tr><td colSpan={4} className="px-5 py-12 text-center text-sm text-[var(--text-secondary)]">Loading departments…</td></tr>
            )}
            {!loadingDepts && departments.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-12 text-center text-sm text-[var(--text-secondary)]">No departments found.</td></tr>
            )}
            {!loadingDepts && departments.map((dept) => {
              const isOpen = expandedDeptId === dept.departmentId;
              return (
                <FragmentRow key={dept.departmentId}>
                  <tr
                    className={`cursor-pointer border-t border-[var(--border-color)] align-middle hover:bg-slate-50/60 ${isOpen ? 'bg-slate-50/60' : ''}`}
                    onClick={() => toggleDept(dept.departmentId)}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {isOpen ? <ChevronDown size={18} className="text-blue-600" /> : <ChevronRight size={18} className="text-[var(--text-muted)]" />}
                        <span className="rounded-xl bg-blue-100 p-2 text-blue-600"><Building2 size={18} /></span>
                        <span className="font-semibold text-[var(--text-primary)]">{dept.departmentName}</span>
                        {/* Only ever shown for a deactivated office that still
                            owns critical positions — those stay listed so the
                            work doesn't vanish, but they shouldn't look normal. */}
                        {!dept.isActive && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Inactive office
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center font-semibold text-[var(--text-primary)]">{dept.criticalPositionCount}</td>
                    <td className="px-5 py-4 text-center">
                      {dept.vacantCriticalCount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-sm font-semibold text-red-600">
                          <AlertTriangle size={13} /> {dept.vacantCriticalCount}
                        </span>
                      ) : (
                        <span className="text-sm text-[var(--text-muted)]">0</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm text-blue-600">{isOpen ? 'Hide' : 'View'} critical positions</span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={4} className="bg-slate-50/40 px-5 py-5">
                        <CriticalPositionsPanel
                          dept={dept}
                          positions={positionsByDept[dept.departmentId]}
                          loading={loadingPositions[dept.departmentId]}
                          expandedPositionId={expandedPositionId}
                          candidatesByPosition={candidatesByPosition}
                          loadingCandidates={loadingCandidates}
                          onTogglePosition={togglePosition}
                          onAddCandidate={(p) => openAddCandidate(p, dept.departmentName)}
                          onEditNote={editNote}
                          onRemoveCandidate={confirmRemoveCandidate}
                        />
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add candidate modal */}
      {candidateModal && (
        <Modal
          title="Add Succession Candidate"
          subtitle={`${candidateModal.positionTitle} · ${candidateModal.departmentName}`}
          onClose={() => setCandidateModal(null)}
        >
          <CandidatePicker
            employees={employees}
            departmentName={candidateModal.departmentName}
            pick={candidatePick}
            setPick={setCandidatePick}
          />
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCandidateModal(null)}>Cancel</Button>
            <Button onClick={saveCandidate} loading={saving} disabled={!candidatePick.employeeId}>
              Add candidate
            </Button>
          </div>
        </Modal>
      )}

      <style>{`
        .sp-input {
          width: 100%;
          border-radius: 0.6rem;
          border: 1px solid var(--border-color, #d1d5db);
          padding: 0.55rem 0.75rem;
          font-size: 0.95rem;
          outline: none;
        }
        .sp-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 1px #3b82f6; }
      `}</style>
    </div>
  );
};

// React needs a keyed wrapper to return two sibling <tr>s from a map.
const FragmentRow = ({ children }: { children: ReactNode }) => <>{children}</>;

// ─────────────────────────────────────────────────────────────────────────────
// Critical positions panel (inside an expanded department)
// ─────────────────────────────────────────────────────────────────────────────

type CriticalPositionsPanelProps = {
  dept: DepartmentSummary;
  positions: CriticalPosition[] | undefined;
  loading: boolean | undefined;
  expandedPositionId: string | null;
  candidatesByPosition: Record<string, RankedCandidate[]>;
  loadingCandidates: Record<string, boolean>;
  onTogglePosition: (id: string) => void;
  onAddCandidate: (p: CriticalPosition) => void;
  onEditNote: (c: RankedCandidate) => void;
  onRemoveCandidate: (c: RankedCandidate) => void;
};

const CriticalPositionsPanel = (props: CriticalPositionsPanelProps) => {
  const { dept, positions, loading } = props;

  return (
    <div className="space-y-3">
      <h3 className="!mb-0 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        Critical Positions — {dept.departmentName}
      </h3>

      {loading && <p className="text-sm text-[var(--text-secondary)]">Loading critical positions…</p>}

      {!loading && (positions?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-white px-6 py-10 text-center">
          <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <ShieldAlert size={22} />
          </span>
          <p className="!mb-1 text-sm font-medium text-[var(--text-primary)]">
            No critical positions identified for this department yet
          </p>
          <p className="!mb-0 text-sm text-[var(--text-secondary)]">
            The Department Head flags these from the Critical Positions tab in their Office Account.
          </p>
        </div>
      )}

      {!loading && (positions ?? []).map((position) => {
        const isOpen = props.expandedPositionId === position.id;
        return (
          <div key={position.id} className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-white">
            <div className="flex items-start gap-3 p-4">
              <button onClick={() => props.onTogglePosition(position.id)} className="mt-0.5 text-[var(--text-muted)] hover:text-blue-600">
                {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => props.onTogglePosition(position.id)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--text-primary)]">{position.title}</span>
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                    Critical
                  </span>
                  {!position.incumbentEmployeeId && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                      Vacant
                    </span>
                  )}
                </div>
                <p className="!mb-0 mt-1 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                  <User size={13} />
                  {position.incumbentName ? `Incumbent: ${position.incumbentName}` : 'No incumbent linked'}
                </p>
                {position.criticalityReason && (
                  <p className="!mb-0 mt-1.5 inline-block rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {position.criticalityReason}
                  </p>
                )}
              </div>
            </div>

            {isOpen && (
              <div className="space-y-4 border-t border-[var(--border-color)] bg-slate-50/50 p-4">
                <RequirementsPanel position={position} departmentName={props.dept.departmentName} />
                <CandidatesPanel
                  candidates={props.candidatesByPosition[position.id]}
                  loading={props.loadingCandidates[position.id]}
                  onAddCandidate={() => props.onAddCandidate(position)}
                  onEditNote={props.onEditNote}
                  onRemoveCandidate={props.onRemoveCandidate}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Qualification requirements panel (inside an expanded critical position) —
// read-only here. Configured by the position's Department Head in the Critical
// Positions module, which pulls them from the job posting. RSP views only.
// ─────────────────────────────────────────────────────────────────────────────

const RequirementsPanel = ({
  position,
  departmentName,
}: {
  position: CriticalPosition;
  departmentName: string;
}) => {
  const [competencyReqs, setCompetencyReqs] = useState<CompetencyRequirement[]>([]);
  const [drift, setDrift] = useState<QualificationDrift[]>([]);
  const [posted, setPosted] = useState<PositionQualifications | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Training requirements are no longer settable on a critical position, so
    // there's nothing to fetch for them.
    Promise.all([
      listCompetencyRequirements(position.id),
      listPositionQualificationsForDepartment(departmentName),
    ]).then(([compRes, postingQuals]) => {
      if (cancelled) return;
      setCompetencyReqs(compRes.ok ? compRes.data : []);
      // The position snapshots its requirements when flagged, but leaves fields
      // the Department Head never filled as blank. Those blanks fall back to the
      // job posting for display (below), so keep the posting around.
      const postingMatch = postingQuals.get(position.title.trim().toLowerCase()) ?? null;
      setPosted(postingMatch);
      // Drift warns only about a real override — a snapshot value that diverges
      // from the posting. A blank snapshot isn't stale: it's displayed straight
      // from the posting, so drop those entries (diffQualifications marks a blank
      // snapshot with stored === '—') or the banner would contradict the value shown.
      setDrift(postingMatch ? diffQualifications(position, postingMatch).filter((d) => d.stored !== '—') : []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [position, departmentName]);

  // Snapshot wins; a blank field falls back to the job posting so the panel
  // reflects what the admin entered on the Job Posts page.
  const education = position.requiredEducation?.trim() || posted?.requiredEducation || '';
  const eligibility = position.requiredEligibility?.trim() || posted?.requiredEligibility || '';
  const experience =
    position.minYearsExperience != null
      ? `${position.minYearsExperience} year(s)`
      : posted?.minYearsExperience
      ? `${posted.minYearsExperience} year(s)`
      : '—';

  const hasAnything =
    !!position.positionDescription ||
    !!education ||
    !!eligibility ||
    experience !== '—' ||
    (position.requiredCertifications ?? []).length > 0 ||
    competencyReqs.length > 0;

  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-white p-4">
      <h4 className="!mb-3 text-sm font-semibold text-[var(--text-primary)]">Qualification Requirements</h4>

      {!loading && drift.length > 0 && (
        <div className="!mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <p className="!mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={13} /> The job posting for this position has changed since it was flagged critical
          </p>
          <ul className="!mb-0 space-y-0.5">
            {drift.map((d) => (
              <li key={d.label}>
                <span className="font-medium">{d.label}:</span> showing “{d.stored}” · posting now says “{d.posted}”
              </li>
            ))}
          </ul>
          <p className="!mb-0 mt-1.5 text-amber-700">
            Only the Department Head can adopt the new values, from their Critical Positions tab.
          </p>
        </div>
      )}

      {loading && <p className="text-sm text-[var(--text-secondary)]">Loading requirements…</p>}

      {!loading && !hasAnything && (
        <p className="!mb-0 text-sm text-[var(--text-secondary)]">No qualification requirements configured yet.</p>
      )}

      {!loading && hasAnything && (
        <div className="space-y-3 text-sm">
          {position.positionDescription && (
            <div><span className="text-[var(--text-secondary)]">Description</span><p className="!mb-0 font-medium">{position.positionDescription}</p></div>
          )}
          {/* Mirrors the Critical Positions form exactly: only requirements a
              Department Head can actually set. Required successors and Min. IPCR
              rating were dropped there, so showing them here would render a
              value nobody can change. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <div><span className="text-[var(--text-secondary)]">Min. experience</span><p className="!mb-0 font-medium">{experience}</p></div>
            <div><span className="text-[var(--text-secondary)]">Required education</span><p className="!mb-0 font-medium">{education || '—'}</p></div>
            <div><span className="text-[var(--text-secondary)]">Required eligibility</span><p className="!mb-0 font-medium">{eligibility || '—'}</p></div>
          </div>

          {(position.requiredCertifications ?? []).length > 0 && (
            <div>
              <span className="text-[var(--text-secondary)]">Required certifications</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {position.requiredCertifications.map((c) => (
                  <span key={c} className="rounded-full border border-[var(--border-color)] bg-slate-50 px-2 py-0.5 text-xs text-[var(--text-primary)]">{c}</span>
                ))}
              </div>
            </div>
          )}

          {competencyReqs.length > 0 && (
            <div>
              <span className="text-[var(--text-secondary)]">Required competencies</span>
              <ul className="!mb-0 mt-1 space-y-0.5">
                {competencyReqs.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1 text-xs">
                    <span>{c.competencyName}</span>
                    <span className="font-semibold text-[var(--text-secondary)]">Level {c.requiredLevel}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Candidates panel (inside an expanded critical position) — ranked live
// ─────────────────────────────────────────────────────────────────────────────

type CandidatesPanelProps = {
  candidates: RankedCandidate[] | undefined;
  loading: boolean | undefined;
  onAddCandidate: () => void;
  onEditNote: (c: RankedCandidate) => void;
  onRemoveCandidate: (c: RankedCandidate) => void;
};

const CandidatesPanel = (props: CandidatesPanelProps) => {
  const { candidates, loading } = props;
  const rated = (candidates ?? []).filter((c) => c.rated);
  const unrated = (candidates ?? []).filter((c) => !c.rated);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="!mb-0 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
          <Users size={15} /> Succession Candidates
        </h4>
        <Button size="sm" variant="secondary" onClick={props.onAddCandidate} className="flex items-center gap-1.5">
          <Plus size={14} /> Add Candidate
        </Button>
      </div>

      {loading && <p className="text-sm text-[var(--text-secondary)]">Loading candidates…</p>}

      {!loading && (candidates?.length ?? 0) === 0 && (
        <div className="rounded-lg border border-dashed border-[var(--border-color)] bg-white px-5 py-8 text-center">
          <p className="!mb-1 text-sm font-medium text-[var(--text-primary)]">No succession candidates identified yet</p>
          <p className="!mb-0 text-sm text-[var(--text-secondary)]">
            Nominate an employee — ideally from the same department — as a potential successor.
          </p>
        </div>
      )}

      {!loading && rated.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-[var(--border-color)] bg-white">
          <div className="flex items-center gap-1.5 border-b border-[var(--border-color)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            <Award size={13} className="text-green-600" /> Ranked by latest completed IPCR
          </div>
          {rated.map((c, i) => (
            <CandidateRow key={c.id} candidate={c} rank={i + 1} onEditNote={props.onEditNote} onRemove={props.onRemoveCandidate} />
          ))}
        </div>
      )}

      {!loading && unrated.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Not yet rated · {unrated.length} — no completed IPCR to rank on
          </div>
          {unrated.map((c) => (
            <CandidateRow key={c.id} candidate={c} rank={null} onEditNote={props.onEditNote} onRemove={props.onRemoveCandidate} />
          ))}
        </div>
      )}
    </div>
  );
};

const CandidateRow = ({
  candidate,
  rank,
  onEditNote,
  onRemove,
}: {
  candidate: RankedCandidate;
  rank: number | null;
  onEditNote: (c: RankedCandidate) => void;
  onRemove: (c: RankedCandidate) => void;
}) => (
  <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
      rank === null ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white'
    }`}>
      {rank ?? '—'}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[var(--text-primary)]">{candidate.employeeName}</span>
        {candidate.rated ? (
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${adjectivalTone(candidate.adjectival)}`}>
            {candidate.adjectival} · {candidate.overallScore?.toFixed(2)}
          </span>
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500">
            Not yet rated
          </span>
        )}
      </div>
      <p className="!mb-0 mt-0.5 text-sm text-[var(--text-secondary)]">
        {candidate.currentPosition ?? '—'}{candidate.department ? ` · ${candidate.department}` : ''}
        {candidate.rated && candidate.ratedPeriod ? ` · ${candidate.ratedPeriod}` : ''}
      </p>
      {candidate.note && <p className="!mb-0 mt-1 text-xs italic text-slate-500">“{candidate.note}”</p>}
    </div>
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        onClick={() => onEditNote(candidate)}
        className="rounded-lg border border-[var(--border-color)] p-1.5 text-blue-600 hover:bg-blue-50"
        title="Edit note"
      >
        <Pencil size={13} />
      </button>
      <button
        onClick={() => onRemove(candidate)}
        className="rounded-lg border border-[var(--border-color)] p-1.5 text-red-500 hover:bg-red-50"
        title="Remove candidate"
      >
        <Trash2 size={13} />
      </button>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Candidate picker (same-department-first, searchable company-wide)
// ─────────────────────────────────────────────────────────────────────────────

const CandidatePicker = ({
  employees,
  departmentName,
  pick,
  setPick,
}: {
  employees: EmployeeOption[];
  departmentName: string;
  pick: { employeeId: string; note: string; search: string };
  setPick: (v: { employeeId: string; note: string; search: string }) => void;
}) => {
  const norm = (s: string) => s.trim().toLowerCase();
  const q = norm(pick.search);
  const filtered = employees
    .filter((e) => !q || norm(e.fullName).includes(q) || norm(e.position ?? '').includes(q))
    .sort((a, b) => {
      // Same department surfaces first.
      const aSame = norm(a.department ?? '') === norm(departmentName) ? 0 : 1;
      const bSame = norm(b.department ?? '') === norm(departmentName) ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
      return a.fullName.localeCompare(b.fullName);
    })
    .slice(0, 40);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Select employee</label>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={pick.search}
            onChange={(e) => setPick({ ...pick, search: e.target.value })}
            placeholder={`Search — ${departmentName} shown first, or search anyone`}
            className="sp-input !pl-9"
          />
        </div>
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[var(--border-color)]">
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-[var(--text-secondary)]">No matching employees.</p>
          )}
          {filtered.map((e) => {
            const selected = pick.employeeId === e.id;
            const sameDept = norm(e.department ?? '') === norm(departmentName);
            return (
              <button
                key={e.id}
                onClick={() => setPick({ ...pick, employeeId: e.id })}
                className={`flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50 ${
                  selected ? 'bg-blue-50' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{e.fullName}</span>
                  <span className="block truncate text-xs text-[var(--text-secondary)]">
                    {e.position ?? '—'}{e.department ? ` · ${e.department}` : ''}
                  </span>
                </span>
                {sameDept && (
                  <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700">
                    Same dept
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">Note (optional)</label>
        <textarea
          rows={3}
          value={pick.note}
          onChange={(e) => setPick({ ...pick, note: e.target.value })}
          placeholder="e.g. Strong technical background, needs more supervisory experience"
          className="sp-input resize-y"
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

const Modal = ({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div
      className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border-color)] px-6 py-4">
        <div>
          <h2 className="!mb-0 text-lg font-bold text-[var(--text-primary)]">{title}</h2>
          {subtitle && <p className="!mb-0 mt-0.5 text-sm text-[var(--text-secondary)]">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="overflow-y-auto px-6 py-5">{children}</div>
    </div>
  </div>
);
