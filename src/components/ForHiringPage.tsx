import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminHeader } from './AdminHeader';
import { ApplicantsTabBar } from './ApplicantsTabBar';
import { Sidebar } from './Sidebar';
import { hireApplicant } from '../lib/api/employeesApi';
import {
  ensureRecruitmentSeedData,
  getApplicants,
  saveApplicants,
} from '../lib/recruitmentData';
import { sendEmail } from '../lib/email';
import { createPassword, upsertEmployeePortalAccount } from '../lib/employeePortalData';
import { supabase } from '../lib/supabase';
import { CheckCircle, Printer, UserCheck, Users, XCircle } from 'lucide-react';

interface HiringRow {
  id: string;
  fullName: string;
  email: string;
  position: string;
  department: string;
  score: number;
  status: string;
}

interface CredentialResult {
  fullName: string;
  employeeId: string;
  tempPassword: string;
  email: string;
  emailSent: boolean;
  position: string;
  department: string;
}

// 'hired' must be a separate exact match because it is a substring of
// 'recommended for hiring', so the includes() check alone would catch it.
// We keep both: 'hired' for the old-flow applicants marked directly from
// the ranking page, and 'recommended for hiring' for the new flow.
const QUALIFY_STATUSES = ['qualified', 'recommended for hiring', 'accepted', 'for hiring'];
const EXACT_QUALIFY = ['hired'];

const isForHiring = (status: string) => {
  const s = status.toLowerCase().trim();
  return QUALIFY_STATUSES.some(q => s.includes(q)) || EXACT_QUALIFY.includes(s);
};

export const ForHiringPage = () => {
  const [rows, setRows] = useState<HiringRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmTarget, setConfirmTarget] = useState<HiringRow[] | null>(null);
  const [hiring, setHiring] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [credentialsResult, setCredentialsResult] = useState<CredentialResult[]>([]);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        ensureRecruitmentSeedData();
        const local = getApplicants().filter(a => isForHiring(a.status));

        const supabaseRows: HiringRow[] = [];
        // Always attempt Supabase regardless of mock mode — fall back silently on failure.
        try {
          const { data } = await (supabase as any)
            .from('applicants')
            .select('id,first_name,last_name,middle_name,full_name,email,position,office,department,status,qualification_score,total_score')
            .order('office', { ascending: true });

          const localIds = new Set(local.map(a => a.id));
          const newLocalEntries: any[] = [];

          (data ?? []).forEach((r: any) => {
            const status = String(r.status ?? '');
            if (!isForHiring(status)) return;

            const fullName = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')
              || r.full_name
              || '';
            const row: HiringRow = {
              id: String(r.id),
              fullName: fullName || (r.email ? String(r.email).split('@')[0] : '—'),
              email: r.email ?? '',
              position: r.position ?? '—',
              department: r.office ?? r.department ?? '—',
              score: Number(r.qualification_score ?? r.total_score ?? 0),
              status,
            };

            if (!localIds.has(row.id)) {
              supabaseRows.push(row);

              // Sync this Supabase-only applicant into localStorage so future
              // loads work even when Supabase is unavailable.
              const nameParts = (row.fullName || '').split(/\s+/);
              newLocalEntries.push({
                id: row.id,
                jobPostingId: 'supabase-sync',
                personalInfo: {
                  firstName: nameParts[0] || '',
                  lastName: nameParts.slice(1).join(' ') || '',
                  email: row.email,
                  phone: '', address: '', dateOfBirth: '',
                },
                position: row.position,
                department: row.department,
                office: row.department,
                qualificationScore: row.score,
                status: row.status as any,
                education: [], experience: [], skills: [],
                certifications: [], documents: [],
                applicationDate: new Date().toISOString(),
              });
            }
          });

          // Persist newly discovered applicants to localStorage
          if (newLocalEntries.length > 0) {
            saveApplicants([...getApplicants(), ...newLocalEntries]);
          }
        } catch {
          // Supabase unavailable — local store only
        }

        const localMapped: HiringRow[] = local.map(a => {
          const fullName = [a.personalInfo.firstName, a.personalInfo.lastName].filter(Boolean).join(' ')
            || a.personalInfo.email?.split('@')[0]
            || '—';
          return {
            id: a.id,
            fullName,
            email: a.personalInfo.email ?? '',
            position: (a as any).position ?? (a as any).jobPosting?.title ?? '—',
            department: (a as any).department ?? (a as any).office ?? (a as any).jobPosting?.department ?? '—',
            score: Number(a.qualificationScore ?? 0),
            status: a.status,
          };
        });

        const all = [...localMapped, ...supabaseRows];
        all.sort((a, b) =>
          a.department.localeCompare(b.department) || a.position.localeCompare(b.position)
        );
        setRows(all);
      } finally {
        setLoading(false);
      }
    };
    void load();
    window.addEventListener('cictrix:applicants-updated', load);
    return () => window.removeEventListener('cictrix:applicants-updated', load);
  }, []);

  const groupedByDept = useMemo(() => {
    const map = new Map<string, HiringRow[]>();
    rows.forEach(r => {
      const dept = r.department || '—';
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(r);
    });
    return map;
  }, [rows]);

  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(r => r.id)));
    }
  };

  const handleCreateClick = () => {
    const targets = rows.filter(r => selected.has(r.id));
    if (targets.length === 0) return;
    setConfirmTarget(targets);
  };

  const handleConfirmHire = async () => {
    if (!confirmTarget) return;
    setHiring(true);

    const hiredIds: string[] = [];
    const failed: string[] = [];
    const newCredentials: CredentialResult[] = [];

    for (const row of confirmTarget) {
      // Step 1 — attempt to create the official employee record via the API.
      // If the backend is unavailable we fall back to a provisional ID so that
      // credential generation, portal account creation, and email sending can
      // still complete in the same transaction.
      let employeeId: string;
      let backendSuccess = false;
      try {
        const employeeRow = await hireApplicant(row.id);
        employeeId = employeeRow?.employee_id || '';
        backendSuccess = Boolean(employeeId);
      } catch {
        employeeId = '';
      }

      // Fallback: generate a provisional Employee ID if the backend did not
      // return one. Format: EMP-YYYY-NNNN (last 4 digits of timestamp).
      if (!employeeId) {
        const year = new Date().getFullYear();
        const seq = String(Date.now()).slice(-4);
        employeeId = `EMP-${year}-${seq}`;
      }

      // Step 2 — generate credentials and provision the portal account.
      const tempPassword = createPassword();

      upsertEmployeePortalAccount({
        id: `portal-${employeeId}`,
        username: employeeId,
        password: tempPassword,
        mustChangePassword: true,
        employee: {
          employeeId,
          fullName: row.fullName,
          email: row.email,
          position: row.position,
          department: row.department,
          status: 'Active',
          hireDate: new Date().toISOString().split('T')[0],
        } as any,
      });

      // Step 3 — update local recruitment store status to Hired.
      const applicants = getApplicants();
      saveApplicants(
        applicants.map(a =>
          a.id === row.id ? { ...a, status: 'Hired' as any } : a
        )
      );

      hiredIds.push(row.id);

      // Step 4 — send credentials email. Non-blocking: failure here does not
      // abort onboarding; HR can always use Print Credentials instead.
      let emailSent = false;
      const recipient = row.email.trim();
      if (recipient) {
        try {
          await sendEmail({
            to: recipient,
            subject: 'Your ABYAN HRIS account is ready',
            body:
              `Hello ${row.fullName},\n\n` +
              `Your employee account has been created in the ABYAN HRIS.\n\n` +
              `Position : ${row.position}\n` +
              `Department: ${row.department}\n\n` +
              `Employee ID      : ${employeeId}\n` +
              `Temporary password: ${tempPassword}\n\n` +
              `Please log in to the Employee Portal and change your password before accessing any module.\n` +
              (backendSuccess ? '' : `\nNote: Your employee record is being finalised. Please contact HR if you experience any access issues.\n`) +
              `\nIf you did not expect this email, please contact HR immediately.\n`,
            employeeId,
            template: 'employee_credentials',
          });
          emailSent = true;
        } catch {
          // Email unavailable — HR can distribute credentials via Print Credentials
        }
      }

      // Step 5 — collect for the credentials modal.
      newCredentials.push({
        fullName: row.fullName,
        employeeId,
        tempPassword,
        email: recipient,
        emailSent,
        position: row.position,
        department: row.department,
      });
    }

    setHiring(false);
    setConfirmTarget(null);
    setSelected(new Set());
    setRows(prev => prev.filter(r => !hiredIds.includes(r.id)));

    if (newCredentials.length > 0) {
      setCredentialsResult(newCredentials);
      setShowCredentialsModal(true);
    }

    if (failed.length > 0) {
      showToast(`Failed to hire: ${failed.join(', ')}`, 'error');
    }
  };

  const handlePrintCredentials = () => {
    const win = window.open('', '_blank', 'width=700,height=600');
    if (!win) return;

    const dateStr = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const rows = credentialsResult.map(c => `
      <tr>
        <td><strong>${c.fullName}</strong></td>
        <td>${c.position || '&mdash;'}</td>
        <td>${c.department || '&mdash;'}</td>
        <td class="mono">${c.employeeId}</td>
        <td class="mono">${c.tempPassword}</td>
        <td>${c.email || '&mdash;'}</td>
        <td class="${c.emailSent ? 'sent' : 'notsent'}">${c.emailSent ? '&#10003; Sent' : 'Not sent'}</td>
      </tr>`).join('');

    win.document.head.innerHTML = `
      <title>Employee Credentials</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #000; }
        h2 { font-size: 18px; margin-bottom: 4px; }
        p.sub { font-size: 12px; color: #555; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #000; color: #fff; padding: 8px 12px; font-size: 11px; text-align: left; }
        td { padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #ccc; }
        .mono { font-family: 'Courier New', monospace; font-weight: bold; }
        .sent { font-weight: bold; }
        .notsent { font-style: italic; }
        .footer { margin-top: 32px; font-size: 10px; color: #555; border-top: 1px solid #ccc; padding-top: 12px; }
        @media print { body { padding: 16px; } }
      </style>`;

    win.document.body.innerHTML = `
      <h2>Employee Onboarding Credentials</h2>
      <p class="sub">Generated ${dateStr} &mdash; Office of the City Human Resource Management Officer, Iloilo City Government</p>
      <table>
        <thead>
          <tr>
            <th>Full Name</th>
            <th>Position</th>
            <th>Department</th>
            <th>Employee ID</th>
            <th>Temporary Password</th>
            <th>Email</th>
            <th>Email Sent</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">
        Employees must change their temporary password upon first login. Keep this document confidential.
      </div>`;

    win.focus();
    win.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
        <div className="admin-layout">
          <Sidebar activeModule="RSP" userRole="rsp" />
          <main className="admin-content bg-slate-50 !p-0">
            <ApplicantsTabBar />
            <div className="flex items-center justify-center p-16 text-slate-500">Loading…</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
      <div className="admin-layout">
        <Sidebar activeModule="RSP" userRole="rsp" />
        <main className="admin-content bg-slate-50 !p-0">
          <ApplicantsTabBar />

          <div className="p-6">
            {/* Toast */}
            {toast && (
              <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-semibold ${toast.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {toast.message}
              </div>
            )}

            <div className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">For Hiring</h1>
                <p className="text-sm text-slate-500">
                  Applicants who have completed all recruitment stages and obtained the required scores are listed below.
                </p>
              </div>
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={handleCreateClick}
                className="inline-flex items-center gap-2 rounded-xl bg-[#363EE8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <UserCheck className="h-4 w-4" />
                Create Employee Record{selected.size > 1 ? `s (${selected.size})` : ''}
              </button>
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-slate-400">
                <Users className="mb-3 h-10 w-10" />
                <p className="font-medium">No applicants ready for hiring yet.</p>
                <p className="mt-1 text-sm">Qualified applicants will appear here once all stages are completed.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full min-w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.size === rows.length && rows.length > 0}
                          onChange={toggleAll}
                          className="h-4 w-4 accent-[#363EE8]"
                          title="Select all"
                        />
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Applicant Name</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Score</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(groupedByDept.entries()).map(([dept, deptRows]) => (
                      <>
                        <tr key={`dept-${dept}`} className="bg-[#363EE8]/5 border-b border-slate-200">
                          <td colSpan={6} className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-[#363EE8]">
                            {dept}
                          </td>
                        </tr>
                        {deptRows.map(row => (
                          <tr
                            key={row.id}
                            className={`border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50 ${selected.has(row.id) ? 'bg-blue-50/60' : ''}`}
                          >
                            <td className="px-4 py-4 text-center">
                              <input
                                type="checkbox"
                                checked={selected.has(row.id)}
                                onChange={() => toggleRow(row.id)}
                                className="h-4 w-4 accent-[#363EE8]"
                              />
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold text-slate-900">{row.fullName}</p>
                              <p className="text-xs text-slate-400">{row.email}</p>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-700">{row.position}</td>
                            <td className="px-5 py-4">
                              <span className="inline-flex rounded-full bg-[#363EE8]/10 px-2.5 py-0.5 text-xs font-semibold text-[#363EE8]">
                                {row.department}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                              {row.score > 0 ? `${row.score.toFixed(1)}%` : '—'}
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Confirmation Dialog */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#363EE8]/10">
              <UserCheck className="h-6 w-6 text-[#363EE8]" />
            </div>
            <h2 className="mb-2 text-lg font-bold text-slate-900">Confirm Employee Record Creation</h2>

            {confirmTarget.length === 1 ? (
              <p className="text-sm text-slate-600">
                Are you sure you want to hire{' '}
                <strong>{confirmTarget[0].fullName}</strong> for the position of{' '}
                <strong>{confirmTarget[0].position}</strong> under the{' '}
                <strong>{confirmTarget[0].department}</strong> department? This action will create an employee record and generate a system account.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-600">
                  Are you sure you want to create employee records for the following{' '}
                  <strong>{confirmTarget.length} applicants</strong>? This action will create employee records and generate system accounts.
                </p>
                <ul className="mb-3 max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {confirmTarget.map(r => (
                    <li key={r.id} className="px-3 py-2">
                      <p className="text-sm font-semibold text-slate-800">{r.fullName}</p>
                      <p className="text-xs text-slate-500">{r.position} — {r.department}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={hiring}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmHire}
                disabled={hiring}
                className="rounded-xl bg-[#363EE8] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {hiring ? 'Creating…' : 'Yes, Create Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCredentialsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-200">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-slate-900">Employee Records Created</h2>
                <p className="text-sm text-slate-500">
                  {credentialsResult.length} employee account{credentialsResult.length > 1 ? 's' : ''} generated. Credentials have been sent to each employee's registered email where available.
                </p>
              </div>
            </div>

            {/* Credentials Table */}
            <div className="overflow-auto flex-1 px-6 py-4" ref={printAreaRef}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Name</th>
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Position / Dept.</th>
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Employee ID</th>
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Temporary Password</th>
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Email Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {credentialsResult.map((c, i) => (
                    <tr key={i} className="py-3">
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-slate-900">{c.fullName}</p>
                        <p className="text-xs text-slate-400">{c.email || '—'}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-sm text-slate-700">{c.position || '—'}</p>
                        <p className="text-xs text-slate-400">{c.department || '—'}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-mono font-semibold text-[#040E6B]">{c.employeeId}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-mono text-slate-800">{c.tempPassword}</span>
                      </td>
                      <td className="py-3">
                        {c.email ? (
                          c.emailSent ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                              <CheckCircle className="h-3 w-3" /> Sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                              <XCircle className="h-3 w-3" /> Not sent
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">No email</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-xs text-slate-400">
                Employees must change their temporary password upon first login. Keep this document confidential.
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={handlePrintCredentials}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <Printer className="h-4 w-4" />
                Print Credentials
              </button>
              <button
                type="button"
                onClick={() => setShowCredentialsModal(false)}
                className="rounded-xl bg-[#363EE8] px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
