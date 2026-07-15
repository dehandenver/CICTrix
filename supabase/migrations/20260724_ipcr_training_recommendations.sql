-- ============================================================================
-- IPCR → L&D Training Recommendations bridge.
-- Created: 2026-07-24.
--
-- Connects finalized IPCR performance data to the L&D Training Calendar. An
-- employee whose IPCR targets map to a competency they score low on (the
-- "development-gap" model already used by the roster seeder) is recommended the
-- training courses tagged with that competency. L&D Admins read these back per
-- course to see exactly who is recommended and why.
--
-- A course's competency is NOT a column: it's parsed from the "Competency: X"
-- line inside training_sessions.objectives (the shape the seeders already write),
-- via competencyFromObjectives() in src/lib/api/trainingCalendar.ts. So this
-- migration only needs the recommendations table itself.
--
--   training_recommendations — one system-generated row per
--   (employee, course/session, source finalized cycle). UNIQUE on that triple
--   so re-running the generator upserts rather than duplicates. Its `competency`
--   column stores which of the 12 competencies triggered the recommendation.
--
-- Access: same anon-open posture as the other IPCR/RSP/L&D tables (RLS disabled,
-- grants to anon+authenticated). The management UI lives inside the access-gated
-- L&D Portal; enforcement is app-layer. Consistent with 20260722 (calendar) and
-- 20260721 (competency matches).
--
-- Idempotent: safe to re-apply.
-- ============================================================================

BEGIN;

-- ── training_recommendations — system-generated matches ─────────────────────
CREATE TABLE IF NOT EXISTS training_recommendations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid    NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- The "course" is a calendar training_session.
  session_id      uuid    NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  -- Which weak competency triggered this (one of the 12).
  competency      text    NOT NULL,
  -- Which finalized IPCR cycle the recommendation is based on.
  source_cycle_id integer REFERENCES performance_cycles(id) ON DELETE SET NULL,
  -- The IPCR overall score (1–5) that caused the recommendation.
  trigger_score   numeric,
  gap_type        text    NOT NULL DEFAULT 'LOW_SCORE'
                    CHECK (gap_type IN ('LOW_SCORE', 'DECLINING_TREND', 'KRA_ALIGNED')),
  gap_detail      text,
  priority        text    NOT NULL DEFAULT 'MEDIUM'
                    CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  status          text    NOT NULL DEFAULT 'SUGGESTED'
                    CHECK (status IN ('SUGGESTED', 'ACCEPTED', 'ENROLLED', 'DISMISSED')),
  admin_remark    text,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Idempotency: re-running the generator upserts by this triple.
  CONSTRAINT training_recommendations_uniq
    UNIQUE (employee_id, session_id, source_cycle_id)
);

CREATE INDEX IF NOT EXISTS training_recommendations_session_idx
  ON training_recommendations (session_id);
CREATE INDEX IF NOT EXISTS training_recommendations_employee_idx
  ON training_recommendations (employee_id);
CREATE INDEX IF NOT EXISTS training_recommendations_status_idx
  ON training_recommendations (status);

-- ── Access — app-layer enforcement, consistent with the other IPCR tables ────
ALTER TABLE training_recommendations DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON training_recommendations TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
