/**
 * Office Directory (Module 1 · Tab 1.1 · Subtab: Office Directory).
 *
 * Read-mostly master view: one row per office (department) showing the assigned
 * Department Head, the assigned Supervisor(s), and the headcount under that
 * office. This is the single source of truth PM/HR consult for "who is
 * currently responsible for this office's IPCRs." It reflects what has been
 * configured elsewhere (departments.head_employee_id + the supervisors table);
 * it does not write anything.
 *
 * Data sources:
 *   - departments                 → offices (name, code, active flag, head FK)
 *   - employees_with_department    → dept-head details + per-office headcount
 *   - supervisors                  → supervisor(s) assigned per office
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export interface OfficePerson {
  name: string;
  /** Email and/or mobile, best-effort. */
  contact: string;
  position: string | null;
  /** Employment/account status label (e.g. Active, Inactive, On Leave). */
  accountStatus: string;
}

export interface OfficeDirectoryRow {
  officeId: string;
  officeName: string;
  code: string;
  isActive: boolean;
  deptHead: OfficePerson | null;
  supervisors: OfficePerson[];
  employeeCount: number;
}

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase();

const buildContact = (email?: unknown, mobile?: unknown): string => {
  const parts = [String(email ?? '').trim(), String(mobile ?? '').trim()].filter(Boolean);
  return parts.join(' · ') || '—';
};

/**
 * Assemble the full office directory. Returns rows sorted by office name.
 * Missing/optional data (no head, no supervisors) is represented explicitly
 * rather than hidden, so gaps in configuration are visible to PM/HR.
 */
export async function getOfficeDirectory(): Promise<
  { ok: true; data: OfficeDirectoryRow[] } | { ok: false; error: string }
> {
  try {
    const [deptRes, empRes, supRes] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase
        .from('employees_with_department')
        .select('id, full_name, email, mobile_number, current_position, department, department_id, status'),
      supabase.from('supervisors').select('*'),
    ]);

    if (deptRes.error) {
      return { ok: false, error: deptRes.error.message ?? 'Failed to load offices.' };
    }

    const departments: any[] = deptRes.data ?? [];
    const employees: any[] = empRes.error ? [] : empRes.data ?? [];
    const supervisors: any[] = supRes.error ? [] : supRes.data ?? [];

    // Index employees by id (for dept-head lookup) and count per department.
    const employeeById = new Map<string, any>();
    const headcountByDeptId = new Map<string, number>();
    const headcountByDeptName = new Map<string, number>();
    for (const emp of employees) {
      if (emp?.id) employeeById.set(String(emp.id), emp);
      if (emp?.department_id) {
        const key = String(emp.department_id);
        headcountByDeptId.set(key, (headcountByDeptId.get(key) ?? 0) + 1);
      }
      const nameKey = norm(emp?.department);
      if (nameKey) headcountByDeptName.set(nameKey, (headcountByDeptName.get(nameKey) ?? 0) + 1);
    }

    // Group supervisors by their (normalized) office/department name.
    const supervisorsByOffice = new Map<string, OfficePerson[]>();
    for (const sup of supervisors) {
      const key = norm(sup?.department);
      if (!key) continue;
      const person: OfficePerson = {
        name: String(sup?.full_name ?? '').trim() || 'Unnamed supervisor',
        contact: String(sup?.username ? `@${sup.username}` : '—'),
        position: sup?.position ?? 'Supervisor',
        accountStatus: String(sup?.account_status ?? 'Unknown'),
      };
      const list = supervisorsByOffice.get(key) ?? [];
      list.push(person);
      supervisorsByOffice.set(key, list);
    }

    const rows: OfficeDirectoryRow[] = departments.map((dept) => {
      const officeName = String(dept?.name ?? '').trim();
      const headEmp = dept?.head_employee_id
        ? employeeById.get(String(dept.head_employee_id))
        : null;

      const deptHead: OfficePerson | null = headEmp
        ? {
            name: String(headEmp.full_name ?? '').trim() || 'Unnamed',
            contact: buildContact(headEmp.email, headEmp.mobile_number),
            position: headEmp.current_position ?? 'Department Head',
            accountStatus: String(headEmp.status ?? 'Unknown'),
          }
        : null;

      const employeeCount =
        headcountByDeptId.get(String(dept?.id)) ??
        headcountByDeptName.get(norm(officeName)) ??
        0;

      return {
        officeId: String(dept?.id ?? officeName),
        officeName,
        code: String(dept?.code ?? ''),
        isActive: Boolean(dept?.is_active),
        deptHead,
        supervisors: supervisorsByOffice.get(norm(officeName)) ?? [],
        employeeCount,
      };
    });

    return { ok: true, data: rows };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Case-insensitive filter across office name, dept-head name, and supervisor names. */
export function filterOfficeDirectory(rows: OfficeDirectoryRow[], term: string): OfficeDirectoryRow[] {
  const q = norm(term);
  if (!q) return rows;
  return rows.filter((row) => {
    if (norm(row.officeName).includes(q)) return true;
    if (row.deptHead && norm(row.deptHead.name).includes(q)) return true;
    return row.supervisors.some((s) => norm(s.name).includes(q));
  });
}
