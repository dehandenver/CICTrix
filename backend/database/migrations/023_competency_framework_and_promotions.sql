-- ============================================================================
-- 023: Module 3 (Competency Framework) + Module 4 (Promotional Applications)
-- ============================================================================
-- Module 3 · two subtabs: Position Requirements, Competency Map
--   competency_standards              — the 12 LGU competency standards (seeded)
--   position_competency_requirements  — per position, which standards are
--                                       required and at what proficiency
--
-- Module 4 · two subtabs: Applications, Eligibility Check
--   promotional_applications — one row per promotion request
--   application_documents    — the document checklist per application
--
-- NOTE ON position_competency_requirements
-- Migration 016 created this table keyed on a free-text `competency_name`. This
-- module keys it to competency_standards by id instead, so the Competency Map
-- can render a fixed 12-column grid and a renamed standard can't orphan a row.
-- The old shape is dropped and recreated: it is read only by
-- src/lib/api/competencyFramework.ts, whose only consumers are the two screens
-- this migration is rebuilding, so nothing outside these modules is affected.
--
-- Idempotent and safe to re-run.
-- Created: 2026-07-17
-- ============================================================================

-- 1) competency_standards -----------------------------------------------------
CREATE TABLE IF NOT EXISTS competency_standards (
  id              integer PRIMARY KEY,
  competency_name text NOT NULL UNIQUE,
  training_stream text NOT NULL
                    CHECK (training_stream IN (
                      'LEADERSHIP',
                      'EMPLOYEE DEVELOPMENT',
                      'TECHNICAL',
                      'CULTURAL TRANSFORMATION'
                    ))
);

-- The 12 standards. Fixed ids: the Competency Map renders columns 1..12 in this
-- order, and position_competency_requirements references them.
INSERT INTO competency_standards (id, competency_name, training_stream) VALUES
  (1,  'Knowledge of Local Governance',                'LEADERSHIP'),
  (2,  'Public Administration Principles',             'LEADERSHIP'),
  (3,  'Community Engagement Skills',                  'EMPLOYEE DEVELOPMENT'),
  (4,  'Project Management in a Public Setting',       'LEADERSHIP'),
  (5,  'Fiscal Management/Budgeting for LGU',          'TECHNICAL'),
  (6,  'Transparency and Accountability Practices',    'CULTURAL TRANSFORMATION'),
  (7,  'Disaster Risk Reduction and Management',       'TECHNICAL'),
  (8,  'Digital Literacy for Government Services',     'TECHNICAL'),
  (9,  'Ethical Conduct and Public Service Standards', 'CULTURAL TRANSFORMATION'),
  (10, 'Technical Writing for Government Documents',   'TECHNICAL'),
  (11, 'Data and Records Management and Organization', 'TECHNICAL'),
  (12, 'Public Communication Skills',                  'EMPLOYEE DEVELOPMENT')
ON CONFLICT (id) DO UPDATE
  SET competency_name = EXCLUDED.competency_name,
      training_stream = EXCLUDED.training_stream;

-- 2) position_competency_requirements -----------------------------------------
-- Replaces the migration-016 shape (see note above).
DROP TABLE IF EXISTS position_competency_requirements CASCADE;

CREATE TABLE position_competency_requirements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_title    text NOT NULL,
  competency_id     integer NOT NULL REFERENCES competency_standards (id) ON DELETE CASCADE,
  proficiency_level text NOT NULL
                      CHECK (proficiency_level IN ('Basic', 'Intermediate', 'Advanced')),
  updated_by        text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- A position requires a given standard at exactly one level. Lets Subtab 1
  -- upsert a row per Save, and "Not Required" is simply the absence of a row.
  UNIQUE (position_title, competency_id)
);

CREATE INDEX IF NOT EXISTS idx_pcr_position_title ON position_competency_requirements (position_title);
CREATE INDEX IF NOT EXISTS idx_pcr_competency_id  ON position_competency_requirements (competency_id);

CREATE OR REPLACE FUNCTION pcr_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcr_updated_at ON position_competency_requirements;
CREATE TRIGGER trg_pcr_updated_at
  BEFORE UPDATE ON position_competency_requirements
  FOR EACH ROW EXECUTE FUNCTION pcr_set_updated_at();

-- 3) promotional_applications --------------------------------------------------
-- employee_name is denormalized alongside employee_id, matching ipcr_submissions:
-- the anon client cannot read `accounts`/`employees` directly (RLS), so the list
-- must be able to render an applicant's name without joining them.
CREATE TABLE IF NOT EXISTS promotional_applications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id          text NOT NULL,
  employee_name        text NOT NULL,
  current_position     text,
  position_applied_for text NOT NULL,
  date_applied         timestamptz NOT NULL DEFAULT now(),
  status               text NOT NULL DEFAULT 'submitted'
                         CHECK (status IN ('submitted', 'under_review', 'endorsed', 'approved', 'denied')),
  remarks              text,
  decided_by           text,
  decided_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_promo_apps_employee ON promotional_applications (employee_id);
CREATE INDEX IF NOT EXISTS idx_promo_apps_status   ON promotional_applications (status);

-- 4) application_documents -----------------------------------------------------
CREATE TABLE IF NOT EXISTS application_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES promotional_applications (id) ON DELETE CASCADE,
  document_type  text NOT NULL,
  status         text NOT NULL DEFAULT 'missing'
                   CHECK (status IN ('submitted', 'missing')),
  uploaded_at    timestamptz,
  UNIQUE (application_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_app_docs_application ON application_documents (application_id);

-- 5) Access -------------------------------------------------------------------
-- Disable RLS so the frontend anon client can read/write, matching migration 016.
ALTER TABLE competency_standards             DISABLE ROW LEVEL SECURITY;
ALTER TABLE position_competency_requirements DISABLE ROW LEVEL SECURITY;
ALTER TABLE promotional_applications         DISABLE ROW LEVEL SECURITY;
ALTER TABLE application_documents            DISABLE ROW LEVEL SECURITY;

GRANT SELECT                        ON competency_standards             TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON position_competency_requirements TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON promotional_applications         TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON application_documents            TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
