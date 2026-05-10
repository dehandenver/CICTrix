import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Clock, RefreshCw, Send } from 'lucide-react';
<<<<<<< HEAD
import { supabase as supabaseClient } from '../../lib/supabase';

// Bypass auto-generated Supabase types resolving to `never`.
const supabase = supabaseClient as any;
import { getAdjectival } from './pm/SummaryOfRatings';
=======
import { supabase } from '../../lib/supabase';
import { IPCRReportView } from './pm/IPCRReportView';
import { type IPCRRatingRecord, getAdjectival } from './pm/SummaryOfRatings';
>>>>>>> 799e1b3e64f023fbf7de0ac27c513002015a8ba4

type ReportStatus = 'Pending Review' | 'Reviewed' | 'Actioned';

interface PMLndReport {
  id: string;
  department: string;
  period: string;
  average_rating: number;
  employees_flagged: string[];
  pm_notes: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at?: string | null;
  /** Full per-employee snapshot — present on reports sent after the records column was added. */
  records: IPCRRatingRecord[];
}

interface PMReportsProps {
  onBack: () => void;
  /** When provided, the matching report is auto-expanded and scrolled into view on first render. */
  selectedReportId?: string | null;
  /** Called once the selectedReportId has been honored, so the caller can clear it. */
  onSelectionConsumed?: () => void;
}

// Defensive parser: handles both legacy stringified-JSON and migrated jsonb-array shapes.
function parseFlagged(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Defensive parser for the per-employee snapshot. Tolerates legacy rows
// (no records column) and either jsonb arrays or stringified JSON.
function parseRecords(raw: unknown): IPCRRatingRecord[] {
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
    ? (() => {
        try {
          const p = JSON.parse(raw);
          return Array.isArray(p) ? p : [];
        } catch {
          return [];
        }
      })()
    : [];

  return arr.filter((entry): entry is IPCRRatingRecord => {
    if (!entry || typeof entry !== 'object') return false;
    const r = entry as Record<string, unknown>;
    return typeof r.name === 'string' && typeof r.department === 'string';
  });
}

const STATUS_PILL: Record<ReportStatus, string> = {
  'Pending Review': 'bg-orange-100 text-orange-700 border-orange-200',
  Reviewed: 'bg-blue-100 text-blue-700 border-blue-200',
  Actioned: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export const PMReports = ({ onBack, selectedReportId, onSelectionConsumed }: PMReportsProps) => {
  const [reports, setReports] = useState<PMLndReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const selectionHandledRef = useRef(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('pm_lnd_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const normalized: PMLndReport[] = (data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        department: String(row.department ?? ''),
        period: String(row.period ?? ''),
        average_rating: typeof row.average_rating === 'number' ? row.average_rating : Number(row.average_rating ?? 0),
        employees_flagged: parseFlagged(row.employees_flagged),
        pm_notes: typeof row.pm_notes === 'string' ? row.pm_notes : null,
        status: (row.status as ReportStatus) ?? 'Pending Review',
        created_at: String(row.created_at ?? ''),
        updated_at: row.updated_at ? String(row.updated_at) : null,
        records: parseRecords(row.records),
      }));

      setReports(normalized);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load reports.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  // Reset the "handled" gate if the caller targets a different report.
  useEffect(() => {
    selectionHandledRef.current = false;
  }, [selectedReportId]);

  // After data lands, honor the deep-link: expand + scroll + briefly highlight.
  useEffect(() => {
    if (!selectedReportId || selectionHandledRef.current) return;
    if (loading) return;
    const exists = reports.some(r => r.id === selectedReportId);
    if (!exists) return;

    selectionHandledRef.current = true;
    setExpandedId(selectedReportId);
    setHighlightId(selectedReportId);

    // Defer to next frame so the expanded content has laid out before scrolling.
    requestAnimationFrame(() => {
      const node = rowRefs.current.get(selectedReportId);
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    const t = setTimeout(() => setHighlightId(null), 2400);
    onSelectionConsumed?.();
    return () => clearTimeout(t);
  }, [loading, reports, selectedReportId, onSelectionConsumed]);

  const updateStatus = async (id: string, next: ReportStatus) => {
    setUpdatingId(id);
    const previous = reports;
    // Optimistic
    setReports(prev => prev.map(r => (r.id === id ? { ...r, status: next } : r)));
    try {
      const { error: updateError } = await supabase
        .from('pm_lnd_reports')
        .update({ status: next })
        .eq('id', id);
      if (updateError) throw updateError;
    } catch (err) {
      console.error('Failed to update status', err);
      alert('Could not update status. Has the pm_lnd_reports migration run? (status column may not exist yet.)');
      setReports(previous);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredReports = useMemo(() => {
    if (statusFilter === 'all') return reports;
    return reports.filter(r => r.status === statusFilter);
  }, [reports, statusFilter]);

  const counts = useMemo(() => {
    const c = { total: reports.length, pending: 0, reviewed: 0, actioned: 0 };
    reports.forEach(r => {
      if (r.status === 'Pending Review') c.pending++;
      else if (r.status === 'Reviewed') c.reviewed++;
      else if (r.status === 'Actioned') c.actioned++;
    });
    return c;
  }, [reports]);

  return (
    <div className="space-y-4 p-6 md:p-8">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm text-blue-600 font-medium">
          L&amp;D Division <span className="mx-1 text-slate-400">/</span> <span className="text-slate-500">Documents</span>
          <span className="mx-1 text-slate-400">/</span> <span className="text-slate-500">Summary of Ratings (from PM)</span>
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-1 rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 transition"
            aria-label="Back to Documents"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Summary of Ratings (from PM)</h2>
            <p className="text-sm text-slate-500 mt-1">
              IPCR rating summaries forwarded by the Performance Management division for L&amp;D discernment
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchReports}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Total Reports</p>
          <p className="text-3xl font-bold text-slate-900 leading-none">{counts.total}</p>
        </div>
        <div className="rounded-xl border border-orange-300 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-orange-500 uppercase tracking-wider mb-1.5">Pending Review</p>
          <p className="text-3xl font-bold text-orange-500 leading-none">{counts.pending}</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider mb-1.5">Reviewed</p>
          <p className="text-3xl font-bold text-blue-500 leading-none">{counts.reviewed}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider mb-1.5">Actioned</p>
          <p className="text-3xl font-bold text-emerald-500 leading-none">{counts.actioned}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm flex items-center gap-3 mb-4">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2">Filter by status</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | ReportStatus)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-blue-500 outline-none w-56"
        >
          <option value="all">All statuses</option>
          <option value="Pending Review">Pending Review</option>
          <option value="Reviewed">Reviewed</option>
          <option value="Actioned">Actioned</option>
        </select>
        <span className="text-sm text-slate-400 px-2 ml-auto">{filteredReports.length} of {reports.length} reports</span>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span><strong>Couldn&apos;t load reports:</strong> {error}</span>
        </div>
      )}

      {loading && reports.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          Loading PM reports…
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
          {reports.length === 0
            ? 'No reports have been forwarded by the PM division yet.'
            : 'No reports match the current filter.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.map(report => {
            const adj = getAdjectival(report.average_rating);
            const isExpanded = expandedId === report.id;
            const isHighlighted = highlightId === report.id;
            return (
              <div
                key={report.id}
                ref={(node) => {
                  if (node) rowRefs.current.set(report.id, node);
                  else rowRefs.current.delete(report.id);
                }}
                className={`rounded-xl border bg-white shadow-sm overflow-hidden transition ${
                  isHighlighted
                    ? 'border-blue-500 ring-2 ring-blue-200 shadow-md'
                    : 'border-slate-200'
                }`}
              >
                <div
                  className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition"
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="rounded-lg bg-blue-50 text-blue-600 p-2">
                      <Send className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900 leading-tight truncate">{report.department}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {report.period} &bull; <Clock className="inline h-3 w-3 mb-0.5" /> Sent {fmtDate(report.created_at)}
                      </p>
                      {report.employees_flagged.length > 0 && (
                        <p className="text-xs text-slate-600 mt-1">
                          <strong>{report.employees_flagged.length}</strong> employee{report.employees_flagged.length === 1 ? '' : 's'} flagged
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Avg Rating</p>
                      <p className="text-lg font-bold text-slate-900 leading-none">
                        {report.average_rating ? report.average_rating.toFixed(4) : 'N/A'}
                      </p>
                    </div>
                    <span className={`inline-flex items-center rounded px-2 py-1 text-[10px] font-bold uppercase ${adj.pillClass}`}>
                      {adj.label}
                    </span>
                    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold ${STATUS_PILL[report.status]}`}>
                      {report.status}
                    </span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 space-y-4">
                    {/* Full IPCR table — official Summary-of-Ratings format */}
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Summary of Ratings (Official Format)</p>
                      <IPCRReportView
                        records={report.records}
                        department={report.department}
                        period={report.period}
                      />
                    </div>

                    {report.employees_flagged.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Flagged Employees</p>
                        <div className="flex flex-wrap gap-2">
                          {report.employees_flagged.map((name, idx) => (
                            <span key={`${report.id}-${idx}`} className="inline-flex items-center rounded-full bg-white border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">PM Notes</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">
                        {report.pm_notes && report.pm_notes.trim() ? report.pm_notes : <span className="italic text-slate-400">No notes provided.</span>}
                      </p>
                    </div>

                    {report.updated_at && report.updated_at !== report.created_at && (
                      <p className="text-xs text-slate-400">Last updated {fmtDate(report.updated_at)}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-2">Update Status</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void updateStatus(report.id, 'Pending Review'); }}
                        disabled={updatingId === report.id || report.status === 'Pending Review'}
                        className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Pending Review
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void updateStatus(report.id, 'Reviewed'); }}
                        disabled={updatingId === report.id || report.status === 'Reviewed'}
                        className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark Reviewed
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void updateStatus(report.id, 'Actioned'); }}
                        disabled={updatingId === report.id || report.status === 'Actioned'}
                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark Actioned
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
