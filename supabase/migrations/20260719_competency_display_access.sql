-- ============================================================================
-- Competency Framework: make AI assessment results visible to the app
--
-- Verified against the live database (2026-07-19):
--   - employee_competencies and competencies return 0 rows to the anon key but
--     full data to the service role — RLS is enabled with no anon policy, so
--     the Competency Details modal always shows "No competency records found"
--     even though the backend writes rows. These tables never received the
--     anon-open posture the other IPCR/L&D tables use (RLS disabled + grants,
--     see 20260724_ipcr_training_recommendations.sql).
--   - training_recommendations_uniq is a plain UNIQUE, so NULL source_cycle_id
--     rows (the AI competency-gap path) never conflict and every regeneration
--     duplicates them.
--   - proficiency_level is NOT NULL, which blocks storing "required for the
--     position but never demonstrated in IPCR" rows (proficiency NULL) that
--     the gap view needs. The existing 1–5 CHECK passes NULL by SQL semantics,
--     so only the NOT NULL must go.
--
-- Run this in the Supabase SQL editor (no direct Postgres access available).
-- Idempotent — safe to re-run.
-- ============================================================================

BEGIN;

-- 1) Browser-readable score tables (app-layer auth, same posture as the other
--    IPCR tables; writes stay service-role-only).
ALTER TABLE employee_competencies DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON employee_competencies TO anon, authenticated;

ALTER TABLE competencies DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON competencies TO anon, authenticated;

-- 2) Allow NULL proficiency: a row with required_level set and
--    proficiency_level NULL means "required but not yet demonstrated" (a gap).
ALTER TABLE employee_competencies ALTER COLUMN proficiency_level DROP NOT NULL;

-- 3) training_recommendations: make NULL-cycle upserts conflict properly.
--    First remove duplicates the old constraint let through (keep the newest
--    row per employee+session among NULL-cycle rows), then recreate the
--    constraint with NULLS NOT DISTINCT (PG15+, already used by
--    employee_competency_summaries).
DELETE FROM training_recommendations t
USING training_recommendations k
WHERE t.source_cycle_id IS NULL
  AND k.source_cycle_id IS NULL
  AND k.employee_id = t.employee_id
  AND k.session_id = t.session_id
  AND k.id <> t.id
  AND (k.updated_at > t.updated_at
       OR (k.updated_at = t.updated_at AND k.id > t.id));

ALTER TABLE training_recommendations
  DROP CONSTRAINT IF EXISTS training_recommendations_uniq;
ALTER TABLE training_recommendations
  ADD CONSTRAINT training_recommendations_uniq
  UNIQUE NULLS NOT DISTINCT (employee_id, session_id, source_cycle_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
