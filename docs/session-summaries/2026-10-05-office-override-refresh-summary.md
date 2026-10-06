---
title: Office phase override survives realtime refresh — summary
date: 2026-10-05
plan: docs/plans/2026-10-05-office-override-refresh.md
---

## What shipped

All five plan steps shipped on `fix/office-override-refresh`.

- `loadEffectiveSchedules(employeeId)` in src/lib/api/phaseSchedules.ts resolves
  the employee's office override, else the system row, for target setting and
  rating. It never throws: office-lookup failures fall back to system rows, and
  a failed schedules query returns nulls (gates closed), matching the old
  inline behaviour.
- EmployeePage's full load and `refreshPhaseSchedules` both call it, so a
  realtime event no longer replaces an office override with the system state.
- The target-submit guard in src/lib/api/ipcrTargets.ts uses it too, so office
  overrides now gate submission as well as the UI.
- Tests: 7 resolver tests (src/lib/api/phaseSchedules.test.ts) and 2 guard
  tests (src/lib/api/ipcrTargets.test.ts).

## Deviations from the plan

- Added after review (Opus): a fetch counter shared by the full load and the
  refresh, so an older phase-window fetch can't overwrite a newer one. The race
  existed before; the fix widened it from one query to three.
- Added after review: the resolver tests assert the employee id and trimmed
  department name passed to the lookups. A mutation check (removing `trim()`)
  confirmed the test fails.
- The live check was skipped at the user's request.

## Checks run

- `npx tsc --noEmit`: exit 0.
- `npm test`: 12 files, 134 tests passed.
- `npm run lint`: not run. The repo has no ESLint config, which predates this
  change.

## Follow-ups (not in this plan)

- Opening Phase 2 (`openSelfRatingPeriod`, src/lib/api/ipcrRatings.ts) sets
  `phase2_status = 'open'` for every approved target, and nothing on the server
  checks office overrides. Only the employee screen now respects them.
- `phase2_status = 'locked'` on later approvals (src/lib/api/ipcrApproval.ts:147).
- Each PM phase toggle sends a notification to every employee (70 per batch),
  with no dedupe for rapid repeated toggles.
