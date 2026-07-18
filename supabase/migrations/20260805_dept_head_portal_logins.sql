-- ============================================================================
-- Employee-portal login accounts for the 5 Department Heads.
-- Created: 2026-08-05.
--
-- Office Account access = (1) log in to the employee portal + (2) hold an Active
-- office_role_assignments DeptHead grant. The login is validated against
-- employee_portal_accounts (username + plaintext password) — NOT the
-- account_username/account_password on office_role_assignments, which are not
-- used for authentication. The restructure created the DeptHead grants but no
-- portal login rows, so the heads could not sign in. This provisions them.
--
--   username = firstname.lastname   password = Lastname@2026 (temporary)
--
-- Derived from the live DeptHead assignments, so it stays correct regardless of
-- each head's employee_number. Idempotent (upsert on username).
-- ============================================================================

BEGIN;

INSERT INTO employee_portal_accounts (id, username, password, employee_id, full_name, email)
SELECT
  'portal-' || lower(e.first_name) || '.' || lower(e.last_name),
  lower(e.first_name) || '.' || lower(e.last_name),
  e.last_name || '@2026',
  e.employee_number,
  btrim(e.first_name || ' ' || e.last_name),
  e.email
FROM office_role_assignments ora
JOIN employees e ON e.id = ora.employee_id
WHERE ora.role = 'DeptHead' AND ora.status = 'Active'
ON CONFLICT (username) DO UPDATE
  SET password    = EXCLUDED.password,
      employee_id = EXCLUDED.employee_id,
      full_name   = EXCLUDED.full_name,
      email       = EXCLUDED.email,
      updated_at  = now();

COMMIT;
