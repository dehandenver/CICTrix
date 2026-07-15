-- ============================================================================
-- CREATE new_entrant_onboarding TABLE
-- Module 2 · Subtab 2.1 · New Entrant Onboarding.
--
-- Tracks employees new to the org or to a position (no prior 6-month cycle):
-- start date, scheduled orientation, and a target-setting deadline that may
-- differ from the office-wide one (new entrants often start mid-cycle). The Job
-- Orientation Log (who briefed them + when) gives orientation a formal auditable
-- home, and the initial target-setting status runs the same draft→submitted→
-- verified pipeline, flagged separately so PM can track onboarding completion.
-- Created: 2026-07-02
-- ============================================================================

CREATE TABLE IF NOT EXISTS new_entrant_onboarding (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id               uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_name             text,
  office_id                 uuid REFERENCES departments(id) ON DELETE SET NULL,
  office_name               text,

  start_date                date,
  orientation_date          date,               -- scheduled orientation
  target_setting_deadline   date,               -- may differ from office-wide

  -- Job Orientation Log.
  orientation_conducted_by  text,
  orientation_completed_date date,

  -- Initial (first-ever) target-setting status — same pipeline as regular staff.
  initial_target_stage      text NOT NULL DEFAULT 'Not Started'
                              CHECK (initial_target_stage IN (
                                'Not Started',
                                'In Draft',
                                'Submitted to Office',
                                'Returned for Revision',
                                'Verified',
                                'Forwarded to PM'
                              )),

  notes                     text,
  created_by                text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_new_entrant_onboarding_employee
  ON new_entrant_onboarding (employee_id);
CREATE INDEX IF NOT EXISTS idx_new_entrant_onboarding_office
  ON new_entrant_onboarding (office_id);
CREATE INDEX IF NOT EXISTS idx_new_entrant_onboarding_stage
  ON new_entrant_onboarding (initial_target_stage);

CREATE OR REPLACE FUNCTION new_entrant_onboarding_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_entrant_onboarding_updated_at ON new_entrant_onboarding;
CREATE TRIGGER trg_new_entrant_onboarding_updated_at
  BEFORE UPDATE ON new_entrant_onboarding
  FOR EACH ROW EXECUTE FUNCTION new_entrant_onboarding_set_updated_at();

-- Disable RLS so the frontend Supabase anon client can read/write, matching the
-- pattern used for the Module-1 tables (010–013).
ALTER TABLE new_entrant_onboarding DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON new_entrant_onboarding TO authenticated, anon;
