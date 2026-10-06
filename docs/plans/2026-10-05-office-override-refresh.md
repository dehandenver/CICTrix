---
title: Office phase override survives realtime refresh
date: 2026-10-05
status: Done
summary: Employee phase gates fall back to system schedules on realtime refresh, ignoring office overrides. Route full load, refresh, and the target-submit guard through one service resolver.
---

## Goal

When the PM changes a phase, an employee whose office has an override must keep
seeing that override's Open/Closed state, without a page reload. Live data on
2026-10-05 shows Legal with `rating = Closed` while the system `rating = Open`;
Legal staff currently see the system state after any realtime refresh.

## Approach

The full load (src/modules/employee/EmployeePage.tsx, lines 493-521) finds the
employee's office and picks the office override over the system row. The realtime
refresh `refreshPhaseSchedules` (same file, lines 664-680) reads
`scope = 'system'` only and overwrites that result. Move the lookup into
src/lib/api/phaseSchedules.ts, which already has `resolveSchedule()`, so both
paths run the same code.

## Steps

1. Add `loadEffectiveSchedules(employeeId)` to src/lib/api/phaseSchedules.ts:
   look up the department from `employees_with_department` and the office id
   from `departments`, then fetch the system rows plus that office's rows and
   return `{ target, rating }` through `resolveSchedule()`. On any lookup error,
   fall back to system rows (today's behaviour).
2. In EmployeePage, replace the inline block at lines 493-521 with a call to
   that function, keeping the `loadId` staleness check.
3. Change `refreshPhaseSchedules` to call the same function. Don't cache the
   office id: it would go stale if the employee's department changes, and the
   lookups cost only two small queries per realtime event.
4. Change the target-submission guard in src/lib/api/ipcrTargets.ts
   (lines 247-258) to use `loadEffectiveSchedules`. It reads the system
   `target_setting` row only, so an office whose override is open gets
   rejected on submit, and an office that's closed can still submit.
5. Add src/lib/api/phaseSchedules.test.ts with a mocked Supabase client,
   following the src/lib/api/ipcrTargets.test.ts pattern. Cases:
   - the office override wins over the system row for the same phase
   - a phase with no override falls back to the system row
   - an employee with no office, or a failed lookup, gets the system rows

## Out of scope

- The duplicate `isPhaseScheduleOpen` (EmployeePage) and `effectiveState`
  (phaseSchedules) helpers.
- Repeated phase notifications when the PM toggles quickly.
- `phase2_status = 'locked'` on later approvals (ipcrApproval.ts:147).

## Risks

- Two extra queries per realtime event per open employee tab. Small rows and
  infrequent events, so acceptable.
- If the department name doesn't match a `departments.name`, the office id is
  null and the employee gets system rows. That matches today's full-load
  behaviour.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- In the real app (needs a live `phase_schedules` write, so confirm first):
  with Legal's `rating = Closed` override in place, toggle the system rating
  schedule and confirm a Legal employee's rating gate stays Closed without a
  reload.
