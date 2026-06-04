-- ============================================================================
-- CREATE employee_portal_accounts TABLE
-- Username + password for the employee-side portal login. Previously stored
-- only in browser localStorage (cictrix_employee_portal_accounts), so RSP-
-- generated credentials never made it to the employee's own browser.
-- Created: 2026-05-19
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_portal_accounts (
  id              text PRIMARY KEY,
  username        text NOT NULL UNIQUE,
  password        text NOT NULL,
  employee_id     text,
  full_name       text,
  email           text,
  mobile_number   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive username lookups (login query uses lower(username))
CREATE INDEX IF NOT EXISTS idx_employee_portal_accounts_username_lower
  ON employee_portal_accounts (lower(username));

CREATE INDEX IF NOT EXISTS idx_employee_portal_accounts_employee_id
  ON employee_portal_accounts (employee_id);

-- Disable RLS so the frontend Supabase anon client can read/write,
-- matching the pattern used for employees + newly_hired in 005.
ALTER TABLE employee_portal_accounts DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_portal_accounts TO authenticated, anon;

-- Seed the demo account so existing test credentials keep working.
INSERT INTO employee_portal_accounts (id, username, password, employee_id, full_name, email, mobile_number)
VALUES (
  'employee-account-demo-employee01',
  'employee01',
  'hr2024',
  'EMP-2024-001',
  'Maria Santos',
  'maria.santos@ilongcity.gov.ph',
  '+63-908-123-4567'
)
ON CONFLICT (id) DO NOTHING;
