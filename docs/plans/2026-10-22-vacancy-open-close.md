---
title: Job Posts — two tabs, Open/Closed status, manual and automatic vacancy closing
date: 2026-10-22
status: Done
summary: Remove the Filled Positions tab and the Filled posting status. Job Positions shows every position as Open or Closed (derived). Job Vacancies lists only open vacancies, opened through Open Vacant Job Position and closed early through a Close Vacancy confirmation with a reason. Each opening is a job_vacancies row; RPCs enforce the RSP role, one active vacancy per position, and the audit trail. pg_cron and the application insert trigger close vacancies at the Manila deadline.
spec: docs/mockups/2026-10-19-job-post-split.html (layout); task brief pasted 2026-10-22
---

## Goal

RSP sees two views: every position, and the positions open for application right now. A vacancy opens with a deadline, closes by itself at 11:59 PM Manila on that date, or closes early with a recorded reason. Applicants are never touched by opening or closing.

## Decisions

| # | Decision |
|---|---|
| D1 | **Open** = posting `status = 'Open'` and Manila today ≤ `application_deadline`. Everything else is **Closed** (never opened / `On Hold`, deadline passed, closed manually). Derived in one helper (`positionStatus`) and in one SQL function (`vacancy_is_open`), never typed by hand. |
| D2 | `application_deadline` stays a `DATE`. The deadline instant is that date at 23:59:59 Asia/Manila. The modal only collects a date, so no time column is needed. "Today" is allowed; the date input's `min` is the Manila date. |
| D3 | New table `job_vacancies`: one row per opening (`job_posting_id`, `opened_on`, `deadline`, `remarks`, `opened_by`, `closed_at`, `close_type` `manual`/`automatic`, `close_reason`, `close_remarks`, `closed_by`). A partial unique index (`where closed_at is null`) enforces one active vacancy per position. This table is both the vacancy history and the audit log (opened / closed manually / closed automatically are its three events), so no separate audit table. |
| D4 | Open and close go through SECURITY DEFINER RPCs `open_vacancy(...)` and `close_vacancy(...)`, called from `src/lib/vacancies.ts`. Each checks `user_roles.role` is RSP or ADMIN for `auth.uid()`, writes the `job_vacancies` row and the posting's status/deadline in one transaction. |
| D5 | Auto-close: `close_expired_vacancies()` runs every 5 minutes via `pg_cron`, sets `close_type = 'automatic'`, `close_reason = 'Deadline reached'`, posting `Closed`, open slots `closed`. Because D1 derives Open from the deadline, the UI and the server are correct even if the job is late. |
| D6 | Server-side guard: extend `reject_application_to_closed_slot` (BEFORE INSERT on `applicants`) to also reject when the posting is not open per `vacancy_is_open`. Covers postings without slots too. |
| D7 | "Filled" leaves the Job Posts module: the tab, `FilledPositionsPanel`, the status filter option, the posting-level `Filled` badge, and `vacancyEligibility`'s `'filled'` case. `JobPosting['status']` drops `'Filled'`; any cached `'Filled'` reads as `Closed`. The DB never stored it (`Filled` was already written as `Closed`), so the "migration" of Filled records is a type/read change, no data rewrite. |
| D8 | Plantilla **slot** status `filled` stays in the database. The hire flow, reservations and the archive trigger depend on it, and the public Currently Vacant Jobs table still hides filled plantillas. Job Posts just stops showing it. Supersedes D6 of `2026-10-22-vacant-jobs-exclude-filled.md`. |
| D9 | Delete is blocked while the position is Open: "Close the vacancy first before deleting this position." |
| D10 | Job Vacancies row actions: Details, Applicants, Close Vacancy (secondary danger, outline red). Edit Deadline and Reopen are removed from this tab (see Open questions). |
| D11 | Backfill: every posting currently `Open` gets one active `job_vacancies` row (`opened_on` = posted date, `deadline` = its deadline, `opened_by` null). Postings already past deadline are then closed by the first auto-close run and get an `automatic` row. |

## Steps

1. **Migration** (`npx supabase migration new vacancy_open_close`): `job_vacancies` + indexes + RLS (RSP/ADMIN read), `vacancy_is_open`, `open_vacancy`, `close_vacancy`, `close_expired_vacancies`, the extended insert trigger, backfill, `pg_cron` schedule. Rollback file alongside, as earlier migrations do.
2. `src/lib/vacancies.ts` (service layer): `openVacancy`, `closeVacancy`, `listVacancyHistory`. `src/lib/vacancySearch.ts`: `positionStatus(job, now)` (Manila), `isOpenVacancy`, drop `'filled'` eligibility. Unit tests for the Manila boundary (23:59 vs 00:00 next day).
3. `JobPostingsPage.tsx`: two tabs, new subtitle, status filter All/Open/Closed, derived status badge, delete guard, remove `Filled` from `STATUS_COLORS`/`STATUS_LABELS`/`updateStatus` navigation; open/close go through the RPCs, then refresh `loadJobPostings`. Close Vacancy also in the Details view when Open.
4. `JobVacanciesPanel.tsx`: open vacancies only; columns Position Title, Plantilla(s), Office/Department, Date Opened, Application Deadline, Applicants, Status, Actions; office filter; search by title or plantilla; new empty state. Open dialog: lists only Closed positions (Open ones shown disabled "Already open"), Date Opened (default today) and Remarks fields, Manila-date validation, "No matching job position found" + Create Job Position link, success toast "Vacancy opened. Applications close on [date]."
5. New `CloseVacancyDialog` (§9.10 confirm, 480px): title, body, reason select (5 options), remarks (required for Other), Cancel / Close Vacancy (destructive). Toast "Vacancy closed."
6. Delete `FilledPositionsPanel.tsx` and its tests; update `vacancySearch.test.ts`, `JobVacanciesPanel.test.tsx`.
7. Checks below, then commit on this branch and open a PR (migration applies on merge).

## Risks

- **pg_cron availability.** Each Supabase project behind the three deploys must have the `pg_cron` extension enabled. If it isn't, the `create extension` fails and the migration aborts. D1/D6 keep behaviour correct without cron; only the `automatic` history row would be late.
- **RSP sign-in.** D4 assumes the RSP portal uses Supabase Auth (per the `user_roles` migration). If an RSP session has no `auth.uid()`, the RPCs reject it. I'll confirm in the browser before relying on it.
- **Fully filled posting left Open.** With D8, a posting whose plantillas are all filled stays in Job Vacancies until closed (reason "Filled through other means" fits). Previously it was hidden.
- **Existing localStorage caches** may hold `Filled`; mapped to Closed on read.

## Checks to run

- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run check:migrations`.
- Local Supabase (`supabase db reset`) for the migration: open, double-open rejected, close, auto-close, insert after deadline rejected, non-RSP rejected.
- Browser: tab counts change after open/close, filters, delete guard, Manila date `min`, console clean, mobile width.
- DESIGN_IDENTITY §16 checklist on the touched UI.

## Open questions

1. Remove **Edit Deadline** from Job Vacancies (the brief lists only Details, Applicants, Close Vacancy)? Plan assumes yes.
2. D8: keep hiding filled plantillas on the public table, and show fully filled postings in Job Vacancies until closed? Plan assumes yes.

## Status check 2026-11-12

Done. Everything in `docs/session-summaries/2026-10-22-vacancy-open-close-summary.md` is on main. Still not exercised: pg_cron and a browser pass.

Automated checks on `origin/main` (`cd71e17`): `npx tsc --noEmit` clean; `npx vitest run` passes 635 files and 5,479 tests, including the promotion smoke tests; `npm run check:migrations` OK (130 files). Vercel built and deployed `cd71e17` to production on 2026-11-05. A local `npm run build` fails on this machine because esbuild cannot delete its own temp files; the code compiles.
