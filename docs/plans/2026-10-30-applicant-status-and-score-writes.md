---
title: Fix applicant score and status writes, and the live-data seed test
date: 2026-10-30
status: In Progress
summary: Remove the unreachable RSP score path that writes a missing `applicants.total_score` column, move evaluated applicants to For Evaluation without overwriting a newer status, guard the interviewer Qualify and Disqualify writer, keep applications that share an email independent, and stop the training-attendance seed test from depending on live data.
spec: docs/session-summaries/2026-10-30-promotional-hiring-audit-summary.md
---

## Goal

No client code writes to a column the database doesn't have. Submitting an interviewer evaluation moves the applicant forward in the workflow. It never moves them back, and the applicant tracker shows the right stage. An interviewer's Qualify or Disqualify can't overwrite a closed application, and failures reach the interviewer. Applications that share an email stay independent. The unit suite no longer fails when the employee roster changes or when no service-role `.env` is present.

This plan sits next to [Repair the promotional hiring pipeline](2026-10-30-promotional-hiring-fixes.md). That plan fixed the ranking *read* of `applicants.total_score` (Task 3, `20c24f1`) and chose to leave the seed-test failure alone (its Risks section). It did not cover the *write* at `ApplicantDetailsPage.tsx:1956` or the `Reviewed` status. This plan owns all `EvaluationForm.tsx` edits from now on.

## Findings

F1–F7 were verified on 2026-10-30. All findings were re-verified on 2026-11-04 against `upstream/main` `da571e0`, with line numbers updated. F8–F10 and the F6 amendment were added then, after tracing each issue to what a user actually sees.

Live checks on 2026-10-30 used the publishable key and GET requests only. Those on 2026-11-04 were read-only SQL returning catalog data and aggregate counts. The full claim-by-claim evidence from the first pass, including the counts that matched, is in [the live database check](../session-summaries/2026-10-30-live-db-claims-verification-summary.md).

| Ref | Finding | Evidence |
|---|---|---|
| F1 | `applicants.total_score` does not exist live. Any update that includes it fails, including the `status` sent in the same payload. | `GET /applicants?select=id,total_score` → HTTP 400, `42703`. Rechecked in `information_schema.columns`. |
| F2 | The only write of that column, `handleSaveScoreSetup` (`src/modules/interviewer/ApplicantDetailsPage.tsx:1935`), **cannot run in production**. Its modal opens only from a button behind `showViewScoresButton = false` (line 1233), and nothing else sets `showScoresModal` to true (line 2120). F1 is a latent defect, not live data loss. That corrects the earlier verification, which called the status change lost. | grep of `setShowScoresModal` |
| F3 | The dead path would do harm if it ran. (a) Its status rule matches substrings. `'not qualified'` contains `'qualified'`, so a disqualified applicant would be revived as `Qualified`. `Hired` would be demoted to `Qualified`, and every other status (e.g. `Interview/Exam Scheduled`) would be reset to `Shortlisted`. None of this checks `canTransition`. (b) It saves scores to localStorage plus a 100-point `applicants.total_score`, and never to `applicant_category_scores` (130-point `MAX_TOTAL`). For Hiring and Ranking now read only that table (promotional plan Task 3). (c) Its error branch writes to `mockDatabase` when mock mode is *off*. Dropping `total_score` from the payload would re-enable (a). | `ApplicantDetailsPage.tsx:1935-1970`, `applicantScores.ts:20,485` |
| F4 | `src/types/database.types.ts:21,41,61` still declares `applicants.total_score`, which is why `tsc` accepted F1. The readers (`RSPDashboard`, `QualifiedApplicantsRSPPage`, `QualifiedApplicantsSection`, `ApplicantRankingPage` original fallback) use `select('*')`. They get `undefined` and fall back, so nothing breaks at runtime. | grep of `total_score` in `src/` |
| F5 | `EvaluationForm.tsx:468,493` writes `status: 'Reviewed'` after an evaluation, whatever the current status was, and never reads the returned `{error}`. The local mirror also matches on email (line 489), and two blank emails match each other. `normalizeStatus` maps `reviewed` to `Under Initial Screening` (`applicantStatus.ts:137`), so an evaluated applicant reads as back at screening. The workflow defines `Interview/Exam Scheduled → For Evaluation`, and no app code writes `For Evaluation` (only the archive restore default). Live data has 0 `Reviewed` rows. All 14 evaluated applicants have since reached a terminal status (7 Hired, 6 Not Selected, 1 Withdrawn - Hired Elsewhere), so the data tells us nothing either way about whether the write succeeds. | Live status counts, joined to `evaluations.applicant_id` |
| F6 | Some readers key on substrings and don't recognize `For Evaluation`. **Amended 2026-11-04:** the two have different impact. In `JobPostingsPage.tsx:312`, `toStatus` turns `For Evaluation` and `Not Selected` into `New Application`, and `Withdrawn - Hired Elsewhere` into `Qualified`, but its output is not displayed on Job Posts. It feeds only `liveApplicants`, which `deleteJobPosting` passes to the archive and the local store (lines 1067–1090). The visible "left to review" count (line 629) uses `reviewOutcome` (`applicantReviewQueue.ts:16`), which goes through `normalizeStatus` and is correct. So the effect is limited to archived records; how Reports displays them was not traced. The badge in `InterviewerApplicantsList.tsx:236` is visible in the details modal (line 1094): `For Evaluation` reads pending, and `Not Qualified` reads green because `qualif` matches first. `ApplicationStatusPage`, `RSPDashboard` (via `normalizeStatus`) and `QualifiedApplicantsSection` (via the evaluation IDs) already handle it. `QualifiedApplicantsPage` is not routed, so it's out of scope. | Traced through `liveApplicants` consumers |
| F7 | `scripts/seed-training-attendance.test.mjs:63,77` runs the seeder's dry run against the **live** database through `serviceClient` (needs `SUPABASE_SERVICE_ROLE_KEY` in `.env`). It asserts snapshot values: 167 employees, 32 completed sessions, 252 enrollments. It counts **active employees in the 5 seeded offices** (`employees_with_department`), not all employees. Without `.env` the test throws. CI doesn't run `npm test` (only the migration-guard and competency workflows), so this only affects local runs. | Run on 2026-11-04: `expected 172 to be 167` |
| F8 | **Highest priority.** Disqualify and Qualify on `/interviewer/applicants` write any status with no transition check, never read `{error}`, and update the UI first. An interviewer can write `Qualified` over a `Hired` applicant with one click. The list keeps anyone with an `interview_date` (`isScheduledForInterview`), whatever their status. | `InterviewerApplicantsList.tsx:704-722`, buttons at `:1049` and `:1056` with no `disabled`. Live: 7 Hired, 18 Not Selected and 1 Withdrawn have an `interview_date`. Code path traced; not clicked. |
| F9 | `saveInterviewerScoreSnapshot` also stores scores under `email:<address>` (`EvaluationForm.tsx:105`), and `hasSnapshotEvaluation` (`InterviewerApplicantsList.tsx:333`) falls back to that key. A sibling application with no evaluation can read as `Completed` and drop out of the to-evaluate filter. This is local to the browser that submitted the evaluation. | Live: 5 emails shared by 10 active applications. Code path traced; not reproduced. |
| F10 | A zero-row update can't separate a concurrent change, a missing row and an RLS denial, because PostgREST returns no error for a row the policy filters out. No harm today, since the `applicants` UPDATE policies are open to `anon` and `authenticated`, but a later security change would turn a denied write into a silent no-op. | Live `pg_policies` |

## Decisions

- **D1, the dead RSP score path (F2, F3). Decided: A.**
  - **A.** Delete the unreachable path: the `showViewScoresButton` flag and its button, the score modal, `handleSaveScoreSetup` and `handleSaveScoreDraft`, and any helpers and state only they use. Scoring stays in `QualifiedApplicantsSection`, which already saves durably.
  - **B.** Keep it and repair it: route scores through `saveApplicantCategoryScores`, which needs a 100→130 scale and category mapping (a scoring policy question), and guard the status with `canTransition`.
  - **C.** Leave it and document it as known dead code.

  A removes the only `total_score` write and the bad status rule together. B means scoring-policy work for a screen nobody can reach.
- **D2, the seed test (F7). Decided 2026-11-04: mock the client.** Mock `./lib/ipcr-shared.mjs` in the test file with a fixture roster. This replaces the earlier recommendation to gate the live case on `.env`, which passes without testing anything when credentials are missing. The trade-off is that the test stops checking the live query. Routine tests never contact the configured project.
- **D3, the legacy `Reviewed` mapping (F5). Decided.** Change `LEGACY_MAP.reviewed` to `For Evaluation`, since the only writer meant "evaluation submitted". Update the `['Reviewed', 2, 'Under Initial Screening']` row in `applicantStatus.test.ts:25`. No live rows are affected (0 `Reviewed`).
- **D4, the interviewer status writer (F8). Decided 2026-11-04: guard it here.** This is the same bug as F5 in the same portal, so it doesn't wait for a separate plan. **Behavior change:** `canTransition` allows `Qualified` only from `For Evaluation`, so an interviewer must submit the evaluation before Qualify works. Disqualify stays available on any non-terminal status. `ApplicantRankingPage.tsx:224`, an RSP action that also calls a backend API, stays deferred to the follow-up under Risks.

## Approach

Fix at the writers and keep the readers working. Status changes go through the workflow module (`canTransition` and `normalizeStatus` in `src/lib/api/applicantStatus.ts`) instead of substring matching, and through one service function, not inline calls in components. No migration. `applicants.total_score` stays absent, since scores belong in `applicant_category_scores`.

Moving applicants to `For Evaluation` doesn't drop them from any list: the interviewer list filters on `interview_date`, and `isSchedulableApplicant` includes that status. `applicants.status` has no CHECK constraint.

Work in a new branch from refreshed `upstream/main`.

## Steps

1. **Remove the dead score path (D1-A).** In `ApplicantDetailsPage.tsx`, delete the items listed under D1-A. Confirm with grep that no other caller uses them (including `QualifiedApplicantsPage`'s shared localStorage keys). Existing tests `ApplicantDetailsPage.viewer.test.tsx` and `.back.test.tsx` still pass. End state: `grep -rn "total_score" src/modules/interviewer` returns nothing.
2. **Make the types match the schema (F4).** Remove `total_score` from the `applicants` Row/Insert/Update in `src/types/database.types.ts`. Fix whatever `tsc` reports by reading `total_score` as an optional legacy field where the code already treats it that way. Don't change ranking logic. Add `src/types/database.applicant-writes.test.ts` with a `@ts-expect-error` on an applicants Update containing `total_score`. End state: `npx tsc --noEmit` passes.
3. **Add the status transition service (F5, F8, F10).** Create `src/lib/api/applicantStatusTransition.ts` with its test file. `applicantStatus.ts` stays pure.

   ```ts
   export type StatusTransitionResult =
     | { kind: 'advanced'; status: string }
     | { kind: 'unchanged'; reason: 'transition-not-allowed' | 'concurrent-change' | 'not-found' }
     | { kind: 'failed'; error: string };

   export function transitionApplicantStatus(
     applicantId: string,
     target: ApplicantWorkflowStatus,
     storedAs?: string, // defaults to target
   ): Promise<StatusTransitionResult>;
   ```

   It reads the status, applies `normalizeStatus` and `canTransition`, then updates filtered by the application UUID and the exact raw status read, returning the updated rows. On zero rows it re-reads. A missing row is `not-found`, a different status is `concurrent-change`, and an unchanged status is `failed`, which covers an RLS denial. Add failing tests first, including `Hired`, `Selected`, `Qualified`, `For Contract Signing`, `Disqualified`, `Not Selected` and `Withdrawn - Hired Elsewhere` staying unchanged, unknown or null statuses staying unchanged, and read errors, update errors and thrown failures.
4. **Write For Evaluation after an evaluation (F5, D3).** In `EvaluationForm.tsx`, call the service only after the evaluation insert succeeds, and never retry the insert. A saved evaluation stays saved when the status update fails. The mirror updates by UUID only, on a server-confirmed advance, with the same workflow rule; never match on email. Replace the "updated to Reviewed" sentence (line 1147) with result-aware copy for advanced, unchanged and warning results, and don't ask the interviewer to resubmit. Add `EvaluationForm.status.test.tsx`, separate from `EvaluationForm.promotion.test.tsx`, covering: scheduled → For Evaluation; closed statuses unchanged; a failed status update leaves the evaluation saved and shows a warning; two applications sharing an email, where only the submitted UUID changes; blank emails not matching; and a promotion's saved evaluation keeping its applicant UUID.
5. **Guard the interviewer writer (F8, D4).** Route Disqualify and Qualify in `InterviewerApplicantsList.tsx` through the service. Disqualify keeps storing `Not Qualified` through `storedAs`. Update the UI after the server result, show failures and refusals to the interviewer, and remove the mock fallback from this path. Add `InterviewerApplicantsList.status.test.tsx`, written to fail first: Qualify on `Hired` changes nothing and says why; Qualify from `For Evaluation` works; a failed write leaves the UI unchanged and shows the failure.
6. **Stop reading scores by email (F9).** `saveInterviewerScoreSnapshot` writes the `id:` key only, and readers look up `id:` only. Stale `email:` entries are ignored, not migrated. If Step 1 removes the `ApplicantDetailsPage` reader as modal-only, only the writer and `hasSnapshotEvaluation` remain. Test that a sibling application sharing an email stays `Not Yet Rated`.
7. **Update the legacy mapping and readers (D3, F6).** `LEGACY_MAP.reviewed` becomes `For Evaluation`, and its test row is updated. In `toStatus`, add evaluation-stage, `Not Selected` and `Withdrawn` handling so archived records are accurate, and test it through a pure helper or the delete flow. In the `InterviewerApplicantsList` badge, check rejection before qualification and give `evaluat` the reviewed class. `For Hiring`, ranking and the "left to review" count don't change.
8. **Make the seed test deterministic (D2).** In `scripts/seed-training-attendance.test.mjs` only, mock `./lib/ipcr-shared.mjs` so `loadEnv` doesn't read `.env` and `serviceClient` returns a fixture client. Unexpected tables and any write call fail the test. Use `vi.setSystemTime` for a fixed clock, active employees in the five target offices, and enough completed training fixtures for the selection algorithm. Assert `met + partial + none === totalEmployees`, the fixture's distribution, and no writes. Keep the existing pure cases. Remove the 167/32/252 assertions.
9. **Close out.** Run `/code-review` on the whole branch. Write `docs/session-summaries/2026-10-30-applicant-status-and-score-writes-summary.md`. Add a one-line cross-reference in the promotional plan's Risks entry for the seed test. Regenerate `docs/plans/index.html`.

## Follow-on work

Not in this plan. Each item keeps its own plan and needs a fresh file list from its then-current baseline, in this order:

1. Remaining modals and feedback, portal by portal, starting with PM (`2026-10-25-standard-modal.md`, `2026-10-26-loading-and-action-feedback.md`, `2026-10-26-loading-and-error-states.md`).
2. Reference-number UI for hired-elsewhere rows (`2026-10-15-one-reference-multi-plantilla.md`). The mockup's 50% row opacity needs a contrast decision first.
3. Job Posts refresh consolidation (`2026-10-26-performance-followups.md`, step 3).
4. Atomic posting and slot save (`2026-10-06-real-vacancies-plantilla-form.md`). Blocked until the target database is decided.
5. Plantilla split and cleanup (`2026-10-23-plantilla-per-row.md`). Blocked until `feat/import-employees` is reconciled and the dependency audit is rerun.

## Risks

- **Interviewer Qualify changes behavior (D4).** An interviewer who used Qualify before submitting an evaluation now gets a refusal with a reason. Tell the team before release.
- **Fixture tests don't prove live permissions.** Tests mock Supabase, and only 2 live rows sit at `Interview/Exam Scheduled`, so acceptance relies on tests and a preview. Check one real interviewer session on an approved target before Done. Don't submit real evaluations without permission.
- **Status writes by the interviewer role.** Step 3 adds a read before the write. If RLS later denies the update, no error comes back, so the service detects it by re-reading (F10). The status stays put and the evaluation still saves.
- **Baseline.** On 2026-11-04 at `7732e89`, `tsc` passed and 1,483 tests passed across 158 files in `src`; the seed test failed on 167 expected versus 172 live. No existing test covers F8, F9 or `toStatus`.
- **Unrelated baseline failure.** `src/lib/trainingProgress.test.ts` fails when the clock is in UTC (it assumes +08:00). It is out of scope here.
- **Step 1 is a large deletion.** It's limited to code with no route to it (F2). If you want the modal back later, it needs D1-B's durable-save redesign anyway.
- **The type change could ripple.** The effect of Step 2 hasn't been tested. If it shows more than a handful of `tsc` errors outside the readers listed in F4, stop and report before widening the change. Run the `ForHiringPage` and `ApplicantRankingPage` tests after Step 2.
- **Follow-up, out of scope: hire status naming and remaining silent writers.** `applicantStatus.ts` and migration `20261021200000_one_reference_per_applicant.sql` treat `Selected` as the canonical hire status. Every writer still stores `Hired`: `employeesApi.ts`, `hiredApplicantSync.ts`, the local mirror in `hiringFlow.ts`, and promotional Task 4. All live hired rows are `Hired`. Readers that match the raw string `hired` (`RSPDashboard.tsx`, `ApplicationStatusPage.tsx`) would mislabel a `Selected` row as not hired. Moving to `Selected` needs one change that updates those readers first, then the writers, then backfills existing rows. It belongs in its own plan, together with the remaining silent status writers, including `ApplicantRankingPage.tsx:224`.
- **RSP scoring read by email (fixed 2026-11-04).** Review found that email and name lookups could give an application a sibling's scores, and saving wrote them to `applicant_category_scores`. They are removed from the scoring path and the RSP dashboard. A read-only live check found no application relying on a sibling's evaluation, so no scores disappear. See the [session summary](../session-summaries/2026-10-30-applicant-status-and-score-writes-summary.md).
- **Before Done.** Run the live interviewer session. The read-only count of rows that normalize to `Shortlisted` with an `interview_date` came back zero on 2026-11-04, so no live applicant is refused that way today.
- **No live writes.** Tests mock Supabase, and the seeder is not run.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run src/lib/api/applicantStatus src/modules/interviewer scripts/seed-training-attendance.test.mjs --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"`, with new tests seen failing first
- `npx vitest run src scripts --maxWorkers 2 --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"`
- `grep -rn "total_score" src/modules/interviewer src/types/database.types.ts` returns no `applicants` writes
- The DESIGN_IDENTITY.md §16 checklist for the changed copy and badge in Steps 4–7 (no layout changes)
