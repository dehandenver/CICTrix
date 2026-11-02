---
title: Promotional hiring implementation progress
date: 2026-10-30
summary: Tasks 1–7 are committed and verified. Task 8’s isolated acceptance passed for the promotion transaction (one employee, unchanged account, retry-safe, mixed batches correct). The defects it found that block the plan, F1–F3 and the pre-existing external-hire office failure F4, are fixed; F5–F8 are pre-existing and tracked separately. The 2026-11-02 failure-path run and branch review fixed the shared modal focus gap (`4a947ed`) and found F9–F12 in score saving and the uncertain-promotion message; they are open.
---

## Scope and current state

Implementation follows [the approved plan](../plans/2026-10-30-promotional-hiring-fixes.md), including scheduled promotional interviewer visibility. Remediation, live writes, emails, pushes and deployments remain excluded.

Paused after completing and reviewing Task 3 and running unit tests across Tasks 1–3, as requested. Task 3A and Task 7 were completed later the same day (see below). **Resume at Task 4**, which requires an isolated database. Tasks 4–6 and 8 remain pending; Task 7 must not be redispatched. Fork push and upstream PR remain subject to separate authorization. This is a partial repair, not completion of the promotional appointment pipeline.

Worktree: `C:\Users\ajcbu\.local\share\opencode\worktree\6c6304\promotional-hiring-fixes-build`, branch `fix/promotional-hiring-pipeline`. Existing audit/plan documents were copied into this worktree without deleting the originals. The original checkout and `run-queue.bat` remain untouched.

Models/connections: `openai/gpt-6.1-sol#high` for coordination and review through existing OpenAI OAuth; `deepseek/deepseek-flash#max` (catalog identity DeepSeek V4.1 Flash 1017) for implementation/tests through the existing paid key connection. Accepted product commits: Task 1 `1dda88f`, Task 2 `c29adba`, Task 3 `20c24f1`. Each task had one successful review correction and zero unsuccessful corrective attempts. No builders remain active.

Task 1 resolves promotion entry from current remote username/employee-number credentials, independent of browser cache. Explicit soft-delete filtering, literal underscore matching, wildcard rejection and a missing-employee-number guard were added in a successful corrective round. Parent independently verified 22/22 targeted tests, TypeScript and zero-warning scoped ESLint, then included these tests in the final full src run. Existing post-auth profile-read error handling is unchanged and remains a review note. No account credentials were changed.

Task 2 makes category saving awaited and publishes browser cache/events after remote success, with UUID-keyed durable summary reads and explicit error states. Parent review caught the omitted `oral_exam` projection; a successful correction added the column, projection-aware original-total regressions, and deferred-upsert tests proving no pending/rejected save publication. Parent independently verified 52/52 targeted/existing tests, TypeScript, and zero-warning scoped ESLint, then included these tests in the final full src run. The 130-point rollup and separate written-exam conversion are unchanged.

Task 3 restores same-email promotion visibility and saved summary totals, removes read-side applicant upserts, and shows summary-read errors. Review caught browser-only evaluations overriding original-applicant ranking; the accepted correction limits real UUID originals to persisted evaluations with durable-summary fallback. Coverage includes account-only matching, remote terminal/deleted rows over stale local candidates, filled slots, reservations and revoked selections. The builder's corrected targeted run passed 29 tests; parent independently verified the corrected revision in the final full src suite. Promotion ranking uses the saved five-category assessment total, retains the separate written exam requirement and does not invent oral scores. The score header now reads “Assessment / Interview Score”; layout and tokens are unchanged.

Read-only boolean schedule inspection found a cause for Task 3A: the scheduled promotion has a valid date/time, active assigned rater and Open posting/slot, but both interviewer screens' `@example.com` demo-email heuristic excludes it. The plan now requires a synthetic persisted-UUID regression for that exclusion before changing the display logic. No live email, schedule or assignment was changed.

## Task 3A: scheduled promotional interviews (resumed 2026-10-30)

Shipped as `180c831` on `fix/interviewer-scheduled-promotions`, stacked on `fix/applicant-status-score-writes`. Not pushed. It was built inline in a Claude Code cloud session rather than through the approved OpenAI/DeepSeek route, which isn't available there. The plan records this as a deviation.

Planned vs. shipped: the plan allowed changes to schedule, assignment, posting and evaluation code "as evidence requires". The evidence pointed only at the `@example.com` demo filter in `InterviewerDashboard.tsx` and `InterviewerApplicantsList.tsx`, and that is the only product change. `EvaluationForm.tsx` already read the persisted application type, so it got a regression test but no edit. Closed-posting reachability, realtime and rescheduling, assignment changes, same-title postings across offices, read-failure reporting and the submit round trip were not covered. The plan lists them as follow-ups. The submit round trip moves to Step 3 of [Fix applicant score and status writes](../plans/2026-10-30-applicant-status-and-score-writes.md), which now owns `EvaluationForm.tsx`. Live data evidence for both plans is in [the live database check](2026-10-30-live-db-claims-verification-summary.md). The fixes plan's "Before starting Tasks 4–8" section lists where the two plans touch.

Checks: the new tests fail without the fix and pass with it. Results: `npx vitest run src/lib/applicantSchedule.scheduled.test.ts src/modules/interviewer` gives 8 files / 54 tests passed; `npx tsc --noEmit` and `npm run lint` pass. The full `npm test` run gives 1,266 of 1,268 tests passed. The 2 failures are pre-existing: the live-data seed test and `trainingProgress.test.ts`, which also fails on the base commit when the clock is in UTC. Live data was read with the publishable key using GET only; nothing was written.

## Task 4: atomic promotion transaction (2026-11-02)

Shipped on `fix/promotional-appointment-transaction`, cut from `upstream/main` (`e110977`). Not pushed. Built inline in a Claude Code session (Opus), the same route deviation as Task 3A.

Planned vs. shipped: `public.complete_promotional_appointment(p_applicant_id, p_actor_user_id)` as specified. It updates the existing employee's position, office, division and plantilla number; fills the reserved plantilla; writes `Hired`; and appends one `promoted` history row by the verified actor, all in one transaction. It never inserts an employee or account and never touches the account, hire date or employment status. Deviations: the lock order is employee → plantilla → application → account rather than plantilla first, because the plantilla-first draft deadlocks when two promotions of one person run together. Errors carry machine-readable hints for Task 5, and the history row is matched to its application by its `remarks` text so replays need no schema change.

Test database: Docker Desktop and a local Supabase stack (CLI 2.122.0) were set up on this machine. The repo migrations cannot replay from empty because several core tables were created by hand in production, so production's public schema was generated from its catalog through read-only MCP queries and loaded locally. It fingerprint-matches production (123 tables, 73 functions, 41 triggers, 5 views, 104 policies, grants and indexes; constraints after normalizing equivalent cast text). Nothing was written to production.

Checks:
- `psql -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/promotional_appointment.test.sql` on the local stack: all 8 groups pass (completion, replay, replay after a later promotion, service-role caller, 7 refused callers, 18 data rejections, 2 partial-completion conflicts, injected-failure rollback, grants). It failed before the migration existed.
- `DB_CONTAINER=supabase_db_cictrix-schema-test bash supabase/tests/promotional_appointment_concurrency.sh`: both scenarios pass (same application twice: one completion and one `already_completed`; same employee, two promotions: no deadlock, the second is refused), and its cleanup leaves no rows.
- `npm run check:migrations`: OK, 129 files.
- No TypeScript or Python changed, so `tsc`, lint and Vitest were not rerun. `src/types/database.types.ts` was not regenerated.

Open: `npx supabase init` added `supabase/config.toml` and `supabase/.gitignore`, which are left uncommitted pending a team decision. The repo's inability to build a database from its migrations is a separate gap.

## Task 5: shared appointment entry points (2026-11-02)

Shipped on `fix/promotional-appointment-transaction`. Not pushed. A Sonnet (high) builder wrote it test-first; Opus reviewed the diff and reran every check. Planned vs. shipped matches the plan, with one addition: a 30-second timeout on the browser RPC call so a hung request reports an uncertain, retryable result instead of sticking the screen. Details and the out-of-scope problems the builder found are in the plan's Task 5 checkpoint.

Checks (rerun by the reviewer): `npx vitest run src/lib/api/promotionalHiring.test.ts src/lib/api/employeesApi.promotion.test.ts` 50 passed; `python -m unittest test_promotional_hiring` from `backend` 19 passed; `npx tsc --noEmit` and `npm run lint` pass; full `npx vitest run src` with local placeholder Supabase settings 148 files / 1,333 tests passed, with no failures. Red evidence: against the old `employeesApi.ts`, 13 of the 17 new hire tests failed (every promotion case); the backend tests failed before the new branch. A real-API check through the local PostgREST confirmed the error codes and hints the classifier depends on.

## Task 6: account-preserving results (2026-11-02)

Shipped on `fix/promotional-appointment-transaction`. Not pushed. Two Sonnet (high) builders worked test-first in parallel lanes (`hiringFlow` and the Generate Credentials page); Opus reviewed both diffs and reran every check. Promotions now complete through the Task 4 transaction only, with no new account, password, credential email or Newly Hired record, and the result modal reports them separately from credentials. Deviation: `promotions` carries name, position, office and plantilla alongside the RPC result. Details are in the plan's Task 6 checkpoint.

Checks (rerun by the reviewer): `npx vitest run src/lib/hiringFlow src/components/GenerateCredentialsPage` 4 files / 28 passed; `npx tsc --noEmit` and `npm run lint` pass; full `npx vitest run src` with placeholder Supabase settings 149 files / 1,347 tests passed, with one unhandled teardown error from the untouched `CompetencyFrameworkPage.test.tsx`. Red evidence: 8 of 9 new hiringFlow tests and 5 of the new page tests failed against the old code.

Branch review (Opus, Tasks 4–6): ready with fixes, no critical issues. The one important finding is fixed: a stale cached type could let the external steps reset a promoted employee's password, so `hireApplicantWithOutcome` now reports promotions and the batch stops before any account step. Four of the seven minor findings were then fixed at the user's request (retryable lock and deadlock errors, replay before the account check, NULL status, ambiguous office); the other three are listed in the plan's Task 6 checkpoint. For those fixes: the DB suite (with three new cases) and both concurrency scenarios pass on the local stack, with the replay-after-account-change case failing first against the old function; 4 new TS cases and 6 new backend cases failed first; then 36 related files / 665 tests, backend 20 tests, full suite 149 files / 1,353 tests (one to five unhandled teardown errors from untouched files, varying by run), tsc, lint and `check:migrations` pass. After the fix: 6 related files / 79 tests, full suite 149 files / 1,348 tests (same unrelated teardown error), tsc and lint pass.

## Task 8: isolated acceptance (2026-11-02)

Run in the browser against the local Supabase stack with synthetic Filipino-named people, a local mail sink and no production access. No code changed. Full results and finding IDs are in the plan’s Task 8 checkpoint.

Passed: the fresh-browser promotional application through screening, scheduling, interviewer PCPT (visible in counts, list and history after reload), scoring, reserve/revoke/reserve and completion. The completion kept one employee with the same UUID, number, hire date and account, recorded one history event, filled the plantilla, archived the rival and withdrew the other open application. A replay changed nothing; clean-browser sign-in with the existing account worked; a mixed batch issued credentials, email and a print card only to the external hire; stale, busy (`57014` after 8 s) and concurrent completions changed nothing and showed actionable rows; the result modal held up at 375 and 768 px.

F1, F2 and F3 were fixed afterwards in `d18d4b4` (test-first; full suite 149 files / 1,366 tests, tsc and lint pass; F1 confirmed against the local stack). F4 was fixed afterwards in `2d3fe26`: external hires on both the client fallback and the FastAPI route take office, division and plantilla number from the reserved plantilla, matched to an active office, and an inactive office is refused before anything is written with a message naming it (local stack: Rowena hired into Budget Office with Records Division and plantilla 2; an inactive-office applicant refused with nothing written). Eight live postings under the inactive "Information Technology" and "Legal" offices remain a data decision. A final run the same day passed `check:migrations`, the excluded test suite apart from a live-data seed-script test outside this branch, a mixed Generate batch on the local stack (external hire, promotion with an unchanged account, inactive-office refusal) and §16 on the all-failed results modal; it found a pre-existing focus gap in non-dismissible modals. `npm run build` still fails for environmental reasons. Originally found: F1, saving promotion categories after the written exam erased the exam score in the database while the page still showed it. Also found on this branch: F2, all-failed batches say “Check your connection” and “Employee Records Created”; F3, the busy message repeats its retry advice. Pre-existing: F4, the external fallback remaps offices to inactive names, so those hires fail; F5, a failed upload leaves an application with no document; F6–F8, minor copy and status issues.

Not covered: rejected score save and response loss in the browser, the FastAPI external route, real email, screenshots. `npm run build` fails with an esbuild temp-file “Access is denied” on this machine, identically on the base commit, so it is environmental.

## Checks observed before implementation

- `npm ci --ignore-scripts --no-audit --no-fund`: passed, installed 431 existing lockfile packages.
- `npx tsc --noEmit`: passed.
- `npx vitest run src --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"` with synthetic localhost Supabase settings: **131 files and 1,178 tests passed**. Existing React act warnings and refused-localhost lookup warnings remain. No production `.env` was copied.
- The audit/approved plan context was committed as `22c42f2` (`docs(promotion): record approved hiring repair plan and audit`). No push occurred.

## Final checkpoint verification

Run on the corrected Tasks 1–3 code, with `VITE_SUPABASE_URL=http://127.0.0.1:54321` and `VITE_SUPABASE_ANON_KEY=local-test-placeholder` for Supabase-importing checks:

- Before the upstream merge: **136 files / 1,239 tests passed** in 109.20s. After merging `upstream/main` to clear the PR conflict (merge `7b115ef`): **139 files / 1,248 tests passed** in 99.73s, including the new smoke suite. Existing React act/refused-localhost warnings remain.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed repository-wide with zero warnings/errors.
- `npm run build`: passed; Vite transformed 3,145 modules. CJS API deprecation, outdated Browserslist data and large-chunk warnings remain; no failure.
- `git diff --check`: passed; Windows line-ending normalization notices only.

No production `.env` was copied. Live-data seed/script tests, backend/database tests, isolated browser end-to-end acceptance and mobile/tablet/desktop visual checks were not run. `DESIGN_IDENTITY.md` §16 was reviewed against the changed UI: existing layout/shared error/modal primitives and tokens were retained; rendered contrast, keyboard focus and cross-width behavior are not independently verified, so the full UI checklist is not claimed complete. No migrations were created or applied.

## Remaining work and limits

On 2026-10-30 the user requested a delegated run of Task 7 only on the new isolated branch `fix/applicant-status-promotion-followups`, based on upstream `a3568ec`, then approved the focused plan and exact model pair with “go ahead”. Sol/high over OpenAI OAuth handled orchestration, independent review and verification; DeepSeek Flash/max (catalog identity DeepSeek V4.1 Flash 1017) over the existing paid key connection implemented code/tests and one successful corrective round. Model efforts, current session model and connection types were verified through metadata without credential values. Task 7 was accepted and committed as `273259e` (`fix(promotion): exclude promotions from legacy hire backfills`). Tasks 4–6 and 8, the applicant-status plan, and live actions remained outside this run.

### Task 7 completed — accepted after correction

Fresh Sol/high review found two Important gaps in the first green revision: status classification deduplicated source UUIDs before detecting duplicate hire links, and employee insertion did not reject distinct applicants claiming the same employee number. The same DeepSeek builder added/corrected regressions, recorded 3 expected assertion failures / 16 passes, then fixed both guards to reach 19/19 green. Scoped Sol/high re-review marked both findings addressed with no new findings. One successful corrective round, zero unsuccessful corrective attempts. No product/test fixes were authored by the OpenAI parent.

`src/lib/hiredApplicantSync.ts` now classifies linked applications by persisted UUID/type before dependent writes. Confirmed external `job` applications retain the existing status, missing-employee and default-field backfills. Promotions are skipped, so their legacy `newly_hired` snapshots cannot drive status changes, duplicate employee inserts or assignment/hire-date overwrites. Missing, duplicate and unknown-type links are skipped with count-only diagnostics; source multiplicity is preserved for status classification, and all applicants claiming a shared employee number are excluded from insertion without choosing a winner. Unrelated valid external hires still proceed. A failed classification read stops dependent writes without setting the success session flag, allowing a later retry. Public exports and startup callers are unchanged. No account credentials, migrations, UI, hire-status vocabulary or production records were changed.

The new `src/lib/hiredApplicantSync.promotion.test.ts` contains 19 mocked regressions for promotion protection, mixed batches, missing/unknown/duplicate links, employee-number conflicts, shared-email UUID isolation, external payloads, existing employee checks, read-failure retries and session flags. Initial test-first evidence was 10 expected assertion failures / 7 passes against the original implementation, then 17/17 passes; the corrective red/green evidence above expands coverage to 19 tests. The parent inspected both sets of logs and the actual full/corrective diffs.

Parent independently reran with `VITE_SUPABASE_URL=http://127.0.0.1:54321` and a synthetic anonymous key:

- `npx vitest run src/lib/hiredApplicantSync.promotion.test.ts`: corrected revision 19/19 passed.
- `npx tsc --noEmit`: passed, exit 0.
- `npm run lint`: passed, zero warnings/errors.
- `npx vitest run src --maxWorkers 2 --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"`: corrected revision 146 files / 1,283 tests passed, exit 0, in 145.61s. Existing React `act`, CJS/Browserslist and refused-localhost warnings remain. The first corrected full-suite attempt, run alongside other checks, hit the 120-second shell timeout and `ERR_IPC_CHANNEL_CLOSED`; it is not claimed passing. The rerun used the documented worker limit and a 300-second shell allowance, with no tests or unhandled errors suppressed and no product/config changes.
- `git diff --check`: passed; line-ending normalization notices only. The full-suite DataTable snapshot line-ending rewrite was identified as test-generated in this clean worktree and restored without changing snapshot content.

Limits: null/unknown legacy application types deliberately no longer enter startup backfills; inventory/data repair would require separate approval. Supabase calls in the new tests are mocked, not a live database/RLS/browser acceptance check. Live-data script tests were excluded, not claimed passing. No push, deployment, live write, email or Task 4–6/8 implementation occurred.

Cached Supabase CLI 2.122.0 is available, but `supabase status` reports Docker and Podman missing, and no local PostgreSQL installation was found. Task 4's transaction/rollback/concurrency verification and Task 8's database-backed acceptance need an isolated local/preview runtime. No remote writes or environment installation have been authorized to bypass that gate.

The atomic appointment transaction, shared hire entry points, account-preserving completion results and end-to-end acceptance (Tasks 4–6 and 8) remain for a later session; Task 7 legacy-sync guards are now committed separately. Existing security findings remain outside scope. The original build worktree's DataTable snapshot change was left untouched and is not part of this task's commit.

## Checkpoint smoke/sanity evidence

A fresh `deepseek/deepseek-flash#max` builder authored and ran the user-requested smoke/sanity checks, committed as `e483c55`. The parent reviewed the harness and independently reran them.

- `src/test/promotionEntry.smoke.test.tsx`: 3/3 passed. Empty-storage promotion login by username and employee number prefills the real wizard; a wrong password is rejected.
- `src/test/promotionPipeline.smoke.test.tsx`: 2/2 passed. The real scoring modal and real Task 2 save/summary services persist a complete promotional assessment; after a simulated hard reload, the real For Hiring and Applicant Ranking pages show the saved 80.00 total and 90/100 written exam, not stale `total_score`. A rejected save publishes no cache/event/row, keeps the modal editable with an error, and leaves only an existing reservation visible.
- Combined rerun: 2 files / 5 tests passed. TypeScript and scoped ESLint passed.
- Built-artifact preview: `npm run preview` served the index (200, root and module script present) and main JS asset (200, 3,333,754 bytes); the listener was stopped. Parent reproduced the check independently.

This is mocked jsdom evidence, not browser or database acceptance. The fake Supabase bypasses PostgREST projection and RLS; layout, focus, responsive behavior, print, real storage partitioning, migrations and concurrency remain unverified. Task 3A and Tasks 4–8 still require their own implementation and Task 8's isolated browser/database gate. Never run the legacy startup against production to satisfy this check.

The detailed task states, child session IDs, correction counters and review evidence remain in this plan's ignored `.superpowers/sdd/2026-10-30-promotional-hiring-fixes/progress.md`. The branch/worktree is preserved. It was pushed to the `Jayyoo07` fork and [PR #83](https://github.com/dehandenver/CICTrix/pull/83) is open against `dehandenver/CICTrix:main`; no merge, deployment, live database write or email was performed. Vercel reports the expected fork authorization failure.

## Failure-path run and branch review, 2026-11-02

The shared modal now moves focus inside a non-dismissible modal with no fields (`4a947ed`; tsc, lint and 850 test files pass). On the local stack, a rejected category save and a lost promotion response both left the database correct with nothing duplicated, but the UI feedback failed: the written-exam save ignores database failures (F9) and a lost response is reported as "not promoted" (F11). The branch review added F10 (an exam save can erase categories when its pre-read fails) and F12 (a corrected exam score is reverted by the next category save). `npm run build` still fails on this machine with the esbuild temp-file lock, independent of the temp folder. See the plan for details.
