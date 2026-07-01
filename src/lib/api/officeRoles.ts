/**
 * Access & Role Management (Module 1 · Tab 1.1 · Subtab 2).
 *
 * The control panel for assigning / removing office roles. Backed by
 * office_role_assignments (authoritative record + generated Office Account
 * credentials) and access_change_audit (accountability log). See migration
 * 011_create_office_role_assignments.sql.
 *
 * The Succession Transfer Tool reroutes a departing role-holder's pending
 * performance_evaluations (IPCRs awaiting their verification) to the successor
 * so nothing gets stuck mid-cycle.
 */

import { supabase as supabaseClient } from '../supabase';
import { generateTemporaryPassword } from './supervisors';

const supabase = supabaseClient as any;

export type OfficeRole = 'Supervisor' | 'DeptHead';

export const ROLE_LABELS: Record<OfficeRole, string> = {
  Supervisor: 'Supervisor',
  DeptHead: 'Department Head',
};

export interface OfficeRoleAssignment {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  office_id: string | null;
  office_name: string | null;
  role: OfficeRole;
  account_username: string | null;
  account_password: string | null;
  must_change_password: boolean;
  status: 'Active' | 'Revoked';
  assigned_by: string | null;
  assigned_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  successor_employee_id: string | null;
  successor_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeOption {
  id: string;
  full_name: string;
  department: string | null;
  position: string | null;
  status: string | null;
}

export interface PendingSubmission {
  id: string;
  employeeName: string;
  period: string;
  status: string;
  kind: string;
}

/** In-progress evaluation statuses a supervisor still owns (not finalized). */
const PENDING_STATUSES = ['Self Evaluation', 'Supervisor Review'];

const nowIso = () => new Date().toISOString();

const usernameFromName = (fullName: string): string => {
  const base = String(fullName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  const clean = base || 'office.account';
  // Short suffix keeps usernames distinct without a round-trip uniqueness check.
  return `${clean}.${Math.floor(1000 + Math.random() * 9000)}`;
};

async function logAudit(entry: {
  action: 'assign' | 'revoke' | 'transfer' | 'reroute';
  role?: string | null;
  office_name?: string | null;
  employee_name?: string | null;
  successor_name?: string | null;
  performed_by?: string | null;
  details?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('access_change_audit').insert([entry]);
  if (error) console.warn('[officeRoles] audit log failed:', error);
}

/** List office-role assignments (active only by default). */
export async function listAssignments(
  includeRevoked = false,
): Promise<{ ok: true; data: OfficeRoleAssignment[] } | { ok: false; error: string }> {
  try {
    let query = supabase.from('office_role_assignments').select('*').order('assigned_at', { ascending: false });
    if (!includeRevoked) query = query.eq('status', 'Active');
    const { data, error } = await query;
    if (error) return { ok: false, error: error.message ?? 'Failed to load assignments.' };
    return { ok: true, data: (data ?? []) as OfficeRoleAssignment[] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Employees available to assign (for the Add Personnel picker). */
export async function listEmployeeOptions(): Promise<EmployeeOption[]> {
  try {
    const { data, error } = await supabase
      .from('employees_with_department')
      .select('id, full_name, department, current_position, status')
      .order('full_name');
    if (error) return [];
    return (data ?? []).map((e: any) => ({
      id: String(e.id),
      full_name: String(e.full_name ?? ''),
      department: e.department ?? null,
      position: e.current_position ?? null,
      status: e.status ?? null,
    }));
  } catch {
    return [];
  }
}

/** Assign a Supervisor / Dept Head role to an employee for a specific office. */
export async function createAssignment(input: {
  employeeId: string;
  employeeName: string;
  officeId: string;
  officeName: string;
  role: OfficeRole;
  performedBy: string;
}): Promise<{ ok: true; assignment: OfficeRoleAssignment } | { ok: false; error: string }> {
  const username = usernameFromName(input.employeeName);
  const password = generateTemporaryPassword();

  try {
    const { data, error } = await supabase
      .from('office_role_assignments')
      .insert([
        {
          employee_id: input.employeeId,
          employee_name: input.employeeName,
          office_id: input.officeId,
          office_name: input.officeName,
          role: input.role,
          account_username: username,
          account_password: password,
          must_change_password: true,
          status: 'Active',
          assigned_by: input.performedBy,
          assigned_at: nowIso(),
        },
      ])
      .select()
      .single();

    if (error) return { ok: false, error: error.message ?? 'Failed to create the assignment.' };

    await logAudit({
      action: 'assign',
      role: input.role,
      office_name: input.officeName,
      employee_name: input.employeeName,
      performed_by: input.performedBy,
      details: `Assigned ${ROLE_LABELS[input.role]} of ${input.officeName}; Office Account ${username} generated.`,
    });

    return { ok: true, assignment: data as OfficeRoleAssignment };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Pending/in-progress submissions a role-holder still owns — i.e. IPCRs awaiting
 * their verification (performance_evaluations where they are the supervisor and
 * the evaluation is not yet finalized). Used by the Succession Transfer Tool.
 */
export async function getPendingSubmissions(employeeId: string): Promise<PendingSubmission[]> {
  if (!employeeId) return [];
  try {
    const { data: evals, error } = await supabase
      .from('performance_evaluations')
      .select('id, employee_id, period, status')
      .eq('supervisor_id', employeeId)
      .in('status', PENDING_STATUSES);
    if (error || !evals || evals.length === 0) return [];

    const ids = Array.from(new Set(evals.map((e: any) => e.employee_id))).filter(Boolean);
    const { data: employees } = await supabase
      .from('employees_with_department')
      .select('id, full_name')
      .in('id', ids);
    const nameById = new Map<string, string>();
    for (const e of (employees ?? []) as any[]) nameById.set(String(e.id), String(e.full_name ?? ''));

    return (evals as any[]).map((e) => ({
      id: String(e.id),
      employeeName: nameById.get(String(e.employee_id)) ?? 'Unknown employee',
      period: String(e.period ?? '—'),
      status: String(e.status ?? ''),
      kind: 'IPCR',
    }));
  } catch {
    return [];
  }
}

/**
 * Remove/Transfer a role. Revokes the current assignment (history preserved),
 * optionally reassigns the role to a successor, and reroutes the selected
 * pending submissions to that successor. Every step is written to the audit log.
 */
export async function revokeOrTransfer(input: {
  assignment: OfficeRoleAssignment;
  reason: string;
  performedBy: string;
  successor?: { employeeId: string; employeeName: string } | null;
  rerouteSubmissionIds?: string[];
}): Promise<
  { ok: true; successorAssignment: OfficeRoleAssignment | null; rerouted: number } | { ok: false; error: string }
> {
  const { assignment, reason, performedBy, successor, rerouteSubmissionIds = [] } = input;

  try {
    // 1) Revoke the current assignment (access removed, record kept).
    const { error: revokeError } = await supabase
      .from('office_role_assignments')
      .update({
        status: 'Revoked',
        revoked_by: performedBy,
        revoked_at: nowIso(),
        revoke_reason: reason || null,
        successor_employee_id: successor?.employeeId ?? null,
        successor_name: successor?.employeeName ?? null,
      })
      .eq('id', assignment.id);
    if (revokeError) return { ok: false, error: revokeError.message ?? 'Failed to revoke access.' };

    await logAudit({
      action: 'revoke',
      role: assignment.role,
      office_name: assignment.office_name,
      employee_name: assignment.employee_name,
      successor_name: successor?.employeeName ?? null,
      performed_by: performedBy,
      details: reason ? `Access revoked. Reason: ${reason}` : 'Access revoked.',
    });

    // 2) Reassign the role to the successor, if provided.
    let successorAssignment: OfficeRoleAssignment | null = null;
    if (successor && assignment.office_id && assignment.office_name) {
      const created = await createAssignmentInternal({
        employeeId: successor.employeeId,
        employeeName: successor.employeeName,
        officeId: assignment.office_id,
        officeName: assignment.office_name,
        role: assignment.role,
        performedBy,
        auditAction: 'transfer',
        auditDetails: `Role transferred from ${assignment.employee_name ?? 'previous holder'} to ${successor.employeeName}.`,
      });
      if (created.ok) successorAssignment = created.assignment;
    }

    // 3) Reroute selected pending submissions to the successor.
    let rerouted = 0;
    if (successor && rerouteSubmissionIds.length > 0) {
      const { error: rerouteError, count } = await supabase
        .from('performance_evaluations')
        .update({ supervisor_id: successor.employeeId }, { count: 'exact' })
        .in('id', rerouteSubmissionIds);
      if (!rerouteError) {
        rerouted = count ?? rerouteSubmissionIds.length;
        await logAudit({
          action: 'reroute',
          role: assignment.role,
          office_name: assignment.office_name,
          employee_name: assignment.employee_name,
          successor_name: successor.employeeName,
          performed_by: performedBy,
          details: `Rerouted ${rerouted} pending submission(s) to ${successor.employeeName}.`,
        });
      }
    }

    return { ok: true, successorAssignment, rerouted };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Internal variant so transfer can log a 'transfer' action instead of 'assign'.
async function createAssignmentInternal(input: {
  employeeId: string;
  employeeName: string;
  officeId: string;
  officeName: string;
  role: OfficeRole;
  performedBy: string;
  auditAction: 'assign' | 'transfer';
  auditDetails: string;
}): Promise<{ ok: true; assignment: OfficeRoleAssignment } | { ok: false; error: string }> {
  const username = usernameFromName(input.employeeName);
  const password = generateTemporaryPassword();
  const { data, error } = await supabase
    .from('office_role_assignments')
    .insert([
      {
        employee_id: input.employeeId,
        employee_name: input.employeeName,
        office_id: input.officeId,
        office_name: input.officeName,
        role: input.role,
        account_username: username,
        account_password: password,
        must_change_password: true,
        status: 'Active',
        assigned_by: input.performedBy,
        assigned_at: nowIso(),
      },
    ])
    .select()
    .single();
  if (error) return { ok: false, error: error.message ?? 'Failed to create successor assignment.' };

  await logAudit({
    action: input.auditAction,
    role: input.role,
    office_name: input.officeName,
    employee_name: input.employeeName,
    performed_by: input.performedBy,
    details: input.auditDetails,
  });
  return { ok: true, assignment: data as OfficeRoleAssignment };
}

/** Recent access-change audit entries (most recent first). */
export async function listAuditTrail(limit = 40): Promise<
  {
    id: string;
    action: string;
    role: string | null;
    office_name: string | null;
    employee_name: string | null;
    successor_name: string | null;
    performed_by: string | null;
    details: string | null;
    created_at: string;
  }[]
> {
  try {
    const { data, error } = await supabase
      .from('access_change_audit')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as any[];
  } catch {
    return [];
  }
}
