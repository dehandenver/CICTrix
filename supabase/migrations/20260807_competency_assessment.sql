-- ============================================================================
-- 20260807_competency_assessment.sql
-- IPCR AI Competency Assessment & Gap Analysis database extension.
-- Creates employee_competency_summaries to store AI summaries, strengths,
-- improvements, and interventions.
-- Adds success_indicator_id to ipcr_competency_matches for robust joins.
--
-- Created: 2026-08-07
-- ============================================================================

BEGIN;

-- 1. Create employee_competency_summaries table
CREATE TABLE IF NOT EXISTS employee_competency_summaries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_id          integer REFERENCES performance_cycles(id) ON DELETE SET NULL,
  strengths         text NOT NULL,
  improvements      text NOT NULL,
  recommendations   text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_competency_summaries_cycle_unique UNIQUE (employee_id, cycle_id)
);

-- Support NULL cycles in uniqueness constraint by adding a partial index (safe for pre-PG15)
CREATE UNIQUE INDEX IF NOT EXISTS employee_competency_summaries_cycle_null_idx
  ON employee_competency_summaries (employee_id)
  WHERE cycle_id IS NULL;

-- 2. Add success_indicator_id column to ipcr_competency_matches for robust joins
ALTER TABLE ipcr_competency_matches 
  ADD COLUMN IF NOT EXISTS success_indicator_id uuid;

-- Make required_level nullable in employee_competencies to support unconfigured position requirements
ALTER TABLE employee_competencies ALTER COLUMN required_level DROP NOT NULL;

-- Extend training_recommendations.gap_type CHECK constraint to support 'COMPETENCY_GAP'
ALTER TABLE training_recommendations DROP CONSTRAINT IF EXISTS training_recommendations_gap_type_check;
ALTER TABLE training_recommendations
  ADD CONSTRAINT training_recommendations_gap_type_check CHECK (gap_type IN ('LOW_SCORE', 'DECLINING_TREND', 'KRA_ALIGNED', 'COMPETENCY_GAP'));

-- 3. Grants and RLS configuration (no DELETE grant for anon)
ALTER TABLE employee_competency_summaries DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON employee_competency_summaries TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
