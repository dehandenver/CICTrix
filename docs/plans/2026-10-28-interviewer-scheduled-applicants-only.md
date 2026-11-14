---
title: The interviewer portal shows only applicants who were scheduled
date: 2026-10-28
status: Done
summary: The Assigned job postings table counted every applicant whose position matched, not the ones scheduled for an interview, so a posting read 6 while the list behind it held 1. Count and list both filter on an interview schedule now, and the applicant dedupe stops merging distinct people who share a plantilla item number. The oral assessment table's SCORE column no longer stretches to its longest option label and squeeze REMARKS off the row.
spec: Reported 2026-10-28 with screenshots of the dashboard table and the evaluation form
---

## Goal

The number on a posting is the number of people the interviewer will find
inside it, and each of those people is one row.

## Background

`Engineer II (Civil / Structural)` showed **6** applicants and one row behind
it.

`buildJobsFromPostings` counts every applicant whose position title matches an
Active posting (`InterviewerDashboard.tsx`). An interview schedule is never
consulted, so the count is "everyone who applied", which is not what an
interviewer is being asked to do. The same number drives the "N of M still to
evaluate" indicator beside it.

`fetchApplicantsByPosition` has the same gap — it also returns everyone who
applied — so the 6 → 1 drop is not the schedule filter working. It is
`dedupeApplicants`, which keys identity on `item:${item_number}` first.
`item_number` is the plantilla the applicant is competing for, not the person
(`EvaluationForm` reads it as `plantillaNameFor(applicant.item_number)`), so
six candidates for one plantilla collapse into one row. Fixing only the count
would have left the two numbers disagreeing at a different pair of values.

Separately, the oral assessment table's SCORE cell holds a native `<select>`
whose options read "4 – Very Satisfactory". A select sizes to its widest
option, so the column grows to roughly 220px, pushing REMARKS — the only
column the interviewer types into — past the edge of its container.

## Approach

"Scheduled" means the applicant has an `interview_date`. Status is the weaker
signal: an applicant moves to `Interview/Exam Scheduled` when the date is set
but moves on to `For Evaluation` or `Qualified` afterwards, while the date
stays. The interviewer still has to evaluate someone whose interview has
already happened, so the date is what keeps them on the list.

`isScheduledForInterview` goes in `src/lib/applicantSchedule.ts`, beside the
code that writes the schedule, and both the dashboard count and the applicants
list use it.

Identity falls back to the applicant's own id, then email and position, then
name and position. `item_number` is dropped from the key entirely.

The SCORE select is given the width of its cell rather than its longest
option. The rating scale is printed directly above the table, so the closed
dropdown does not need to repeat the words.

## Steps

1. `src/lib/applicantSchedule.ts`: add `isScheduledForInterview`, with tests.
2. `InterviewerDashboard.tsx`: count, evaluated-count and fully-evaluated all
   read the scheduled applicants only.
3. `InterviewerApplicantsList.tsx`: filter the fetched rows the same way, and
   drop `item_number` from the dedupe key. Export `dedupeApplicants` so the
   identity rule can be tested.
4. `src/styles/interviewer.css`: the SCORE column takes the width it needs for
   a number, the select fills its cell, and REMARKS takes the room freed.

## Risks

- A posting whose applicants have no schedule yet now counts 0. That is the
  honest answer for an interviewer, but it is a visible change to the table.
- Dropping `item_number` from the dedupe key makes the list longer wherever it
  was collapsing rows. That is the defect being fixed, not a regression.
- The portal still shows every scheduled applicant for a posting, not only the
  ones assigned to the signed-in interviewer. `assigned_interviewer_email`
  exists and would support that, but it was not asked for and is a separate
  decision.

## Checks to run

- `npx tsc --noEmit`
- `npm test`
- `npm run lint`
- `npm run build`

## Status check 2026-11-14

Done. Shipped in `7273919` (PR #66): `isScheduledForInterview` in `src/lib/applicantSchedule.ts` (with tests) filters both the dashboard count and `InterviewerApplicantsList.tsx`; the applicant dedupe was changed; `src/styles/interviewer.css` fixes the SCORE column. See `docs/session-summaries/2026-10-28-interviewer-scheduled-applicants-only-summary.md`.
