-- pm_lnd_reports: convert employees_flagged to real jsonb arrays,
-- add status workflow + updated_at + supporting index/trigger.
--
-- Run via: Supabase Dashboard → SQL Editor → paste → Run.
-- Safe to re-run: ADD COLUMN/INDEX guarded with IF NOT EXISTS,
-- trigger is dropped + recreated.

BEGIN;

-- 1) employees_flagged: column is already jsonb, but existing rows hold
--    *string scalars* (the result of JSON.stringify being stored as a
--    jsonb value). Unwrap each string scalar back into a real array.
--    Helper handles NULL, non-string scalars, and any unparseable row
--    (all coerced to '[]'). Dropped at the end.
CREATE OR REPLACE FUNCTION _migration_unwrap_jsonb_string(j jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  inner_text text;
BEGIN
  IF j IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF jsonb_typeof(j) = 'array' THEN
    RETURN j;
  END IF;

  IF jsonb_typeof(j) = 'string' THEN
    inner_text := j #>> '{}';
    IF inner_text IS NULL OR btrim(inner_text) = '' THEN
      RETURN '[]'::jsonb;
    END IF;
    BEGIN
      RETURN inner_text::jsonb;
    EXCEPTION WHEN others THEN
      RETURN '[]'::jsonb;
    END;
  END IF;

  -- numbers, booleans, objects, null jsonb — not expected here
  RETURN '[]'::jsonb;
END;
$$;

UPDATE pm_lnd_reports
SET employees_flagged = _migration_unwrap_jsonb_string(employees_flagged)
WHERE jsonb_typeof(employees_flagged) IS DISTINCT FROM 'array';

ALTER TABLE pm_lnd_reports
  ALTER COLUMN employees_flagged SET DEFAULT '[]'::jsonb;

DROP FUNCTION _migration_unwrap_jsonb_string(jsonb);

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

-- 5) records: full per-employee IPCR snapshot (department roster + ratings) so
--    L&D can render the official Summary-of-Ratings table, not just the totals.
--    Stored as a jsonb array of IPCRRatingRecord shapes.
ALTER TABLE pm_lnd_reports
  ADD COLUMN IF NOT EXISTS records jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
