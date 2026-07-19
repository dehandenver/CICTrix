-- ============================================================================
-- Critical Position: qualification requirements.
-- Created: 2026-08-09.
--
-- Extends the EXISTING critical_positions table (owned by Succession Planning,
-- migration 20260720_succession_planning.sql) rather than creating a parallel
-- table, so Office Account writes and RSP Portal reads are automatically the
-- same data — no sync job needed.
--
-- critical_position_competency_requirements is keyed to `competencies` (NOT
-- `competency_standards`): employee_competencies is the only table with real
-- per-employee assessed proficiency values, and it's keyed to `competencies`.
-- competency_standards/position_competency_requirements (Basic/Intermediate/
-- Advanced) has no matching employee-side assessed data to compare against.
--
-- critical_position_training_requirements stores a free-text training_title
-- (no catalog table to FK to) to match employee_training.training_title, the
-- 201-file record of completed trainings this feature compares against.
--
-- Access: same anon-open posture as the other IPCR/RSP tables (RLS disabled,
-- grants to anon+authenticated). Enforcement is app-layer.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- ── critical_positions: new requirement columns ─────────────────────────────
ALTER TABLE critical_positions ADD COLUMN IF NOT EXISTS position_description text;
ALTER TABLE critical_positions ADD COLUMN IF NOT EXISTS required_successors_count integer NOT NULL DEFAULT 1;
ALTER TABLE critical_positions ADD COLUMN IF NOT EXISTS min_years_experience numeric(4,1);
ALTER TABLE critical_positions ADD COLUMN IF NOT EXISTS min_ipcr_rating text;
ALTER TABLE critical_positions ADD COLUMN IF NOT EXISTS required_education text;
ALTER TABLE critical_positions ADD COLUMN IF NOT EXISTS required_eligibility text;
ALTER TABLE critical_positions ADD COLUMN IF NOT EXISTS required_certifications jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE critical_positions DROP CONSTRAINT IF EXISTS critical_positions_successors_count_check;
ALTER TABLE critical_positions
  ADD CONSTRAINT critical_positions_successors_count_check CHECK (required_successors_count >= 1);

ALTER TABLE critical_positions DROP CONSTRAINT IF EXISTS critical_positions_min_ipcr_rating_check;
ALTER TABLE critical_positions
  ADD CONSTRAINT critical_positions_min_ipcr_rating_check
  CHECK (min_ipcr_rating IS NULL OR min_ipcr_rating IN
    ('Outstanding', 'Very Satisfactory', 'Satisfactory', 'Unsatisfactory', 'Poor'));

-- ── Required competencies (numeric 1-5 scale, matches employee_competencies) ─
CREATE TABLE IF NOT EXISTS critical_position_competency_requirements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  critical_position_id uuid NOT NULL REFERENCES critical_positions(id) ON DELETE CASCADE,
  competency_id        uuid NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  required_level       integer NOT NULL CHECK (required_level BETWEEN 1 AND 5),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT critical_position_competency_requirements_unique UNIQUE (critical_position_id, competency_id)
);

CREATE INDEX IF NOT EXISTS cpcr_position_idx
  ON critical_position_competency_requirements (critical_position_id);

-- ── Required trainings (free-text title, no catalog table to FK to) ─────────
CREATE TABLE IF NOT EXISTS critical_position_training_requirements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  critical_position_id uuid NOT NULL REFERENCES critical_positions(id) ON DELETE CASCADE,
  training_title       text NOT NULL,
  added_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT critical_position_training_requirements_unique UNIQUE (critical_position_id, training_title)
);

CREATE INDEX IF NOT EXISTS cptr_position_idx
  ON critical_position_training_requirements (critical_position_id);

-- ── Access — app-layer enforcement, consistent with 20260720 ────────────────
ALTER TABLE critical_position_competency_requirements DISABLE ROW LEVEL SECURITY;
ALTER TABLE critical_position_training_requirements    DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON critical_position_competency_requirements TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON critical_position_training_requirements    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON critical_positions TO anon, authenticated; -- re-grant covers new columns

NOTIFY pgrst, 'reload schema';

COMMIT;
