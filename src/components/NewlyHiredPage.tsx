import {
    ArrowLeft,
    CheckCircle2,
    ChevronRight,
    KeyRound,
    Printer,
    Save,
    UserPlus,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
    createPassword,
    createUniqueUsername,
    getEmployeePortalAccounts,
    updateEmployeePortalEmployee,
    upsertEmployeePortalAccount,
} from '../lib/employeePortalData';
import {
    generateEmployeeId,
    getEmployeeRecords,
    saveEmployeeRecords,
    saveNewlyHired,
} from '../lib/recruitmentData';
import { supabase } from '../lib/supabase';
import type { NewlyHired, NewlyHiredStatus } from '../types/recruitment.types';
import { Sidebar } from './Sidebar';
// Fallbacks for missing types/utilities
type ViewMode = 'overview' | 'department';
type GeneratedCredential = any;
// Dummy normalizeText if not found
const normalizeText = (v: string) => (v || '').trim().toLowerCase();


export const NewlyHiredPage = () => {
  const [rows, setRows] = useState<NewlyHired[]>([]);
  const [mode, setMode] = useState<ViewMode>('overview');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<GeneratedCredential[]>([]);

  useEffect(() => {
    const load = async () => {
      // Only use hiredFromDb from Supabase
      const { data: applicantRows = [] } = await supabase
        .from('applicants')
        .select('id, first_name, last_name, email, contact_number, position, office, status, created_at') as any;

      const hiredFromDb = (applicantRows || [])
        .filter((row: any) => {
          const normalized = normalizeText(String(row?.status ?? ''));
          return normalized === 'hired' || normalized === 'accept';
        })
        .map((row: any) => {
          const applicantId = String(row?.id ?? '').trim();
          return {
            id: `hire-${applicantId || crypto.randomUUID()}`,
            applicantId: applicantId || undefined,
            employeeInfo: {
              firstName: String(row?.first_name ?? '').trim(),
              lastName: String(row?.last_name ?? '').trim(),
              email: String(row?.email ?? '').trim(),
              phone: String(row?.contact_number ?? '').trim(),
              emergencyContact: {
                name: '',
                relationship: '',
                phone: '',
              },
              governmentIds: {},
            },
            position: String(row?.position ?? '').trim(),
            department: String(row?.office ?? '').trim(),
            employmentType: 'Permanent',
            dateHired: String(row?.created_at ?? new Date().toISOString()),
            expectedStartDate: String(row?.created_at ?? new Date().toISOString()),
            status: 'Pending Onboarding' as NewlyHiredStatus,
            onboardingProgress: 0,
            onboardingChecklist: [],
            documents: [],
            notes: [],
            timeline: [
              {
                event: 'Synced from applicant status',
                date: new Date().toISOString(),
                actor: 'System',
              },
            ],
          } as NewlyHired;
        });
      setRows(hiredFromDb);
    };

    const syncRows = () => {
      void load();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };

    void load();
    window.addEventListener('focus', syncRows);
    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('cictrix:applicants-updated', syncRows as EventListener);
    window.addEventListener('cictrix:route-activated', syncRows as EventListener);

    return () => {
      window.removeEventListener('focus', syncRows);
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('cictrix:applicants-updated', syncRows as EventListener);
      window.removeEventListener('cictrix:route-activated', syncRows as EventListener);
    };
  }, []);

  const departmentCards = useMemo(() => {
    const grouped = new Map<string, { total: number; pending: number }>();

    rows.forEach((row) => {
      const key = row.department || 'Unassigned Department';
      const current = grouped.get(key) ?? { total: 0, pending: 0 };
      current.total += 1;
      if (!row.employeeId) current.pending += 1;
      grouped.set(key, current);
    });

    return Array.from(grouped.entries())
      .map(([department, stats]) => ({ department, ...stats }))
      .sort((a, b) => a.department.localeCompare(b.department));
  }, [rows]);

  const selectedDepartmentRows = useMemo(() => {
    if (!selectedDepartment) return [];
    return rows.filter((row) => row.department === selectedDepartment);
  }, [rows, selectedDepartment]);

  const totalNewlyHired = rows.length;
  const withCredentials = rows.filter((row) => Boolean(row.employeeId)).length;
  const pendingCredentials = totalNewlyHired - withCredentials;

  const openDepartment = (department: string) => {
    setSelectedDepartment(department);
    setSelectedIds([]);
    setMode('department');
  };

  const closeDepartment = () => {
    setMode('overview');
    setSelectedDepartment('');
    setSelectedIds([]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  };

  const generateCredentials = async () => {
    if (selectedIds.length === 0) return;

    const employeeRecords = getEmployeeRecords();
    const existingAccounts = getEmployeePortalAccounts();
    const accountByEmployeeId = new Map(
      existingAccounts.map((account) => [String(account.employee.employeeId || '').trim(), account])
    );
    const occupiedUsernames = new Set(existingAccounts.map((account) => normalizeText(account.username)));
    let sequence = employeeRecords.length + 1;
    const nowIso = new Date().toISOString();

    const nextRows = rows.map((row) => {
      if (!selectedIds.includes(row.id)) return row;

      const isInternalPromotion = row.applicationType === 'promotion' && Boolean(row.internalApplication?.employeeId);
      const existingEmployeeNumber = row.employeeId || row.internalApplication?.employeeId;
      const employeeNumber = existingEmployeeNumber || generateEmployeeId(sequence++);
      const existingAccount = accountByEmployeeId.get(employeeNumber);
      const username = existingAccount
        ? existingAccount.username
        : createUniqueUsername(row.employeeInfo.firstName, row.employeeInfo.lastName, occupiedUsernames);
      const password = createPassword();
      const positionHistoryEntry = {
        position: row.position,
        department: row.department,
        division: row.division,
        effectiveDate: nowIso,
        changeType: isInternalPromotion ? 'promotion' as const : 'hire' as const,
        sourceApplicantId: row.applicantId,
        notes: isInternalPromotion
          ? `Promoted from ${row.internalApplication?.previousPosition || 'current assignment'}`
          : 'Employee portal account generated from newly hired queue.',
      };

      const employeeRecordIndex = employeeRecords.findIndex((record) => record.employeeId === employeeNumber);
      if (employeeRecordIndex >= 0) {
        const existingRecord = employeeRecords[employeeRecordIndex];
        employeeRecords[employeeRecordIndex] = {
          ...existingRecord,
          name: `${row.employeeInfo.firstName} ${row.employeeInfo.lastName}`,
          position: row.position,
          department: row.department,
          division: row.division,
          positionHistory: [...(existingRecord.positionHistory ?? []), positionHistoryEntry],
        };
      } else {
        employeeRecords.push({
          id: crypto.randomUUID(),
          employeeId: employeeNumber,
          name: `${row.employeeInfo.firstName} ${row.employeeInfo.lastName}`,
          position: row.position,
          department: row.department,
          division: row.division,
          startDate: row.expectedStartDate || nowIso,
          positionHistory: [positionHistoryEntry],
        });
      }

      const resolvedRank = Math.max(1, Number(row.rankingRank ?? sequence - 1));
      const resolvedScore = Number(row.rankingScore ?? 0);
      const rankLine = `Rank: #${resolvedRank} • Score: ${resolvedScore.toFixed(2)}`;

      if (isInternalPromotion && existingAccount) {
        updateEmployeePortalEmployee(employeeNumber, {
          fullName: `${row.employeeInfo.firstName} ${row.employeeInfo.lastName}`,
          email: row.employeeInfo.email || existingAccount.employee.email,
          mobileNumber: row.employeeInfo.phone || existingAccount.employee.mobileNumber,
          currentPosition: row.position,
          currentDepartment: row.department,
          currentDivision: row.division,
          positionHistory: [...(existingAccount.employee.positionHistory ?? []), positionHistoryEntry],
        });
      } else {
        upsertEmployeePortalAccount({
          id: `employee-account-${employeeNumber}`,
          username,
          password,
          employee: {
            employeeId: employeeNumber,
            fullName: `${row.employeeInfo.firstName} ${row.employeeInfo.lastName}`,
            email: row.employeeInfo.email || `${username}@employee.local`,
            dateOfBirth: '',
            age: 0,
            gender: 'Prefer not to say',
            civilStatus: 'Single',
            nationality: 'Filipino',
            mobileNumber: row.employeeInfo.phone || '',
            homeAddress: '',
            emergencyContactName: row.employeeInfo.emergencyContact?.name || '',
            emergencyRelationship: row.employeeInfo.emergencyContact?.relationship || '',
            emergencyContactNumber: row.employeeInfo.emergencyContact?.phone || '',
            sssNumber: row.employeeInfo.governmentIds?.sss || '',
            philhealthNumber: row.employeeInfo.governmentIds?.philhealth || '',
            pagibigNumber: row.employeeInfo.governmentIds?.pagibig || '',
            tinNumber: row.employeeInfo.governmentIds?.tin || '',
            currentPosition: row.position,
            currentDepartment: row.department,
            currentDivision: row.division,
            positionHistory: [positionHistoryEntry],
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        });
      }

      if (!isInternalPromotion) {
        setGeneratedCredentials((current) => [
          ...current,
          {
            id: row.id,
            fullName: `${row.employeeInfo.firstName} ${row.employeeInfo.lastName}`,
            position: row.position,
            rankLine,
            employeeNumber,
            username,
            password,
          },
        ]);
      }

      return {
        ...row,
        employeeId: employeeNumber,
        status: 'In Onboarding' as NewlyHiredStatus,
        timeline: [
          ...row.timeline,
          {
            event: isInternalPromotion
              ? 'Existing employee account updated for promotional movement'
              : 'Employee number and account generated',
            date: nowIso,
            actor: 'RSP Admin',
          },
        ],
      };
    });

    saveEmployeeRecords(employeeRecords);
    await saveNewlyHired(nextRows);
    setRows(nextRows);
    setShowCredentialsModal(true);
  };

  const clearGeneratedCache = () => setGeneratedCredentials([]);

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />

      <main className="admin-content bg-slate-100 !p-0">
        {mode === 'overview' && (
          <>
            <header className="border-b border-slate-200 bg-white px-8 py-6">
              <h1 className="mb-1 text-2xl font-bold text-slate-900">Newly Hired Employees</h1>
              <p className="text-sm text-slate-500">Generate employee accounts for newly hired staff</p>
            </header>

            <section className="space-y-6 p-8">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <article className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Total Newly Hired</p>
                      <p className="mt-2 text-3xl font-bold text-slate-900">{totalNewlyHired}</p>
                    </div>
                    <div className="rounded-2xl bg-blue-100 p-3 text-blue-600">
                      <UserPlus size={22} />
                    </div>
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">With Credentials</p>
                      <p className="mt-2 text-3xl font-bold text-green-600">{withCredentials}</p>
                    </div>
                    <div className="rounded-2xl bg-green-100 p-3 text-green-600">
                      <CheckCircle2 size={22} />
                    </div>
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Pending Credentials</p>
                      <p className="mt-2 text-3xl font-bold text-orange-600">{pendingCredentials}</p>
                    </div>
                    <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
                      <KeyRound size={22} />
                    </div>
                  </div>
                </article>
              </div>

              <div>
                <h2 className="mb-4 text-2xl font-semibold text-slate-900">Departments</h2>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {departmentCards.map((card) => (
                    <button
                      key={card.department}
                      type="button"
                      onClick={() => openDepartment(card.department)}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-blue-400"
                    >
                      <div className="flex items-center gap-4">
                        <div className="rounded-2xl bg-blue-100 p-3 text-blue-600">
                          <UserPlus size={20} />
                        </div>
                        <div>
                          <p className="text-2xl font-semibold text-slate-900">{card.department}</p>
                          <p className="text-base text-slate-600">{card.total} Newly Hired</p>
                          <p className="text-sm text-slate-500">{card.pending} pending</p>
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-slate-400" />
                    </button>
                  ))}
                  {departmentCards.length === 0 && (
                    <p className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-base text-slate-500">
                      No newly hired records found.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {mode === 'department' && (
          <>
            <header className="border-b border-slate-200 bg-white px-8 py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <button type="button" onClick={closeDepartment} className="mb-2 inline-flex items-center gap-2 text-slate-500 hover:text-slate-700">
                    <ArrowLeft size={20} /> Back
                  </button>
                  <h1 className="mb-1 text-2xl font-bold text-slate-900">{selectedDepartment}</h1>
                  <p className="text-sm text-slate-500">{selectedDepartmentRows.length} newly hired employees</p>
                </div>

                <button
                  type="button"
                  onClick={generateCredentials}
                  disabled={selectedIds.length === 0}
                  className="rounded-2xl bg-blue-600 px-6 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <KeyRound className="mr-2 inline h-4 w-4" /> Generate Employee Number & Account
                </button>
              </div>
            </header>

            <section className="space-y-4 p-8">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-base text-blue-700">
                <strong>Instructions:</strong> Select employees to generate their employee numbers and account credentials. Credentials will be auto-generated and can be printed for distribution.
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {selectedDepartmentRows.map((row) => {
                  const checked = selectedIds.includes(row.id);
                  const fullName = `${row.employeeInfo.firstName} ${row.employeeInfo.lastName}`;
                  const hasEmployeeNumber = Boolean(row.employeeId);
                  const statusLabel = hasEmployeeNumber ? 'Pending Update' : 'Pending';

                  return (
                    <label key={row.id} className="flex cursor-pointer items-center justify-between border-b border-slate-100 px-6 py-5 last:border-b-0">
                      <div className="flex items-center gap-4">
                        <input type="checkbox" checked={checked} onChange={() => toggleSelect(row.id)} className="h-5 w-5" />
                        <div>
                          <p className="text-xl font-semibold text-slate-900">{fullName}</p>
                          <p className="text-base text-slate-600">{row.position}</p>
                          <p className="text-sm text-slate-500">Rank: #{Math.max(1, Number(row.rankingRank ?? 1))} • Score: {Number(row.rankingScore ?? 0).toFixed(2)} • Hired: {new Date(row.dateHired).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        {hasEmployeeNumber && <p className="mb-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">{row.employeeId}</p>}
                        <span className="rounded-full bg-orange-100 px-4 py-1.5 text-sm font-semibold text-orange-700">{statusLabel}</span>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-700">
                {selectedIds.length} employee selected. Process the selected rows to generate credentials for external hires and update existing accounts for internal promotions.
              </div>
            </section>
          </>
        )}
      </main>

      {showCredentialsModal && (
        <div className="fixed inset-0 z-[260] bg-black/70 p-4" onClick={() => { setShowCredentialsModal(false); clearGeneratedCache(); }}>
          <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between border-b border-slate-200 px-8 py-6">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-green-100 p-3 text-green-600">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h2 className="text-4xl font-bold text-slate-900">Generated Employee Credentials</h2>
                  <p className="text-lg text-slate-500">{selectedDepartment} • {generatedCredentials.length} credential set</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button type="button" className="rounded-2xl bg-blue-600 px-5 py-2.5 text-base font-semibold text-white">
                  <Printer className="mr-2 inline h-4 w-4" /> Print
                </button>
                <button type="button" className="rounded-2xl bg-green-600 px-5 py-2.5 text-base font-semibold text-white">
                  <Save className="mr-2 inline h-4 w-4" /> Save Credentials
                </button>
                <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => { setShowCredentialsModal(false); clearGeneratedCache(); }}>
                  <X size={20} />
                </button>
              </div>
            </header>

            <div className="max-h-[72vh] space-y-4 overflow-y-auto p-8">
              {generatedCredentials.length === 0 && (
                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <p className="text-lg font-semibold text-slate-900">No new credentials were generated.</p>
                  <p className="mt-2 text-base text-slate-600">
                    The selected employees were processed as internal promotions, so their existing Employee Portal
                    accounts were updated instead of creating duplicate credentials.
                  </p>
                </article>
              )}

              {generatedCredentials.map((credential) => (
                <article key={credential.id} className="rounded-2xl border border-slate-200 p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <p className="text-4xl font-semibold text-slate-900">{credential.fullName}</p>
                      <p className="text-lg text-slate-600">{credential.position}</p>
                      <p className="text-lg text-slate-600">{credential.rankLine}</p>
                    </div>
                    <span className="rounded-full bg-green-100 px-4 py-1.5 text-lg font-semibold text-green-700">HIRED</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employee Number</p>
                      <p className="text-3xl font-bold text-blue-700">{credential.employeeNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Username</p>
                      <p className="text-3xl font-bold text-slate-900">{credential.username}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Password</p>
                      <p className="text-3xl font-bold text-red-600">{credential.password}</p>
                    </div>
                  </div>

                  <p className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-800">
                    <strong>Important:</strong> Please save these credentials securely. The password should be changed upon first login.
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
