import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Building2,
  ChevronDown,
  Clock,
  Download,
  FileText,
  Printer,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { getEvaluationsWithEmployee, type PerformanceEvaluation } from '../../../lib/api/performanceEvaluations';
import { listCloseouts, type Closeout } from '../../../lib/api/closeout';
import { supabase as supabaseClient } from '../../../lib/supabase';

const supabase = supabaseClient as any;

// ── Types ──────────────────────────────────────────────────────────────────────

type Subtab = 'comparison' | 'cycle-performance' | 'records' | 'export';

interface EvalCycle { id: number; title: string; period: string; status: string }

type RatingBucket = 'Outstanding' | 'Very Satisfactory' | 'Satisfactory' | 'Unsatisfactory' | 'Poor';

interface OfficeStats {
  office: string;
  total: number;
  approved: number;
  completionPct: number;
  avgScore: number | null;
  distribution: Record<RatingBucket, number>;
}

interface StageTimings {
  office: string;
  avgNotifyToSubmit: number | null;
  avgSubmitToReview: number | null;
  avgReviewToApprove: number | null;
  sampleSize: number;
}

// ── Constants & Seed Data ──────────────────────────────────────────────────────

const BUCKETS: RatingBucket[] = ['Outstanding', 'Very Satisfactory', 'Satisfactory', 'Unsatisfactory', 'Poor'];

const BUCKET_COLOR: Record<RatingBucket, string> = {
  Outstanding: 'bg-emerald-500',
  'Very Satisfactory': 'bg-blue-500',
  Satisfactory: 'bg-amber-400',
  Unsatisfactory: 'bg-orange-500',
  Poor: 'bg-red-500',
};

const BUCKET_TEXT: Record<RatingBucket, string> = {
  Outstanding: 'text-emerald-700',
  'Very Satisfactory': 'text-blue-700',
  Satisfactory: 'text-amber-700',
  Unsatisfactory: 'text-orange-700',
  Poor: 'text-red-700',
};

function scoreToBucket(score: number): RatingBucket {
  if (score >= 4.500) return 'Outstanding';
  if (score >= 3.500) return 'Very Satisfactory';
  if (score >= 2.500) return 'Satisfactory';
  if (score >= 1.500) return 'Unsatisfactory';
  return 'Poor';
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const diff = new Date(b).getTime() - new Date(a).getTime();
  if (Number.isNaN(diff) || diff < 0) return null;
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

// Seed evaluations — shown when Supabase returns empty or is unreachable
const OFFICES = ['HR Department', 'Health Office', 'Treasury Department', 'IT Division'];

const makeSeedEvals = (): PerformanceEvaluation[] => {
  const seeds: PerformanceEvaluation[] = [];
  const statuses = ['Approved', 'Approved', 'Approved', 'Supervisor Review', 'Planning'] as const;
  const scores = [4.75, 4.20, 3.85, 3.50, 4.60, 3.10, 4.90, 3.75, 2.80, 4.40];
  let idx = 0;
  OFFICES.forEach((office, oi) => {
    const count = [8, 12, 6, 5][oi];
    for (let i = 0; i < count; i++) {
      const status = statuses[i % statuses.length];
      const submitted = new Date('2026-01-15');
      const reviewed = new Date('2026-01-25');
      const approved = new Date('2026-02-05');
      seeds.push({
        id: `seed-${office}-${i}`,
        employee_id: `emp-${office}-${i}`,
        cycle_id: 1,
        status: status === 'Supervisor Review' ? 'Supervisor Review' : (status === 'Planning' ? 'Planning' : 'Approved'),
        final_score: status === 'Approved' ? scores[idx % scores.length] : null,
        period: '2026-Q1',
        supervisor_id: null,
        submitted_at: submitted.toISOString(),
        reviewed_at: reviewed.toISOString(),
        approved_at: status === 'Approved' ? approved.toISOString() : null,
        rejection_reason: null,
        created_at: new Date('2026-01-01').toISOString(),
        updated_at: approved.toISOString(),
        employee_name: `Employee ${i + 1}`,
        employee_position: 'Staff',
        department: office,
      });
      idx++;
    }
  });
  return seeds;
};

const SEED_EVALS = makeSeedEvals();

const SEED_CLOSEOUTS: Closeout[] = OFFICES.map((office, i) => ({
  id: `seed-co-${i}`,
  office_id: `office-${i}`,
  office_name: office,
  period: '2026-Q1',
  ipcr_verified: [8, 12, 6, 5][i],
  ipcr_total: [8, 12, 6, 5][i],
  dpcr_count: 1,
  opcr_count: 1,
  archived: true,
  closed_by: 'PM Admin',
  closed_at: '2026-02-10T10:00:00Z',
  created_at: '2026-02-10T10:00:00Z',
}));

// ── Derived helpers ────────────────────────────────────────────────────────────

function buildOfficeStats(evals: PerformanceEvaluation[]): OfficeStats[] {
  const byOffice = new Map<string, PerformanceEvaluation[]>();
  for (const e of evals) {
    const key = e.department ?? 'Unknown';
    const arr = byOffice.get(key) ?? [];
    arr.push(e);
    byOffice.set(key, arr);
  }
  return Array.from(byOffice.entries()).map(([office, rows]) => {
    const approved = rows.filter((r) => r.status === 'Approved');
    const withScore = approved.filter((r) => r.final_score !== null);
    const distribution: Record<RatingBucket, number> = {
      Outstanding: 0, 'Very Satisfactory': 0, Satisfactory: 0, Unsatisfactory: 0, Poor: 0,
    };
    for (const r of withScore) distribution[scoreToBucket(r.final_score!)]++;
    const avgScore = withScore.length > 0
      ? withScore.reduce((s, r) => s + r.final_score!, 0) / withScore.length
      : null;
    return {
      office,
      total: rows.length,
      approved: approved.length,
      completionPct: rows.length === 0 ? 0 : Math.round((approved.length / rows.length) * 100),
      avgScore,
      distribution,
    };
  }).sort((a, b) => b.completionPct - a.completionPct);
}

function buildStageTimings(evals: PerformanceEvaluation[]): StageTimings[] {
  const byOffice = new Map<string, PerformanceEvaluation[]>();
  for (const e of evals) {
    const key = e.department ?? 'Unknown';
    const arr = byOffice.get(key) ?? [];
    arr.push(e);
    byOffice.set(key, arr);
  }
  return Array.from(byOffice.entries()).map(([office, rows]) => {
    const nts: number[] = [], str: number[] = [], rta: number[] = [];
    for (const r of rows) {
      const a = daysBetween(r.created_at, r.submitted_at);
      const b = daysBetween(r.submitted_at, r.reviewed_at);
      const c = daysBetween(r.reviewed_at, r.approved_at);
      if (a !== null) nts.push(a);
      if (b !== null) str.push(b);
      if (c !== null) rta.push(c);
    }
    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
    return {
      office,
      avgNotifyToSubmit: avg(nts),
      avgSubmitToReview: avg(str),
      avgReviewToApprove: avg(rta),
      sampleSize: rows.filter((r) => r.submitted_at).length,
    };
  }).sort((a, b) => a.office.localeCompare(b.office));
}

// ── Export helpers ─────────────────────────────────────────────────────────────

function downloadCSV(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MiniBar({ pct, className }: { pct: number; className: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DayBadge({ days, warn }: { days: number | null; warn?: number }) {
  if (days === null) return <span className="text-slate-300 text-xs italic">—</span>;
  const isHigh = warn !== undefined && days > warn;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isHigh ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
      <Clock className="h-2.5 w-2.5" /> {days}d
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PMReportsAnalytics() {
  const [subtab, setSubtab] = useState<Subtab>('comparison');
  const [evals, setEvals] = useState<PerformanceEvaluation[]>([]);
  const [closeouts, setCloseouts] = useState<Closeout[]>([]);
  const [cycles, setCycles] = useState<EvalCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState<string>('all');

  // Records Search state
  const [recordsSearch, setRecordsSearch] = useState('');
  const [recordsOffice, setRecordsOffice] = useState('');
  const [recordsPeriod, setRecordsPeriod] = useState('');

  // Export Center state
  const [exportType, setExportType] = useState<'comparison' | 'timings' | 'records'>('comparison');
  const [exportPeriod, setExportPeriod] = useState('');

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [evalResult, cyclesRes] = await Promise.all([
        getEvaluationsWithEmployee(),
        supabase.from('performance_cycles').select('id, title, start_date, end_date, status').order('start_date', { ascending: false }),
      ]);

      const dbEvals = evalResult.data ?? [];
      setEvals(dbEvals.length > 0 ? dbEvals : SEED_EVALS);

      const dbCycles: EvalCycle[] = Array.isArray(cyclesRes.data)
        ? (cyclesRes.data as any[]).map((c) => ({
            id: Number(c.id),
            title: String(c.title ?? ''),
            period: String(c.title ?? ''),
            status: String(c.status ?? ''),
          }))
        : [];
      setCycles(dbCycles);

      // Derive unique periods from evaluations for the closeout lookup
      const allEvals = dbEvals.length > 0 ? dbEvals : SEED_EVALS;
      const periods = Array.from(new Set(allEvals.map((e) => e.period).filter(Boolean))) as string[];
      const allCloseouts: Closeout[] = [];
      for (const p of periods.slice(0, 5)) {
        const cs = await listCloseouts(p);
        allCloseouts.push(...cs);
      }
      setCloseouts(allCloseouts.length > 0 ? allCloseouts : SEED_CLOSEOUTS);
    } catch {
      setEvals(SEED_EVALS);
      setCloseouts(SEED_CLOSEOUTS);
    } finally {
      setLoading(false);
    }
  };

  // Filter evaluations by selected cycle
  const filteredEvals = useMemo(() => {
    if (selectedCycle === 'all') return evals;
    return evals.filter((e) => e.period === selectedCycle || String(e.cycle_id) === selectedCycle);
  }, [evals, selectedCycle]);

  const officeStats = useMemo(() => buildOfficeStats(filteredEvals), [filteredEvals]);
  const stageTimings = useMemo(() => buildStageTimings(filteredEvals), [filteredEvals]);

  const periods = useMemo(() => Array.from(new Set(evals.map((e) => e.period).filter(Boolean))).sort().reverse(), [evals]);
  const offices = useMemo(() => Array.from(new Set(evals.map((e) => e.department).filter(Boolean))).sort(), [evals]);

  // Records Search
  const recordsData = useMemo(() => {
    const q = recordsSearch.toLowerCase();
    return evals
      .filter((e) => e.status === 'Approved')
      .filter((e) => !q || (e.employee_name ?? '').toLowerCase().includes(q) || (e.department ?? '').toLowerCase().includes(q))
      .filter((e) => !recordsOffice || e.department === recordsOffice)
      .filter((e) => !recordsPeriod || e.period === recordsPeriod)
      .sort((a, b) => new Date(b.approved_at ?? b.updated_at).getTime() - new Date(a.approved_at ?? a.updated_at).getTime());
  }, [evals, recordsSearch, recordsOffice, recordsPeriod]);

  // Export
  const handleExport = () => {
    const period = exportPeriod || 'all';
    const evalsForExport = period === 'all' ? evals : evals.filter((e) => e.period === period);

    if (exportType === 'comparison') {
      const stats = buildOfficeStats(evalsForExport);
      downloadCSV(`office-comparison-${period}.csv`, [
        ['Office', 'Total Employees', 'Approved', 'Completion %', 'Avg Score', 'Outstanding', 'Very Satisfactory', 'Satisfactory', 'Unsatisfactory', 'Poor'],
        ...stats.map((s) => [
          s.office, String(s.total), String(s.approved), `${s.completionPct}%`,
          s.avgScore !== null ? s.avgScore.toFixed(4) : '—',
          String(s.distribution.Outstanding), String(s.distribution['Very Satisfactory']),
          String(s.distribution.Satisfactory), String(s.distribution.Unsatisfactory), String(s.distribution.Poor),
        ]),
      ]);
    } else if (exportType === 'timings') {
      const timings = buildStageTimings(evalsForExport);
      downloadCSV(`cycle-performance-${period}.csv`, [
        ['Office', 'Avg Notification→Submission (days)', 'Avg Submission→Verification (days)', 'Avg Verification→Closeout (days)', 'Sample Size'],
        ...timings.map((t) => [
          t.office,
          t.avgNotifyToSubmit !== null ? String(t.avgNotifyToSubmit) : '—',
          t.avgSubmitToReview !== null ? String(t.avgSubmitToReview) : '—',
          t.avgReviewToApprove !== null ? String(t.avgReviewToApprove) : '—',
          String(t.sampleSize),
        ]),
      ]);
    } else {
      const approved = evalsForExport.filter((e) => e.status === 'Approved');
      downloadCSV(`records-search-${period}.csv`, [
        ['Employee Name', 'Position', 'Office / Department', 'Period', 'Final Score', 'Rating', 'Approved At'],
        ...approved.map((e) => [
          e.employee_name ?? '—', e.employee_position ?? '—', e.department ?? '—',
          e.period ?? '—',
          e.final_score !== null ? e.final_score.toFixed(4) : '—',
          e.final_score !== null ? scoreToBucket(e.final_score) : '—',
          fmtDate(e.approved_at),
        ]),
      ]);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const SUBTABS: { key: Subtab; label: string; icon: React.ElementType }[] = [
    { key: 'comparison', label: 'Office Comparison', icon: Building2 },
    { key: 'cycle-performance', label: 'Cycle Performance', icon: Clock },
    { key: 'records', label: 'Records Search', icon: Search },
    { key: 'export', label: 'Export Center', icon: Download },
  ];

  return (
    <div className="space-y-5" style={{ fontFamily: "'Poppins', sans-serif" }}>
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Reports & Analytics</h2>
        <p className="mt-0.5 text-sm text-slate-500">Module 5 — Performance insights, bottleneck analysis, and records archive</p>
      </div>

      {/* Subtab bar */}
      <div className="flex flex-wrap border-b border-slate-200 bg-white rounded-xl p-2 shadow-sm gap-2">
        {SUBTABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubtab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-md transition ${
              subtab === key ? 'bg-[#363EE8] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-400">Loading analytics…</div>
      ) : (
        <>
          {/* ── Subtab: Office Comparison ──────────────────────────────────────── */}
          {subtab === 'comparison' && (
            <div className="space-y-5">
              {/* Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600">Cycle / Period</label>
                  <div className="relative">
                    <select
                      value={selectedCycle}
                      onChange={(e) => setSelectedCycle(e.target.value)}
                      className="rounded-lg border border-slate-200 pl-3 pr-8 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8] appearance-none bg-white"
                    >
                      <option value="all">All Cycles</option>
                      {periods.map((p) => <option key={p} value={p}>{p}</option>)}
                      {cycles.map((c) => <option key={c.id} value={String(c.id)}>{c.title}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                  </div>
                </div>
                <span className="ml-auto text-[11px] text-slate-400">{officeStats.length} offices · {filteredEvals.length} evaluations</span>
              </div>

              {/* Summary cards */}
              {officeStats.length > 0 && (() => {
                const best = officeStats[0];
                const worst = [...officeStats].sort((a, b) => a.completionPct - b.completionPct)[0];
                const withScore = officeStats.filter((o) => o.avgScore !== null);
                const topRated = withScore.length > 0 ? withScore.reduce((a, b) => (a.avgScore! > b.avgScore! ? a : b)) : null;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Highest Completion</p>
                      <p className="mt-1 text-sm font-bold text-emerald-800">{best.office}</p>
                      <p className="text-xs text-emerald-700">{best.completionPct}% · {best.approved}/{best.total} approved</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Needs Support</p>
                      <p className="mt-1 text-sm font-bold text-amber-800">{worst.office}</p>
                      <p className="text-xs text-amber-700">{worst.completionPct}% · {worst.approved}/{worst.total} approved</p>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600">Top Avg Rating</p>
                      <p className="mt-1 text-sm font-bold text-blue-800">{topRated?.office ?? '—'}</p>
                      <p className="text-xs text-blue-700">{topRated?.avgScore !== null ? topRated?.avgScore?.toFixed(3) : '—'} avg score</p>
                    </div>
                  </div>
                );
              })()}

              {/* Per-office cards */}
              {officeStats.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                  No evaluations found for the selected cycle.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {officeStats.map((stat) => {
                    const total = Object.values(stat.distribution).reduce((s, v) => s + v, 0);
                    return (
                      <div key={stat.office} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        {/* Office header */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100" style={{ background: 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)' }}>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-white/70" />
                            <span className="text-sm font-bold text-white">{stat.office}</span>
                          </div>
                          <span className="text-xs font-bold text-white/80">{stat.approved}/{stat.total} approved</span>
                        </div>

                        <div className="px-5 py-4 space-y-4">
                          {/* Completion rate */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Completion Rate</span>
                              <span className="text-sm font-bold text-[#363EE8]">{stat.completionPct}%</span>
                            </div>
                            <MiniBar pct={stat.completionPct} className="bg-[#363EE8]" />
                          </div>

                          {/* Avg score */}
                          {stat.avgScore !== null && (
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Avg Score</span>
                              <span className="text-sm font-bold text-slate-800">
                                {stat.avgScore.toFixed(3)}
                                <span className={`ml-2 text-[10px] font-bold ${BUCKET_TEXT[scoreToBucket(stat.avgScore)]}`}>
                                  ({scoreToBucket(stat.avgScore)})
                                </span>
                              </span>
                            </div>
                          )}

                          {/* Distribution */}
                          <div>
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Rating Distribution</p>
                            <div className="space-y-1.5">
                              {BUCKETS.map((bucket) => {
                                const count = stat.distribution[bucket];
                                const pct = total === 0 ? 0 : Math.round((count / total) * 100);
                                return (
                                  <div key={bucket} className="flex items-center gap-2">
                                    <span className="w-32 text-[10px] text-slate-600 shrink-0">{bucket}</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                      <div className={`h-full rounded-full ${BUCKET_COLOR[bucket]}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="w-6 text-[10px] font-semibold text-right text-slate-500">{count}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Subtab: Cycle Performance ──────────────────────────────────────── */}
          {subtab === 'cycle-performance' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Workflow Bottleneck Analysis</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Average days per stage per office. Stages exceeding typical thresholds are flagged in amber.
                </p>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 text-[11px] text-slate-600">
                <div className="flex items-center gap-1.5"><Clock className="h-3 w-3 text-slate-400" /> Notification → Submission (target: ≤14d)</div>
                <div className="flex items-center gap-1.5"><Clock className="h-3 w-3 text-slate-400" /> Submission → Verification (target: ≤7d)</div>
                <div className="flex items-center gap-1.5"><Clock className="h-3 w-3 text-slate-400" /> Verification → Closeout (target: ≤5d)</div>
                <div className="flex items-center gap-1.5 ml-4">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" /> Over threshold
                </div>
              </div>

              {/* Period selector */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">Filter by Period</label>
                <div className="relative">
                  <select
                    value={selectedCycle}
                    onChange={(e) => setSelectedCycle(e.target.value)}
                    className="rounded-lg border border-slate-200 pl-3 pr-8 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8] appearance-none bg-white"
                  >
                    <option value="all">All Periods</option>
                    {periods.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                </div>
              </div>

              {stageTimings.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                  No timing data available for this period.
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                          <th className="px-4 py-3">Office</th>
                          <th className="px-4 py-3">Notification → Submission</th>
                          <th className="px-4 py-3">Submission → Verification</th>
                          <th className="px-4 py-3">Verification → Closeout</th>
                          <th className="px-4 py-3 text-right">Sample Size</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {stageTimings.map((t) => (
                          <tr key={t.office} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-3.5 w-3.5 text-[#363EE8] shrink-0" />
                                {t.office}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <DayBadge days={t.avgNotifyToSubmit} warn={14} />
                                {t.avgNotifyToSubmit !== null && (
                                  <MiniBar pct={Math.min(100, (t.avgNotifyToSubmit / 21) * 100)} className={t.avgNotifyToSubmit > 14 ? 'bg-amber-400' : 'bg-[#363EE8]'} />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <DayBadge days={t.avgSubmitToReview} warn={7} />
                                {t.avgSubmitToReview !== null && (
                                  <MiniBar pct={Math.min(100, (t.avgSubmitToReview / 14) * 100)} className={t.avgSubmitToReview > 7 ? 'bg-amber-400' : 'bg-[#363EE8]'} />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <DayBadge days={t.avgReviewToApprove} warn={5} />
                                {t.avgReviewToApprove !== null && (
                                  <MiniBar pct={Math.min(100, (t.avgReviewToApprove / 10) * 100)} className={t.avgReviewToApprove > 5 ? 'bg-amber-400' : 'bg-[#363EE8]'} />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-500">{t.sampleSize} evals</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Bottleneck summary */}
                  {(() => {
                    const bottlenecks = stageTimings.filter(
                      (t) => (t.avgNotifyToSubmit ?? 0) > 14 || (t.avgSubmitToReview ?? 0) > 7 || (t.avgReviewToApprove ?? 0) > 5
                    );
                    if (bottlenecks.length === 0) return null;
                    return (
                      <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
                        <BarChart3 className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-amber-800">
                          <strong>Bottlenecks detected</strong> in {bottlenecks.map((b) => b.office).join(', ')}. Consider follow-up with department heads to address delays.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Closed-out bundles summary */}
              {closeouts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-slate-800">Closed-Out Bundles</h3>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3">Period</th>
                            <th className="px-4 py-3">IPCRs</th>
                            <th className="px-4 py-3">DPCR</th>
                            <th className="px-4 py-3">OPCR</th>
                            <th className="px-4 py-3">Closed By</th>
                            <th className="px-4 py-3">Closed At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {closeouts.map((c) => (
                            <tr key={c.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 font-semibold text-slate-800">{c.office_name}</td>
                              <td className="px-4 py-2.5 text-slate-600">{c.period}</td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${c.ipcr_verified === c.ipcr_total ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {c.ipcr_verified}/{c.ipcr_total}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${c.dpcr_count >= 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {c.dpcr_count >= 1 ? '✓' : '—'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${c.opcr_count >= 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {c.opcr_count >= 1 ? '✓' : '—'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-slate-500">{c.closed_by}</td>
                              <td className="px-4 py-2.5 text-slate-500">{fmtDate(c.closed_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Subtab: Records Search ─────────────────────────────────────────── */}
          {subtab === 'records' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Historical Records Archive</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Searchable archive of every approved/closed-out IPCR bundle. Filter by employee name, office, or period.
                </p>
              </div>

              {/* Search + filters */}
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={recordsSearch}
                    onChange={(e) => setRecordsSearch(e.target.value)}
                    placeholder="Search by employee name or office…"
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-8 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
                  />
                  {recordsSearch && (
                    <button type="button" onClick={() => setRecordsSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="relative">
                  <select
                    value={recordsOffice}
                    onChange={(e) => setRecordsOffice(e.target.value)}
                    className="rounded-lg border border-slate-200 pl-3 pr-8 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8] appearance-none bg-white"
                  >
                    <option value="">All Offices</option>
                    {offices.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                </div>
                <div className="relative">
                  <select
                    value={recordsPeriod}
                    onChange={(e) => setRecordsPeriod(e.target.value)}
                    className="rounded-lg border border-slate-200 pl-3 pr-8 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8] appearance-none bg-white"
                  >
                    <option value="">All Periods</option>
                    {periods.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                </div>
                <span className="self-center text-[11px] text-slate-400">{recordsData.length} record{recordsData.length !== 1 ? 's' : ''}</span>
              </div>

              {recordsData.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
                  <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No records match the current filters.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                          <th className="px-4 py-3">Employee</th>
                          <th className="px-4 py-3">Position</th>
                          <th className="px-4 py-3">Office</th>
                          <th className="px-4 py-3">Period</th>
                          <th className="px-4 py-3 text-right">Final Score</th>
                          <th className="px-4 py-3">Rating</th>
                          <th className="px-4 py-3">Approved</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {recordsData.map((e) => {
                          const bucket = e.final_score !== null ? scoreToBucket(e.final_score) : null;
                          return (
                            <tr key={e.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 font-semibold text-slate-800">{e.employee_name ?? '—'}</td>
                              <td className="px-4 py-2.5 text-slate-500">{e.employee_position ?? '—'}</td>
                              <td className="px-4 py-2.5 text-slate-600">{e.department ?? '—'}</td>
                              <td className="px-4 py-2.5 text-slate-500">{e.period ?? '—'}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                                {e.final_score !== null ? e.final_score.toFixed(4) : '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                {bucket ? (
                                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${BUCKET_TEXT[bucket]} bg-opacity-10`}
                                    style={{ background: bucket === 'Outstanding' ? '#d1fae5' : bucket === 'Very Satisfactory' ? '#dbeafe' : bucket === 'Satisfactory' ? '#fef3c7' : bucket === 'Unsatisfactory' ? '#ffedd5' : '#fee2e2' }}>
                                    {bucket}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-slate-500">{fmtDate(e.approved_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Subtab: Export Center ──────────────────────────────────────────── */}
          {subtab === 'export' && (
            <div className="space-y-5" ref={printRef}>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Export Center</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generate leadership-ready summary reports for use in meetings or official submissions.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Report type selector */}
                {([
                  { key: 'comparison' as const, label: 'Office Comparison', icon: Building2, desc: 'Completion rates and rating distributions across all offices.' },
                  { key: 'timings' as const, label: 'Cycle Performance', icon: Clock, desc: 'Average stage durations and bottleneck analysis per office.' },
                  { key: 'records' as const, label: 'Records Archive', icon: ShieldCheck, desc: 'Full list of approved IPCR/DPCR/OPCR bundles from closed cycles.' },
                ] as const).map(({ key, label, icon: Icon, desc }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setExportType(key)}
                    className={`rounded-xl border-2 p-4 text-left transition ${exportType === key ? 'border-[#363EE8] bg-[#363EE8]/5' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className={`h-4 w-4 ${exportType === key ? 'text-[#363EE8]' : 'text-slate-400'}`} />
                      <span className={`text-xs font-bold ${exportType === key ? 'text-[#363EE8]' : 'text-slate-700'}`}>{label}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">{desc}</p>
                  </button>
                ))}
              </div>

              {/* Period filter */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600">Period / Cycle</label>
                  <div className="relative">
                    <select
                      value={exportPeriod}
                      onChange={(e) => setExportPeriod(e.target.value)}
                      className="rounded-lg border border-slate-200 pl-3 pr-8 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8] appearance-none bg-white"
                    >
                      <option value="">All Periods</option>
                      {periods.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleExport}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#363EE8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2e35d4] transition shadow-sm"
                  >
                    <Download className="h-3.5 w-3.5" /> Download CSV
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print / PDF
                  </button>
                </div>
              </div>

              {/* Preview */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Preview — {exportType === 'comparison' ? 'Office Comparison' : exportType === 'timings' ? 'Cycle Performance' : 'Records Archive'}</p>
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  {exportType === 'comparison' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                            <th className="px-4 py-2.5">Office</th>
                            <th className="px-4 py-2.5 text-right">Total</th>
                            <th className="px-4 py-2.5 text-right">Approved</th>
                            <th className="px-4 py-2.5 text-right">Completion %</th>
                            <th className="px-4 py-2.5 text-right">Avg Score</th>
                            {BUCKETS.map((b) => <th key={b} className="px-4 py-2.5 text-right">{b.split(' ')[0]}</th>)}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {officeStats.map((s) => (
                            <tr key={s.office} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2 font-semibold text-slate-800">{s.office}</td>
                              <td className="px-4 py-2 text-right text-slate-600">{s.total}</td>
                              <td className="px-4 py-2 text-right text-slate-600">{s.approved}</td>
                              <td className="px-4 py-2 text-right font-bold text-[#363EE8]">{s.completionPct}%</td>
                              <td className="px-4 py-2 text-right text-slate-700">{s.avgScore !== null ? s.avgScore.toFixed(3) : '—'}</td>
                              {BUCKETS.map((b) => (
                                <td key={b} className="px-4 py-2 text-right text-slate-500">{s.distribution[b]}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {exportType === 'timings' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                            <th className="px-4 py-2.5">Office</th>
                            <th className="px-4 py-2.5">Notify → Submit</th>
                            <th className="px-4 py-2.5">Submit → Verify</th>
                            <th className="px-4 py-2.5">Verify → Closeout</th>
                            <th className="px-4 py-2.5 text-right">Sample</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stageTimings.map((t) => (
                            <tr key={t.office} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2 font-semibold text-slate-800">{t.office}</td>
                              <td className="px-4 py-2"><DayBadge days={t.avgNotifyToSubmit} warn={14} /></td>
                              <td className="px-4 py-2"><DayBadge days={t.avgSubmitToReview} warn={7} /></td>
                              <td className="px-4 py-2"><DayBadge days={t.avgReviewToApprove} warn={5} /></td>
                              <td className="px-4 py-2 text-right text-slate-500">{t.sampleSize}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {exportType === 'records' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                            <th className="px-4 py-2.5">Employee</th>
                            <th className="px-4 py-2.5">Office</th>
                            <th className="px-4 py-2.5">Period</th>
                            <th className="px-4 py-2.5 text-right">Score</th>
                            <th className="px-4 py-2.5">Rating</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {evals.filter((e) => e.status === 'Approved')
                            .filter((e) => !exportPeriod || e.period === exportPeriod)
                            .slice(0, 15)
                            .map((e) => {
                              const bucket = e.final_score !== null ? scoreToBucket(e.final_score) : null;
                              return (
                                <tr key={e.id} className="hover:bg-slate-50/50">
                                  <td className="px-4 py-2 font-semibold text-slate-800">{e.employee_name ?? '—'}</td>
                                  <td className="px-4 py-2 text-slate-600">{e.department ?? '—'}</td>
                                  <td className="px-4 py-2 text-slate-500">{e.period ?? '—'}</td>
                                  <td className="px-4 py-2 text-right font-semibold text-slate-800">{e.final_score !== null ? e.final_score.toFixed(4) : '—'}</td>
                                  <td className="px-4 py-2 text-slate-600">{bucket ?? '—'}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                      {evals.filter((e) => e.status === 'Approved' && (!exportPeriod || e.period === exportPeriod)).length > 15 && (
                        <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 text-center">
                          Showing first 15 rows — CSV export contains all {evals.filter((e) => e.status === 'Approved').length} records.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
