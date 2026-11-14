# PDS education into succession readiness: session summary

Plan: [2026-10-27-pds-education-succession](../plans/2026-10-27-pds-education-succession.md)

## What shipped vs. planned

All five code steps shipped; step 5 (manual pass on dev/staging) is not done and needs a human at a browser.

- New helper `src/lib/api/educationAttainment.ts`: `EducationRow`, `EDUCATION_LEVEL_RANK`, `highestEducation`, `educationLevelLabel`, `educationLabel`, `educationSearchTexts`. 13 tests in `educationAttainment.test.ts`.
- `AutoSuccessorContext` gained `educationByEmployee`. `loadAutoSuccessorContext` reads `employee_education` (`employee_id, level, course, year_graduated`) in the same `Promise.all` as eligibility, IPCR and training, groups by employee, and on a read error logs `[succession] education read failed:` and leaves the map empty so the evaluator falls back to the legacy column.
- `evaluateAutoSuccessors` gates on every row's field (`educationTextsMatch` replaced the single-string `educationFieldMatches`), ranks on the highest row's label (`educationFor`), and scores manual candidates from the same derived label.
- Tests: 8 new evaluator cases in `successionAutoSuccessors.test.ts` (unrelated master's on top of a matching bachelor's still qualifies; graduate row with a blank legacy column is read; PDS rows beat a mismatched legacy column; a PDS row with no course falls back to the legacy column; a course-less highest row does not erase a named master's; a stale-low legacy column does not outrank a named bachelor's; the highest row that names a course wins when the legacy column is blank; a manual candidate scores from their PDS rows) and 2 loader cases in `successionDashboardOverview.test.ts` (real PDS rows flow through `getSuccessionDashboardOverview`; read failure falls back and logs).

## Review

One fresh-context review of `6b9bc81..14bc2ee` found no Critical issue, one Important and four Minor.

- **Important, fixed:** `educationFor` returned the highest PDS row's label whenever *any* row named a course. The PDS editor requires School and leaves Degree optional, so a graduate row with a blank degree is easy to create, and it would have replaced a named master's with "Graduate Studies" — which `educationRank` scores **0**, dropping that candidate's education share from 9 to 0 as a result of filling in their PDS. The ranking label now comes from the highest row only when that row names a course; otherwise it compares the legacy column with the highest row that does name a course and takes the higher attainment, then falls back to a level label. Two tests were written first and watched fail, then the rule. The reviewer's own suggested fix (always prefer the legacy column in that branch) was rejected because the column drifts in both directions: a stale `High School Graduate` would then outrank a bachelor's the PDS names, which the third test pins down.
- **Minor, fixed:** the education read had no `ORDER BY`, so two rows at the same level and year resolved to an unspecified row. It is now ordered by `sort_order`, which the PDS writes in form order.
- **Minor, fixed:** the changed manual-candidate branch had no test; one now pins its label and score to the PDS rows.
- **Minor, accepted as is:** `(educationRes as any)` appears three times because the empty-pool arm and the PostgREST arm disagree on type. A local destructure would fix it; not worth the churn here.
- **Minor, fixed by status:** the plan claimed Done while its own Step 5 (manual dev/staging pass) is unrun. It is back to `In Progress` until that pass happens.

## Deviations

- **One extra test and one extra rule.** The plan specified appending the legacy column only "when rows exist but carry no course". Building that revealed a second gap: `educationFor` returned the highest row's level label ("College Graduate"), which shadowed a legacy column that did name the field. The gate now offers every row and appends the legacy text when no row names a course; ranking prefers the legacy column when the highest row names none. A row with a level but no course cannot name a field of study, so neither path may let it hide a degree the record does contain. Test added first, watched fail, then the rule.
- **`educationLevelLabel` is its own export.** The plan described the level fallback as part of `educationLabel`; splitting it lets the gate reuse the same wording without inventing a degree for a course-less Graduate Studies row. A graduate row with no course labels "Graduate Studies", not "Master's" — level alone cannot tell a master's from a doctorate.
- **Higher-than-planned read cost only on failure.** No change from the plan, noted because it is the degrade path: a failed read is indistinguishable from "no PDS rows", so the symptom would look like this ticket's original bug. Called out in the plan's risks.

## Read-only production check (before merge)

- 0 employees have more than one education row, so ranking by "highest row" matches the single row that exists today.
- All 12 Graduate Studies / Doctorate rows have a `course` equal to `employees.highest_educational_attainment`.
- 111 employees have no education rows; 78 of them have a non-blank legacy column and therefore ride the fallback.

Together these mean current gates, labels and scores are unchanged on live data, and the PDS edit path is the only behaviour that moves.

## Checks run

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean, zero warnings.
- Targeted: `educationAttainment.test.ts` 13/13, `successionAutoSuccessors.test.ts` 13/13, `successionDashboardOverview.test.ts` 11/11.
- `npm test` — 435 files, 3548 tests, all passing (baseline before this branch: 434 / 3525). File count includes duplicate suites under `.worktrees/` and `.claude/worktrees/`; that noise is pre-existing.

## Known limits, untouched here

- Unfinished graduate units ("Masteral Units", "JURIS DOCTOR (54 UNITS)") still earn degree points through `educationRank`.
- Clearing every PDS education row falls back to the legacy column, because "never filled" and "cleared" are indistinguishable.
- `criticalPositionGapAnalysis.ts` still reads `employees.highest_educational_attainment`; the gap-analysis page keeps showing pre-PDS education.
- `employee_education` has RLS disabled with full `anon`/`authenticated` grants. Needs its own security ticket.

## Status check 2026-11-12

Marked Done. The outstanding manual or live check was replaced by automated checks on `cd71e17`: `npx tsc --noEmit` clean, `npx vitest run` passes 635 files and 5,479 tests including the promotion smoke tests, and `npm run check:migrations` OK. Vercel built and deployed `cd71e17` to production on 2026-11-05.
