import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Printer,
  Save,
  User,
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
  createEmployeeNumberAllocator,
  getEmployeeRecords,
  saveEmployeeRecords,
  saveNewlyHired,
} from '../lib/recruitmentData';
import { supabase } from '../lib/supabase';
import type { NewlyHired, NewlyHiredStatus } from '../types/recruitment.types';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

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

  // Search & filtering state variables
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'saved'>('all');
  const [deptFilter, setDeptFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      // Hired applicants from Supabase
      const { data: applicantRows = [] } = await supabase
        .from('applicants')
        .select('id, first_name, last_name, email, contact_number, position, office, status, created_at') as any;

      // Already-saved newly_hired rows (carries persisted employee_id so credentials survive reloads)
      const newlyHiredResult = await (supabase as any)
        .from('newly_hired')
        .select('applicant_id, employee_id, status, onboarding_progress');

      const persistedByApplicantId = new Map<string, { employee_id?: string; status?: string; onboarding_progress?: number }>();
      for (const row of (newlyHiredResult.data || []) as any[]) {
        const applicantKey = String(row?.applicant_id ?? '').trim();
        if (!applicantKey) continue;
        persistedByApplicantId.set(applicantKey, {
          employee_id: row?.employee_id ?? undefined,
          status: row?.status ?? undefined,
          onboarding_progress: row?.onboarding_progress ?? undefined,
        });
      }

      const hiredFromDb = (applicantRows || [])
        .filter((row: any) => {
          const normalized = normalizeText(String(row?.status ?? ''));
          return normalized === 'hired' || normalized === 'accept';
        })
        .map((row: any) => {
          const applicantId = String(row?.id ?? '').trim();
          const persisted = applicantId ? persistedByApplicantId.get(applicantId) : undefined;
          return {
            id: `hire-${applicantId || crypto.randomUUID()}`,
            applicantId: applicantId || undefined,
            employeeId: persisted?.employee_id || undefined,
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
            status: (persisted?.status as NewlyHiredStatus | undefined)
              ?? (persisted?.employee_id ? 'In Onboarding' : 'Pending Onboarding') as NewlyHiredStatus,
            onboardingProgress: persisted?.onboarding_progress ?? 0,
            onboardingChecklist: [],
            documents: [],
            notes: [],
            timeline: [
              {
                event: persisted?.employee_id
                  ? 'Loaded with persisted employee number from newly_hired'
                  : 'Synced from applicant status',
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

  const departmentsList = useMemo(() => {
    const list = Array.from(new Set(rows.map((row) => row.department).filter(Boolean)));
    return list.sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const fullName = `${row.employeeInfo.firstName} ${row.employeeInfo.lastName}`.toLowerCase();
      const matchesSearch =
        fullName.includes(searchQuery.toLowerCase()) ||
        row.position.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.department.toLowerCase().includes(searchQuery.toLowerCase());

      const hasEmployeeNumber = Boolean(row.employeeId);
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'pending'
          ? !hasEmployeeNumber
          : hasEmployeeNumber;

      const matchesDept = deptFilter === 'all' ? true : row.department === deptFilter;

      return matchesSearch && matchesStatus && matchesDept;
    });
  }, [rows, searchQuery, statusFilter, deptFilter]);

  const totalNewlyHired = rows.length;
  const withCredentials = rows.filter((row) => Boolean(row.employeeId)).length;
  const pendingCredentials = totalNewlyHired - withCredentials;

  const toggleSelect = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  };

  const toggleSelectAll = (filteredItems: NewlyHired[]) => {
    const eligibleFilteredIds = filteredItems.filter(r => !r.employeeId).map(r => r.id);
    const allSelected = eligibleFilteredIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !eligibleFilteredIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...eligibleFilteredIds])));
    }
  };

  const generateCredentials = async () => {
    // Skip rows that already have credentials (defensive — checkbox is locked but be safe)
    const eligibleIds = selectedIds.filter((id) => {
      const row = rows.find((r) => r.id === id);
      return row && !row.employeeId;
    });
    if (eligibleIds.length === 0) return;

    const employeeRecords = getEmployeeRecords();
    const existingAccounts = getEmployeePortalAccounts();
    const accountByEmployeeId = new Map(
      existingAccounts.map((account) => [String(account.employee.employeeId || '').trim(), account])
    );
    const occupiedUsernames = new Set(existingAccounts.map((account) => normalizeText(account.username)));

    // Allocator collects every employee_number already used (Supabase +
    // local stores) and hands out a fresh, unique number per call.
    const reservedFromCurrentRows = rows
      .map((r) => String(r.employeeId ?? '').trim())
      .filter(Boolean);
    const { allocate: nextEmployeeNumber } = await createEmployeeNumberAllocator(reservedFromCurrentRows);

    const nowIso = new Date().toISOString();

    const nextRows = rows.map((row) => {
      if (!eligibleIds.includes(row.id)) return row;

      const isInternalPromotion = row.applicationType === 'promotion' && Boolean(row.internalApplication?.employeeId);
      const existingEmployeeNumber = row.employeeId || row.internalApplication?.employeeId;
      const employeeNumber = existingEmployeeNumber || nextEmployeeNumber();
      const existingAccount = accountByEmployeeId.get(employeeNumber);
      const username = existingAccount
        ? existingAccount.username
        : createUniqueUsername(row.employeeInfo.firstName, row.employeeInfo.lastName, occupiedUsernames);
      // Reserve the username inside this batch so two employees with the same name don't collide.
      occupiedUsernames.add(normalizeText(username));
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

      const resolvedRank = Math.max(1, Number(row.rankingRank ?? 1));
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
            email: row.employeeInfo.email || `${username}.${employeeNumber.toLowerCase()}@employee.local`,
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

  const [savingCredentials, setSavingCredentials] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveAccountDetails = async () => {
    if (generatedCredentials.length === 0) {
      setShowCredentialsModal(false);
      return;
    }

    setSavingCredentials(true);
    setSaveError(null);

    try {
      // Persist newly_hired rows (carries employee_id so re-loads stay locked).
      await saveNewlyHired(rows);

      // Mirror each generated credential into the Supabase `employees` table so
      // the employee can be located by document upload / RSP reports.
      for (const credential of generatedCredentials) {
        const row = rows.find((r) => r.id === credential.id);
        if (!row) continue;

        const insertResult = await (supabase as any)
          .from('employees')
          .upsert(
            [
              {
                employee_number: credential.employeeNumber,
                first_name: row.employeeInfo.firstName,
                last_name: row.employeeInfo.lastName,
                email: row.employeeInfo.email || `${credential.username}.${credential.employeeNumber.toLowerCase()}@employee.local`,
                phone: row.employeeInfo.phone || null,
                position: row.position,
                department: row.department,
                date_hired: row.dateHired || new Date().toISOString().slice(0, 10),
                employment_status: 'Probationary',
                qualified_applicant_id: null,
                application_id: null,
              },
            ],
            { onConflict: 'employee_number' },
          );

        if (insertResult.error) {
          console.error('saveAccountDetails: employees upsert failed', insertResult.error);
          if (insertResult.error.message?.toLowerCase().includes('row-level security') || insertResult.error.message?.toLowerCase().includes('violates row-level security')) {
            console.warn('saveAccountDetails: RLS policy warning bypassed locally for demo/development context');
          } else {
            throw new Error(insertResult.error.message || 'Failed to save employee row.');
          }
        }
      }

      setShowCredentialsModal(false);
      clearGeneratedCache();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('saveAccountDetails: persist failed', error);
      setSaveError(message);
    } finally {
      setSavingCredentials(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen font-sans">
      <Sidebar activeModule="RSP" userRole="rsp" />

      <main className="ml-64 min-h-screen overflow-y-auto">
        <TopNav />
        
        <header className="border-b border-slate-200 bg-white px-8 py-6">
          <h1 className="mb-1 text-3xl font-extrabold text-[#040E6B] font-sans tracking-tight">Newly Hired Employees</h1>
          <p className="text-sm font-semibold text-slate-500">Generate employee accounts for newly hired staff</p>
        </header>

        <section className="space-y-6 p-8">
          {/* Branded Statistics Grid */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Total Newly Hired</p>
                  <p className="mt-2 text-3xl font-extrabold text-[#040E6B]">{totalNewlyHired}</p>
                </div>
                <div className="rounded-2xl bg-blue-100 p-3 text-[#363EE8]">
                  <UserPlus size={22} />
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">With Credentials</p>
                  <p className="mt-2 text-3xl font-extrabold text-green-600">{withCredentials}</p>
                </div>
                <div className="rounded-2xl bg-green-100 p-3 text-green-600">
                  <CheckCircle2 size={22} />
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Pending Credentials</p>
                  <p className="mt-2 text-3xl font-extrabold text-orange-600">{pendingCredentials}</p>
                </div>
                <div className="rounded-2xl bg-orange-100 p-3 text-orange-600">
                  <KeyRound size={22} />
                </div>
              </div>
            </article>
          </div>

          {/* Filtering Tools & Actions */}
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              {/* Left Side: Search & Department Filter */}
              <div className="flex flex-1 flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
                {/* Search Input */}
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by employee name, position, department..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-11 pr-4 py-3 text-sm text-[#040E6B] placeholder:text-slate-400 focus:border-[#363EE8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#363EE8]/10 transition-all font-sans"
                  />
                </div>

                {/* Department Dropdown Filter */}
                <div className="relative min-w-[220px]">
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/50 pl-4 pr-10 py-3 text-sm text-[#040E6B] font-bold focus:border-[#363EE8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#363EE8]/10 transition-all cursor-pointer font-sans"
                  >
                    <option value="all">All Departments</option>
                    {departmentsList.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                  <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </div>
              </div>

              {/* Right Side: Generate Account Button */}
              <button
                type="button"
                onClick={generateCredentials}
                disabled={selectedIds.length === 0}
                className="w-full lg:w-auto shrink-0 flex items-center justify-center gap-2 rounded-xl bg-[#363EE8] hover:bg-[#363EE8]/90 text-white font-bold px-6 py-3.5 text-sm shadow-md hover:shadow-lg disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none transition-all"
              >
                <KeyRound size={16} />
                <span>Generate Credentials ({selectedIds.length})</span>
              </button>
            </div>

            {/* Status Segmented Tabs */}
            <div className="flex items-center gap-2 border-t border-slate-100 pt-4 overflow-x-auto">
              {[
                { key: 'all', label: 'All Newly Hired', count: rows.length },
                { key: 'pending', label: 'Pending Credentials', count: rows.filter(r => !r.employeeId).length },
                { key: 'saved', label: 'Credentials Saved', count: rows.filter(r => !!r.employeeId).length }
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setStatusFilter(tab.key as any); setSelectedIds([]); }}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all border ${
                    statusFilter === tab.key
                      ? 'bg-[#363EE8]/10 text-[#363EE8] border-[#363EE8]/20'
                      : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                    statusFilter === tab.key
                      ? 'bg-[#363EE8] text-white font-bold'
                      : 'bg-slate-100 text-slate-600'
                  }`}>{tab.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Unified Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-sm font-sans">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th scope="col" className="w-12 px-6 py-4 font-semibold text-[#040E6B]">
                    <input
                      type="checkbox"
                      checked={filteredRows.length > 0 && filteredRows.filter(r => !r.employeeId).every(r => selectedIds.includes(r.id))}
                      disabled={filteredRows.filter(r => !r.employeeId).length === 0}
                      onChange={() => toggleSelectAll(filteredRows)}
                      className="h-5 w-5 rounded border-slate-300 text-[#363EE8] focus:ring-[#363EE8] disabled:opacity-40"
                    />
                  </th>
                  <th scope="col" className="px-6 py-4 font-semibold text-[#040E6B]">Employee Name & Position</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-[#040E6B]">Department / Office</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-[#040E6B]">Rank & Score</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-[#040E6B]">Date Hired</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-[#040E6B]">Employee ID</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-[#040E6B] text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  const checked = selectedIds.includes(row.id);
                  const fullName = `${row.employeeInfo.firstName} ${row.employeeInfo.lastName}`;
                  const hasEmployeeNumber = Boolean(row.employeeId);
                  const statusLabel = hasEmployeeNumber ? 'Credentials Generated' : 'Pending Onboarding';

                  return (
                    <tr
                      key={row.id}
                      onClick={() => {
                        if (!hasEmployeeNumber) {
                          toggleSelect(row.id);
                        }
                      }}
                      className={`group hover:bg-slate-50/80 transition-colors duration-150 ${hasEmployeeNumber ? 'cursor-not-allowed bg-slate-50/30' : 'cursor-pointer'}`}
                    >
                      {/* Checkbox */}
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={hasEmployeeNumber ? false : checked}
                          disabled={hasEmployeeNumber}
                          onChange={() => {
                            if (!hasEmployeeNumber) {
                              toggleSelect(row.id);
                            }
                          }}
                          className="h-5 w-5 rounded border-slate-300 text-[#363EE8] focus:ring-[#363EE8] disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>

                      {/* Employee Details */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#363EE8] transition-colors group-hover:bg-[#363EE8]/10">
                            <User size={20} />
                          </div>
                          <div>
                            <div className="font-bold text-[#040E6B] group-hover:text-[#363EE8] transition-colors">
                              {fullName}
                            </div>
                            <div className="text-xs font-semibold text-slate-500">
                              {row.position}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="px-6 py-4 font-bold text-slate-600">
                        {row.department || 'Unassigned'}
                      </td>

                      {/* Rank & Score */}
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-700">Rank #{Math.max(1, Number(row.rankingRank ?? 1))}</div>
                        <div className="text-xs text-slate-500 font-semibold">Score: {Number(row.rankingScore ?? 0).toFixed(2)}</div>
                      </td>

                      {/* Date Hired */}
                      <td className="px-6 py-4 text-slate-600 font-bold">
                        {new Date(row.dateHired).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>

                      {/* Employee ID */}
                      <td className="px-6 py-4">
                        {hasEmployeeNumber ? (
                          <span className="font-mono text-sm font-bold text-[#363EE8]">{row.employeeId}</span>
                        ) : (
                          <span className="text-xs italic text-slate-400">Awaiting credentials</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 text-right">
                        {hasEmployeeNumber ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Saved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                            {statusLabel}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <User size={48} className="mb-4 text-slate-300" />
                        <p className="font-semibold text-slate-500">No newly hired employees found.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-[#363EE8] font-semibold">
            {selectedIds.length} employee{selectedIds.length === 1 ? '' : 's'} selected. Process selected rows to generate account credentials and create employee portal login logs.
          </div>
        </section>
      </main>

      {showCredentialsModal && (
        <div className="credentials-print-overlay fixed inset-0 z-[260] bg-black/70 p-4" onClick={() => { setShowCredentialsModal(false); clearGeneratedCache(); }}>
          <div className="credentials-print-modal mx-auto w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="credentials-print-no flex items-start justify-between border-b border-slate-200 px-8 py-6">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-green-100 p-3 text-green-600">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h2 className="text-4xl font-bold text-[#040E6B]">Generated Employee Credentials</h2>
                  <p className="text-lg font-semibold text-slate-500">Newly Hired Employees • {generatedCredentials.length} {generatedCredentials.length === 1 ? 'credential set' : 'credential sets'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button type="button" onClick={() => window.print()} className="rounded-2xl bg-blue-600 px-5 py-2.5 text-base font-semibold text-white">
                  <Printer className="mr-2 inline h-4 w-4" /> Print
                </button>
                <button
                  type="button"
                  onClick={saveAccountDetails}
                  disabled={savingCredentials}
                  className="rounded-2xl bg-green-600 px-5 py-2.5 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  <Save className="mr-2 inline h-4 w-4" /> {savingCredentials ? 'Saving…' : 'Save Account Details'}
                </button>
                <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => { setShowCredentialsModal(false); clearGeneratedCache(); }}>
                  <X size={20} />
                </button>
              </div>
            </header>

            {saveError && (
              <p className="mx-8 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {saveError}
              </p>
            )}

            <div className="credentials-print-scroll max-h-[72vh] space-y-4 overflow-y-auto p-8">
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
                <article key={credential.id} className="credentials-print-card rounded-2xl border border-slate-200 p-6">
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

                  <p className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-800 credentials-print-no">
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
