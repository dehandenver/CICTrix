# Applicant status and score writes: session summary

Plan: [Fix applicant score and status writes, and the live-data seed test](../plans/2026-10-30-applicant-status-and-score-writes.md). Implemented on 2026-11-04 on `fix/applicant-status-transitions`, from `upstream/main` `da571e0`.

## What shipped

- **Dead score path removed.** The unreachable modal, its handlers and the state only it used are gone from `ApplicantDetailsPage.tsx`, and `total_score` is gone from the `applicants` types. A type test rejects it coming back. The `cictrix_rsp_score_setup` write stays, because `EvaluationForm` reads it.
- **Status transition service.** `src/lib/api/applicantStatusTransition.ts` compares and sets against the exact stored value. On zero updated rows it re-reads, so a lost race, a missing row and a denied write are told apart.
- **Evaluation submission.** A saved evaluation advances to `For Evaluation` only through the service. A failed status step leaves the evaluation saved and shows a warning. The local mirror changes by UUID only, on a confirmed advance.
- **Interviewer Qualify and Disqualify.** Both go through the service. The UI changes after the server result, and refusals and failures are shown. The mock fallback is gone from this path.
- **Shared emails.** The score snapshot is written and read by application ID only, including in `evaluationScores.ts`.
- **Readers.** `Reviewed` normalizes to `For Evaluation`. `toJobPostApplicantStatus` handles the evaluation stage, `Not Selected` and `Withdrawn`. The interviewer pill checks closed outcomes first.
- **Seed test.** It runs on a fixture and fails on any write, so it no longer depends on live data.

## Differences from the plan

- **Step 1.** The evaluation loader in `ApplicantDetailsPage` stays, with its state now write-only, because it also gates a secondary-source attachment fallback. Follow-up: remove the unused reads.
- **Step 5.** Added after review: Qualify on an evaluated applicant still at the interview stage first moves them to `For Evaluation`. Without this, a failed status step left no way forward, since no RSP action writes that status. Refusal copy now depends on the action and on whether an evaluation exists.
- **Step 6.** A third reader, `evaluationScores.ts`, was found in review and fixed.
- **Step 7.** `Withdrawn - Hired Elsewhere` maps to `Rejected`, because the local status union has no withdrawn value. A person hired elsewhere therefore reads as Rejected in Reports.
- **Step 8.** `vi.setSystemTime` was not needed: the seeder hardcodes its clock at 2026-10-28.
- **Risks.** The `trainingProgress` UTC risk stays, because it depends on the clock and a pass on a +08:00 machine doesn't clear it.

## Not done

- **The plan's Goal is only partly met.** RSP scoring can still pick up a sibling application's evaluation through email-based lookups: `buildEvaluationSnapshotMap` email keys, `QualifiedApplicantsRSPPage.tsx:181`, `QualifiedApplicantsSection.tsx:669` and `:1362`. Saving such a row writes the wrong scores to `applicant_category_scores`. This predates the branch and needs its own decision, since the lookups were added for evaluations saved against a sibling row.
- **Live interviewer check.** Not run, so the plan stays In Progress. Add a read-only count of rows that normalize to `Shortlisted` with an `interview_date`: they would be refused on Qualify after evaluation.
- **Browser check.** None was run. Live writes weren't authorized, so the changed copy and pill were checked in tests only.

## Deferred minors from the review

- The service discards the raw error in the evaluation path, so a denied write can't be diagnosed. Add one `console.error`.
- The interviewer pill shows Withdrawn as amber, but §10 says Neutral.
- A refusal arriving after the details close can appear on the next applicant opened.
- `.details-btn` has no disabled style or §9.1 spinner.
- "Isn't at the interview stage" is wrong when the status is already `For Evaluation`.
- The mirror's workflow rule leaves a stale local `Shortlisted` row stale after a confirmed advance.
- `For Contract Signing` and `Selected` still archive as `New Application`, `Reviewed` as `Under Review`, and legacy `Interview Completed` as `For Interview`.
- `RSPDashboard.tsx:490` shows `For Evaluation` in gray.
- `decisionFailure` wraps the error in a new `Error`, losing any `code`.
- With mock mode on, list rows come from the mock database but decisions go to Supabase.

## Checks run

At `82b331a`:

- `npx tsc --noEmit`: pass.
- `npm run lint`: pass.
- `npx vitest run src scripts --maxWorkers 2 --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"`: 1,562 tests pass across 166 files.
- `npm run build`: pass.
- `git diff --check`: clean.
- `grep -rn "total_score" src/modules/interviewer src/types/database.types.ts`: no matches.

Tests mock Supabase. The whole branch was reviewed by a fresh Opus reviewer at high effort, with no Critical findings. Its two Important findings were fixed test-first, apart from the wider RSP email path above. Running the suite rewrites `DataTable.test.tsx.snap`, so that change was restored each time and not committed.
