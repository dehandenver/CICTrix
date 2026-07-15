-- ============================================================================
-- Training Calendar: anon-open posture for training_sessions + enrollments.
-- Created: 2026-07-22.
--
-- Why: training_sessions / training_enrollments were created (2026-05-18) with
-- RLS ENABLED and SELECT/ALL policies gated on `auth.jwt() ->> 'role' IN
-- ('super-admin','lnd','pm')`. This app does not mint custom role claims — a
-- signed-in user's JWT carries role = 'authenticated', and most of the app runs
-- as anon — so that predicate matches NO real user and the L&D Training Calendar
-- reads back empty even though rows exist.
--
-- Every other IPCR/RSP/L&D table the portals read was long since moved to the
-- same anon-open posture (RLS disabled, grants to anon+authenticated, app-layer
-- access gating via the already-gated portals). These two tables were simply
-- never converted. This migration brings them in line.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- Drop the role-claim policies; they can never be satisfied and would keep
-- filtering rows if RLS were ever re-enabled.
DROP POLICY IF EXISTS "Allow read access to admins, LND, and PM" ON training_sessions;
DROP POLICY IF EXISTS "Allow write access to LND and super-admin" ON training_sessions;
DROP POLICY IF EXISTS "Allow read access to admins, LND, and PM" ON training_enrollments;
DROP POLICY IF EXISTS "Allow write access to LND and super-admin" ON training_enrollments;

ALTER TABLE training_sessions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE training_enrollments DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON training_sessions    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON training_enrollments TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
