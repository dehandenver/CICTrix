-- ============================================================================
-- CONSOLIDATED COMPETENCY ASSESSMENT & GAP ANALYSIS MIGRATION
-- Created: 2026-08-07 (drafted 2026-07-18 against the live remote schema).
--
-- The remote database is missing several objects the AI competency assessment
-- needs. Verified live before writing this script:
--   - employee_competency_summaries, positions, position_competencies: MISSING
--   - ipcr_competency_matches, training_recommendations: already exist
--     (their CREATE blocks below are belt-and-braces for fresh environments)
--   - employee_competencies: exists with UNIQUE (employee_id, competency_id)
--     but lacks cycle_id / assessed_by and has a NOT NULL required_level
--   - performance_cycles.id: integer
--
-- Run this in the Supabase SQL editor (no direct Postgres access available).
-- Idempotent — safe to re-run.
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

ALTER TABLE positions DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON positions TO anon, authenticated;

-- 2) position_competencies
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

ALTER TABLE position_competencies DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON position_competencies TO anon, authenticated;

-- 3) employee_competencies: assessment metadata + optional requirement level.
-- The AI assessor writes NULL required_level when the position has no
-- configured requirement — the existing CHECK (BETWEEN 1 AND 5) passes NULL.
ALTER TABLE employee_competencies
  ADD COLUMN IF NOT EXISTS assessed_by text,
  ADD COLUMN IF NOT EXISTS cycle_id integer REFERENCES performance_cycles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employee_competencies_cycle_idx
  ON employee_competencies (cycle_id);

ALTER TABLE employee_competencies ALTER COLUMN required_level DROP NOT NULL;

-- 4) ipcr_competency_matches (belt-and-braces; exists on the current remote)
CREATE TABLE IF NOT EXISTS ipcr_competency_matches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_position text NOT NULL,
  rating_period     text,
  target_text       text NOT NULL,
  competency        text,
  confidence        numeric(3,2),
  justification     text,
  flag_for_review   boolean NOT NULL DEFAULT false,
  prompt_version    text NOT NULL,
  model             text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  success_indicator_id uuid,
  CONSTRAINT ipcr_competency_matches_pairing CHECK (
    (competency IS NULL     AND confidence IS NULL) OR
    (competency IS NOT NULL AND confidence IS NOT NULL)
  ),
  CONSTRAINT ipcr_competency_matches_confidence_range CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

-- Existing-table path: make sure the SI linkage column is present.
ALTER TABLE ipcr_competency_matches
  ADD COLUMN IF NOT EXISTS success_indicator_id uuid;

CREATE INDEX IF NOT EXISTS ipcr_competency_matches_employee_idx
  ON ipcr_competency_matches (employee_id);
CREATE INDEX IF NOT EXISTS ipcr_competency_matches_competency_idx
  ON ipcr_competency_matches (competency);
CREATE INDEX IF NOT EXISTS ipcr_competency_matches_review_idx
  ON ipcr_competency_matches (flag_for_review)
  WHERE flag_for_review;

ALTER TABLE ipcr_competency_matches DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON ipcr_competency_matches TO anon, authenticated;

-- 5) training_recommendations (belt-and-braces; exists on the current remote).
-- Status set and office_actor match 20260801_training_recommendation_pipeline
-- — a fresh create with the pre-§6 status list would break the L&D approval
-- round-trip (LND_APPROVED / OFFICE_ADDED / OFFICE_FINALIZED).
CREATE TABLE IF NOT EXISTS training_recommendations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid    NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  session_id      uuid    NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  competency      text    NOT NULL,
  source_cycle_id integer REFERENCES performance_cycles(id) ON DELETE SET NULL,
  trigger_score   numeric,
  gap_type        text    NOT NULL DEFAULT 'LOW_SCORE',
  gap_detail      text,
  priority        text    NOT NULL DEFAULT 'MEDIUM'
                    CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  status          text    NOT NULL DEFAULT 'SUGGESTED'
                    CHECK (status IN (
                      'SUGGESTED', 'LND_APPROVED', 'OFFICE_ADDED',
                      'OFFICE_FINALIZED', 'ENROLLED', 'DISMISSED', 'ACCEPTED'
                    )),
  admin_remark    text,
  office_actor    text,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_recommendations_uniq UNIQUE (employee_id, session_id, source_cycle_id)
);

-- Existing-table path (20260801 may not have been applied everywhere).
ALTER TABLE training_recommendations
  ADD COLUMN IF NOT EXISTS office_actor text;

CREATE INDEX IF NOT EXISTS training_recommendations_session_idx
  ON training_recommendations (session_id);
CREATE INDEX IF NOT EXISTS training_recommendations_employee_idx
  ON training_recommendations (employee_id);
CREATE INDEX IF NOT EXISTS training_recommendations_status_idx
  ON training_recommendations (status);

-- COMPETENCY_GAP joins the recognized gap types (constraint name is the
-- auto-generated one from 20260724's inline column check).
ALTER TABLE training_recommendations DROP CONSTRAINT IF EXISTS training_recommendations_gap_type_check;
ALTER TABLE training_recommendations
  ADD CONSTRAINT training_recommendations_gap_type_check
  CHECK (gap_type IN ('LOW_SCORE', 'DECLINING_TREND', 'KRA_ALIGNED', 'COMPETENCY_GAP'));

ALTER TABLE training_recommendations DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON training_recommendations TO anon, authenticated;

-- 6) employee_competency_summaries — AI qualitative summary per employee+cycle.
-- NULLS NOT DISTINCT so the backend's upsert on_conflict=(employee_id,cycle_id)
-- also updates-in-place for NULL-cycle assessments (a plain composite UNIQUE
-- treats NULLs as distinct, and a partial unique index can't be targeted by
-- that ON CONFLICT — re-assessments would 409 instead of updating).
CREATE TABLE IF NOT EXISTS employee_competency_summaries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_id          integer REFERENCES performance_cycles(id) ON DELETE SET NULL,
  strengths         text NOT NULL,
  improvements      text NOT NULL,
  recommendations   text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_competency_summaries_cycle_unique
    UNIQUE NULLS NOT DISTINCT (employee_id, cycle_id)
);

ALTER TABLE employee_competency_summaries DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON employee_competency_summaries TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
