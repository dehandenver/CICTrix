-- ============================================================================
-- IPCR DEMO — cycle-state add-ons for the live workflow (Stages 2–8).
-- Created: 2026-07-26 (for the 2026-07-20 PM-portal presentation).
--
-- Builds ON TOP of 20260725_ipcr_demo_workflow.sql. Adds only what the live
-- 8-stage flow needs beyond the base tables:
--   • demo_settings.phase1_status / phase2_status — the global phase toggles PM
--     flips with "Open Target-Setting Phase" / "Open Accomplishment Phase".
--   • UNIQUE(employee_id) on ipcr_schedules — one cycle row per employee, so the
--     app can upsert a schedule as it walks the state machine.
--   • cold_storage_vault — where PM "Accept & Lock" parks a verified target set,
--     with locked_at + phase2_eligible_date (locked + 6 months) for the Time
--     Control to cross.
--
-- Same anon-open posture as the rest of the demo tables (RLS off, anon grants;
-- enforcement is app-layer in the PM portal). Idempotent: safe to re-apply.
-- ============================================================================

BEGIN;

-- ── Global phase toggles on the single demo_settings row ────────────────────
ALTER TABLE demo_settings
  ADD COLUMN IF NOT EXISTS phase1_status text NOT NULL DEFAULT 'Closed'
    CHECK (phase1_status IN ('Closed', 'Open')),
  ADD COLUMN IF NOT EXISTS phase2_status text NOT NULL DEFAULT 'Closed'
    CHECK (phase2_status IN ('Closed', 'Open'));

-- ── One schedule row per employee, so the app can upsert on employee_id ─────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_schedules_employee_unique'
  ) THEN
    ALTER TABLE ipcr_schedules
      ADD CONSTRAINT ipcr_schedules_employee_unique UNIQUE (employee_id);
  END IF;
END $$;

-- ── cold_storage_vault — PM's locked target vault ───────────────────────────
CREATE TABLE IF NOT EXISTS cold_storage_vault (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  schedule_id         uuid REFERENCES ipcr_schedules(id) ON DELETE SET NULL,
  locked_at           timestamptz NOT NULL DEFAULT now(),
  locked_by           uuid REFERENCES accounts(id) ON DELETE SET NULL,
  phase2_eligible_date date,
  UNIQUE (employee_id)
);

CREATE INDEX IF NOT EXISTS cold_storage_vault_employee_idx ON cold_storage_vault (employee_id);

-- ── Access — same app-layer posture as the other demo tables ────────────────
ALTER TABLE cold_storage_vault DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON cold_storage_vault TO anon, authenticated;

-- ── Bootstrap PM Admin — infrastructure, not demo content ───────────────────
-- Chicken-and-egg: accounts are created from the PM console, but you can't reach
-- the console without a PM login. Seed exactly ONE PM Admin so the presenter can
-- sign in and create the remaining 7 accounts live. Everything else stays unseeded.
INSERT INTO accounts (email, password_hash, full_name, role, position_title, status)
VALUES ('pm@lgu.gov', crypt('demo1234', gen_salt('bf')), 'PM Admin', 'PMAdmin', 'PM Administrator', 'Active')
ON CONFLICT (email) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
