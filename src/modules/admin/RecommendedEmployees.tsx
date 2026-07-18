import { Download, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import {
  lndApproveRecommendation,
  dismissRecommendation,
  listRecommendedEmployeesForCourse,
  type GapType,
  type Priority,
  type RecommendationStatus,
  type RecommendedEmployee,
} from '../../lib/api/trainingRecommendations';

type Props = {
  sessionId: string;
  courseTitle: string;
  /** Refresh the calendar (roster + counts) after an enroll/dismiss. */
  onChanged: () => void;
  onClose: () => void;
};

const PRIORITY_BADGE: Record<Priority, string> = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-gray-100 text-gray-600',
};

const GAP_BADGE: Record<GapType, string> = {
  LOW_SCORE: 'bg-red-50 text-red-600 border border-red-200',
  DECLINING_TREND: 'bg-amber-50 text-amber-600 border border-amber-200',
  KRA_ALIGNED: 'bg-blue-50 text-blue-600 border border-blue-200',
};

const GAP_LABEL: Record<GapType, string> = {
  LOW_SCORE: 'Low score',
  DECLINING_TREND: 'Declining trend',
  KRA_ALIGNED: 'KRA aligned',
};

const STATUS_BADGE: Record<RecommendationStatus, string> = {
  SUGGESTED: 'bg-blue-100 text-blue-700',
  LND_APPROVED: 'bg-indigo-100 text-indigo-700',
  OFFICE_ADDED: 'bg-indigo-100 text-indigo-700',
  OFFICE_FINALIZED: 'bg-amber-100 text-amber-700',
  ACCEPTED: 'bg-indigo-100 text-indigo-700',
  ENROLLED: 'bg-emerald-100 text-emerald-700',
  DISMISSED: 'bg-gray-200 text-gray-500',
};

const PRIORITIES: Priority[] = ['HIGH', 'MEDIUM', 'LOW'];
const STATUSES: RecommendationStatus[] = ['SUGGESTED', 'ACCEPTED', 'ENROLLED', 'DISMISSED'];

/** Quote a CSV field, escaping embedded quotes. */
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export const RecommendedEmployees = ({ sessionId, courseTitle, onChanged, onClose }: Props) => {
  const [rows, setRows] = useState<RecommendedEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [priority, setPriority] = useState<Priority | ''>('');
  const [status, setStatus] = useState<RecommendationStatus | ''>('');
  const [department, setDepartment] = useState('');
  const [sort, setSort] = useState<'priority' | 'trigger_score'>('priority');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listRecommendedEmployeesForCourse(sessionId, {
      priority: priority || undefined,
      status: status || undefined,
      department: department || undefined,
      sort,
    });
    if (!result.ok) {
      setError(result.error ?? 'Could not load recommendations.');
      setRows([]);
    } else {
      setError(null);
      setRows(result.data ?? []);
    }
    setLoading(false);
  }, [sessionId, priority, status, department, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  // Department options come from the unfiltered set, so the dropdown never empties
  // itself out. Loaded once alongside the first fetch.
  const [allDepartments, setAllDepartments] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const result = await listRecommendedEmployeesForCourse(sessionId, {});
      if (result.ok) {
        setAllDepartments(
          [...new Set((result.data ?? []).map((r) => r.department).filter(Boolean) as string[])].sort(),
        );
      }
    })();
  }, [sessionId]);

  const handleEnroll = async (rec: RecommendedEmployee) => {
    setBusyId(rec.recommendationId);
    // Approval now routes to the Office Account for review, not straight to
    // enrollment (§6). Final enrollment happens on the L&D Recommendations page.
    const result = await lndApproveRecommendation(rec.recommendationId);
    setBusyId(null);
    if (!result.ok) {
      alert(`Could not approve ${rec.employeeName}: ${result.error}`);
      return;
    }
    onChanged();
    void load();
  };

  const handleDismiss = async (rec: RecommendedEmployee) => {
    const remark = window.prompt(`Dismiss the recommendation for ${rec.employeeName}? (optional remark)`, '');
    if (remark === null) return; // cancelled
    setBusyId(rec.recommendationId);
    const result = await dismissRecommendation(rec.recommendationId, remark);
    setBusyId(null);
    if (!result.ok) {
      alert(`Could not dismiss: ${result.error}`);
      return;
    }
    onChanged();
    void load();
  };

  const exportCsv = () => {
    const header = [
      'Employee', 'Position', 'Department', 'Matched Competency', 'Trigger Score',
      'Gap Type', 'Gap Detail', 'Source Cycle', 'Priority', 'Status', 'Admin Remark',
    ];
    const lines = rows.map((r) =>
      [
        r.employeeName, r.position, r.department, r.competency, r.triggerScoreLabel,
        GAP_LABEL[r.gapType], r.gapDetail, r.sourceCycle, r.priority, r.status, r.adminRemark,
      ].map(csvCell).join(','),
    );
    const csv = [header.map(csvCell).join(','), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recommended-employees-${courseTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectClass =
    'rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-5xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-blue-600">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Recommended Employees</span>
            </div>
            <h2 className="mt-0.5 truncate text-lg font-bold text-gray-900">{courseTitle}</h2>
            <p className="text-xs text-gray-400">
              Live from finalized IPCR data — employees whose competency gaps match this course.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={exportCsv}
              disabled={!rows.length}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-6 py-3">
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} className={selectClass}>
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as RecommendationStatus | '')} className={selectClass}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className={selectClass}>
            <option value="">All departments</option>
            {allDepartments.map((d) => (<option key={d} value={d}>{d}</option>))}
          </select>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
            <span>Sort:</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as 'priority' | 'trigger_score')} className={selectClass}>
              <option value="priority">Priority</option>
              <option value="trigger_score">Trigger score (lowest first)</option>
            </select>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {error ? (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Loading recommendations…</p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No recommended employees"
              description="No employees currently match this course's competency based on finalized IPCR data. Try Regenerate recommendations, or check that the course has a competency assigned."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Employee</th>
                    <th className="px-4 py-2.5 font-semibold">Competency &amp; gap</th>
                    <th className="px-4 py-2.5 font-semibold">Score</th>
                    <th className="px-4 py-2.5 font-semibold">Priority</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => {
                    const closed = r.status === 'ENROLLED' || r.status === 'DISMISSED';
                    return (
                      <tr key={r.recommendationId} className="align-top hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{r.employeeName}</p>
                          <p className="text-xs text-gray-500">{r.position ?? '—'}</p>
                          <p className="text-xs text-gray-400">{r.department ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium text-gray-700">{r.competency}</span>
                            <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${GAP_BADGE[r.gapType]}`}>
                              {GAP_LABEL[r.gapType]}
                            </span>
                          </div>
                          {r.gapDetail && <p className="mt-1 text-xs text-gray-500 leading-snug">{r.gapDetail}</p>}
                          {r.sourceCycle && <p className="mt-0.5 text-[11px] text-gray-400">Source: {r.sourceCycle}</p>}
                          {r.adminRemark && <p className="mt-0.5 text-[11px] italic text-gray-400">Remark: {r.adminRemark}</p>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-gray-800">{r.triggerScoreLabel}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_BADGE[r.priority]}`}>
                            {r.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[r.status]}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={busyId === r.recommendationId || closed}
                              onClick={() => handleEnroll(r)}
                              className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition"
                              title="Approve and send to the department head for review"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busyId === r.recommendationId || r.status === 'DISMISSED'}
                              onClick={() => handleDismiss(r)}
                              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
                            >
                              Dismiss
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
