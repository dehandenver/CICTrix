-- ============================================================================
-- L&D Archive — attendance percentage + optional calendar link.
-- Created: 2026-08-30.
--
-- The L&D Training Archive is switching its completion metric from "hours" to an
-- attendance PERCENTAGE, and its classification from a generic Category
-- (employee_training.training_type) to a Type of Competency (the
-- employee_training_competencies join added by migration 20260828).
--
-- Attendance is hybrid:
--   - When a record is linked to a calendar enrollment (enrollment_id), the
--     archive computes attendance live from the AM/PM training_attendance_days
--     slots — the same half-day model the calendar already uses.
--   - Historical records with no calendar link fall back to the seeded
--     attendance_percentage column (populated by
--     scripts/tag-employee-training-competencies.mjs, Pass B).
--   So once a historical record is later linked, the live computation takes over
--   and the stored value is simply ignored.
--
-- number_of_hours is deliberately LEFT IN PLACE: succession scoring
-- (src/lib/api/succession.ts scoreTraining + the training-hours gate) still
-- reads it. This migration only stops the ARCHIVE from surfacing hours; it does
-- not drop the column.
--
-- Prerequisite: migration 20260828 (employee_training_competencies) must already
-- be applied — that is where the Type-of-Competency tags live.
--
-- Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE employee_training
  ADD COLUMN IF NOT EXISTS attendance_percentage numeric(5,2)
    CHECK (attendance_percentage BETWEEN 0 AND 100);

-- Optional link to the calendar enrollment this record corresponds to. NULL for
-- historical records (they read the seeded attendance_percentage instead). ON
-- DELETE SET NULL so removing a calendar enrollment never deletes archive history
-- — it just drops back to the stored percentage.
ALTER TABLE employee_training
  ADD COLUMN IF NOT EXISTS enrollment_id uuid
    REFERENCES training_enrollments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employee_training_enrollment
  ON employee_training (enrollment_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
