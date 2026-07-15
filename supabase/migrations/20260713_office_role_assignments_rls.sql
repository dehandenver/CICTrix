-- ============================================================
-- Migration: Lock down office_role_assignments
-- Date: 2026-07-13
-- SECURITY FIX. Before this migration, on the live database:
--
--   * The anon key could INSERT rows — i.e. anyone loading the public site
--     could mint themselves a Dept Head grant.
--   * The anon key could SELECT account_password in cleartext.
--     Verified: {"employee_name":"Maria Santos",
--                "account_username":"maria_santos_office",
--                "account_password":"office123"}
--
-- Design constraints discovered in the code, which shape this policy:
--
--   * Employees and Office Accounts do NOT use Supabase Auth. handleEmployeeLogin
--     (src/App.tsx) verifies against employee_portal_accounts and stores a
--     localStorage session, so those clients reach PostgREST as `anon`.
--     OfficeAccountConsole and EmployeePage both READ this table as anon.
--     Restricting SELECT to `authenticated` would lock out every Office Account.
--
--   * Admins DO use Supabase Auth (LoginPage -> signInWithPassword), but the app
--     role is not in the JWT — it lives in public.user_roles, keyed by user_id.
--     So `auth.jwt() ->> 'role'` is always 'authenticated' here and must not be
--     used to identify a super-admin. (Several older migrations do exactly that;
--     those policies never matched. Out of scope for this migration.)
--
-- Therefore: reads stay open, minus the credential columns; writes require an
-- authenticated user with an active super-admin row in user_roles.
--
-- Idempotent: safe to re-apply.
-- ============================================================

BEGIN;

-- ── 1. Identify a super-admin ───────────────────────────────────────────────
-- SECURITY DEFINER so the policy can read user_roles regardless of the caller's
-- own privileges on it. search_path is pinned so the function cannot be hijacked
-- by a caller-controlled schema.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND coalesce(ur.is_active, true)
       -- Mirrors normalizeAdminRole() in src/App.tsx: 'admin', 'superadmin',
       -- 'super_admin' and 'super-admin' all mean super-admin.
       AND replace(lower(ur.role), '_', '-') IN ('admin', 'superadmin', 'super-admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated;

-- ── 2. Enable RLS ───────────────────────────────────────────────────────────
ALTER TABLE office_role_assignments ENABLE ROW LEVEL SECURITY;

-- ── 3. Reads: every client needs them, so keep rows visible ─────────────────
-- The Office Account Console resolves its own grant as anon; the employee
-- dashboard decides whether to show the "Switch Account" button as anon; L&D
-- looks up an office's Dept Head. None of them need the credentials.
DROP POLICY IF EXISTS office_role_assignments_read ON office_role_assignments;
CREATE POLICY office_role_assignments_read
  ON office_role_assignments FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── 4. Writes: super-admin only ─────────────────────────────────────────────
-- Assigning or revoking an office role mints Office Account credentials and
-- reroutes pending IPCR submissions. It is a System Administration act.
DROP POLICY IF EXISTS office_role_assignments_insert ON office_role_assignments;
CREATE POLICY office_role_assignments_insert
  ON office_role_assignments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS office_role_assignments_update ON office_role_assignments;
CREATE POLICY office_role_assignments_update
  ON office_role_assignments FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS office_role_assignments_delete ON office_role_assignments;
CREATE POLICY office_role_assignments_delete
  ON office_role_assignments FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

-- ── 5. Defence in depth: strip anon's write grants entirely ─────────────────
-- RLS alone would already block anon (no policy grants it INSERT/UPDATE/DELETE),
-- but revoking the table privilege means a future permissive policy cannot
-- silently reopen the hole.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON office_role_assignments FROM anon;

-- ── 6. Stop anon reading the credentials ────────────────────────────────────
-- RLS is row-level; hiding a column needs a column privilege. Revoke the whole
-- SELECT grant from anon, then hand back only the non-secret columns.
--
-- Deliberately withheld from anon: account_username, account_password,
-- must_change_password. Callers that need them (Access & Role Management) run
-- authenticated. Verified anon read paths select only the columns re-granted
-- below: EmployeePage (id), getActiveOfficeRoles (id, role, office_id,
-- office_name), getOfficeDeptHead (employee_id, employee_name).
REVOKE SELECT ON office_role_assignments FROM anon;
GRANT SELECT (
  id, employee_id, employee_name, office_id, office_name, role, status,
  assigned_by, assigned_at, revoked_by, revoked_at, revoke_reason,
  successor_employee_id, successor_name, created_at, updated_at
) ON office_role_assignments TO anon;

COMMIT;
