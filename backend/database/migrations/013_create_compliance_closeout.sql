-- ============================================================================
-- CREATE cycle_compilations + office_cycle_closeouts TABLES
-- Module 1 · Tab 1.3 · Submission Compliance & Closeout (Phase 4).
--
-- cycle_compilations — records the Supervisor-compiled DPCRs and the Dept-Head-
--   compiled OPCR per office/period. Presence of these is what the closeout gate
--   checks (individual IPCR verification is read from performance_evaluations).
--
-- office_cycle_closeouts — the terminal record: once PM closes out an office's
--   cycle it is locked, timestamped, and archived (ready for Module 5 Records
--   Search). One closeout per (office, period).
-- Created: 2026-06-30
-- ============================================================================

-- 1) cycle_compilations ------------------------------------------------------
CREATE TABLE IF NOT EXISTS cycle_compilations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id    uuid REFERENCES departments(id) ON DELETE CASCADE,
  office_name  text,
  period       text,
  kind         text NOT NULL CHECK (kind IN ('DPCR', 'OPCR')),
  group_name   text,                    -- supervisory group (for DPCR)
  compiled_by  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cycle_compilations_office_period
  ON cycle_compilations (office_id, period);
CREATE INDEX IF NOT EXISTS idx_cycle_compilations_kind
  ON cycle_compilations (kind);

-- 2) office_cycle_closeouts --------------------------------------------------
CREATE TABLE IF NOT EXISTS office_cycle_closeouts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id      uuid REFERENCES departments(id) ON DELETE SET NULL,
  office_name    text,
  period         text,
  -- Snapshot of the completeness check captured at closeout time.
  ipcr_verified  integer NOT NULL DEFAULT 0,
  ipcr_total     integer NOT NULL DEFAULT 0,
  dpcr_count     integer NOT NULL DEFAULT 0,
  opcr_count     integer NOT NULL DEFAULT 0,
  archived       boolean NOT NULL DEFAULT true,
  closed_by      text,
  closed_at      timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, period)
);

CREATE INDEX IF NOT EXISTS idx_office_cycle_closeouts_period
  ON office_cycle_closeouts (period);

-- Disable RLS so the frontend Supabase anon client can read/write, matching the
-- pattern used for the other Module-1 tables (010–012).
ALTER TABLE cycle_compilations     DISABLE ROW LEVEL SECURITY;
ALTER TABLE office_cycle_closeouts DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON cycle_compilations     TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON office_cycle_closeouts TO authenticated, anon;
