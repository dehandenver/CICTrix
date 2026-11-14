---
title: For Hiring lists only applicants who were scored (summary)
date: 2026-10-28
plan: docs/plans/2026-10-28-for-hiring-scored-only.md
---

Written 2026-11-14 from a code and git audit. No summary was recorded when the work shipped.

## What shipped

- `ForHiringPage.tsx` keeps a row only when the applicant has both scores, or is already past selection (`isPastSelection`).
- The page refreshes through `useRealtimeRefresh` on `applicants`, `evaluations`, `plantilla_slots` and `newly_hired`, replacing the two same-tab events. `subscribeToEvaluationChanges` is no longer used there.
- `ForHiringPage.scored.test.tsx` was added, and the `.back` and `.load` test fixtures were updated.
- Commit `0180fa6`, merged in PR #69.

## Deviations from the plan

- None found. Exam scores still live in localStorage, a known risk outside this plan.

## Checks run

- Audit 2026-11-14: the code and tests are on `main`. The 2026-11-12 full Vitest run on `cd71e17` passed.
