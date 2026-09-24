-- ============================================================================
-- Generate the DDL for every entity no migration in this repo creates
-- ============================================================================
-- RUN THIS ON THE **MAIN** PROJECT (fyzdfgxaaowjzbjpwrii).
--
-- It returns ONE cell containing a complete, ready-to-run script. Click the
-- cell, copy the whole value, and paste it into the CLONE's SQL Editor.
--
-- Why a generator instead of a hand-written migration: these 14 objects were
-- created by hand in the original project and never captured in a migration,
-- so the only truthful source for their columns, types, defaults, constraints
-- and indexes is the database that actually has them. Anything I wrote from
-- reading the app code would be an educated guess that silently diverges.
--
-- The generated script is ordered so it applies cleanly in one pass:
--   1. tables          CREATE TABLE IF NOT EXISTS
--   2. PK / UNIQUE / CHECK constraints
--   3. indexes         (only those NOT backing a constraint, so no duplicates)
--   4. FOREIGN KEYs    (last, so their targets already exist)
--   5. views           (after the tables they read)
--   6. RLS + GRANTs    matching this repo's anon-open convention
--
-- This query itself is READ-ONLY. It changes nothing.
-- ============================================================================

WITH targets(relname) AS (VALUES
  ('applicant_attachments'), ('applicants'), ('competency_dictionary'),
  ('evaluations'), ('ipcr_performance'), ('ipcr_vault'), ('job_postings'),
  ('jobs'), ('newly_hired'), ('pm_lnd_reports'), ('profiles'), ('raters'),
  ('trainings'), ('v_competency_gap_analysis')
),
rel AS (
  SELECT c.oid, c.relname, c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN targets t      ON t.relname = c.relname
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm')
),

-- ── 1. Tables ───────────────────────────────────────────────────────────────
col AS (
  SELECT
    r.oid,
    r.relname,
    string_agg(
      '  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
      || CASE
           WHEN a.attgenerated = 's'
             THEN ' GENERATED ALWAYS AS (' || pg_get_expr(ad.adbin, ad.adrelid) || ') STORED'
           WHEN a.attidentity IN ('a', 'd')
             THEN ' GENERATED ' || CASE a.attidentity WHEN 'a' THEN 'ALWAYS' ELSE 'BY DEFAULT' END || ' AS IDENTITY'
           WHEN ad.adbin IS NOT NULL
             THEN ' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid)
           ELSE ''
         END
      || CASE WHEN a.attnotnull AND a.attgenerated = '' THEN ' NOT NULL' ELSE '' END,
      E',\n' ORDER BY a.attnum
    ) AS cols
  FROM rel r
  JOIN pg_attribute a  ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef ad ON ad.adrelid = r.oid AND ad.adnum = a.attnum
  WHERE r.relkind IN ('r', 'p')
  GROUP BY r.oid, r.relname
),
tbl AS (
  SELECT 1 AS ord, r.relname,
         'CREATE TABLE IF NOT EXISTS public.' || quote_ident(r.relname)
         || E' (\n' || c.cols || E'\n);' AS ddl
  FROM rel r JOIN col c ON c.oid = r.oid
),

-- ── 2 & 4. Constraints. Wrapped so a re-run is a no-op rather than an error.
cons AS (
  SELECT
    CASE WHEN con.contype = 'f' THEN 4 ELSE 2 END AS ord,
    r.relname,
    E'DO $do$ BEGIN\n  ALTER TABLE public.' || quote_ident(r.relname)
      || ' ADD CONSTRAINT ' || quote_ident(con.conname) || ' '
      || pg_get_constraintdef(con.oid)
      || E';\nEXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;\nEND $do$;' AS ddl
  FROM rel r
  JOIN pg_constraint con ON con.conrelid = r.oid
  WHERE con.contype IN ('p', 'u', 'c', 'f')
),

-- ── 3. Indexes that do NOT back a constraint (those came out above).
idx AS (
  SELECT 3 AS ord, r.relname,
         replace(
           replace(pg_get_indexdef(ix.indexrelid), 'CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS '),
           'CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS '
         ) || ';' AS ddl
  FROM rel r
  JOIN pg_index ix ON ix.indrelid = r.oid
  WHERE NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = ix.indexrelid)
),

-- ── 5. Views ────────────────────────────────────────────────────────────────
vw AS (
  SELECT 5 AS ord, r.relname,
         'CREATE OR REPLACE VIEW public.' || quote_ident(r.relname) || E' AS\n'
         || pg_get_viewdef(r.oid, true) AS ddl
  FROM rel r
  WHERE r.relkind IN ('v', 'm')
),

-- ── 6. RLS + grants, matching the anon-open convention used repo-wide ───────
acl AS (
  SELECT 6 AS ord, r.relname,
         CASE WHEN r.relkind IN ('r', 'p')
              THEN 'ALTER TABLE public.' || quote_ident(r.relname) || E' DISABLE ROW LEVEL SECURITY;\n'
                   || 'GRANT ALL ON public.' || quote_ident(r.relname) || ' TO anon, authenticated, service_role;'
              ELSE 'GRANT SELECT ON public.' || quote_ident(r.relname) || ' TO anon, authenticated, service_role;'
         END AS ddl
  FROM rel r
),

all_ddl AS (
  SELECT * FROM tbl
  UNION ALL SELECT * FROM cons
  UNION ALL SELECT * FROM idx
  UNION ALL SELECT * FROM vw
  UNION ALL SELECT * FROM acl
)

SELECT
  E'-- ==========================================================\n'
  || E'-- Bootstrap: entities no migration creates\n'
  || '-- Generated ' || now()::timestamp(0)
  || ' from ' || current_database()
  || E'\n-- Paste this whole thing into the CLONE SQL Editor.\n'
  || E'-- ==========================================================\n\n'
  || 'BEGIN;' || E'\n\n'
  || 'SET LOCAL search_path = public, pg_temp;' || E'\n\n'
  || string_agg(ddl, E'\n\n' ORDER BY ord, relname)
  || E'\n\nNOTIFY pgrst, ''reload schema'';\n\nCOMMIT;\n'
  AS script_to_paste_into_the_clone
FROM all_ddl;
