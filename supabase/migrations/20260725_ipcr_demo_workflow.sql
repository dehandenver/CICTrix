-- ============================================================================
-- IPCR DEMO WORKFLOW — self-contained presentation build.
-- Created: 2026-07-25 (for the 2026-07-20 PM-portal presentation).
--
-- A STANDALONE demo of the full IPCR cycle for 5 employees. It deliberately does
-- NOT touch the production IPCR machinery (target_settings / mfos / ipcr_workspace
-- / ipcr_notifications / employees). Everything here is additive; nothing is
-- pre-seeded except the single demo_settings config row and the demo office list.
--
--   accounts             — every login (Employee/Supervisor/DeptHead/PMAdmin),
--                          created one-by-one by PM Admin. No account => no login.
--   demo_offices         — the fixed office list the account form's dropdown reads.
--   ipcr_schedules       — per-employee phase windows (Phase 1 / Phase 2).
--   ipcr_targets         — Phase 1 target rows (MFO/PAP, indicators, weights) +
--                          the supervisor-revision columns.
--   ipcr_accomplishments — Phase 2 accomplishment + Q/E/T ratings + revisions.
--   notifications        — one row per stage transition, per recipient.
--   demo_settings        — single-row time-simulation config (offset_days).
--   cycle_log            — append-only audit of every stage/action.
--
-- Auth: passwords are hashed with pgcrypto crypt(); login goes through the
-- SECURITY DEFINER demo_login() RPC so the hash never leaves the DB.
--
-- Access: same anon-open posture as the other IPCR/PM tables (RLS disabled,
-- grants to anon + authenticated). Enforcement is app-layer inside the PM portal.
--
-- Idempotent: safe to re-apply.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── demo_offices — the fixed office list the account dropdown reads ──────────
CREATE TABLE IF NOT EXISTS demo_offices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO demo_offices (name, sort_order) VALUES
  ('Admin Office',  1),
  ('Finance',       2),
  ('Health Office', 3),
  ('Engineering',   4),
  ('HR Office',     5)
ON CONFLICT (name) DO NOTHING;

-- ── accounts — every demo login, created by PM Admin ────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  full_name      text NOT NULL,
  employee_code  text UNIQUE,
  role           text NOT NULL
                   CHECK (role IN ('Employee', 'Supervisor', 'DeptHead', 'PMAdmin')),
  office         text,               -- FK-by-name to demo_offices.name; null for PMAdmin
  position_title text,
  date_hired     date,
  status         text NOT NULL DEFAULT 'Active'
                   CHECK (status IN ('Active', 'Inactive')),
  created_by_pm  uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_role_idx   ON accounts (role);
CREATE INDEX IF NOT EXISTS accounts_office_idx ON accounts (office);

-- Probationary vs regular is derived from date_hired at read time (see helper).

-- ── ipcr_schedules — per-employee phase window ──────────────────────────────
CREATE TABLE IF NOT EXISTS ipcr_schedules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  cycle_type       text NOT NULL DEFAULT 'Regular'
                     CHECK (cycle_type IN ('Regular', 'Probationary')),
  phase            integer NOT NULL DEFAULT 1 CHECK (phase IN (1, 2)),
  phase_start_date date,
  phase_due_date   date,
  status           text NOT NULL DEFAULT 'Not Started',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ipcr_schedules_employee_idx ON ipcr_schedules (employee_id);

-- ── ipcr_targets — Phase 1 target rows + supervisor revisions ───────────────
CREATE TABLE IF NOT EXISTS ipcr_targets (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id               uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  schedule_id               uuid REFERENCES ipcr_schedules(id) ON DELETE SET NULL,
  mfo_pap                   text,
  success_indicator         text,
  category                  text
                              CHECK (category IN ('Core Function', 'Support Function', 'Strategic Priority')),
  item_weight_pct           numeric(6,2),
  category_weight_pct       numeric(6,2),
  -- Supervisor-revision tracking (Office Account edits).
  original_mfo_pap          text,
  original_success_indicator text,
  revised_mfo_pap           text,
  revised_success_indicator text,
  is_revised                boolean NOT NULL DEFAULT false,
  revised_by                uuid REFERENCES accounts(id) ON DELETE SET NULL,
  revision_remarks          text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ipcr_targets_employee_idx ON ipcr_targets (employee_id);
CREATE INDEX IF NOT EXISTS ipcr_targets_schedule_idx ON ipcr_targets (schedule_id);

-- ── ipcr_accomplishments — Phase 2 accomplishment + Q/E/T ratings ───────────
CREATE TABLE IF NOT EXISTS ipcr_accomplishments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id               uuid NOT NULL REFERENCES ipcr_targets(id) ON DELETE CASCADE,
  employee_id             uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  actual_accomplishment   text,
  q_rating                integer CHECK (q_rating BETWEEN 1 AND 5),
  e_rating                integer CHECK (e_rating BETWEEN 1 AND 5),
  t_rating                integer CHECK (t_rating BETWEEN 1 AND 5),
  original_accomplishment text,
  revised_accomplishment  text,
  is_revised              boolean NOT NULL DEFAULT false,
  revised_by              uuid REFERENCES accounts(id) ON DELETE SET NULL,
  revision_remarks        text,
  submitted_at            timestamptz,
  verified_at             timestamptz,
  verified_by             uuid REFERENCES accounts(id) ON DELETE SET NULL,
  UNIQUE (target_id)
);

CREATE INDEX IF NOT EXISTS ipcr_accomplishments_employee_idx ON ipcr_accomplishments (employee_id);

-- ── notifications — one row per stage transition, per recipient ─────────────
CREATE TABLE IF NOT EXISTS notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_role text,
  recipient_id   uuid REFERENCES accounts(id) ON DELETE CASCADE,
  message        text NOT NULL,
  type           text,
  is_read        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications (recipient_id, is_read);

-- ── demo_settings — single-row time-simulation config ───────────────────────
CREATE TABLE IF NOT EXISTS demo_settings (
  id             integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  simulated_date date,
  offset_days    integer NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Seed the single config row (this is infra, not demo content).
INSERT INTO demo_settings (id, simulated_date, offset_days)
VALUES (1, CURRENT_DATE, 0)
ON CONFLICT (id) DO NOTHING;

-- ── cycle_log — append-only stage/action audit ─────────────────────────────
CREATE TABLE IF NOT EXISTS cycle_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid REFERENCES accounts(id) ON DELETE CASCADE,
  stage        text,
  action       text,
  performed_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  notes        text
);

CREATE INDEX IF NOT EXISTS cycle_log_employee_idx ON cycle_log (employee_id);

-- ── Auth helpers — hash on write, verify via RPC ────────────────────────────
-- demo_create_account: hashes the plaintext password, inserts, returns the row
-- (without the hash). PM Admin's Account Management panel calls this.
CREATE OR REPLACE FUNCTION demo_create_account(
  p_email          text,
  p_password       text,
  p_full_name      text,
  p_employee_code  text,
  p_role           text,
  p_office         text,
  p_position_title text,
  p_date_hired     date,
  p_created_by_pm  uuid DEFAULT NULL
) RETURNS TABLE (
  id uuid, email text, full_name text, employee_code text, role text,
  office text, position_title text, date_hired date, status text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  INSERT INTO accounts (email, password_hash, full_name, employee_code, role,
                        office, position_title, date_hired, created_by_pm)
  VALUES (lower(trim(p_email)), crypt(p_password, gen_salt('bf')), p_full_name,
          NULLIF(trim(p_employee_code), ''), p_role, p_office, p_position_title,
          p_date_hired, p_created_by_pm)
  RETURNING accounts.id, accounts.email, accounts.full_name, accounts.employee_code,
            accounts.role, accounts.office, accounts.position_title, accounts.date_hired,
            accounts.status, accounts.created_at;
END;
$$;

-- demo_set_password: lets a user change their own password later.
CREATE OR REPLACE FUNCTION demo_set_password(p_account_id uuid, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE accounts SET password_hash = crypt(p_new_password, gen_salt('bf'))
  WHERE id = p_account_id;
  RETURN FOUND;
END;
$$;

-- demo_login: verifies credentials, returns the account row (no hash) or nothing.
CREATE OR REPLACE FUNCTION demo_login(p_email text, p_password text)
RETURNS TABLE (
  id uuid, email text, full_name text, employee_code text, role text,
  office text, position_title text, date_hired date, status text
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.email, a.full_name, a.employee_code, a.role, a.office,
         a.position_title, a.date_hired, a.status
  FROM accounts a
  WHERE a.email = lower(trim(p_email))
    AND a.status = 'Active'
    AND a.password_hash = crypt(p_password, a.password_hash);
END;
$$;

-- ── Access — app-layer enforcement, consistent with the other PM tables ─────
ALTER TABLE demo_offices          DISABLE ROW LEVEL SECURITY;
ALTER TABLE accounts              DISABLE ROW LEVEL SECURITY;
ALTER TABLE ipcr_schedules        DISABLE ROW LEVEL SECURITY;
ALTER TABLE ipcr_targets          DISABLE ROW LEVEL SECURITY;
ALTER TABLE ipcr_accomplishments  DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         DISABLE ROW LEVEL SECURITY;
ALTER TABLE demo_settings         DISABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_log             DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  demo_offices, accounts, ipcr_schedules, ipcr_targets,
  ipcr_accomplishments, notifications, demo_settings, cycle_log
  TO anon, authenticated;

-- Password hash must never be exposed to the anon/auth roles via SELECT *.
REVOKE SELECT ON accounts FROM anon, authenticated;
GRANT  SELECT (id, email, full_name, employee_code, role, office,
               position_title, date_hired, status, created_by_pm, created_at)
  ON accounts TO anon, authenticated;

GRANT EXECUTE ON FUNCTION demo_create_account(text,text,text,text,text,text,text,date,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION demo_set_password(uuid,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION demo_login(text,text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
