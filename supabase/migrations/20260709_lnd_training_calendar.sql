-- ============================================================
-- Migration: LND Training Calendar (Spec Addendum, Page 3)
-- Date: 2026-07-09
-- Purpose: Make training_sessions the single source of truth for
--          the current-year Training Calendar, and training_enrollments
--          the single source of truth for the attendee roster.
--
--          Page 3 requires per-event: title, category (4 fixed),
--          multi-day start/end, speaker, location, objectives,
--          status, and a read-only roster with an attendance
--          checklist (Present/Absent/Excused).
--
-- Idempotent: safe to re-apply.
-- ============================================================

BEGIN;

-- ── 1. training_sessions: allow standalone events ────────────────────────────
-- A mandatory all-staff session is a direct current-year add by L&D that never
-- passes through Training Courses, so it has no parent program.
ALTER TABLE training_sessions
  ALTER COLUMN program_id DROP NOT NULL;

-- ── 2. training_sessions: Page 3 event fields ────────────────────────────────
-- speaker/facilitator already exists as instructor_name (20260705 migration).
ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS end_date timestamptz,
  ADD COLUMN IF NOT EXISTS objectives text[] NOT NULL DEFAULT '{}',
  -- Set when Seminar Enrollment finalizes the roster; until then the calendar
  -- shows the event as not-yet-enrolled rather than showing an empty roster.
  ADD COLUMN IF NOT EXISTS roster_finalized_at timestamptz;

-- Categories are locked to the four that the Page 1 dashboard assigns colors to,
-- so an event chip means the same thing on every LnD page.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_category_check'
  ) THEN
    ALTER TABLE training_sessions
      ADD CONSTRAINT training_sessions_category_check
      CHECK (category IS NULL OR category IN (
        'Cultural Transformation','Employee Development','Leadership','Technical'
      ));
  END IF;
END;
$$;

-- end_date is optional (single-day events); when present it must not precede start.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_date_range_check'
  ) THEN
    ALTER TABLE training_sessions
      ADD CONSTRAINT training_sessions_date_range_check
      CHECK (end_date IS NULL OR end_date >= scheduled_date);
  END IF;
END;
$$;

-- ── 3. training_sessions: status vocabulary per Page 3 ───────────────────────
-- Was ('Upcoming','Completed','Cancelled'); Page 3 specifies
-- Scheduled / Ongoing / Completed / Cancelled.
ALTER TABLE training_sessions ALTER COLUMN status DROP DEFAULT;
ALTER TABLE training_sessions DROP CONSTRAINT IF EXISTS training_sessions_status_check;

UPDATE training_sessions SET status = 'Scheduled' WHERE status = 'Upcoming';

ALTER TABLE training_sessions
  ADD CONSTRAINT training_sessions_status_check
  CHECK (status IN ('Scheduled','Ongoing','Completed','Cancelled'));

ALTER TABLE training_sessions ALTER COLUMN status SET DEFAULT 'Scheduled';

-- The calendar always queries a single year's window, ordered by start.
CREATE INDEX IF NOT EXISTS training_sessions_scheduled_date_idx
  ON training_sessions (scheduled_date);

-- ── 4. training_enrollments: roster confirmation state ───────────────────────
-- `status` (Enrolled/Completed/Dropped) tracks the training lifecycle.
-- `enrollment_status` tracks whether L&D has confirmed the seat, which is what
-- Seminar Enrollment edits and what the calendar roster displays.
-- attendance_status (Present/Absent/Excused) already exists (20260705 migration).
ALTER TABLE training_enrollments
  ADD COLUMN IF NOT EXISTS enrollment_status text NOT NULL DEFAULT 'Confirmed',
  ADD COLUMN IF NOT EXISTS added_by text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_enrollment_status_check'
  ) THEN
    ALTER TABLE training_enrollments
      ADD CONSTRAINT training_enrollments_enrollment_status_check
      CHECK (enrollment_status IN ('Confirmed','Pending'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS training_enrollments_session_id_idx
  ON training_enrollments (session_id);

COMMIT;
