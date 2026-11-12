---
title: One Reference No. per applicant across plantillas, with hired-elsewhere state
date: 2026-10-15
status: In Progress
summary: An applicant keeps one Reference No. for every plantilla they apply to. Being hired on one plantilla withdraws their other open applications, which stay visible as "Hired elsewhere". The tracker shows every application under the reference.
spec: List option A in docs/mockups/2026-10-15-rsp-hired-elsewhere-row.html; tracker layout A in docs/mockups/2026-10-15-tracker-multi-application.html (both chosen 2026-10-15)
---

## Goal

Someone who applies to several plantillas gets one Reference No. and uses it to track all of their applications. Once they're hired on one plantilla, their other applications stay in every RSP list but are clearly not hireable, and the tracker shows the same thing to the applicant.

Today `20260923_application_reference_no.sql` generates a new, globally unique number for every application row. `20260928` already allows one application per email per plantilla, so a person with three applications holds three numbers. Hiring touches only the one row, and the tracker fetches only one application (`.limit(1)` in `ApplicationStatusPage.tsx`).

## Approach

The person is identified by normalised email, since the public portal has no accounts. That is the same identity `uq_applicants_one_per_plantilla` already relies on. The status changes caused by a hire happen in the database because at least five client paths write a hire (`ForHiringPage`, `QualifiedApplicantsPage`, `RSPDashboard`, `employeesApi`, `hiredApplicantSync`). Changing each of them would miss one.

| # | Decision |
|---|---|
| D1 | **One reference per person.** New table `applicant_reference_numbers (reference_no_normalized PK, reference_no, email_normalized, is_primary)`. A partial unique index allows one primary per email. `assign_application_reference_no()` reuses the email's primary reference, or creates one if none exists. Clients still can't set the value, and `freeze_application_reference_no` stays. |
| D2 | **Uniqueness moves to the table.** Drop `uq_applicants_reference_no_normalized` on `applicants`, since rows now share a reference. The new table becomes the guarantee that a reference belongs to one person. `generate_application_reference_no()` checks for collisions against the table. |
| D3 | **Backfill and aliases.** For each email with several numbers, the oldest application's number becomes the primary, and every application row gets that number. The other numbers are kept as non-primary rows (aliases), so printouts and emails people already hold still find their applications. Applications with a blank email keep their own number as a primary of their own. |
| D4 | **New final status `Withdrawn - Hired Elsewhere`** (stored with an ASCII hyphen so client comparisons can't trip on an en dash). It goes in `APPLICANT_STATUSES` and `TERMINAL_STATUSES`, with an applicant message ("You have been appointed to another position under this Reference No. This application is closed."), the funnel bucket, and the tracker badge map. It is kept apart from `Not Selected`, which means someone else got the post. |
| D5 | **Hire trigger.** When an application's status becomes `Selected`, `Hired` or `Accepted`, every other open application with the same email (not already in a final status) gets `status = 'Withdrawn – Hired Elsewhere'`, `hired_elsewhere_application_id = <hire row>`, and `status_before_withdrawal = <old status>`. These are new nullable columns on `applicants`. Its `application_plantilla_slots` rows are set to withdrawn as well. |
| D6 | **Undo restores.** If the hiring row leaves Selected/Hired/Accepted, the rows it withdrew get their `status_before_withdrawal` back, and both new columns are cleared. |
| D7 | **Promotion re-apply is allowed.** A hired person can still apply. The new application gets the same reference and starts as a normal open application, because D5 only touches applications that are open at the moment of a hire. If the email has a Selected/Hired application or matches an `employees` row, RSP lists tag it "Current employee – promotion". If that promotion is hired later, D5 runs again for the person's then-open applications. |
| D8 | **RSP list (option A).** A hired-elsewhere row stays where it ranks, at 50% opacity with a hatched background. It shows a green "Hired elsewhere" pill with "<Position> · <Plantilla label> · <date>" beneath. Its checkbox and actions are disabled, with a title tooltip naming the plantilla. The Reference No. cell shows an "N apps" chip when N > 1, which opens a popover listing the person's applications (position, plantilla, status). These rows are left out of a plantilla's open-candidate counts and can't be selected in bulk. |
| D9 | **Tracker (layout A).** A lookup by reference (primary or alias) or by email returns **all** of the person's applications. A header shows the name, primary Reference No. and count. Below it is a summary list with one row per application (position, plantilla label, office, status badge). One row is open at a time and shows the existing timeline, documents, schedule and notice sections for that application. The default open row is the first one needing action (Pending, or a schedule set), otherwise the newest. Withdrawn rows are muted and read "Withdrawn: hired on <Plantilla label>". Polling and realtime follow the whole set. |

## Steps

1. Migration `20261021200000_one_reference_per_applicant.sql` (written as 20261015, renumbered on 2026-10-21 to clear the migration guard): the D1 table, generator and trigger changes, D2 index swap, D3 backfill, D5/D6 columns and trigger, recreated `applicant_tracker_view` with the new columns and the plantilla label. Write a rollback in `supabase/rollbacks/`. Before writing, check whether `applicants.status` has a CHECK constraint and extend it if it does.
2. `src/lib/api/applicantStatus.ts` (+ test): add the D4 status, message and funnel bucket.
3. `ApplicantWizard.tsx`: after submitting, show the reference the server returned, worded "Your Reference No. for all your applications". When the email already has applications, add a note that the new one was added under the same reference.
4. `ApplicationStatusPage.tsx`: resolve aliases, fetch all rows, build the D9 list and selected-application state, and scope polling to the set. **Done 2026-10-26** (`docs/plans/2026-10-26-tracker-application-list.md`; rows expand in place, `docs/mockups/2026-10-26-tracker-application-list.html`).
5. RSP lists (`QualifiedApplicantsRSPPage`, `QualifiedApplicantsPage`, `ApplicationsListPage`, `RSPDashboard` plantilla applicant tables, `ForHiringPage`): D8 row treatment, apps chip and popover, promotion tag, and leaving these rows out of counts and bulk select.
6. Run the checks below and write the session summary.

## Risks

- Several hire paths still write `Hired` from the client after the fact (`hiredApplicantSync` backfill on app start). D5 must be idempotent so a repeated `Hired` write doesn't re-withdraw or overwrite `status_before_withdrawal`.
- Dropping the per-row unique index takes away the old guarantee. D1's table has to be the only place a reference is minted, and the generator must check collisions against it, not against `applicants`.
- Emails are the identity. Two people sharing an email (family accounts) would be merged under one reference, which the existing one-per-plantilla rule already assumes. Applications with a blank email are never merged.
- The anon tracker now returns several rows per lookup. The view still leaves out `disqualified_by` and hidden disqualification messages for every row.
- The repo checkout is on a detached HEAD, so work needs a branch (or main, per the HR repo rule) before any commits.

## Checks to run

- Run the migration twice on a copy of live data. The second run changes nothing, and the backfill NOTICE counts match a manual count of emails with several numbers.
- SQL: apply to plantillas A and B with one email and confirm one reference. Hire on A, and B becomes Withdrawn with the saved prior status. Revert the hire, and B is restored. Apply again to C after the hire, and C stays open with the promotion tag.
- Search the tracker by primary reference, by an old alias, and by email. All three return the same full list, and the default-open rule picks the right row.
- `npm run build`, `applicantStatus.test.ts`, then check the RSP list in the browser: the row is dimmed, actions are disabled, it's excluded from bulk select and counts, and the popover lists all applications.

## Status check 2026-11-12

Still In Progress. Done: migration (applied live), the "Withdrawn - Hired Elsewhere" status, the wizard reference label, and the tracker. Left: the D8 "N apps" chip and popover on RSP lists, the wizard note that an application was "added under the same reference", and recording the Step 6 checks (migration double-run, SQL scenarios).

Automated checks on `origin/main` (`cd71e17`): `npx tsc --noEmit` clean; `npx vitest run` passes 635 files and 5,479 tests, including the promotion smoke tests; `npm run check:migrations` OK (130 files). Vercel built and deployed `cd71e17` to production on 2026-11-05. A local `npm run build` fails on this machine because esbuild cannot delete its own temp files; the code compiles.
