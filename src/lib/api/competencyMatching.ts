/**
 * Competency matching API — thin client for the server-side Claude call that
 * maps IPCR targets to the LGU's 12 canonical competencies.
 *
 * The analysis runs in the FastAPI backend (backend/app/routes/competency_matching.py)
 * so the Anthropic API key stays server-side. Matches are persisted to
 * ipcr_competency_matches when `persist` is true.
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface MatchedCompetency {
  competency: string;
  confidence: number;
  justification: string;
}

export interface TargetResult {
  target_text: string;
  matched_competencies: MatchedCompetency[];
  flag_for_review: boolean;
}

export interface CompetencyMatchResponse {
  employee_position: string;
  rating_period: string | null;
  results: TargetResult[];
  unmatched_targets: string[];
  prompt_version: string;
  model: string;
  persisted: number;
}

export interface CompetencyMatchRequest {
  job_position: string;
  targets: string[];
  rating_period?: string | null;
  employee_id?: string | null;
  /** When true (default), matches are written to ipcr_competency_matches. */
  persist?: boolean;
  created_by?: string | null;
}

// Flat result shape (discriminated unions don't narrow under this project's
// strict:false config).
export interface CompetencyMatchResult {
  ok: boolean;
  data?: CompetencyMatchResponse;
  error?: string;
}

/** Analyze IPCR targets against the competency taxonomy for one employee. */
export async function analyzeCompetencies(
  req: CompetencyMatchRequest
): Promise<CompetencyMatchResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/competency-matching/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persist: true, ...req }),
    });

    if (!res.ok) {
      // FastAPI errors come back as { detail: "..." }.
      let detail = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        if (body?.detail) detail = String(body.detail);
      } catch {
        /* non-JSON error body — keep the status-based message */
      }
      return { ok: false, error: detail };
    }

    const data = (await res.json()) as CompetencyMatchResponse;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Review queue (reads/writes ipcr_competency_matches directly via Supabase) ──

export interface CompetencyMatchRow {
  id: string;
  employee_id: string | null;
  employee_position: string;
  rating_period: string | null;
  target_text: string;
  competency: string | null;
  confidence: number | null;
  justification: string | null;
  flag_for_review: boolean;
  prompt_version: string;
  model: string | null;
  created_by: string | null;
  created_at: string;
}

/** Persisted matches still awaiting HR confirmation (the review queue). */
export async function listFlaggedMatches(): Promise<CompetencyMatchRow[]> {
  const { data, error } = await supabase
    .from('ipcr_competency_matches')
    .select('*')
    .eq('flag_for_review', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CompetencyMatchRow[];
}

/** Mark a flagged match as reviewed (clears the flag) — the override-rate signal. */
export async function resolveMatch(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('ipcr_competency_matches')
    .update({ flag_for_review: false })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Discard a match the reviewer rejects outright. */
export async function deleteMatch(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('ipcr_competency_matches')
    .delete()
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
