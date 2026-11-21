---
title: Persistence Integrity Repairs & Release Unit 2 Final Verification Summary
date: 2026-11-21
status: In Progress
summary: Completed Release Unit 1 (Orders 1-8) and Release Unit 2 (Orders 9a-9c) on fix/persistence-credential-integration, plus read-only production preflight on fyzdfgxaaowjzbjpwrii and live two-origin rendered browser acceptance against a disposable Docker Supabase stack (GoTrue+Kong+PostgREST+Postgres). Automated suites (199 files/1,903 tests), tsc, lint, build, migrations (134 files), Python (30/30), SQL/concurrency, and live browser checks passed; push/PR/merge/deployment and single-account reconciliation remain approval-gated.
plan: 2026-11-17-persistence-integrity-repairs.md
---

# Persistence Integrity Repairs & Release Unit 2 Session Summary

## Scope and Branch Commit Ledger (`0dd8dd4..eeb57cb`)

Work executed sequentially on `fix/persistence-credential-integration` from base SHA `0dd8dd4` (`upstream/main` `bbb196c` + planning amendments).

### Release Unit 1 (`0dd8dd4..d4d2149`)

| Order | Scope | Commit | Commit Message |
| --- | --- | --- | --- |
| 1a | Persistence Task 4 (PDS load/conflict/uncertain states & snapshots) | `c96658b` | `fix(pds): distinguish unavailable records from empty sections` |
| 1b | Persistence Task 5 (Succession `company_name` query & evidence errors; Option A `CandidateEvidenceReviewModal.tsx` fix) | `313cb25` | `fix(succession): retain and validate PDS evidence reads` |
| 2 | Persistence Task 6 (`complete_external_hire` RPC, backend/frontend routing, Ranking Report bypass removal) | `8d7de60` | `fix(hiring): make external appointments atomic and replay-safe` |
| 3 | Persistence Task 7A (`20261120195500` active unique indexes, `must_change_password`, `reset_employee_portal_password` RPC, lifecycle SQL/concurrency tests) | `53ace5d` | `feat(employee): add portal account integrity constraints and reset rpc` |
| 4 | Credential Task 1 (Remote-only login/reads, `listEmployeePortalAccountIdentities`, login error differentiation) | `96e4863` | `fix(employee): make connected portal login remote authoritative` |
| 5 | Persistence Task 7B (Create-only `ensureEmployeePortalAccount`, remote allocator, password-free promotional drafts, hiring/metadata callers) | `229ff64` | `fix(hiring): preserve credentials and confirmed completion across callers` |
| 6 | Credential Tasks 2–3 (`changeEmployeePortalPassword`, `changeEmployeePortalUsername`, `EmployeePage`/`SetInitialPasswordPage`/`App` sync + tab re-entry guard) | `4cf6034`, `b5c5b50` | `fix(employee): confirm remote credential changes and synchronize session usernames`; `fix(employee): guard account-tab generation and re-resolve on entry` |
| 7 | Credential Task 4 (`resetEmployeePortalPassword` RPC + `request_id` recovery, both reset modals, targeted cache eviction, legacy cache helper retirement) | `3d63f49` | `fix(employee): verify explicit resets and retire credential cache authority` |
| 8a | Credential Task 5 + Persistence Task 10 PDS/Hiring checkpoint smoke tests | `56c6262` | `test(integrity): add release unit 1 cross-boundary acceptance suites` |
| 8b | Release Unit 1 verification & single-account reconciliation runbook | `d4d2149` | `docs: record release unit 1 verification and credential reconciliation runbook` |

### Release Unit 2 (`d4d2149..eeb57cb`)

| Order | Scope | Commit | Commit Message |
| --- | --- | --- | --- |
| 9a | Persistence Task 8 (`20261121001057_training_calendar_transaction.sql`, `trainingCalendar.ts`, `trainingCompetencies.ts`, `TrainingCalendar.tsx`, SQL & Vitest tests) | `2e689a3` | `fix(training): save calendar content and competencies together` |
| 9b | Persistence Task 9 (`trainingAttendance.ts`, `trainingEvaluations.ts`, `lndArchive.ts`, `AttendanceGrid.tsx`, `LndTrainingEvaluation.tsx`, `LndArchive.tsx`, unit/UI tests) | `b3ae80b`, `26d0c52` | `fix(training): protect records from failed loads and stale edits`; `fix(training): guard late evaluation and attendance mutations across session switches` |
| 9c | Persistence Task 10 Final (Release Unit 2 training cross-boundary smoke suite) | `eeb57cb` | `test(training): add release unit 2 training integrity smoke suite` |

## What Shipped vs. Planned

- **Historical Tasks 1–3 (`upstream/main` `bbb196c`):** Already deployed before this integration branch (`20261117101141_pds_section_transactions` on production). Preserved untouched.
- **Tasks 4–7 & Credential Tasks 1–5 (Release Unit 1):** All code, migrations (`20261120160156`, `20261120195500`), SQL/concurrency suites, and PDS/Hiring/Auth smoke suites shipped in `c96658b..56c6262` and documented in [docs/session-summaries/2026-11-19-employee-credential-consistency-summary.md](2026-11-19-employee-credential-consistency-summary.md).
- **Task 8 (Order 9a — `2e689a3`):** Implemented `20261121001057_training_calendar_transaction.sql` (`client_request_id` + partial unique index, `SECURITY INVOKER` LND/ADMIN actor gate, `read_training_calendar_event` deterministic UTC revision snapshot, `save_training_calendar_event` advisory-locked create replay, whitelisted `training_calendar_merge_event`, 3-day lock cutoff extended to competency changes while keeping unchanged saves and permitted status updates allowed, diff delete/insert preserving unchanged join IDs & weights, monotonic `updated_at`), exclusive RPC service routing (`trainingCalendar.ts`, `trainingCompetencies.ts`), and snapshot-backed dialog error/conflict/draft preservation (`TrainingCalendar.tsx`).
- **Task 9 (Order 9b — `b3ae80b`, `26d0c52`):** Converted `listAttendance`, `listEvaluableTrainings`, `resolveIdentities`, `getEvaluationBoard` (all 5 queries), `listTrainingArchive`, and `listArchiveOfficeDirectory` to honest error propagation; added raw microsecond `updatedAt: string | null` compare-and-set in `patchEvaluation` (`+2ms` monotonic advance, pure `.insert(...).select('updated_at')` with `23505` conflict check, `.update(...).eq('updated_at', expectedUpdatedAt).select('updated_at')` zero-row conflict check), explicit `0` & `null` score handling, single-field `saveScores` patches, `uploadOutput` `partialFailure` reporting, and `saveReportNotes` row verification; hardened `AttendanceGrid.tsx`, `LndTrainingEvaluation.tsx`, and `LndArchive.tsx` with generation/scope/session guards on both reads and in-flight mutations, initial-failure `Retry` blocks, `Refresh` stale banners disabling mutators until refreshed, and `abyan-tokens.css` variables.
- **Task 10 Final (Order 9c — `eeb57cb` + final checkpoint):** Added `src/test/trainingIntegrity.smoke.test.tsx` covering cross-boundary calendar+competency atomic saves/locks/Office views, live attendance -> Archive propagation & error refusal, and evaluation honest reads/single-field patches/raw `updated_at` CAS/23505 races/`uploadOutput` partial failures; executed full-branch verification and real isolated Postgres + ephemeral PostgREST HTTP acceptance for Release Unit 2. Live rendered browser checks and push/PR/deployment remain Blocked / Approval-gated, so plan `status` remains `In Progress`.

## Key Rulings and Deviations Observed

1. **Order 1b (`CandidateEvidenceReviewModal.tsx` Option A):** Included `src/modules/admin/components/CandidateEvidenceReviewModal.tsx` and its tests in Task 5 after verifying it queried the same nonexistent `employee_work_experience.department_agency_office_company` column and discarded read errors across all four evidence queries directly downstream of `successionPipelineV2.ts`.
2. **Order 5 (`promotionEntry.smoke.test.tsx`) fixture ruling:** Updated `src/test/promotionEntry.smoke.test.tsx` to supply `must_change_password: false` on `accountRow()` fixtures and assert password-free `PortalAccountIdentity` outcomes.
3. **UI Scope & Routes:** Replaced `src/modules/admin/RSPDashboard.tsx`'s Ranking Report modal hire bypass with navigation to `/admin/rsp/for-hiring` (`Order 2`). `src/modules/admin/components/EmployeeDetailPage.tsx` has no route in `src/App.tsx` (mounted only by unrouted `EmployeeDirectory.tsx`), so its explicit reset behavior is verified via `EmployeeDetailPage.credentials.test.tsx`.
4. **Retired Cache Helper Test Fixture Note:** `src/modules/applicant/ApplicantWizard.test.tsx` retains inert mock keys (`findEmployeePortalAccount`, `getEmployeePortalAccounts`, `findEmployeePortalAccountFromSupabaseByEmployeeIdOrEmail`) inside a test-local `vi.mock` object; `git grep` across non-test `src/` confirms zero production callers remain (`EMPLOYEE_PORTAL_ACCOUNTS_KEY` appears only in `evictObsoleteCachedCredential` plus its constant/export in `src/lib/employeePortalData.ts`).
5. **Isolated Postgres Schema Variance Notes:**
   - `pds_section_transactions.test.sql` and `pds_section_concurrency.sh` pass cleanly on `cictrix-integrity-e1aa71a5` database `integrity_repairs`; against `external_hire_test`, `pds_section_transactions.test.sql` hits `enforce_active_office()` at `rollback-children` because `external_hire_test` carries 0 seeded `departments` rows.
   - `promotional_appointment.test.sql` on `external_hire_test` passes completion/replay/grants/caller checks and hits `23505` (`employee_portal_accounts_active_employee_number_uidx`) on its `rej6` duplicate `employee_id` fixture row, confirming Order 3's active unique index blocks duplicate active accounts in Postgres.

## Observed Verification Results (Post-`eeb57cb`)

| Gate | Command / Scope | Observed Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` (`VITE_SUPABASE_URL=http://127.0.0.1:54329`, placeholder anon key) | Exit 0 (0 errors) |
| Full Vitest (`--dir src`) | `npx vitest run --dir src` | **199 test files passed, 1,903 tests passed** (0 failures, 0 skipped) |
| Release Unit 2 training smoke suite | `npx vitest run --dir src src/test/trainingIntegrity.smoke.test.tsx` | **1 file passed, 3 tests passed** |
| ESLint | `npm run lint` (`--max-warnings 0`) | Exit 0 (0 errors, 0 warnings) |
| Production build | `npm run build` (`TEMP`/`TMP` scoped to `.superpowers/esbuild-tmp`, removed after build) | Exit 0 (`3156 modules transformed`, `✓ built in 17.03s`; pre-existing chunk >500 kB warning) |
| Migration inventory | `npm run check:migrations` | Exit 0 (`supabase/migrations OK (134 files)`) |
| Python backend | `python -m unittest backend/test_external_hiring.py backend/test_promotional_hiring.py` | Exit 0 (`Ran 30 tests in 1.665s`, `OK`) |
| Whole-branch diff hygiene | `git diff --check 0dd8dd4..HEAD` | Exit 0 |
| Trailer & caller hygiene | `git log 0dd8dd4..HEAD --grep="Co-Authored-By"` + non-test `src/` `git grep` | Zero `Co-Authored-By` trailers; zero production callers to retired credential cache helpers |
| Release Unit 2 SQL suite (`cictrix-integrity-e1aa71a5`) | `psql -X -U postgres -d external_hire_test -v ON_ERROR_STOP=1 < supabase/tests/training_calendar_transaction.test.sql` | Exit 0 (`NOTICE: ALL TRAINING CALENDAR TRANSACTION TESTS PASSED`, `ROLLBACK`) |
| Release Unit 1 SQL & concurrency suites (`cictrix-integrity-e1aa71a5`, recorded at `56c6262`) | `pds_section_transactions.test.sql` + `pds_section_concurrency.sh` (`integrity_repairs`); `external_hire.test.sql` + `external_hire_concurrency.sh` & `portal_account_lifecycle.test.sql` + `portal_account_lifecycle_concurrency.sh` (`external_hire_test`) | All 6 suites exited 0 with `ALL ... TESTS PASSED` (`promotional_appointment.test.sql` hits expected `23505` on `rej6` as noted above) |
| Release Unit 2 isolated PostgREST HTTP acceptance | Ephemeral `public.ecr.aws/supabase/postgrest:v16.5` (`cictrix-pgrst-verify-ru2`, `127.0.0.1:54399`, `external_hire_test`) with HS256 JWTs | `save_training_calendar_event`: `anon` `401`/`42501`, `RSP` `403`/`42501`, `LND` create `200`, `p_request_id` replay `200` (same ID, 1 session row), `read_training_calendar_event` `200` (2 tags), invalid competency UUID `409`/`23503` (title untouched), valid update `200` (new `revision`, retained join `id` & weight `4`), stale `p_expected_revision` `500`/`40001`, locked session `400`/`23514` (`training_locked`); `training_evaluations` CAS: raw `2026-11-21T00:00:00.123456+00:00` `PATCH` `+2ms` returned `200` (`1` row), repeated stale `PATCH` returned `200` (`0` rows). Synthetic rows & container cleaned (`docker ps -a` and row counts `0` verified) |
| Release Unit 1 isolated PostgREST HTTP acceptance (`56c6262`) | Ephemeral `cictrix-pgrst-verify` (`127.0.0.1:54399`, `external_hire_test`) with HS256 JWTs | Verified `reset_employee_portal_password` (`401`/`403`/`200`/`40001`/`23505` + secret-free audit read), `complete_external_hire` (`401`/`403`), and `read_pds_section`/`save_pds_section` (`200`/`40001`) |
| Read-only production preflight (`fyzdfgxaaowjzbjpwrii`) | Supabase MCP `list_projects`, `list_migrations`, read-only `execute_sql` | `131` applied migrations ending at `20261117101141_pds_section_transactions` (`+3` additive local = `134`); `dup_app_id_groups = 0`, `orphan_app_ids = 0`, `active_portal_accounts = 137`, `missing_emp_id = 0`, `missing_username = 0`, `dup_emp_groups = 0`, `dup_user_groups = 0`, `must_change_password = null`, `request_id = null`, `client_request_id = null`; `portal-EMP-CC334757` confirmed single active row (`EMP-CC334757`, `ryanlopezcastro`, `updated_at = 2026-10-29 05:57:53.2+00`) |
| Live two-origin rendered browser acceptance | Disposable Docker Supabase stack (`cictrix-browser-verify`: Postgres 17 + GoTrue + PostgREST + Storage + Realtime + Kong on `55321`/`55322`), scratch lost-response proxy (`55329`), two isolated Vite origins (`127.0.0.1:5179` & `127.0.0.1:5180`), Chromium (`browser` subagent) | **RU1:** External hire (`EMP-32000000`, `EMP-33000000`) + collision refusal + replay safety after mid-response post-commit `complete_external_hire` drop (zero duplicate rows on `/admin/rsp/new-hired`), remote-only login (`employee01` & old passwords rejected), durable `/employee/set-password` on create and HR reset, cross-origin `:5180` -> `:5179` password sync, stale-revision conflict rejection on open form after HR reset, genuine mid-response post-commit `reset_employee_portal_password` drop (`ERR_CONTENT_LENGTH_MISMATCH`) recovered via secret-free `employee_password_resets` `(account_id, request_id)` metadata readback (`request_id = 520e89b6-...`, username preserved), username rename + reload + promotional `/apply` prefill, PDS `read_pds_section`/`save_pds_section`, and Succession V1/V2 + `CandidateEvidenceReviewModal` (`company_name` = `City Government of Iloilo - CHRMO`, zero error banners). **RU2:** Training Calendar edit + competency tag persistence across reload, new future session create, 3-day lock cutoff (`Locked`, zero edit/cancel controls), and AttendanceGrid half-day marks + excuse notes persisted across reload and propagated live to L&D Archive (`67%`, `Completed`). Disposable stack torn down and verified clean (`docker ps -a`). |

## Remaining Notes, Approval Gates & Security Non-Claims

- **Observed live browser scope & pre-existing UI findings:**
  - `LndTrainingEvaluation.tsx` is unrouted/unmounted in `src/` (imported only by `LndTrainingEvaluation.test.tsx`, like unrouted `EmployeeDetailPage.tsx` and `QualifiedApplicantsPage.tsx`), so its UI/service/microsecond-CAS behavior is verified via Vitest and standalone PostgREST HTTP checks rather than a live routed screen.
  - Direct JS `localStorage` inspection/seeding (`evaluate`) is restricted by the browser tool sandbox, so stale-cache `cictrix_employee_portal_accounts` seeding and password-free draft serialization remain verified by `App.employee-auth.test.tsx` and `applicationDrafts.test.ts` (cross-origin storage isolation was verified live across `:5179` and `:5180`).
  - Pre-existing `CandidateEvidenceReviewModal.tsx` UI/§16 drift observed during live inspection (not introduced by this branch): white header with dark navy title instead of deep-blue header/white title, `Escape` key does not close the modal, and Education displays course/level/year without `school_name`. Pre-existing responsive rail width on `375px` mobile leaves narrow horizontal scroll wrappers on wide tables.
- **Approval-gated operational items (not executed in this run):**
  - Branch push, PR creation/merge, Vercel/Supabase deployment, and live reconciliation of `portal-EMP-CC334757` ([docs/handoff/employee-credential-reconciliation.md](../handoff/employee-credential-reconciliation.md)) remain separately approval-gated.
- **Pre-existing security boundaries explicitly out of scope:**
  - `employee_portal_accounts.password` remains plaintext and compared in JavaScript.
  - Existing permissive RLS policies / public table grants (`employees`, `employee_portal_accounts`, `training_*`) remain open to arbitrary/legacy raw REST writers outside supported application clients.
  - Browser-side routing (`/employee/set-password`) is workflow persistence, not a server-enforced authorization barrier, and existing browser sessions are not invalidated after an HR reset or self-password change.
