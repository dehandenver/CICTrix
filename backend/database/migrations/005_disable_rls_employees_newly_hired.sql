-- ============================================================================
-- DISABLE RLS ON employees + newly_hired
-- Allow direct frontend reads/writes for the recruitment + portal flows.
-- Created: 2026-05-01
-- Pattern matches 003_disable_rls_evaluations.sql.
-- ============================================================================

ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO authenticated, anon;

-- newly_hired may not exist on every install; guard the alter.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'newly_hired'
  ) THEN
    EXECUTE 'ALTER TABLE newly_hired DISABLE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON newly_hired TO authenticated, anon';
  END IF;
END $$;

-- Force PostgREST to refresh its schema cache so brand-new tables/columns
-- (e.g. employee_documents.status added in migration 004) become queryable
-- without restarting the API.
NOTIFY pgrst, 'reload schema';
