---
title: Repair PDS, external hiring, and training persistence integrity
date: 2026-11-17
status: In Progress
summary: Preserve existing records, replace partial saves with transactions, make external hiring replay-safe, and distinguish failed reads from empty records.
spec: C:/Users/ajcbu/.opencode/plan/2026-11-17-persistence-integrity-repairs.md
---

## Goal

Implement the user's approved ten-task persistence-integrity plan without changing scoring rules, authentication architecture, or unrelated UI. The full approved specification and task contracts are saved at the `spec` path above. This repository entry records execution and its boundaries; the specification remains the task source.

Preserve the nine-section PDS navigation in `docs/mockups/2026-10-06-pds-step-list.html` and the hiring flow in `docs/mockups/2026-10-21-hire-reservation-flow.html`. No redesign or design-token changes are approved.

## Approach

Use targeted Postgres transactions plus focused changes to existing service/UI boundaries. Deliver PDS integrity first, external hiring second, and training third. Preserve row IDs and fields the editor does not own. Detect stale state, failed loads, zero-row writes, and uncertain outcomes instead of reporting success.

The user approved the plan and this model pair with “go ahead and build”:

| Responsibility | Exact model/effort | Verified connection |
| --- | --- | --- |
| Planning, coordination, review | `openai/gpt-6.1-sol#medium` | OpenAI OAuth |
| Implementation and tests | `deepseek/deepseek-flash#max` | DeepSeek API key; catalog identity DeepSeek V4.1 Flash 1017 |

The current session API reports Sol/medium. Both providers are active and both selected efforts are advertised. No alternate/free/Pro model substitution is authorized.

OpenAI owns this plan, progress tracking, diff review, and independent verification. DeepSeek owns source, migrations, tests, and implementation corrections. Builders run sequentially with explicit path ownership and may not commit, push, deploy, spawn helpers, or call live services. Parent reviews and commits logical stops. At most two unsuccessful corrective dispatches per task; then stop and ask.

## Steps

The full step-by-step contracts are in the approved specification; execution briefs are extracted from it for each task.

| Task | Owned change boundary | Depends on | State |
| --- | --- | --- | --- |
| 1 | `personalDataSheet.ts`, employee types, PDS section, focused validation/preservation tests | Baseline | Complete |
| 2 | PDS RPC service integration, scalar mapper if needed, CLI-generated migration, SQL/concurrency tests | 1 | Complete; isolated SQL/concurrency passed after review corrections |
| 3 | Checked profile writes, nullable numeric clears, local-only parent callback, wizard/draft behavior | 1, 2 | Complete locally; integration/browser acceptance outstanding |
| 4 | PDS load/retry/conflict/uncertain states and canonical save snapshots | 2, 3 | Pending |
| 5 | Succession evidence query/schema mismatch and PDS downstream regressions | 1–4 | Pending |
| 6 | External hire RPC, browser/backend routing, SQL/concurrency/service/backend tests | Phase 1 | Pending |
| 7 | Create-only account provisioning, all hiring callers and startup backfills | 6 | Pending |
| 8 | Atomic calendar/session/competency saves and lock/replay safeguards | Phase 2 | Pending |
| 9 | Attendance/evaluation/archive failure states and versioned partial score patches | 8 | Pending |
| 10 | Cross-boundary smoke tests, isolated database acceptance, full checks, branch review | All | Pending |

Execution ledger: `.superpowers/sdd/2026-11-17-persistence-integrity-repairs/progress.md` in this isolated worktree. It records task baselines, child identities, review verdicts, corrective counters, and plan-conflict rulings.

## Risks

- Existing permissive RLS/grants are verified and remain a separate security issue. New invoker RPCs may not elevate privileges or weaken policies.
- Missing Docker daemon or local Postgres blocks actual transaction/concurrency acceptance. Do not use production as a substitute or report mocked tests as database proof.
- Legacy hiring provenance can be ambiguous. Refuse rather than merge people, invent another employee, or rotate existing credentials.
- Succession reviews reference source IDs; PDS reconciliation must preserve them.
- Breaking service contracts require all active callers and fixtures to change together. Small compatibility integration changes belong to the task that changes the contract.
- New migration files must be CLI-generated and applied through PR integration only. No MCP/dashboard application.
- No push, deployment, production data repair, actual email, or real credential issuance is authorized.

## Checks to run

- `npx tsc --noEmit`
- `npx vitest run --dir src` plus each task's targeted regression tests.
- `npm run lint`
- `npm run build`
- `npm run check:migrations`
- `git diff --check`
- Isolated SQL rollback, permission, trigger, concurrent-connection, and lost-response tests from the approved specification.
- Backend external-hiring and existing promotional-hiring unittest suites with local synthetic settings and mocked external calls.
- Rendered UI/keyboard/responsive checks and `DESIGN_IDENTITY.md` section 16 for affected surfaces.

Baseline and final results are recorded in the ledger; only observed passing checks count. Repository test discovery otherwise includes old nested worktrees, so use `--dir src`.

### Task 1 checkpoint

Education grouping/editor preserves repeated qualifications and Doctorate. All seven PDS list saves reject meaningful incomplete rows before external writes; wholly blank new placeholders remain allowed. Row/field validation errors use the existing feedback surface. No migrations or transactional save changes are included yet.

DeepSeek/max implemented; parent Sol/medium reviewed and independently verified 172 files/1,619 tests, TypeScript, scoped lint, production build, and diff whitespace checks. No corrective dispatches. Database atomicity and rendered-browser acceptance remain for later tasks. See `docs/session-summaries/2026-11-17-persistence-integrity-task-1-summary.md`.

### Task 2 checkpoint

Replaced PDS list delete/reinsert services with canonical snapshot/revision RPC calls. Authored invoker reconciliation migration and rollback, permission, membership, and two-session tests; family/background scalar changes now share the list save request. Existing IDs and unowned metadata are retained by the transaction design. No legacy fallback remains.

Parent reviewed the full changes and two corrections, and independently verified 172 files/1,630 tests, targeted 30 tests, TypeScript, scoped lint, production build, migration versions, shell syntax, and whitespace. PostgreSQL compilation, rollback, permissions and concurrency have **not run** because Docker is unavailable; Task 2 is not fully accepted or release-ready. Further local implementation may proceed under the recorded preflight ruling, but this database gate must close before release.

Docker later became available: the exact migration compiled and the SQL suite passed on the older isolated local schema. After reproducing the known live required employee columns, both unmodified suites failed on missing `department` in their fixtures. Concurrency and production-shaped permission acceptance remain open; Docker availability is no longer the immediate blocker.

### Task 3 checkpoint

Profile saves now check the returned employee row before updating local state; clearing height/weight writes null, and PDS does not write twice through its parent. Unsaved drafts survive unrelated saves, previous-employee lists/revisions are cleared, and setup saves await confirmation before advancing. Optional Skip still permits closing after an attempted partial save, with failures shown.

Parent reviewed the implementation and independently reran 52 affected tests, the full 173-file/1,645-test suite, TypeScript, scoped lint, and production build at completion. Real PostgREST and rendered-browser acceptance remain outstanding. See `docs/session-summaries/2026-11-17-persistence-integrity-task-3-summary.md`. Task 4 is not started.

### Approved review corrections (2026-11-19)

User requested DeepSeek Flash/max to fix the independent review findings. Keep the approved parent Sol/medium and builder `deepseek/deepseek-flash#max` roles. This is correction of Tasks 1–3, not Task 4 implementation.

1. Reproduce and fix canonical family/background scalar values reverting on an unrelated profile update. Keep section snapshots and revisions consistent, without an extra write or loss of dirty edits.
2. Reproduce and reject fractional education years/units instead of truncating them in input handlers.
3. Reproduce delayed mutation responses across employee identity changes; prevent obsolete responses from changing drafts, lists, revisions, feedback, saving state or parent profile, including A→B→A identity reuse.
4. Correct both SQL/concurrency employee fixtures for required production-shaped department/position columns, and isolate the no-visible test from all applicable permissive employee policies inside its rolled-back test transaction. No production policies, privileges or migration changes.
5. Verify focused regressions, TypeScript, lint/build/full tests and both exact database suites on the owned isolated Docker database. Parent independently reviews and reruns acceptance before committing.

Owned correction paths: `src/modules/employee/PersonalDataSheetSection.tsx` and its persistence tests; minimum `employeePortal`/`EmployeePage` integration tests/source only if required for these findings; `supabase/tests/pds_section_transactions.test.sql` and `supabase/tests/pds_section_concurrency.sh`. No redesign, packages, scoring/authentication changes or unrelated refactors.

Corrections implemented by DeepSeek Flash/max and reviewed by parent Sol/medium. Parent independently verified 53 focused tests, 173 files/1,671 full-suite tests, TypeScript, scoped lint, production build, migration versions, shell syntax and whitespace. The three code findings have regression coverage; the two database-test corrections are authored but not database-accepted because Docker's Linux engine pipe is unavailable again. See `docs/session-summaries/2026-11-19-persistence-review-corrections-summary.md`. Task 4 remains pending.

Subsequent Docker retry: parent ran the exact migration, revised SQL suite and revised two-session concurrency harness successfully against the owned isolated database. Required department/position columns and both permissive employee policies were reproduced. Actual lock contention and stale rejection were observed; winner ID and revision matched the final read. This closes the scoped local SQL/concurrency gate, not full production-schema, ownership-security, HTTP/PostgREST or rendered-browser acceptance. Schema restore limitations and synthetic cleanup are recorded in the correction summary. Nothing applied to production.
