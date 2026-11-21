import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import {
  listDepartmentSummaries,
  listCriticalPositions,
  type DepartmentSummary,
  type CriticalPosition,
} from '../lib/api/succession';
import {
  fetchSuccessionPoolsV2,
  fetchSuccessionPoolV2,
  type CandidateMetaV2,
  type SuccessionPoolV2,
} from '../lib/api/successionPipelineV2';
import {
  type CanonicalDegreeV2,
  type PositionRequirementsV2,
  type RankedSuccessionV2Result,
} from '../lib/api/successionScoringV2';
import { CandidateEvidenceReviewModal } from './CandidateEvidenceReviewModal';
import { SkeletonList, TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';
import { TableStateRows } from './data-table';

// Critical positions are authored by the Department Head in their Office
// Account console; RSP reviews the ranked V2 successor pipeline here.
export const SuccessionPlanningPage = () => {
  return <SuccessionPlanTableView />;
};

type SortKey = 'performance' | 'experience' | 'training' | 'education' | 'eligibility' | 'total';
type CriterionKey = Exclude<SortKey, 'total'>;

const V2_CRITERIA_COLUMNS: readonly { key: CriterionKey; label: string; weight: number }[] = [
  { key: 'performance', label: 'Performance', weight: 30 },
  { key: 'experience', label: 'Experience', weight: 20 },
  { key: 'training', label: 'Training', weight: 20 },
  { key: 'education', label: 'Education', weight: 15 },
  { key: 'eligibility', label: 'Eligibility', weight: 15 },
] as const;

const DEGREE_LABELS: Record<CanonicalDegreeV2, string> = {
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  doctorate: 'Doctorate degree',
};

interface BreakdownRow {
  key: CriterionKey;
  label: string;
  max: number;
  how: string;
  score: number;
  meaning: string;
  toMax: string;
}

const buildBreakdownRows = (
  r: RankedSuccessionV2Result,
  meta: CandidateMetaV2 | undefined,
): BreakdownRow[] => {
  const { audit, contributions } = r;
  const reqYears = audit.requirements.experienceYears;
  const reqHours = audit.requirements.trainingHours;

  const perfMeaning =
    audit.performanceRating === null
      ? 'No completed IPCR on file.'
      : `IPCR rating of ${audit.performanceRating.toFixed(2)} / 5${
          meta?.ipcrAdjectival ? ` (${meta.ipcrAdjectival})` : ''
        }${meta?.ipcrPeriod ? ` · ${meta.ipcrPeriod}` : ''}.`;

  const expBase = reqYears
    ? `${audit.relevantYears.toFixed(2)} relevant year(s) (${audit.relevantWorkDays} days) vs ${reqYears} required year(s).`
    : `${audit.relevantYears.toFixed(2)} relevant year(s) (${audit.relevantWorkDays} days).`;
  const expMeaning = meta?.experienceUsedTenureFallback
    ? `${expBase} City Hall tenure fallback from date_hired was used.`
    : expBase;

  const trainMeaning = reqHours
    ? `${audit.trainingHours} relevant training hour(s) vs ${reqHours} required hour(s).`
    : `${audit.trainingHours} relevant training hour(s).`;

  const eduMeaning = audit.highestRelevantDegree
    ? `Highest relevant degree: ${DEGREE_LABELS[audit.highestRelevantDegree]}.`
    : 'No relevant qualifying degree counted.';

  const eligCount = audit.distinctEligibilityTypes.length;
  const eligMeaning =
    eligCount === 0
      ? 'No distinct recognized, unexpired eligibility counted.'
      : `${eligCount} distinct recognized eligibility type${eligCount === 1 ? '' : 's'} counted.`;

  return [
    {
      key: 'performance',
      label: 'Performance',
      max: 30,
      how: 'Latest completed IPCR rating / 5 × 30. No rating on file scores 0.',
      score: contributions.performance,
      meaning: perfMeaning,
      toMax: 'A 5.00 completed IPCR rating.',
    },
    {
      key: 'experience',
      label: 'Experience',
      max: 20,
      how: 'Relevant City Hall years / (2 × required years) × 20, capped at 20.',
      score: contributions.experience,
      meaning: expMeaning,
      toMax: reqYears
        ? `At least ${(reqYears * 2).toFixed(1).replace(/\.0$/, '')} relevant City Hall years (twice the ${reqYears}-year minimum).`
        : 'Relevant City Hall service of at least twice the required minimum.',
    },
    {
      key: 'training',
      label: 'Training',
      max: 20,
      how: 'Relevant completed training hours / (2 × required hours) × 20, capped at 20.',
      score: contributions.training,
      meaning: trainMeaning,
      toMax: reqHours
        ? `At least ${reqHours * 2} relevant training hours (twice the ${reqHours}-hour minimum).`
        : 'Relevant completed training hours of at least twice the required minimum.',
    },
    {
      key: 'education',
      label: 'Education',
      max: 15,
      how: 'Fixed points by highest relevant degree: Bachelor 3, Master 9, Doctorate 15.',
      score: contributions.education,
      meaning: eduMeaning,
      toMax: 'A relevant Doctorate degree (15 points).',
    },
    {
      key: 'eligibility',
      label: 'Eligibility',
      max: 15,
      how: 'Distinct recognized, relevant, unexpired eligibilities: 0 = 0, 1 = 7.5, 2+ = 15.',
      score: contributions.eligibility,
      meaning: eligMeaning,
      toMax: 'Two or more distinct recognized, unexpired eligibilities (15 points).',
    },
  ];
};

/**
 * Apply a column sort on top of the model's ranking.
 * Re-sorting is for analysis; rank travels with the row so an admin still sees
 * who ranks first overall.
 */
const applySort = (
  rows: readonly RankedSuccessionV2Result[],
  sort: { key: SortKey; dir: 'asc' | 'desc' } | undefined,
): RankedSuccessionV2Result[] => {
  if (!sort) return [...rows];
  const valueOf = (r: RankedSuccessionV2Result) =>
    sort.key === 'total' ? r.total : r.contributions[sort.key];
  return [...rows].sort((a, b) => {
    const diff = valueOf(b) - valueOf(a);
    const ordered = sort.dir === 'desc' ? diff : -diff;
    return ordered !== 0 ? ordered : a.rank - b.rank;
  });
};

/** DOM id of a position block, the target of ?dept=…&position=… from the RSP dashboard. */
const positionAnchor = (positionId: string) => `succession-position-${positionId}`;
/** How long a deep-linked position stays highlighted after it scrolls into view. */
const DEEP_LINK_HIGHLIGHT_MS = 2400;

/** Column header, same as the L&D Training needs assessment table. */
const TH = 'px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500';

/** Department row status: a vacancy needs attention; otherwise filled or nothing flagged. */
const departmentStatus = (dept: DepartmentSummary): { label: string; badgeClass: string } => {
  if (dept.vacantCriticalCount > 0) {
    return { label: `${dept.vacantCriticalCount} vacant`, badgeClass: 'badge badge-warning' };
  }
  if (dept.criticalPositionCount > 0) {
    return { label: 'All filled', badgeClass: 'badge badge-success' };
  }
  return { label: 'No critical positions', badgeClass: 'badge badge-neutral' };
};

const SuccessionPlanTableView = () => {
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const departmentsLoad = useTableLoading(loading, departments.length > 0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [posByDept, setPosByDept] = useState<Record<string, CriticalPosition[]>>({});
  const [sortBy, setSortBy] = useState<Record<string, { key: SortKey; dir: 'asc' | 'desc' }>>({});
  const [openDetail, setOpenDetail] = useState<Set<string>>(() => new Set());
  const [loadingDept, setLoadingDept] = useState<Record<string, boolean>>({});
  const [deptError, setDeptError] = useState<unknown>(null);
  const [positionsFailed, setPositionsFailed] = useState<Record<string, boolean>>({});

  const [poolV2ByPos, setPoolV2ByPos] = useState<Record<string, SuccessionPoolV2>>({});
  const [loadingV2ByPos, setLoadingV2ByPos] = useState<Record<string, boolean>>({});
  const [errorV2ByPos, setErrorV2ByPos] = useState<Record<string, string | null>>({});

  const [reviewTarget, setReviewTarget] = useState<{
    candidate: { employeeId: string; name: string };
    position: { id: string; title: string; requirements: PositionRequirementsV2 };
  } | null>(null);

  const navigate = useNavigate();

  const toggleSort = (positionId: string, key: SortKey) => {
    setSortBy((prev) => {
      const cur = prev[positionId];
      const dir: 'asc' | 'desc' = cur?.key === key && cur.dir === 'desc' ? 'asc' : 'desc';
      return { ...prev, [positionId]: { key, dir } };
    });
  };

  const sortIndicator = (positionId: string, key: SortKey) => {
    const cur = sortBy[positionId];
    if (!cur || cur.key !== key) return '';
    return cur.dir === 'desc' ? ' ↓' : ' ↑';
  };

  const ariaSortFor = (positionId: string, key: SortKey): 'descending' | 'ascending' | 'none' => {
    const cur = sortBy[positionId];
    if (!cur || cur.key !== key) return 'none';
    return cur.dir === 'desc' ? 'descending' : 'ascending';
  };

  const toggleDetail = (positionId: string, employeeId: string) => {
    const key = `${positionId}:${employeeId}`;
    setOpenDetail((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const loadPoolV2 = async (posId: string) => {
    setLoadingV2ByPos((prev) => ({ ...prev, [posId]: true }));
    setErrorV2ByPos((prev) => ({ ...prev, [posId]: null }));
    try {
      const pool = await fetchSuccessionPoolV2(posId);
      setPoolV2ByPos((prev) => ({ ...prev, [posId]: pool }));
    } catch (err) {
      console.error('Failed to load V2 succession pool:', err);
      setErrorV2ByPos((prev) => ({
        ...prev,
        [posId]: err instanceof Error ? err.message : 'Failed to load succession pool.',
      }));
    } finally {
      setLoadingV2ByPos((prev) => ({ ...prev, [posId]: false }));
    }
  };

  const loadPoolsForDepartment = async (positions: CriticalPosition[]) => {
    if (positions.length === 0) return;
    const posIds = positions.map((p) => p.id);
    try {
      const poolMap = await fetchSuccessionPoolsV2(posIds);
      setPoolV2ByPos((prev) => {
        const next = { ...prev };
        for (const pos of positions) {
          const pool = poolMap.get(pos.id);
          if (pool) next[pos.id] = pool;
        }
        return next;
      });
      setErrorV2ByPos((prev) => {
        const next = { ...prev };
        for (const pos of positions) {
          next[pos.id] = poolMap.has(pos.id)
            ? null
            : "We couldn't load the candidates for this position, so none are shown. Reload the page to try again.";
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to load V2 succession pools:', err);
      const message = err instanceof Error ? err.message : 'Failed to load succession pools.';
      setErrorV2ByPos((prev) => {
        const next = { ...prev };
        for (const pos of positions) next[pos.id] = message;
        return next;
      });
    } finally {
      setLoadingV2ByPos((prev) => {
        const next = { ...prev };
        for (const id of posIds) next[id] = false;
        return next;
      });
    }
  };

  const loadDepartments = () => {
    setLoading(true);
    void listDepartmentSummaries().then((r) => {
      if (r.ok) {
        setDepartments(r.data);
        setDeptError(null);
      } else {
        setDeptError('error' in r ? r.error : 'Failed to load departments.');
      }
      setLoading(false);
    });
  };

  useEffect(loadDepartments, []);

  const toggle = async (deptId: string) => {
    const isOpen = expanded.has(deptId);
    setExpanded((prev) => {
      const n = new Set(prev);
      if (isOpen) n.delete(deptId);
      else n.add(deptId);
      return n;
    });
    if (isOpen || posByDept[deptId]) return;
    setLoadingDept((p) => ({ ...p, [deptId]: true }));
    const pr = await listCriticalPositions(deptId);
    if (!pr.ok) {
      // Not cached, so collapsing and reopening the office retries.
      setPositionsFailed((p) => ({ ...p, [deptId]: true }));
      setLoadingDept((p) => ({ ...p, [deptId]: false }));
      return;
    }
    setPositionsFailed((p) => ({ ...p, [deptId]: false }));
    const positions = pr.data;
    if (positions.length > 0) {
      setLoadingV2ByPos((prev) => {
        const next = { ...prev };
        for (const pos of positions) next[pos.id] = true;
        return next;
      });
      setErrorV2ByPos((prev) => {
        const next = { ...prev };
        for (const pos of positions) next[pos.id] = null;
        return next;
      });
    }
    setPosByDept((p) => ({ ...p, [deptId]: positions }));
    setLoadingDept((p) => ({ ...p, [deptId]: false }));
    await loadPoolsForDepartment(positions);
  };

  // Deep link from the RSP dashboard: open the office, then bring the position
  // into view and highlight it briefly. Each step runs once per page load.
  const location = useLocation();
  const deepLink = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return { dept: params.get('dept'), position: params.get('position') };
  }, [location.search]);
  const deepLinkExpanded = useRef(false);
  const deepLinkScrolled = useRef(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const highlightTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const deptId = deepLink.dept;
    if (loading || deepLinkExpanded.current || !deptId) return;
    if (!departments.some((d) => d.departmentId === deptId)) return;
    deepLinkExpanded.current = true;
    if (!expanded.has(deptId)) void toggle(deptId);
    // toggle reads state from this render; it only needs to run once here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, departments, deepLink.dept]);

  useEffect(() => {
    const { dept, position } = deepLink;
    if (deepLinkScrolled.current || !dept || !position || !posByDept[dept]) return;
    const el = document.getElementById(positionAnchor(position));
    if (!el) return;
    deepLinkScrolled.current = true;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    setHighlighted(position);
    highlightTimer.current = window.setTimeout(() => setHighlighted(null), DEEP_LINK_HIGHLIGHT_MS);
  }, [deepLink, posByDept]);

  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const openArchive = (employeeId: string, department: string | null) => {
    const params = new URLSearchParams({ module: 'archive', employee: employeeId });
    if (department) params.set('office', department);
    navigate(`/admin/lnd?${params.toString()}`);
  };

  const fmtLeaving = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null;

  return (
    <div className="space-y-3">
      <p className="!mb-0 text-xs text-[var(--text-secondary)]">
        Official succession-plan view. Only employees who meet <strong>all four</strong> minimum requirements —
        Education, Eligibility, Experience and Training — and have completed evidence reviews appear in the ranked
        table; anyone failing a minimum requirement is filtered out and counted beside the position. Candidates are
        ranked by <strong>Total Score</strong>, highest first; where two candidates tie, the higher Performance score
        ranks first. Column headers re-sort for analysis without changing anyone&rsquo;s rank. Click a name for the
        full breakdown, competency coverage, gap analysis and required actions — several can be open at once.
      </p>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="abyan-table-wrap">
          <table className="abyan-table w-full min-w-[21rem]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th scope="col" className={TH}>Department</th>
                <th scope="col" className={TH}>Critical positions</th>
                <th scope="col" className={TH}>Vacant</th>
                <th scope="col" className={TH}>Status</th>
              </tr>
            </thead>
            <tbody className={tableBodyClass(false)}>
              {departmentsLoad.initialLoading && (
                <TableSkeletonRows
                  show={departmentsLoad.showSkeleton}
                  columns={['text', 'text', 'text', 'badge']}
                  label="Loading succession plan…"
                />
              )}
              {!departmentsLoad.initialLoading && departments.length === 0 && (
                <TableStateRows
                  view={deptError ? 'error' : 'empty'}
                  columns={4}
                  error={deptError}
                  errorAction="load the succession plan"
                  onRetry={loadDepartments}
                  emptyTitle="No departments to show yet"
                  emptyMessage="Departments appear here once they have critical positions."
                />
              )}
              {!departmentsLoad.initialLoading && departments.map((dept) => {
                const open = expanded.has(dept.departmentId);
                const positions = posByDept[dept.departmentId] ?? [];
                const status = departmentStatus(dept);
                return (
                  <Fragment key={dept.departmentId}>
                    <tr
                      onClick={() => void toggle(dept.departmentId)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          void toggle(dept.departmentId);
                        }
                      }}
                      tabIndex={0}
                      aria-expanded={open}
                      className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                    >
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-2">
                          {open
                            ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                            : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                          <span className="text-sm font-semibold text-slate-900">{dept.departmentName}</span>
                          {!dept.isActive && (
                            <span className="badge badge-neutral">Inactive</span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{dept.criticalPositionCount}</td>
                      <td className="px-5 py-4 text-sm text-slate-700">{dept.vacantCriticalCount}</td>
                      <td className="px-5 py-4">
                        <span className={status.badgeClass}>{status.label}</span>
                      </td>
                    </tr>

                    {open && (
                      <tr className="last:border-0">
                        <td colSpan={4} className="border-y-2 border-slate-300 bg-slate-100 px-5 py-5 shadow-inner">
                          {loadingDept[dept.departmentId] && <SkeletonList show rows={3} label="Loading positions…" />}
                          {!loadingDept[dept.departmentId] && positionsFailed[dept.departmentId] && (
                            <p role="alert" className="text-sm font-medium text-[var(--error-700)]">
                              We couldn&apos;t load this office&apos;s critical positions, so none are shown. Collapse the office and open it again to retry.
                            </p>
                          )}
                          {!loadingDept[dept.departmentId] && !positionsFailed[dept.departmentId] && positions.length === 0 && (
                            <p className="text-sm text-[var(--text-secondary)]">No critical positions flagged for this office.</p>
                          )}
                          {positions.map((pos) => {
                            const leaving = fmtLeaving(pos.incumbentLeavingDate);
                            const pool = poolV2ByPos[pos.id];
                            const isLoadingPool = Boolean(loadingV2ByPos[pos.id]);
                            const poolError = errorV2ByPos[pos.id];
                            const rows = pool ? applySort(pool.ranked, sortBy[pos.id]) : [];
                            const excludedCount = pool?.excluded.length ?? 0;
                            const downwardCount = pool?.downwardMovesExcluded ?? 0;

                            return (
                              <div
                                key={pos.id}
                                id={positionAnchor(pos.id)}
                                className={`-mx-2 mb-5 rounded-xl px-2 py-1 transition-[background-color,box-shadow] duration-200 ease-out last:mb-0 ${
                                  highlighted === pos.id ? 'bg-[var(--color-primary-50)] ring-2 ring-[var(--color-primary)]' : ''
                                }`}
                              >
                                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                                  <span className="text-sm font-semibold text-slate-900">{pos.title}</span>
                                  <span className="text-xs text-slate-500">
                                    Held by: {pos.incumbentName ?? <em className="text-slate-400">Vacant</em>}
                                    {leaving ? ` · leaving ${leaving}` : ''}
                                    {excludedCount > 0
                                      ? ` · ${excludedCount} did not meet the minimum requirements`
                                      : ''}
                                    {downwardCount > 0
                                      ? ` · ${downwardCount} excluded as downward move${downwardCount === 1 ? '' : 's'}`
                                      : ''}
                                  </span>
                                </div>

                                {isLoadingPool ? (
                                  <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                                    Loading succession scoring pool...
                                  </div>
                                ) : poolError ? (
                                  <div
                                    role="alert"
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700"
                                  >
                                    <span>Failed to load succession pool: {poolError}</span>
                                    <button
                                      type="button"
                                      onClick={() => void loadPoolV2(pos.id)}
                                      className="btn btn-sm btn-secondary"
                                    >
                                      Retry
                                    </button>
                                  </div>
                                ) : pool ? (
                                  <div className="space-y-4">
                                    {pool.configurationNeeded.length > 0 && (
                                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                                        <strong>Position Requirements Incomplete:</strong> Position experience or training minimums must be configured to finalize candidate ranks.
                                      </div>
                                    )}

                                    <div className="abyan-table-wrap overflow-x-auto rounded-xl border border-slate-200 bg-white">
                                      <table className="abyan-table w-full min-w-[900px]">
                                        <thead>
                                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                                            <th scope="col" className="px-3 py-2.5 text-center">Rank</th>
                                            <th scope="col" className="px-3 py-2.5">Candidate / Present Position</th>
                                            {V2_CRITERIA_COLUMNS.map((c) => (
                                              <th
                                                key={c.key}
                                                scope="col"
                                                aria-sort={ariaSortFor(pos.id, c.key)}
                                                className="px-3 py-2.5 text-right"
                                              >
                                                <button
                                                  type="button"
                                                  onClick={() => toggleSort(pos.id, c.key)}
                                                  className="font-semibold uppercase tracking-wide hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] rounded"
                                                  title={`Sort by ${c.label}`}
                                                >
                                                  {c.label} ({c.weight}%){sortIndicator(pos.id, c.key)}
                                                </button>
                                              </th>
                                            ))}
                                            <th
                                              scope="col"
                                              aria-sort={ariaSortFor(pos.id, 'total')}
                                              className="px-3 py-2.5 text-right"
                                            >
                                              <button
                                                type="button"
                                                onClick={() => toggleSort(pos.id, 'total')}
                                                className="font-bold uppercase tracking-wide text-slate-900 hover:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] rounded"
                                                title="Sort by total score"
                                              >
                                                Total Score{sortIndicator(pos.id, 'total')}
                                              </button>
                                            </th>
                                            <th scope="col" className="px-3 py-2.5 text-right">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {rows.length === 0 ? (
                                            <tr>
                                              <td colSpan={9} className="px-3 py-4 text-center text-xs text-slate-500">
                                                No candidates currently meet all minimum qualifications.
                                              </td>
                                            </tr>
                                          ) : (
                                            rows.map((r) => {
                                              const detailOpen = openDetail.has(`${pos.id}:${r.candidate.employeeId}`);
                                              const meta = pool.candidateMeta?.[r.candidate.employeeId];
                                              const breakdownRows = buildBreakdownRows(r, meta);
                                              const recognizedElig = meta?.eligibilityDetail.recognized ?? r.audit.distinctEligibilityTypes;
                                              const expiredElig = meta?.eligibilityDetail.expired ?? [];
                                              const unrecognizedElig = meta?.eligibilityDetail.unrecognized ?? [];
                                              const competencies = meta?.competencyBreakdown ?? [];
                                              const gapAnalysis = meta?.gapAnalysis ?? [];
                                              const requiredActions = meta?.requiredActions ?? [];

                                              return (
                                                <Fragment key={r.candidate.employeeId}>
                                                  <tr className={`align-top hover:bg-slate-50 ${detailOpen ? 'bg-slate-50' : ''}`}>
                                                    <td className="px-3 py-2.5 text-center">
                                                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold tabular-nums text-slate-700">
                                                        {r.rank}
                                                      </span>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                      <button
                                                        type="button"
                                                        onClick={() => toggleDetail(pos.id, r.candidate.employeeId)}
                                                        aria-expanded={detailOpen}
                                                        title={
                                                          detailOpen
                                                            ? 'Hide score breakdown'
                                                            : 'Show score breakdown, competency coverage and gap analysis'
                                                        }
                                                        className="flex items-center gap-1.5 text-left text-sm font-medium text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] rounded"
                                                      >
                                                        {detailOpen ? (
                                                          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                                                        ) : (
                                                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                                                        )}
                                                        <span>{r.candidate.name}</span>
                                                      </button>
                                                      <div className="pl-[22px] text-xs text-slate-500">
                                                        {meta?.presentPosition ?? '—'}
                                                      </div>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">
                                                      {r.contributions.performance.toFixed(1)} / 30
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">
                                                      {r.contributions.experience.toFixed(1)} / 20
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">
                                                      {r.contributions.training.toFixed(1)} / 20
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">
                                                      {r.contributions.education.toFixed(1)} / 15
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-700">
                                                      {r.contributions.eligibility.toFixed(1)} / 15
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-sm tabular-nums">
                                                      <span className="font-bold text-slate-900">
                                                        {r.total.toFixed(1)} / 100
                                                      </span>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right">
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          setReviewTarget({
                                                            candidate: r.candidate,
                                                            position: {
                                                              id: pos.id,
                                                              title: pos.title,
                                                              requirements: pool.requirements,
                                                            },
                                                          })
                                                        }
                                                        className="btn btn-sm btn-secondary"
                                                      >
                                                        Review Evidence
                                                      </button>
                                                    </td>
                                                  </tr>

                                                  {detailOpen && (
                                                    <tr className="bg-slate-50">
                                                      <td colSpan={9} className="px-3 pb-3 pt-0">
                                                        <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
                                                          <div className="sm:col-span-2">
                                                            <p className="!mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                                              Score breakdown &mdash; {r.total.toFixed(1)} / 100
                                                            </p>
                                                            <div className="overflow-x-auto rounded-lg border border-slate-200">
                                                              <table className="w-full border-collapse text-left">
                                                                <thead>
                                                                  <tr className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-600">
                                                                    <th scope="col" className="px-3 py-2">Criterion</th>
                                                                    <th scope="col" className="px-3 py-2">How it is scored</th>
                                                                    <th scope="col" className="px-3 py-2 text-right">Score</th>
                                                                    <th scope="col" className="px-3 py-2">What this score means</th>
                                                                    <th scope="col" className="px-3 py-2">To reach the maximum</th>
                                                                  </tr>
                                                                </thead>
                                                                <tbody>
                                                                  {breakdownRows.map((b) => (
                                                                    <tr key={b.key} className="border-t border-slate-100 align-top">
                                                                      <th
                                                                        scope="row"
                                                                        className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-800"
                                                                      >
                                                                        {b.label}{' '}
                                                                        <span className="font-normal text-slate-500">({b.max})</span>
                                                                      </th>
                                                                      <td className="px-3 py-2 text-xs leading-snug text-slate-600">
                                                                        {b.how}
                                                                      </td>
                                                                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-slate-800">
                                                                        <strong className="font-semibold">{b.score.toFixed(1)}</strong>
                                                                        <span className="text-slate-500"> / {b.max}</span>
                                                                      </td>
                                                                      <td className="px-3 py-2 text-xs leading-snug text-slate-700">
                                                                        {b.meaning}
                                                                      </td>
                                                                      <td className="px-3 py-2 text-xs leading-snug text-slate-600">
                                                                        {b.toMax}
                                                                      </td>
                                                                    </tr>
                                                                  ))}
                                                                </tbody>
                                                              </table>
                                                            </div>

                                                            <p className="!mb-1.5 mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                                                              Eligibility Details
                                                            </p>
                                                            <ul className="!mb-0 space-y-1">
                                                              {recognizedElig.map((item) => (
                                                                <li key={`rec-${item}`} className="flex flex-wrap items-center gap-2 text-xs">
                                                                  <span className="text-slate-800">{item}</span>
                                                                  <span className="badge badge-success">recognized</span>
                                                                </li>
                                                              ))}
                                                              {recognizedElig.length === 0 && (
                                                                <li className="text-xs text-slate-500">No recognized eligibility counted.</li>
                                                              )}
                                                              {expiredElig.map((item) => (
                                                                <li key={`exp-${item}`} className="flex flex-wrap items-center gap-2 text-xs">
                                                                  <span className="text-slate-500">{item}</span>
                                                                  <span className="badge badge-warning">expired</span>
                                                                </li>
                                                              ))}
                                                              {unrecognizedElig.map((item) => (
                                                                <li key={`unrec-${item}`} className="flex flex-wrap items-center gap-2 text-xs">
                                                                  <span className="text-slate-600">{item}</span>
                                                                  <span className="badge badge-neutral">not in recognized eligibilities</span>
                                                                </li>
                                                              ))}
                                                            </ul>
                                                          </div>

                                                          <div className="sm:col-span-2 border-t border-slate-100 pt-3">
                                                            <p className="!mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                                                              Required Competencies{' '}
                                                              {r.audit.competencies.required > 0 && (
                                                                <span className="font-normal text-slate-500">
                                                                  ({r.audit.competencies.met} / {r.audit.competencies.required} met)
                                                                </span>
                                                              )}
                                                            </p>
                                                            {competencies.length > 0 ? (
                                                              <ul className="!mb-0 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                                                {competencies.map((comp) => (
                                                                  <li
                                                                    key={comp.name}
                                                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
                                                                  >
                                                                    <div>
                                                                      <span className="font-medium text-slate-800">{comp.name}</span>
                                                                      {comp.satisfiedBy && (
                                                                        <span className="ml-1.5 text-slate-500">
                                                                          ({comp.satisfiedBy})
                                                                        </span>
                                                                      )}
                                                                    </div>
                                                                    <span className={comp.met ? 'badge badge-success' : 'badge badge-warning'}>
                                                                      {comp.met ? 'Met' : 'Gap'}
                                                                    </span>
                                                                  </li>
                                                                ))}
                                                              </ul>
                                                            ) : (
                                                              <p className="!mb-0 text-xs text-slate-500">
                                                                No competency requirements configured for this position.
                                                              </p>
                                                            )}
                                                          </div>

                                                          <div>
                                                            <p className="!mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                                                              Gap Analysis
                                                            </p>
                                                            {gapAnalysis.length > 0 ? (
                                                              <ul className="!mb-0 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                                                                {gapAnalysis.map((g, i) => (
                                                                  <li key={i}>{g}</li>
                                                                ))}
                                                              </ul>
                                                            ) : (
                                                              <p className="!mb-0 text-xs text-slate-500">No gaps recorded.</p>
                                                            )}
                                                          </div>

                                                          <div>
                                                            <p className="!mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                                                              Required Actions
                                                            </p>
                                                            {requiredActions.length > 0 ? (
                                                              <ul className="!mb-0 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                                                                {requiredActions.map((a, i) => (
                                                                  <li key={i}>{a}</li>
                                                                ))}
                                                              </ul>
                                                            ) : (
                                                              <p className="!mb-0 text-xs text-slate-500">No actions required.</p>
                                                            )}
                                                          </div>

                                                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 sm:col-span-2">
                                                            <span className="text-xs text-slate-600">
                                                              {meta?.timeline
                                                                ? `Estimated timeline: ${meta.timeline}`
                                                                : 'No timeline estimate.'}
                                                            </span>
                                                            <button
                                                              type="button"
                                                              onClick={() =>
                                                                openArchive(r.candidate.employeeId, meta?.department ?? null)
                                                              }
                                                              className="text-xs font-semibold text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] rounded"
                                                            >
                                                              Open L&amp;D Archive →
                                                            </button>
                                                          </div>
                                                        </div>
                                                      </td>
                                                    </tr>
                                                  )}
                                                </Fragment>
                                              );
                                            })
                                          )}
                                        </tbody>
                                      </table>
                                    </div>

                                    {pool.needsReview.length > 0 && (
                                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">
                                            Needs Evidence Review ({pool.needsReview.length}{' '}
                                            {pool.needsReview.length === 1 ? 'candidate' : 'candidates'})
                                          </h4>
                                          <span className="text-xs text-amber-700">
                                            Evidence must be reviewed before final ranking
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                                          {pool.needsReview.map((nr) => (
                                            <div
                                              key={nr.candidate.employeeId}
                                              className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-3"
                                            >
                                              <div>
                                                <div className="text-xs font-bold text-slate-900">{nr.candidate.name}</div>
                                                <div className="text-xs text-amber-700">
                                                  {nr.reasonCodes.length} review item(s) pending
                                                </div>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setReviewTarget({
                                                    candidate: nr.candidate,
                                                    position: {
                                                      id: pos.id,
                                                      title: pos.title,
                                                      requirements: pool.requirements,
                                                    },
                                                  })
                                                }
                                                className="btn btn-sm btn-primary"
                                              >
                                                Review
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {reviewTarget && (
        <CandidateEvidenceReviewModal
          isOpen={true}
          onClose={() => setReviewTarget(null)}
          candidate={reviewTarget.candidate}
          criticalPosition={reviewTarget.position}
          onReviewSaved={() => {
            void loadPoolV2(reviewTarget.position.id);
          }}
        />
      )}
    </div>
  );
};
