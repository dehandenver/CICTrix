---
title: Employee Credential Consistency & Release Unit 1 Verification Summary
date: 2026-11-21
status: In Progress
summary: Completed Release Unit 1 (Orders 1-8 across Persistence Tasks 4-7, Credential Tasks 1-5, and the PDS/Hiring integration checkpoint) on fix/persistence-credential-integration. Automated Vitest (192 files/1,815 tests), tsc, zero-warning ESLint, Vite build, migration inventory, Python hiring suites, isolated Postgres SQL/concurrency tests, and ephemeral PostgREST HTTP acceptance passed; live two-profile rendered browser acceptance against a full GoTrue+Kong+PostgREST stack remains Blocked and Release Unit 2 (Tasks 8-9 + Task 10 final) remains open.
plan: 2026-11-19-employee-credential-consistency.md
---

# Employee Credential Consistency & Release Unit 1 Session Summary

## Scope and Release Unit 1 Commit Ledger (`0dd8dd4..56c6262` + docs)

Work executed sequentially on branch `fix/persistence-credential-integration` from base SHA `0dd8dd4`:

| Order | Scope | Commit | Commit Message |
| --- | --- | --- | --- |
| 1a | Persistence Task 4 (PDS load/conflict/uncertain states & snapshots) | `c96658b` | `fix(pds): distinguish unavailable records from empty sections` |
| 1b | Persistence Task 5 (Succession `company_name` query & evidence errors) | `313cb25` | `fix(succession): retain and validate PDS evidence reads` |
| 2 | Persistence Task 6 (`complete_external_hire` RPC, backend/frontend routing, Ranking Report bypass removal) | `8d7de60` | `fix(hiring): make external appointments atomic and replay-safe` |
| 3 | Persistence Task 7A (`20261120195500` active unique indexes, `must_change_password`, `reset_employee_portal_password` RPC, lifecycle SQL/concurrency tests) | `53ace5d` | `feat(employee): add portal account integrity constraints and reset rpc` |
| 4 | Credential Task 1 (Remote-only login/reads, `listEmployeePortalAccountIdentities`, login error differentiation) | `96e4863` | `fix(employee): make connected portal login remote authoritative` |
| 5 | Persistence Task 7B (Create-only `ensureEmployeePortalAccount`, remote allocator, password-free promotional drafts, hiring/metadata callers) | `229ff64` | `fix(hiring): preserve credentials and confirmed completion across callers` |
| 6 | Credential Tasks 2-3 (`changeEmployeePortalPassword`, `changeEmployeePortalUsername`, `EmployeePage`/`SetInitialPasswordPage`/`App` sync + tab re-entry guard) | `4cf6034`, `b5c5b50` | `fix(employee): confirm remote credential changes and synchronize session usernames`; `fix(employee): guard account-tab generation and re-resolve on entry` |
| 7 | Credential Task 4 (`resetEmployeePortalPassword` RPC + `request_id` recovery, both reset modals, targeted cache eviction, legacy cache helper retirement) | `3d63f49` | `fix(employee): verify explicit resets and retire credential cache authority` |
| 8a | Credential Task 5 + Persistence Task 10 PDS/Hiring checkpoint smoke tests | `56c6262` | `test(integrity): add release unit 1 cross-boundary acceptance suites` |

## Key Rulings and Deviations Observed

1. **Order 5 (`promotionEntry.smoke.test.tsx`) ruling:** `src/test/promotionEntry.smoke.test.tsx` was updated alongside `hiringFlow` callers to assert password-free `PortalAccountIdentity` promotional results without `password` leakage.
2. **UI Scope & Routes:** `src/modules/admin/RSPDashboard.tsx`'s Ranking Report modal hire bypass was replaced with navigation to `/admin/rsp/for-hiring` (`Order 2`). `src/modules/admin/components/EmployeeDetailPage.tsx` has no route in `src/App.tsx` (mounted only by unrouted `EmployeeDirectory.tsx`), so its explicit reset parity is established via `EmployeeDetailPage.credentials.test.tsx`.
3. **Retired Cache Helper Test Fixture Note:** `src/modules/applicant/ApplicantWizard.test.tsx` lines 44-46 retain inert unused keys (`findEmployeePortalAccount`, `getEmployeePortalAccounts`, `findEmployeePortalAccountFromSupabaseByEmployeeIdOrEmail`) inside a test-local `vi.mock` object; a full `src/` non-test caller scan confirms zero production references remain.
4. **Isolated Postgres Schema Variance Observed During Order 8 Verification:**
   - `supabase/tests/pds_section_transactions.test.sql` and `pds_section_concurrency.sh` pass cleanly on `cictrix-integrity-e1aa71a5` database `integrity_repairs` (`ALL PDS SECTION TESTS PASSED`, `ALL PDS SECTION CONCURRENCY TESTS PASSED`); when run unmodified against `external_hire_test`, `pds_section_transactions.test.sql` hits `enforce_active_office()` (`Office "PDS Department rollback-children" is not an active office`) because `external_hire_test` carries the active-office trigger and `0` seeded rows in `departments`.
   - `supabase/tests/promotional_appointment.test.sql` on `external_hire_test` passes completion/replay/grants/caller checks (`notices` at lines 209, 225, 260) and hits `23505` (`employee_portal_accounts_active_employee_number_uidx`) at line 368 when its earlier `rej6` fixture intentionally inserts a second active `employee_portal_accounts` row for `'TEST-rej6'`, confirming Order 3's active identity uniqueness constraint blocks duplicate active `employee_id` accounts at the database layer.

## Observed Verification Results (Post-`56c6262`)

| Gate | Command / Scope | Observed Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | Exit 0 (0 errors) |
| Full Vitest (`--dir src`) | `npx vitest run --dir src` (`VITE_SUPABASE_URL=http://127.0.0.1:54329`, placeholder anon key) | **192 test files passed, 1,815 tests passed** (0 failures, 0 skipped) |
| Cross-boundary acceptance smoke suites | `src/App.employee-auth.test.tsx` (7), `src/test/pdsIntegrity.smoke.test.tsx` (1), `src/test/externalHiringIntegrity.smoke.test.tsx` (2) | **3 files passed, 10 tests passed** |
| ESLint | `npm run lint` (`--max-warnings 0`) | Exit 0 (0 errors, 0 warnings) |
| Production build | `npm run build` (`TEMP` scoped to `.superpowers/esbuild-tmp` due to Windows Defender lock in system `%TEMP%`; temp dir removed after build) | Exit 0 (`3156 modules transformed`, `15.76s`; pre-existing chunk >500 kB warning) |
| Migration inventory | `npm run check:migrations` | Exit 0 (`supabase/migrations OK (133 files)`) |
| Python backend | `python -m unittest backend/test_external_hiring.py backend/test_promotional_hiring.py` | Exit 0 (`Ran 30 tests in 0.568s`, `OK`) |
| Diff hygiene | `git diff --check` | Exit 0 |
| Production caller scan | `git grep -nE "...retired..." -- "src/" ":!*test*"` | Zero production callers to retired cache helpers; `EMPLOYEE_PORTAL_ACCOUNTS_KEY` accessed only in `evictObsoleteCachedCredential` (+ constant/export in `src/lib/employeePortalData.ts`) |
| Isolated Postgres SQL & concurrency (`cictrix-integrity-e1aa71a5`) | `pds_section_transactions.test.sql` + `pds_section_concurrency.sh` (`integrity_repairs`); `external_hire.test.sql` + `external_hire_concurrency.sh` (`external_hire_test`); `portal_account_lifecycle.test.sql` + `portal_account_lifecycle_concurrency.sh` (`external_hire_test`) | All 6 listed suites exited 0 with `ALL ... TESTS PASSED` markers; `promotional_appointment.test.sql` hit `23505` on `rej6` duplicate `employee_id` fixture as noted above |
| Isolated PostgREST HTTP acceptance | Ephemeral `public.ecr.aws/supabase/postgrest:v16.5` (`cictrix-pgrst-verify`) on `cictrix-integrity-e1aa71a5`/`external_hire_test` (`127.0.0.1:54399`) with real HS256 JWTs | `reset_employee_portal_password`: `anon` `401`/`42501`, non-RSP `authenticated` `403`/`42501`, RSP `200`, `GET /employee_password_resets` `200` (1 metadata row, no `password`), stale `40001` (`500`/`revision_conflict`), dup `p_request_id` `23505` (`409`/`duplicate_request_id`); `complete_external_hire`: `anon` `401`/`42501`, non-RSP `authenticated` `403`/`42501`; `read_pds_section` & `save_pds_section` `200` round-trip + stale `40001` (`500`). Synthetic rows and `cictrix-pgrst-verify` removed (`docker ps -a` verified clean) |

## Blocked Gates and Explicit Security Boundaries

- **Blocked — Live two-profile rendered browser acceptance against a full disposable Auth+Kong+PostgREST stack:** Blocked locally because no Playwright/browser-automation dependency is installed (`package.json` constraint prohibits adding dependencies) and `cictrix-integrity-e1aa71a5` runs as an isolated Postgres container (`NetworkMode=none`) without a GoTrue/Kong stack (pre-existing `supabase_db_cictrix-schema-test` must not be modified or reset). Mocked Vitest cross-context tests and ephemeral PostgREST HTTP checks do not substitute for this live rendered two-profile browser gate.
- **Approval-gated operational items (not authorized by this run):** Branch push, PR/merge, Vercel/Supabase deployment, and live reconciliation of `portal-EMP-CC334757` (`docs/handoff/employee-credential-reconciliation.md`) each require separate explicit approval.
- **Unresolved pre-existing security scope (explicitly out of scope for Release Unit 1):**
  - `employee_portal_accounts.password` remains plaintext and compared in JavaScript.
  - Existing permissive RLS policies / public table grants (`employees`, `employee_portal_accounts`, etc.) remain open to arbitrary/legacy raw REST writers outside supported application clients; timestamp optimistic concurrency protects only against supported monotonic writers.
  - Browser-side routing (`/employee/set-password`) is workflow persistence, not a server-enforced authorization barrier, and existing browser sessions are not invalidated or revoked after an HR reset or self-password change.
- **Remaining Persistence Plan Work:** Release Unit 2 (Persistence Tasks 8–9 training repairs and final Task 10 integration acceptance) remains open.
