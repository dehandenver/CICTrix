import { ChevronDown, ChevronLeft, ChevronUp, Info, Printer, Search, Send, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export interface IPCRRatingRecord {
  id: string;
  department: string;
  name: string;
  position: string;
  period: string;
  numericalRating: number | null;
  remarks: string;
  submissionStatus: 'SUBMITTED' | 'PENDING' | 'OVERDUE';
}

export type Adjectival = 'Outstanding' | 'Very Satisfactory' | 'Satisfactory' | 'Unsatisfactory' | 'Poor' | 'Non-Submission';

export function getAdjectival(score: number | null): { label: Adjectival; pillClass: string } {
  if (score === null) return { label: 'Non-Submission', pillClass: 'bg-blue-300 text-blue-900' };
  if (score >= 4.5) return { label: 'Outstanding', pillClass: 'bg-yellow-400 text-yellow-900' };
  if (score >= 3.5) return { label: 'Very Satisfactory', pillClass: 'bg-emerald-400 text-emerald-900' };
  if (score >= 2.5) return { label: 'Satisfactory', pillClass: 'bg-teal-400 text-teal-900' };
  if (score >= 1.5) return { label: 'Unsatisfactory', pillClass: 'bg-red-300 text-red-900' };
  return { label: 'Poor', pillClass: 'bg-red-500 text-white' };
}

export function computeKPIs(records: IPCRRatingRecord[]): Record<Adjectival | 'Total', number> {
  const kpis = {
    Total: records.length,
    Outstanding: 0,
    'Very Satisfactory': 0,
    Satisfactory: 0,
    Unsatisfactory: 0,
    Poor: 0,
    'Non-Submission': 0,
  };
  records.forEach(r => {
    const adj = getAdjectival(r.numericalRating).label;
    kpis[adj]++;
  });
  return kpis;
}

export function groupByDept(records: IPCRRatingRecord[]) {
  const groups = new Map<string, { records: IPCRRatingRecord[]; avg: number; distribution: Record<Adjectival, number>; _sum: number; _count: number }>();

  records.forEach(r => {
    if (!groups.has(r.department)) {
      groups.set(r.department, {
        records: [],
        avg: 0,
        distribution: {
          Outstanding: 0,
          'Very Satisfactory': 0,
          Satisfactory: 0,
          Unsatisfactory: 0,
          Poor: 0,
          'Non-Submission': 0,
        },
        _sum: 0,
        _count: 0,
      });
    }
    const group = groups.get(r.department)!;
    group.records.push(r);

    const adj = getAdjectival(r.numericalRating).label;
    group.distribution[adj]++;

    // avg ignores null ratings (non-submissions don't count toward the mean).
    if (r.numericalRating !== null) {
      group._sum += r.numericalRating;
      group._count++;
    }
  });

  for (const group of groups.values()) {
    group.avg = group._count > 0 ? group._sum / group._count : 0;
  }

  return groups;
}

const MOCK_RECORDS: IPCRRatingRecord[] = [
  { id: '1', department: 'IT Department', name: 'Santos, Maria G.', position: 'IT Officer II', period: 'JANUARY–JUNE 2025', numericalRating: 4.97, remarks: '', submissionStatus: 'SUBMITTED' },
  { id: '2', department: 'IT Department', name: 'Dela Cruz, Juan P.', position: 'Systems Analyst', period: 'JANUARY–JUNE 2025', numericalRating: 4.80, remarks: '', submissionStatus: 'SUBMITTED' },
  { id: '3', department: 'IT Department', name: 'Reyes, Ana T.', position: 'Network Administrator', period: 'JANUARY–JUNE 2025', numericalRating: 3.80, remarks: '', submissionStatus: 'SUBMITTED' },
  { id: '4', department: 'IT Department', name: 'Aguilar, Ricardo M.', position: 'IT Support Specialist', period: 'JANUARY–JUNE 2025', numericalRating: 4.96, remarks: 'IPCR', submissionStatus: 'SUBMITTED' },
  { id: '5', department: 'IT Department', name: 'Bautista, Lourdes S.', position: 'Database Administrator', period: 'JANUARY–JUNE 2025', numericalRating: 4.91, remarks: 'Detailed to CMO', submissionStatus: 'SUBMITTED' },
  { id: '6', department: 'IT Department', name: 'Fernandez, Carlos D.', position: 'Web Developer', period: 'JANUARY–JUNE 2025', numericalRating: 4.60, remarks: '', submissionStatus: 'SUBMITTED' },
  { id: '7', department: 'IT Department', name: 'Gomez, Patricia L.', position: 'UI/UX Designer', period: 'JANUARY–JUNE 2025', numericalRating: null, remarks: 'On Leave', submissionStatus: 'PENDING' },
  { id: '8', department: 'Finance Department', name: 'Lim, Ricardo', position: 'Accountant', period: 'JANUARY–JUNE 2025', numericalRating: 3.20, remarks: '', submissionStatus: 'SUBMITTED' },
  { id: '9', department: 'Finance Department', name: 'Sy, Henry', position: 'Financial Analyst', period: 'JANUARY–JUNE 2025', numericalRating: null, remarks: 'Needs Improvement', submissionStatus: 'OVERDUE' },
];

const DEPT_OPTIONS = ['All Departments', 'IT Department', 'Finance Department'];
const REPORT_PERIOD = 'January–June 2025';

export const SummaryOfRatings = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All Departments');
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({
    'IT Department': true,
    'Finance Department': true,
  });

  // Pagination states keyed by department
  const [pages, setPages] = useState<Record<string, number>>({});
  const rowsPerPage = 5;

  // L&D modal state
  const [showLNDModal, setShowLNDModal] = useState(false);
  const [modalDept, setModalDept] = useState<string>('All Departments');
  const [pmNotes, setPmNotes] = useState('');
  const [isSendingLND, setIsSendingLND] = useState(false);

  const filteredRecords = useMemo(() => {
    return MOCK_RECORDS.filter(r => {
      const matchSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) || r.department.toLowerCase().includes(searchTerm.toLowerCase());
      const matchDept = selectedDept === 'All Departments' || r.department === selectedDept;
      return matchSearch && matchDept;
    });
  }, [searchTerm, selectedDept]);

  const kpis = useMemo(() => computeKPIs(filteredRecords), [filteredRecords]);
  const deptGroups = useMemo(() => groupByDept(filteredRecords), [filteredRecords]);

  // Modal-scoped data: ignores the page-level filter so the dropdown can switch independently.
  const modalDeptRecords = useMemo(() => {
    if (modalDept === 'All Departments') return MOCK_RECORDS;
    return MOCK_RECORDS.filter(r => r.department === modalDept);
  }, [modalDept]);

  const modalAvg = useMemo(() => {
    const rated = modalDeptRecords.filter(r => r.numericalRating !== null);
    if (rated.length === 0) return 0;
    return rated.reduce((s, r) => s + (r.numericalRating as number), 0) / rated.length;
  }, [modalDeptRecords]);

  const toggleDept = (dept: string) => {
    setExpandedDepts(prev => ({ ...prev, [dept]: !prev[dept] }));
  };

  const handlePageChange = (dept: string, newPage: number) => {
    setPages(prev => ({ ...prev, [dept]: newPage }));
  };

  const openLNDModal = (dept: string) => {
    setModalDept(dept);
    setPmNotes('');
    setShowLNDModal(true);
  };

  const closeLNDModal = () => {
    if (isSendingLND) return;
    setShowLNDModal(false);
    setPmNotes('');
  };

  const submitLNDReport = async () => {
    setIsSendingLND(true);
    try {
      const flagged = modalDeptRecords
        .filter(r => r.submissionStatus !== 'SUBMITTED' || (r.numericalRating ?? 0) < 4.5)
        .map(r => r.name);

      const { error } = await supabase.from('pm_lnd_reports').insert([{
        department: modalDept,
        period: REPORT_PERIOD,
        average_rating: Number(modalAvg.toFixed(3)),
        employees_flagged: JSON.stringify(flagged),
        pm_notes: pmNotes,
      }]);
      if (error) throw error;
      alert('Report successfully sent to L&D for discernment!');
      setShowLNDModal(false);
      setPmNotes('');
    } catch (err) {
      console.error('Error sending report to L&D:', err);
      alert('Failed to send report. Please check the console.');
    } finally {
      setIsSendingLND(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Row */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <button type="button" className="p-1 text-slate-400 hover:text-slate-600 transition">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              Summary of Ratings — IPCR
            </h2>
            <p className="text-sm text-slate-500">
              Individual Performance Commitment and Review &bull; January–June 2025
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => openLNDModal(selectedDept)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition shadow-sm"
          >
            <Send className="h-4 w-4" /> Send to L&D
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm flex items-center gap-3 print:hidden">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            placeholder="Search by name or department..."
          />
        </div>
        <select
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-blue-500 outline-none w-48"
        >
          <option>All Departments</option>
          <option>IT Department</option>
          <option>Finance Department</option>
        </select>
        <select className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-blue-500 outline-none w-48">
          <option>January–June 2025</option>
        </select>
        <span className="text-sm text-slate-400 px-2">{filteredRecords.length} records</span>
      </div>

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 print:grid-cols-6">
        <div className="rounded-xl bg-slate-800 text-white p-4 shadow-sm flex flex-col items-center justify-center text-center">
          <p className="text-3xl font-extrabold leading-none mb-1">{kpis.Total}</p>
          <p className="text-xs font-semibold">Total Employees</p>
        </div>
        <div className="rounded-xl bg-yellow-400 text-yellow-900 p-4 shadow-sm flex flex-col items-center justify-center text-center">
          <p className="text-3xl font-extrabold leading-none mb-1">{kpis.Outstanding}</p>
          <p className="text-xs font-semibold">Outstanding</p>
        </div>
        <div className="rounded-xl bg-emerald-400 text-emerald-900 p-4 shadow-sm flex flex-col items-center justify-center text-center">
          <p className="text-3xl font-extrabold leading-none mb-1">{kpis['Very Satisfactory']}</p>
          <p className="text-xs font-semibold">Very Satisfactory</p>
        </div>
        <div className="rounded-xl bg-teal-400 text-teal-900 p-4 shadow-sm flex flex-col items-center justify-center text-center">
          <p className="text-3xl font-extrabold leading-none mb-1">{kpis.Satisfactory}</p>
          <p className="text-xs font-semibold">Satisfactory</p>
        </div>
        <div className="rounded-xl bg-red-300 text-red-900 p-4 shadow-sm flex flex-col items-center justify-center text-center">
          <p className="text-3xl font-extrabold leading-none mb-1">{kpis.Unsatisfactory}</p>
          <p className="text-xs font-semibold">Unsatisfactory</p>
        </div>
        <div className="rounded-xl bg-blue-300 text-blue-900 p-4 shadow-sm flex flex-col items-center justify-center text-center">
          <p className="text-3xl font-extrabold leading-none mb-1">{kpis['Non-Submission']}</p>
          <p className="text-xs font-semibold">Non-Submission</p>
        </div>
      </div>

      {/* Legend */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Legend</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-700">
          <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded bg-yellow-400 inline-block" /> Outstanding</span>
          <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded bg-emerald-400 inline-block" /> Very Satisfactory</span>
          <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded bg-teal-400 inline-block" /> Satisfactory</span>
          <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded bg-red-300 inline-block" /> Unsatisfactory</span>
          <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded bg-red-500 inline-block" /> Poor</span>
          <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded bg-blue-300 inline-block" /> Non-Submission</span>
        </div>
      </div>

      {/* Grouped Table by Department */}
      <div className="space-y-6">
        {Array.from(deptGroups.entries()).map(([dept, group]) => {
          const isExpanded = expandedDepts[dept] !== false;
          const page = pages[dept] || 1;
          const totalPages = Math.ceil(group.records.length / rowsPerPage);
          const startIndex = (page - 1) * rowsPerPage;
          const visibleRecords = group.records.slice(startIndex, startIndex + rowsPerPage);
          const deptAvgAdj = getAdjectival(group.avg);

          return (
            <div key={dept} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6 print:break-inside-avoid">
              {/* Group Header (Dark Slate) */}
              <div
                className="bg-[#1e293b] px-5 py-4 flex flex-col md:flex-row md:items-center justify-between text-white cursor-pointer hover:bg-slate-800 transition"
                onClick={() => toggleDept(dept)}
              >
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    IPCR — Individual Performance Commitment and Review
                  </p>
                  <h3 className="text-lg font-bold leading-tight">{dept}</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Period: January–June 2025 &bull; {group.records.length} employees &bull; {totalPages} pages
                  </p>
                </div>
                <div className="flex items-center gap-3 mt-4 md:mt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {Object.entries(group.distribution).map(([adj, count]) => {
                      if (count === 0) return null;
                      // Mapping to get the background color pill
                      const pillStyle = getAdjectival(adj === 'Non-Submission' ? null : adj === 'Outstanding' ? 5 : adj === 'Very Satisfactory' ? 4 : adj === 'Satisfactory' ? 3 : adj === 'Unsatisfactory' ? 2 : 1).pillClass;
                      return (
                        <span key={adj} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${pillStyle}`}>
                          {count} {adj}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 ml-2 pl-3 border-l border-slate-600">
                    <span className="inline-flex items-center rounded-full border border-slate-500 bg-slate-700/50 px-3 py-1 text-xs font-bold text-white">
                      Avg: {group.avg > 0 ? group.avg.toFixed(4) : 'N/A'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openLNDModal(dept); }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 transition"
                      title={`Send ${dept} summary to L&D`}
                    >
                      <Send className="h-3 w-3" /> Send to L&D
                    </button>
                    {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <>
                  {/* Complex Header */}
                  <div className="grid grid-cols-12 items-center px-5 border-b border-slate-200">
                    <div className="col-span-1 py-4 text-[11px] font-bold text-slate-800 uppercase tracking-wider text-center border-r border-slate-100">NO.</div>
                    <div className="col-span-2 py-4 px-4 text-[11px] font-bold text-slate-800 uppercase tracking-wider border-r border-slate-100">DEPARTMENT</div>
                    <div className="col-span-2 py-4 px-4 text-[11px] font-bold text-slate-800 uppercase tracking-wider border-r border-slate-100">NAME</div>
                    <div className="col-span-2 py-4 px-4 text-[11px] font-bold text-slate-800 uppercase tracking-wider border-r border-slate-100 text-center">IPCR PERIOD</div>
                    <div className="col-span-2 flex flex-col border-r border-slate-100 h-full">
                      <div className="py-2 text-[11px] font-bold text-slate-800 uppercase tracking-wider text-center border-b border-slate-100 h-1/2 flex items-center justify-center">RATINGS</div>
                      <div className="grid grid-cols-2 h-1/2 text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center">
                        <div className="border-r border-slate-100 py-2 flex items-center justify-center">NUMERICAL</div>
                        <div className="py-2 flex items-center justify-center">ADJECTIVAL</div>
                      </div>
                    </div>
                    <div className="col-span-1 py-4 px-2 text-[11px] font-bold text-slate-800 uppercase tracking-wider border-r border-slate-100 text-center">REMARKS</div>
                    <div className="col-span-2 py-4 px-4 text-[11px] font-bold text-slate-800 uppercase tracking-wider text-center">SUBMISSION STATUS</div>
                  </div>

                  {/* Table Rows */}
                  <div className="divide-y divide-slate-100">
                    {visibleRecords.map((row, idx) => {
                      const adj = getAdjectival(row.numericalRating);
                      return (
                        <div key={row.id} className="grid grid-cols-12 items-stretch hover:bg-slate-50 transition min-h-[48px]">
                          <div className="col-span-1 px-2 py-3 text-sm text-slate-600 border-r border-slate-100 flex items-center justify-center">
                            {startIndex + idx + 1}
                          </div>
                          <div className="col-span-2 px-4 py-3 text-sm text-slate-600 border-r border-slate-100 flex items-center">
                            {row.department}
                          </div>
                          <div className="col-span-2 px-4 py-3 border-r border-slate-100 flex flex-col justify-center">
                            <span className="text-sm font-semibold text-slate-800 leading-tight">{row.name}</span>
                            {row.position && <span className="text-[11px] text-slate-400">{row.position}</span>}
                          </div>
                          <div className="col-span-2 px-4 py-3 text-xs text-slate-500 border-r border-slate-100 flex items-center justify-center">
                            {row.period}
                          </div>
                          <div className="col-span-2 flex border-r border-slate-100">
                            <div className="w-1/2 border-r border-slate-100 py-3 flex items-center justify-center">
                              <span className="font-bold text-slate-800 text-sm">{row.numericalRating !== null ? row.numericalRating.toFixed(2) : '—'}</span>
                            </div>
                            <div className="w-1/2 py-3 flex items-center justify-center px-2">
                              <span className={`inline-flex items-center justify-center w-full max-w-full rounded px-2 py-1 text-[10px] font-bold uppercase text-center leading-tight whitespace-normal break-words ${adj.pillClass}`}>
                                {adj.label}
                              </span>
                            </div>
                          </div>
                          <div className="col-span-1 px-2 py-3 text-xs text-slate-500 italic border-r border-slate-100 flex items-center justify-center text-center">
                            {row.remarks}
                          </div>
                          <div className="col-span-2 px-4 py-3 flex items-center justify-center">
                            <span className={`inline-flex items-center rounded-sm border px-3 py-1 text-xs font-bold uppercase tracking-wider ${row.submissionStatus === 'SUBMITTED' ? 'border-emerald-200 bg-emerald-50 text-emerald-600' :
                              row.submissionStatus === 'OVERDUE' ? 'border-red-200 bg-red-50 text-red-600' :
                                'border-orange-200 bg-orange-50 text-orange-600'
                              }`}>
                              {row.submissionStatus}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Department Average Row */}
                  <div className="grid grid-cols-12 items-stretch bg-slate-50/80 border-t-2 border-slate-200 min-h-[48px]">
                    <div className="col-span-7 px-4 py-3 border-r border-slate-200 flex items-center justify-end">
                      <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">{dept} AVERAGE RATING</span>
                    </div>
                    <div className="col-span-2 flex border-r border-slate-200">
                      <div className="w-1/2 border-r border-slate-200 py-3 flex items-center justify-center">
                        <span className="font-bold text-blue-600 text-sm">{group.avg > 0 ? group.avg.toFixed(4) : 'N/A'}</span>
                      </div>
                      <div className="w-1/2 py-3 flex items-center justify-center px-2">
                        {group.avg > 0 && (
                          <span className={`inline-flex items-center justify-center w-full max-w-full rounded px-2 py-1 text-[10px] font-bold uppercase text-center leading-tight whitespace-normal break-words ${deptAvgAdj.pillClass}`}>
                            {deptAvgAdj.label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-3"></div>
                  </div>

                  {/* Footer Pagination & Distribution */}
                  <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center justify-between md:w-auto w-full gap-8">
                      <span className="text-sm text-slate-500">
                        Showing <span className="font-semibold text-slate-700">{startIndex + 1}–{Math.min(startIndex + rowsPerPage, group.records.length)}</span> of <span className="font-semibold text-slate-700">{group.records.length}</span> employees
                      </span>
                      {totalPages > 1 && (
                        <div className="flex items-center gap-1 text-slate-400">
                          <button
                            type="button"
                            className="px-1 hover:text-blue-600 transition disabled:opacity-50"
                            onClick={() => handlePageChange(dept, 1)}
                            disabled={page === 1}
                          >&laquo;</button>
                          <button
                            type="button"
                            className="px-1 hover:text-blue-600 transition disabled:opacity-50"
                            onClick={() => handlePageChange(dept, Math.max(1, page - 1))}
                            disabled={page === 1}
                          >&lsaquo;</button>
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => handlePageChange(dept, n)}
                              className={`h-7 w-7 rounded text-xs font-semibold mx-0.5 ${n === page ? 'bg-blue-600 text-white' : 'bg-transparent text-slate-600 hover:bg-slate-200'}`}
                            >
                              {n}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="px-1 hover:text-blue-600 transition disabled:opacity-50"
                            onClick={() => handlePageChange(dept, Math.min(totalPages, page + 1))}
                            disabled={page === totalPages}
                          >&rsaquo;</button>
                          <button
                            type="button"
                            className="px-1 hover:text-blue-600 transition disabled:opacity-50"
                            onClick={() => handlePageChange(dept, totalPages)}
                            disabled={page === totalPages}
                          >&raquo;</button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full md:w-auto border-t md:border-t-0 border-slate-200 pt-3 md:pt-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-2">Distribution:</span>
                        {Object.entries(group.distribution).map(([adj, count]) => {
                          if (count === 0) return null;
                          const pillStyle = getAdjectival(adj === 'Non-Submission' ? null : adj === 'Outstanding' ? 5 : adj === 'Very Satisfactory' ? 4 : adj === 'Satisfactory' ? 3 : adj === 'Unsatisfactory' ? 2 : 1).pillClass;
                          return (
                            <span key={adj} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${pillStyle}`}>
                              {count} {adj}
                            </span>
                          );
                        })}
                      </div>
                      <div className="text-sm font-bold text-blue-600 md:ml-6">
                        Dept. Avg: {group.avg > 0 ? group.avg.toFixed(4) : 'N/A'}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {deptGroups.size === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
            No records found matching your filters.
          </div>
        )}
      </div>

      {showLNDModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
          onClick={closeLNDModal}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Green header */}
            <div className="flex items-start justify-between bg-emerald-600 px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-white/20 p-2">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold leading-tight">Send Summary to L&D</h3>
                  <p className="text-xs text-emerald-50/90">Performance Management Division</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeLNDModal}
                className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white transition"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 px-5 py-5">
              {/* Read-only summary card */}
              <div className="rounded-lg bg-emerald-50 p-4 text-sm">
                <div className="grid grid-cols-2 gap-y-1.5">
                  <span className="text-slate-600">Dept:</span>
                  <span className="font-semibold text-slate-800">{modalDept}</span>
                  <span className="text-slate-600">Period:</span>
                  <span className="font-semibold text-slate-800">{REPORT_PERIOD}</span>
                  <span className="text-slate-600">Employees:</span>
                  <span className="font-semibold text-slate-800">{modalDeptRecords.length}</span>
                  <span className="text-slate-600">Avg:</span>
                  <span className="font-bold text-blue-600">
                    {modalDeptRecords.length > 0 ? modalAvg.toFixed(3) : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Send report for */}
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Send Report For
                </label>
                <select
                  value={modalDept}
                  onChange={(e) => setModalDept(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                >
                  {DEPT_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Notes <span className="font-normal normal-case text-slate-400">(optional)</span>
                </label>
                <textarea
                  value={pmNotes}
                  onChange={(e) => setPmNotes(e.target.value)}
                  rows={3}
                  placeholder="L&D will use this summary to identify training needs for employees rated below Outstanding or with Non-Submission status."
                  className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={closeLNDModal}
                disabled={isSendingLND}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitLNDReport}
                disabled={isSendingLND}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {isSendingLND ? 'Sending…' : 'Send to L&D'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
