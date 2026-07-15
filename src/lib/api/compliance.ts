/**
 * Submission Compliance (Module 1 · Tab 1.3 · Subtab 1).
 *
 * Per-office progress computed from performance_evaluations + the office
 * headcount:
 *   - % Employees Submitted = submitted / total employees in the office
 *   - % Office Verified      = verified / submitted (of what was submitted, how
 *                              much the Office Account actually confirmed)
 *
 * An office can look "complete" on submissions while a backlog of unverified
 * entries still sits with the Supervisor / Dept Head — hence the two layers.
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

// An employee has "submitted" once their IPCR has left self-editing (sent for
// review) or been approved. "Verified" means the Office Account approved it.
export const SUBMITTED_STATUSES = ['Supervisor Review', 'Approved'];
export const VERIFIED_STATUSES = ['Approved'];

export interface EmployeeComplianceRow {
  name: string;
  status: string;
  submitted: boolean;
  verified: boolean;
}

export interface OfficeCompliance {
  officeId: string;
  officeName: string;
  totalEmployees: number;
  submitted: number;
  verified: number;
  pctSubmitted: number;
  pctVerified: number;
  employees: EmployeeComplianceRow[];
}

function defaultPeriod(): string {
  const n = new Date();
  const y = n.getFullYear();
  return n.getMonth() < 6 ? `January–June ${y}` : `July–December ${y}`;
}

/** Resolve the active (or latest) performance cycle → { cycleId, period }. */
export async function getActiveCyclePeriod(): Promise<{ cycleId: number | null; period: string }> {
  try {
    const { data: active } = await supabase
      .from('performance_cycles')
      .select('*')
      .eq('status', 'Active')
      .maybeSingle();
    let cycle = active;
    if (!cycle) {
      const { data: latest } = await supabase
        .from('performance_cycles')
        .select('*')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      cycle = latest;
    }
    if (cycle) return { cycleId: cycle.id ?? null, period: cycle.title || defaultPeriod() };
    return { cycleId: null, period: defaultPeriod() };
  } catch {
    return { cycleId: null, period: defaultPeriod() };
  }
}

/** Per-office compliance for a cycle (null = across all cycles). */
export async function getComplianceByOffice(
  cycleId: number | null,
): Promise<{ ok: true; data: OfficeCompliance[] } | { ok: false; error: string }> {
  try {
    const [deptRes, empRes] = await Promise.all([
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('employees_with_department').select('id, full_name, department_id, department'),
    ]);
    if (deptRes.error) return { ok: false, error: deptRes.error.message ?? 'Failed to load offices.' };

    const departments: any[] = deptRes.data ?? [];
    const employees: any[] = empRes.error ? [] : empRes.data ?? [];

    let evalQuery = supabase.from('performance_evaluations').select('employee_id, status, cycle_id, updated_at');
    if (cycleId != null) evalQuery = evalQuery.eq('cycle_id', cycleId);
    const { data: evals } = await evalQuery;

    // Latest status per employee (rows are few; take the most recent by updated_at).
    const statusByEmp = new Map<string, { status: string; updated_at: string }>();
    for (const e of (evals ?? []) as any[]) {
      const id = String(e?.employee_id ?? '');
      if (!id) continue;
      const prev = statusByEmp.get(id);
      if (!prev || String(e.updated_at ?? '') > prev.updated_at) {
        statusByEmp.set(id, { status: String(e.status ?? ''), updated_at: String(e.updated_at ?? '') });
      }
    }

    const byOffice = new Map<string, any[]>();
    for (const emp of employees) {
      const key = String(emp?.department_id ?? '');
      if (!key) continue;
      const list = byOffice.get(key) ?? [];
      list.push(emp);
      byOffice.set(key, list);
    }

    const data: OfficeCompliance[] = departments.map((d) => {
      const emps = byOffice.get(String(d.id)) ?? [];
      const rows: EmployeeComplianceRow[] = emps.map((e) => {
        const status = statusByEmp.get(String(e.id))?.status ?? 'No submission';
        return {
          name: String(e.full_name ?? '—'),
          status,
          submitted: SUBMITTED_STATUSES.includes(status),
          verified: VERIFIED_STATUSES.includes(status),
        };
      });
      const total = emps.length;
      const submitted = rows.filter((r) => r.submitted).length;
      const verified = rows.filter((r) => r.verified).length;
      return {
        officeId: String(d.id),
        officeName: String(d.name ?? ''),
        totalEmployees: total,
        submitted,
        verified,
        pctSubmitted: total ? Math.round((submitted / total) * 100) : 0,
        pctVerified: submitted ? Math.round((verified / submitted) * 100) : 0,
        employees: rows,
      };
    });

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
