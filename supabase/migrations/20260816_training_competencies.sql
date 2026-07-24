-- ============================================================================
-- Migration: Structured competency tagging for training sessions
-- Date: 2026-08-16
--
-- Replaces the brittle "Competency: <name>" lines-in-objectives pattern with a
-- proper many-to-many join table. The old pattern is kept as a read-only
-- fallback in code until admins re-tag existing trainings via the new UI.
--
-- Tables created:
--   training_competency_tags   — master taxonomy (name + dedup key)
--   training_competencies      — session ↔ tag join (+ optional weight)
--
-- The 12 canonical competencies from src/constants/positions.ts are seeded
-- as the initial taxonomy. Admins can extend it from the form.
-- ============================================================================

BEGIN;

-- ── 1. Master taxonomy ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_competency_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  -- Normalised key used for deduplication (lower-case, whitespace-collapsed,
  -- slash-canonicalised). Unique constraint prevents near-duplicate entries.
  name_key    text NOT NULL UNIQUE,
  -- Optional grouping for future UI filtering (e.g. Technical / Leadership).
  category    text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_competency_tags_name_key
  ON training_competency_tags (name_key);

-- ── 2. Session ↔ tag join ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_competencies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  competency_id  uuid NOT NULL REFERENCES training_competency_tags(id) ON DELETE CASCADE,
  -- Reserved for future AI matcher weighting (1 = light touch, 5 = primary
  -- focus). NULL until the IPCR model produces per-competency scores.
  weight         smallint CHECK (weight BETWEEN 1 AND 5),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, competency_id)
);

CREATE INDEX IF NOT EXISTS idx_training_competencies_session
  ON training_competencies (session_id);
CREATE INDEX IF NOT EXISTS idx_training_competencies_competency
  ON training_competencies (competency_id);

-- ── 3. Seed the 12 canonical competencies ────────────────────────────────────
-- These mirror src/constants/positions.ts COMPETENCIES exactly so the
-- canonicalizeCompetency() lookup in code returns the same strings the DB uses.

INSERT INTO training_competency_tags (name, name_key) VALUES
  ('Knowledge of Local Governance',
   'knowledge of local governance'),
  ('Public Administration Principles',
   'public administration principles'),
  ('Community Engagement Skills',
   'community engagement skills'),
  ('Project Management in a Public Setting',
   'project management in a public setting'),
  ('Fiscal Management / Budgeting for LGU',
   'fiscal management/budgeting for lgu'),
  ('Transparency and Accountability Practices',
   'transparency and accountability practices'),
  ('Disaster Risk Reduction and Management',
   'disaster risk reduction and management'),
  ('Digital Literacy for Government Services',
   'digital literacy for government services'),
  ('Ethical Conduct and Public Service Standards',
   'ethical conduct and public service standards'),
  ('Technical Writing for Government Documents',
   'technical writing for government documents'),
  ('Data and Records Management and Organization',
   'data and records management and organization'),
  ('Public Communication Skills',
   'public communication skills')
ON CONFLICT (name_key) DO NOTHING;

-- ── 4. Open access (consistent with all other training_* tables) ─────────────
ALTER TABLE training_competency_tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE training_competencies    DISABLE ROW LEVEL SECURITY;
GRANT ALL ON training_competency_tags TO anon, authenticated, service_role;
GRANT ALL ON training_competencies    TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
