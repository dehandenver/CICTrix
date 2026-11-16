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
| 2 | PDS RPC service integration, scalar mapper if needed, CLI-generated migration, SQL/concurrency tests | 1 | Pending |
| 3 | Checked profile writes, nullable numeric clears, local-only parent callback, wizard/draft behavior | 1, 2 | Pending |
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
