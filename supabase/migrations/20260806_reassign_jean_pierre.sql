-- ============================================================================
-- Reassign Jean Francois Pierre to a new dedicated employee number.
-- Created: 2026-08-06.
--
-- Problem:
--   employee_portal_accounts row 'portal-EMP-2026-8997' was manually created
--   with the name "Jean Francois Pierre" but incorrectly linked to
--   EMP-2026-8997, which belongs to Perla Rivera Custodio (Nurse III,
--   Office of The City Health Officer) in the employees table.
--
-- Fix:
--   1. Insert Jean Francois Pierre as a proper employees row (EMP-2026-9056).
--   2. Re-link his portal account to EMP-2026-9056.
--   3. Rename the portal account PK from portal-EMP-2026-8997 to
--      portal-EMP-2026-9056 for consistency, safely re-linking the FK in
--      employee_password_resets (ON DELETE SET NULL) around the rename.
--
-- Idempotent: each step uses ON CONFLICT / conditional WHERE so re-running
-- is harmless once applied.
-- ============================================================================

BEGIN;

-- ── 1. Create the employees row for Jean Francois Pierre ─────────────────────
INSERT INTO employees (
  employee_number,
  first_name,
  middle_name,
  last_name,
  department,
  position,
  employment_status,
  status,
  nationality,
  account_status,
  email,
  created_by
) VALUES (
  'EMP-2026-9056',
  'Jean',
  'Francois',
  'Pierre',
  'Information Technology',
  'Computer Science Specialist',
  'Regular',
  'Active',
  'Filipino',
  'Active',
  'jean.pierre@cityhall.gov.ph',
  '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (employee_number) DO NOTHING;

-- ── 2. Re-link the portal account to the new employee number ─────────────────
UPDATE employee_portal_accounts
SET employee_id = 'EMP-2026-9056',
    updated_at  = now()
WHERE id = 'portal-EMP-2026-8997';

-- ── 3. Rename the portal account PK safely around the FK constraint ──────────

-- 3a. Null out the FK in any password-reset audit rows so the PK rename
--     does not violate the FK (the FK is ON DELETE SET NULL, so the DB
--     already tolerates NULL here).
UPDATE employee_password_resets
SET account_id = NULL
WHERE account_id = 'portal-EMP-2026-8997';

-- 3b. Rename the PK and assert the correct full_name.
UPDATE employee_portal_accounts
SET id        = 'portal-EMP-2026-9056',
    full_name = 'Jean Francois Pierre',
    updated_at = now()
WHERE id = 'portal-EMP-2026-8997';

-- 3c. Re-attach any password-reset audit rows that were just nulled.
UPDATE employee_password_resets
SET account_id = 'portal-EMP-2026-9056'
WHERE employee_number = 'EMP-2026-9056'
  AND account_id IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Verification (run after applying) ─────────────────────────────────────────
-- SELECT employee_number, first_name, middle_name, last_name, department, position
--   FROM employees WHERE employee_number IN ('EMP-2026-8997','EMP-2026-9056');
--
-- SELECT id, username, employee_id, full_name
--   FROM employee_portal_accounts
--   WHERE id IN ('portal-EMP-2026-8997','portal-EMP-2026-9056')
--      OR username = 'jeanfrancoispierre1';
