/**
 * L&D Archive — historical training records.
 *
 * Reads completed historical trainings from `employee_training` (title, provider,
 * dates, certificate) and joins each to its employee for the identity/tenure
 * columns the archive displays. This is a read-only historical view; nothing
 * here writes.
 *
 * Two archive-specific derivations (see 2026-08-30 spec update):
 *   - Type of Competency — which of the 12 canonical competencies the course
 *     develops, read from the employee_training_competencies join (migration
 *     20260828). Replaces the old generic Category (training_type), which the
 *     archive no longer surfaces at all.
 *   - Attendance percentage (hybrid) — computed live from the AM/PM
 *     training_attendance_days slots when a record is linked to a calendar
 *     enrollment, else the seeded attendance_percentage column, else null. This
 *     replaces the "Hours" metric, which the archive no longer shows (the
 *     number_of_hours column stays for succession scoring, it's just not read
 *     here).
 *
 * Completion/remarks are not columns on employee_training; a completed archive
 * record is shown as "Completed" and remarks blank, rather than invented.
 */

import { supabase as supabaseClient } from '../supabase';
import { listAttendance } from './trainingAttendance';

const supabase = supabaseClient as any;

export type ArchiveTraining = {
  id: string;
  title: string;
  /** One of the 12 canonical competencies the course develops, or null when untagged. */
  typeOfCompetency: string | null;
  provider: string | null;
  dateConducted: string;
  /** 0–100 attendance percentage (live from AM/PM when linked, else seeded), or null. */
  attendancePercent: number | null;
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
      'id, employee_id, training_title, conducted_by, sponsor, from_date, to_date, attendance_percentage, enrollment_id, certificate_number',
    )
    .order('from_date', { ascending: false });
  if (error) {
    console.error('Error loading training archive:', error);
    return [];
  }
  const rows = (trainings ?? []) as any[];
  if (!rows.length) return [];

  const trainingIds = rows.map((r) => String(r.id));

  const [{ data: emps }, competencyByTraining, attendanceByTraining] = await Promise.all([
    supabase
      .from('employees')
      .select('id, employee_number, first_name, middle_name, last_name, position, department, date_hired, status')
      .in('id', [...new Set(rows.map((r) => String(r.employee_id)).filter(Boolean))]),
    loadCompetencyTags(trainingIds),
    loadAttendancePercents(rows),
  ]);
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
      typeOfCompetency: competencyByTraining.get(String(r.id)) ?? null,
      provider: r.conducted_by ?? r.sponsor ?? null,
      dateConducted: dateRange(r.from_date, r.to_date),
      attendancePercent: attendanceByTraining.get(String(r.id)) ?? null,
      completionStatus: 'Completed',
      certificateNumber: r.certificate_number ?? null,
      remarks: '',
    });
  }

  return [...byEmployee.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * training_id → the single competency name it develops (spec: 1 course ↔ 1
 * competency). Reads the employee_training_competencies join (migration 20260828)
 * against the shared `competencies` taxonomy. Untagged records are simply absent.
 */
async function loadCompetencyTags(trainingIds: string[]): Promise<Map<string, string>> {
  const byTraining = new Map<string, string>();
  if (!trainingIds.length) return byTraining;
  const { data, error } = await supabase
    .from('employee_training_competencies')
    .select('employee_training_id, competencies ( name )')
    .in('employee_training_id', trainingIds);
  if (error) {
    console.error('Error loading training competency tags:', error);
    return byTraining;
  }
  for (const row of (data ?? []) as any[]) {
    const id = String(row.employee_training_id);
    const name = String(row.competencies?.name ?? '').trim();
    // 1:1 by spec — first tag per record wins if the data ever holds more.
    if (name && !byTraining.has(id)) byTraining.set(id, name);
  }
  return byTraining;
}

/**
 * training_id → attendance percentage, hybrid with precedence live → stored → absent:
 *   - live: when the record links a calendar enrollment that has recorded AM/PM
 *     slots, percent = Present slots / total recorded slots (the same half-day
 *     model the calendar uses).
 *   - stored: otherwise the seeded employee_training.attendance_percentage.
 * A record with neither is left out (renders as "—").
 */
async function loadAttendancePercents(rows: any[]): Promise<Map<string, number>> {
  const byTraining = new Map<string, number>();

  // Stored fallback first, so a linked record with no recorded slots still shows
  // its seeded value rather than nothing.
  for (const r of rows) {
    if (r.attendance_percentage != null) byTraining.set(String(r.id), Math.round(Number(r.attendance_percentage)));
  }

  const linked = rows.filter((r) => r.enrollment_id);
  if (!linked.length) return byTraining;

  const attendance = await listAttendance(linked.map((r) => String(r.enrollment_id)));
  for (const r of linked) {
    const cells = attendance.get(String(r.enrollment_id));
    if (!cells || cells.size === 0) continue; // no recorded slots → keep stored fallback
    let present = 0;
    for (const cell of cells.values()) if (cell.status === 'Present') present += 1;
    byTraining.set(String(r.id), Math.round((present / cells.size) * 100));
  }
  return byTraining;
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
