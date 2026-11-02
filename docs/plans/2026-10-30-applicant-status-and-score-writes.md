---
title: Fix applicant score and status writes, and the live-data seed test
date: 2026-10-30
status: Draft
summary: Remove the unreachable RSP score path that writes a missing `applicants.total_score` column, make interviewer evaluations move applicants to For Evaluation instead of the legacy Reviewed, and stop the training-attendance seed test from asserting a live employee snapshot.
spec: docs/session-summaries/2026-10-30-promotional-hiring-audit-summary.md
---

## Goal

No client code writes to a column the database doesn't have. Submitting an interviewer evaluation moves the applicant forward in the workflow. It never moves them back, and the applicant tracker shows the right stage. The unit suite no longer fails when the employee roster changes or when no service-role `.env` is present.

This plan sits next to [Repair the promotional hiring pipeline](2026-10-30-promotional-hiring-fixes.md) (In Progress; Tasks 1–3 and 3A done, Task 4 next). Its "Before starting Tasks 4–8" section lists where the two plans touch: `database.types.ts`, status names and the interviewer acceptance step. That plan fixed the ranking *read* of `applicants.total_score` (Task 3, `20c24f1`) and chose to leave the seed-test failure alone (Risks, line 249). It did not cover the *write* at `ApplicantDetailsPage.tsx:1955` or the `Reviewed` status. Its Task 3A landed as `180c831` without changing `EvaluationForm.tsx` (it only added `EvaluationForm.promotion.test.tsx`), so Step 3 below no longer conflicts with it. This plan owns all `EvaluationForm.tsx` edits from now on.

## Findings (verified 2026-10-30)

Live checks used the publishable key and GET requests only. The full claim-by-claim evidence, including the counts that matched, is in [the live database check](../session-summaries/2026-10-30-live-db-claims-verification-summary.md).

| Ref | Finding | Evidence |
|---|---|---|
| F1 | `applicants.total_score` does not exist live. Any update that includes it fails, including the `status` sent in the same payload. | `GET /applicants?select=id,total_score` → HTTP 400, `42703`. |
| F2 | The only write of that column, `handleSaveScoreSetup` (`src/modules/interviewer/ApplicantDetailsPage.tsx:1935-2006`), **cannot run in production**. Its modal opens only from a button behind `showViewScoresButton = false` (line 1233), and nothing else sets `showScoresModal` to true (lines 791, 2120). F1 is a latent defect, not live data loss. That corrects the earlier verification, which called the status change lost. | grep of `setShowScoresModal` |
| F3 | The dead path would do harm if it ran. (a) Its status rule matches substrings. `'not qualified'` contains `'qualified'`, so a disqualified applicant would be revived as `Qualified`. `Hired` would be demoted to `Qualified`, and every other status (e.g. `Interview/Exam Scheduled`) would be reset to `Shortlisted`. None of this checks `canTransition`. (b) It saves scores to localStorage plus a 100-point `applicants.total_score`, and never to `applicant_category_scores` (130-point `MAX_TOTAL`). For Hiring and Ranking now read only that table (promotional plan Task 3). (c) Its error branch writes to `mockDatabase` when mock mode is *off*. Dropping `total_score` from the payload would re-enable (a). | `ApplicantDetailsPage.tsx:1939-1970`, `applicantScores.ts:20,485` |
| F4 | `src/types/database.types.ts:21,41,61` still declares `applicants.total_score`, which is why `tsc` accepted F1. The readers (`RSPDashboard`, `QualifiedApplicantsRSPPage`, `QualifiedApplicantsSection`, `ApplicantRankingPage` original fallback) use `select('*')`. They get `undefined` and fall back, so nothing breaks at runtime. | grep of `total_score` in `src/` |
| F5 | `EvaluationForm.tsx:465,490` writes `status: 'Reviewed'` after an evaluation, whatever the current status was. `normalizeStatus` maps `reviewed` to `Under Initial Screening` (`applicantStatus.ts`), so an evaluated applicant reads as back at screening. The workflow defines `Interview/Exam Scheduled → For Evaluation`, and no app code writes `For Evaluation` (only the archive restore default). Live data has 0 `Reviewed` rows. All 14 evaluated applicants have since reached a terminal status (7 Hired, 6 Not Selected, 1 Withdrawn - Hired Elsewhere), so the data tells us nothing either way about whether the write succeeds. | `GET /applicants?status=eq.Reviewed` → `*/0`, plus statuses of `evaluations.applicant_id` |
| F6 | Some readers key on the substring `review` and would not recognize `For Evaluation`. `JobPostingsPage.tsx:326` maps it to `New Application`. `InterviewerApplicantsList.tsx:241` gives it the pending badge. `ApplicationStatusPage`, `RSPDashboard` (via `normalizeStatus`) and `QualifiedApplicantsSection:1681` (via the evaluation IDs) already handle it. `QualifiedApplicantsPage` is not routed, so it's out of scope. | grep of `review` consumers |
| F7 | `scripts/seed-training-attendance.test.mjs:63,77` runs the seeder's dry run against the **live** database through `serviceClient` (needs `SUPABASE_SERVICE_ROLE_KEY` in `.env`). It asserts snapshot values: 167 employees, 32 completed sessions, 252 enrollments. It counts **active employees in the 5 seeded offices** (`employees_with_department`), not all employees. With the publishable key that query returns 127 (137 employees in total, all Active). The audit saw 172 with the service key. Without `.env` the test throws. CI doesn't run `npm test` (only the migration-guard and competency workflows), so this only affects local runs. | `GET /employees_with_department?status=eq.Active&department=in.(…)` → `/127` |

## Decisions needed

- **D1, the dead RSP score path (F2, F3).** Recommended: **A**.
  - **A.** Delete the unreachable path: the `showViewScoresButton` flag and its button, the score modal, `handleSaveScoreSetup` and `handleSaveScoreDraft`, and any helpers and state only they use. Scoring stays in `QualifiedApplicantsSection`, which already saves durably.
  - **B.** Keep it and repair it: route scores through `saveApplicantCategoryScores`, which needs a 100→130 scale and category mapping (a scoring policy question), and guard the status with `canTransition`.
  - **C.** Leave it and document it as known dead code.

  A removes the only `total_score` write and the bad status rule together. B means scoring-policy work for a screen nobody can reach.
- **D2, the seed test (F7).** Recommended: run the live dry-run case only when `.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (`it.skipIf`, with the skip reason printed). Replace the snapshot numbers with invariants: `totalEmployees > 0`, `met + partial + none === totalEmployees`, the existing percentage bands, `generatedEnrollments > 0`. The four pure tests stay as they are. The alternative is to mock the client with a fixture roster, which makes the test fully deterministic but stops it checking the live query.
- **D3, the legacy `Reviewed` mapping (F5).** Recommended: change `LEGACY_MAP.reviewed` to `For Evaluation`, since the only writer meant "evaluation submitted". Update the `['Reviewed', 2, 'Under Initial Screening']` row in `applicantStatus.test.ts`. No live rows are affected (0 `Reviewed`).

## Approach

Fix at the writers and keep the readers working. Status changes go through the workflow module (`canTransition` and `normalizeStatus` in `src/lib/api/applicantStatus.ts`) instead of substring matching. No migration. `applicants.total_score` stays absent, since scores belong in `applicant_category_scores`.

## Steps

1. **Remove the dead score path (D1-A).** In `ApplicantDetailsPage.tsx`, delete the items listed under D1-A. Confirm with grep that no other caller uses them (including `QualifiedApplicantsPage`'s shared localStorage keys). Existing tests `ApplicantDetailsPage.viewer.test.tsx` and `.back.test.tsx` still pass. End state: `grep -rn "total_score" src/modules/interviewer` returns nothing.
2. **Make the types match the schema (F4).** Remove `total_score` from the `applicants` Row/Insert/Update in `src/types/database.types.ts`. Fix whatever `tsc` reports by reading `total_score` as an optional legacy field where the code already treats it that way. Don't change ranking logic. End state: `npx tsc --noEmit` passes, and a test write of `{ total_score }` to `applicants` fails type-checking.
3. **Write For Evaluation after an evaluation (F5, D3).** Build on `fix/interviewer-scheduled-promotions` (Task 3A). In `updateApplicantStatus`, read the applicant's current status. Write `For Evaluation` only when `canTransition(normalizeStatus(current), 'For Evaluation')`, otherwise leave the status alone. Make the update conditional on the status that was read (`.eq('status', current)`), so a status RSP changes in the meantime isn't overwritten. Check the update's `error` and log it; a failed status write must not undo the saved evaluation. Apply the same rule to the local recruitment-store mirror (line 490). Change the success dialog copy (line 1144) to say what happened. Add `EvaluationForm` tests for: scheduled → For Evaluation; Qualified, Selected and Disqualified unchanged; a failed status update leaves the evaluation saved and shows the error. Put them in a new `EvaluationForm.status.test.tsx`, separate from Task 3A's `EvaluationForm.promotion.test.tsx`. Also add the submit round trip Task 3A deferred: a promotion's saved evaluation keeps its applicant UUID.
4. **Update the legacy mapping and readers (D3, F6).** `LEGACY_MAP.reviewed` becomes `For Evaluation`, and its test row is updated. `JobPostingsPage` maps `For Evaluation` to its in-review label instead of `New Application`. `InterviewerApplicantsList` badge: `evaluat` gets the reviewed class. Add one test each where a test file already exists.
5. **Fix the seed test (D2).** Gate the live dry-run case on service-role env and assert the invariants. Run it with and without `.env` and confirm one skip and one pass.
6. **Close out.** Write `docs/session-summaries/2026-10-30-applicant-status-and-score-writes-summary.md`. Add a one-line cross-reference in the promotional plan's Risks entry for the seed test. Regenerate `docs/plans/index.html`.

## Risks

- **Branch order.** `fix/interviewer-scheduled-promotions` (Task 3A) is stacked on this plan's branch, `fix/applicant-status-score-writes`. Merge this plan's branch first, or merge both together, and build Steps 1–5 on top of the 3A branch. Task 3A changed only `isDemoApplicant` in `InterviewerDashboard.tsx` and `InterviewerApplicantsList.tsx`. Step 4 edits the badge in `InterviewerApplicantsList.tsx` (line 241), which is far from that change.
- **Unrelated baseline failure.** `src/lib/trainingProgress.test.ts` fails when the clock is in UTC (it assumes +08:00). It fails on the base commit too and is out of scope here.
- **Status writes by the interviewer role.** Step 3 adds a read before the write. If RLS denies the interviewer the read or the update, the status stays put and the evaluation still saves. Step 3's error test covers this. Check one real interviewer session before Done.
- **Step 1 is a large deletion.** It's limited to code with no route to it (F2). If you want the modal back later, it needs D1-B's durable-save redesign anyway.
- **The type change could ripple.** If Step 2 shows more than a handful of `tsc` errors outside the readers listed in F4, stop and report before widening the change. `ApplicantRankingPage` and `ForHiringPage` were rewritten by promotional Task 3. Run their tests (`npx vitest run src/components/ForHiringPage src/components/ApplicantRankingPage`) after Step 2.
- **Follow-up, out of scope: hire status naming.** `applicantStatus.ts` and migration `20261021200000_one_reference_per_applicant.sql` treat `Selected` as the canonical hire status. Every writer still stores `Hired`: `employeesApi.ts:278`, `hiredApplicantSync.ts:51`, the local mirror in `hiringFlow.ts:335`, and promotional Task 4. All live hired rows are `Hired`. Readers that match the raw string `hired` (`RSPDashboard.tsx:506`, `:1955`, `:2201`; `ApplicationStatusPage.tsx:873`) would mislabel a `Selected` row as not hired. Moving to `Selected` needs one change that updates those readers first, then the writers, then backfills existing rows. It belongs in its own plan, together with the silent status writers found during this review.
- **No live writes.** Tests mock Supabase, and the seeder runs only as a dry run.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run src/lib/api/applicantStatus.test.ts src/modules/interviewer scripts/seed-training-attendance.test.mjs`, then the full `npm test` (excluding `.worktrees`, as in the audit)
- `grep -rn "total_score" src/modules/interviewer src/types/database.types.ts` returns no `applicants` writes
- The DESIGN_IDENTITY.md §16 checklist for the changed copy and badge in Steps 3–4 (no layout changes)
