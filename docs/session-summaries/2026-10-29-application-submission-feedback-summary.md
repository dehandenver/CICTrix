---
title: Application submission feedback (summary)
date: 2026-10-29
plan: docs/plans/2026-10-29-application-submission-feedback.md
---

Written 2026-11-12 from a code and git audit. No summary was recorded when the work shipped.

## What shipped

- `ApplicantWizard.tsx`: a `confirmBatch` state replaces the `confirmSubmit` boolean, so the confirmation title, label and count stay stable while the submission runs.
- `positionTitleFor` puts the position title first on the review card heading and on each success row.
- `ApplicantWizard.test.tsx` adds the plan's four tests.
- Commit `840aa23`, with plan commits `f84e07e` (#81) and `29417d3`. It reached main through the promotional fork merge.

## Deviations from the plan

- None found.
- The "already applied without attachments" upload bug stayed out of scope, as the plan said.

## Checks run

- Not done: the 375px manual pass and the §16 checklist.
