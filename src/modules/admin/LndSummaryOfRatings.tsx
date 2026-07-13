import { ArrowLeft, ArrowUpDown, Building2, ChevronRight, RefreshCw, Search, Send, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { getIPCRRecordsFromGapView } from '../../lib/api/competencyGapAnalysis';
import { createTrainingRequest } from '../../lib/api/trainingRequests';
import { supabase as supabaseClient } from '../../lib/supabase';
import { REPORT_PERIOD, getAdjectival, groupByDept, type IPCRRatingRecord } from './pm/SummaryOfRatings';

const supabase = supabaseClient as any;

const TRAINING_CATS = [
  'Cultural Transformation',
  'Employee Development',
  'Leadership',
  'Technical',
] as const;

const COMPETENCY_LIST = [
  'Knowledge of Local Governance',
  'Public Administration Principles',
  'Community Engagement Skills',
  'Project Management in a Public Setting',
  'Fiscal Management/Budgeting for LGU',
  'Transparency and Accountability Practices',
  'Disaster Risk Reduction and Management',
  'Digital Literacy for Government Services',
  'Ethical Conduct and Public Service Standards',
  'Technical Writing for Government Documents',
  'Data and Records Management and Organization',
  'Public Communication Skills',
] as const;

type ModalEmployee = IPCRRatingRecord & { employeeId: string | null };

const fmtDate = (d: Date) =>
  d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

async function lookupEmployeeId(employeeNum: string): Promise<string | null> {
  const { data } = await supabase
    .from('employees')
    .select('id')
    .eq('employee_number', employeeNum)
    .maybeSingle();
  return data?.id ?? null;
}

export const LndSummaryOfRatings = () => {
  const [records, setRecords] = useState<IPCRRatingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [deptSortAsc, setDeptSortAsc] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // null → department landing view; a department name → drilled-in employee view
  const [activeDept, setActiveDept] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Per-row training request modal
  const [modalEmployee, setModalEmployee] = useState<ModalEmployee | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalCategory, setModalCategory] = useState('');
  const [modalCompetency, setModalCompetency] = useState('');
  const [modalJustification, setModalJustification] = useState('');
  const [modalDesiredProficiency, setModalDesiredProficiency] = useState(4);
  const [modalStatus, setModalStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [modalError, setModalError] = useState('');

  // Bulk modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkCompetency, setBulkCompetency] = useState('');
  const [bulkJustification, setBulkJustification] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await getIPCRRecordsFromGapView(REPORT_PERIOD);
      setRecords(data);
      setLastSynced(new Date());
    } catch (err) {
      console.error('Error loading IPCR records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRecords();
  }, []);

  // Department landing rows — grouped, with avg rating and low-performer counts.
  const deptRows = useMemo(() => {
    const groups = groupByDept(records);
    const rows = Array.from(groups.entries()).map(([department, g]) => {
      const lowCount =
        g.distribution.Unsatisfactory + g.distribution.Poor;
      return {
        department,
        count: g.records.length,
        avg: g._count > 0 ? g.avg : null,
        lowCount,
        nonSubmission: g.distribution['Non-Submission'],
      };
    });
    return rows.sort((a, b) => {
      const aAvg = a.avg ?? -1;
      const bAvg = b.avg ?? -1;
      return deptSortAsc ? aAvg - bAvg : bAvg - aAvg;
    });
  }, [records, deptSortAsc]);

  // Bottom quartile threshold — flag employees below the 25th percentile score
  const bottomQuartileThreshold = useMemo(() => {
    const scores = records
      .filter(r => r.numericalRating !== null)
      .map(r => r.numericalRating as number)
      .sort((a, b) => a - b);
    if (scores.length < 4) return -Infinity;
    return scores[Math.floor(scores.length * 0.25)];
  }, [records]);

  // Employees within the drilled-in department, searched + sorted by rating.
  const filteredSorted = useMemo(() => {
    if (!activeDept) return [];
    const term = searchTerm.toLowerCase();
    return records
      .filter(r => r.department === activeDept)
      .filter(r => !term || r.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const aScore = a.numericalRating ?? -1;
        const bScore = b.numericalRating ?? -1;
        return sortAsc ? aScore - bScore : bScore - aScore;
      });
  }, [records, searchTerm, activeDept, sortAsc]);

  const allVisibleIds = useMemo(
    () => new Set(filteredSorted.map(r => r.id)),
    [filteredSorted]
  );
  const allSelected =
    allVisibleIds.size > 0 && [...allVisibleIds].every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleRow = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(allVisibleIds));

  const enterDept = (dept: string) => {
    setActiveDept(dept);
    setSearchTerm('');
    setSelectedIds(new Set());
  };

  const backToDepartments = () => {
    setActiveDept(null);
    setSearchTerm('');
    setSelectedIds(new Set());
  };

  const openModal = async (record: IPCRRatingRecord) => {
    setModalBusy(true);
    setModalStatus('idle');
    const empId = await lookupEmployeeId(record.id);
    setModalEmployee({ ...record, employeeId: empId });
    setModalCategory('');
    setModalCompetency(record.competencies?.[0]?.name ?? '');
    setModalJustification(
      `Employee ${record.name} rated ${
        record.numericalRating !== null ? record.numericalRating.toFixed(2) : 'N/A'
      } (${REPORT_PERIOD}) — training recommended to address identified competency gap.`
    );
    setModalDesiredProficiency(4);
    setShowModal(true);
    setModalBusy(false);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalEmployee(null);
    setModalStatus('idle');
  };

  const submitRequest = async () => {
    if (!modalEmployee || !modalCategory || !modalCompetency) return;
    if (!modalEmployee.employeeId) {
      setModalStatus('error');
      setModalError(
        'Employee record not found in the system. Please create this request manually from the Training Requests page.'
      );
      return;
    }
    setModalBusy(true);
    const result = await createTrainingRequest({
      employee_id: modalEmployee.employeeId,
      title: `${modalCategory} — ${modalCompetency}`,
      category: modalCategory as (typeof TRAINING_CATS)[number],
      competency: modalCompetency,
      rationales: [modalJustification],
      current_proficiency: modalEmployee.numericalRating ?? 0,
      desired_proficiency: modalDesiredProficiency,
      after_training_metric: `Improved proficiency in ${modalCompetency}`,
    });
    setModalBusy(false);
    if (result.ok) {
      setModalStatus('success');
    } else {
      setModalStatus('error');
      setModalError(result.error ?? 'Unknown error.');
    }
  };

  const openBulkModal = () => {
    setBulkCategory('');
    setBulkCompetency('');
    setBulkJustification('');
    setBulkStatus('idle');
    setShowBulkModal(true);
  };

  const submitBulk = async () => {
    if (!bulkCategory || !bulkCompetency) return;
    setBulkBusy(true);
    let errorCount = 0;
    const selected = filteredSorted.filter(r => selectedIds.has(r.id));
    for (const record of selected) {
      const empId = await lookupEmployeeId(record.id);
      if (!empId) { errorCount++; continue; }
      const result = await createTrainingRequest({
        employee_id: empId,
        title: `${bulkCategory} — ${bulkCompetency}`,
        category: bulkCategory as (typeof TRAINING_CATS)[number],
        competency: bulkCompetency,
        rationales: [
          bulkJustification ||
            `Bulk training need identified from Summary of Ratings (${REPORT_PERIOD})`,
        ],
        current_proficiency: record.numericalRating ?? 0,
        desired_proficiency: 4,
        after_training_metric: `Improved proficiency in ${bulkCompetency}`,
      });
      if (!result.ok) errorCount++;
    }
    setBulkBusy(false);
    setBulkStatus(errorCount === 0 ? 'success' : 'error');
    if (errorCount === 0) setSelectedIds(new Set());
  };

  return (
    <div className="space-y-5 p-8">
      {/* Header */}
      <section>
        <p className="text-sm font-medium text-gray-500">
          <span className="text-blue-600">L&D</span>{' '}
          <span className="mx-1 text-gray-400">/</span>{' '}
          {activeDept === null ? (
            <span>Summary of Ratings</span>
          ) : (
            <>
              <button
                type="button"
                onClick={backToDepartments}
                className="text-blue-600 hover:underline"
              >
                Summary of Ratings
              </button>
              <span className="mx-1 text-gray-400">/</span> {activeDept}
            </>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            {activeDept !== null && (
              <button
                type="button"
                onClick={backToDepartments}
                className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-blue-600 transition"
              >
                <ArrowLeft className="h-4 w-4" /> All departments
              </button>
            )}
            <h1 className="text-3xl font-bold text-gray-900">
              {activeDept === null ? 'Summary of Ratings' : activeDept}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {activeDept === null
                ? 'IPCR performance ratings by department — Training Needs Assessment source · read-only'
                : `Employee ratings · sorted lowest-first · ${REPORT_PERIOD}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastSynced && (
              <span className="text-xs text-gray-400">
                Last synced {fmtDate(lastSynced)}
              </span>
            )}
            <button
              type="button"
              onClick={() => void fetchRecords()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {activeDept === null ? (
      /* ── Department landing table ─────────────────────────────── */
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <span className="text-sm text-gray-500">Loading…</span>
          </div>
        )}

        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {deptRows.length} department{deptRows.length !== 1 ? 's' : ''} · {records.length} employees
          </span>
          <button
            type="button"
            onClick={() => setDeptSortAsc(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {deptSortAsc ? 'Lowest avg first' : 'Highest avg first'}
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-12 items-center border-b border-gray-100 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <div className="col-span-5">Department</div>
          <div className="col-span-2 text-center">Employees</div>
          <div className="col-span-2 text-center">Avg Rating</div>
          <div className="col-span-2 text-center">Needs Attention</div>
          <div className="col-span-1" />
        </div>

        {deptRows.length === 0 && !loading ? (
          <div className="py-12">
            <EmptyState
              title="No departments found"
              description="No IPCR records are available to summarize yet."
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {deptRows.map(d => {
              const adj = getAdjectival(d.avg);
              return (
                <button
                  key={d.department}
                  type="button"
                  onClick={() => enterDept(d.department)}
                  className="grid w-full grid-cols-12 items-center px-5 py-4 text-left transition hover:bg-blue-50/40"
                >
                  <div className="col-span-5 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{d.department}</span>
                  </div>
                  <div className="col-span-2 text-center text-sm text-gray-600">{d.count}</div>
                  <div className="col-span-2 flex flex-col items-center gap-1">
                    <span className="text-sm font-bold text-gray-900">
                      {d.avg !== null ? d.avg.toFixed(2) : '—'}
                    </span>
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${adj.pillClass}`}
                    >
                      {adj.label}
                    </span>
                  </div>
                  <div className="col-span-2 text-center">
                    {d.lowCount > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        {d.lowCount} low
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                    {d.nonSubmission > 0 && (
                      <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {d.nonSubmission} no sub
                      </span>
                    )}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      ) : (
      <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search employees in this department…"
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <span className="ml-auto text-xs text-gray-400">
          {filteredSorted.length} employee{filteredSorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <span className="text-sm text-gray-500">Loading…</span>
          </div>
        )}

        {/* Sort toggle + selection count */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {someSelected
                ? `${selectedIds.size} selected`
                : `${filteredSorted.length} employees`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSortAsc(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortAsc ? 'Lowest to highest' : 'Highest to lowest'}
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-12 items-center border-b border-gray-100 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <div className="col-span-1" />
          <div className="col-span-3">Employee</div>
          <div className="col-span-2">Department</div>
          <div className="col-span-2">Position</div>
          <div className="col-span-1 text-center">Rating</div>
          <div className="col-span-2">Period</div>
          <div className="col-span-1" />
        </div>

        {/* Rows */}
        {filteredSorted.length === 0 && !loading ? (
          <div className="py-12">
            <EmptyState
              title="No records found"
              description="No IPCR records match the current filters."
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredSorted.map(row => {
              const isLow =
                row.numericalRating !== null &&
                row.numericalRating <= bottomQuartileThreshold;
              const adj = getAdjectival(row.numericalRating);
              const isSelected = selectedIds.has(row.id);
              return (
                <div
                  key={row.id}
                  className={[
                    'grid grid-cols-12 items-center border-l-4 px-5 py-3.5 transition hover:bg-gray-50/50',
                    isLow ? 'border-l-amber-400' : 'border-l-transparent',
                    isSelected ? 'bg-blue-50/30' : '',
                  ].join(' ')}
                >
                  <div className="col-span-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(row.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3">
                    <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                    {isLow && (
                      <span className="mt-0.5 inline-block text-[10px] font-semibold text-amber-600">
                        Low performer
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-sm text-gray-600">{row.department}</div>
                  <div className="col-span-2 text-xs text-gray-500 leading-snug pr-2">
                    {row.position}
                  </div>
                  <div className="col-span-1 flex flex-col items-center gap-1">
                    <span className="text-sm font-bold text-gray-900">
                      {row.numericalRating !== null
                        ? row.numericalRating.toFixed(2)
                        : '—'}
                    </span>
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${adj.pillClass}`}
                    >
                      {adj.label}
                    </span>
                  </div>
                  <div className="col-span-2 text-xs text-gray-500">{row.period}</div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void openModal(row)}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-300 px-2.5 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition whitespace-nowrap"
                    >
                      <Send className="h-3 w-3" /> Request
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}

      {/* Bulk action bar — floats at bottom when rows are selected */}
      {someSelected && (
        <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-6 py-3.5 shadow-xl">
          <span className="text-sm font-semibold text-gray-700">
            {selectedIds.size} employee{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="h-4 w-px bg-gray-200" />
          <button
            type="button"
            onClick={openBulkModal}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm"
          >
            <Send className="h-4 w-4" /> Send to Training Request
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Per-row Training Request Modal */}
      {showModal && modalEmployee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Send to Training Request</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Creates a pending training request for this employee
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Employee info card */}
            <div className="mx-6 rounded-xl bg-gray-50 px-4 py-3 text-sm">
              <p className="font-bold text-gray-900">{modalEmployee.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {modalEmployee.position} · {modalEmployee.department}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-500">IPCR Rating:</span>
                <span className="text-sm font-bold text-gray-800">
                  {modalEmployee.numericalRating !== null
                    ? modalEmployee.numericalRating.toFixed(2)
                    : '—'}
                </span>
                <span
                  className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    getAdjectival(modalEmployee.numericalRating).pillClass
                  }`}
                >
                  {getAdjectival(modalEmployee.numericalRating).label}
                </span>
              </div>
            </div>

            {modalStatus === 'success' ? (
              <div className="px-6 py-8 text-center">
                <p className="text-base font-semibold text-emerald-700">
                  Training request created.
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Visible in the Training Requests page for review and approval.
                </p>
                <button
                  type="button"
                  onClick={closeModal}
                  className="mt-5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4 px-6 pt-4 pb-6">
                {modalStatus === 'error' && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    {modalError}
                  </p>
                )}
                {!modalEmployee.employeeId && modalStatus !== 'error' && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Employee system record not found — the request may not link correctly.
                  </p>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Training Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={modalCategory}
                    onChange={e => setModalCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select category…</option>
                    {TRAINING_CATS.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Competency <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={modalCompetency}
                    onChange={e => setModalCompetency(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select competency…</option>
                    {COMPETENCY_LIST.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Justification
                  </label>
                  <textarea
                    value={modalJustification}
                    onChange={e => setModalJustification(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Desired Proficiency (1–5)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    step={0.5}
                    value={modalDesiredProficiency}
                    onChange={e => setModalDesiredProficiency(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitRequest()}
                    disabled={modalBusy || !modalCategory || !modalCompetency}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                    {modalBusy ? 'Submitting…' : 'Create Request'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Training Request Modal */}
      {showBulkModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !bulkBusy && setShowBulkModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Bulk Training Requests</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {selectedIds.size} employee{selectedIds.size !== 1 ? 's' : ''} selected
                </p>
              </div>
              <button
                type="button"
                onClick={() => !bulkBusy && setShowBulkModal(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {bulkStatus === 'success' ? (
              <div className="px-6 py-8 text-center">
                <p className="text-base font-semibold text-emerald-700">
                  Training requests created for {selectedIds.size} employees.
                </p>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="mt-5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4 px-6 pt-2 pb-6">
                {bulkStatus === 'error' && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Some requests could not be created — employees without a matching system
                    record were skipped.
                  </p>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Training Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={bulkCategory}
                    onChange={e => setBulkCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select category…</option>
                    {TRAINING_CATS.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Competency <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={bulkCompetency}
                    onChange={e => setBulkCompetency(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select competency…</option>
                    {COMPETENCY_LIST.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Justification{' '}
                    <span className="font-normal text-gray-400">(applied to all)</span>
                  </label>
                  <textarea
                    value={bulkJustification}
                    onChange={e => setBulkJustification(e.target.value)}
                    rows={2}
                    placeholder={`Bulk training need from Summary of Ratings (${REPORT_PERIOD})`}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowBulkModal(false)}
                    disabled={bulkBusy}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitBulk()}
                    disabled={bulkBusy || !bulkCategory || !bulkCompetency}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                    {bulkBusy
                      ? 'Creating…'
                      : `Create ${selectedIds.size} Request${selectedIds.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
