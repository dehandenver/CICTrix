-- ============================================================================
-- Succession Planning: Training gate + per-position weight overrides.
-- Created: 2026-08-18.
--
-- Extends critical_positions (migration 20260809_critical_position_requirements)
-- with two new gate/scoring configuration columns:
--
--   required_training_hours      — minimum TOTAL completed-training hours an
--                                  employee must have on file to pass the
--                                  Stage 1 eligibility gate for this position.
--                                  NULL = no hours floor (gate always passes
--                                  on this criterion).
--
--   required_training_categories — one or more training category labels an
--                                  employee must have at least one completed
--                                  training in. Examples: ["Leadership",
--                                  "Technical", "Supervisory/Managerial",
--                                  "Values and Ethics"]. Empty/null = no
--                                  category gate.
--
--   succession_weights           — optional per-position override of the four
--                                  readiness-scoring weights (ipcr, training,
--                                  education, eligibility).  Must sum to 100
--                                  when provided; null = use global defaults
--                                  (IPCR 35, Training 30, Education 20,
--                                  Eligibility 15). Stored as JSONB so the
--                                  schema doesn't need to change when a new
--                                  weight key is added.
--
-- Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE critical_positions
  ADD COLUMN IF NOT EXISTS required_training_hours    numeric(6,1),
  ADD COLUMN IF NOT EXISTS required_training_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS succession_weights         jsonb;

-- Soft constraint: if weights are provided they must sum to 100
-- (enforced at the application layer; a CHECK on jsonb arithmetic is brittle).
COMMENT ON COLUMN critical_positions.required_training_hours IS
  'Minimum total completed-training hours required to pass the Stage 1 gate for this position. NULL = no floor.';
COMMENT ON COLUMN critical_positions.required_training_categories IS
  'Training category labels (e.g. ["Leadership","Technical"]) the employee must have at least one completed training in. Empty array = no category gate.';
COMMENT ON COLUMN critical_positions.succession_weights IS
  'Optional per-position weight overrides: {"ipcr":N,"training":N,"education":N,"eligibility":N} summing to 100. NULL = use global defaults.';

-- Re-grant in case table grants were not inherited by new columns (Supabase PG).
GRANT SELECT, INSERT, UPDATE, DELETE ON critical_positions TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
