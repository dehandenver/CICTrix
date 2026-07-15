-- ============================================================================
-- CREATE phase_schedules + locked_targets TABLES
-- Module 1 · Tab 1.2 · Cycle & Timeline Settings (Phase 3).
--
-- phase_schedules — the switches that gate what employees / Office Accounts can
--   do. Two phases (target_setting, rating), each with a mode (Auto follows the
--   dates; Open/Closed force it) and start/deadline dates. A 'system' row is the
--   default; an 'office' row overrides it for one office (staggered calendars).
--
-- locked_targets — the secured, read-only vault of office-verified targets,
--   frozen for the cycle. Never edited once locked; carries the verification +
--   lock audit (who verified, when locked).
-- Created: 2026-06-30
-- ============================================================================

-- 1) phase_schedules ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS phase_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         text NOT NULL DEFAULT 'system' CHECK (scope IN ('system', 'office')),
  office_id     uuid REFERENCES departments(id) ON DELETE CASCADE,   -- NULL for system
  office_name   text,
  phase         text NOT NULL CHECK (phase IN ('target_setting', 'rating')),
  -- 'Auto' = effective state derived from the dates; 'Open'/'Closed' force it.
  mode          text NOT NULL DEFAULT 'Auto' CHECK (mode IN ('Auto', 'Open', 'Closed')),
  start_date    date,
  deadline_date date,
  updated_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per phase at system scope; one row per (office, phase) at office scope.
CREATE UNIQUE INDEX IF NOT EXISTS phase_schedules_system_uq
  ON phase_schedules (phase) WHERE scope = 'system';
CREATE UNIQUE INDEX IF NOT EXISTS phase_schedules_office_uq
  ON phase_schedules (office_id, phase) WHERE scope = 'office';

CREATE OR REPLACE FUNCTION phase_schedules_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_phase_schedules_updated_at ON phase_schedules;
CREATE TRIGGER trg_phase_schedules_updated_at
  BEFORE UPDATE ON phase_schedules
  FOR EACH ROW EXECUTE FUNCTION phase_schedules_set_updated_at();

-- Seed the two system-wide phase rows (Auto, no dates → effectively Closed
-- until PM configures them). Guarded so re-runs don't duplicate.
INSERT INTO phase_schedules (scope, phase, mode)
SELECT 'system', 'target_setting', 'Auto'
WHERE NOT EXISTS (SELECT 1 FROM phase_schedules WHERE scope = 'system' AND phase = 'target_setting');

INSERT INTO phase_schedules (scope, phase, mode)
SELECT 'system', 'rating', 'Auto'
WHERE NOT EXISTS (SELECT 1 FROM phase_schedules WHERE scope = 'system' AND phase = 'rating');

-- 2) locked_targets ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS locked_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_name text,
  office_id     uuid REFERENCES departments(id) ON DELETE SET NULL,
  office_name   text,
  period        text,
  -- Frozen target rows, e.g. [{ function_type, target_text, ... }].
  targets       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Verification audit captured at lock time.
  verified_by   text,
  verified_at   timestamptz,
  locked_by     text,
  locked_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locked_targets_employee ON locked_targets (employee_id);
CREATE INDEX IF NOT EXISTS idx_locked_targets_office   ON locked_targets (office_id);
CREATE INDEX IF NOT EXISTS idx_locked_targets_period   ON locked_targets (period);

-- Disable RLS so the frontend Supabase anon client can read/write, matching the
-- pattern used for the other Module-1 tables (010, 011).
ALTER TABLE phase_schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE locked_targets   DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON phase_schedules TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON locked_targets   TO authenticated, anon;
