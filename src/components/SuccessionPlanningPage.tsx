import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAdminEmail } from '../lib/adminSession';
import { ChevronRight, ChevronDown } from 'lucide-react';
import {
  listDepartmentSummaries,
  listCriticalPositions,
  listAutoSuccessorsForPositions,
  type DepartmentSummary,
  type CriticalPosition,
  type AutoSuccessorsResult,
  type ExperiencePart,
} from '../lib/api/succession';
import { RANKING_WEIGHTS, type EligibilityScore } from '../lib/api/successionCriteria';
import {
  fetchSuccessionPoolV2,
  type SuccessionPoolV2,
} from '../lib/api/successionPipelineV2';
import { type PositionRequirementsV2 } from '../lib/api/successionScoringV2';
import { CandidateEvidenceReviewModal } from './CandidateEvidenceReviewModal';

import { SkeletonList, TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';
import { TableStateRows } from './data-table';

// The Succession Planning view lives inside the RSP Portal, which is already
// access-gated to the RSP admin. Management actions therefore key off "am I in
// this portal"; the acting admin's email (for created_by / added_by audit) comes
// from the same admin session the rest of RSPDashboard reads.
const getCurrentAdmin = (): string => getAdminEmail('rsp-admin');

// Critical positions are authored by the Department Head in their Office
// Account console; RSP reviews the ranked successor pipeline here. The page is
// the succession table only. The Ranked cards view was removed, and the page
// title lives in RSPDashboard, so this component adds no heading of its own.
export const SuccessionPlanningPage = () => {
  const admin = useMemo(getCurrentAdmin, []);
  return <OcboTableView admin={admin} />;
};

// ─────────────────────────────────────────────────────────────────────────────
// OcboTableView — the official OCBO Succession Plan layout.
//
// Department -> Key Position (incumbent + leaving date) -> one row per candidate
// (qualified AND not-qualified, for full pipeline transparency), with the four
// Qualification columns (Education/Eligibility/Experience check/x + Training
// bar/%), Overall Status, Gap Analysis, Required Actions, Timeline, and an
// editable Remarks cell. All data comes from the same two-stage engine the
// ranked cards use — this is presentation only.
// ─────────────────────────────────────────────────────────────────────────────

type OcboRow = {
  employeeId: string;
  name: string;
  presentPosition: string | null;
  department: string | null;
  /** 1-based place in the ranked pool. */
  rank: number;
  /** Total weighted score out of 100 — what determines rank order. */
  score: number;
  /** Per-criterion contribution, one column each. */
  criteria: { key: string; label: string; value: number; max: number }[];
  /** Inputs to the experience score, shown when a candidate is expanded. */
  experienceParts: ExperiencePart[];
  eligibility: EligibilityScore;
  status: string;
  statusTone: string;
  gapAnalysis: string[];
  requiredActions: string[];
  timeline: string | null;
};

/**
 * The ranking criteria, in the order specification B lists them, with the
 * weight shown in the header so an admin never has to look it up elsewhere.
 *
 * Weights are read from the model rather than retyped here. A header that
 * disagrees with the score it labels is worse than no header, and the figures
 * on the /succession explainer had already drifted that way once.
 */
/**
 * One line per criterion saying how it is scored, in the reader's words rather
 * than the formula's.
 *
 * The panel used to show a figure for all five criteria but explain only two,
 * so a 0.0 on Education read as a fault in the system rather than a rule doing
 * its job. Each line is checked against the code it describes: a caption that
 * disagrees with its own number is worse than none.
 */
const CRITERION_HOW: Record<string, string> = {
  // succession.ts: ipcrScore / 5, scaled to the weight.
  ipcr: 'Latest completed IPCR rating out of 5. No rating on file scores 0.',
  // successionCriteria.ts experienceScore: years, position level, progression.
  experience:
    'Years of service, position level and career progression. A part with no data is left out and the rest carry its weight.',
  // succession.ts scoreTraining, threshold mode.
  training:
    'Hours against the requirement (60%), how recent the latest training is (25%), and required categories covered (15%).',
  // successionCriteria.ts educationScore.
  education:
    'Only a relevant degree above the minimum counts: one level above earns 60% of the weight, two or more earns all of it. An irrelevant degree scores 0 however high.',
  // successionCriteria.ts eligibilityScore.
  eligibility:
    'Points from every unexpired eligibility, divided by the points HR set for full marks. Expired or unconfigured ones count nothing.',
};

/** What a candidate would have to do to take this criterion to its weight. */
const CRITERION_MAX: Record<string, string> = {
  ipcr: 'A 5.00 IPCR rating.',
  experience: 'Service of at least twice the position’s minimum, and a salary grade at or near the target’s.',
  training: 'Meet the required hours, finish a training within the last 12 months, and cover every required category.',
  education: 'A relevant degree two levels above the minimum.',
  eligibility: 'Unexpired eligibilities whose configured points reach the full-marks figure.',
};

/**
 * Read this candidate's own figure back in words.
 *
 * The "how" column is the same for everyone; this column is the only one that
 * answers "why did *he* get that", which is the question an admin opens the
 * panel to ask. It is derived from the figure and the inputs already on the
 * row — nothing here re-scores anyone.
 */
const criterionMeaning = (
  c: { key: string; value: number; max: number },
  row: Pick<OcboRow, 'experienceParts' | 'eligibility'>,
): string => {
  const share = c.max > 0 ? c.value / c.max : 0;
  const pct = Math.round(share * 100);
  if (c.key === 'ipcr') {
    return c.value <= 0
      ? 'No completed IPCR on file.'
      : `An IPCR rating of about ${(share * 5).toFixed(2)} out of 5.`;
  }
  if (c.key === 'experience') {
    const missing = row.experienceParts.filter((part) => part.ratio == null).map((part) => part.label);
    const earned = `${pct}% of the weight earned.`;
    return missing.length
      ? `${earned} ${missing.join(' and ')} could not be assessed, so the rest carried the weight.`
      : earned;
  }
  if (c.key === 'education') {
    return c.value <= 0
      ? 'Only the minimum degree, or a degree outside the field.'
      : `${pct}% of the weight: a relevant degree above the minimum.`;
  }
  if (c.key === 'eligibility') {
    return `${row.eligibility.rawPoints} of the ${row.eligibility.pointsForFullMarks} points needed for full marks.`;
  }
  return `${pct}% of the weight earned.`;
};

const CRITERIA_COLUMNS = [
  { key: 'ipcr', label: 'Performance', weight: RANKING_WEIGHTS.ipcr },
  { key: 'experience', label: 'Experience', weight: RANKING_WEIGHTS.experience },
  { key: 'training', label: 'Training', weight: RANKING_WEIGHTS.training },
  { key: 'education', label: 'Education', weight: RANKING_WEIGHTS.education },
  { key: 'eligibility', label: 'Eligibility', weight: RANKING_WEIGHTS.eligibility },
] as const;

/**
 * Apply a column sort on top of the model's ranking.
 *
 * Re-sorting is for analysis; it does not renumber anyone. Rank is assigned by
 * total score before this runs and travels with the row, so a table sorted by
 * Tenure still shows who actually ranks first.
 */
const applySort = (rows: OcboRow[], sort: { key: string; dir: 'asc' | 'desc' } | undefined): OcboRow[] => {
  if (!sort) return rows;
  const valueOf = (r: OcboRow) =>
    sort.key === 'total' ? r.score : (r.criteria.find((c) => c.key === sort.key)?.value ?? 0);
  return [...rows].sort((a, b) => {
    const diff = valueOf(b) - valueOf(a);
    const ordered = sort.dir === 'desc' ? diff : -diff;
    // Stable and explainable when a column ties: fall back to the ranking.
    return ordered !== 0 ? ordered : a.rank - b.rank;
  });
};

const ocboStatusTone = (s: string): string => {
  if (s === 'Ready Now') return 'bg-green-100 text-green-700';
  if (s === 'Ready in 1–2 Years') return 'bg-blue-100 text-blue-700';
  if (s === 'Developmental') return 'bg-amber-100 text-amber-700';
  if (s.startsWith('Incomplete')) return 'bg-slate-200 text-slate-600';
  return 'bg-red-100 text-red-700'; // Not Qualified
};

/**
 * The succession pool: only candidates who clear all four minimum requirements.
 *
 * Specification section A treats the qualifications as a filter — meet all four
 * and you enter the pool, fail one and you do not. Listing gate-failures here
 * alongside qualified candidates made the table a roster of everyone in the
 * office rather than a shortlist, and put names in front of HR that the model
 * had already ruled out.
 *
 * res.notQualified is still returned by the API and is not discarded; it is
 * counted beside the position so the exclusions remain visible.
 */
const buildOcboRows = (res: AutoSuccessorsResult | undefined): OcboRow[] => {
  if (!res) return [];
  // res.qualified arrives sorted by weighted score, so index is the rank.
  return res.qualified.map((c, i) => ({
    employeeId: c.employeeId,
    name: c.employeeName,
    presentPosition: c.currentPosition,
    department: c.department,
    rank: i + 1,
    score: c.readiness.total,
    // Ordered as specification B lists them.
    criteria: [
      { key: 'ipcr', label: 'Performance', value: c.readiness.ipcr, max: c.readiness.ipcrMax },
      { key: 'experience', label: 'Experience', value: c.readiness.experience, max: c.readiness.experienceMax },
      { key: 'training', label: 'Training', value: c.readiness.training, max: c.readiness.trainingMax },
      { key: 'education', label: 'Education', value: c.readiness.education, max: c.readiness.educationMax },
      { key: 'eligibility', label: 'Eligibility', value: c.readiness.eligibility, max: c.readiness.eligibilityMax },
    ],
    experienceParts: c.readiness.experienceParts,
    eligibility: c.readiness.eligibilityDetail,
    status: c.readiness.tier ?? 'Developmental',
    statusTone: ocboStatusTone(c.readiness.tier ?? 'Developmental'),
    gapAnalysis: c.gapAnalysis,
    requiredActions: c.requiredActions,
    timeline: c.timeline,
  }));
};

/** DOM id of a position block, the target of ?dept=…&position=… from the RSP dashboard. */
const positionAnchor = (positionId: string) => `succession-position-${positionId}`;
/** How long a deep-linked position stays highlighted after it scrolls into view. */
const DEEP_LINK_HIGHLIGHT_MS = 2400;

/** Column header, same as the L&D Training needs assessment table. */
const TH = 'px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500';

/** Department row status: a vacancy needs attention; otherwise filled or nothing flagged. */
const departmentStatus = (dept: DepartmentSummary): { label: string; tone: string } => {
  if (dept.vacantCriticalCount > 0) {
    return { label: `${dept.vacantCriticalCount} vacant`, tone: 'bg-amber-100 text-amber-700' };
  }
  if (dept.criticalPositionCount > 0) return { label: 'All filled', tone: 'bg-green-100 text-green-700' };
  return { label: 'No critical positions', tone: 'bg-slate-100 text-slate-700' };
};

const OcboTableView = (_props: { admin: string }) => {
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const departmentsLoad = useTableLoading(loading, departments.length > 0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [posByDept, setPosByDept] = useState<Record<string, CriticalPosition[]>>({});
  const [candByPos, setCandByPos] = useState<Record<string, AutoSuccessorsResult>>({});
  // Per-candidate remarks were dropped from this table. getCandidateRemarks and
  // saveCandidateRemark are left in the API, and succession_candidate_remarks
  // keeps whatever was already written, so the column can come back without
  // anything having been lost.
  // Per-position sort override. Absent means the default: total score
  // descending, which is the ranking the model produced.
  const [sortBy, setSortBy] = useState<Record<string, { key: string; dir: 'asc' | 'desc' }>>({});
  const toggleSort = (positionId: string, key: string) => {
    setSortBy((prev) => {
      const cur = prev[positionId];
      // Numeric columns are most useful highest-first, so start there and
      // toggle to ascending on a second click.
      const dir: 'asc' | 'desc' = cur?.key === key && cur.dir === 'desc' ? 'asc' : 'desc';
      return { ...prev, [positionId]: { key, dir } };
    });
  };
  const sortIndicator = (positionId: string, key: string) => {
    const cur = sortBy[positionId];
    if (!cur || cur.key !== key) return '';
    return cur.dir === 'desc' ? ' ↓' : ' ↑';
  };

  // Which candidates have their detail open, keyed position:employee. A Set
  // rather than one id at a time because the point is comparing several.
  const [openDetail, setOpenDetail] = useState<Set<string>>(() => new Set());
  const toggleDetail = (positionId: string, employeeId: string) => {
    const key = `${positionId}:${employeeId}`;
    setOpenDetail((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const [loadingDept, setLoadingDept] = useState<Record<string, boolean>>({});
  // Failed reads, kept apart from "none" so the plan never states something false.
  const [deptError, setDeptError] = useState<unknown>(null);
  const [positionsFailed, setPositionsFailed] = useState<Record<string, boolean>>({});
  const [candidatesFailed, setCandidatesFailed] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const [modelByPos, setModelByPos] = useState<Record<string, 'v1' | 'v2'>>({});
  const [poolV2ByPos, setPoolV2ByPos] = useState<Record<string, SuccessionPoolV2>>({});
  const [loadingV2ByPos, setLoadingV2ByPos] = useState<Record<string, boolean>>({});
  const [errorV2ByPos, setErrorV2ByPos] = useState<Record<string, string | null>>({});
  const [reviewTarget, setReviewTarget] = useState<{
    candidate: { employeeId: string; name: string };
    position: { id: string; title: string; requirements: PositionRequirementsV2 };
  } | null>(null);

  const loadPoolV2 = async (posId: string) => {
    setLoadingV2ByPos((prev) => ({ ...prev, [posId]: true }));
    setErrorV2ByPos((prev) => ({ ...prev, [posId]: null }));
    try {
      const pool = await fetchSuccessionPoolV2(posId);
      setPoolV2ByPos((prev) => ({ ...prev, [posId]: pool }));
    } catch (err) {
      console.error('Failed to load V2 succession pool:', err);
      setErrorV2ByPos((prev) => ({ ...prev, [posId]: err instanceof Error ? err.message : 'Failed to load V2 succession pool.' }));
    } finally {
      setLoadingV2ByPos((prev) => ({ ...prev, [posId]: false }));
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
    setPosByDept((p) => ({ ...p, [deptId]: positions }));
    const candidateResults = await listAutoSuccessorsForPositions(positions.map((pos) => pos.id));
    setCandByPos((prev) => {
      const next = { ...prev };
      for (const pos of positions) {
        const cr = candidateResults.get(pos.id);
        if (cr?.ok) next[pos.id] = cr.data;
      }
      return next;
    });
    // A position with no ok result failed to load; say so instead of "no candidates".
    setCandidatesFailed((prev) => {
      const next = { ...prev };
      for (const pos of positions) next[pos.id] = !candidateResults.get(pos.id)?.ok;
      return next;
    });
    setLoadingDept((p) => ({ ...p, [deptId]: false }));
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
    // Not cleared on re-run: a later posByDept change must not strand the highlight.
    highlightTimer.current = window.setTimeout(() => setHighlighted(null), DEEP_LINK_HIGHLIGHT_MS);
  }, [deepLink, posByDept]);
  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const openArchive = (r: OcboRow) => {
    const params = new URLSearchParams({ module: 'archive', employee: r.employeeId });
    if (r.department) params.set('office', r.department);
    navigate(`/admin/lnd?${params.toString()}`);
  };

  const fmtLeaving = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null;

  return (
    <div className="space-y-3">
      <p className="!mb-0 text-xs text-[var(--text-secondary)]">
        Official succession-plan view. Only employees who meet <strong>all four</strong> minimum requirements —
        Education, Eligibility, Experience and Training — appear here; anyone failing one is filtered out and
        counted beside the position. Those who qualify are ranked by <strong>Total Score</strong>, highest first;
        where two candidates tie, the higher Performance score ranks first. Each criterion column shows that
        candidate&rsquo;s contribution against its weight — this is a comparison between candidates for one
        position, not progress toward a target. Column headers re-sort for analysis without changing anyone&rsquo;s
        rank. Click a name for the full breakdown, gap analysis and required actions — several can be open at once.
      </p>
      {/* Same table pattern as L&D > Training needs assessment: one row per
          department, a chevron, and the row opens a panel with every critical
          position and its ranked candidates (mockup option B,
          docs/mockups/2026-10-07-succession-table.html). */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="abyan-table-wrap">
        <table className="abyan-table w-full min-w-[21rem]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className={TH}>Department</th>
              <th className={TH}>Critical positions</th>
              <th className={TH}>Vacant</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody className={tableBodyClass(false)}>
      {departmentsLoad.initialLoading && (
        <TableSkeletonRows show={departmentsLoad.showSkeleton} columns={['text', 'text', 'text', 'badge']} label="Loading succession plan…" />
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
              onClick={() => toggle(dept.departmentId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggle(dept.departmentId);
                }
              }}
              tabIndex={0}
              aria-expanded={open}
              className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#363EE8]"
            >
              <td className="px-5 py-4">
                <span className="flex items-center gap-2">
                  {open
                    ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                  <span className="text-sm font-semibold text-slate-900">{dept.departmentName}</span>
                  {!dept.isActive && (
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Inactive</span>
                  )}
                </span>
              </td>
              <td className="px-5 py-4 text-sm text-slate-700">{dept.criticalPositionCount}</td>
              <td className="px-5 py-4 text-sm text-slate-700">{dept.vacantCriticalCount}</td>
              <td className="px-5 py-4">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${status.tone}`}>{status.label}</span>
              </td>
            </tr>

            {open && (
              /* The drill-down was bg-slate-50/60, barely off white, so the
                 successor list ran straight into the next office's row. A
                 darker fill, hard rules top and bottom and an inset shadow mark
                 it as belonging to the office above it, and the white cards
                 inside now have something to sit on. */
              <tr className="last:border-0">
              <td colSpan={4} className="border-y-2 border-slate-300 bg-slate-100 px-5 py-5 shadow-inner">
                {loadingDept[dept.departmentId] && <SkeletonList show rows={3} label="Loading positions…" />}
                {!loadingDept[dept.departmentId] && positionsFailed[dept.departmentId] && (
                  <p role="alert" className="text-sm font-medium text-[var(--error-700)]">
                    We couldn't load this office's critical positions, so none are shown. Collapse the office and open it again to retry.
                  </p>
                )}
                {!loadingDept[dept.departmentId] && !positionsFailed[dept.departmentId] && positions.length === 0 && (
                  <p className="text-sm text-[var(--text-secondary)]">No critical positions flagged for this office.</p>
                )}
                {positions.map((pos) => {
                  const rows = applySort(buildOcboRows(candByPos[pos.id]), sortBy[pos.id]);
                  const leaving = fmtLeaving(pos.incumbentLeavingDate);
                  // Section C excludes candidates already in a higher-ranked
                  // position. Shown as a count so "why isn't X listed?" has an
                  // answer instead of them vanishing from the pipeline.
                  const downward = candByPos[pos.id]?.downwardMovesExcluded ?? 0;
                  // Gate-failures no longer appear as rows, so their count is
                  // shown instead — the shortlist stays a shortlist without HR
                  // losing sight of how many people were considered.
                  const filtered = candByPos[pos.id]?.notQualified.length ?? 0;
                  return (
                    <div
                      key={pos.id}
                      id={positionAnchor(pos.id)}
                      className={`-mx-2 mb-5 rounded-xl px-2 py-1 transition-[background-color,box-shadow] duration-200 ease-out last:mb-0 ${
                        highlighted === pos.id ? 'bg-[var(--color-primary-50)] ring-2 ring-[var(--color-primary)]' : ''
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                          <span className="text-sm font-semibold text-slate-900">{pos.title}</span>
                          <span className="text-xs text-slate-500">
                            Held by: {pos.incumbentName ?? <em className="text-slate-400">Vacant</em>}
                            {leaving ? ` · leaving ${leaving}` : ''}
                            {filtered > 0
                              ? ` · ${filtered} did not meet the minimum requirements`
                              : ''}
                            {downward > 0
                              ? ` · ${downward} excluded as downward move${downward === 1 ? '' : 's'}`
                              : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => setModelByPos((prev) => ({ ...prev, [pos.id]: 'v1' }))}
                            className={`rounded-md px-2.5 py-1 transition-colors ${
                              (modelByPos[pos.id] ?? 'v1') === 'v1'
                                ? 'bg-white text-slate-800 shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Legacy Model (V1)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModelByPos((prev) => ({ ...prev, [pos.id]: 'v2' }));
                              if (!poolV2ByPos[pos.id]) void loadPoolV2(pos.id);
                            }}
                            className={`rounded-md px-2.5 py-1 transition-colors ${
                              modelByPos[pos.id] === 'v2'
                                ? 'bg-[var(--p,#363EE8)] text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Reviewed Scoring (V2)
                          </button>
                        </div>
                      </div>
                      {modelByPos[pos.id] === 'v2' ? (
                        loadingV2ByPos[pos.id] ? (
                          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                            Loading V2 scoring pool...
                          </div>
                        ) : errorV2ByPos[pos.id] ? (
                          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center text-xs text-red-600">
                            <p>Failed to load V2 pool: {errorV2ByPos[pos.id]}</p>
                            <button
                              type="button"
                              onClick={() => void loadPoolV2(pos.id)}
                              className="btn btn-sm btn-secondary"
                            >
                              Retry
                            </button>
                          </div>
                        ) : poolV2ByPos[pos.id] ? (
                          (() => {
                            const pool = poolV2ByPos[pos.id];
                            return (
                              <div className="space-y-4">
                                {pool.configurationNeeded.length > 0 && (
                                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                                    <strong>Position Requirements Incomplete:</strong> Position experience or training minimums must be configured to finalize candidate ranks.
                                  </div>
                                )}

                                {/* Ranked Candidates Table */}
                                <div className="abyan-table-wrap">
                                  <table className="abyan-table w-full min-w-[900px]">
                                    <thead>
                                      <tr className="border-b border-slate-200 bg-white text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                        <th className="px-3 py-2.5 text-center">Rank</th>
                                        <th className="px-3 py-2.5">Candidate</th>
                                        <th className="px-3 py-2 text-right">Performance (30%)</th>
                                        <th className="px-3 py-2 text-right">Experience (20%)</th>
                                        <th className="px-3 py-2 text-right">Training (20%)</th>
                                        <th className="px-3 py-2 text-right">Education (15%)</th>
                                        <th className="px-3 py-2 text-right">Eligibility (15%)</th>
                                        <th className="px-3 py-2 text-right">Total Score</th>
                                        <th className="px-3 py-2">Readiness</th>
                                        <th className="px-3 py-2 text-center">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {pool.ranked.length === 0 ? (
                                        <tr>
                                          <td colSpan={10} className="px-3 py-4 text-center text-slate-400">
                                            No candidates currently meet all minimum qualifications.
                                          </td>
                                        </tr>
                                      ) : (
                                        pool.ranked.map((r) => {
                                          const tone =
                                            r.readiness === 'Ready Now'
                                              ? 'bg-emerald-50 text-emerald-700'
                                              : r.readiness === 'Ready in 1–2 Years'
                                              ? 'bg-blue-50 text-blue-700'
                                              : 'bg-amber-50 text-amber-700';
                                          return (
                                            <tr key={r.candidate.employeeId} className="hover:bg-slate-50/50">
                                              <td className="px-3 py-2 text-center">
                                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold tabular-nums text-slate-700">
                                                  {r.rank}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 font-medium text-slate-800">
                                                {r.candidate.name}
                                              </td>
                                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                                {r.contributions.performance.toFixed(1)} / 30
                                              </td>
                                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                                {r.contributions.experience.toFixed(1)} / 20
                                              </td>
                                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                                {r.contributions.training.toFixed(1)} / 20
                                              </td>
                                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                                {r.contributions.education.toFixed(1)} / 15
                                              </td>
                                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                                {r.contributions.eligibility.toFixed(1)} / 15
                                              </td>
                                              <td className="px-3 py-2 text-right">
                                                <span className="font-bold tabular-nums text-slate-900">
                                                  {r.total.toFixed(1)}
                                                </span>
                                                <span className="text-[10px] text-slate-400"> / 100</span>
                                              </td>
                                              <td className="px-3 py-2">
                                                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>
                                                  {r.readiness ?? 'Unrated'}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 text-center">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setReviewTarget({
                                                      candidate: r.candidate,
                                                      position: { id: pos.id, title: pos.title, requirements: pool.requirements },
                                                    })
                                                  }
                                                  className="text-xs font-semibold text-[var(--p,#363EE8)] hover:underline"
                                                >
                                                  Review Evidence
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })
                                      )}
                                    </tbody>
                                  </table>
                                </div>

                                {/* Needs Evidence Review */}
                                {pool.needsReview.length > 0 && (
                                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                                    <div className="mb-3 flex items-center justify-between">
                                      <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                                        Needs Evidence Review ({pool.needsReview.length} candidates)
                                      </h4>
                                      <span className="text-[11px] text-amber-700">
                                        Evidence must be reviewed before final ranking
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                      {pool.needsReview.map((nr) => (
                                        <div
                                          key={nr.candidate.employeeId}
                                          className="flex items-center justify-between rounded-lg border border-amber-200 bg-white p-3 shadow-xs"
                                        >
                                          <div>
                                            <div className="text-xs font-bold text-slate-800">{nr.candidate.name}</div>
                                            <div className="text-[10px] text-amber-700">
                                              {nr.reasonCodes.length} review item(s) pending
                                            </div>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setReviewTarget({
                                                candidate: nr.candidate,
                                                position: { id: pos.id, title: pos.title, requirements: pool.requirements },
                                              })
                                            }
                                            className="rounded-md bg-[var(--p,#363EE8)] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[var(--p7,#191FA8)]"
                                          >
                                            Review
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {pool.excluded.length > 0 && (
                                  <div className="text-xs text-slate-500">
                                    &bull; {pool.excluded.length} candidate(s) did not meet minimum qualification requirements.
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        ) : null
                      ) : (
                        <div className="abyan-table-wrap">
                        <table className="abyan-table w-full min-w-[900px]">
                          <thead>
                            <tr className="border-b border-slate-200 bg-white text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                              <th className="px-3 py-2.5 text-center">Rank</th>
                              <th className="px-3 py-2.5">Candidate / Present Position</th>
                              {CRITERIA_COLUMNS.map((c) => (
                                <th key={c.key} className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => toggleSort(pos.id, c.key)}
                                    className="font-semibold uppercase tracking-wide hover:text-[var(--text-primary)]"
                                    title={`Sort by ${c.label}`}
                                  >
                                    {c.label} ({c.weight}%){sortIndicator(pos.id, c.key)}
                                  </button>
                                </th>
                              ))}
                              <th className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => toggleSort(pos.id, 'total')}
                                  className="font-bold uppercase tracking-wide text-[var(--text-primary)]"
                                  title="Sort by total score"
                                >
                                  Total Score{sortIndicator(pos.id, 'total')}
                                </button>
                              </th>
                              <th className="px-3 py-2">Readiness</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {rows.length === 0 && (
                              candidatesFailed[pos.id] ? (
                                <tr><td colSpan={9} role="alert" className="px-3 py-4 text-center font-medium text-[var(--error-700)]">We couldn't load the candidates for this position, so none are shown. Reload the page to try again.</td></tr>
                              ) : (
                                <tr><td colSpan={9} className="px-3 py-4 text-center text-slate-400">No employee meets all four minimum requirements for this position.</td></tr>
                              )
                            )}
                            {rows.map((r) => {
                              const detailOpen = openDetail.has(`${pos.id}:${r.employeeId}`);
                              return (
                                <Fragment key={r.employeeId}>
                                  <tr className={`align-top hover:bg-slate-50/50 ${detailOpen ? 'bg-slate-50' : ''}`}>
                                    <td className="px-3 py-2 text-center">
                                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold tabular-nums text-slate-700">
                                        {r.rank}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleDetail(pos.id, r.employeeId)}
                                        aria-expanded={detailOpen}
                                        title={detailOpen ? 'Hide score breakdown' : 'Show score breakdown, gap analysis and required actions'}
                                        className="flex items-start gap-1 text-left font-medium text-blue-600 hover:underline"
                                      >
                                        <span className={`mt-[3px] inline-block text-[9px] transition-transform ${detailOpen ? 'rotate-90' : ''}`}>&#9654;</span>
                                        {r.name}
                                      </button>
                                      <div className="pl-[14px] text-[10px] text-slate-400">{r.presentPosition ?? '—'}</div>
                                    </td>
                                    {r.criteria.map((c) => (
                                      <td key={c.key} className="px-3 py-2 text-right tabular-nums text-slate-700">
                                        {/* Always a number, never blank: an absent record must
                                            read as 0, not as a rendering fault. */}
                                        {c.value.toFixed(1)}
                                        <span className="ml-0.5 text-[9px] text-slate-400">/{c.max}</span>
                                      </td>
                                    ))}
                                    <td className="px-3 py-2 text-right">
                                      <span className="text-[13px] font-bold tabular-nums text-slate-900">
                                        {r.score.toFixed(1)}
                                      </span>
                                      <span className="text-[9px] text-slate-400"> / 100</span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${r.statusTone}`}>{r.status}</span>
                                    </td>
                                  </tr>
                                  {detailOpen && (
                                    <tr className="bg-slate-50">
                                      <td colSpan={9} className="px-3 pb-3 pt-0">
                                        <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
                                          {/* Specification B's five criteria, each showing what it
                                              contributed out of its weight — so a rank can be
                                              explained rather than just asserted. */}
                                          <div className="sm:col-span-2">
                                            <p className="!mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                              Score breakdown &mdash; {r.score.toFixed(1)} / 100
                                            </p>
                                            {/* A table, not a list of lines: the four things an
                                                admin asks of a figure — the rule, the number,
                                                what it says about this candidate, and what would
                                                raise it — line up column by column, so two
                                                criteria can be compared by reading down. */}
                                            <div className="overflow-x-auto rounded-lg border border-slate-200">
                                              <table className="w-full border-collapse text-left">
                                                <thead>
                                                  <tr className="bg-slate-100 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                                                    <th scope="col" className="px-2 py-1.5">Criterion</th>
                                                    <th scope="col" className="px-2 py-1.5">How it is scored</th>
                                                    <th scope="col" className="px-2 py-1.5 text-right">Score</th>
                                                    <th scope="col" className="px-2 py-1.5">What this score means</th>
                                                    <th scope="col" className="px-2 py-1.5">To reach the maximum</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {r.criteria.map((c) => (
                                                    <tr key={c.key} className="border-t border-slate-100 align-top">
                                                      <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-semibold text-slate-700">
                                                        {c.label}
                                                        <span className="ml-1 font-normal text-slate-400">({c.max})</span>
                                                      </th>
                                                      <td className="px-2 py-1.5 text-[10px] leading-snug text-slate-500">
                                                        {CRITERION_HOW[c.key]}
                                                      </td>
                                                      {/* Always a number, never blank: an absent
                                                          record must read as 0, not as a
                                                          rendering fault. */}
                                                      <td className="whitespace-nowrap px-2 py-1.5 text-right text-[11px] tabular-nums text-slate-700">
                                                        <strong className="font-semibold">{c.value.toFixed(1)}</strong>
                                                        <span className="text-slate-400"> / {c.max}</span>
                                                      </td>
                                                      <td className="px-2 py-1.5 text-[10px] leading-snug text-slate-600">
                                                        {criterionMeaning(c, r)}
                                                      </td>
                                                      <td className="px-2 py-1.5 text-[10px] leading-snug text-slate-500">
                                                        {CRITERION_MAX[c.key]}
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                            {/* How the Experience figure above was arrived at.
                                                Every input is listed, including those with no
                                                data, so the reader sees what could not be
                                                assessed rather than a narrower judgement
                                                presented as a whole one. */}
                                            <p className="!mb-1 mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                              How Experience was scored
                                            </p>
                                            <ul className="!mb-0 space-y-0.5">
                                              {r.experienceParts.map((part) => (
                                                <li key={part.label} className="flex flex-wrap items-baseline gap-x-2 text-[10px]">
                                                  <span className={part.ratio == null ? 'text-slate-400' : 'text-slate-700'}>
                                                    {part.label}
                                                  </span>
                                                  <span className={part.ratio == null ? 'font-semibold text-amber-700' : 'font-semibold tabular-nums text-slate-700'}>
                                                    {part.ratio == null ? 'not assessed' : `${Math.round(part.ratio * 100)}%`}
                                                  </span>
                                                  {part.ratio != null && part.weight > 0 && (
                                                    <span className="text-slate-400">weight {Math.round(part.weight * 100)}%</span>
                                                  )}
                                                  <span className="text-slate-400">· {part.detail}</span>
                                                </li>
                                              ))}
                                            </ul>

                                            {/* Which eligibilities produced the score. A capped
                                                sum is unreadable without its parts: two
                                                candidates on the same number may hold entirely
                                                different credentials. */}
                                            <p className="!mb-1 mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                              How Eligibility was scored
                                            </p>
                                            <ul className="!mb-0 space-y-0.5">
                                              {r.eligibility.counted.map((c) => (
                                                <li key={c.type} className="flex flex-wrap items-baseline gap-x-2 text-[10px]">
                                                  <span className="text-slate-700">{c.type}</span>
                                                  <span className="font-semibold tabular-nums text-slate-700">{c.points} pts</span>
                                                </li>
                                              ))}
                                              {r.eligibility.counted.length === 0 && (
                                                <li className="text-[10px] text-slate-400">No valid eligibility counted.</li>
                                              )}
                                              {r.eligibility.expired.map((t) => (
                                                <li key={`x-${t}`} className="flex flex-wrap items-baseline gap-x-2 text-[10px]">
                                                  <span className="text-slate-400">{t}</span>
                                                  <span className="font-semibold text-amber-700">expired</span>
                                                </li>
                                              ))}
                                              {/* Not "worth nothing" — nobody has configured it. */}
                                              {r.eligibility.unconfigured.map((t) => (
                                                <li key={`u-${t}`} className="flex flex-wrap items-baseline gap-x-2 text-[10px]">
                                                  <span className="text-slate-400">{t}</span>
                                                  <span className="font-semibold text-amber-700">no points configured</span>
                                                </li>
                                              ))}
                                              <li className="pt-0.5 text-[10px] text-slate-400">
                                                {r.eligibility.rawPoints} of {r.eligibility.pointsForFullMarks} points for full marks
                                              </li>
                                            </ul>
                                          </div>
                                          <div>
                                            <p className="!mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Gap Analysis</p>
                                            {r.gapAnalysis.length ? (
                                              <ul className="!mb-0 list-disc space-y-0.5 pl-4 text-[11px] text-slate-700">
                                                {r.gapAnalysis.map((g, i) => <li key={i}>{g}</li>)}
                                              </ul>
                                            ) : (
                                              <p className="!mb-0 text-[11px] text-slate-400">No gaps recorded.</p>
                                            )}
                                          </div>
                                          <div>
                                            <p className="!mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Required Actions</p>
                                            {r.requiredActions.length ? (
                                              <ul className="!mb-0 list-disc space-y-0.5 pl-4 text-[11px] text-slate-700">
                                                {r.requiredActions.map((a, i) => <li key={i}>{a}</li>)}
                                              </ul>
                                            ) : (
                                              <p className="!mb-0 text-[11px] text-slate-400">No actions required.</p>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 sm:col-span-2">
                                            <span className="text-[10px] text-slate-500">
                                              {r.timeline ? `Estimated timeline: ${r.timeline}` : 'No timeline estimate.'}
                                            </span>
                                            {/* The name used to open this. It toggles now, so the
                                                archive gets its own control rather than vanishing. */}
                                            <button
                                              type="button"
                                              onClick={() => openArchive(r)}
                                              className="text-[11px] font-semibold text-blue-600 hover:underline"
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
                            })}
                          </tbody>
                        </table>
                      </div>
                      )}
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
