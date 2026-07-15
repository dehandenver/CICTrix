-- ============================================================================
-- PM MODULE — Competency Framework (Positions + Requirements)
-- Created: 2026-07-08
--
-- Purpose:
--   Back the PM Competency Framework tab (PMCompetencyFramework.tsx) with
--   live tables in place of the hardcoded mock arrays.
--
--   Reuses tables already created by 20260518_pm_performance_evaluations_and_competencies.sql:
--     - competencies            (Competency Library, Tab 2 Section B)
--     - employee_competencies   (per-employee assessment record)
--     - performance_cycles      (Assessment Period)
--
--   Adds:
--     1. positions              — company positions (Tab 2 Section A)
--     2. position_competencies  — required competencies per position, with
--                                  required proficiency level (1-5)
--     3. employee_competencies.assessed_by / cycle_id — assessor + period,
--                                  needed by the Employee Assessment Process
--                                  and the Gap Report's Assessment Period filter.
--
--   Position <-> employee linkage stays text-matched against
--   employees_with_department.current_position (no new FK on employees;
--   that table already has drifted schema handled by a compatibility view).
-- ============================================================================

BEGIN;

-- 1) positions
CREATE TABLE IF NOT EXISTS positions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  department  text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (name, department)
);

CREATE INDEX IF NOT EXISTS positions_department_idx ON positions (department);

CREATE OR REPLACE FUNCTION positions_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS positions_updated_at ON positions;
CREATE TRIGGER positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION positions_set_updated_at();


-- 2) position_competencies — required competencies per position
CREATE TABLE IF NOT EXISTS position_competencies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id     uuid NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  competency_id   uuid NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  required_level  integer NOT NULL CHECK (required_level BETWEEN 1 AND 5),
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (position_id, competency_id)
);

CREATE INDEX IF NOT EXISTS position_competencies_position_idx
  ON position_competencies (position_id);
CREATE INDEX IF NOT EXISTS position_competencies_competency_idx
  ON position_competencies (competency_id);


-- 3) employee_competencies — add assessor + assessment period
ALTER TABLE employee_competencies
  ADD COLUMN IF NOT EXISTS assessed_by text,
  ADD COLUMN IF NOT EXISTS cycle_id integer REFERENCES performance_cycles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employee_competencies_cycle_idx
  ON employee_competencies (cycle_id);


-- ============================================================================
-- Row Level Security — same convention as 20260518_pm_performance_evaluations_and_competencies.sql
-- ============================================================================
ALTER TABLE positions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_competencies  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS positions_admin_all ON positions;
CREATE POLICY positions_admin_all
  ON positions
  FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'))
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'));

DROP POLICY IF EXISTS positions_authenticated_read ON positions;
CREATE POLICY positions_authenticated_read
  ON positions
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS position_competencies_admin_all ON position_competencies;
CREATE POLICY position_competencies_admin_all
  ON position_competencies
  FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'))
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'));

DROP POLICY IF EXISTS position_competencies_authenticated_read ON position_competencies;
CREATE POLICY position_competencies_authenticated_read
  ON position_competencies
  FOR SELECT
  USING (auth.role() = 'authenticated');

COMMIT;
