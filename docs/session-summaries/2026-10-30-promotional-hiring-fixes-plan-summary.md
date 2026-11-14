---
title: Promotional hiring fixes plan drafted
date: 2026-10-30
summary: Drafted a functional implementation plan from the promotion audit; remediation work and the unused PM promotion module remain excluded. No implementation or deployment was performed.
---

## Delivered

Created [Repair the promotional hiring pipeline](../plans/2026-10-30-promotional-hiring-fixes.md) as a Draft for approval. It covers fresh-browser employee application entry, durable score saves, promotion visibility/ranking, a proposed retry-safe promotion transaction, shared frontend/backend completion, account-preserving result handling, legacy-backfill guards, and isolated acceptance testing.

Added Task 3A at the user's request: scheduled promotional interviews missing from the interviewer dashboard/list. It requires tracing the saved RSP schedule through schedule/assignment/posting filters before choosing a fix, then regression tests for display/count consistency, fresh-browser access, PCPT navigation, rescheduling, completion/history and RSP score receipt. The exact cause remains unverified; no product fix is claimed. *(Update, 2026-10-30: the cause was found and fixed in Task 3A, commit `180c831`. Both interviewer screens hid `@example.com` applicants as demo data. See the plan's Task 3A checkpoint.)* End-to-end acceptance now explicitly uses a separate interviewer browser.

The user excluded the remediation plan from this task. The new plan does not modify it or include its Auth/RLS/password migration phases. Existing security findings remain unresolved and functional testing is not a production-security sign-off. The unused PM promotion module, occupancy redesign, live duplicate cleanup, and automatic reopening of the former position are also outside this draft.

## Evidence and checks

- Used the October 30 read-only audit and existing reserve/signing flow as the requirements baseline.
- Re-read current service/component/backend interfaces, existing tests, saved hiring mockup, design status mapping, and UI checklist.
- Read-only schema inspection confirmed the existing `employee_history`, `user_roles`, and `positions` column shapes; no database data or schema was changed.
- Checked plan file paths/interfaces and regenerated the plans dashboard. Implementation tests are specified in the plan, not claimed as run during plan authoring.

## Remaining gate

*Historical: this section describes the state when the plan was drafted. For the current state see the [implementation summary](2026-10-30-promotional-hiring-fixes-summary.md). Tasks 1–3 and 3A are done; Task 4 is next and blocked on an isolated database.*

The user subsequently invoked `delegate` with an empty task; the established pending task is implementation of this plan. Added the exact model pair (`openai/gpt-6.1-sol#high` for orchestration/review over existing OpenAI OAuth; `deepseek/deepseek-flash#max`, catalog identity DeepSeek V4.1 Flash 1017, for code/tests over the existing paid key connection), serial ownership/dependencies, integration-fix rules, and per-task two-correction counters. The user explicitly changed the DeepSeek effort to max for this run; its catalog support was verified. Global defaults remain unchanged, and no builder has been dispatched. Model catalog, connection metadata, and the current session model/variant were checked without displaying credentials. A newer OpenAI Terra candidate was noted but not selected.

The proposed design, implementation tasks, and exact model pair need explicit approval before the first builder dispatch. No product code, migration, account, application, appointment, or email was changed. No commits, pushes, deployments, or subagent dispatches were performed. Existing audit documents and the user's untracked `run-queue.bat` were retained.
