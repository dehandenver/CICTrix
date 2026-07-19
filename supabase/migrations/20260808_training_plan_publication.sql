-- ============================================================
-- Migration: Training Plan publication + year rollover
-- Date: 2026-08-08
-- Purpose: Turn "the whole year is planned" into a real, recorded event.
--
--   Publishing and rolling over are DELIBERATELY two separate steps, because
--   promote_training_plan_entry() refuses any entry whose plan_year has not
--   arrived (20260712_lnd_training_plan.sql, line ~144). A 2027 plan signed off
--   in July 2026 therefore cannot become Training Courses drafts for another
--   six months. Collapsing them into one action would mean either weakening
--   that guard or being unable to publish until January.
--
--     publish  -> freezes the year, closes the planning window. Nothing moves.
--     rollover -> (January onward) creates the Training Courses drafts.
--
--   Publish BLOCKS on any entry that is not Confirmed. Only Confirmed entries
--   can ever roll over, so publishing with stragglers would quietly strand
--   them. Better to refuse and name them.
--
-- Idempotent: safe to re-apply.
-- ============================================================

BEGIN;

-- ── 1. The publication record ───────────────────────────────────────────────
-- One row per published plan year. Absence of a row means "not published",
-- which is why the frontend can treat a missing table as simply unpublished.
CREATE TABLE IF NOT EXISTS training_plan_publications (
  plan_year      integer     PRIMARY KEY,
  published_at   timestamptz NOT NULL DEFAULT now(),
  published_by   text,
  entry_count    integer     NOT NULL DEFAULT 0,
  -- Non-null once the January rollover has run. Publishing is reversible right
  -- up until this is set; afterwards drafts exist downstream and unpublishing
  -- would leave the plan and Training Courses disagreeing.
  rolled_over_at timestamptz,
  rolled_over_by text,
  draft_count    integer     NOT NULL DEFAULT 0
);

-- ── 2. Publish ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION publish_training_plan(
  p_plan_year integer,
  p_actor     text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  v_total     integer;
  v_confirmed integer;
  v_unsettled text;
  v_no_dept   text;
  v_no_head   text;
BEGIN
  IF EXISTS (SELECT 1 FROM training_plan_publications WHERE plan_year = p_plan_year) THEN
    RAISE EXCEPTION 'The % plan is already published.', p_plan_year;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE plan_status = 'Confirmed')
    INTO v_total, v_confirmed
    FROM training_plan_entries WHERE plan_year = p_plan_year;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'The % plan has no entries to publish.', p_plan_year;
  END IF;

  -- Blocking check 1: every entry must be settled.
  SELECT string_agg(format('%s (%s)', title, plan_status), ', ' ORDER BY title)
    INTO v_unsettled
    FROM training_plan_entries
   WHERE plan_year = p_plan_year AND plan_status <> 'Confirmed';

  IF v_unsettled IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot publish %: these entries are not Confirmed and would never roll over — %',
      p_plan_year, v_unsettled;
  END IF;

  -- Blocking check 2: promotion requires a department (same rule the per-entry
  -- promote enforces). Catching it here beats discovering it in January.
  SELECT string_agg(title, ', ' ORDER BY title)
    INTO v_no_dept
    FROM training_plan_entries
   WHERE plan_year = p_plan_year AND target_department_id IS NULL;

  IF v_no_dept IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot publish %: these entries have no department — %', p_plan_year, v_no_dept;
  END IF;

  -- Blocking check 3: a draft with no Dept Head has nobody to review it.
  SELECT string_agg(e.title, ', ' ORDER BY e.title)
    INTO v_no_head
    FROM training_plan_entries e
   WHERE e.plan_year = p_plan_year
     AND NOT EXISTS (
       SELECT 1 FROM office_role_assignments r
        WHERE r.office_id = e.target_department_id
          AND r.role = 'DeptHead'
          AND r.status = 'Active'
     );

  IF v_no_head IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot publish %: the office for these entries has no Dept Head to review the draft — %',
      p_plan_year, v_no_head;
  END IF;

  INSERT INTO training_plan_publications (plan_year, published_by, entry_count)
  VALUES (p_plan_year, p_actor, v_confirmed);

  -- Sign-off closes the planning window, so the page's "stays open until the
  -- full plan is set and published" banner becomes literally true.
  UPDATE phase_schedules
     SET mode = 'Closed', updated_by = p_actor, updated_at = now()
   WHERE scope = 'system' AND phase = 'training_planning';

  RETURN v_confirmed;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Unpublish ────────────────────────────────────────────────────────────
-- Reversible only before rollover. Reopens the window so edits can resume.
CREATE OR REPLACE FUNCTION unpublish_training_plan(
  p_plan_year integer,
  p_actor     text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_rolled timestamptz;
BEGIN
  SELECT rolled_over_at INTO v_rolled
    FROM training_plan_publications WHERE plan_year = p_plan_year;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The % plan is not published.', p_plan_year;
  END IF;

  IF v_rolled IS NOT NULL THEN
    RAISE EXCEPTION 'The % plan has already rolled over into Training Courses and cannot be unpublished.', p_plan_year;
  END IF;

  DELETE FROM training_plan_publications WHERE plan_year = p_plan_year;

  UPDATE phase_schedules
     SET mode = 'Open', updated_by = p_actor, updated_at = now()
   WHERE scope = 'system' AND phase = 'training_planning';
END;
$$ LANGUAGE plpgsql;

-- ── 4. Rollover ─────────────────────────────────────────────────────────────
-- Delegates to promote_training_plan_entry() per entry rather than duplicating
-- the insert, so the year-arrived / department / already-promoted rules stay in
-- exactly one place. The promoted_draft_id guard makes this idempotent: a
-- partial run is safe to re-run and nothing double-promotes.
CREATE OR REPLACE FUNCTION rollover_training_plan(
  p_plan_year integer,
  p_actor     text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  v_entry   record;
  v_created integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM training_plan_publications WHERE plan_year = p_plan_year) THEN
    RAISE EXCEPTION 'The % plan must be published before it can roll over.', p_plan_year;
  END IF;

  IF p_plan_year > EXTRACT(YEAR FROM now())::int THEN
    RAISE EXCEPTION '% has not started yet; its plan cannot roll over until January.', p_plan_year;
  END IF;

  FOR v_entry IN
    SELECT id FROM training_plan_entries
     WHERE plan_year = p_plan_year
       AND plan_status = 'Confirmed'
       AND promoted_draft_id IS NULL
     ORDER BY tentative_start_date
  LOOP
    PERFORM promote_training_plan_entry(v_entry.id, p_actor);
    v_created := v_created + 1;
  END LOOP;

  UPDATE training_plan_publications
     SET rolled_over_at = COALESCE(rolled_over_at, now()),
         rolled_over_by = COALESCE(rolled_over_by, p_actor),
         draft_count    = draft_count + v_created
   WHERE plan_year = p_plan_year;

  RETURN v_created;
END;
$$ LANGUAGE plpgsql;

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
-- Anon-open, matching the other training_* tables (20260722/23/27). Role-claim
-- policies on these tables have repeatedly shipped locked against every real
-- user, leaving L&D pages silently empty.
ALTER TABLE training_plan_publications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'training_plan_publications'
       AND policyname = 'training_plan_publications_open'
  ) THEN
    CREATE POLICY training_plan_publications_open
      ON training_plan_publications FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
