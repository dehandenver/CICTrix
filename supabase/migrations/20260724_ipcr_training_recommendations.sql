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
-- Two parts:
--   1. training_sessions.competency — the real join key. Until now a course's
--      governance competency lived only as a "Competency: X" line inside the
--      objectives text[]. This promotes it to a first-class, constrained column
--      (one of the 12 canonical competencies from src/constants/positions.ts),
--      backfilled from that objectives line.
--   2. training_recommendations — one system-generated row per
--      (employee, course/session, source finalized cycle). UNIQUE on that triple
--      so re-running the generator upserts rather than duplicates.
--
-- Access: same anon-open posture as the other IPCR/RSP/L&D tables (RLS disabled,
-- grants to anon+authenticated). The management UI lives inside the access-gated
-- L&D Portal; enforcement is app-layer. Consistent with 20260722 (calendar) and
-- 20260721 (competency matches).
--
-- Idempotent: safe to re-apply.
-- ============================================================================

BEGIN;

-- ── 1. training_sessions.competency — the join key ──────────────────────────
ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS competency text;

-- One of the 12 canonical competencies, or NULL for events with no competency
-- (e.g. a mandatory all-staff session). Matches src/constants/positions.ts
-- exactly so course.competency ↔ ipcr_competency_matches.competency joins 1:1.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_competency_check'
  ) THEN
    ALTER TABLE training_sessions
      ADD CONSTRAINT training_sessions_competency_check
      CHECK (competency IS NULL OR competency IN (
        'Knowledge of Local Governance',
        'Public Administration Principles',
        'Community Engagement Skills',
        'Project Management in a Public Setting',
        'Fiscal Management / Budgeting for LGU',
        'Transparency and Accountability Practices',
        'Disaster Risk Reduction and Management',
        'Digital Literacy for Government Services',
        'Ethical Conduct and Public Service Standards',
        'Technical Writing for Government Documents',
        'Data and Records Management and Organization',
        'Public Communication Skills'
      ));
  END IF;
END;
$$;

-- Backfill from the "Competency: X" objectives line the seeder writes. Only
-- fills rows still NULL, so a manually-set competency is never overwritten.
UPDATE training_sessions ts
SET competency = trim(substring(x.obj FROM 'Competency: (.*)'))
FROM (SELECT id, unnest(objectives) AS obj FROM training_sessions) x
WHERE ts.id = x.id
  AND x.obj LIKE 'Competency: %'
  AND ts.competency IS NULL
  AND trim(substring(x.obj FROM 'Competency: (.*)')) IN (
    'Knowledge of Local Governance',
    'Public Administration Principles',
    'Community Engagement Skills',
    'Project Management in a Public Setting',
    'Fiscal Management / Budgeting for LGU',
    'Transparency and Accountability Practices',
    'Disaster Risk Reduction and Management',
    'Digital Literacy for Government Services',
    'Ethical Conduct and Public Service Standards',
    'Technical Writing for Government Documents',
    'Data and Records Management and Organization',
    'Public Communication Skills'
  );

CREATE INDEX IF NOT EXISTS training_sessions_competency_idx
  ON training_sessions (competency);

-- ── 2. training_recommendations — system-generated matches ──────────────────
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

-- ── 3. Access — app-layer enforcement, consistent with the other IPCR tables ─
ALTER TABLE training_recommendations DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON training_recommendations TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
