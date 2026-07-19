/**
 * Employee Portal → "My Archive".
 *
 * The employee's own closed, rated IPCR semesters, read-only. Each entry opens
 * to its full MFO/PAP table (function, target, actual accomplishment, Q/E/T and
 * average), so they can see how their targets and performance have progressed.
 */

import { useEffect, useMemo, useState } from 'react';
import { Archive } from 'lucide-react';
import { getEmployeeArchive, type ArchiveSemester } from '../../lib/api/ipcrArchive';
import { getAdjectival } from '../admin/pm/SummaryOfRatings';
import { IpcrArchiveSemester } from '../admin/pm/IpcrArchiveSemester';

export const MyArchiveSection = ({ employeeNum }: { employeeNum: string }) => {
  const [semesters, setSemesters] = useState<ArchiveSemester[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await getEmployeeArchive(employeeNum);
      if (cancelled) return;
      setSemesters(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [employeeNum]);

  const career = useMemo(() => {
    const scores = semesters.map((s) => s.overall).filter((n): n is number => n != null);
    return scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;
  }, [semesters]);

  const adj = getAdjectival(career);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Archive className="h-6 w-6 text-indigo-600" />
          <div>
            <h2 className="text-xl font-bold text-slate-900">My Archive</h2>
            <p className="text-sm text-slate-500">Your closed and rated IPCR semesters</p>
          </div>
        </div>
        {career != null && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Career average</span>
            <span className="text-sm font-bold text-slate-900">{career.toFixed(2)}</span>
            <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase ${adj.pillClass}`}>{adj.label}</span>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading your archive…</p>
      ) : semesters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <Archive className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">No archived semesters yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
            Once an IPCR period is closed and rated, it becomes a permanent record here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {semesters.map((s, i) => (
            <IpcrArchiveSemester key={s.period} semester={s} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
};

export default MyArchiveSection;
