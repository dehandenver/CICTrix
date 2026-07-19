/**
 * IPCR office weighting — client for the backend-gated weighting endpoints.
 *
 * Unlike most of this app, these do NOT go straight to Supabase. Writes to
 * `department_weighting_configs` are locked to service_role in Postgres, because
 * changing an office's split recomputes every rating under it. The backend holds
 * the service key and does the role check, so it is the only write path — a
 * direct `supabase.from(...)` call here would be rejected with a permission
 * error, by design.
 *
 * Auth: admins sign in through Supabase Auth, so the session's access token is
 * what the backend validates (see get_authenticated_user). Every call must send
 * it or the endpoint answers 401.
 */

import { supabase } from '../supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface WeightingOption {
  id: string;
  code: 'A' | 'B' | 'C';
  strategic_weight: number;
  core_weight: number;
  support_weight: number;
}

export interface WeightingConfig {
  department_id: string;
  department_name: string | null;
  config_id: string | null;
  code: 'A' | 'B' | 'C' | null;
  strategic_weight: number | null;
  core_weight: number | null;
  support_weight: number | null;
  effective_from: string | null;
  set_by_employee_id: string | null;
}

/** The Supabase session token the backend validates. */
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const headers = { 'Content-Type': 'application/json', ...(await authHeader()), ...(init?.headers ?? {}) };
    const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    if (!res.ok) {
      // 401/403 here usually means the admin has no Supabase session — e.g. a
      // stale localStorage login from before admin accounts existed.
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: (body as any)?.detail || `Request failed (${res.status})` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export const listWeightingOptions = () => request<WeightingOption[]>('/offices/weighting-options');

export const listWeightingConfigs = () => request<WeightingConfig[]>('/offices/weighting-configs');

export const setWeightingConfig = (officeId: string, code: 'A' | 'B' | 'C', setByEmployeeId?: string) =>
  request<WeightingConfig>(`/offices/${officeId}/weighting-config`, {
    method: 'PUT',
    body: JSON.stringify({ code, set_by_employee_id: setByEmployeeId ?? null }),
  });

/**
 * The office's active split, read straight from Supabase rather than through the
 * backend.
 *
 * Scoring runs for employees, who reach PostgREST as `anon` and hold no backend
 * token — routing this through the API would make every IPCR save fail with 401.
 * Reads are open on these tables by design; only writes are locked to
 * service_role, which is what protects the config from being changed here.
 *
 * Returns null when the office has no config, so callers can fall back rather
 * than silently scoring against zeroes.
 */
export async function resolveOfficeWeights(
  officeId: string | null
): Promise<{ core: number; strategic: number; support: number; code: string } | null> {
  if (!officeId) return null;
  const { data, error } = await supabase
    .from('department_weighting_configs')
    .select('weighting_schema_options(code, strategic_weight, core_weight, support_weight)')
    .eq('department_id', officeId)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  const opt = (data as any).weighting_schema_options;
  if (!opt) return null;
  return {
    core: Number(opt.core_weight),
    strategic: Number(opt.strategic_weight),
    support: Number(opt.support_weight),
    code: String(opt.code),
  };
}

/** Human-readable split, e.g. "Strategic 30 / Core 50 / Support 20". */
export function describeSplit(c: Pick<WeightingConfig, 'strategic_weight' | 'core_weight' | 'support_weight'>): string {
  if (c.strategic_weight == null) return 'Not set';
  return `Strategic ${c.strategic_weight} / Core ${c.core_weight} / Support ${c.support_weight}`;
}
