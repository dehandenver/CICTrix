-- ============================================================
-- Migration: LND Training Plan (Spec Addendum, Page 4 revised)
-- Date: 2026-07-12
-- Purpose: Next year's tentative training calendar.
--
--   * Planning window reuses phase_schedules, which already models exactly
--     what the spec asks for: an admin-set [start_date, deadline_date] with
--     mode Auto, resolved by effectiveState(). A new phase key is cheaper and
--     more consistent than a parallel settings table.
--
--   * training_plan_entries holds Page 4's tentative events. Deliberately NOT
--     training_sessions: plan entries use a different status vocabulary
--     (Proposed/Approved/Needs Budget/Confirmed), carry provenance, and have
--     tentative dates. Mixing them into training_sessions would mean every
--     Page 3 query had to remember to exclude next year's plan.
--
--   * Promoting a Confirmed entry creates a training_course_drafts row, not a
--     session. Per the spec, every training passes through the "recommend
--     employees before it's real" step regardless of whether it originated
--     from a request, a rating, or L&D itself.
--
-- ⚠️  Run 20260711_draft_target_department_fk.sql BEFORE this migration.
-- Idempotent: safe to re-apply.
-- ============================================================

BEGIN;

-- ── 1. Planning window: a third phase key ───────────────────────────────────
ALTER TABLE phase_schedules DROP CONSTRAINT IF EXISTS phase_schedules_phase_check;
ALTER TABLE phase_schedules
  ADD CONSTRAINT phase_schedules_phase_check
  CHECK (phase IN ('target_setting','rating','training_planning'));

-- Seed the system-wide window, closed until L&D sets dates. Mode 'Auto' with
-- null dates resolves to Closed via effectiveState(), so Page 4 starts locked.
INSERT INTO phase_schedules (scope, office_id, office_name, phase, mode, start_date, deadline_date)
SELECT 'system', NULL, NULL, 'training_planning', 'Auto', NULL, NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM phase_schedules WHERE scope = 'system' AND phase = 'training_planning'
 );

-- ── 2. Recommendation feed: dismissal ───────────────────────────────────────
-- A pending training_request appears in Page 4's feed until it is either turned
-- into a plan entry or explicitly dismissed. Dismissal is reversible and keeps
-- who/when, so a request is never silently dropped.
ALTER TABLE training_requests
  ADD COLUMN IF NOT EXISTS plan_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_dismissed_by text,
  ADD COLUMN IF NOT EXISTS plan_dismiss_reason text;

-- ── 3. The plan entries ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_plan_entries (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_year            integer     NOT NULL,
  title                text        NOT NULL,
  category             text        NOT NULL,
  -- Tentative: the whole point of Page 4 is that these move.
  tentative_start_date timestamptz NOT NULL,
  tentative_end_date   timestamptz,
  instructor_name      text,
  location             text,
  objectives           text[]      NOT NULL DEFAULT '{}',
  capacity             integer     NOT NULL DEFAULT 0,
  -- Nullable while planning; required before the entry can be promoted, because
  -- a Training Courses draft has no reviewer without one.
  target_department_id uuid        REFERENCES departments(id) ON DELETE RESTRICT,
  plan_status          text        NOT NULL DEFAULT 'Proposed',
  -- Where this training came from. Drives the "recommended-from" chip.
  recommended_from     text        NOT NULL DEFAULT 'LND Planning',
  source_request_id    uuid        REFERENCES training_requests(id) ON DELETE SET NULL,
  -- Set when the entry rolls forward into the Training Courses draft step.
  promoted_draft_id    uuid        REFERENCES training_course_drafts(id) ON DELETE SET NULL,
  promoted_at          timestamptz,
  created_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_category_check') THEN
    ALTER TABLE training_plan_entries ADD CONSTRAINT training_plan_entries_category_check
      CHECK (category IN ('Cultural Transformation','Employee Development','Leadership','Technical'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_status_check') THEN
    ALTER TABLE training_plan_entries ADD CONSTRAINT training_plan_entries_status_check
      CHECK (plan_status IN ('Proposed','Approved','Needs Budget','Confirmed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_source_check') THEN
    ALTER TABLE training_plan_entries ADD CONSTRAINT training_plan_entries_source_check
      CHECK (recommended_from IN ('Training Request','Rating Suggestion','LND Planning'));
  END IF;

  -- A 'Training Request' entry that names no request cannot show its provenance.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_provenance_check') THEN
    ALTER TABLE training_plan_entries ADD CONSTRAINT training_plan_entries_provenance_check
      CHECK (recommended_from <> 'Training Request' OR source_request_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_date_range_check') THEN
    ALTER TABLE training_plan_entries ADD CONSTRAINT training_plan_entries_date_range_check
      CHECK (tentative_end_date IS NULL OR tentative_end_date >= tentative_start_date);
  END IF;
END;
$$;

-- One plan entry per training request: accepting a suggestion twice would put
-- the same request on the calendar twice and leave it in the feed's blind spot.
CREATE UNIQUE INDEX IF NOT EXISTS training_plan_entries_source_request_uniq
  ON training_plan_entries (source_request_id)
  WHERE source_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS training_plan_entries_year_idx
  ON training_plan_entries (plan_year, tentative_start_date);

-- ── 4. Promote a Confirmed entry into the Training Courses draft step ───────
CREATE OR REPLACE FUNCTION promote_training_plan_entry(
  p_entry_id uuid,
  p_actor    text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_entry training_plan_entries%ROWTYPE;
  v_draft uuid;
BEGIN
  SELECT * INTO v_entry FROM training_plan_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan entry % not found.', p_entry_id;
  END IF;

  IF v_entry.promoted_draft_id IS NOT NULL THEN
    RAISE EXCEPTION 'Plan entry "%" has already been promoted.', v_entry.title;
  END IF;

  IF v_entry.plan_status <> 'Confirmed' THEN
    RAISE EXCEPTION 'Only a Confirmed plan entry can be promoted; "%" is %.',
      v_entry.title, v_entry.plan_status;
  END IF;

  -- "Transitions to Page 3 at the start of the new year": the plan year must
  -- have actually arrived. Guards against promoting next year's plan early.
  IF v_entry.plan_year > EXTRACT(YEAR FROM now())::int THEN
    RAISE EXCEPTION 'Plan entry "%" is for %, which has not started yet.',
      v_entry.title, v_entry.plan_year;
  END IF;

  IF v_entry.target_department_id IS NULL THEN
    RAISE EXCEPTION 'Plan entry "%" needs a department before it can be promoted: a Training Courses draft has no Dept Head to review it otherwise.',
      v_entry.title;
  END IF;

  INSERT INTO training_course_drafts (
    title, category, objectives, instructor_name, start_date, end_date,
    location, capacity, target_department_id, status, created_by
  ) VALUES (
    v_entry.title, v_entry.category, v_entry.objectives, v_entry.instructor_name,
    v_entry.tentative_start_date, v_entry.tentative_end_date, v_entry.location,
    v_entry.capacity, v_entry.target_department_id, 'Draft', p_actor
  )
  RETURNING id INTO v_draft;

  UPDATE training_plan_entries
     SET promoted_draft_id = v_draft, promoted_at = now(), updated_at = now()
   WHERE id = v_entry.id;

  RETURN v_draft;
END;
$$ LANGUAGE plpgsql;

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE training_plan_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'training_plan_entries' AND policyname = 'training_plan_entries_admin_all'
  ) THEN
    CREATE POLICY training_plan_entries_admin_all ON training_plan_entries FOR ALL TO authenticated
      USING (
        (auth.jwt()->'user_metadata'->>'role') IN ('ADMIN','PM','LND')
        OR (auth.jwt()->>'role') IN ('super-admin','pm','lnd')
      )
      WITH CHECK (
        (auth.jwt()->'user_metadata'->>'role') IN ('ADMIN','PM','LND')
        OR (auth.jwt()->>'role') IN ('super-admin','pm','lnd')
      );
  END IF;
END;
$$;

COMMIT;
