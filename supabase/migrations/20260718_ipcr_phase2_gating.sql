-- ============================================================================
-- IPCR Phase 2 gating: LOCKED → OPEN → SUBMITTED, per-indicator self-rating,
-- and an employee notification inbox.
-- Created: 2026-07-18. Builds on 20260715 / 20260716.
--
-- Design (confirmed with the team):
--   * Extend the EXISTING phase2_status enum rather than adding a parallel field.
--     New lifecycle for the employee's self-rating:
--       'locked'      — set the moment Phase 1 is APPROVED/frozen (default target
--                       of the backfill below). Employee sees only the notice.
--       'open'        — the Office Account fired "Open Self-Rating Period" for the
--                       employee's period (bulk). The per-indicator form appears.
--       'in_progress' — a partial self-rating save.
--       'completed'   — employee submitted (== PHASE2_SUBMITTED); read-only after.
--     'not_started' is kept for backward-compat but new approvals go to 'locked'.
--   * Per-indicator achievement text unifies onto success_indicator_ratings (the
--     same row the Office override panel uses) via a new `accomplishment` column.
--   * The OPEN transition is an explicit, audited action (who/when), plus a
--     display-only expected-open date (freeze + ~5 months) — never a silent cron.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- ── 1. Extend phase2_status vocabulary ──────────────────────────────────────
ALTER TABLE target_settings DROP CONSTRAINT IF EXISTS target_settings_phase2_status_check;
ALTER TABLE target_settings
  ADD CONSTRAINT target_settings_phase2_status_check
  CHECK (phase2_status IN ('not_started', 'locked', 'open', 'in_progress', 'completed'));

ALTER TABLE target_settings
  ADD COLUMN IF NOT EXISTS phase2_open_target_date date,   -- display-only expected open
  ADD COLUMN IF NOT EXISTS phase2_opened_at        timestamptz,
  ADD COLUMN IF NOT EXISTS phase2_opened_by        text,   -- office account username/id
  ADD COLUMN IF NOT EXISTS phase2_submitted_at     timestamptz;

-- ── 2. Per-indicator achievement text ───────────────────────────────────────
ALTER TABLE success_indicator_ratings
  ADD COLUMN IF NOT EXISTS accomplishment text;

-- ── 3. Employee notification inbox ──────────────────────────────────────────
-- No per-employee notification store existed (notifications.ts is admin-scoped,
-- ipcr_notifications is office-level). This is the employee-facing inbox the
-- Phase 2 "we will notify you" promise needs.
CREATE TABLE IF NOT EXISTS employee_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type        text NOT NULL,                 -- 'phase2_open' | ...
  title       text NOT NULL,
  message     text NOT NULL,
  period      text,
  link        text,                          -- in-app route, e.g. /employee/ipcr-workspace
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_notifications_emp_idx
  ON employee_notifications (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS employee_notifications_unread_idx
  ON employee_notifications (employee_id) WHERE NOT is_read;

-- ── 4. Backfill: every already-approved record starts LOCKED, with an expected
--      open date ~5 months after approval (display only). ─────────────────────
UPDATE target_settings
   SET phase2_status = 'locked'
 WHERE status = 'approved'
   AND phase2_status IN ('not_started');

UPDATE target_settings
   SET phase2_open_target_date = (COALESCE(approved_at, now()) + interval '5 months')::date
 WHERE status = 'approved'
   AND phase2_open_target_date IS NULL;

-- ── 5. Access — same anon-open posture as the other IPCR tables (RLS disabled),
--      so the employee portal (anon) can read/write. Enforcement is app-layer. ─
ALTER TABLE employee_notifications DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_notifications TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
