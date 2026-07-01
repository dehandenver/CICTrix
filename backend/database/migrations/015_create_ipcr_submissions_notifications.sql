-- ============================================================================
-- CREATE ipcr_notifications + ipcr_submissions TABLES
-- Module 2 · Subtabs 2.2 (Target Setting) & 2.3 (Accomplishment Rating).
--
-- ipcr_notifications — the log of every "Targets Needed" / "Accomplishment
--   Ratings Needed" notification PM triggered to an Office Account (timestamp,
--   office, how many employees included), so there's a record of when each
--   cycle officially began. `phase` distinguishes target vs rating.
--
-- ipcr_submissions — per-employee position in the submission pipeline for a
--   period + phase: Not Started → In Draft → Submitted to Office → Returned for
--   Revision → Verified → Forwarded to PM. Reaching "Forwarded to PM" in the
--   target phase is what places the entry in the Locked Targets Vault (1.2).
-- Created: 2026-07-02
-- ============================================================================

-- 1) ipcr_notifications ------------------------------------------------------
CREATE TABLE IF NOT EXISTS ipcr_notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase          text NOT NULL CHECK (phase IN ('target', 'rating')),
  office_id      uuid REFERENCES departments(id) ON DELETE SET NULL,
  office_name    text,
  period         text,
  employee_count integer NOT NULL DEFAULT 0,
  message        text,
  triggered_by   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ipcr_notifications_phase_created
  ON ipcr_notifications (phase, created_at DESC);

-- 2) ipcr_submissions --------------------------------------------------------
CREATE TABLE IF NOT EXISTS ipcr_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid REFERENCES employees(id) ON DELETE CASCADE,
  employee_name text,
  office_id     uuid REFERENCES departments(id) ON DELETE SET NULL,
  office_name   text,
  period        text NOT NULL,
  phase         text NOT NULL CHECK (phase IN ('target', 'rating')),
  stage         text NOT NULL DEFAULT 'Not Started'
                  CHECK (stage IN (
                    'Not Started',
                    'In Draft',
                    'Submitted to Office',
                    'Returned for Revision',
                    'Verified',
                    'Forwarded to PM'
                  )),
  forwarded_at  timestamptz,
  updated_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period, phase)
);

CREATE INDEX IF NOT EXISTS idx_ipcr_submissions_period_phase
  ON ipcr_submissions (period, phase);
CREATE INDEX IF NOT EXISTS idx_ipcr_submissions_stage
  ON ipcr_submissions (stage);

CREATE OR REPLACE FUNCTION ipcr_submissions_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ipcr_submissions_updated_at ON ipcr_submissions;
CREATE TRIGGER trg_ipcr_submissions_updated_at
  BEFORE UPDATE ON ipcr_submissions
  FOR EACH ROW EXECUTE FUNCTION ipcr_submissions_set_updated_at();

-- Disable RLS so the frontend Supabase anon client can read/write, matching the
-- pattern used across Module 1 + 2 (010–014).
ALTER TABLE ipcr_notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE ipcr_submissions   DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON ipcr_notifications TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ipcr_submissions   TO authenticated, anon;
