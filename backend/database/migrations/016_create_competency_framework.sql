-- ============================================================================
-- CREATE competency framework tables
-- Module 3 · Competency Framework (Position Requirements, Review Queue,
-- Competency Map, Change Log).
--
-- position_competency_requirements — the live master list: per position, the
--   competencies required and the expected proficiency (Basic/Intermediate/
--   Advanced). The benchmark employees + applicants are measured against.
-- competency_requirement_proposals — the Review Queue: proposed add/revise/
--   remove changes (optionally flagged as RSP input) awaiting PM approval before
--   they touch the live list.
-- competency_change_log — full audit of every applied change.
-- Created: 2026-07-02
-- ============================================================================

-- 1) position_competency_requirements ----------------------------------------
CREATE TABLE IF NOT EXISTS position_competency_requirements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position         text NOT NULL,
  competency_name  text NOT NULL,
  description      text,
  proficiency_level text NOT NULL DEFAULT 'Basic'
                     CHECK (proficiency_level IN ('Basic', 'Intermediate', 'Advanced')),
  is_active        boolean NOT NULL DEFAULT true,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (position, competency_name)
);

CREATE INDEX IF NOT EXISTS idx_pcr_position ON position_competency_requirements (position);
CREATE INDEX IF NOT EXISTS idx_pcr_competency ON position_competency_requirements (competency_name);

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

-- 2) competency_requirement_proposals (Review Queue) -------------------------
CREATE TABLE IF NOT EXISTS competency_requirement_proposals (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action               text NOT NULL CHECK (action IN ('add', 'revise', 'remove')),
  position             text NOT NULL,
  competency_name      text NOT NULL,
  description          text,
  proficiency_level    text CHECK (proficiency_level IN ('Basic', 'Intermediate', 'Advanced')),
  target_requirement_id uuid REFERENCES position_competency_requirements(id) ON DELETE SET NULL,
  rsp_input            boolean NOT NULL DEFAULT false,
  submitted_by         text,
  status               text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  reviewed_by          text,
  reviewed_at          timestamptz,
  review_note          text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crp_status ON competency_requirement_proposals (status, created_at DESC);

-- 3) competency_change_log ---------------------------------------------------
CREATE TABLE IF NOT EXISTS competency_change_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action          text NOT NULL CHECK (action IN ('add', 'revise', 'remove')),
  position        text,
  competency_name text,
  summary         text,
  approved_by     text,
  -- 'direct' = edited straight on Position Requirements; 'review-queue' = via a
  -- proposal approval.
  source          text NOT NULL DEFAULT 'direct' CHECK (source IN ('direct', 'review-queue')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccl_created ON competency_change_log (created_at DESC);

-- Disable RLS so the frontend Supabase anon client can read/write, matching the
-- pattern used across Modules 1 + 2 (010–015).
ALTER TABLE position_competency_requirements   DISABLE ROW LEVEL SECURITY;
ALTER TABLE competency_requirement_proposals   DISABLE ROW LEVEL SECURITY;
ALTER TABLE competency_change_log              DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON position_competency_requirements TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON competency_requirement_proposals TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON competency_change_log            TO authenticated, anon;
