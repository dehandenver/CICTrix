/**
 * Module 3 · Competency Framework
 *
 * competency_standards             — the 12 fixed LGU standards (read-only seed)
 * position_competency_requirements — per position, which standards are required
 *                                    and at what proficiency
 *
 * "Not Required" is the absence of a row, so Subtab 1's Save is an upsert on
 * (position_title, competency_id) and Remove is a delete. Both write straight
 * through — there is no approval queue.
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export const PROFICIENCY_LEVELS = ['Basic', 'Intermediate', 'Advanced'] as const;
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];

/** Single-letter code used by the Competency Map grid. */
export const PROFICIENCY_CODE: Record<ProficiencyLevel, string> = {
  Basic: 'B',
  Intermediate: 'I',
  Advanced: 'A',
};

export interface CompetencyStandard {
  id: number;
  competency_name: string;
  training_stream: string;
}

export interface PositionRequirement {
  id: string;
  position_title: string;
  competency_id: number;
  proficiency_level: ProficiencyLevel;
  updated_by: string | null;
  updated_at: string;
}

/**
 * Not a discriminated union: this project compiles with `strict: false`, so
 * TypeScript won't narrow `{ok:true}|{ok:false}` and every call site would need
 * a cast to reach `.error` (as RSPDashboard has to do). A single optional-field
 * shape keeps call sites clean here.
 */
export type Result<T> = { ok: boolean; data?: T; error?: string };

const fail = (context: string, error: any): { ok: false; error: string } => {
  console.error(`[pmCompetency] ${context}:`, error);
  return { ok: false, error: error?.message ?? String(error ?? 'Unknown error') };
};

/** The 12 standards, ordered 1..12 — the Competency Map's column order. */
export async function listCompetencyStandards(): Promise<Result<CompetencyStandard[]>> {
  try {
    const { data, error } = await supabase
      .from('competency_standards')
      .select('*')
      .order('id', { ascending: true });
    if (error) return fail('listCompetencyStandards', error);
    return { ok: true, data: (data ?? []) as CompetencyStandard[] };
  } catch (err) {
    return fail('listCompetencyStandards', err);
  }
}

/** Every requirement across all positions — powers the Competency Map. */
export async function listAllRequirements(): Promise<Result<PositionRequirement[]>> {
  try {
    const { data, error } = await supabase
      .from('position_competency_requirements')
      .select('*')
      .order('position_title', { ascending: true });
    if (error) return fail('listAllRequirements', error);
    return { ok: true, data: (data ?? []) as PositionRequirement[] };
  } catch (err) {
    return fail('listAllRequirements', err);
  }
}

/** Requirements for one position — powers Subtab 1's table. */
export async function listRequirementsForPosition(
  positionTitle: string,
): Promise<Result<PositionRequirement[]>> {
  const title = String(positionTitle ?? '').trim();
  if (!title) return { ok: true, data: [] };
  try {
    const { data, error } = await supabase
      .from('position_competency_requirements')
      .select('*')
      .eq('position_title', title);
    if (error) return fail('listRequirementsForPosition', error);
    return { ok: true, data: (data ?? []) as PositionRequirement[] };
  } catch (err) {
    return fail('listRequirementsForPosition', err);
  }
}

/**
 * Mark a competency required for a position at a level. Upserts on
 * (position_title, competency_id) so re-saving a row edits it instead of
 * stacking duplicates.
 */
export async function saveRequirement(input: {
  positionTitle: string;
  competencyId: number;
  proficiencyLevel: ProficiencyLevel;
  updatedBy: string;
}): Promise<Result<PositionRequirement>> {
  try {
    const { data, error } = await supabase
      .from('position_competency_requirements')
      .upsert(
        [
          {
            position_title: input.positionTitle.trim(),
            competency_id: input.competencyId,
            proficiency_level: input.proficiencyLevel,
            updated_by: input.updatedBy,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'position_title,competency_id' },
      )
      .select()
      .single();
    if (error) return fail('saveRequirement', error);
    return { ok: true, data: data as PositionRequirement };
  } catch (err) {
    return fail('saveRequirement', err);
  }
}

/** Mark a competency Not Required — the row simply goes away. */
export async function removeRequirement(input: {
  positionTitle: string;
  competencyId: number;
}): Promise<Result<true>> {
  try {
    const { error } = await supabase
      .from('position_competency_requirements')
      .delete()
      .eq('position_title', input.positionTitle.trim())
      .eq('competency_id', input.competencyId);
    if (error) return fail('removeRequirement', error);
    return { ok: true, data: true };
  } catch (err) {
    return fail('removeRequirement', err);
  }
}

/**
 * Which department(s) each position sits in, from the real employee records.
 *
 * Deliberately a list, not a single value: requirements are keyed by position
 * alone, but a position can be held in more than one office (e.g. Admin Officer
 * III exists under both Customer Support and Legal). Collapsing that to one
 * department would quietly misattribute the requirement.
 */
export async function listPositionDepartments(): Promise<Result<Record<string, string[]>>> {
  try {
    const { data, error } = await supabase
      .from('employees_with_department')
      .select('current_position, department');
    if (error) return fail('listPositionDepartments', error);

    const byPosition: Record<string, string[]> = {};
    (data ?? []).forEach((row: any) => {
      const position = String(row?.current_position ?? '').trim();
      const department = String(row?.department ?? '').trim();
      if (!position || !department) return;
      if (!byPosition[position]) byPosition[position] = [];
      if (!byPosition[position].includes(department)) byPosition[position].push(department);
    });
    Object.values(byPosition).forEach((list) => list.sort((a, b) => a.localeCompare(b)));

    return { ok: true, data: byPosition };
  } catch (err) {
    return fail('listPositionDepartments', err);
  }
}

/**
 * Positions to choose from: every distinct current_position on an employee,
 * unioned with any position that already has requirements saved (so a position
 * stays selectable even if nobody currently holds it).
 */
export async function listPositions(): Promise<Result<string[]>> {
  try {
    const [empRes, reqRes] = await Promise.all([
      supabase.from('employees_with_department').select('current_position'),
      supabase.from('position_competency_requirements').select('position_title'),
    ]);

    const fromEmployees: string[] = (empRes.error ? [] : empRes.data ?? [])
      .map((r: any) => String(r?.current_position ?? '').trim())
      .filter(Boolean);
    const fromRequirements: string[] = (reqRes.error ? [] : reqRes.data ?? [])
      .map((r: any) => String(r?.position_title ?? '').trim())
      .filter(Boolean);

    const unique = Array.from(new Set([...fromEmployees, ...fromRequirements])).sort((a, b) =>
      a.localeCompare(b),
    );
    return { ok: true, data: unique };
  } catch (err) {
    return fail('listPositions', err);
  }
}
