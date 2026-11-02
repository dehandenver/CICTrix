---
title: Promotional hiring implementation progress
date: 2026-10-30
summary: Tasks 1–3, the reported Task 3A defect, and Task 7 legacy-sync guards are committed and verified. Task 7 has 19 focused regressions and clean Sol review; 1,283 src tests, TypeScript and lint pass. Tasks 4–6 and 8 remain pending; Task 4 requires an isolated database.
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
