-- ============================================================================
-- Provision Office Account credentials for the 5 Department Heads.
-- Created: 2026-08-04.
--
-- The org restructure (20260803) created the DeptHead role assignments but did
-- not generate their Office Account credentials (the SQL INSERT omitted the
-- account_username / account_password columns). This fills them:
--
--   * account_username    = firstname.lastname (matches the email local part).
--   * account_password    = a RANDOM temporary password, generated here so it is
--                           NOT committed to git. must_change_password = true, so
--                           each head is forced to set their own on first login.
--
-- After applying, read the generated credentials in the Supabase SQL editor
-- (the postgres role can read these columns; anon cannot) with:
--
--   SELECT office_name, employee_name, account_username, account_password,
--          must_change_password
--   FROM office_role_assignments
--   WHERE role = 'DeptHead' AND status = 'Active'
--   ORDER BY office_name;
--
-- Idempotent: only fills rows that don't already have credentials, so re-running
-- never resets a password a head has already changed.
-- ============================================================================

BEGIN;

UPDATE office_role_assignments ora
SET account_username = lower(e.first_name) || '.' || lower(e.last_name),
    account_password = initcap(substr(md5(random()::text || ora.id::text), 1, 6))
                       || '@' || (floor(random() * 900) + 100)::int::text,
    must_change_password = true
FROM employees e
WHERE ora.employee_id = e.id
  AND ora.role = 'DeptHead'
  AND ora.status = 'Active'
  AND (ora.account_username IS NULL OR ora.account_password IS NULL);

COMMIT;
