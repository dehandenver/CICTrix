---
title: Rebuild the HR Demo database schema
date: 2026-10-06
status: Done
summary: Bring the demo Supabase project (hydqhmtppkghqaatdgwx) up to production's schema, structure only, keeping its existing rows and adding no production or seed data.
---

# Rebuild the HR Demo database schema

## Goal

The demo project `hydqhmtppkghqaatdgwx` has 8 of the ~92 public tables the app queries, and `anon` cannot read `job_postings` (42501). Give it production's full schema and working grants so the demo can be presented as a fresh system.

Constraints:

- Keep the existing demo rows: 6 `job_postings`, 4 `employee_portal_accounts`, 4 `user_roles`, 5 `positions`.
- Copy **structure only** from production (`fyzdfgxaaowjzbjpwrii`). No production rows, and no `scripts/seed/dataset_reset.sql` data.
- Production is read, never written.

## Approach

`supabase/full_schema.sql` does not exist, and the migrations cannot rebuild the schema alone (14 core tables were created by hand in production). The only faithful source is production's catalog. Read it through a second Supabase MCP server scoped to production with `read_only=true&features=database`, generate additive DDL, and apply it to the demo without dropping anything.

## Steps

1. Back up every row of the demo's 8 tables to `backups/demo-2026-10-06/` (local, not committed: `employee_portal_accounts` holds credentials).
2. User adds the read-only production MCP and authenticates it.
3. Query production's catalog only: tables, columns, constraints, indexes, sequences, views, functions, triggers, RLS policies, grants.
4. Generate one additive DDL script: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` for the 8 existing tables, constraints, indexes, foreign keys, views, functions, triggers, policies. No `DROP`, no `TRUNCATE`.
5. Apply it to the demo in one transaction, then `scripts/demo/repair-clone-grants.sql`.
6. Verify.

## Deviations

- 2026-10-06, user-approved: the demo `employees` table had 0 rows and a different shape from production (NOT NULL `employee_id`/`full_name`/`email`, a status check rejecting Separated/Retired/Suspended/Deceased), so app inserts would fail. The script drops and recreates it from production's definition, aborting if any row exists. This is the only `DROP`.
- 2026-10-06: `scripts/demo/repair-clone-grants.sql` was not run. After the rebuild, grants already matched production (anon/authenticated blocked on `accounts` and `office_role_assignments`) and anon could read `job_postings`; the script would have loosened grants beyond production.

## Risks

- Existing demo columns may conflict with production types or constraints. Conflicts are reported and resolved case by case, not forced.
- Foreign keys or NOT NULL constraints may fail against the existing rows. Add those constraints `NOT VALID` where needed and report them.
- The grants script makes every public table readable and writable with the public anon key. With no production data copied, the exposure is limited to the kept demo rows, but `employee_portal_accounts` credentials stay readable.
- Rollback: the backup in step 1.

## Checks to run

- `supabase/tools/check_schema_gap.sql` on the demo: every expected relation exists.
- Kept rows unchanged against the backup (counts and contents).
- Anon `select` on `job_postings` with the key in `.env` returns rows.
- No production tool call other than catalog `select`s.
