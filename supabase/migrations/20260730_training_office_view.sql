-- ============================================================================
-- Office Account training view: LND-change notification tag (§3 / §4).
-- Created: 2026-07-30.
--
-- The Office Account "Training Courses" page lists every training system-wide,
-- read-only. When L&D edits a training after a department head last looked at
-- it, the office view surfaces an inline "Updated by L&D" tag until the head
-- opens the training again.
--
--   * updated_at            — bumped by the L&D calendar edit path (app-side, so
--                             only genuine content edits count, not roster/status
--                             churn). NULL for never-edited trainings.
--   * last_viewed_by_office — set to now() when a department head opens the
--                             training's detail drawer. NULL until first viewed.
--
-- The tag shows when updated_at > last_viewed_by_office (with NULLs treated as
-- "never"), computed in the app.
--
-- Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz,
  ADD COLUMN IF NOT EXISTS last_viewed_by_office timestamptz;

NOTIFY pgrst, 'reload schema';

COMMIT;
