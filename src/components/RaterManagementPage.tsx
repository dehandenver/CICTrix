import {
  CheckCircle2,
  FileSpreadsheet,
  Pencil,
  Search,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { mockDatabase } from '../lib/mockDatabase';
import {
  downloadTextFile,
  ensureRecruitmentSeedData,
  formatPHDate,
  getRaterAssignments,
  saveRaterAssignments,
  toCsv,
} from '../lib/recruitmentData';
import { isMockModeEnabled, supabase } from '../lib/supabase';
import { RaterAssignment } from '../types/recruitment.types';
import { Sidebar } from './Sidebar';

interface AssignmentForm {
  employeeName: string;
  employeePosition: string;
  department: string;
  period: string;
  immediateSupervisor: string;
  departmentHead: string;
  additionalRater: string;
  effectiveDate: string;
  expirationDate: string;
}

interface RaterOption {
  id: string;
  name: string;
  email: string;
  department?: string;
  is_active: boolean;
}

interface RaterDirectoryRow {
  key: string;
  raterId?: string;
  name: string;
  designation: string;
  accessRole: string;
  assignedJobPositions: string;
  lastLogin: string;
  isActive: boolean;
}

const normalizeValue = (value: unknown) => String(value ?? '').trim().toLowerCase();

const defaultAssignmentForm = (): AssignmentForm => ({
  employeeName: '',
  employeePosition: '',
  department: '',
  period: '',
  immediateSupervisor: '',
  departmentHead: '',
  additionalRater: '',
  effectiveDate: '',
  expirationDate: '',
});

const getAccessClient = () => {
  // Access control must use the real rater DB when Supabase is configured.
  return isMockModeEnabled ? (mockDatabase as any) : supabase;
};
const RATER_ACCESS_STATE_KEY = 'cictrix_rater_access_state_map';

const saveRaterAccessState = (email: string, isActive: boolean) => {
  try {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const raw = localStorage.getItem(RATER_ACCESS_STATE_KEY);
    const current = raw ? JSON.parse(raw) : {};
    const next = current && typeof current === 'object' ? { ...current } : {};
    next[normalizedEmail] = isActive;
    localStorage.setItem(RATER_ACCESS_STATE_KEY, JSON.stringify(next));
  } catch {
  }
};

const runRaterEmailUpdate = async (
  client: any,
  updates: Record<string, unknown>,
  email: string,
  anchorId?: string
) => {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await client.from('raters').select('id,email');
  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const matchedIds = rows
    .filter((row: any) => String(row?.email ?? '').trim().toLowerCase() === normalizedEmail)
    .map((row: any) => String(row?.id ?? '').trim())
    .filter(Boolean);

  const normalizedAnchorId = String(anchorId ?? '').trim();
  if (normalizedAnchorId && !matchedIds.includes(normalizedAnchorId)) {
    matchedIds.push(normalizedAnchorId);
  }

  if (matchedIds.length === 0) {
    throw new Error('No matching rater account found for update.');
  }

  const updateResults = await Promise.all(
    matchedIds.map((id) => client.from('raters').update(updates).eq('id', id))
  );

  const allFailed = updateResults.every((result: any) => Boolean(result?.error));
  if (allFailed) {
    throw new Error('Failed to persist rater access update.');
  }
};

const verifyRaterAccessState = async (client: any, email: string, expectedIsActive: boolean) => {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await client.from('raters').select('id,email,is_active');
  if (error) {
    throw error;
  }

  const rows = (Array.isArray(data) ? data : []).filter(
    (row: any) => String(row?.email ?? '').trim().toLowerCase() === normalizedEmail
  );

  if (rows.length === 0) {
    throw new Error('No matching rater account found after update.');
  }

  const mismatch = rows.some((row: any) => Boolean(row?.is_active) !== expectedIsActive);
  if (mismatch) {
    throw new Error('Rater access update did not persist for all matching rows.');
  }
};

export const RaterManagementPage = () => {
  const [assignments, setAssignments] = useState<RaterAssignment[]>([]);
  const [search, setSearch] = useState('');
  const [accessStatusFilter, setAccessStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [form, setForm] = useState<AssignmentForm>(defaultAssignmentForm());
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [availableRaters, setAvailableRaters] = useState<RaterOption[]>([]);
  const [assignedPositions, setAssignedPositions] = useState<string[]>([]);

  const fetchAvailableRaters = async () => {
    try {
      const client = getAccessClient();
      const response = await client
        .from('raters')
        .select('id,name,email,department,is_active')
        .order('name');

      const rows = (((response as any)?.data ?? []) as RaterOption[])
        .filter((row) => row?.name && row?.email);

      setAvailableRaters(rows);
    } catch {
      setToast('Unable to load raters from database.');
    }
  };

  useEffect(() => {
    ensureRecruitmentSeedData();
    const initialAssignments = getRaterAssignments();
    setAssignments(initialAssignments);

    void fetchAvailableRaters();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const raterRows = useMemo(() => {
    const mapped = new Map<string, {
      key: string;
      raterId?: string;
      name: string;
      designation: string;
      accessRole: string;
      isActive: boolean;
      lastLoginIso?: string;
      positions: Set<string>;
    }>();

    assignments.forEach((assignment) => {
      const supervisor = assignment.raters.immediateSupervisor;
      const normalizedId = String(supervisor.id ?? '').trim();
      const key = normalizedId || normalizeValue(supervisor.name);
      if (!key) return;

      const existing = mapped.get(key);
      if (!existing) {
        mapped.set(key, {
          key,
          raterId: normalizedId || undefined,
          name: supervisor.name,
          designation: assignment.department || supervisor.position || 'Rater',
          accessRole: 'Interviewer',
          isActive: true,
          lastLoginIso: assignment.createdDate,
          positions: new Set(
            assignment.employeePosition
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
          ),
        });
        return;
      }

      assignment.employeePosition
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .forEach((position) => existing.positions.add(position));

      if (!existing.lastLoginIso || new Date(assignment.createdDate) > new Date(existing.lastLoginIso)) {
        existing.lastLoginIso = assignment.createdDate;
      }
    });

    availableRaters.forEach((rater) => {
      const normalizedId = String(rater.id ?? '').trim();
      const key = normalizedId || normalizeValue(rater.name);
      if (!key) return;

      const existing = mapped.get(key);
      if (!existing) {
        mapped.set(key, {
          key,
          raterId: normalizedId || undefined,
          name: rater.name,
          designation: rater.department || 'Rater',
          accessRole: 'Interviewer',
          isActive: Boolean(rater.is_active),
          positions: new Set(),
        });
        return;
      }

      existing.raterId = existing.raterId || normalizedId || undefined;
      existing.designation = existing.designation === 'Rater' && rater.department
        ? rater.department
        : existing.designation;
      existing.isActive = Boolean(rater.is_active);
    });

    const searchTerm = search.trim().toLowerCase();

    return Array.from(mapped.values())
      .map<RaterDirectoryRow>((row) => ({
        key: row.key,
        raterId: row.raterId,
        name: row.name,
        designation: row.designation,
        accessRole: row.accessRole,
        assignedJobPositions: row.positions.size ? Array.from(row.positions).join(', ') : '--',
        lastLogin: row.lastLoginIso ? formatPHDate(row.lastLoginIso) : '--',
        isActive: row.isActive,
      }))
      .filter((row) => {
        const matchesSearch = !searchTerm || `${row.name} ${row.designation} ${row.assignedJobPositions}`.toLowerCase().includes(searchTerm);
        const matchesStatus = accessStatusFilter === 'all'
          ? true
          : accessStatusFilter === 'active'
            ? row.isActive
            : !row.isActive;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, availableRaters, search, accessStatusFilter]);

  const persistAssignments = (nextRows: RaterAssignment[]) => {
    setAssignments(nextRows);
    saveRaterAssignments(nextRows);
  };

  const openAssignModal = (assignment?: RaterAssignment) => {
    void fetchAvailableRaters();
    if (assignment) {
      setEditingAssignmentId(assignment.id);
      setForm({
        employeeName: assignment.employeeName,
        employeePosition: assignment.employeePosition,
        department: assignment.department,
        period: assignment.evaluationPeriod,
        immediateSupervisor: assignment.raters.immediateSupervisor.name,
        departmentHead: assignment.raters.departmentHead.name,
        additionalRater: assignment.raters.additionalRater?.name ?? '',
        effectiveDate: assignment.effectiveDate.slice(0, 10),
        expirationDate: assignment.expirationDate?.slice(0, 10) ?? '',
      });
      setAssignedPositions(
        assignment.employeePosition
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      );
    } else {
      setEditingAssignmentId(null);
      setForm(defaultAssignmentForm());
      setAssignedPositions([]);
    }
    setShowAssignModal(true);
  };

  const handleRaterSelection = (raterName: string) => {
    const selected = availableRaters.find((entry) => entry.name === raterName);
    setForm((current) => ({
      ...current,
      employeeName: raterName,
      department: selected?.department ?? current.department,
      immediateSupervisor: raterName,
      departmentHead: raterName,
      additionalRater: '',
    }));
  };

  const toggleAssignedPosition = (position: string) => {
    setAssignedPositions((current) =>
      current.includes(position)
        ? current.filter((item) => item !== position)
        : [...current, position]
    );
  };

  const saveAssignment = () => {
    if (!form.employeeName || assignedPositions.length === 0) {
      setToast('Please complete required assignment fields.');
      return;
    }

    const selectedRater = availableRaters.find((entry) => entry.name === form.employeeName);
    const effectiveDateIso = form.effectiveDate
      ? new Date(form.effectiveDate).toISOString()
      : new Date().toISOString();
    const resolvedPeriod = form.period || 'Current Period';

    const payload: RaterAssignment = {
      id: editingAssignmentId ?? crypto.randomUUID(),
      employeeId: editingAssignmentId ?? `EMP-PENDING-${Math.floor(Math.random() * 9999)}`,
      employeeName: form.employeeName,
      employeePosition: assignedPositions.join(', '),
      department: form.department || selectedRater?.department || 'Unassigned',
      evaluationPeriod: resolvedPeriod,
      raters: {
        immediateSupervisor: {
          id: selectedRater?.id ?? crypto.randomUUID(),
          name: form.immediateSupervisor,
          position: 'Immediate Supervisor',
        },
        departmentHead: {
          id: selectedRater?.id ?? crypto.randomUUID(),
          name: form.departmentHead,
          position: 'Department Head',
        },
        additionalRater: form.additionalRater
          ? {
              id: crypto.randomUUID(),
              name: form.additionalRater,
              position: 'Additional Rater',
            }
          : undefined,
        pmdHead: {
          id: 'pmd-001',
          name: 'Liza Manalo',
          position: 'PMD Head',
        },
      },
      effectiveDate: effectiveDateIso,
      expirationDate: form.expirationDate ? new Date(form.expirationDate).toISOString() : undefined,
      status: 'Assigned',
      createdBy: 'HR Admin',
      createdDate: new Date().toISOString(),
    };

    const nextRows = editingAssignmentId
      ? assignments.map((row) => (row.id === editingAssignmentId ? payload : row))
      : [payload, ...assignments];

    persistAssignments(nextRows);
    setShowAssignModal(false);
    setAssignedPositions([]);
    setToast(editingAssignmentId ? 'Assignment updated.' : 'Rater assigned successfully.');
  };

  const findRaterByName = (name: string) => {
    const normalized = normalizeValue(name);
    return availableRaters.find((rater) => normalizeValue(rater.name) === normalized);
  };

  const findRaterById = (id: string) => {
    const normalizedId = String(id ?? '').trim();
    if (!normalizedId) return undefined;
    return availableRaters.find((rater) => String(rater.id ?? '').trim() === normalizedId);
  };

  const resolveRaterAccount = (raterId: string | undefined, raterName: string) => {
    const byId = raterId ? findRaterById(raterId) : undefined;
    if (byId) return byId;
    return findRaterByName(raterName);
  };

  const toggleRaterAccess = async (raterId: string | undefined, raterName: string) => {
    const client = getAccessClient();
    let existing = resolveRaterAccount(raterId, raterName);

    // Pull latest raters from DB before failing a toggle, so newly-created accounts work immediately.
    if (!existing) {
      try {
        const latestResponse = await client
          .from('raters')
          .select('id,name,email,department,is_active')
          .order('name');
        const latestRows = (((latestResponse as any)?.data ?? []) as RaterOption[]).filter(
          (row) => row?.name && row?.email
        );
        if (latestRows.length > 0) {
          setAvailableRaters(latestRows);
          const normalizedTargetId = String(raterId ?? '').trim();
          const normalizedTargetName = normalizeValue(raterName);
          existing =
            latestRows.find((row) => String(row.id ?? '').trim() === normalizedTargetId) ||
            latestRows.find((row) => normalizeValue(row.name) === normalizedTargetName);
        }
      } catch {
        // Keep existing local state and show actionable toast below if still unresolved.
      }
    }

    if (!existing) {
      setToast('No matching rater account in database. Use Assign Rater and select a rater account first.');
      return;
    }

    const nextIsActive = !existing.is_active;
    const normalizedEmail = existing.email.trim().toLowerCase();
    setAvailableRaters((current) =>
      current.map((rater) =>
        rater.email.trim().toLowerCase() === normalizedEmail ? { ...rater, is_active: nextIsActive } : rater
      )
    );

    try {
      await runRaterEmailUpdate(client, { is_active: nextIsActive }, normalizedEmail, String(existing.id));
      await verifyRaterAccessState(client, normalizedEmail, nextIsActive);
      saveRaterAccessState(normalizedEmail, nextIsActive);
      await fetchAvailableRaters();
      setToast(nextIsActive ? 'Interviewer access granted.' : 'Interviewer access revoked.');
    } catch {
      setAvailableRaters((current) =>
        current.map((rater) =>
          rater.email.trim().toLowerCase() === normalizedEmail ? { ...rater, is_active: existing.is_active } : rater
        )
      );
      setToast('Failed to update interviewer access.');
    }
  };

  const exportRaterList = () => {
    const csv = toCsv(
      ['Rater Name', 'Designation / Position', 'Access Role', 'Assigned Job Position(s)', 'Last Login', 'Status'],
      raterRows.map((row) => [
        row.name,
        row.designation,
        row.accessRole,
        row.assignedJobPositions,
        row.lastLogin,
        row.isActive ? 'Active' : 'Inactive',
      ])
    );
    downloadTextFile('rater-list.csv', csv, 'text/csv;charset=utf-8');
    setToast('Rater list downloaded.');
  };

  const assignableJobPositions = useMemo(() => {
    const fromAssignments = assignments
      .flatMap((item) => item.employeePosition.split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);

    const defaults = [
      'IT Officer II',
      'HR Assistant',
      'Admin Aide II',
      'Admin Aide III',
      'Clerk I',
      'Clerk II',
      'Engineer II',
      'HR Officer',
      'Administrative Officer',
      'IT Programmer',
      'Accountant II',
      'Legal Officer I',
    ];

    return Array.from(new Set([...fromAssignments, ...defaults]));
  }, [assignments]);

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />
      <main className="admin-content bg-slate-50">
        <header className="mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Rater Management</h1>
            <p className="text-slate-600">Manage interviewer accounts and access assignments</p>
          </div>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => openAssignModal()}>
                <UserPlus className="mr-1 inline h-4 w-4" /> Add New Rater
              </button>
              <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700" onClick={exportRaterList}>
                <FileSpreadsheet className="mr-1 inline h-4 w-4" /> Download Rater List
              </button>
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <div className="relative min-w-[240px] flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm"
                  placeholder="Search raters..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <select
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                value={accessStatusFilter}
                onChange={(event) => setAccessStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Rater Name</th>
                    <th className="px-5 py-3">Designation / Position</th>
                    <th className="px-5 py-3">Access Role</th>
                    <th className="px-5 py-3">Assigned Job Position(s)</th>
                    <th className="px-5 py-3">Last Login</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {raterRows.map((row) => (
                    <tr key={row.key} className="border-t border-slate-100 bg-white hover:bg-slate-50/70">
                      <td className="px-5 py-4 font-semibold text-slate-900">{row.name}</td>
                      <td className="px-5 py-4 text-slate-600">{row.designation}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">{row.accessRole}</span>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{row.assignedJobPositions}</td>
                      <td className="px-5 py-4 text-slate-600">{row.lastLogin}</td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                          {row.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            type="button"
                            className="rounded p-1 text-blue-600 hover:bg-blue-50"
                            title="Edit rater assignment"
                            onClick={() => {
                              const assignmentToEdit = assignments.find(
                                (item) => normalizeValue(item.raters.immediateSupervisor.name) === normalizeValue(row.name)
                              );
                              openAssignModal(assignmentToEdit);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={`inline-flex items-center rounded-lg border px-2 py-1 text-xs font-semibold transition ${row.isActive ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                            title={row.isActive ? 'Revoke access' : 'Grant access'}
                            onClick={() => toggleRaterAccess(row.raterId, row.name)}
                          >
                            {row.isActive ? (
                              <>
                                <XCircle className="mr-1 h-3.5 w-3.5" />
                                Revoke Access
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                Grant Access
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {raterRows.length === 0 && (
                    <tr>
                      <td className="px-5 py-8 text-center text-sm text-slate-500" colSpan={7}>
                        No rater records found for the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {showAssignModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/70 p-4" onClick={() => setShowAssignModal(false)}>
          <div className="mx-auto mt-6 flex h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between bg-blue-700 px-6 py-4 text-white">
              <div>
                <h2 className="text-3xl font-bold">Assign Rater Access</h2>
                <p className="text-base text-blue-100">Grant access to interviewer portal</p>
              </div>
              <button className="rounded-md p-1 text-white/90 hover:bg-white/10" onClick={() => setShowAssignModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <section>
                <label className="mb-2 block text-base font-semibold text-slate-700">Select Rater <span className="text-red-500">*</span></label>
                <select
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
                  value={form.employeeName}
                  onChange={(event) => handleRaterSelection(event.target.value)}
                >
                  <option value="">Choose a rater...</option>
                  {availableRaters.map((rater) => (
                    <option key={rater.id} value={rater.name}>{rater.name}</option>
                  ))}
                </select>
              </section>

              <section>
                <label className="mb-2 block text-base font-semibold text-slate-700">Designation / Role</label>
                <input className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-lg" value={form.department} readOnly />
                <p className="mt-2 text-sm text-slate-500">Auto-filled based on selected rater</p>
              </section>

              <section>
                <label className="mb-2 block text-base font-semibold text-slate-700">Access Level <span className="text-red-500">*</span></label>
                <select className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-lg" value="Interviewer" disabled>
                  <option value="Interviewer">Interviewer</option>
                </select>
              </section>

              <section>
                <label className="mb-2 block text-base font-semibold text-slate-700">Assign Job Positions <span className="text-red-500">*</span></label>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-300 p-4">
                  <div className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
                    {assignableJobPositions.map((position) => {
                      const checked = assignedPositions.includes(position);
                      return (
                        <label key={position} className="flex items-center gap-3 text-xl text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAssignedPosition(position)}
                            className="h-5 w-5 rounded"
                          />
                          <span>{position}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-500">Selected: {assignedPositions.length} position{assignedPositions.length === 1 ? '' : 's'}</p>
              </section>

              {availableRaters.length === 0 && (
                <p className="text-xs text-amber-700">No active raters found in database. Add raters first, then reopen this form.</p>
              )}

              <section>
                <h3 className="mb-3 text-3xl font-bold text-slate-800">Access Duration (Optional)</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-600">Start Date</label>
                    <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg" type="date" value={form.effectiveDate} onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} />
                  </div>
                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-600">End Date</label>
                    <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg" type="date" value={form.expirationDate} onChange={(event) => setForm({ ...form, expirationDate: event.target.value })} />
                  </div>
                </div>
              </section>

              <input type="hidden" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} />

              <div className="hidden">
                <input value={form.immediateSupervisor} onChange={(event) => setForm({ ...form, immediateSupervisor: event.target.value })} />
                <input value={form.departmentHead} onChange={(event) => setForm({ ...form, departmentHead: event.target.value })} />
                <input value={form.additionalRater} onChange={(event) => setForm({ ...form, additionalRater: event.target.value })} />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button className="rounded-lg border border-slate-300 px-4 py-2 text-lg" onClick={() => setShowAssignModal(false)}>Cancel</button>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-lg font-semibold text-white" onClick={saveAssignment}>Save & Generate Access</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
};
