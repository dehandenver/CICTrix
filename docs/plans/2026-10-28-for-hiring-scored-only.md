---
title: For Hiring lists only applicants who were scored
date: 2026-10-28
status: Done
summary: The ranked list showed anyone merely Qualified, so applicants with no interview or exam score sat in a table ordered by interview score. Visibility now requires both scores, with applicants already past selection kept regardless, and the page refreshes from Supabase realtime instead of two same-tab events.
spec: Reported 2026-10-28 with a screenshot of Engineer II (Civil / Structural) · Plantilla 38
---

## Goal

Every row on For Hiring can be ranked, and the ranking is current without
reopening the page.

## Background

The list is headed "ranked by interview score", but inclusion asked only
`isForHiring(status) || completedIds.has(id)`. `QUALIFY_STATUSES` contains
plain `qualified`, so passing screening was enough to appear — with em-dashes
in both score columns and no basis for a position in the ranking.

`completedIds` is no better: it adds every key present in the
`cictrix_category_scores` localStorage object, whether or not that entry holds
a score.

Refresh was also narrower than it looked. The page subscribed to `evaluations`
and listened for two **same-tab** window events. A status change, a hire, or a
plantilla being filled by another admin — or in another tab — left the list
showing a stale ranking until it was reopened.

## Approach

A row needs both an interview score and an exam score, as resolved by
`resolveApplicantScores`, which is the same figure the table prints. Filtering
on the resolved score rather than on a status keeps the rule and the display
in step.

Applicants already past selection (`recommended for hiring`, `accepted`,
`for hiring`, `for contract signing`, `hired`) stay regardless. They hold the
plantilla, and hiding one would lose the selection the page exists to show.
Plain `qualified` is deliberately not in that set.

`useRealtimeRefresh` replaces the hand-rolled evaluations subscription and
watches `applicants`, `evaluations`, `plantilla_slots` and `newly_hired`. It
debounces and catches up on tab visibility, which the old wiring did not.

## Steps

1. `ForHiringPage.tsx`: add `isPastSelection`; filter rows on
   `(interviewScore != null && examScore != null) || isPastSelection(status)`.
2. Replace `subscribeToEvaluationChanges` with `useRealtimeRefresh` over the
   four tables, driving a `reloadKey` the loader depends on. Keep the two
   window events: exam and category scores are still written to localStorage,
   which no subscription can observe.
3. Tests for both branches of the rule; update the two existing ForHiringPage
   fixtures, whose applicants were unscored.

## Risks

- **Exam scores still live in localStorage** (`cictrix_exam_scores`,
  `cictrix_category_scores`). An applicant scored on one machine has no exam
  score on another, so this rule hides them there. The evaluation table is the
  one source a subscription can see; moving exam scores into Supabase is the
  real fix and is not in this change.
- A posting whose applicants are all unscored now shows an empty department
  rather than a list of unrankable names. That is the intent, but it is a
  visible change.
- Watching four tables raises realtime traffic on this page. The 400ms debounce
  in the hook collapses bursts.

## Checks to run

- `npx tsc --noEmit`
- `npm test`
- `npm run lint`
- `npm run build`

## Status check 2026-11-14

Done. Shipped in `0180fa6` (PR #69): `ForHiringPage.tsx` keeps a row only with complete scores or once past selection (`isPastSelection`), and refreshes through `useRealtimeRefresh` on `applicants`, `evaluations`, `plantilla_slots` and `newly_hired`. `ForHiringPage.scored.test.tsx` was added. Exam scores still live in localStorage, an open risk outside this plan. See `docs/session-summaries/2026-10-28-for-hiring-scored-only-summary.md`.
