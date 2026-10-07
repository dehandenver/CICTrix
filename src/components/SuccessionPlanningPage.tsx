import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdminEmail } from '../lib/adminSession';
import { Building2, ChevronRight, ChevronDown } from 'lucide-react';
import {
  listDepartmentSummaries,
  listCriticalPositions,
  listAutoSuccessors,
  type DepartmentSummary,
  type CriticalPosition,
  type AutoSuccessorsResult,
  type ExperiencePart,
} from '../lib/api/succession';
import { RANKING_WEIGHTS, type EligibilityScore } from '../lib/api/successionCriteria';

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
const CRITERIA_COLUMNS = [
  { key: 'ipcr', label: 'Performance', weight: RANKING_WEIGHTS.ipcr },
  { key: 'experience', label: 'Experience + Tenure', weight: RANKING_WEIGHTS.experience },
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
      { key: 'experience', label: 'Experience + Tenure', value: c.readiness.experience, max: c.readiness.experienceMax },
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

const OcboTableView = ({ admin }: { admin: string }) => {
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
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
  const navigate = useNavigate();

  useEffect(() => {
    listDepartmentSummaries().then((r) => {
      if (r.ok) setDepartments(r.data);
      setLoading(false);
    });
  }, []);

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
    const positions = pr.ok ? pr.data : [];
    setPosByDept((p) => ({ ...p, [deptId]: positions }));
    await Promise.all(
      positions.map(async (pos) => {
        const cr = await listAutoSuccessors(pos.id);
        if (cr.ok) setCandByPos((p) => ({ ...p, [pos.id]: cr.data }));
      }),
    );
    setLoadingDept((p) => ({ ...p, [deptId]: false }));
  };

  const openArchive = (r: OcboRow) => {
    const params = new URLSearchParams({ module: 'archive', employee: r.employeeId });
    if (r.department) params.set('office', r.department);
    navigate(`/admin/lnd?${params.toString()}`);
  };

  const fmtLeaving = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null;

  if (loading) return <p className="text-sm text-[var(--text-secondary)]">Loading succession plan…</p>;

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
      {departments.map((dept) => {
        const open = expanded.has(dept.departmentId);
        const positions = posByDept[dept.departmentId] ?? [];
        return (
          <div key={dept.departmentId} className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-white">
            <button
              onClick={() => toggle(dept.departmentId)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60 ${open ? 'bg-slate-50/60' : ''}`}
            >
              {open ? <ChevronDown size={18} className="text-blue-600" /> : <ChevronRight size={18} className="text-[var(--text-muted)]" />}
              <span className="rounded-xl bg-blue-100 p-2 text-blue-600"><Building2 size={16} /></span>
              <span className="font-semibold text-[var(--text-primary)]">{dept.departmentName}</span>
              <span className="text-xs text-[var(--text-secondary)]">{dept.criticalPositionCount} critical position{dept.criticalPositionCount === 1 ? '' : 's'}</span>
            </button>

            {open && (
              <div className="border-t border-[var(--border-color)] p-4">
                {loadingDept[dept.departmentId] && <p className="text-sm text-[var(--text-secondary)]">Loading positions…</p>}
                {!loadingDept[dept.departmentId] && positions.length === 0 && (
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
                    <div key={pos.id} className="mb-5 last:mb-0">
                      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <span className="font-semibold text-[var(--text-primary)]">{pos.title}</span>
                        <span className="text-xs text-[var(--text-secondary)]">
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
                      <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
                        <table className="w-full min-w-[900px] border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-[var(--border-color)] bg-slate-50 text-left text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                              <th className="px-3 py-2 text-center">Rank</th>
                              <th className="px-3 py-2">Candidate / Present Position</th>
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
                              <tr><td colSpan={9} className="px-3 py-4 text-center text-slate-400">No employee meets all four minimum requirements for this position.</td></tr>
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
                                            {/* Numeric, not bars: the panel explains a ranking
                                                between candidates, and a fill would read as
                                                progress toward a target. */}
                                            <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
                                              {r.criteria.map((c) => (
                                                <div key={c.key} className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-0.5 last:border-0">
                                                  <span className="text-[11px] text-slate-600">{c.label}</span>
                                                  <span className="text-[11px] tabular-nums text-slate-700">
                                                    <strong className="font-semibold">{c.value.toFixed(1)}</strong>
                                                    <span className="text-slate-400"> / {c.max}</span>
                                                  </span>
                                                </div>
                                              ))}
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
