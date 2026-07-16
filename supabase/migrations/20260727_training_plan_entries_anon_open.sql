-- ============================================================================
-- Training Plan Entries: anon-open posture for training_plan_entries.
-- Created: 2026-07-27.
--
-- Why: training_plan_entries was created (2026-07-12) with RLS ENABLED and an
-- ALL policy gated on `auth.jwt() ->> 'role' IN ('super-admin','pm','lnd')` (and
-- a user_metadata variant). This app does not mint those role claims — a
-- signed-in user's JWT carries role = 'authenticated', and most of the app runs
-- as anon — so the policy matches NO real user: Page 4 (Training Plan) reads
-- back empty and any write (including the L&D "Approve → add to next year's
-- plan" action on Page 5) is rejected.
--
-- Same defect and same fix as 20260722_training_calendar_anon_open.sql and
-- 20260723_training_requests_anon_open.sql. Brings training_plan_entries in
-- line with every other IPCR/RSP/L&D table (RLS disabled, grants to
-- anon+authenticated, app-layer access gating via the already-gated portals).
--
-- Idempotent.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS training_plan_entries_admin_all ON training_plan_entries;

ALTER TABLE training_plan_entries DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON training_plan_entries TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
