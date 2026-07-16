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

export interface OfficeDivision {
  name: string;
  supervisors: OfficePerson[];
}

export interface OfficeDirectoryRow {
  officeId: string;
  officeName: string;
  code: string;
  isActive: boolean;
  deptHead: OfficePerson | null;
  supervisors: OfficePerson[];
  employeeCount: number;
  divisions: OfficeDivision[];
}

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase();

const buildContact = (email?: unknown, mobile?: unknown): string => {
  const parts = [String(email ?? '').trim(), String(mobile ?? '').trim()].filter(Boolean);
  return parts.join(' · ') || '—';
};

const OFFICE_DIVISIONS_MAP: Record<string, string[]> = {
  'Human Resources': [
    'Recruitment, Selection & Placement (RSP)',
    'Learning & Development (L&D)',
    'Performance Management (PM)'
  ],
  'Finance': [
    'Accounting',
    'Budgeting',
    'Treasury'
  ],
  'Information Technology': [
    'Systems Development',
    'Network & Infrastructure',
    'Technical Support'
  ],
  'Operations': [
    'Field Operations',
    'Logistics & Planning'
  ],
  'Sales & Marketing': [
    'Sales & Account Management',
    'Marketing & Branding'
  ],
  'Customer Support': [
    'Helpdesk & Customer Relations',
    'Technical Support'
  ],
  'Product Management': [
    'Product Design',
    'Product Engineering'
  ]
};

const matchSupervisorToDivision = (sup: OfficePerson, divisions: string[]): string => {
  const supText = `${sup.name} ${sup.position ?? ''} ${sup.contact}`.toLowerCase();
  
  if (supText.includes('rsp') || supText.includes('recruitment')) {
    const match = divisions.find(d => d.includes('RSP') || d.toLowerCase().includes('recruitment'));
    if (match) return match;
  }
  if (supText.includes('l&d') || supText.includes('learning') || supText.includes('development')) {
    const match = divisions.find(d => d.includes('L&D') || d.toLowerCase().includes('learning'));
    if (match) return match;
  }
  if (supText.includes('pm') || supText.includes('performance')) {
    const match = divisions.find(d => d.includes('PM') || d.toLowerCase().includes('performance'));
    if (match) return match;
  }
  
  let bestDivision = divisions[0] || 'General Administration';
  let maxMatches = 0;
  
  for (const div of divisions) {
    const divKeywords = div.toLowerCase().split(/[^a-z0-9]+/g).filter(w => w.length > 2);
    let matches = 0;
    for (const kw of divKeywords) {
      if (supText.includes(kw)) {
        matches++;
      }
    }
    if (matches > maxMatches) {
      maxMatches = matches;
      bestDivision = div;
    }
  }
  
  return bestDivision;
};

const isSupervisorForOffice = (supDept: string, officeName: string, officeCode: string): boolean => {
  const d = (supDept ?? '').toLowerCase().trim();
  const o = (officeName ?? '').toLowerCase().trim();
  const c = (officeCode ?? '').toLowerCase().trim();
  
  if (!d) return false;
  if (d === o || d === c) return true;
  
  // Special HR mappings
  if (o.includes('human resources') || c === 'hr') {
    if (d.includes('human resource') || d.includes('learning & development') || d.includes('performance management') || d.includes('l&d') || d.includes('pm')) {
      return true;
    }
  }
  
  // Check static division names
  const divisions = OFFICE_DIVISIONS_MAP[officeName] ?? [];
  for (const div of divisions) {
    if (d === div.toLowerCase().trim() || d.includes(div.toLowerCase().trim()) || div.toLowerCase().trim().includes(d)) {
      return true;
    }
  }
  
  return false;
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
    const [deptRes, empRes, supRes, assignRes, jobsRes, hiredRes] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      // NOTE: the view exposes no `department_id` — selecting it made this query
      // fail with 42703, and the error was swallowed into an empty list, which
      // is why every office reported a headcount of 0. Join on the name instead.
      supabase
        .from('employees_with_department')
        .select('id, employee_id, full_name, email, mobile_number, current_position, department, current_department, status'),
      supabase.from('supervisors').select('*'),
      // Active office-role assignments (Phase 2). Missing table (not migrated
      // yet) is tolerated — the directory still renders from the other sources.
      supabase.from('office_role_assignments').select('*').eq('status', 'Active'),
      supabase.from('job_postings').select('department'),
      // Hired applicants — the agency's actual staff until employee records are
      // migrated into `employees`. Counted toward each office's headcount below.
      supabase.from('applicants').select('id, email, office, status').eq('status', 'Hired')
    ]);

    if (deptRes.error) {
      return { ok: false, error: deptRes.error.message ?? 'Failed to load offices.' };
    }

    const departmentsFromDb: any[] = deptRes.data ?? [];
    const employees: any[] = empRes.error ? [] : empRes.data ?? [];
    const dbSupervisors: any[] = supRes.error ? [] : supRes.data ?? [];
    const assignments: any[] = assignRes?.error ? [] : assignRes?.data ?? [];
    const jobsData: any[] = jobsRes?.error ? [] : jobsRes?.data ?? [];
    const hiredApplicants: any[] = hiredRes?.error ? [] : hiredRes?.data ?? [];

    // The canonical `departments` table is the source of truth for offices — the
    // same list every other screen reads. Deriving the office list from
    // job_postings instead made this directory show only the handful of offices
    // that happened to have a posting, disagreeing with the rest of the system.
    // A posting whose department isn't in the table yet is appended so its
    // office still can't silently disappear.
    const jobDepts = Array.from(new Set(jobsData.map((j: any) => String(j.department || '').trim()).filter(Boolean)));
    const knownDeptNames = new Set(departmentsFromDb.map((d: any) => norm(d.name)));
    const orphanDepts = jobDepts
      .filter((deptName) => !knownDeptNames.has(norm(deptName)))
      .map((deptName) => ({
        id: `dynamic-${deptName.toLowerCase().replace(/\s+/g, '-')}`,
        name: deptName,
        code: deptName.split(/\s+/).map((w: string) => w[0]).join('').toUpperCase().slice(0, 4),
        head_employee_id: null,
        parent_department_id: null,
        is_active: true,
        created_at: new Date().toISOString()
      }));
    const departments = [...departmentsFromDb, ...orphanDepts];

    // Group active assignments by office id and by office name (fallback join key).
    const assignmentPerson = (a: any): OfficePerson => ({
      name: String(a?.employee_name ?? '').trim() || 'Unnamed',
      contact: a?.account_username ? `@${a.account_username}` : '—',
      position: a?.role === 'DeptHead' ? 'Department Head' : 'Supervisor',
      accountStatus: 'Active',
    });
    const deptHeadAssignByOfficeId = new Map<string, any>();
    const supervisorAssignsByOfficeId = new Map<string, OfficePerson[]>();
    for (const a of assignments) {
      const officeKey = String(a?.office_id ?? '');
      if (!officeKey) continue;
      if (a?.role === 'DeptHead') {
        if (!deptHeadAssignByOfficeId.has(officeKey)) deptHeadAssignByOfficeId.set(officeKey, a);
      } else if (a?.role === 'Supervisor') {
        const list = supervisorAssignsByOfficeId.get(officeKey) ?? [];
        list.push(assignmentPerson(a));
        supervisorAssignsByOfficeId.set(officeKey, list);
      }
    }

    // Index employees by id (for dept-head lookup) and count per department.
    const employeeById = new Map<string, any>();
    const headcountByDeptName = new Map<string, number>();
    // People already counted, keyed by email, so someone present as both an
    // employee record and a hired applicant isn't counted twice.
    const countedPeople = new Set<string>();

    for (const emp of employees) {
      if (emp?.id) employeeById.set(String(emp.id), emp);
      const email = norm(emp?.email);
      if (email) countedPeople.add(email);
      const nameKey = norm(emp?.department) || norm(emp?.current_department);
      if (nameKey) headcountByDeptName.set(nameKey, (headcountByDeptName.get(nameKey) ?? 0) + 1);
    }

    // Hired applicants are the agency's actual staff while employee records still
    // live in the recruitment tables — `employees_with_department` is empty, so
    // counting it alone reported 0 for every office even though the drill-down
    // listed people. Fold them in here (rather than in one dashboard) so RSP, PM
    // and System Administration all read the same headcount.
    for (const applicant of hiredApplicants) {
      const email = norm(applicant?.email);
      if (email && countedPeople.has(email)) continue;
      if (email) countedPeople.add(email);
      const nameKey = norm(applicant?.office);
      if (nameKey) headcountByDeptName.set(nameKey, (headcountByDeptName.get(nameKey) ?? 0) + 1);
    }

    const rows: OfficeDirectoryRow[] = departments.map((dept) => {
      const officeName = String(dept?.name ?? '').trim();
      const officeIdKey = String(dept?.id ?? '');

      // Dept Head: an active DeptHead assignment (Phase 2) wins; otherwise fall
      // back to the department's head_employee_id link.
      const headAssign = deptHeadAssignByOfficeId.get(officeIdKey);
      const headEmp = dept?.head_employee_id ? employeeById.get(String(dept.head_employee_id)) : null;

      let deptHead: OfficePerson | null = null;
      if (headAssign) {
        deptHead = assignmentPerson(headAssign);
      } else if (headEmp) {
        deptHead = {
          name: String(headEmp.full_name ?? '').trim() || 'Unnamed',
          contact: buildContact(headEmp.email, headEmp.mobile_number),
          position: headEmp.current_position ?? 'Department Head',
          accountStatus: String(headEmp.status ?? 'Unknown'),
        };
      }

      // Standalone supervisor accounts associated with this office or its divisions
      const standaloneSups: OfficePerson[] = dbSupervisors
        .filter((sup) => isSupervisorForOffice(sup.department ?? '', officeName, String(dept.code ?? '')))
        .map((sup) => ({
          name: String(sup?.full_name ?? '').trim() || 'Unnamed supervisor',
          contact: String(sup?.username ? `@${sup.username}` : '—'),
          position: sup?.position ?? 'Supervisor',
          accountStatus: String(sup?.account_status ?? 'Unknown'),
        }));

      // Combined list of supervisors
      const supervisors: OfficePerson[] = [
        ...standaloneSups,
        ...(supervisorAssignsByOfficeId.get(officeIdKey) ?? []),
      ];

      const employeeCount = headcountByDeptName.get(norm(officeName)) ?? 0;

      // Divisions resolution (dynamic from DB if available, else static fallback)
      const dbDivisions = departments
        .filter((d) => d.parent_department_id === officeIdKey)
        .map((d) => String(d.name));

      const staticDivNames = OFFICE_DIVISIONS_MAP[officeName] ?? [];
      const divisionNames = dbDivisions.length > 0 ? dbDivisions : [...staticDivNames];

      if (divisionNames.length === 0) {
        divisionNames.push('General Administration');
      }

      const divisionsMap = new Map<string, OfficePerson[]>();
      for (const divName of divisionNames) {
        divisionsMap.set(divName, []);
      }

      for (const sup of supervisors) {
        const matchedDiv = matchSupervisorToDivision(sup, divisionNames);
        const list = divisionsMap.get(matchedDiv) ?? [];
        list.push(sup);
        divisionsMap.set(matchedDiv, list);
      }

      const divisions = Array.from(divisionsMap.entries()).map(([name, sups]) => ({
        name,
        supervisors: sups,
      }));

      return {
        officeId: officeIdKey || officeName,
        officeName,
        code: String(dept?.code ?? ''),
        isActive: Boolean(dept?.is_active),
        deptHead,
        supervisors,
        employeeCount,
        divisions,
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
