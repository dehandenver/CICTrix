/**
 * Supervisor Access Management API (spec §13).
 *
 * Backed by the `supervisors` + `supervisor_password_resets` tables
 * (migration 010). All access goes through the Supabase anon client, matching
 * the rest of the admin tooling. The supervisors table is the durable source of
 * truth for who has system access, so the list works across browsers.
 */

import { supabase as supabaseClient } from '../supabase';

// Cast to `any` to bypass the auto-generated Supabase types resolving to `never`
// for tables that exist at runtime but aren't in the local type defs — the same
// escape hatch used elsewhere in src/lib/api.
const supabase = supabaseClient as any;

export interface Supervisor {
  id: string;
  full_name: string;
  department: string | null;
  position: string | null;
  username: string;
  account_status: 'Active' | 'Inactive';
  must_change_password: boolean;
  is_default_password: boolean;
  created_at: string;
  updated_at: string;
}

export type ResetMode = 'temporary' | 'default';

const DEFAULT_PASSWORD = 'ChangeMe@123';

/**
 * Generate a temporary password that satisfies the spec §12 policy
 * (min 8 chars, at least one uppercase, lowercase, and number).
 */
export function generateTemporaryPassword(): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnpqrstuvwxyz';
  const numbers = '23456789';
  const all = uppercase + lowercase + numbers;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];

  // Guarantee one of each required character class, then fill to length 10.
  let pwd = pick(uppercase) + pick(lowercase) + pick(numbers);
  for (let i = 0; i < 7; i++) pwd += pick(all);

  return pwd
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

/** Fetch all supervisors with system access, ordered by name. */
export async function getSupervisors(): Promise<
  { ok: true; data: Supervisor[] } | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabase
      .from('supervisors')
      .select('*')
      .order('full_name', { ascending: true });

    if (error) {
      return { ok: false, error: error.message ?? 'Failed to load supervisors.' };
    }
    return { ok: true, data: (data ?? []) as Supervisor[] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reset a supervisor's password.
 *
 * - `temporary`: generates a random temp password (returned so the admin can
 *   relay it to the supervisor).
 * - `default`: resets to the shared default password.
 *
 * Either way the account is forced to change the password on next login and the
 * activity is written to the `supervisor_password_resets` audit log.
 */
export async function resetSupervisorPassword(options: {
  supervisor: Pick<Supervisor, 'id' | 'username'>;
  mode: ResetMode;
  resetBy: string;
}): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  const { supervisor, mode, resetBy } = options;
  const newPassword = mode === 'default' ? DEFAULT_PASSWORD : generateTemporaryPassword();

  try {
    const { error: updateError } = await supabase
      .from('supervisors')
      .update({
        password: newPassword,
        must_change_password: true,
        is_default_password: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', supervisor.id);

    if (updateError) {
      return { ok: false, error: updateError.message ?? 'Failed to reset the password.' };
    }

    // Log the reset activity for auditing purposes (spec §13). A failure to log
    // must not hide the fact that the password was actually changed, so we only
    // warn here rather than failing the whole operation.
    const { error: auditError } = await supabase.from('supervisor_password_resets').insert([
      {
        supervisor_id: supervisor.id,
        supervisor_username: supervisor.username,
        reset_by: resetBy,
        action: mode,
        note: `Password reset to ${mode === 'default' ? 'default' : 'a temporary'} value; change required on next login.`,
      },
    ]);
    if (auditError) {
      console.warn('[supervisors] Failed to write password-reset audit log:', auditError);
    }

    return { ok: true, password: newPassword };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
