-- ============================================================================
-- ALLOW EMPLOYEE IPCR WRITES
-- Disable RLS on performance_evaluations and ipcr_performance to allow employees
-- to create, read, update, and delete their own IPCR details from the frontend.
-- Created: 2026-05-20
-- ============================================================================

BEGIN;

-- Disable RLS on performance_evaluations
ALTER TABLE performance_evaluations DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON performance_evaluations TO authenticated, anon;

-- Ensure RLS is disabled on ipcr_performance and permissions are granted
ALTER TABLE ipcr_performance DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON ipcr_performance TO authenticated, anon;

-- Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';

COMMIT;
