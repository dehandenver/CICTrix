/**
 * L&D Archive — historical training records, grouped by employee.
 *
 * Read-only view of `employee_training` (see lib/api/lndArchive). Each employee
 * card shows their identity/tenure and a table of every archived training with
 * the fields the archive spec calls for. Values come straight from the stored
 * records; attendance/remarks that were never captured show their documented
 * fallbacks rather than fabricated data.
 */

import { Archive, Building2, CalendarClock, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { listTrainingArchive, type ArchiveEmployee } from '../../lib/api/lndArchive';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const LndArchive = () => {
  const [records, setRecords] = useState<ArchiveEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [office, setOffice] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await listTrainingArchive();
      if (!cancelled) {
        setRecords(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const offices = useMemo(
    () => [...new Set(records.map((r) => r.department).filter((d): d is string => !!d))].sort(),
    [records],
  );

  const filtered = useMemo(
    () => (office === 'all' ? records : records.filter((r) => r.department === office)),
    [records, office],
  );

  const totalTrainings = useMemo(
    () => filtered.reduce((sum, e) => sum + e.trainings.length, 0),
    [filtered],
  );

  return (
    <div className="space-y-6 p-8">
      <section>
        <p className="text-sm font-medium text-gray-500">
          <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Archive
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-gray-900">
          <Archive className="h-7 w-7 text-blue-600" />
          L&D Archive
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Historical training records on file, grouped by employee. Read-only — sourced from completed
          training records; fields never captured are shown as such, not filled in.
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 font-semibold text-gray-700">
            <FileText className="h-3.5 w-3.5" /> {filtered.length} employee{filtered.length === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 font-semibold text-gray-700">
            {totalTrainings} training record{totalTrainings === 1 ? '' : 's'}
          </span>
        </div>
        {offices.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <Building2 className="h-4 w-4 text-gray-400" />
            <select
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All offices</option>
              {offices.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-500">
          Loading archive…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="No archived training records"
          description="Historical training records will appear here once they are on file for employees in the selected office."
        />
      ) : (
        <div className="space-y-5">
          {filtered.map((emp) => (
            <section key={emp.employeeId} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/60 px-5 py-4">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-900">{emp.name}</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {emp.position ?? '—'}
                    {emp.department ? ` · ${emp.department}` : ''}
                    {emp.employeeNumber ? ` · ${emp.employeeNumber}` : ''}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  <CalendarClock className="h-3.5 w-3.5" /> Hired {fmtDate(emp.dateHired)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-white text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2.5">Training Title</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5">Provider</th>
                      <th className="px-4 py-2.5">Date Conducted</th>
                      <th className="px-4 py-2.5 text-center">Hours</th>
                      <th className="px-4 py-2.5">Attendance</th>
                      <th className="px-4 py-2.5">Completion</th>
                      <th className="px-4 py-2.5">Certificate No.</th>
                      <th className="px-4 py-2.5">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {emp.trainings.map((t) => (
                      <tr key={t.id} className="hover:bg-gray-50/60">
                        <td className="px-4 py-3 font-medium text-gray-900">{t.title}</td>
                        <td className="px-4 py-3 text-gray-600">{t.category ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{t.provider ?? '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">{t.dateConducted}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{t.hours ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-400 italic">{t.attendanceStatus}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            {t.completionStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">{t.certificateNumber ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-400">{t.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
