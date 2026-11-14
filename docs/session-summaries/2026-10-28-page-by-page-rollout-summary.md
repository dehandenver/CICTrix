---
title: Page-by-page system rollout (summary)
date: 2026-10-28
plan: docs/plans/2026-10-28-page-by-page-rollout-implementation-plan.md
---

Written 2026-11-14 from a code and git audit.

## What shipped

- A docs-only record (`3b00d53`) of a test pass on 2026-10-28 that covered 51 pages across the 7 portals. It reports tsc, lint, `build:verify`, 120 test suites and 1,085 tests passing.

## Deviations from the plan

- It records results at one point in time; there was nothing to build. Many merges have landed since, so it no longer describes the current `main`.
- Its pass counts have no log and were not reproduced.

## Checks run

- Audit 2026-11-14: the tests it cites exist (`ForHiringPage.scored.test.tsx`, `InterviewerApplicantsList.dedupe.test.ts`, 16 `*.back.test.tsx` files), and the `build:verify` script exists.
- The current checks, run 2026-11-12 on `cd71e17`: `npx tsc --noEmit` clean, and `npx vitest run` passed 635 files and 5,479 tests.
- Its open risk still stands: `scripts/seed-training-attendance.test.mjs` opens a live network connection with no skip guard.
