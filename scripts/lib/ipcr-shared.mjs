// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers for the IPCR RSP→portal sync and the historical seeder.
//
// Both scripts read the LIVE employees table with the service role and must
// resolve the same things the same way: an employee's display name, their
// canonical department (departments.id), and whether their position marks them
// as an approving authority. Keeping that logic here stops the two scripts from
// drifting apart.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Parse the project .env (KEY=VALUE lines) into a plain object. */
export function loadEnv() {
  const env = Object.fromEntries(
    readFileSync(resolve(ROOT, '.env'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  }
  return env;
}

/** A service-role Supabase client (bypasses RLS; never ships to the browser). */
export function serviceClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const die = (msg, error) => {
  console.error(`\n❌ ${msg}`, error ?? '');
  process.exit(1);
};

// ── Employee field access, drift-proof ──────────────────────────────────────
// The live employees table has diverged across migration histories (001 uses
// `department`/`position`, later views expose `current_department`/
// `current_position`). We read the base table with select('*') and pull each
// field by whichever name is present.

export const empDepartmentName = (e) =>
  (e.department ?? e.current_department ?? '').toString().trim() || null;

export const empPosition = (e) =>
  (e.position ?? e.current_position ?? '').toString().trim() || null;

export const empFullName = (e) => {
  if (e.full_name) return String(e.full_name).trim();
  const parts = [e.first_name, e.middle_name, e.last_name].filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim() || '(unnamed employee)';
};

export const empNumber = (e) => (e.employee_number ?? e.employee_id ?? '').toString().trim() || null;

/** A short, filesystem/username-safe slug from a name. */
export const slugify = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '') || 'x';

// ── Approving-authority classification from job title ────────────────────────
// The hybrid rule (confirmed with the team): the RSP position keyword decides
// whether an employee is auto-granted an Office Account, and which role.
//   * Department-head-level titles → DeptHead
//   * Supervisory titles           → Supervisor
//   * everything else              → null (no office account)
const DEPT_HEAD_KEYWORDS = ['department head', 'dept head', 'head of', 'chief', 'director', 'city ', 'officer-in-charge', 'oic'];
const SUPERVISOR_KEYWORDS = ['supervisor', 'manager', 'team lead', 'section head', 'unit head', 'coordinator', 'principal'];

/** 'DeptHead' | 'Supervisor' | null for a given position string. */
export function classifyOfficeRole(position) {
  const p = String(position ?? '').toLowerCase();
  if (!p) return null;
  // "head" on its own (e.g. "HR Head") also implies DeptHead.
  if (DEPT_HEAD_KEYWORDS.some((k) => p.includes(k)) || /\bhead\b/.test(p)) return 'DeptHead';
  if (SUPERVISOR_KEYWORDS.some((k) => p.includes(k))) return 'Supervisor';
  return null;
}

// ── Department resolution: employee → departments.id ─────────────────────────
// employees.department is a free-text name (case-variant duplicates exist), so
// resolve it against the departments lookup the same way migration 006 did:
// exact name → legacy map → null (caller decides the fallback).
const LEGACY_DEPARTMENT_MAP = new Map(
  [
    ['human resource management office', 'Human Resources'],
    ['human resources', 'Human Resources'],
    ['information technology office', 'Information Technology'],
    ['information technology', 'Information Technology'],
    ['city planning and development office', 'Operations'],
    ['city health office', 'Operations'],
    ['city engineering office', 'Operations'],
    ["treasurer's office", 'Finance'],
    ['budget office', 'Finance'],
    ['general services office', 'Operations'],
  ].map(([k, v]) => [k, v]),
);

/**
 * Load the departments lookup once and return a resolver. resolve(employee)
 * returns { id, name } or null when the department cannot be mapped.
 */
export async function buildDepartmentResolver(db) {
  const { data, error } = await db.from('departments').select('id, name, code');
  if (error) throw new Error(`load departments failed: ${error.message}`);
  const byLowerName = new Map((data ?? []).map((d) => [String(d.name).toLowerCase(), d]));

  return function resolve(employee) {
    // Prefer an explicit FK if the live schema carries one.
    if (employee.department_id) {
      const hit = (data ?? []).find((d) => String(d.id) === String(employee.department_id));
      if (hit) return { id: hit.id, name: hit.name };
    }
    const raw = empDepartmentName(employee);
    if (!raw) return null;
    const exact = byLowerName.get(raw.toLowerCase());
    if (exact) return { id: exact.id, name: exact.name };
    const mapped = LEGACY_DEPARTMENT_MAP.get(raw.toLowerCase());
    if (mapped) {
      const hit = byLowerName.get(mapped.toLowerCase());
      if (hit) return { id: hit.id, name: hit.name };
    }
    return null;
  };
}

/** All Active employees from the live base table (service role bypasses RLS). */
export async function loadActiveEmployees(db) {
  const { data, error } = await db.from('employees').select('*').eq('status', 'Active');
  if (error) throw new Error(`load employees failed: ${error.message}`);
  return data ?? [];
}
