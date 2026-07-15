-- ============================================================================
-- Allow the Employee Portal (anon) to READ performance_cycles
-- Created: 2026-07-17
--
-- Employees/Office Accounts reach PostgREST as `anon` (no Supabase Auth). The
-- portal calls getActiveCycle() to resolve the current cycle before loading a
-- Phase 1 target_setting. performance_cycles had RLS enabled with no anon SELECT
-- policy, so anon saw ZERO rows (silently — no error), getActiveCycle returned
-- null, and "Frozen Targets" never loaded for ANY employee.
--
-- This is a read-only lookup table (cycle title + dates), not sensitive. Open
-- SELECT to anon; writes stay privileged (PM admin / service role). Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE performance_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS performance_cycles_anon_read ON performance_cycles;
CREATE POLICY performance_cycles_anon_read
  ON performance_cycles FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON performance_cycles TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
