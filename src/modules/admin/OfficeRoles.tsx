import { Building2, Eye, ShieldAlert, UserCog } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { getDepartmentIdOptions, type DepartmentOption } from '../../lib/api/departments';
import { listOfficeRolesReadOnly, ROLE_LABELS, type OfficeRoleAssignment } from '../../lib/api/officeRoles';

/**
 * Read-only view of who holds which office role.
 *
 * L&D needs to know which office has a Dept Head — a draft targeting an office
 * without one can never be reviewed. It does not need, and must not have, the
 * ability to grant roles: assigning a Dept Head mints Office Account credentials
 * and reroutes pending IPCR submissions, so it stays in System Administration.
 * Letting L&D appoint the reviewer of L&D's own drafts would collapse the
 * separation of duties.
 */
export const OfficeRoles = () => {
  const [assignments, setAssignments] = useState<OfficeRoleAssignment[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listOfficeRolesReadOnly(), getDepartmentIdOptions()]).then(([a, d]) => {
      if (cancelled) return;
      setAssignments(a);
      setDepartments(d);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // One row per office, so an office with no Dept Head is visible by its absence
  // of one — the whole point of this page.
  const offices = useMemo(() => {
    return departments
      .map((dept) => {
        const held = assignments.filter((a) => a.office_id === dept.value);
        return {
          officeId: dept.value,
          officeName: dept.label,
          deptHead: held.find((a) => a.role === 'DeptHead') ?? null,
          supervisors: held.filter((a) => a.role === 'Supervisor'),
        };
      })
      .sort((a, b) => a.officeName.localeCompare(b.officeName));
  }, [assignments, departments]);

  const missingHeads = offices.filter((o) => !o.deptHead).length;

  return (
    <div className="space-y-6 p-6 md:p-8">
      <section>
        <p className="text-sm font-medium text-gray-500">
          <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Office Roles
        </p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Office Roles</h1>
        <p className="mt-1 text-sm text-gray-500">
          Who reviews each office's training drafts. Read-only.
        </p>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <p className="text-sm text-slate-600">
          Roles are granted in <span className="font-semibold">System Administration → Access &amp; Role
          Management</span>, which requires a super-admin login. L&D can see assignments here but cannot
          change them.
        </p>
      </div>

      {!loading && missingHeads > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            <span className="font-semibold">{missingHeads}</span> of {offices.length} offices have no
            Department Head. A training draft targeting one of them cannot be sent for review, and a
            confirmed plan entry for it cannot be promoted.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 relative min-h-[200px]">
        {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 rounded-2xl" />}
        {!loading && offices.length === 0 ? (
          <EmptyState icon={Building2} title="No offices" description="No active departments are configured." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Office</th>
                  <th className="px-4 py-3 font-semibold">{ROLE_LABELS.DeptHead}</th>
                  <th className="px-4 py-3 font-semibold">{ROLE_LABELS.Supervisor}(s)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {offices.map((o) => (
                  <tr key={o.officeId} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{o.officeName}</td>
                    <td className="px-4 py-3">
                      {o.deptHead ? (
                        <span className="inline-flex items-center gap-1.5 text-gray-800">
                          <UserCog className="h-3.5 w-3.5 text-emerald-600" />
                          {o.deptHead.employee_name}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          None assigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {o.supervisors.length === 0
                        ? <span className="text-gray-400">—</span>
                        : o.supervisors.map((s) => s.employee_name).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
