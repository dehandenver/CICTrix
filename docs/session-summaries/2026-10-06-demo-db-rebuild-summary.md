# Demo DB rebuild: summary

Plan: [2026-10-06-demo-db-rebuild.md](../plans/2026-10-06-demo-db-rebuild.md)

## What shipped

The demo project `hydqhmtppkghqaatdgwx` now has production's full `public` schema: 105 tables, 4 views, 34 functions, 25 triggers, 72 policies on 24 RLS tables, 129 foreign keys, and 6 extensions. No production rows and no seed data were copied. The script was applied by the user in the demo's SQL editor as one transaction (`backups/demo-2026-10-06/demo-rebuild-v2.sql`, untracked).

How it was built: a read-only `supabase-prod` MCP server extracted production's catalog with Postgres-generated DDL (19 queries, all against `pg_*` / `information_schema`). A second pass turned it into an additive, re-runnable script with guarded constraints and policies, and `NOT VALID` foreign keys where existing rows were involved.

## Deviations from the plan

- **`employees` recreated.** The demo table was empty and had a different shape, with NOT NULL `employee_id`/`full_name`/`email` and a narrower status check, so app inserts would have failed. With user approval it was dropped and recreated from production's definition, guarded to abort if any row existed.
- **`repair-clone-grants.sql` not run.** After the rebuild, grants already matched production, and anon could read `job_postings`. The script would have opened `accounts` and `office_role_assignments` wider than production.

## Known remaining differences (pre-existing columns on kept tables, left unaltered)

- `job_postings`: `title` and `department` are `text` and nullable (production: `varchar(255) NOT NULL`). `office` was added nullable because 6 rows exist. `experience_years` is `integer` (production: `numeric(4,1)`), so fractional years will be rejected. `created_at` is NOT NULL.
- `user_roles`: `email`, `role` and `name` are `text` (production: `varchar`), and `email` is nullable. `is_active`, `created_at` and `updated_at` are NOT NULL. There is also a demo-only `user_roles_user_id_fkey` to `auth.users`, which is the 129th FK.
- `pm_lnd_reports`: `department` and `period` are nullable. `created_at` is NOT NULL.
- Production's 8 app-referenced relations that exist nowhere (`cold_storage_vault`, `employee_ld_interventions`, `employee_password_resets`, `employee_references`, `employee_voluntary_work`, `ipcr_vault`, `profiles`, `training_plan_publications`) are missing in the demo too.

## Checks run

- Object counts on demo vs production: tables, views, functions, triggers, policies and RLS tables all match.
- Column diff of the demo against production's catalog: 1,258 columns each, none missing or extra. The only differences are the kept-table conflicts listed above.
- Kept rows against the backup: `job_postings` 6, `employee_portal_accounts` 4 (credential fields compared by md5), `user_roles` 4, `positions` 5 and `idp_form_config` 1. All identical.
- Anon REST `select` on `job_postings` with the `.env` key: HTTP 200, 6 rows.
- `check_schema_gap.sql` list: 100 of 108 present. The 8 missing are also absent in production.
- Production access: catalog `select`s only, per `queries.log`, plus one `to_regclass` existence check.
