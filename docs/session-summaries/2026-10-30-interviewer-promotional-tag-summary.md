---
title: Mark promotional applicants in interviewer candidate tables — summary
date: 2026-10-30
plan: docs/plans/2026-10-30-interviewer-promotional-tag.md
---

## What shipped

All six planned steps shipped, with no scope change.

- **One rule for applicant type.** `getApplicantType` (`src/lib/interviewerEvalNavigation.ts`) decides by `application_type`. It uses the employee link only when the type is empty. Hired external applicants, who gain an `employee_id` on hire, now read as Original in the Applicants List type column and filter, and in the dashboard rows.
- **D1.** Both `isPromotionalSource` copies (`ApplicantDetailsPage.tsx`, `EvaluationForm.tsx`) call the shared rule. On load, `EvaluationForm` now writes the record's type to the `cictrix_rsp_score_setup` cache in both directions, which repairs stale `promotional` entries.
- **Dashboard modal.** `CandidateRow.currentPosition` was added. `CandidateListModal` shows a brand-tint "Promotional" tag under the name and "From: <current position>" under the position. One CSS rule was added: `.ivd-type-tag`, for a 4px top margin.
- **Applicants List.** The type badge colours are swapped: Promotional is tinted, Original is neutral.

## Deviations

None from the plan. Step 5 used a throwaway page that rendered the real `CandidateListModal` instead of a signed-in interviewer session, because this environment has no interviewer credentials. The page was deleted afterwards.

## Checks run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| `npm run lint` (zero warnings) | Pass |
| `npm run build` | Pass (existing chunk-size warning only) |
| Smoke tests, `src/test/*.smoke.test.tsx` | 5/5 pass |
| `npx vitest run` | 1274 pass, 2 fail. Baseline before the change: 1266 pass, the same 2 fail. |
| New tests | 8, all passing; the rule and the `EvaluationForm` cases failed before the fix |
| Visual, 1366×768 and 390×844 | Tag computed `#EEF0FF` / `#191FA8`, Poppins; no page errors; no page-level horizontal scroll |

The 2 failures existed before this change and are unrelated:
- `scripts/seed-training-attendance.test.mjs` asserts a live employee snapshot. It is tracked by `2026-10-30-applicant-status-and-score-writes.md` D2.
- `src/lib/trainingProgress.test.ts` › "treats a single-day training as ongoing for that whole day" is a date-dependent training test.

## Not verified

- A signed-in interviewer pass against live data. Data-level behaviour was checked read-only on 2026-10-30: 1 promotion and 7 hired `job` rows with `employee_id`, all with `original` saved scores.
