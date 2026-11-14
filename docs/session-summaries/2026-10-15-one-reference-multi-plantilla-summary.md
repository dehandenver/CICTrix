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
- **Not changed:** `isQualifiedStatus` matches the "hired" in "Withdrawn - Hired Elsewhere". That match is why the Applications tab hides those rows. Hiding them is the intended behaviour now, but the matcher is still wrong in principle and affects other tabs, so it was left alone.

## Checks run

- `npx tsc --noEmit`: clean.
- `npm run lint`: clean.
- `npx vitest run` in the worktree: 170 files and 1,603 tests pass. This includes the new `ReferenceAppsChip.test.tsx` (6 tests), `referenceApplications.test.ts`, the `applicationStatusVariant` cases, the For Hiring suites and the promotion smoke tests.
- The 2026-11-12 full-suite counts (635 files) also included repo copies under `.worktrees/`. This run's count covers this repo only.
- Live data (read-only): 1 hired-elsewhere application, and 5 references with 2 applications each.
- **Not run:** the Step 6 migration double-run and the SQL hire/undo scenarios. Running them needs a copy of live data, and the migration has been applied since October.
- **Browser check skipped** at the user's choice. The chip and popover have not been seen in a browser; the component tests cover opening, closing, Esc focus return, the withdrawn badge and row-click isolation.
