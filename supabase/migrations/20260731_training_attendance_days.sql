-- ============================================================================
-- Per-day training attendance (§5).
-- Created: 2026-07-31.
--
-- The base training_enrollments.attendance_status is a single value per
-- attendee; §5 needs Present/Absent/Excused per attendee PER TRAINING DAY, so a
-- multi-day training records attendance for each day. One row per
-- (enrollment, day). An 'Excused' day requires a note, enforced by a check so
-- an excuse can never be blank.
--
-- Marking is only meaningful once a day has passed; that "day must have started"
-- rule is enforced in the app (the grid disables future-day cells), not here, so
-- back-dated corrections stay possible.
--
-- Access: anon-open like the other L&D tables (see [[project-training-tables-rls-bug]]).
--
-- Idempotent.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS training_attendance_days (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES training_enrollments(id) ON DELETE CASCADE,
  day_date      date NOT NULL,
  -- NULL = not yet marked.
  status        text CHECK (status IN ('Present','Absent','Excused')),
  excuse_note   text,
  updated_by    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, day_date),
  -- An excused day must carry a non-blank note; any other status must not.
  CONSTRAINT training_attendance_excuse_note CHECK (
    status IS DISTINCT FROM 'Excused' OR (excuse_note IS NOT NULL AND length(btrim(excuse_note)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS training_attendance_days_enrollment_idx
  ON training_attendance_days (enrollment_id);

ALTER TABLE training_attendance_days DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON training_attendance_days TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
