---
title: One Reference No. per applicant across plantillas (summary)
date: 2026-10-15
plan: docs/plans/2026-10-15-one-reference-multi-plantilla.md
---

Covers the whole plan. Steps 1–4 shipped in October; this summary was written on 2026-11-14 with the D8 work.

## What shipped

- **Step 1, migration** `20261021200000_one_reference_per_applicant` (with a rollback): the reference table, generator and trigger, the index swap, the backfill, and the hire/undo trigger. It is applied live: `applicant_reference_numbers` and `applicants.hired_elsewhere_application_id` exist.
- **Step 2:** the `Withdrawn - Hired Elsewhere` status, its message and its funnel bucket in `applicantStatus.ts` (`eed1bfc`).
- **Step 3:** the application form shows "Your Reference No. for all your applications", and notes how many earlier applications sit under the same reference (`3d1a86b` and later).
- **Step 4:** the tracker lists every application under a reference (2026-10-26, `d341094`).
- **Step 5, narrowed to D8a (2026-11-14, branch `feat/reference-apps-chip`):**
  - `applicationStatusVariant` in `applicantStatus.ts` maps each status to its §10 badge colour.
  - `src/lib/referenceApplications.ts` adds `groupByReference` and `withdrawnLabel`.
  - `fetchApplicationsByReference` in `src/lib/api/applicants.ts` reads the applications for a set of references.
  - `src/components/ReferenceAppsChip.tsx` is the "N apps" chip. Its popover lists every application under the reference with position, plantilla and status badge.
  - The chip is wired into the Applications tab (main and Shortlisted tables, built from the rows already loaded) and the For Hiring rows (loaded with the rows).
  - The Applications tab also carries plantilla labels through now, so its plantilla tags show the real label instead of "Plantilla N".

## Deviations from the plan

- **D8 narrowed (decided 2026-11-14).** The dimmed in-place row from mockup option A was dropped, along with the counts and bulk-select rules that came with it. Hired-elsewhere applications stay hidden from the RSP lists and show in the chip's popover and in RSP Archives.
- **Neutral, not green.** The withdrawn application uses the §10 Neutral badge ("Withdrawn: hired on <plantilla>"). The mockup's green pill is not used, so green stays on the actual hire.
- **D7** is covered by the existing Original/Promotional type tag; no separate "Current employee – promotion" tag was built.
- **For Hiring loads the reference groups inside its loader.** An effect that loaded them after the rows caused an extra render, which made the existing For Hiring tests flaky.
- **One status colour map (code review, 2026-11-14).** `applicationStatusVariant` is now the single §10 map, and RSP Archives uses it for application statuses. Decided with the user:
  - Not Selected → red (a rejection; Archives previously showed it gray).
  - For Contract Signing → green.
  - Raw values older paths still write are coloured too: Accepted → green, Received → blue.
- **Popover focus (code review).**
  - Focus moves into the popover on open, so its list is announced and can be scrolled from the keyboard.
  - It closes when focus leaves it.
  - Esc is marked handled with `preventDefault` instead of `stopPropagation`, so it can't take the Esc away from an enclosing Modal.
- **Other review fixes.**
  - The chip's accessible name starts with its visible text.
  - It has a 30px hit area.
  - Spacing moved to the Applications call site.
  - Positioning clamps to the viewport and re-measures when the list changes.
  - Selectors are doubled so they don't depend on stylesheet order.
  - The service skips the slot-link read when nothing matches.
  - For Hiring loads the groups in parallel with its hiring context.
- **Not changed:** `isQualifiedStatus` matches the "hired" in "Withdrawn - Hired Elsewhere". That match is why the Applications tab hides those rows. Hiding them is the intended behaviour now, but the matcher is still wrong in principle and affects other tabs, so it was left alone.

## Checks run

- `npx tsc --noEmit`: clean.
- `npm run lint`: clean.
- `npx vitest run` in the worktree: 170 files and 1,603 tests pass. This includes the new `ReferenceAppsChip.test.tsx` (6 tests), `referenceApplications.test.ts`, the `applicationStatusVariant` cases, the For Hiring suites and the promotion smoke tests.
- The 2026-11-12 full-suite counts (635 files) also included repo copies under `.worktrees/`. This run's count covers this repo only.
- Live data (read-only): 1 hired-elsewhere application, and 5 references with 2 applications each.
- **Not run:** the Step 6 migration double-run and the SQL hire/undo scenarios. Running them needs a copy of live data, and the migration has been applied since October.
- **Code review** (Opus 5.5, high effort): no Critical issues, 3 Important (all fixed), 11 Minor.
  - Fixed: M1–M7, M9 and M10.
  - Not fixed: M8, where the legacy `withdrawn` value shows as red "Disqualified". That mapping predates this work.
  - Not fixed: M11, the unrun plan checks, which this summary records.
  - Tests added: `applicants.reference.test.ts`, plus chip tests for focus moving in, closing on focus leaving, and Esc staying available to a Modal.
- **Browser check skipped** at the user's choice. The chip and popover have not been seen in a browser; the component tests cover opening, closing, Esc focus return, the withdrawn badge and row-click isolation.
