-- ============================================================================
-- Training Requests: anon-open posture for training_requests.
-- Created: 2026-07-23.
--
-- Why: training_requests was created (2026-05-18) with RLS ENABLED and
-- SELECT/ALL policies gated on `auth.jwt() ->> 'role' IN
-- ('super-admin','lnd','pm')`. This app does not mint custom role claims — a
-- signed-in user's JWT carries role = 'authenticated', and most of the app runs
-- as anon — so that predicate matches NO real user and the L&D Dashboard
-- (Total training requests, category chart, competency radar, demand table)
-- reads back empty even though rows exist.
--
-- This is the same defect fixed for training_sessions / training_enrollments in
-- 20260722_training_calendar_anon_open.sql. training_requests was the last
-- table in the 2026-05-18 batch never converted; this migration brings it in
-- line with every other IPCR/RSP/L&D table (RLS disabled, grants to
-- anon+authenticated, app-layer access gating via the already-gated portals).
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- Drop the role-claim policies; they can never be satisfied and would keep
-- filtering rows if RLS were ever re-enabled.
DROP POLICY IF EXISTS "Allow read access to admins, LND, and PM" ON training_requests;
DROP POLICY IF EXISTS "Allow write access to LND and super-admin" ON training_requests;
DROP POLICY IF EXISTS "Allow employees to create training requests" ON training_requests;

ALTER TABLE training_requests DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON training_requests TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
