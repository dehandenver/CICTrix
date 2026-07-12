-- ============================================================================
-- IPCR Phase 2: add the CLOSED state (Office Account can close the rating window)
-- Created: 2026-07-19. Builds on 20260718.
--
--   phase2_status lifecycle now:
--     locked → open → (in_progress) → completed        (employee submits)
--                   → closed                            (office closes window)
--   'closed' is reachable from open/in_progress when the Office Account ends the
--   self-rating window before everyone submits — the employee then sees a
--   read-only view of whatever they had saved. 'completed' (submitted) records
--   are already terminal/read-only and are left as-is.
--
-- Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE target_settings DROP CONSTRAINT IF EXISTS target_settings_phase2_status_check;
ALTER TABLE target_settings
  ADD CONSTRAINT target_settings_phase2_status_check
  CHECK (phase2_status IN ('not_started', 'locked', 'open', 'in_progress', 'completed', 'closed'));

ALTER TABLE target_settings
  ADD COLUMN IF NOT EXISTS phase2_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS phase2_closed_by text;

NOTIFY pgrst, 'reload schema';

COMMIT;
