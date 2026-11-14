---
title: The interviewer portal shows only applicants who were scheduled (summary)
date: 2026-10-28
plan: docs/plans/2026-10-28-interviewer-scheduled-applicants-only.md
---

Written 2026-11-14 from a code and git audit. No summary was recorded when the work shipped.

## What shipped

- `isScheduledForInterview` in `src/lib/applicantSchedule.ts`, with tests in `applicantSchedule.scheduled.test.ts`.
- The Interviewer Dashboard's assigned-postings count and `InterviewerApplicantsList.tsx` both filter on it, so the count matches the list.
- The applicant dedupe (`dedupeApplicants`) no longer merges different people who share a plantilla item number.
- `src/styles/interviewer.css` stops the oral assessment SCORE column from pushing REMARKS off the row.
- Commit `7273919`, merged in PR #66.

## Deviations from the plan

- None found. The exact dedupe key was not re-read in this audit.

## Checks run

- Audit 2026-11-14: the code and tests are on `main`. The 2026-11-12 full Vitest run on `cd71e17` passed.
