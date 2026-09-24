-- ============================================================================
-- Same as dump_missing_entities_ddl.sql, but ONE STATEMENT PER ROW
-- ============================================================================
-- RUN THIS ON THE **MAIN** PROJECT (fyzdfgxaaowjzbjpwrii).
--
-- Use this when copying the single large cell from the other file is awkward —
-- some builds of the Supabase result grid copy only the visible line.
--
-- Returns the same DDL, already in apply order, one statement per row:
--   step | applies_to | statement
--
-- Export → CSV, or click down the `statement` column, and run them in the
-- clone from step 1 downwards. Order matters: tables before constraints,
-- foreign keys after their targets, views after the tables they read.
--
-- READ-ONLY. Changes nothing.
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
  row_number() OVER (ORDER BY ord, relname) AS step,
  relname                                   AS applies_to,
  ddl                                       AS statement
FROM all_ddl
ORDER BY ord, relname;
