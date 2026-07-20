-- ============================================================================
-- Migration: Seminar Enrollment pipeline (batches, finalize/publish, audit)
-- Date: 2026-08-11
--
-- Extends the EXISTING training_recommendations pipeline rather than adding a
-- parallel seminar_recommendation table. The spec's proposed statuses map onto
-- what is already there:
--
--   spec                    existing
--   ----------------------  --------------------------------
--   recommended             SUGGESTED
--   accepted                LND_APPROVED
--   rejected                DISMISSED
--   sent_to_office          LND_APPROVED (now carries a batch_id)
--   returned_to_lnd         OFFICE_FINALIZED
--   enrolled                ENROLLED
--   finalized               FINALIZED   ← new
--   published               PUBLISHED   ← new
--
-- Two tables for one concept would mean two office queues to keep in sync, so
-- the two genuinely new end states are added here instead.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- ── 1. The two new end states ───────────────────────────────────────────────
-- ENROLLED → FINALIZED locks the roster; FINALIZED → PUBLISHED exposes it to
-- employees. There is deliberately no transition back out of PUBLISHED.
ALTER TABLE training_recommendations DROP CONSTRAINT IF EXISTS training_recommendations_status_check;
ALTER TABLE training_recommendations
  ADD CONSTRAINT training_recommendations_status_check
  CHECK (status IN (
    'SUGGESTED', 'LND_APPROVED', 'OFFICE_ADDED', 'OFFICE_FINALIZED',
    'ENROLLED', 'DISMISSED', 'ACCEPTED', 'FINALIZED', 'PUBLISHED'
  ));

-- ── 2. Batches ──────────────────────────────────────────────────────────────
-- One "Send to Office Account" action may cover several courses at once, so a
-- batch is the unit of handoff and a course is a group inside it.
CREATE TABLE IF NOT EXISTS seminar_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by      text,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  returned_at  timestamptz,
  returned_by  text,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE training_recommendations
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES seminar_batches(id) ON DELETE SET NULL,
  -- Preserves whether a name came from the AI pass or a department head, which
  -- is what lets L&D see what the office changed.
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ai_recommended',
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE training_recommendations DROP CONSTRAINT IF EXISTS training_recommendations_source_check;
ALTER TABLE training_recommendations
  ADD CONSTRAINT training_recommendations_source_check
  CHECK (source IN ('ai_recommended', 'office_account_added'));

CREATE INDEX IF NOT EXISTS idx_training_recommendations_batch
  ON training_recommendations (batch_id);
CREATE INDEX IF NOT EXISTS idx_training_recommendations_status
  ON training_recommendations (status);

-- ── 3. Audit trail for every office change ──────────────────────────────────
-- Who added or removed whom, from which department, and why. L&D reads this on
-- the "Returned" subtab to see exactly what the office changed.
CREATE TABLE IF NOT EXISTS seminar_recommendation_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid REFERENCES training_recommendations(id) ON DELETE CASCADE,
  session_id        uuid REFERENCES training_sessions(id) ON DELETE CASCADE,
  employee_id       uuid REFERENCES employees(id) ON DELETE CASCADE,
  action            text NOT NULL CHECK (action IN ('added', 'removed')),
  reason            text,
  actor             text,
  actor_department  text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seminar_rec_events_session
  ON seminar_recommendation_events (session_id);

-- A removal must say why. Mirrors the training_enrollments rule below so the
-- two halves of the flow cannot disagree about what an audit trail requires.
ALTER TABLE seminar_recommendation_events DROP CONSTRAINT IF EXISTS seminar_rec_events_removal_reason_check;
ALTER TABLE seminar_recommendation_events
  ADD CONSTRAINT seminar_rec_events_removal_reason_check
  CHECK (action <> 'removed' OR coalesce(btrim(reason), '') <> '');

-- ── 4. Department heads may now remove — with a reason ──────────────────────
-- Previously a Dept Head could not remove from a draft-originated roster at all;
-- removals had to go back through Training Courses, because that was the only
-- path that forced a reason to be recorded. The office now reviews its own
-- roster directly, so the restriction is relaxed to what actually protects the
-- trail: the reason itself, which stays mandatory for every role.
--
-- The hard-DELETE block (trg_block_draft_roster_delete) is intentionally left in
-- place — deactivation is the audited path, a DELETE erases the row entirely.
CREATE OR REPLACE FUNCTION enforce_roster_removal_origin()
RETURNS trigger AS $$
BEGIN
  -- Only deactivations are policed; adds and edits pass through.
  IF OLD.is_active AND NOT NEW.is_active THEN
    IF coalesce(btrim(NEW.removed_reason), '') = '' THEN
      RAISE EXCEPTION 'A removal reason is required when removing an attendee.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 5. A published roster is final ──────────────────────────────────────────
-- No unpublish exists in the UI; this makes that a database guarantee rather
-- than a convention a future caller could forget.
CREATE OR REPLACE FUNCTION block_published_recommendation_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'PUBLISHED' AND NEW.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION
      'This roster is published and cannot be reopened (recommendation %).', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_published_recommendation_change ON training_recommendations;
CREATE TRIGGER trg_block_published_recommendation_change
  BEFORE UPDATE ON training_recommendations
  FOR EACH ROW EXECUTE FUNCTION block_published_recommendation_change();

-- ── 6. Anon-open, consistent with the rest of the training_* tables ─────────
ALTER TABLE seminar_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE seminar_recommendation_events DISABLE ROW LEVEL SECURITY;
GRANT ALL ON seminar_batches TO anon, authenticated, service_role;
GRANT ALL ON seminar_recommendation_events TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
