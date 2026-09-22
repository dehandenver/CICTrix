-- ─────────────────────────────────────────────────────────────────────────────
-- DEMO / CLONE RESET — DESTRUCTIVE, NOT FOR PRODUCTION
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Drops and recreates the public schema, giving the project the empty database
-- that supabase/full_schema.sql is written to run against.
--
-- This deletes every table, view, function and row in `public`. It exists for
-- one situation only: a demo/clone project whose schema was half-applied and
-- which therefore cannot be reconciled forward, because full_schema.sql builds
-- from nothing and the migration set is not safe to replay (several migrations
-- open with DROP TABLE ... CASCADE).
--
-- Intended order of operations:
--   1. scripts/demo/reset-schema.sql          <- this file
--   2. supabase/full_schema.sql               (rebuild the schema)
--   3. scripts/demo/repair-clone-grants.sql   (anon/authenticated access)
--   4. node scripts/create-admin-accounts.mjs --target-env .env.demo --rotate
--   5. scripts/seed/dataset_reset.sql         (data)
--
-- Step 4 is required, not optional: user_roles lives in public and is dropped
-- here, so without it every admin portal rejects logins with "No role
-- assigned" even though the Supabase Auth users still exist.
--
-- apply-sql.mjs refuses a production connection string unless --allow-prod is
-- passed. Do not pass it for this file.

drop schema if exists public cascade;
create schema public;

-- Supabase's stock ownership and grants for a fresh project. Without these the
-- roles cannot even see the schema, and every request fails before RLS is
-- reached.
alter schema public owner to postgres;

grant usage  on schema public to anon, authenticated, service_role;
grant all    on schema public to postgres, service_role;

-- Default privileges so objects created by the rebuild are reachable by the
-- API roles as they are created, rather than needing a second sweep afterwards.
alter default privileges in schema public
  grant all on tables    to postgres, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, service_role;
alter default privileges in schema public
  grant all on functions to postgres, service_role;

comment on schema public is 'standard public schema';
