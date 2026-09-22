-- ─────────────────────────────────────────────────────────────────────────────
-- DEMO / CLONE REPAIR — NOT FOR PRODUCTION
-- ─────────────────────────────────────────────────────────────────────────────
--
-- This file lives outside supabase/migrations/ on purpose. It is deliberately
-- permissive, and applying it to production would strip that project's real
-- access control. apply-sql.mjs refuses a production connection string unless
-- --allow-prod is passed; do not pass it for this file.
--
-- Why it exists: a project cloned from production (the HR Demo,
-- hydqhmtppkghqaatdgwx) came up with tables and rows restored but almost no
-- grants and almost no policies. Measured on the demo before this ran:
--
--     92 public tables
--     89 with RLS enabled and ZERO policies   -> deny everything
--     91 missing the `authenticated` grant
--      3 with any policy at all (departments, employees, user_roles)
--
-- The effect was that login succeeded and then every read failed with 42501
-- "permission denied", so the whole portal was blank behind the login screen.
--
-- Two roles need access, because this app authenticates in two different ways:
--   * `authenticated` — the four admin portals, which use Supabase Auth.
--   * `anon`          — the employee / office portals, which authenticate
--                       against employee_portal_accounts at the application
--                       layer and therefore never obtain a Supabase session.
--                       From Postgres' point of view those users are anonymous.
--
-- SECURITY NOTE: the demo holds data cloned from production, so it contains
-- real employee and applicant PII, and the anon key is public in the deployed
-- JS bundle. Granting anon access here makes that PII readable by anyone who
-- opens devtools on the demo site. The right way to close that is to replace
-- the cloned data with synthetic records — scripts/seed-demo-data.mjs, or the
-- pending scripts/seed/dataset_reset.sql — rather than to withhold the grants,
-- which would just leave the demo broken.

begin;

-- ── 1. Schema and table privileges ──────────────────────────────────────────
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete
  on all tables in schema public to anon, authenticated;

grant usage, select
  on all sequences in schema public to anon, authenticated;

grant execute
  on all functions in schema public to anon, authenticated;

-- Anything created later should inherit the same, so a new migration does not
-- silently reintroduce the blank-portal failure on this project.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;

-- ── 2. Baseline policy for tables left with RLS on and no policy ────────────
-- Only touches tables that have NO policy whatsoever. A table that already
-- carries deliberate policies (employees, departments, user_roles) is skipped,
-- so this cannot widen an access rule somebody wrote on purpose.
do $$
declare
  t   record;
  pol text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname   = 'public'
      and c.relkind   = 'r'
      and c.relrowsecurity
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
      )
  loop
    pol := t.relname || '_demo_all';
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
      pol, t.relname
    );
    raise notice 'policy % created on %', pol, t.relname;
  end loop;
end $$;

commit;
