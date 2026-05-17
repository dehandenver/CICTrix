import { type IPCRRatingRecord, getAdjectival } from './SummaryOfRatings';

interface IPCRReportViewProps {
  records: IPCRRatingRecord[];
  department: string;
  period: string;
}

/**
 * Read-only, official-format IPCR table for embedding inside report-viewing
 * surfaces (e.g. L&D's PM Reports page). Mirrors the styling of the per-dept
 * group inside SummaryOfRatings, minus pagination, expand/collapse, and any
 * action affordances — this is purely a snapshot view.
 */
export const IPCRReportView = ({ records, department, period }: IPCRReportViewProps) => {
  if (!records || records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
        No per-employee records were included with this report.
      </div>
    );
  }

  const ratedRecords = records.filter((r) => r.numericalRating !== null);
  const avg =
    ratedRecords.length > 0
      ? ratedRecords.reduce((sum, r) => sum + (r.numericalRating as number), 0) / ratedRecords.length
      : 0;
  const deptAvgAdj = getAdjectival(avg);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Banner — matches the dark-slate header on the SummaryOfRatings tab */}
      <div className="bg-[#1e293b] px-5 py-3 text-white">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
          IPCR — Individual Performance Commitment and Review
        </p>
        <h3 className="text-lg font-bold leading-tight">{department}</h3>
        <p className="text-xs text-slate-400 mt-1">
          Period: {period} &bull; {records.length} employees
        </p>
      </div>

      {/* Column headers */}
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

      {/* Rows */}
      <div className="divide-y divide-slate-100">
        {records.map((row, idx) => {
          const adj = getAdjectival(row.numericalRating);
          return (
            <div key={row.id ?? `${idx}-${row.name}`} className="grid grid-cols-12 items-stretch min-h-[48px]">
              <div className="col-span-1 px-2 py-3 text-sm text-slate-600 border-r border-slate-100 flex items-center justify-center">
                {idx + 1}
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
                  <span className="font-bold text-slate-800 text-sm">
                    {row.numericalRating !== null ? row.numericalRating.toFixed(2) : '—'}
                  </span>
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
                <span className={`inline-flex items-center rounded-sm border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  row.submissionStatus === 'SUBMITTED' ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                  : row.submissionStatus === 'OVERDUE' ? 'border-red-200 bg-red-50 text-red-600'
                  : 'border-orange-200 bg-orange-50 text-orange-600'
                }`}>
                  {row.submissionStatus}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Department average row */}
      <div className="grid grid-cols-12 items-stretch bg-slate-50/80 border-t-2 border-slate-200 min-h-[48px]">
        <div className="col-span-7 px-4 py-3 border-r border-slate-200 flex items-center justify-end">
          <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">{department} AVERAGE RATING</span>
        </div>
        <div className="col-span-2 flex border-r border-slate-200">
          <div className="w-1/2 border-r border-slate-200 py-3 flex items-center justify-center">
            <span className="font-bold text-blue-600 text-sm">{avg > 0 ? avg.toFixed(4) : 'N/A'}</span>
          </div>
          <div className="w-1/2 py-3 flex items-center justify-center px-2">
            {avg > 0 && (
              <span className={`inline-flex items-center justify-center w-full max-w-full rounded px-2 py-1 text-[10px] font-bold uppercase text-center leading-tight whitespace-normal break-words ${deptAvgAdj.pillClass}`}>
                {deptAvgAdj.label}
              </span>
            )}
          </div>
        </div>
        <div className="col-span-3"></div>
      </div>
    </div>
  );
};
