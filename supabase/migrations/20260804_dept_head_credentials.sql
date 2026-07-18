-- ============================================================================
-- Provision Office Account credentials for the 5 Department Heads.
-- Created: 2026-08-04.
--
-- The org restructure (20260803) created the DeptHead role assignments but did
-- not generate their Office Account credentials. This sets them to KNOWN
-- temporary values so they can be handed over directly:
--
--   * account_username = firstname.lastname (matches the email local part).
--   * account_password = Lastname@2026 (temporary; must_change_password = true,
--                        so each head is forced to set their own on first login).
--
-- These are temporary credentials for a dev/demo system whose passwords are
-- plaintext by design. Rotate/replace for any real deployment.
--
-- Re-running resets the 5 heads back to these temporary values.
-- ============================================================================

BEGIN;

UPDATE office_role_assignments ora
SET account_username = lower(e.first_name) || '.' || lower(e.last_name),
    account_password = e.last_name || '@2026',
    must_change_password = true
FROM employees e
WHERE ora.employee_id = e.id
  AND ora.role = 'DeptHead'
  AND ora.status = 'Active';

COMMIT;
