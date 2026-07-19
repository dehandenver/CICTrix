/**
 * IPCR Archive — read-only historical IPCR records.
 *
 * Surfaces the closed, rated semesters stored in `ipcr_performance` (the same
 * table the competency gap analysis reads). Presented as: one archive entry per
 * (employee, rating period), each holding its full MFO/PAP rows — function,
 * target, actual accomplishment and the Q/E/T + average ratings.
 *
 * Archival by definition: nothing here writes. A semester, once rated, is a
 * historical record.
 */

import { supabase as supabaseClient } from '../supabase';
import { canonicalPeriodList } from '../ipcrPeriods';

const supabase = supabaseClient as any;

export type IpcrFunction = 'CORE' | 'STRATEGIC' | 'SUPPORT';

export type ArchiveRow = {
  id: number;
  rowId: string | null;
  functionType: IpcrFunction | string;
  target: string;
  accomplishment: string;
  quality: number | null;
  efficiency: number | null;
  timeliness: number | null;
  average: number | null;
  competency: string | null;
};

export type ArchiveSemester = {
  period: string;
  ipcrId: string | null;
  position: string | null;
  rows: ArchiveRow[];
  /** Mean of the row averages for the semester. */
  overall: number | null;
};

export type ArchiveEmployee = {
  employeeNum: string;
  name: string;
  department: string | null;
  position: string | null;
  semesterCount: number;
  latestPeriod: string | null;
  /** Mean across every rated row on record. */
  overall: number | null;
};

/** Strip the wrapping quotes the IPCR rows are stored with. */
const clean = (v: unknown) => String(v ?? '').replace(/^"+|"+$/g, '').trim();

/**
 * Chronological sort key for a rating period. Handles the standard
 * "Jan 1-Jun 30 2024" / "Jul 1-Dec 31 2025" shape plus looser variants
 * ("2nd Half 2026"); anything unparseable sorts last.
 */
export function periodSortKey(period: string): number {
  const p = String(period ?? '');
  const year = Number(p.match(/(\d{4})/)?.[1] ?? 0);
  const second = /jul|aug|sep|oct|nov|dec|2nd/i.test(p);
  return year * 10 + (second ? 2 : 1);
}

/**
 * Average of actual ratings only. Ratings run 1-5, so a 0 means "target recorded
 * but never rated" — counting those as a literal zero would sink an otherwise
 * good semester. Same rule the gap-view aggregator applies.
 */
const mean = (nums: number[]): number | null => {
  const scored = (nums ?? []).filter((n) => Number(n) > 0);
  return scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100 : null;
};

/** Every archived semester for one employee, most recent first. */
export async function getEmployeeArchive(employeeNum: string): Promise<ArchiveSemester[]> {
  if (!employeeNum) return [];
  const { data, error } = await supabase
    .from('ipcr_performance')
    .select('id, ipcr_id, ipcr_row_id, rating_period, position, function_type, target_text, accomplishment_text, q_rating, e_rating, t_rating, ave_rating, mapped_competency_standard')
    .eq('employee_num', employeeNum)
    .in('rating_period', canonicalPeriodList());

  if (error) {
    console.error('Error loading IPCR archive:', error);
    return [];
  }

  const byPeriod = new Map<string, ArchiveSemester>();
  for (const r of (data ?? []) as any[]) {
    const period = String(r.rating_period ?? 'Unspecified period');
    let sem = byPeriod.get(period);
    if (!sem) {
      sem = { period, ipcrId: r.ipcr_id ?? null, position: r.position ?? null, rows: [], overall: null };
      byPeriod.set(period, sem);
    }
    sem.rows.push({
      id: r.id,
      rowId: r.ipcr_row_id ?? null,
      functionType: r.function_type ?? 'CORE',
      target: clean(r.target_text),
      accomplishment: clean(r.accomplishment_text),
      quality: r.q_rating != null ? Number(r.q_rating) : null,
      efficiency: r.e_rating != null ? Number(r.e_rating) : null,
      timeliness: r.t_rating != null ? Number(r.t_rating) : null,
      average: r.ave_rating != null ? Number(r.ave_rating) : null,
      competency: r.mapped_competency_standard ?? null,
    });
  }

  const order: Record<string, number> = { CORE: 0, STRATEGIC: 1, SUPPORT: 2 };
  return [...byPeriod.values()]
    .map((sem) => {
      sem.rows.sort((a, b) => (order[a.functionType] ?? 9) - (order[b.functionType] ?? 9));
      sem.overall = mean(sem.rows.map((r) => r.average).filter((n): n is number => n != null));
      return sem;
    })
    .sort((a, b) => periodSortKey(b.period) - periodSortKey(a.period));
}

/** Everyone who has archived IPCR history, for the PM Admin archive browser. */
export async function listArchiveEmployees(): Promise<ArchiveEmployee[]> {
  const { data, error } = await supabase
    .from('ipcr_performance')
    .select('employee_num, rating_period, position, ave_rating')
    .in('rating_period', canonicalPeriodList());
  if (error) {
    console.error('Error loading archive employees:', error);
    return [];
  }
  const rows = (data ?? []) as any[];
  if (!rows.length) return [];

  const byEmp = new Map<string, { periods: Set<string>; scores: number[]; position: string | null }>();
  for (const r of rows) {
    const num = String(r.employee_num ?? '').trim();
    if (!num) continue;
    let e = byEmp.get(num);
    if (!e) { e = { periods: new Set(), scores: [], position: r.position ?? null }; byEmp.set(num, e); }
    if (r.rating_period) e.periods.add(String(r.rating_period));
    if (r.ave_rating != null) e.scores.push(Number(r.ave_rating));
    if (!e.position && r.position) e.position = r.position;
  }

  // Resolve identity from the anon-readable view.
  const nums = [...byEmp.keys()];
  const identity = new Map<string, { name: string; department: string | null }>();
  for (let i = 0; i < nums.length; i += 200) {
    const slice = nums.slice(i, i + 200);
    const { data: emps } = await supabase
      .from('employees_with_department')
      .select('employee_id, full_name, department')
      .in('employee_id', slice);
    for (const e of (emps ?? []) as any[]) {
      identity.set(String(e.employee_id), {
        name: String(e.full_name ?? '').trim() || String(e.employee_id),
        department: e.department ?? null,
      });
    }
  }

  return [...byEmp.entries()]
    .map(([employeeNum, v]) => {
      const who = identity.get(employeeNum);
      const latest = [...v.periods].sort((a, b) => periodSortKey(b) - periodSortKey(a))[0] ?? null;
      return {
        employeeNum,
        name: who?.name ?? employeeNum,
        department: who?.department ?? null,
        position: v.position,
        semesterCount: v.periods.size,
        latestPeriod: latest,
        overall: mean(v.scores),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
