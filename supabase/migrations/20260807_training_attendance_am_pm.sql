-- ============================================================================
-- Split per-day training attendance into morning and afternoon sessions.
-- Created: 2026-08-07.
--
-- 20260731 recorded one row per (enrollment, day). Attendance is actually taken
-- twice a day, so a half-day absence was unrepresentable: an attendee who came
-- in the morning and left at lunch had to be recorded as wholly Present or
-- wholly Absent.
--
-- Adds `session` ('AM' | 'PM') and widens the uniqueness to
-- (enrollment, day, session).
--
-- Existing rows are backfilled as the MORNING record and a matching AFTERNOON
-- row is inserted with the same status, so no day loses its marking and no day
-- silently becomes half-unmarked. That is the conservative reading: the old
-- single value described the whole day.
--
-- Idempotent: safe to re-apply.
-- ============================================================================

BEGIN;

ALTER TABLE training_attendance_days
  ADD COLUMN IF NOT EXISTS session text;

-- Existing rows describe the whole day; treat the stored one as the morning.
UPDATE training_attendance_days SET session = 'AM' WHERE session IS NULL;

-- Drop the per-day uniqueness BEFORE inserting the afternoon rows. A PM row
-- shares (enrollment_id, day_date) with its own AM row, so with the old
-- constraint still in place the very first insert collides with the row it was
-- copied from.
ALTER TABLE training_attendance_days
  DROP CONSTRAINT IF EXISTS training_attendance_days_enrollment_id_day_date_key;
-- Belt and braces: if the uniqueness exists as a plain index rather than a
-- table constraint, DROP CONSTRAINT above is a no-op and this catches it.
DROP INDEX IF EXISTS training_attendance_days_enrollment_id_day_date_key;

-- Give every AM row a matching PM row carrying the same status, so a day that
-- was marked stays fully marked.
INSERT INTO training_attendance_days (enrollment_id, day_date, session, status, excuse_note, updated_by)
SELECT a.enrollment_id, a.day_date, 'PM', a.status, a.excuse_note, a.updated_by
FROM training_attendance_days a
WHERE a.session = 'AM'
  AND NOT EXISTS (
    SELECT 1 FROM training_attendance_days b
    WHERE b.enrollment_id = a.enrollment_id
      AND b.day_date = a.day_date
      AND b.session = 'PM'
  );

ALTER TABLE training_attendance_days
  ALTER COLUMN session SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_attendance_days_session_check'
  ) THEN
    ALTER TABLE training_attendance_days
      ADD CONSTRAINT training_attendance_days_session_check CHECK (session IN ('AM','PM'));
  END IF;
END $$;

-- Per-half-day uniqueness, replacing the per-day constraint dropped above.
CREATE UNIQUE INDEX IF NOT EXISTS training_attendance_days_enrollment_day_session_idx
  ON training_attendance_days (enrollment_id, day_date, session);

NOTIFY pgrst, 'reload schema';

COMMIT;
