-- ============================================================================
-- DISABLE RLS ON EVALUATIONS TABLE
-- Allow direct inserts from frontend
-- Created: April 29, 2026
-- ============================================================================

-- Disable RLS on evaluations table to allow frontend direct inserts
ALTER TABLE evaluations DISABLE ROW LEVEL SECURITY;

-- Ensure the table has public INSERT permission
GRANT INSERT ON evaluations TO authenticated, anon;
