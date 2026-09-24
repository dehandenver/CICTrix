-- ============================================================================
-- Is the plantilla + reference-number feature actually live in THIS database?
-- ============================================================================
-- Run in any project. Reports PASS / FAIL per check, FAILs sorted to the top.
--
-- Structural checks read the catalogs, so they are safe even when the tables
-- are missing entirely. The two data checks use dynamic SQL for the same
-- reason — a plain subquery against a non-existent table fails at parse time,
-- which would make this file unrunnable on exactly the database you most need
-- to inspect.
--
-- READ-ONLY apart from a TEMP table that vanishes with the session.
-- ============================================================================

DROP TABLE IF EXISTS _verify;
CREATE TEMP TABLE _verify (sort int, check_name text, status text, detail text);

-- ── Structural: does the schema have what the app expects? ──────────────────
INSERT INTO _verify VALUES
  (1, 'table plantilla_slots',
      CASE WHEN to_regclass('public.plantilla_slots') IS NULL THEN 'FAIL' ELSE 'PASS' END,
      'migration 20260922'),
  (2, 'table application_plantilla_slots',
      CASE WHEN to_regclass('public.application_plantilla_slots') IS NULL THEN 'FAIL' ELSE 'PASS' END,
      'migration 20260922'),
  (3, 'column applicants.needs_slot_reassignment',
      CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='applicants'
                           AND column_name='needs_slot_reassignment')
           THEN 'PASS' ELSE 'FAIL' END,
      'migration 20260922'),
  (4, 'column applicants.reference_no',
      CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='applicants'
                           AND column_name='reference_no')
           THEN 'PASS' ELSE 'FAIL' END,
      'migration 20260923'),
  (5, 'column applicants.reference_no_normalized (generated)',
      CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='applicants'
                           AND column_name='reference_no_normalized'
                           AND is_generated='ALWAYS')
           THEN 'PASS' ELSE 'FAIL' END,
      'migration 20260923'),
  (6, 'unique index uq_applicants_reference_no_normalized',
      CASE WHEN to_regclass('public.uq_applicants_reference_no_normalized') IS NULL
           THEN 'FAIL' ELSE 'PASS' END,
      'what actually guarantees uniqueness'),
  (7, 'trigger trg_assign_application_reference_no',
      CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgname='trg_assign_application_reference_no' AND NOT tgisinternal)
           THEN 'PASS' ELSE 'FAIL' END,
      'without it new applications get NO reference'),
  (8, 'trigger trg_freeze_application_reference_no',
      CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgname='trg_freeze_application_reference_no' AND NOT tgisinternal)
           THEN 'PASS' ELSE 'FAIL' END,
      'stops a reference ever changing'),
  (9, 'applicant_tracker_view exposes reference_no',
      CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='applicant_tracker_view'
                           AND column_name='reference_no')
           THEN 'PASS' ELSE 'FAIL' END,
      'the tracker CANNOT look anyone up without this'),
 (10, 'columns newly_hired.plantilla_item_number / _slot_number',
      CASE WHEN (SELECT count(*) FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='newly_hired'
                    AND column_name IN ('plantilla_item_number','plantilla_slot_number')) = 2
           THEN 'PASS' ELSE 'FAIL' END,
      'optional — skipped by design if newly_hired is absent');

-- ── Data: did the backfill actually land? ───────────────────────────────────
DO $$
DECLARE
  nulls   bigint;
  dupes   bigint;
  noslot  bigint;
BEGIN
  IF to_regclass('public.applicants') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='applicants'
                       AND column_name='reference_no') THEN
    INSERT INTO _verify VALUES
      (11, 'every application has a reference_no', 'SKIP', 'reference_no column not present yet'),
      (12, 'no duplicate reference numbers',       'SKIP', 'reference_no column not present yet');
  ELSE
    EXECUTE $q$ SELECT count(*) FROM public.applicants
                 WHERE reference_no IS NULL OR btrim(reference_no) = '' $q$ INTO nulls;
    EXECUTE $q$ SELECT COALESCE(sum(c - 1), 0) FROM (
                  SELECT count(*) AS c FROM public.applicants
                   WHERE reference_no IS NOT NULL AND btrim(reference_no) <> ''
                   GROUP BY reference_no_normalized HAVING count(*) > 1) d $q$ INTO dupes;

    INSERT INTO _verify VALUES
      (11, 'every application has a reference_no',
           CASE WHEN nulls = 0 THEN 'PASS' ELSE 'FAIL' END,
           nulls || ' row(s) still without one'),
      (12, 'no duplicate reference numbers',
           CASE WHEN dupes = 0 THEN 'PASS' ELSE 'FAIL' END,
           dupes || ' collision(s)');
  END IF;

  IF to_regclass('public.plantilla_slots') IS NULL
     OR to_regclass('public.job_postings') IS NULL THEN
    INSERT INTO _verify VALUES
      (13, 'every job posting has at least one plantilla slot', 'SKIP', 'tables not present yet');
  ELSE
    EXECUTE $q$ SELECT count(*) FROM public.job_postings jp
                 WHERE NOT EXISTS (SELECT 1 FROM public.plantilla_slots ps
                                    WHERE ps.job_posting_id = jp.id) $q$ INTO noslot;
    INSERT INTO _verify VALUES
      (13, 'every job posting has at least one plantilla slot',
           CASE WHEN noslot = 0 THEN 'PASS' ELSE 'FAIL' END,
           noslot || ' posting(s) with no slot — the admin modal opens empty for these');
  END IF;
END $$;

SELECT check_name, status, detail
FROM _verify
ORDER BY (status = 'FAIL') DESC, (status = 'SKIP') DESC, sort;
