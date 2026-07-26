/**
 * Competency drill-down trace (Requirement 1) — the "why is Possessed 4.25?"
 * endpoint behind each Required/Possessed card.
 *
 * Given an employee (by employee_number), a competency (by name) and optionally
 * a cycle, it returns the exact chain the AI competency assessor used:
 *   A. the IPCR target(s) mapped to the competency (ipcr_competency_matches),
 *      each with its individual IPCR score (avg of Q/E/T from
 *      success_indicator_ratings) + the AI's confidence/justification;
 *   B. how those targets aggregate into the Possessed score (average across the
 *      mapped targets, rounded 1-5 — the same computation the assessor applied,
 *      surfaced here rather than re-derived differently); and
 *   C. the Required score's source (the PM Competency Map row for the employee's
 *      position + competency).
 *
 * Possessed is reported two ways so the drill-down always reconciles with the
 * card: `possessedStored` is the value the card shows (employee_competencies),
 * `possessedComputed` is the average of the mapped targets it was rounded from.
 * When no target is mapped, aggregationMethod is 'none' and both are null — the
 * UI states the data gap explicitly instead of implying a backed number.
 */

import { supabase as supabaseClient } from '../supabase';
import {
  listCompetencyStandards,
  PROFICIENCY_NUMERIC,
  PROFICIENCY_CODE,
  type ProficiencyLevel,
} from './pmCompetency';

const supabase = supabaseClient as any;
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

export interface MappedTarget {
  targetText: string;
  /** Leading "Function name — …" prefix when present, else null. */
  functionType: string | null;
  /** Individual IPCR score for this target = mean(quality, efficiency, timeliness). */
  individualScore: number | null;
  quality: number | null;
  efficiency: number | null;
  timeliness: number | null;
  confidence: number | null;
  justification: string | null;
}

export interface CompetencyTargetTrace {
  competency: string;
  position: string | null;
  mappedTargets: MappedTarget[];
  aggregationMethod: 'average' | 'single' | 'none';
  /** Average of the mapped targets' individual scores (pre-rounding). */
  possessedComputed: number | null;
  /** The stored possessed the card displays (employee_competencies), 1-5. */
  possessedStored: number | null;
  /** Required numeric (3/4/5) from the Competency Map, or null if unmapped. */
  required: number | null;
  requiredLevel: ProficiencyLevel | null;
  requiredLevelCode: string | null;
}

export interface TraceQuery {
  /** employees.employee_number (the id carried on IPCRRatingRecord). */
  employeeNumber: string;
  competencyName: string;
  /** Scopes the trace to one semester when provided (rating_period stores the cycle id as text). */
  cycleId?: number | null;
}

const mean = (nums: number[]): number | null =>
  nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

/** Split "Function — detail" into its leading function label, if present. */
function splitFunction(targetText: string): { functionType: string | null; text: string } {
  const idx = targetText.indexOf('—');
  if (idx > 0) {
    return { functionType: targetText.slice(0, idx).trim(), text: targetText.slice(idx + 1).trim() };
  }
  return { functionType: null, text: targetText };
}

export async function getCompetencyTargetTrace(q: TraceQuery): Promise<CompetencyTargetTrace> {
  const empty: CompetencyTargetTrace = {
    competency: q.competencyName,
    position: null,
    mappedTargets: [],
    aggregationMethod: 'none',
    possessedComputed: null,
    possessedStored: null,
    required: null,
    requiredLevel: null,
    requiredLevelCode: null,
  };

  // Resolve the employee: number → uuid + position.
  const { data: emp } = await supabase
    .from('employees_with_department')
    .select('id, current_position')
    .eq('employee_id', q.employeeNumber)
    .maybeSingle();
  if (!emp?.id) return empty;
  const employeeUuid = String(emp.id);
  const position = emp.current_position ?? null;

  // A. Mapped IPCR targets for this employee + competency (+ optional cycle).
  let matchQuery = supabase
    .from('ipcr_competency_matches')
    .select('target_text, competency, confidence, justification, success_indicator_id, rating_period')
    .eq('employee_id', employeeUuid)
    .eq('competency', q.competencyName);
  if (q.cycleId != null) matchQuery = matchQuery.eq('rating_period', String(q.cycleId));
  const { data: matches } = await matchQuery;

  const rows = (matches ?? []) as any[];

  // Individual score per target = mean(Q,E,T) from success_indicator_ratings.
  const siIds = [...new Set(rows.map((r) => r.success_indicator_id).filter(Boolean))];
  const sirById = new Map<string, { quality: number | null; efficiency: number | null; timeliness: number | null }>();
  if (siIds.length) {
    const { data: sir } = await supabase
      .from('success_indicator_ratings')
      .select('success_indicator_id, quality, efficiency, timeliness')
      .in('success_indicator_id', siIds);
    for (const r of (sir ?? []) as any[]) {
      sirById.set(String(r.success_indicator_id), {
        quality: r.quality != null ? Number(r.quality) : null,
        efficiency: r.efficiency != null ? Number(r.efficiency) : null,
        timeliness: r.timeliness != null ? Number(r.timeliness) : null,
      });
    }
  }

  const mappedTargets: MappedTarget[] = rows.map((r) => {
    const sir = r.success_indicator_id ? sirById.get(String(r.success_indicator_id)) : undefined;
    const qet = sir ? [sir.quality, sir.efficiency, sir.timeliness].filter((x): x is number => x != null) : [];
    const { functionType } = splitFunction(String(r.target_text ?? ''));
    return {
      targetText: String(r.target_text ?? '').trim(),
      functionType,
      individualScore: qet.length ? mean(qet) : null,
      quality: sir?.quality ?? null,
      efficiency: sir?.efficiency ?? null,
      timeliness: sir?.timeliness ?? null,
      confidence: r.confidence != null ? Number(r.confidence) : null,
      justification: r.justification ?? null,
    };
  });

  const scored = mappedTargets.map((t) => t.individualScore).filter((x): x is number => x != null);
  const possessedComputed = mean(scored);
  const aggregationMethod: CompetencyTargetTrace['aggregationMethod'] =
    mappedTargets.length === 0 ? 'none' : scored.length <= 1 ? 'single' : 'average';

  // B. Stored possessed the card shows (employee_competencies, by competency name).
  let possessedStored: number | null = null;
  {
    let ecQuery = supabase
      .from('employee_competencies')
      .select('proficiency_level, competencies ( name )')
      .eq('employee_id', employeeUuid);
    if (q.cycleId != null) ecQuery = ecQuery.eq('cycle_id', q.cycleId);
    const { data: ec } = await ecQuery;
    const hit = ((ec ?? []) as any[]).find((r) => norm(r.competencies?.name) === norm(q.competencyName));
    if (hit && hit.proficiency_level != null) possessedStored = Number(hit.proficiency_level);
  }

  // C. Required source — the Competency Map row for this position + competency.
  let required: number | null = null;
  let requiredLevel: ProficiencyLevel | null = null;
  if (position) {
    const stdRes = await listCompetencyStandards();
    const compId = (stdRes.ok ? stdRes.data ?? [] : []).find(
      (s) => norm(s.competency_name) === norm(q.competencyName),
    )?.id;
    if (compId != null) {
      const { data: reqRow } = await supabase
        .from('position_competency_requirements')
        .select('proficiency_level')
        .eq('position_title', position)
        .eq('competency_id', compId)
        .maybeSingle();
      if (reqRow?.proficiency_level) {
        requiredLevel = reqRow.proficiency_level as ProficiencyLevel;
        required = PROFICIENCY_NUMERIC[requiredLevel] ?? null;
      }
    }
  }

  return {
    competency: q.competencyName,
    position,
    mappedTargets,
    aggregationMethod,
    possessedComputed,
    possessedStored,
    required,
    requiredLevel,
    requiredLevelCode: requiredLevel ? PROFICIENCY_CODE[requiredLevel] : null,
  };
}
