import { useEffect, useMemo, useState } from 'react';
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
import {
  ArrowLeft,
  Building2,
  CheckCircle,
  ChevronRight,
  Printer,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';

interface HiringRow {
  id: string;
  fullName: string;
  email: string;
  position: string;
  department: string;
  interviewScore: number | null;
  examScore: number | null;
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

const QUALIFY_STATUSES = ['qualified', 'recommended for hiring', 'accepted', 'for hiring'];
const EXACT_QUALIFY = ['hired'];

const isForHiring = (status: string) => {
  const s = status.toLowerCase().trim();
  return QUALIFY_STATUSES.some(q => s.includes(q)) || EXACT_QUALIFY.includes(s);
};

const fmtScore = (v: number | null) => (v != null ? v.toFixed(2) : '—');

export const ForHiringPage = () => {
  const [rows, setRows]                         = useState<HiringRow[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [selectedDept, setSelectedDept]         = useState<string | null>(null);
  const [selected, setSelected]                 = useState<Set<string>>(new Set());
  const [confirmTarget, setConfirmTarget]       = useState<HiringRow[] | null>(null);
  const [hiring, setHiring]                     = useState(false);
  const [credentialsResult, setCredentialsResult] = useState<CredentialResult[]>([]);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        ensureRecruitmentSeedData();
        const local = getApplicants().filter(a => isForHiring(a.status));

        const remoteData: any[] = [];
        try {
          const res = await fetch('/api/applicants/?skip=0&limit=5000');
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json)) remoteData.push(...json);
          }
        } catch { /* fallback */ }

        if (remoteData.length === 0) {
          try {
            const { data } = await (supabase as any)
              .from('applicants')
              .select('id,first_name,last_name,middle_name,full_name,email,position,office,department,status,qualification_score,total_score');
            if (Array.isArray(data)) remoteData.push(...data);
          } catch { /* local store only */ }
        }

        // Build remote map — API data is authoritative
        const remoteMap = new Map<string, HiringRow>();
        const newLocalEntries: any[] = [];

        remoteData.forEach((r: any) => {
          const status = String(r.status ?? '');
          if (!isForHiring(status)) return;

          const fullName = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')
            || r.full_name || '';
          const row: HiringRow = {
            id:            String(r.id),
            fullName:      fullName || (r.email ? String(r.email).split('@')[0] : '—'),
            email:         r.email ?? '',
            position:      r.position || '',
            department:    r.office || r.department || '',
            interviewScore: r.total_score        != null ? Number(r.total_score)        : null,
            examScore:      r.qualification_score != null ? Number(r.qualification_score) : null,
            status,
          };
          remoteMap.set(row.id, row);

          const existsLocally = local.some(a => a.id === row.id);
          if (!existsLocally) {
            const nameParts = (row.fullName || '').split(/\s+/);
            newLocalEntries.push({
              id: row.id,
              jobPostingId: 'supabase-sync',
              personalInfo: {
                firstName: nameParts[0] || '',
                lastName:  nameParts.slice(1).join(' ') || '',
                email:     row.email,
                phone: '', address: '', dateOfBirth: '',
              },
              position:         row.position,
              department:       row.department,
              office:           row.department,
              qualificationScore: row.examScore ?? 0,
              status:           row.status as any,
              education: [], experience: [], skills: [],
              certifications: [], documents: [],
              applicationDate: new Date().toISOString(),
            });
          }
        });

        if (newLocalEntries.length > 0) {
          saveApplicants([...getApplicants(), ...newLocalEntries]);
        }

        // Merge: local baseline, then remote overwrites
        const mergedMap = new Map<string, HiringRow>();
        local.forEach(a => {
          const fullName = [a.personalInfo.firstName, a.personalInfo.lastName].filter(Boolean).join(' ')
            || a.personalInfo.email?.split('@')[0] || '—';
          mergedMap.set(a.id, {
            id:            a.id,
            fullName,
            email:         a.personalInfo.email ?? '',
            position:      (a as any).position ?? '',
            department:    (a as any).department ?? (a as any).office ?? '',
            interviewScore: null,
            examScore:      Number(a.qualificationScore ?? 0) || null,
            status:         a.status,
          });
        });
        remoteMap.forEach((row, id) => mergedMap.set(id, row));

        const all = Array.from(mergedMap.values()).sort((a, b) =>
          (a.department || 'zzz').localeCompare(b.department || 'zzz') ||
          (a.position   || 'zzz').localeCompare(b.position   || 'zzz')
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

  // ── Department folder list ────────────────────────────────────────────────
  const departmentList = useMemo(() => {
    const map = new Map<string, { positions: Set<string>; count: number }>();
    rows.forEach(r => {
      const dept = r.department || 'No Department';
      if (!map.has(dept)) map.set(dept, { positions: new Set(), count: 0 });
      const entry = map.get(dept)!;
      entry.positions.add(r.position || 'No Position');
      entry.count++;
    });
    return Array.from(map.entries())
      .map(([dept, { positions, count }]) => ({
        dept,
        positionCount:  positions.size,
        applicantCount: count,
      }))
      .sort((a, b) => a.dept.localeCompare(b.dept));
  }, [rows]);

  // ── Applicants for the selected department, sorted by interview score ─────
  const deptApplicants = useMemo(() => {
    if (!selectedDept) return [];
    return rows
      .filter(r => (r.department || 'No Department') === selectedDept)
      .sort((a, b) => (b.interviewScore ?? b.examScore ?? -1) - (a.interviewScore ?? a.examScore ?? -1));
  }, [rows, selectedDept]);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleRow = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () => {
    if (selected.size === deptApplicants.length && deptApplicants.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(deptApplicants.map(r => r.id)));
    }
  };

  const handleCreateClick = () => {
    const targets = deptApplicants.filter(r => selected.has(r.id));
    if (targets.length === 0) return;
    setConfirmTarget(targets);
  };

  // ── Hiring flow ───────────────────────────────────────────────────────────
  const handleConfirmHire = async () => {
    if (!confirmTarget) return;
    setHiring(true);

    const hiredIds: string[] = [];
    const newCredentials: CredentialResult[] = [];

    for (const row of confirmTarget) {
      let employeeId = '';
      let backendSuccess = false;
      try {
        const employeeRow = await hireApplicant(row.id);
        employeeId = employeeRow?.employee_id || '';
        backendSuccess = Boolean(employeeId);
      } catch { /* fallback below */ }

      if (!employeeId) {
        const year = new Date().getFullYear();
        const rnd  = String(Math.floor(Math.random() * 9000) + 1000);
        employeeId = `EMP-${year}-${rnd}`;
      }

      const tempPassword = createPassword();

      upsertEmployeePortalAccount({
        id:       `portal-${employeeId}`,
        username: employeeId,
        password: tempPassword,
        mustChangePassword: true,
        employee: {
          employeeId,
          fullName:   row.fullName,
          email:      row.email,
          position:   row.position,
          department: row.department,
          status:     'Active',
          hireDate:   new Date().toISOString().split('T')[0],
        } as any,
      });

      try {
        await (supabase as any)
          .from('applicants')
          .update({ status: 'Hired' })
          .eq('id', row.id);
      } catch { /* continue */ }

      saveApplicants(
        getApplicants().map(a => a.id === row.id ? { ...a, status: 'Hired' as any } : a)
      );
      hiredIds.push(row.id);

      let emailSent = false;
      const recipient = row.email.trim();
      if (recipient) {
        try {
          await sendEmail({
            to:      recipient,
            subject: 'Your ABYAN HRIS account is ready',
            body:
              `Hello ${row.fullName},\n\n` +
              `Your employee account has been created in the ABYAN HRIS.\n\n` +
              `Position  : ${row.position || '—'}\n` +
              `Department: ${row.department || '—'}\n\n` +
              `Employee ID       : ${employeeId}\n` +
              `Temporary password: ${tempPassword}\n\n` +
              `Please log in to the Employee Portal and change your password before accessing any module.\n` +
              (backendSuccess ? '' : `\nNote: Your employee record is being finalised. Please contact HR if you experience any access issues.\n`) +
              `\nIf you did not expect this email, please contact HR immediately.\n`,
            employeeId,
            template: 'employee_credentials',
          });
          emailSent = true;
        } catch { /* HR can print credentials instead */ }
      }

      newCredentials.push({ fullName: row.fullName, employeeId, tempPassword, email: recipient, emailSent, position: row.position, department: row.department });
    }

    setHiring(false);
    setConfirmTarget(null);
    setSelected(new Set());
    setRows(prev => prev.filter(r => !hiredIds.includes(r.id)));

    if (newCredentials.length > 0) {
      setCredentialsResult(newCredentials);
      setShowCredentialsModal(true);
    }
  };

  // ── Print credentials ─────────────────────────────────────────────────────
  const handlePrintCredentials = () => {
    const win = window.open('', '_blank', 'width=820,height=700');
    if (!win) return;

    const dateStr = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const cards = credentialsResult.map(c => `
      <div class="card">
        <div class="card-header">
          <span class="org">ABYAN HRIS &mdash; Iloilo City Government</span>
          <span class="label">EMPLOYEE CREDENTIALS</span>
        </div>
        <div class="card-body">
          <div class="name">${c.fullName}</div>
          <div class="role">${c.position || '&mdash;'} &nbsp;&bull;&nbsp; ${c.department || '&mdash;'}</div>
          <div class="cred-row">
            <div class="cred-box">
              <div class="cred-label">Employee ID</div>
              <div class="cred-value">${c.employeeId}</div>
            </div>
            <div class="cred-box">
              <div class="cred-label">Temporary Password</div>
              <div class="cred-value">${c.tempPassword}</div>
            </div>
          </div>
          <div class="note">Log in to the Employee Portal and change your password immediately upon first access. Keep this document confidential.</div>
        </div>
        <div class="card-footer">Issued ${dateStr}</div>
      </div>`).join('');

    win.document.head.innerHTML = `
      <title>Employee Credentials</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: #fff; padding: 24px; color: #000; }
        h1 { font-size: 13pt; text-align: center; margin-bottom: 4px; }
        .page-sub { font-size: 9pt; text-align: center; color: #555; margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .card { border: 2px solid #000; border-radius: 6px; overflow: hidden; break-inside: avoid; }
        .card-header { background: #040E6B; color: #fff; padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; }
        .org { font-size: 8pt; opacity: 0.85; }
        .label { font-size: 8pt; font-weight: 700; letter-spacing: 0.05em; }
        .card-body { padding: 14px; }
        .name { font-size: 14pt; font-weight: 700; margin-bottom: 2px; }
        .role { font-size: 9pt; color: #444; margin-bottom: 12px; }
        .cred-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
        .cred-box { border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px; }
        .cred-label { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
        .cred-value { font-family: 'Courier New', monospace; font-size: 13pt; font-weight: 700; letter-spacing: 0.08em; color: #040E6B; }
        .note { font-size: 7.5pt; color: #777; border-top: 1px dashed #ccc; padding-top: 7px; line-height: 1.4; }
        .card-footer { background: #f4f4f4; padding: 5px 14px; font-size: 8pt; color: #555; text-align: right; border-top: 1px solid #ddd; }
        @media print { body { padding: 12px; } .grid { grid-template-columns: repeat(2, 1fr); } }
      </style>`;

    win.document.body.innerHTML = `
      <h1>Employee Onboarding Credentials</h1>
      <p class="page-sub">Office of the City Human Resource Management Officer &mdash; Iloilo City Government &mdash; ${dateStr}</p>
      <div class="grid">${cards}</div>`;

    win.focus();
    win.print();
  };

  // ── Shell layout ──────────────────────────────────────────────────────────
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
      <div className="admin-layout">
        <Sidebar activeModule="RSP" userRole="rsp" />
        <main className="admin-content bg-slate-50 !p-0">
          <ApplicantsTabBar />
          {children}
        </main>
      </div>
    </div>
  );

  if (loading) return (
    <Shell>
      <div className="flex items-center justify-center p-16 text-slate-500">Loading…</div>
    </Shell>
  );

  // ── VIEW 1 — Department folder table ──────────────────────────────────────
  if (!selectedDept) return (
    <Shell>
      <div className="p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-slate-900">For Hiring</h1>
          <p className="text-sm text-slate-500">
            Select a department to view its ranked list of qualified applicants.
          </p>
        </div>

        {departmentList.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-slate-400">
            <Users className="mb-3 h-10 w-10" />
            <p className="font-medium">No qualified applicants yet.</p>
            <p className="mt-1 text-sm">Applicants recommended for hiring will appear here.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Positions</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Applicants</th>
                  <th className="w-10 px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {departmentList.map(({ dept, positionCount, applicantCount }) => (
                  <tr
                    key={dept}
                    onClick={() => { setSelectedDept(dept); setSelected(new Set()); }}
                    className="border-b border-slate-100 last:border-0 cursor-pointer transition-colors hover:bg-blue-50/40 group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 rounded-xl bg-[#363EE8]/10 p-2 text-[#363EE8]">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{dept}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center text-sm text-slate-600">
                      {positionCount} {positionCount === 1 ? 'position' : 'positions'}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#363EE8]/10 px-2.5 py-0.5 text-xs font-semibold text-[#363EE8]">
                        <Users className="h-3 w-3" />
                        {applicantCount} {applicantCount === 1 ? 'applicant' : 'applicants'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-400 group-hover:text-[#363EE8] transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialogs are rendered even in dept list view so state is preserved */}
      {renderConfirmDialog()}
      {renderCredentialsModal()}
    </Shell>
  );

  // ── VIEW 2 — Ranked applicant list for the selected department ────────────
  return (
    <Shell>
      <div className="p-6">
        {/* Breadcrumb / header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => { setSelectedDept(null); setSelected(new Set()); }}
              className="mt-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Departments
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{selectedDept}</h1>
              <p className="text-sm text-slate-500">
                {deptApplicants.length} qualified applicant{deptApplicants.length !== 1 ? 's' : ''} — ranked by interview score
              </p>
            </div>
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

        {deptApplicants.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-slate-400">
            <Users className="mb-3 h-10 w-10" />
            <p className="font-medium">No applicants in this department.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-12 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Rank</th>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === deptApplicants.length && deptApplicants.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 accent-[#363EE8]"
                      title="Select all"
                    />
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Applicant Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Interview Score</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Exam Score</th>
                </tr>
              </thead>
              <tbody>
                {deptApplicants.map((row, idx) => {
                  const rank = idx + 1;
                  const medalBg =
                    rank === 1 ? 'bg-yellow-400 text-yellow-900'  :
                    rank === 2 ? 'bg-slate-300 text-slate-800'    :
                    rank === 3 ? 'bg-amber-500 text-amber-900'    :
                                 'bg-slate-100 text-slate-600';
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50 ${selected.has(row.id) ? 'bg-blue-50/60' : ''}`}
                    >
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${medalBg}`}>
                          {rank}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-center">
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
                      <td className="px-5 py-4 text-sm text-slate-600">{row.position || '—'}</td>
                      <td className="px-5 py-4 text-center">
                        <span className={`text-sm font-bold ${row.interviewScore != null ? 'text-[#040E6B]' : 'text-slate-300'}`}>
                          {fmtScore(row.interviewScore)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`text-sm font-bold ${row.examScore != null ? 'text-[#040E6B]' : 'text-slate-300'}`}>
                          {fmtScore(row.examScore)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {renderConfirmDialog()}
      {renderCredentialsModal()}
    </Shell>
  );

  // ── Extracted dialog renderers (used in both views) ───────────────────────
  function renderConfirmDialog() {
    if (!confirmTarget) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#363EE8]/10">
            <UserCheck className="h-6 w-6 text-[#363EE8]" />
          </div>
          <h2 className="mb-2 text-lg font-bold text-slate-900">Confirm Employee Record Creation</h2>

          {confirmTarget.length === 1 ? (
            <>
              <p className="text-sm font-semibold text-slate-800 mb-1">{confirmTarget[0].fullName}</p>
              <p className="text-sm text-slate-600">
                Are you sure you want to hire this applicant for the position of{' '}
                <strong>{confirmTarget[0].position || '—'}</strong> under the{' '}
                <strong>{confirmTarget[0].department || '—'}</strong> department? This action will create an employee record and generate a system account.
              </p>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-600">
                Are you sure you want to create employee records for the following{' '}
                <strong>{confirmTarget.length} applicants</strong>? This action will create employee records and generate system accounts.
              </p>
              <ul className="mb-3 max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {confirmTarget.map(r => (
                  <li key={r.id} className="px-3 py-2.5">
                    <p className="text-sm font-semibold text-slate-800">{r.fullName}</p>
                    <p className="text-xs text-slate-500">{r.position || '—'} — {r.department || '—'}</p>
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
    );
  }

  function renderCredentialsModal() {
    if (!showCredentialsModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
          <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-200">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-900">Employee Records Created</h2>
              <p className="text-sm text-slate-500">
                {credentialsResult.length} employee account{credentialsResult.length > 1 ? 's' : ''} generated. Credentials sent to each employee's email where available.
              </p>
            </div>
          </div>

          <div className="overflow-auto flex-1 px-6 py-4">
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
                  <tr key={i}>
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
    );
  }
};
