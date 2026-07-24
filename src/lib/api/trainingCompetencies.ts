/**
 * Structured competency tagging for training sessions.
 *
 * Backs the chip/tag input in the Training Calendar Edit form and feeds the
 * AI Matcher with structured, deduplicated competency data. Replaces the old
 * "Competency: <name>" lines-in-objectives pattern (kept as read-only fallback
 * in trainingCalendar.ts until admins re-tag existing trainings).
 *
 * Tables:
 *   training_competency_tags  — master taxonomy
 *   training_competencies     — session ↔ tag join
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

// ── Types ────────────────────────────────────────────────────────────────────

export type CompetencyTag = {
  id: string;
  name: string;
  /** Lower-cased, whitespace/slash-collapsed key used for deduplication. */
  nameKey: string;
  category: string | null;
};

// ── Normalisation (mirrors the DB's name_key generation) ─────────────────────

/**
 * Produces the same key the DB stores in `name_key`. Used to detect near-
 * duplicate competencies before they hit the DB (e.g. "Fiscal Management /
 * Budgeting for LGU" vs "Fiscal Management/Budgeting For LGU").
 */
export function normalizeTagKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * Full master list of competency tags — used to populate the autocomplete
 * dropdown in the form. Sorted alphabetically by name.
 */
export async function listCompetencyTags(): Promise<CompetencyTag[]> {
  const { data, error } = await supabase
    .from('training_competency_tags')
    .select('id, name, name_key, category')
    .order('name', { ascending: true });
  if (error) {
    console.error('[trainingCompetencies] listCompetencyTags error:', error);
    return [];
  }
  return ((data ?? []) as any[]).map(rowToTag);
}

/**
 * All competency tags currently attached to one training session.
 * Returns an empty array when the session has no tags (e.g. old trainings
 * that were seeded before this feature existed).
 */
export async function getSessionCompetencies(sessionId: string): Promise<CompetencyTag[]> {
  const { data, error } = await supabase
    .from('training_competencies')
    .select('training_competency_tags(id, name, name_key, category)')
    .eq('session_id', sessionId);
  if (error) {
    console.error('[trainingCompetencies] getSessionCompetencies error:', error);
    return [];
  }
  return ((data ?? []) as any[])
    .map((r: any) => r.training_competency_tags)
    .filter(Boolean)
    .map(rowToTag)
    .sort((a: CompetencyTag, b: CompetencyTag) => a.name.localeCompare(b.name));
}

// ── Writes ────────────────────────────────────────────────────────────────────

/**
 * Create a new competency tag in the master taxonomy, or return the existing
 * one if the normalised name already exists. Safe to call concurrently — the
 * UNIQUE constraint on `name_key` guarantees at-most-one row per normalised
 * name; any race condition resolves to the existing row.
 *
 * Returns null on DB error.
 */
export async function upsertCompetencyTag(name: string): Promise<CompetencyTag | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const nameKey = normalizeTagKey(trimmed);

  // Check for an existing tag first (avoids an unnecessary upsert log entry).
  const { data: existing } = await supabase
    .from('training_competency_tags')
    .select('id, name, name_key, category')
    .eq('name_key', nameKey)
    .maybeSingle();
  if (existing) return rowToTag(existing);

  const { data, error } = await supabase
    .from('training_competency_tags')
    .insert({ name: trimmed, name_key: nameKey })
    .select('id, name, name_key, category')
    .single();
  if (error) {
    // Could be a race-condition duplicate — re-read the winner.
    if (error.code === '23505') {
      const { data: winner } = await supabase
        .from('training_competency_tags')
        .select('id, name, name_key, category')
        .eq('name_key', nameKey)
        .maybeSingle();
      return winner ? rowToTag(winner) : null;
    }
    console.error('[trainingCompetencies] upsertCompetencyTag error:', error);
    return null;
  }
  return rowToTag(data);
}

/**
 * Atomically replace the full competency set for a session.
 *
 * - Deletes any existing tags not in `tagIds`.
 * - Inserts any new `tagIds` not already present.
 * - A no-op if the set is unchanged.
 *
 * This avoids orphan rows: if an admin adds a tag then immediately removes it
 * before saving, the pending chip never touched the DB.
 */
export async function setSessionCompetencies(
  sessionId: string,
  tagIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  // 1. Fetch current join rows.
  const { data: existing, error: fetchErr } = await supabase
    .from('training_competencies')
    .select('id, competency_id')
    .eq('session_id', sessionId);
  if (fetchErr) return { ok: false, error: fetchErr.message };

  const existingRows = (existing ?? []) as { id: string; competency_id: string }[];
  const existingIds = new Set(existingRows.map((r) => r.competency_id));
  const wantedIds = new Set(tagIds.filter(Boolean));

  // 2. Delete rows that are no longer wanted.
  const toDelete = existingRows.filter((r) => !wantedIds.has(r.competency_id)).map((r) => r.id);
  if (toDelete.length) {
    const { error: delErr } = await supabase
      .from('training_competencies')
      .delete()
      .in('id', toDelete);
    if (delErr) return { ok: false, error: delErr.message };
  }

  // 3. Insert newly added tags.
  const toInsert = [...wantedIds]
    .filter((id) => !existingIds.has(id))
    .map((competency_id) => ({ session_id: sessionId, competency_id }));
  if (toInsert.length) {
    const { error: insErr } = await supabase
      .from('training_competencies')
      .insert(toInsert);
    if (insErr) return { ok: false, error: insErr.message };
  }

  return { ok: true };
}

/**
 * Competency names (canonical strings) attached to a session, ready for the
 * AI Matcher to consume. Returns the names array directly (not tag objects).
 * Falls back to an empty array on error.
 */
export async function getSessionCompetencyNames(sessionId: string): Promise<string[]> {
  const tags = await getSessionCompetencies(sessionId);
  return tags.map((t) => t.name);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function rowToTag(r: any): CompetencyTag {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    nameKey: String(r.name_key ?? ''),
    category: r.category ?? null,
  };
}
