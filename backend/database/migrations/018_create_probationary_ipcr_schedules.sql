-- ============================================================================
-- CREATE probationary_ipcr_schedules TABLE
-- To track PM-configured cycles and periods for probationary employees.
-- Created: 2026-07-08
-- ============================================================================

CREATE TABLE IF NOT EXISTS probationary_ipcr_schedules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label         text NOT NULL,
  hired_month          text NOT NULL, -- e.g. 'January', 'July', etc.
  target_start         date NOT NULL,
  target_end           date NOT NULL,
  accomplishment_start date NOT NULL,
  accomplishment_end   date NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Enable full read/write for all users (anon & authenticated)
ALTER TABLE probationary_ipcr_schedules DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON probationary_ipcr_schedules TO authenticated, anon;
