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
      // Not stored on employee_training — shown as documented fallbacks, not invented.
      attendanceStatus: 'No attendance record available',
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
