-- ============================================================
-- Migration: LND Training Pipeline (Spec Addendum, Pages "Training
--            Courses" + "Seminar Enrollment")
-- Date: 2026-07-10
-- Purpose: Persist the two-stage pipeline that feeds the Training
--          Calendar (Page 3):
--
--            Training Courses  : LND drafts a training + a recommended
--                                employee list, sends it to the Dept Head,
--                                who returns it. Every add/remove carries a
--                                mandatory reason. On Finalize the draft
--                                materializes a training_sessions row and
--                                seeds training_enrollments.
--
--            Seminar Enrollment: LND builds/checks the roster, sends it to
--                                the Dept Head to confirm, finalizes, and
--                                re-sends for final approval. On approval
--                                roster_finalized_at is stamped, which is
--                                what makes the roster appear on Page 3.
--
-- ⚠️  Run 20260709_lnd_training_calendar.sql BEFORE this migration.
-- Idempotent: safe to re-apply.
-- ============================================================

BEGIN;

-- ── 1. Training Courses: the draft ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_course_drafts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text        NOT NULL,
  category          text        NOT NULL,
  description       text,
  objectives        text[]      NOT NULL DEFAULT '{}',
  instructor_name   text,
  instructor_title  text,
  start_date        timestamptz,
  end_date          timestamptz,
  location          text,
  capacity          integer     NOT NULL DEFAULT 0,
  -- The office whose Dept Head reviews this draft.
  target_department text,
  status            text        NOT NULL DEFAULT 'Draft',
  -- Free-text note the Dept Head attaches when returning the draft.
  return_note       text,
  sent_at           timestamptz,
  returned_at       timestamptz,
  finalized_at      timestamptz,
  -- Set on Finalize: the training_sessions row this draft produced.
  session_id        uuid        REFERENCES training_sessions(id) ON DELETE SET NULL,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_drafts_category_check') THEN
    ALTER TABLE training_course_drafts
      ADD CONSTRAINT training_course_drafts_category_check
      CHECK (category IN ('Cultural Transformation','Employee Development','Leadership','Technical'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_drafts_status_check') THEN
    ALTER TABLE training_course_drafts
      ADD CONSTRAINT training_course_drafts_status_check
      CHECK (status IN ('Draft','Sent to Dept Head','Returned','Finalized'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_drafts_date_range_check') THEN
    ALTER TABLE training_course_drafts
      ADD CONSTRAINT training_course_drafts_date_range_check
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
  END IF;
END;
$$;

-- ── 2. Training Courses: the recommended employee list ───────────────────────
-- Current state of each recommended employee. Removals are recorded as
-- 'Excluded' rather than deleted, so the reasoned trail survives.
CREATE TABLE IF NOT EXISTS training_course_draft_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id    uuid        NOT NULL REFERENCES training_course_drafts(id) ON DELETE CASCADE,
  employee_id uuid        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  state       text        NOT NULL DEFAULT 'Included',
  -- Mandatory per-row justification for the row's current state.
  reason      text        NOT NULL,
  actor_role  text        NOT NULL,
  actor_name  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (draft_id, employee_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_members_state_check') THEN
    ALTER TABLE training_course_draft_members
      ADD CONSTRAINT training_course_draft_members_state_check
      CHECK (state IN ('Included','Excluded'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_members_actor_check') THEN
    ALTER TABLE training_course_draft_members
      ADD CONSTRAINT training_course_draft_members_actor_check
      CHECK (actor_role IN ('LND','DeptHead'));
  END IF;

  -- A blank reason is the same as no reason.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_members_reason_check') THEN
    ALTER TABLE training_course_draft_members
      ADD CONSTRAINT training_course_draft_members_reason_check
      CHECK (btrim(reason) <> '');
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS training_course_draft_members_draft_id_idx
  ON training_course_draft_members (draft_id);

-- ── 3. Training Courses: append-only audit of every add/remove ───────────────
CREATE TABLE IF NOT EXISTS training_course_draft_member_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id    uuid        NOT NULL REFERENCES training_course_drafts(id) ON DELETE CASCADE,
  employee_id uuid        NOT NULL,
  action      text        NOT NULL,
  reason      text        NOT NULL,
  actor_role  text        NOT NULL,
  actor_name  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_member_events_action_check') THEN
    ALTER TABLE training_course_draft_member_events
      ADD CONSTRAINT training_course_draft_member_events_action_check
      CHECK (action IN ('Added','Removed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_member_events_reason_check') THEN
    ALTER TABLE training_course_draft_member_events
      ADD CONSTRAINT training_course_draft_member_events_reason_check
      CHECK (btrim(reason) <> '');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_member_events_actor_check') THEN
    ALTER TABLE training_course_draft_member_events
      ADD CONSTRAINT training_course_draft_member_events_actor_check
      CHECK (actor_role IN ('LND','DeptHead'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS training_course_draft_member_events_draft_id_idx
  ON training_course_draft_member_events (draft_id, created_at DESC);

-- ── 4. Seminar Enrollment: roster workflow on training_sessions ──────────────
ALTER TABLE training_sessions
  -- Non-null => this roster originated from a finalized Training Courses draft,
  -- which is what makes Dept Head removals illegal (see the trigger in §6).
  ADD COLUMN IF NOT EXISTS source_draft_id     uuid REFERENCES training_course_drafts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS roster_status       text NOT NULL DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS roster_sent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS roster_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS roster_approved_at  timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_roster_status_check') THEN
    ALTER TABLE training_sessions
      ADD CONSTRAINT training_sessions_roster_status_check
      CHECK (roster_status IN (
        'Draft','Sent to Dept Head','Dept Head Confirmed','Pending Final Approval','Approved'
      ));
  END IF;
END;
$$;

-- ── 5. Seminar Enrollment: enrollment provenance + soft removal ──────────────
-- Removals are soft so that "who removed whom, and why" is never lost.
ALTER TABLE training_enrollments
  ADD COLUMN IF NOT EXISTS added_by_role   text,
  ADD COLUMN IF NOT EXISTS is_active       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS removed_reason  text,
  ADD COLUMN IF NOT EXISTS removed_by_role text,
  ADD COLUMN IF NOT EXISTS removed_at      timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_added_by_role_check') THEN
    ALTER TABLE training_enrollments
      ADD CONSTRAINT training_enrollments_added_by_role_check
      CHECK (added_by_role IS NULL OR added_by_role IN ('LND','DeptHead'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_removed_by_role_check') THEN
    ALTER TABLE training_enrollments
      ADD CONSTRAINT training_enrollments_removed_by_role_check
      CHECK (removed_by_role IS NULL OR removed_by_role IN ('LND','DeptHead'));
  END IF;
END;
$$;

-- ── 6. The rule, enforced in the database ────────────────────────────────────
-- A roster that came from a Training Courses draft carries a reasoned audit
-- trail. The Dept Head may ADD to it in Seminar Enrollment, but may not REMOVE
-- from it — a removal has to go back through Training Courses, where a reason is
-- mandatory. A roster built directly in Seminar Enrollment has no such trail, so
-- the Dept Head may add and remove freely.
--
-- This lives in the DB, not just the API, so the asymmetry cannot be bypassed by
-- a future caller that forgets to check.
CREATE OR REPLACE FUNCTION enforce_roster_removal_origin()
RETURNS trigger AS $$
DECLARE
  v_source_draft_id uuid;
BEGIN
  -- Only deactivations are policed; adds and edits pass through.
  IF OLD.is_active AND NOT NEW.is_active THEN
    SELECT source_draft_id INTO v_source_draft_id
      FROM training_sessions WHERE id = NEW.session_id;

    IF v_source_draft_id IS NOT NULL AND NEW.removed_by_role = 'DeptHead' THEN
      RAISE EXCEPTION
        'Dept Head cannot remove an attendee from a roster that originated from a Training Courses draft (session %). Removals must go back through Training Courses so the reasoned audit trail is preserved.',
        NEW.session_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF coalesce(btrim(NEW.removed_reason), '') = '' THEN
      RAISE EXCEPTION 'A removal reason is required when removing an attendee.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_roster_removal_origin ON training_enrollments;
CREATE TRIGGER trg_enforce_roster_removal_origin
  BEFORE UPDATE ON training_enrollments
  FOR EACH ROW EXECUTE FUNCTION enforce_roster_removal_origin();

-- Hard DELETEs would sidestep the trigger entirely, so block them on
-- draft-originated rosters. Direct rosters may still be hard-deleted.
CREATE OR REPLACE FUNCTION block_draft_roster_delete()
RETURNS trigger AS $$
DECLARE
  v_source_draft_id uuid;
BEGIN
  SELECT source_draft_id INTO v_source_draft_id
    FROM training_sessions WHERE id = OLD.session_id;

  IF v_source_draft_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Attendees of a draft-originated roster cannot be deleted; deactivate them via Training Courses instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_draft_roster_delete ON training_enrollments;
CREATE TRIGGER trg_block_draft_roster_delete
  BEFORE DELETE ON training_enrollments
  FOR EACH ROW EXECUTE FUNCTION block_draft_roster_delete();

-- ── 7. Finalize, atomically ─────────────────────────────────────────────────
-- Finalizing a draft has to create the session, seed its enrollments, and mark
-- the draft Finalized as one unit. Doing it as three client round-trips can
-- strand a session with no roster if the middle call fails, so it lives here.
CREATE OR REPLACE FUNCTION finalize_training_course_draft(
  p_draft_id uuid,
  p_actor    text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_draft   training_course_drafts%ROWTYPE;
  v_session uuid;
BEGIN
  SELECT * INTO v_draft FROM training_course_drafts WHERE id = p_draft_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft % not found.', p_draft_id;
  END IF;

  IF v_draft.status = 'Finalized' THEN
    RAISE EXCEPTION 'Draft "%" is already finalized.', v_draft.title;
  END IF;

  -- Finalizing straight from 'Draft' would skip Dept Head review entirely.
  IF v_draft.status <> 'Returned' THEN
    RAISE EXCEPTION 'Draft "%" must be returned by the Dept Head before it can be finalized (current status: %).',
      v_draft.title, v_draft.status;
  END IF;

  IF v_draft.start_date IS NULL THEN
    RAISE EXCEPTION 'Draft "%" needs a start date before it can be finalized.', v_draft.title;
  END IF;

  INSERT INTO training_sessions (
    program_id, title, category, scheduled_date, end_date, instructor_name,
    location, capacity, objectives, status, source_draft_id, roster_status
  ) VALUES (
    NULL, v_draft.title, v_draft.category, v_draft.start_date, v_draft.end_date,
    v_draft.instructor_name, v_draft.location, v_draft.capacity, v_draft.objectives,
    'Scheduled', v_draft.id, 'Draft'
  )
  RETURNING id INTO v_session;

  -- Only the employees still Included make it onto the roster; the Excluded rows
  -- stay behind in the draft as the audit trail for why they are not here.
  INSERT INTO training_enrollments (
    employee_id, session_id, status, enrollment_status, added_by, added_by_role, is_active
  )
  SELECT m.employee_id, v_session, 'Enrolled', 'Pending', p_actor, 'LND', true
    FROM training_course_draft_members m
   WHERE m.draft_id = v_draft.id AND m.state = 'Included'
  ON CONFLICT (employee_id, session_id) DO NOTHING;

  UPDATE training_course_drafts
     SET status = 'Finalized', finalized_at = now(), session_id = v_session, updated_at = now()
   WHERE id = v_draft.id;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql;

-- ── 8. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE training_course_drafts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_course_draft_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_course_draft_member_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'training_course_drafts',
    'training_course_draft_members',
    'training_course_draft_member_events'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_admin_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
        t || '_admin_all', t,
        '(auth.jwt()->''user_metadata''->>''role'') IN (''ADMIN'',''PM'',''LND'') OR (auth.jwt()->>''role'') IN (''super-admin'',''pm'',''lnd'')',
        '(auth.jwt()->''user_metadata''->>''role'') IN (''ADMIN'',''PM'',''LND'') OR (auth.jwt()->>''role'') IN (''super-admin'',''pm'',''lnd'')'
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;
