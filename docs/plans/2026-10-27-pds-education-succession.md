---
title: Feed PDS education into succession readiness
date: 2026-10-27
status: Done
summary: Succession reads `employee_education` directly, the way it already reads `employee_eligibility`, so an employee's PDS education edit changes their succession gate and education score. No migration, no backfill, no writes.
# spec: none. Design follows the eligibility precedent in src/lib/api/succession.ts:1548.
---

## Goal

An employee saves Educational Background on their PDS — adds a Graduate Studies row, or replaces a College row with a Master's. On the next load of RSP → Succession, that employee clears the education gate on their own record and their education share of the readiness score reflects the higher degree. Today neither happens, because the PDS writes `employee_education` and succession reads `employees.highest_educational_attainment`, and nothing bridges the two.

## Approach

Root cause: two sources of truth with one missing link. `saveEducation` (`src/lib/api/personalDataSheet.ts:138-182`) deletes and re-inserts `employee_education` rows; the PDS section then calls `onSaved({})` (`src/modules/employee/PersonalDataSheetSection.tsx:644`), so no scalar patch reaches `employees`. Succession reads the base column at `succession.ts:1942`, gates on it at `2206-2214`, and scores it at `2303`. No trigger or migration syncs them.

Fix: read the detail table at query time, mirroring the eligibility fix already in this module. `succession.ts:1548` reads `employee_eligibility` per employee instead of trusting `employees.eligibility`, with a comment that a credential held in a second row used to be invisible. Education has the same shape and gets the same treatment. The legacy column stays as a fallback for employees whose PDS was never filled in, so existing records keep their current standing.

Rejected alternative: derive the attainment in `saveEducation` and write it into `employees.highest_educational_attainment`. Smaller diff and it fixes all three readers of that column (succession, `criticalPositionGapAnalysis.ts`, `employeeApplicationProfile.ts`), but it leaves the gate reading a single string. An engineer with a BS Civil Engineering who earns an MPA would then fail the position's field match ("Course mismatch") for an engineering post — the opposite of the outcome this revision exists to produce. Recorded here in case the trade-off is revisited.

Verified before planning: `employee_education` holds 110 rows for 110 distinct employees; 9 rows' `course` differs from the stored column, all Elementary/Secondary legacy strings, none at bachelor's level or above. So the fallback path changes nothing observable for current records, and no backfill is needed.

## Steps

1. **Add the pure helper** at `src/lib/api/educationAttainment.ts`:
   - Public interface: `EducationRow` (`level`, `course`, `year_graduated`), `EDUCATION_LEVEL_RANK` (Doctorate 6, Graduate Studies 5, College 4, Vocational 3, Secondary 2, Elementary 1), `highestEducation(rows)` returning the highest row or null, `educationLabel(row)` returning trimmed `course` or a level fallback ("College Graduate" / "College Level" / "High School Graduate" / "High School Level" / "Vocational" / "Elementary Graduate" / "Elementary Level"), and `educationSearchTexts(rows)` returning every row's course plus level label for the field gate.
   - Highest is level rank first, then `year_graduated` descending, then stable row order. `course` is preferred over the level label because both consumers key off the degree text: `educationRank` matches "master"/"doctor"/"bachelor" (`successionCriteria.ts:121-131`) and `educationFields` tokenises the course (`succession.ts:1503-1523`).
   - End state: `src/lib/api/educationAttainment.test.ts` covers highest level wins, course beats level label, College with no `year_graduated` returns "College Level", Doctorate beats Graduate Studies, whitespace trimmed, empty rows return null.

2. **Extend the shared context** in `src/lib/api/succession.ts`:
   - Add `educationByEmployee: Map<string, EducationRow[]>` to `AutoSuccessorContext` (~line 1867).
   - Batch-load `employee_education` (`employee_id, level, course, year_graduated`) for `allEmployeeIds` in `loadAutoSuccessorContext`, alongside the `employee_training` read (~lines 2013-2022), and group by `employee_id`.
   - On read error, leave the map empty and log; the evaluator's fallback to the legacy column then keeps today's behaviour. A table outage must not fail the education gate for every candidate.
   - End state: the context carries education rows for every employee in the pool, with a failure path that degrades to the column.

3. **Wire the evaluator** in `evaluateAutoSuccessors`:
   - Per candidate, `rows = ctx.educationByEmployee.get(empId) ?? []`; `highest = highestEducation(rows)`; `empEducation = highest ? educationLabel(highest) : (e.highest_educational_attainment ?? null)`.
   - Education gate (`2206-2214`): replace the single-string `educationFieldMatches(empEdu, requiredEducation)` with a helper that passes when any of `educationSearchTexts(rows)` matches the required field tokens, appending the legacy column when rows exist but carry no course. Keep the "no specific field required" short-circuit and the existing `Course mismatch` / `No education record` messages so `gates.education` at line 2269 and `actionForGate` at `successionCriteria.ts:613-626` keep working unchanged.
   - Ranking (`2303`): pass `empEducation` (the highest row's label) to `computeReadinessScore`. `educationRelevant` logic (`2326`) is unchanged: relevance still derives from the candidate's title keyword, so a higher degree earns 0.6 of the weight at one level above the floor and 1.0 at two.
   - End state: a candidate with a College row in the required field plus a Graduate Studies row in another field qualifies and scores education; a candidate with only a mismatched row lands in `notQualified` with the same reason strings as today; a candidate with no rows still uses the column.

4. **Update the evaluator tests** in `src/lib/api/successionAutoSuccessors.test.ts`:
   - Add `educationByEmployee: new Map()` to the `context()` fixture (line 53).
   - New cases: bachelor's in the required field plus unrelated master's (qualified, education > 0); graduate row only, matching field (qualified, education at 0.6 × weight); single mismatched row (notQualified, `gates.education === false`); no rows with a legacy column value (existing behaviour preserved).
   - End state: the suite proves the three paths and the existing cases pass untouched apart from the fixture field.

5. **Manual pass on a dev or staging account**, not production: add a Graduate Studies row on the PDS, load RSP → Succession, confirm the candidate clears the gate and the education bar moves; blank the row and save, confirm the previous standing returns. This is the only check that exercises the batch read against a real database.

## Risks

- **Unfinished graduate units still count.** "Masteral Units in X" and "JURIS DOCTOR (54 UNITS)" both match `educationRank`'s "master"/"juris doctor" patterns and earn 0.6–1.0 of the education weight without a completed degree. That is current behaviour, not introduced here. Left as a separate decision; would be noticed as a candidates' education points not matching their transcript.
- **The gate becomes modestly more permissive.** Any degree's field can satisfy the requirement, so a bachelor's in the required field still qualifies after an unrelated master's is added. Intended, and the reason for choosing this approach. A reviewer comparing before/after counts may see new qualifiers for positions whose required field appears only on a lower degree.
- **Read failure looks like stale data.** If `employee_education` becomes unreadable (a future RLS policy, a renamed column), the evaluator silently falls back to the legacy column and the education label stops updating. Noticeable as "the PDS edit did not change succession", which is this ticket's symptom. Currently the table has RLS disabled, so the admin session reads all rows.
- **Display drift becomes visible.** `ReadinessScore.educationLabel` now shows the PDS row rather than the stored string. The 9 known differences are all sub-college, so no candidate's displayed education changes today; future differences will show the PDS value, which is the truth we want.
- **Out of scope, needs its own ticket:** `employee_education` has RLS disabled with full `anon` and `authenticated` grants, so any client holding the publishable key can read and modify every employee's PDS education rows.
- **Out of scope, follow-up:** `criticalPositionGapAnalysis.ts:125,187` still reads `employees.highest_educational_attainment`, so the gap-analysis page will keep showing pre-PDS education. Align it with the same helper later if desired.

## Checks to run

- `npx tsc --noEmit`
- `npm test` — `educationAttainment.test.ts`, `successionAutoSuccessors.test.ts`, `successionCriteria.test.ts`, `successionScores.test.ts`, `successionDashboardOverview.test.ts`, `SuccessionPlanningPage.test.tsx`
- `npm run lint` — zero warnings
- Manual pass on dev/staging described in Step 5
- Regenerate the plans dashboard with `docs/plans/build-plans-index.ps1` after the plan and summary land.

## Status check 2026-11-12

Done. Step 5 (manual staging pass) was not run by hand. The automated checks below were accepted in its place, and they cover `educationAttainment.test.ts`, `successionAutoSuccessors.test.ts` and `successionDashboardOverview.test.ts`.

Automated checks on `origin/main` (`cd71e17`): `npx tsc --noEmit` clean; `npx vitest run` passes 635 files and 5,479 tests, including the promotion smoke tests; `npm run check:migrations` OK (130 files). Vercel built and deployed `cd71e17` to production on 2026-11-05. A local `npm run build` fails on this machine because esbuild cannot delete its own temp files; the code compiles.
