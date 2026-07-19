/**
 * One archived IPCR semester, rendered as its full MFO/PAP table.
 * Shared by the PM Admin "Archive" and the employee "My Archive" so both show an
 * identical, read-only historical record.
 */

import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { useState } from 'react';
import type { ArchiveSemester } from '../../../lib/api/ipcrArchive';
import { getAdjectival } from './SummaryOfRatings';

const FUNCTION_BADGE: Record<string, string> = {
  CORE: 'bg-blue-100 text-blue-700',
  STRATEGIC: 'bg-purple-100 text-purple-700',
  SUPPORT: 'bg-teal-100 text-teal-700',
};

const scoreCell = (v: number | null) => (v == null ? '—' : v.toFixed(2).replace(/\.00$/, ''));

export const IpcrArchiveSemester = ({
  semester,
  defaultOpen = false,
}: {
  semester: ArchiveSemester;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const adj = getAdjectival(semester.overall);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/60"
      >
        <span className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
          <span className="min-w-0">
            <span className="block font-bold text-slate-900">{semester.period}</span>
            <span className="block text-xs text-slate-400">
              {semester.rows.length} target{semester.rows.length === 1 ? '' : 's'}
              {semester.position ? ` · ${semester.position}` : ''}
              {semester.ipcrId ? ` · ${semester.ipcrId}` : ''}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-bold text-slate-900">{semester.overall != null ? semester.overall.toFixed(2) : '—'}</span>
          <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase ${adj.pillClass}`}>{adj.label}</span>
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Function</th>
                <th className="px-4 py-2.5 font-semibold">Success indicator (target + measure)</th>
                <th className="px-4 py-2.5 font-semibold">Actual accomplishment</th>
                <th className="px-3 py-2.5 text-center font-semibold">Q</th>
                <th className="px-3 py-2.5 text-center font-semibold">E</th>
                <th className="px-3 py-2.5 text-center font-semibold">T</th>
                <th className="px-3 py-2.5 text-center font-semibold">Ave</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {semester.rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase ${FUNCTION_BADGE[r.functionType] ?? 'bg-slate-100 text-slate-600'}`}>
                      {r.functionType}
                    </span>
                    {r.competency && <p className="mt-1 text-[11px] leading-snug text-slate-400">{r.competency}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.target || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.accomplishment || '—'}</td>
                  <td className="px-3 py-3 text-center text-slate-700">{scoreCell(r.quality)}</td>
                  <td className="px-3 py-3 text-center text-slate-700">{scoreCell(r.efficiency)}</td>
                  <td className="px-3 py-3 text-center text-slate-700">{scoreCell(r.timeliness)}</td>
                  <td className="px-3 py-3 text-center font-bold text-slate-900">{scoreCell(r.average)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="flex items-center gap-1.5 border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-400">
            <Lock className="h-3 w-3" /> Archived record — closed and rated; read-only.
          </p>
        </div>
      )}
    </div>
  );
};

export default IpcrArchiveSemester;
