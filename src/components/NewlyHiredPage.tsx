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
import { Sidebar } from './Sidebar';
import {
  ensureRecruitmentSeedData,
  generateEmployeeId,
  getEmployeeRecords,
  getNewlyHired,
  saveEmployeeRecords,
  saveNewlyHired,
} from '../lib/recruitmentData';
import type { NewlyHired, NewlyHiredStatus } from '../types/recruitment.types';

type ViewMode = 'overview' | 'department';

type GeneratedCredential = {
  id: string;
  fullName: string;
  position: string;
  rankLine: string;
  employeeNumber: string;
  username: string;
  password: string;
};

const normalizeText = (value: string) => String(value ?? '').trim().toLowerCase();

const createUsername = (firstName: string, lastName: string) => {
  const first = normalizeText(firstName).replace(/\s+/g, '.');
  const last = normalizeText(lastName).replace(/\s+/g, '.');
  return `${first}.${last}2026`;
};

const createPassword = () => {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `Pass${random}!`;
};

export const NewlyHiredPage = () => {
  const [rows, setRows] = useState<NewlyHired[]>([]);
  const [mode, setMode] = useState<ViewMode>('overview');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<GeneratedCredential[]>([]);

  useEffect(() => {
    ensureRecruitmentSeedData();
    setRows(getNewlyHired());
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

  const generateCredentials = () => {
    if (selectedIds.length === 0) return;

    const employeeRecords = getEmployeeRecords();
    let sequence = employeeRecords.length + 1;
    const nowIso = new Date().toISOString();

    const nextRows = rows.map((row) => {
      if (!selectedIds.includes(row.id)) return row;

      const existingEmployeeNumber = row.employeeId;
      const employeeNumber = existingEmployeeNumber || generateEmployeeId(sequence++);
      const username = createUsername(row.employeeInfo.firstName, row.employeeInfo.lastName);
      const password = createPassword();

      const alreadyTracked = employeeRecords.some((record) => record.employeeId === employeeNumber);
      if (!alreadyTracked) {
        employeeRecords.push({
          id: crypto.randomUUID(),
          employeeId: employeeNumber,
          name: `${row.employeeInfo.firstName} ${row.employeeInfo.lastName}`,
          position: row.position,
          department: row.department,
          division: row.division,
          startDate: row.expectedStartDate || nowIso,
        });
      }

      const rankLine = `Rank: #${Math.max(1, sequence - 1)} • Score: ${(row.onboardingProgress || 0).toFixed(2)}`;
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

      return {
        ...row,
        employeeId: employeeNumber,
        status: 'In Onboarding' as NewlyHiredStatus,
        timeline: [
          ...row.timeline,
          { event: 'Employee number and account generated', date: nowIso, actor: 'RSP Admin' },
        ],
      };
    });

    saveEmployeeRecords(employeeRecords);
    saveNewlyHired(nextRows);
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
            <header className="border-b border-slate-200 bg-white px-10 py-8">
              <h1 className="mb-1 text-4xl font-bold text-slate-900">Newly Hired Employees</h1>
              <p className="text-lg text-slate-500">Generate employee accounts for newly hired staff</p>
            </header>

            <section className="space-y-8 p-8">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <article className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Total Newly Hired</p>
                      <p className="mt-2 text-5xl font-bold text-slate-900">{totalNewlyHired}</p>
                    </div>
                    <div className="rounded-2xl bg-blue-100 p-4 text-blue-600">
                      <UserPlus size={28} />
                    </div>
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">With Credentials</p>
                      <p className="mt-2 text-5xl font-bold text-green-600">{withCredentials}</p>
                    </div>
                    <div className="rounded-2xl bg-green-100 p-4 text-green-600">
                      <CheckCircle2 size={28} />
                    </div>
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Pending Credentials</p>
                      <p className="mt-2 text-5xl font-bold text-orange-600">{pendingCredentials}</p>
                    </div>
                    <div className="rounded-2xl bg-orange-100 p-4 text-orange-600">
                      <KeyRound size={28} />
                    </div>
                  </div>
                </article>
              </div>

              <div>
                <h2 className="mb-4 text-3xl font-semibold text-slate-900">Departments</h2>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {departmentCards.map((card) => (
                    <button
                      key={card.department}
                      type="button"
                      onClick={() => openDepartment(card.department)}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 text-left transition hover:border-blue-400"
                    >
                      <div className="flex items-center gap-4">
                        <div className="rounded-2xl bg-blue-100 p-4 text-blue-600">
                          <UserPlus size={26} />
                        </div>
                        <div>
                          <p className="text-3xl font-semibold text-slate-900">{card.department}</p>
                          <p className="text-lg text-slate-600">{card.total} Newly Hired</p>
                          <p className="text-lg text-slate-500">{card.pending} pending</p>
                        </div>
                      </div>
                      <ChevronRight size={26} className="text-slate-400" />
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
            <header className="border-b border-slate-200 bg-white px-10 py-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <button type="button" onClick={closeDepartment} className="mb-2 inline-flex items-center gap-2 text-slate-500 hover:text-slate-700">
                    <ArrowLeft size={20} /> Back
                  </button>
                  <h1 className="mb-1 text-4xl font-bold text-slate-900">{selectedDepartment}</h1>
                  <p className="text-lg text-slate-500">{selectedDepartmentRows.length} newly hired employees</p>
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
                          <p className="text-2xl font-semibold text-slate-900">{fullName}</p>
                          <p className="text-lg text-slate-600">{row.position}</p>
                          <p className="text-base text-slate-500">Rank: #{Math.max(1, row.onboardingProgress || 1)} • Score: {(row.onboardingProgress || 0).toFixed(2)} • Hired: {new Date(row.dateHired).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        {hasEmployeeNumber && <p className="mb-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">{row.employeeId}</p>}
                        <span className="rounded-full bg-orange-100 px-4 py-1.5 text-lg font-semibold text-orange-700">{statusLabel}</span>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-base text-blue-700">
                {selectedIds.length} employee selected. Click "Generate Employee Number & Account" to create credentials.
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
                  <p className="text-lg text-slate-500">{selectedDepartment} • {generatedCredentials.length} employee</p>
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
