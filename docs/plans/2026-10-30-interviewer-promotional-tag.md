---
title: Mark promotional applicants in interviewer candidate tables
date: 2026-10-30
status: Done
summary: Show a "Promotional" tag and the employee's current position on interviewer candidate rows, and make every interviewer screen decide promotional vs original from the application's own type, so hired external applicants stop reading as promotions.
---

## Goal

In the Interviewer Dashboard's candidate list modal, a promotional applicant shows a "Promotional" tag under their name and "From: <current position>" under the position they applied for. Original applicants show neither. The Interviewer Applicants List's Type column uses the same tag colours.

Every interviewer screen (list, dashboard, applicant details, evaluation form) labels an applicant and picks their scoring form from `applicants.application_type`. That is the rule RSP scoring and hire sync already use. Hired external applicants, who gain an `employee_id` when hired, stay Original.

No saved mockup in `docs/mockups/` covers these tables. Layout follows the table pattern (§9.5) with the existing `.badge` and `.ivd-job-meta` styles.

## Findings

All of these were checked on 2026-10-30 against the code on `main` at `0e26f03` and the live database (read-only GET, publishable key).

**F1. The tag's data is already loaded.** `ApplicantWizard.submitOne` (`src/modules/applicant/ApplicantWizard.tsx:941`, `:955-960`) writes `application_type`, plus `employee_id` and `current_position` for promotions. `InterviewerDashboard` reads `applicants` with `select('*')` (`InterviewerDashboard.tsx:113`). `buildCandidateRows` (`interviewerDashboardModel.ts:148`) already sets `appType` on every row. Live: the columns exist (no repo migration creates `employee_id` or `current_position`). The one promotion row has both filled in.

**F2. Hired external applicants read as Promotional.** Hiring writes `employee_id` onto the applicant (`src/lib/api/employeesApi.ts:278`). Three interviewer checks treat any `employee_id` as a promotion:

| Check | Used for |
|---|---|
| `getApplicantType` (`src/lib/interviewerEvalNavigation.ts:8`) | Type column and filter in the Applicants List; `CandidateRow.appType`; the score setup cached when Evaluate is clicked |
| `isPromotionalSource` (`ApplicantDetailsPage.tsx:648`) | `isForcedPromotionalAppointment`. Its live effect (line 1305) writes `promotional` into the `cictrix_rsp_score_setup` cache on every page view. Its other uses sit in the unreachable score modal (lines 2904–3262, `showViewScoresButton = false`). |
| `isPromotionalSource` (`EvaluationForm.tsx:124`) | Opens PCPT and writes `promotional` to the cache. For a non-promotion it only switches the tab and **leaves a cached `promotional` in place** (lines 330–332). |

Live: 7 applicants are `job` with an `employee_id`. All 7 are Hired and already evaluated. Their 3 saved score rows are `appointment_type = 'original'` and finalized. No score row anywhere is `promotional`.

**F3. Stale caches would survive a check-only fix.** Any browser that opened one of the 7 has `promotional` cached for them, written by the `ApplicantDetailsPage` effect. `EvaluationForm` reads the cache first (line 240) and, per F2, never overwrites it for a non-promotion. So the fix must also write the record's type back to the cache in both directions.

**F4. Every other cache writer already follows `application_type`.** `ApplicantWizard.saveApplicantAppointmentType` (line 158), `applicantScores.ts:234` and `QualifiedApplicantsSection.tsx:221` all derive from `application_type` and ignore `employee_id`. `hiredApplicantSync.ts:269` skips by `application_type`.

**F5. No live row needs the fallback.** All 57 applicants have a type: 56 `job` and 1 `promotion`. Keeping `employee_id` as a fallback for type-less rows changes nothing today. It protects older local recruitment-store rows that only carry `internalApplication.employeeId`.

## Approach

**One rule in one place.** `getApplicantType` returns the record's type when `application_type` is set. It falls back to "has an employee link" only when the type is empty. Both `isPromotionalSource` copies become thin calls to it, so all four screens agree. They pass the DB row first, then the local recruitment-store fields (`applicationType`, `internalApplication.employeeId`).

**The record's type wins over the cache.** In `EvaluationForm`, once the applicant row loads, set `appointmentType` and the tab from the resolved type in both branches, and save it to the cache. That corrects any stale `promotional` from F3. `ApplicantDetailsPage` keeps its effect as is; with the fixed check it stops writing `promotional` for job applicants.

**Rendering.** `CandidateRow` gains `currentPosition`. `CandidateListModal` renders a `badge badge-tint` "Promotional" under the name and an `ivd-job-meta` "From: …" line under the position. The Applicants List swaps its two badge classes so Promotional is the tinted one. Per §10, application type is a category, so it uses the brand tint, never status colours, and always has a text label.

**Rejected:** a separate Type column in the modal (too wide at 1366px); a coloured row border (reads as status, colour alone); dropping the `employee_id` fallback entirely (it would change behaviour for local-store rows with no type, for no live benefit).

## Files affected

| File | Change |
|---|---|
| `src/lib/interviewerEvalNavigation.ts` | `getApplicantType`: type first, employee link as fallback |
| `src/lib/interviewerEvalNavigation.test.ts` (new) | Rule tests |
| `src/modules/interviewer/ApplicantDetailsPage.tsx` | `isPromotionalSource` calls `getApplicantType` |
| `src/modules/interviewer/EvaluationForm.tsx` | `isPromotionalSource` calls `getApplicantType`; the non-promotion branch sets and caches `original` |
| `src/modules/interviewer/EvaluationForm.promotion.test.tsx` | Two cases added (Step 2) |
| `src/modules/interviewer/interviewerDashboardModel.ts` | `CandidateRow.currentPosition` |
| `src/modules/interviewer/InterviewerDashboardParts.tsx` | Tag and "From:" line in `CandidateListModal` |
| `src/modules/interviewer/InterviewerApplicantsList.tsx` | Swap the badge classes (line 994) |
| Model and modal tests (new or extended) | Steps 3–4 |

**Not affected:** the `employees` table, the employee portal, hire sync, RSP scoring and ranking, PM/L&D, `employeesApi.ts` (writing `employee_id` on hire is correct; the readers were wrong), the database and migrations. No stored score, status or evaluation changes.

## Steps

1. **Shared rule.** In `getApplicantType`, return the type when `application_type` is non-empty (`promotion`/`promotional` → Promotional, anything else → Original). Otherwise return Promotional only if `employee_id` is set. New `interviewerEvalNavigation.test.ts`: `job` + `employee_id` → Original; `promotion` → Promotional; empty + `employee_id` → Promotional; empty + none → Original. Verify: the test passes.
2. **D1: the two page checks.** Replace both `isPromotionalSource` bodies with a call to `getApplicantType` (DB row first, then local-store fields). In `EvaluationForm`'s non-promotion branch, also `setAppointmentType('original')` and cache `original`. Extend `EvaluationForm.promotion.test.tsx`: (a) a `job` row with `employee_id` opens the Oral form; (b) a `job` row with `promotional` pre-seeded in `cictrix_rsp_score_setup` opens the Oral form and leaves the cache at `original`. Verify: both new cases fail before the change and pass after; the two existing cases still pass.
3. **Row data.** Add `currentPosition` to `CandidateRow`, read from `applicant.current_position` in `buildCandidateRows`. Model test: a promotion gets `Promotional` plus its current position; a hired `job` row with `employee_id` gets `Original` and `''`.
4. **Rendering.** Add the tag and "From:" line to `CandidateListModal`, and swap the badge classes in `InterviewerApplicantsList.tsx:994`. Render test: a promotional row shows both; an original row shows neither. Verify: `InterviewerApplicantsList.promotion.test.tsx` and `InterviewerDashboard.promotion.test.tsx` still pass.
5. **Manual pass.** Run the dev server at 1366×768 and at mobile width. Check that the rows wrap cleanly, the name tooltip works, the tag renders tinted (§16), and a hired applicant shows Original in the list, the details page and the evaluation form.
6. **Close out.** Set the status to Done. Write `docs/session-summaries/2026-10-30-interviewer-promotional-tag-summary.md`. Regenerate `docs/plans/index.html`.

## Risks

- **Overlap with `2026-10-30-applicant-status-and-score-writes.md` (Draft).** Its D1-A deletes the unreachable score modal in `ApplicantDetailsPage.tsx`. Its Step 3 owns `EvaluationForm.tsx`'s `updateApplicantStatus`, and its Step 4 edits the status badge at `InterviewerApplicantsList.tsx:241`. This plan touches different lines: `isPromotionalSource` (648), the load branch (321–332), and the type badge (994). The changes are compatible; whichever lands second rebases. If D1-A lands first, line 1305's effect may be gone, and Step 2 then only changes the check.
- **Changing the rule also changes the cached score setup.** For the 7 hired rows that is a correction: their saved scores are `original`. No live row has an empty type, so the fallback branch is not exercised by real data (F5).
- **Brief wrong tab on load.** `EvaluationForm` shows the cached tab until the row loads, then corrects it. This already happens today in the other direction, and the loading state covers it.
- **Row height.** Promotional rows grow one line. Acceptable at 8 rows a page; checked in Step 5.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test` (all interviewer tests passed at 51/51 before any change)
- DESIGN_IDENTITY.md §16: tokens only, the §10 category rule, `#191FA8` on `--bg-tint` contrast, mobile/tablet/desktop
