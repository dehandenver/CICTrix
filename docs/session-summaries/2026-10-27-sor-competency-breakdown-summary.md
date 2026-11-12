---
title: SOR competency breakdown (summary)
date: 2026-10-27
plan: docs/plans/2026-10-27-sor-competency-breakdown.md
---

Written 2026-11-12 from a code, git and read-only database audit. No summary was recorded when the work shipped.

## What shipped

- Migrations `20261027120527_cycle_aware_employee_competencies` and `20261027120534_ipcr_performance_competency_tag` (commit `ae11418`).
- `backend/app/routes/competency_assessment.py` matches by `rating_period` and upserts on `employee_id, competency_id, cycle_id`.
- Batch runner `backend/run_competency_batch.py`. A durable queue runner (`run_competency_queue.py`, commit `ce22c58`) came later.
- Live `employee_competencies` has 199 rows: 64 for cycle 2 (from the queue drain) and 135 for cycle 6.
- Frontend: `requiredAvailable` in `competencyGapAnalysis.ts` and `semesterSummaryOfRatings.ts`. `CompetencyGapPanel` shows "Required level not configured", with a test covering it.
- `scripts/backfill-competency-map-titles.mjs`. Live `position_competency_requirements` has 883 `auto-synced` rows, so it, or something equivalent, ran.

## Deviations from the plan

- **Mirror tagging dropped.** Step 6 expected `ipcr_performance.competency_id` to be filled. On 2026-11-12, 0 of 787 rows are tagged, although `ipcr_competency_matches` has 625 rows. The later plan behind `2026-10-27-sor-previous-semester-competency-summary.md` stopped reading the mirror, so nothing depends on the tagging now.

## Checks run

- Audit 2026-11-12: read-only SELECTs for the counts above.
- Not done: the manual PM Summary of Ratings and L&D pass.
