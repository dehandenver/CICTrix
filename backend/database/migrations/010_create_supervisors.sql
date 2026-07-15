-- ============================================================================
-- CREATE supervisors + supervisor_password_resets TABLES
-- Spec §13 "Supervisor Access Management": a list of all supervisors with
-- system access (Full Name, Department, Position, Username, Account Status)
-- plus a per-account Password Reset action that is logged for auditing.
-- Created: 2026-06-29
-- ============================================================================

-- Supervisors with system access ---------------------------------------------
CREATE TABLE IF NOT EXISTS supervisors (
  id                   text PRIMARY KEY,
  full_name            text NOT NULL,
  department           text,
  position             text,
  username             text NOT NULL UNIQUE,
  password             text NOT NULL,
  -- 'Active' supervisors can sign in; 'Inactive' are suspended.
  account_status       text NOT NULL DEFAULT 'Active'
                         CHECK (account_status IN ('Active', 'Inactive')),
  -- True when the account is using a temporary/default password and must be
  -- changed on next login (spec §12 "First Login Password Change").
  must_change_password boolean NOT NULL DEFAULT false,
  -- True while the current password is the generated/default one (not yet
  -- replaced by the supervisor). Lets the UI flag "temporary/default password".
  is_default_password  boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervisors_username_lower
  ON supervisors (lower(username));

-- Audit log of password-reset activity ---------------------------------------
CREATE TABLE IF NOT EXISTS supervisor_password_resets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id       text REFERENCES supervisors(id) ON DELETE SET NULL,
  supervisor_username text,
  -- Identifier (email) of the admin who performed the reset.
  reset_by            text,
  -- 'temporary' = generated random temp password, 'default' = reset to default.
  action              text NOT NULL DEFAULT 'temporary'
                        CHECK (action IN ('temporary', 'default')),
  note                text,
  reset_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_password_resets_supervisor_id
  ON supervisor_password_resets (supervisor_id);

-- Disable RLS so the frontend Supabase anon client can read/write,
-- matching the pattern used for employee_portal_accounts (008) and
-- employees + newly_hired (005).
ALTER TABLE supervisors DISABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_password_resets DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON supervisors TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON supervisor_password_resets TO authenticated, anon;

-- Seed the four division supervisors so the list is populated out of the box.
INSERT INTO supervisors (id, full_name, department, position, username, password, account_status, must_change_password, is_default_password)
VALUES
  ('sup-rsp',   'Juan Dela Cruz',   'Human Resource Management Office', 'RSP Supervisor',         'rsp',   'rsp123',   'Active', false, false),
  ('sup-lnd',   'Maria Reyes',      'Learning & Development',           'L&D Supervisor',         'lnd',   'lnd123',   'Active', false, false),
  ('sup-pm',    'Pedro Santos',     'Performance Management',           'PM Supervisor',          'pm',    'pm123',    'Active', false, false),
  ('sup-admin', 'Ana Villanueva',   'Human Resource Management Office', 'HR Head / Super Admin',  'admin', 'admin123', 'Active', false, false)
ON CONFLICT (id) DO NOTHING;
