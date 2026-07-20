-- ============================================================================
-- Phase 2: record when a Department Head APPROVES a rating.
-- Created: 2026-08-11.
--
-- The Office Account's "Approve & Complete Rating" button appeared to do
-- nothing: the sheet stayed in the pending list and the button stayed live,
-- even though the approval had in fact been written.
--
-- Cause: listPendingRatingApprovals selects target_settings with
-- phase2_status = 'completed', but BOTH sides write that same value —
--   * the employee submitting their Phase 2 accomplishments, and
--   * the Department Head approving the rating.
-- Approving therefore could not change the condition the list filters on. The
-- only thing that removed a sheet was a best-effort ipcr_submissions stage
-- write wrapped in a try/catch that swallows failures, so whenever that side
-- write didn't land the sheet reappeared forever.
--
-- These columns make the approval an explicit, durable fact on the row itself,
-- independent of the submission pipeline.
--
-- Backfill marks only rows with positive evidence that a rater already
-- finalized them — either the submission pipeline recorded the hand-off, or a
-- rater overrode the employee's self-rating. Anything without evidence is left
-- pending rather than guessed at; a Department Head re-approving it costs one
-- click and is the safe direction to be wrong in.
--
-- Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE target_settings ADD COLUMN IF NOT EXISTS phase2_approved_at timestamptz;
ALTER TABLE target_settings ADD COLUMN IF NOT EXISTS phase2_approved_by uuid;

CREATE INDEX IF NOT EXISTS target_settings_phase2_approved_at_idx
  ON target_settings (phase2_approved_at);

-- ── Backfill: pipeline already recorded the hand-off to PM ──────────────────
UPDATE target_settings ts
   SET phase2_approved_at = COALESCE(ts.phase2_completed_at, ts.updated_at, now())
 WHERE ts.phase2_approved_at IS NULL
   AND ts.phase2_status = 'completed'
   AND EXISTS (
     SELECT 1
       FROM ipcr_submissions s
      WHERE s.employee_id = ts.employee_id
        AND s.phase = 'rating'
        AND s.stage = 'Forwarded to PM'
   );

-- ── Backfill: a rater overrode the employee's self-rating ───────────────────
UPDATE target_settings ts
   SET phase2_approved_at = COALESCE(ts.phase2_completed_at, ts.updated_at, now()),
       phase2_approved_by = ev.overridden_by
  FROM (
    SELECT m.target_setting_id, MAX(r.overridden_by::text)::uuid AS overridden_by
      FROM mfos m
      JOIN success_indicators si ON si.mfo_id = m.id
      JOIN success_indicator_ratings r ON r.success_indicator_id = si.id
     WHERE r.overridden_by IS NOT NULL
     GROUP BY m.target_setting_id
  ) ev
 WHERE ev.target_setting_id = ts.id
   AND ts.phase2_approved_at IS NULL
   AND ts.phase2_status = 'completed';

GRANT SELECT, INSERT, UPDATE, DELETE ON target_settings TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
