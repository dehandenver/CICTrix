/**
 * IPCR Demo — data access layer.
 *
 * Thin wrappers over the demo-only Supabase tables/RPCs (migration 20260725).
 * All calls go through the anon client; the SECURITY DEFINER RPCs (demo_login,
 * demo_create_account, demo_set_password) keep the password hash server-side.
 *
 * Every function returns a flat { ok, error?, data? } shape — consistent with
 * the rest of src/lib/api and the strict:false discriminated-union caveat.
 */

import { supabase as supabaseClient } from '../../../../lib/supabase';
import type { DemoAccount, DemoOffice, NewAccountInput } from './types';

// The generated Database types don't know about the demo tables; use the same
// `as any` escape hatch the rest of the codebase uses for un-typed tables.
const supabase = supabaseClient as any;

// Flat result shape (not a discriminated union): with strict:false TS doesn't
// narrow unions, so consumers couldn't read `.error` after an `if (!ok)` check.
// This mirrors the rest of src/lib/api.
type Result<T> = { ok: boolean; data?: T; error?: string };

const errMsg = (e: unknown, fallback: string): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : fallback;

// ── Offices — the fixed dropdown source (demo_offices) ──────────────────────
export async function listOffices(): Promise<Result<DemoOffice[]>> {
  try {
    const { data, error } = await supabase
      .from('demo_offices')
      .select('id, name, sort_order')
      .order('sort_order');
    if (error) throw error;
    return { ok: true, data: (data ?? []) as DemoOffice[] };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to load offices.') };
  }
}

// ── Auth ────────────────────────────────────────────────────────────────────
export async function demoLogin(email: string, password: string): Promise<Result<DemoAccount>> {
  try {
    const { data, error } = await supabase.rpc('demo_login', {
      p_email: email,
      p_password: password,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { ok: false, error: 'Invalid email or password.' };
    return { ok: true, data: row as DemoAccount };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Login failed.') };
  }
}

export async function changePassword(accountId: string, newPassword: string): Promise<Result<boolean>> {
  try {
    const { data, error } = await supabase.rpc('demo_set_password', {
      p_account_id: accountId,
      p_new_password: newPassword,
    });
    if (error) throw error;
    return { ok: true, data: Boolean(data) };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Could not change password.') };
  }
}

// ── Accounts (PM Admin manages) ─────────────────────────────────────────────
const ACCOUNT_COLS =
  'id, email, full_name, employee_code, role, office, position_title, date_hired, status, created_at';

export async function listAccounts(): Promise<Result<DemoAccount[]>> {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select(ACCOUNT_COLS)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return { ok: true, data: (data ?? []) as DemoAccount[] };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to load accounts.') };
  }
}

export async function createAccount(input: NewAccountInput, createdByPm: string | null): Promise<Result<DemoAccount>> {
  try {
    const { data, error } = await supabase.rpc('demo_create_account', {
      p_email: input.email,
      p_password: input.password,
      p_full_name: input.full_name,
      p_employee_code: input.employee_code,
      p_role: input.role,
      p_office: input.office,
      p_position_title: input.position_title,
      p_date_hired: input.date_hired,
      p_created_by_pm: createdByPm,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, data: row as DemoAccount };
  } catch (e) {
    // Surface the common unique-violation in human terms.
    const msg = errMsg(e, 'Failed to create account.');
    if (/duplicate key|unique/i.test(msg)) {
      return { ok: false, error: 'That email or employee code is already in use.' };
    }
    return { ok: false, error: msg };
  }
}

export async function updateAccount(
  id: string,
  patch: Partial<Pick<DemoAccount, 'full_name' | 'employee_code' | 'role' | 'office' | 'position_title' | 'date_hired' | 'status'>>,
): Promise<Result<boolean>> {
  try {
    const { error } = await supabase.from('accounts').update(patch).eq('id', id);
    if (error) throw error;
    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to update account.') };
  }
}

export async function setAccountStatus(id: string, status: 'Active' | 'Inactive'): Promise<Result<boolean>> {
  return updateAccount(id, { status });
}

// ── Demo time control (demo_settings.offset_days) ───────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
let cachedOffsetDays = 0;

/** Load the current simulated-time offset into the module cache. Call at boot. */
export async function loadDemoOffset(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('demo_settings')
      .select('offset_days')
      .eq('id', 1)
      .maybeSingle();
    if (!error && data) cachedOffsetDays = Number(data.offset_days) || 0;
  } catch {
    /* keep last known offset */
  }
  return cachedOffsetDays;
}

/**
 * The single source of "now" for the whole demo. Never call `new Date()`
 * directly for demo logic — always go through this so the Time Control works.
 */
export function getSimulatedDate(): Date {
  return new Date(Date.now() + cachedOffsetDays * DAY_MS);
}

export function getOffsetDays(): number {
  return cachedOffsetDays;
}

async function persistOffset(days: number): Promise<Result<number>> {
  try {
    const simulated = new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
    const { error } = await supabase
      .from('demo_settings')
      .update({ offset_days: days, simulated_date: simulated, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) throw error;
    cachedOffsetDays = days;
    return { ok: true, data: days };
  } catch (e) {
    return { ok: false, error: errMsg(e, 'Failed to update demo time.') };
  }
}

export const advanceDemoDays = (days: number) => persistOffset(cachedOffsetDays + days);
export const resetDemoTime = () => persistOffset(0);
