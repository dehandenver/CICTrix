---
title: Loading and error states (summary)
date: 2026-10-26
plan: docs/plans/2026-10-26-loading-and-error-states.md
---

Written 2026-11-12 from a code and git audit. This plan was folded into `docs/plans/2026-10-26-loading-and-action-feedback.md`, which is the more detailed plan for the same work. The remaining work is tracked there, not here.

## What shipped

- The audit, kept as `docs/ux-feedback-audit.md`.
- The shared building blocks, built under the feedback plan: the `src/components/action-feedback/` module, `useAsyncAction`, and `describeActionFailure` in `src/lib/friendlyErrors.ts`. The existing `ErrorBanner` is reused for load failures.
- Module passes for RSP (`f216229`), Employee, Interviewer and Applicant.

## Deviations from the plan

- No separate `<LoadError>` component was built; `ErrorBanner` covers it.
- The PM, L&D and Department Head passes are still open, under the feedback plan.

## Checks run

- See the feedback plan and `2026-10-26-loading-action-feedback-summary.md`.
