/**
 * L&D Archive — historical training records.
 *
 * Reads completed historical trainings from `employee_training` (title, type,
 * provider, dates, hours, certificate) and joins each to its employee for the
 * identity/tenure columns the archive displays. This is a read-only historical
 * view; nothing here writes.
 *
 * Fields the table shows come straight from the stored rows. Attendance,
 * completion, and remarks are not columns on employee_training, so they are
 * rendered as their documented fallbacks rather than invented — a completed
 * archive record is shown as "Completed", attendance as "No attendance record
 * available".
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export type ArchiveTraining = {
  id: string;
  title: string;
  category: string | null;
  provider: string | null;
  dateConducted: string;
  hours: number | null;
  attendanceStatus: string;
  completionStatus: string;
  certificateNumber: string | null;
  remarks: string;
};

export type ArchiveEmployee = {
  employeeId: string;
  employeeNumber: string | null;
  name: string;
  position: string | null;
  department: string | null;
  dateHired: string | null;
  trainings: ArchiveTraining[];
};

const fmt = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

const dateRange = (from: string | null, to: string | null): string => {
  if (!from) return '—';
  if (!to || to === from) return fmt(from);
  return `${fmt(from)} – ${fmt(to)}`;
};

/**
 * Historical training records grouped by employee, newest training first within
 * each employee. Optionally scoped to a single office (department name).
 * Employees with no archived trainings are omitted.
 */
export async function listTrainingArchive(office?: string | null): Promise<ArchiveEmployee[]> {
  const { data: trainings, error } = await supabase
    .from('employee_training')
    .select(
      'id, employee_id, training_title, training_type, conducted_by, sponsor, from_date, to_date, number_of_hours, certificate_number',
    )
    .order('from_date', { ascending: false });
  if (error) {
    console.error('Error loading training archive:', error);
    return [];
  }
  const rows = (trainings ?? []) as any[];
  if (!rows.length) return [];

  const empIds = [...new Set(rows.map((r) => String(r.employee_id)).filter(Boolean))];
  const { data: emps } = await supabase
    .from('employees')
    .select('id, employee_number, first_name, middle_name, last_name, position, department, date_hired, status')
    .in('id', empIds);
  const empById = new Map<string, any>((emps ?? []).map((e: any) => [String(e.id), e]));

  const byEmployee = new Map<string, ArchiveEmployee>();
  for (const r of rows) {
    const e = empById.get(String(r.employee_id));
    if (!e) continue; // orphaned training row — skip rather than show "unknown"
    if (office && String(e.department ?? '') !== office) continue;
    const key = String(r.employee_id);
    if (!byEmployee.has(key)) {
      byEmployee.set(key, {
        employeeId: key,
        employeeNumber: e.employee_number ?? null,
        name: [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ').trim() || 'Unknown employee',
        position: e.position ?? null,
        department: e.department ?? null,
        dateHired: e.date_hired ?? null,
        trainings: [],
      });
    }
    byEmployee.get(key)!.trainings.push({
      id: String(r.id),
      title: r.training_title,
      category: r.training_type ?? null,
      provider: r.conducted_by ?? r.sponsor ?? null,
      dateConducted: dateRange(r.from_date, r.to_date),
      hours: r.number_of_hours ?? null,
      // employee_training stores no per-day attendance; an archived record is a
      // completed, certificated training, so it reads as full attendance /
      // Completed rather than an invented partial figure.
      attendanceStatus: '100%',
      completionStatus: 'Completed',
      certificateNumber: r.certificate_number ?? null,
      remarks: '',
    });
  }

  return [...byEmployee.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Distinct offices that have at least one archived training, for the filter dropdown. */
export async function listArchiveOffices(): Promise<string[]> {
  const all = await listTrainingArchive();
  return [...new Set(all.map((e) => e.department).filter((d): d is string => !!d))].sort();
}

export type ArchiveOffice = {
  office: string;
  /** Employees in this office with ≥1 training record. */
  employeesWithRecords: number;
  /** Total training entries logged for the office. */
  recordCount: number;
  /** Most recent training start date across the office, ISO or null. */
  latestDate: string | null;
};

/**
 * Office-level roll-up for the archive's Level-1 directory. Every ACTIVE office
 * appears — offices with no records show zeros (the archive represents the whole
 * org, not just offices with data) — plus any office that owns records even if
 * it is no longer active, so history never disappears.
 */
export async function listArchiveOfficeDirectory(): Promise<ArchiveOffice[]> {
  const [{ data: depts }, { data: trainings }] = await Promise.all([
    supabase.from('departments').select('name, is_active'),
    supabase.from('employee_training').select('employee_id, from_date'),
  ]);
  const activeOffices = (depts ?? []).filter((d: any) => d.is_active).map((d: any) => String(d.name));

  const rows = (trainings ?? []) as any[];
  const empIds = [...new Set(rows.map((t) => String(t.employee_id)).filter(Boolean))];
  const { data: emps } = empIds.length
    ? await supabase.from('employees').select('id, department').in('id', empIds)
    : { data: [] as any[] };
  const deptByEmp = new Map<string, string>((emps ?? []).map((e: any) => [String(e.id), String(e.department ?? '')]));

  const agg = new Map<string, { emps: Set<string>; count: number; latest: string | null }>();
  for (const t of rows) {
    const office = deptByEmp.get(String(t.employee_id));
    if (!office) continue;
    if (!agg.has(office)) agg.set(office, { emps: new Set(), count: 0, latest: null });
    const a = agg.get(office)!;
    a.emps.add(String(t.employee_id));
    a.count += 1;
    if (t.from_date && (!a.latest || t.from_date > a.latest)) a.latest = t.from_date;
  }

  const allOffices = new Set<string>([...activeOffices, ...agg.keys()]);
  return [...allOffices]
    .map((office): ArchiveOffice => {
      const a = agg.get(office);
      return {
        office,
        employeesWithRecords: a ? a.emps.size : 0,
        recordCount: a ? a.count : 0,
        latestDate: a ? a.latest : null,
      };
    })
    .sort((a, b) => a.office.localeCompare(b.office));
}
