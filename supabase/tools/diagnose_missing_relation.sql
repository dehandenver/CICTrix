-- ============================================================================
-- Why does Postgres say a table "does not exist" when I can see it?
-- ============================================================================
-- Run this in the SAME SQL editor tab that produced the 42P01, so it reports
-- on the same connection, same project and same search_path.
--
-- Read-only.
-- ============================================================================

-- 1. Who and where am I? If `project` is not the ref you expect, the SQL
--    editor and the Table Editor are pointed at different projects.
SELECT
  current_database()            AS database,
  current_user                  AS role,
  current_setting('search_path') AS search_path,
  inet_server_addr()            AS server;

-- 2. Find the relation ANYWHERE, in any schema, under any capitalisation.
--    - 0 rows            -> it genuinely is not in this database.
--    - schema <> public  -> your migration must schema-qualify it.
--    - name has capitals -> it was created quoted ("NewlyHired"); unquoted SQL
--                           will never match it and it must be renamed or
--                           always double-quoted.
--    - kind <> 'table'   -> ALTER TABLE ... ADD COLUMN cannot work on it.
SELECT
  n.nspname AS schema,
  c.relname AS name,
  CASE c.relkind
    WHEN 'r' THEN 'table'  WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized view' WHEN 'p' THEN 'partitioned table'
    WHEN 'f' THEN 'foreign table' ELSE c.relkind::text
  END AS kind,
  pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname ILIKE ANY (ARRAY['%newly%hired%', 'applicants', 'job_postings'])
ORDER BY n.nspname, c.relname;

-- 3. The decisive test: can an unqualified reference resolve it right now?
--    NULL here while step 2 found the table is the whole bug in one cell.
SELECT
  to_regclass('newly_hired')         AS unqualified_newly_hired,
  to_regclass('public.newly_hired')  AS qualified_newly_hired,
  to_regclass('applicants')          AS unqualified_applicants,
  to_regclass('public.applicants')   AS qualified_applicants,
  to_regclass('job_postings')        AS unqualified_job_postings,
  to_regclass('public.job_postings') AS qualified_job_postings;
