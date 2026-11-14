---
title: A vacancy with no vacant plantilla must say so
date: 2026-10-27
status: Done
summary: Job Vacancies called a position Open while its only plantilla was filled, so the public vacancy table — which lists one row per open plantilla — showed nothing. Give both surfaces the same predicate, label a fully filled vacancy as such instead of Open, and make open_vacancy refuse a position with no plantilla left to fill.
spec: Reported 2026-10-27 — "Admin Aide VI (Clerk III)" reopened in Job Posts, absent from the landing page
---

## Goal

A position that nobody can apply to never reads as Open. Where the public page
hides a position, the admin page says why.

## Background

`Admin Aide VI (Clerk III)` (`e9e39e03-b626-4bfd-a410-57195210b8f1`) has one
plantilla and it is `filled`. The vacancy was reopened on 2026-10-27 with a
2026-10-28 deadline, so `job_postings.status` is `Open` and `job_vacancies` has
an active row — and the Job Vacancies tab showed it as *Closing soon* with an
Applicants button.

The public table never showed it, correctly: it emits one row per plantilla
whose status is `open` (`LandingPage.tsx`), and this position has none.
`open_vacancy` could not have helped — it reopens plantillas marked `closed`
and deliberately leaves `filled` ones alone, because a filled plantilla records
a hire.

So the two surfaces disagreed on what "open" means. The admin asked only
`status` and deadline; the public page asked that *and* for a plantilla to
apply to. That gap is the defect.

## Approach

Name the missing idea once, in `vacancySearch.ts`, and have both sides use it.

`hasOpenPlantilla(job)` is true when at least one slot is `open`. A position
with **no** slot rows counts as open rather than filled: the mapper synthesises
a slot for a posting whose slots were never written, and a pre-migration read
returns none at all, so an empty list means "unknown", not "nothing left".

`isAdvertised(job)` — an open vacancy that still has a plantilla — becomes what
the public page filters on, and what `vacancyStatus` reports.

The public page keeps hiding filled positions. Explaining the absence belongs
in the admin, where someone can act on it, not to a job seeker.

## Steps

1. `src/lib/vacancySearch.ts`: add `hasOpenPlantilla` and `isAdvertised`.
   `vacancyStatus` returns `Fully filled` (neutral) for an open vacancy with no
   open plantilla, before the Closing soon check.
2. `src/components/LandingPage.tsx`: filter with `isAdvertised` in place of the
   local `isOpenToday`, which also moves the public page off the browser's
   local date onto the Manila date the rest of the system uses.
3. New migration: `open_vacancy` raises when the position has slot rows and
   none of them can be opened, so the refusal lands on the button rather than
   as an opening that appears to work.

## Risks

- `vacancyStatus` gains a label. `BADGE_CLASS` already covers `neutral`, and
  the Job Vacancies row keeps listing the position so it can still be closed.
- Treating "no slot rows" as open preserves pre-migration behaviour. Reversing
  that default would blank the public table wherever slots have not been
  written.
- The migration replaces `open_vacancy` only. Closing is untouched.
- The existing row stays as it is. Whether that hire is real is a data
  question, and unfilling it would also have to repair the applicant statuses
  the fill trigger set.

## Checks to run

- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- `npm run check:migrations`

## Status check 2026-11-14

Done. Shipped in `4e161ae` (PR #58): `hasOpenPlantilla` and `isAdvertised` in `src/lib/vacancySearch.ts`, with tests; the landing page filters with `isAdvertised`; and migration `20261027134156_open_vacancy_requires_vacant_plantilla` makes `open_vacancy` refuse a fully filled position. The existing Admin Aide VI row was left alone, as the Risks section planned. See `docs/session-summaries/2026-10-27-open-vacancy-with-no-vacant-plantilla-summary.md`.
