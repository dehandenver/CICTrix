-- pm_lnd_reports: convert employees_flagged to real jsonb arrays,
-- add status workflow + updated_at + supporting index/trigger.
--
-- Run via: Supabase Dashboard → SQL Editor → paste → Run.
-- Safe to re-run: ADD COLUMN/INDEX guarded with IF NOT EXISTS,
-- trigger is dropped + recreated.
--
-- NOTE on step 1: this assumes employees_flagged is currently `text`
-- holding a stringified JSON array (matches what the app writes via
-- JSON.stringify). If it is already `jsonb` storing string scalars,
-- replace the USING clause with:
--   USING CASE
--     WHEN jsonb_typeof(employees_flagged) = 'string'
--       THEN (employees_flagged #>> '{}')::jsonb
--     ELSE employees_flagged
--   END

BEGIN;

-- 1) employees_flagged: stringified JSON  →  real jsonb array
ALTER TABLE pm_lnd_reports
  ALTER COLUMN employees_flagged TYPE jsonb
  USING COALESCE(NULLIF(employees_flagged, '')::jsonb, '[]'::jsonb);

ALTER TABLE pm_lnd_reports
  ALTER COLUMN employees_flagged SET DEFAULT '[]'::jsonb;

-- 2) status: workflow column for L&D acknowledgement
ALTER TABLE pm_lnd_reports
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Pending Review'
    CHECK (status IN ('Pending Review', 'Reviewed', 'Actioned'));

-- 3) updated_at: bumped whenever L&D changes status
ALTER TABLE pm_lnd_reports
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION pm_lnd_reports_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pm_lnd_reports_updated_at ON pm_lnd_reports;
CREATE TRIGGER pm_lnd_reports_updated_at
  BEFORE UPDATE ON pm_lnd_reports
  FOR EACH ROW
  EXECUTE FUNCTION pm_lnd_reports_set_updated_at();

-- 4) Index for L&D's "show pending reports, newest first" query
CREATE INDEX IF NOT EXISTS pm_lnd_reports_status_created_idx
  ON pm_lnd_reports (status, created_at DESC);

COMMIT;
