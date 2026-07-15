-- ============================================================================
-- CREATE ipcr_workspace TABLE
-- Backs the Employee Portal "My IPCR Workspace" tab (Phase 1 Target Setting +
-- Phase 2 Accomplishments & Ratings).
--
-- One row per (employee, period). The employee writes their own Core / Strategic
-- / Support targets in Phase 1; ~6 months later they encode accomplishments and
-- self-ratings in Phase 2. On Phase 2 submission the app computes an overall
-- score + adjectival rating and stores the generated IPCR PDF url.
--
-- Kept separate from ipcr_performance (the 'submission'-tab row editor), which
-- deletes+reinserts by (employee_num, rating_period) and would otherwise clobber
-- the workspace data.
-- Created: 2026-07-08
-- ============================================================================

CREATE TABLE IF NOT EXISTS ipcr_workspace (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid REFERENCES employees(id) ON DELETE CASCADE,
  employee_num  text,
  employee_name text,
  office_id     uuid REFERENCES departments(id) ON DELETE SET NULL,
  office_name   text,
  period        text NOT NULL,
  status        text NOT NULL DEFAULT 'Draft Targets'
                  CHECK (status IN (
                    'Draft Targets',
                    'Targets Submitted',
                    'Accomplishments Submitted',
                    'Completed'
                  )),

  -- Phase 1: targets
  core_target      text,
  strategic_target text,
  support_target   text,
  targets_submitted_at timestamptz,

  -- Phase 2: accomplishments + self-ratings (per category)
  core_accomplishment      text,
  strategic_accomplishment text,
  support_accomplishment   text,
  core_rating      numeric(4,2),
  strategic_rating numeric(4,2),
  support_rating   numeric(4,2),
  accomplishments_submitted_at timestamptz,

  -- Computed on Phase 2 submit
  overall_score numeric(4,2),
  adjectival    text,
  pdf_url       text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period)
);

CREATE INDEX IF NOT EXISTS idx_ipcr_workspace_employee ON ipcr_workspace (employee_id);
CREATE INDEX IF NOT EXISTS idx_ipcr_workspace_period   ON ipcr_workspace (period);
CREATE INDEX IF NOT EXISTS idx_ipcr_workspace_status   ON ipcr_workspace (status);

CREATE OR REPLACE FUNCTION ipcr_workspace_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ipcr_workspace_updated_at ON ipcr_workspace;
CREATE TRIGGER trg_ipcr_workspace_updated_at
  BEFORE UPDATE ON ipcr_workspace
  FOR EACH ROW EXECUTE FUNCTION ipcr_workspace_set_updated_at();

-- Disable RLS so the frontend Supabase anon client can read/write, matching the
-- pattern used across Module 1 + 2 (010–015).
ALTER TABLE ipcr_workspace DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON ipcr_workspace TO authenticated, anon;

-- Force PostgREST schema reload so the new table is exposed immediately.
NOTIFY pgrst, 'reload schema';
