-- ============================================================================
-- CREATE employee_password_resets TABLE
-- Audit log for the RSP "Reset Password" action on employee_portal_accounts
-- (migration 008). Mirrors supervisor_password_resets (migration 010).
-- Created: 2026-07-07
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_password_resets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         text REFERENCES employee_portal_accounts(id) ON DELETE SET NULL,
  employee_username  text,
  employee_number    text,
  -- Identifier (email) of the admin who performed the reset.
  reset_by           text,
  action             text NOT NULL DEFAULT 'temporary' CHECK (action IN ('temporary')),
  note               text,
  reset_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_password_resets_account_id
  ON employee_password_resets (account_id);

-- Disable RLS so the frontend Supabase anon client can read/write, matching
-- employee_portal_accounts (008) and supervisor_password_resets (010).
ALTER TABLE employee_password_resets DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_password_resets TO authenticated, anon;
