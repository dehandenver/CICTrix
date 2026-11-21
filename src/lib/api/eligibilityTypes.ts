/**
 * Recognized eligibility types for V2 succession scoring.
 *
 * In Reviewed Scoring (V2), eligibility uses fixed tiers (0 / 7.5 / 15 pts)
 * based on distinct recognized, position-relevant, unexpired credentials.
 * This module manages the `eligibility_types` catalog while keeping legacy
 * numeric columns defaulted so the existing DB schema stays satisfied without
 * a migration.
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export interface EligibilityType {
  id: string;
  name: string;
  points: number;
  /** Raw total that earns the full Eligibility weight. Same on every row. */
  pointsForFullMarks: number;
  isActive: boolean;
  sortOrder: number;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const fromRow = (r: any): EligibilityType => ({
  id: String(r.id),
  name: String(r.name ?? ''),
  points: Number(r.points ?? 0),
  pointsForFullMarks: Number(r.points_for_full_marks ?? 100),
  isActive: r.is_active !== false,
  sortOrder: Number(r.sort_order ?? 0),
});

export async function listEligibilityTypes(): Promise<Result<EligibilityType[]>> {
  try {
    const { data, error } = await supabase
      .from('eligibility_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) return { ok: false, error: error.message ?? 'Failed to load eligibility types.' };
    return { ok: true, data: (data ?? []).map(fromRow) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function upsertEligibilityType(input: {
  id?: string;
  name: string;
  points?: number;
  pointsForFullMarks?: number;
  isActive: boolean;
  sortOrder: number;
}): Promise<Result<EligibilityType>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'A type needs a name.' };
  const points = input.points ?? 0;
  const pointsForFullMarks = input.pointsForFullMarks ?? 100;
  if (!Number.isFinite(points) || points < 0) {
    return { ok: false, error: 'Points must be zero or more.' };
  }
  if (!Number.isFinite(pointsForFullMarks) || pointsForFullMarks <= 0) {
    return { ok: false, error: 'Points for full marks must be greater than zero.' };
  }

  const payload = {
    name,
    points,
    points_for_full_marks: pointsForFullMarks,
    is_active: input.isActive,
    sort_order: input.sortOrder,
  };

  try {
    if (input.id) {
      const { data, error } = await supabase
        .from('eligibility_types')
        .update(payload)
        .eq('id', input.id)
        .select()
        .single();
      if (error) return { ok: false, error: error.message ?? 'Failed to save the type.' };
      return { ok: true, data: fromRow(data) };
    }
    const { data, error } = await supabase.from('eligibility_types').insert([payload]).select().single();
    if (error) return { ok: false, error: error.message ?? 'Failed to add the type.' };
    return { ok: true, data: fromRow(data) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteEligibilityType(id: string): Promise<Result<true>> {
  try {
    const { error } = await supabase.from('eligibility_types').delete().eq('id', id);
    if (error) return { ok: false, error: error.message ?? 'Failed to remove the type.' };
    return { ok: true, data: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
