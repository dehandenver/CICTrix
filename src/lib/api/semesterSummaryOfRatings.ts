/**
 * "Semester Summary of Ratings" — the second, period-scoped section of the PM
 * Summary of Ratings page (Requirement 2).
 *
 * It mirrors the existing section's Required-vs-Possessed competency breakdown,
 * with two differences that make it the NEW (collecting) semester's view:
 *   • Required is the SAME source as the existing section — the PM Competency
 *     Map (position_competency_requirements + competency_standards, B/I/A →
 *     3/4/5) — so the two sections list the same competencies at the same bar.
 *   • Possessed is scoped to the new cycle via employee_competencies.cycle_id
 *     (the AI competency assessor's per-semester output), not the period-agnostic
 *     v_competency_gap_analysis view the existing section reads.
 *
 * The employee set is driven off employee_competencies for the new cycle, so the
 * section self-backfills: any new-semester IPCR already assessed shows up the
 * moment the section becomes visible, with no manual step.
 *
 * The Required map and the possessed map bridge on competency NAME because the
 * Competency Map keys competencies by integer id (competency_standards) while
 * employee_competencies keys them by uuid (competencies) — two id spaces over
 * the same 12 LGU competency names.
 */

import type { IPCRRatingRecord } from '../../modules/admin/pm/SummaryOfRatings';
import { supabase as supabaseClient } from '../supabase';
import { getTransitionState } from './semesterTransition';
import { getActiveOfficeNameSet } from './departments';
import { listCompetencyStandards, PROFICIENCY_NUMERIC, type ProficiencyLevel } from './pmCompetency';

const supabase = supabaseClient as any;

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

export interface SemesterSectionState {
  /** Render the section only when true. */
  visible: boolean;
  newCycleId: number | null;
  newCyclePeriod: string | null;
}

/**
 * Whether the new "Semester Summary of Ratings" section should show, and for
 * which cycle.
 *
 * Submission-driven, NOT phase-flag-driven: the section appears the moment any
 * office has ≥1 finalized IPCR (approved + phase2 completed) for the new cycle.
 * The rating-phase Open/Closed flag is deliberately NOT a gate — offices finalize
 * on staggered calendars and the flag can read Closed while finalized records
 * already exist (the exact case where City Engineer's submissions weren't
 * showing). The `new_cycle_id` pointer already scopes this to the collecting
 * semester; once a PM confirms the transition it goes null and the section hides.
 */
export async function getSemesterSectionState(): Promise<SemesterSectionState> {
  const state = await getTransitionState();
  const newCycleId = state.newCycleId;
  if (newCycleId == null) {
    return { visible: false, newCycleId, newCyclePeriod: null };
  }

  const [{ count }, { data: cycle }] = await Promise.all([
    supabase
      .from('target_settings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .eq('phase2_status', 'completed')
      .eq('cycle_id', newCycleId),
    supabase.from('performance_cycles').select('title').eq('id', newCycleId).maybeSingle(),
  ]);

  return {
    visible: (count ?? 0) > 0,
    newCycleId,
    newCyclePeriod: cycle?.title ?? null,
  };
}

// position (lowercased) → competency name (lowercased) → { display name, required }
type RequiredMap = Map<string, Map<string, { name: string; required: number }>>;

/**
 * The Competency Map as position → its required competencies, keyed by name.
 * Same tables/mapping as the existing section's Required (single source of
 * truth), just reshaped for a name bridge to the possessed data.
 */
async function buildRequiredMap(): Promise<RequiredMap> {
  const [reqRes, stdRes] = await Promise.all([
    supabase
      .from('position_competency_requirements')
      .select('position_title, competency_id, proficiency_level'),
    listCompetencyStandards(),
  ]);

  const nameById = new Map<number, string>();
  if (stdRes.ok && stdRes.data) {
    for (const s of stdRes.data) nameById.set(Number(s.id), s.competency_name);
  }

  const map: RequiredMap = new Map();
  for (const r of (reqRes.data ?? []) as any[]) {
    const position = norm(r.position_title);
    const compName = nameById.get(Number(r.competency_id));
    if (!position || !compName) continue;
    const required = PROFICIENCY_NUMERIC[r.proficiency_level as ProficiencyLevel];
    if (!required) continue;
    if (!map.has(position)) map.set(position, new Map());
    map.get(position)!.set(norm(compName), { name: compName, required });
  }
  return map;
}

/**
 * Per-employee Required-vs-Possessed for the new (collecting) semester, in the
 * same IPCRRatingRecord shape the Summary of Ratings tables consume.
 *
 * The employee set is driven off FINALIZED IPCRs for the new cycle (approved +
 * phase2 completed) across all active offices — so the section backfills every
 * office that has submitted (Requirement 2C), not just the handful the AI
 * competency assessor has already scored. Possessed is then LEFT-joined from
 * employee_competencies for the new cycle: where the assessor has run, the real
 * score shows; where it hasn't yet, the competency is flagged "not yet assessed"
 * (possessedAvailable=false) rather than shown as a bogus 0.
 */
export async function getSemesterRatingRecords(newCycleId: number): Promise<IPCRRatingRecord[]> {
  const [requiredMap, { data: finalizedRows }, { data: possessedRows }, { data: emps }, activeOffices] =
    await Promise.all([
      buildRequiredMap(),
      supabase
        .from('target_settings')
        .select('employee_id')
        .eq('status', 'approved')
        .eq('phase2_status', 'completed')
        .eq('cycle_id', newCycleId),
      supabase
        .from('employee_competencies')
        .select('employee_id, proficiency_level, competencies ( name )')
        .eq('cycle_id', newCycleId),
      supabase
        .from('employees_with_department')
        .select('id, employee_id, full_name, current_position, department, status')
        .eq('status', 'Active'),
      getActiveOfficeNameSet(),
    ]);

  const inActive = (dept: unknown) =>
    activeOffices.size === 0 || activeOffices.has(norm(dept));

  // Employees whose new-cycle IPCR is finalized — the authoritative population.
  const finalizedIds = new Set(((finalizedRows ?? []) as any[]).map((r) => String(r.employee_id)));

  // employeeId → competencyName(lower) → possessed level (may be absent).
  const possessedByEmp = new Map<string, Map<string, number>>();
  for (const r of (possessedRows ?? []) as any[]) {
    const empId = String(r.employee_id);
    const name = norm(r.competencies?.name);
    const level = Number(r.proficiency_level);
    if (!empId || !name || !Number.isFinite(level)) continue;
    if (!possessedByEmp.has(empId)) possessedByEmp.set(empId, new Map());
    possessedByEmp.get(empId)!.set(name, level);
  }

  const records: IPCRRatingRecord[] = [];
  for (const emp of (emps ?? []) as any[]) {
    const empId = String(emp.id);
    if (!finalizedIds.has(empId)) continue; // no finalized new-cycle IPCR → not in this section
    if (!inActive(emp.department)) continue; // outside the active offices

    const positionKey = norm(emp.current_position);
    const positionReqs = requiredMap.get(positionKey);
    if (!positionReqs || positionReqs.size === 0) continue; // no Map competencies for this position

    const possessed = possessedByEmp.get(empId) ?? new Map<string, number>();

    // Every competency the Map assigns to the position — Required vs the new
    // semester's Possessed. `possessedAvailable` distinguishes "assessed at 0"
    // (never happens; ratings are 1-5) from "not yet assessed".
    const competencies = [...positionReqs.values()].map((req) => {
      const level = possessed.get(norm(req.name));
      const available = level != null;
      return {
        name: req.name,
        possessed: available ? level : 0,
        required: req.required,
        isGap: available && level < req.required,
        possessedAvailable: available,
      };
    });

    // Headline averages only the competencies actually assessed this semester;
    // null when the AI assessment hasn't run for this employee yet.
    const rated = competencies.filter((c) => c.possessedAvailable);
    const avg = rated.length ? rated.reduce((s, c) => s + c.possessed, 0) / rated.length : null;
    const needsTraining = competencies.some((c) => c.isGap);

    const parts = String(emp.full_name ?? '').trim();
    records.push({
      // employee_number so CompetencyGapPanel's learning-interventions + trace
      // lookups (keyed on employees.employee_number) resolve; falls back to uuid.
      id: String(emp.employee_id ?? empId),
      department: emp.department ?? '—',
      name: parts || 'Unknown employee',
      position: emp.current_position ?? '—',
      period: '',
      numericalRating: avg,
      remarks: needsTraining ? 'Training Recommended' : '',
      submissionStatus: 'SUBMITTED',
      competencies,
      cycleId: newCycleId,
    });
  }

  return records.sort((a, b) => a.name.localeCompare(b.name));
}
