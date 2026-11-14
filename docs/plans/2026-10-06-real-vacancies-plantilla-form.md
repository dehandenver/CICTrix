---
title: Real vacancies only, per-plantilla salary, reference numbers in RSP
date: 2026-10-06
status: Done
summary: The landing page lists only open RSP postings; the Create Job form drops shared salary fields and reorder arrows; the applicant detail view shows the reference number. Database work (demo rebuild, atomic save) waits for approval.
spec: docs/mockups/2026-10-06-plantilla-slots-form.html
---

## Goal

Applicants see only vacancies RSP actually posted, RSP posts a job without any
item number, and every application's reference number is visible to RSP.

## Approach

Decisions taken when the user asked to deploy with questions still open; each
is the recommendation given in chat and can be revisited:

- Reference numbers keep the live `ABYAN-000-000` format from migration
  20260923 (server-side trigger, unique, retried, backfilled). The requested
  `ABYAN-YYYY-000` allows only 1,000 a year.
- Plantilla input stays the HRIS named list (mockup above). Item numbers were
  already hidden by 6a7f649; `plantilla_slots.item_number` remains an
  auto-filled internal key, so its unique index is left in place.
- Each plantilla's Salary Grade and Monthly Salary are required; the posting's
  own salary columns mirror Plantilla 1.
- New postings write `job_postings` and `plantilla_slots` only; `jobs` is an
  unused leftover (empty on production).
- `src/constants/positions.ts` stays: other dropdowns and department fallbacks
  use it. Only the landing page's use of it is removed.
- No confirmation email exists for applications, so none is changed.

## Steps

1. `.gitignore`: `.env.prod-dump`. Done.
2. Landing page: real open postings only, loading / error / empty states, true
   counts; fix the refetch loop. Done.
3. Create Job form: remove shared salary fields and reorder arrows, require
   per-plantilla salary. Done.
4. Applicant detail view: reference number instead of the internal item key. Done.
5. Database, after the user's "go": rebuild the demo schema from production's
   structure (no sample job postings), then an RPC that writes a posting and
   its plantillas in one transaction, and migration 20260928 on the demo.
6. End-to-end tests on the demo once it is rebuilt.

## Risks

- Until step 5 runs, the HR Demo landing page shows the new error message
  (its database denies `job_postings`), where it used to show placeholders.
- Job creation is still two client calls (posting, then plantillas) until the
  RPC exists.
- Production lacks migration 20260928, so plantilla names entered there are not
  stored (the app falls back to "Plantilla N"). Production is out of scope.

## Checks to run

- `npx tsc --noEmit`, `npx vitest run`, `npm run build`
- Landing page against production data (read-only); Create Job form opened, not
  submitted.

## Status check 2026-11-12

Done. Steps 1–4 shipped. Steps 5–6 (atomic-save RPC, demo rebuild and end-to-end tests) were dropped after `20261021100000_merge_postings_per_plantilla` changed the posting model.

Automated checks on `origin/main` (`cd71e17`): `npx tsc --noEmit` clean; `npx vitest run` passes 635 files and 5,479 tests, including the promotion smoke tests; `npm run check:migrations` OK (130 files). Vercel built and deployed `cd71e17` to production on 2026-11-05. A local `npm run build` fails on this machine because esbuild cannot delete its own temp files; the code compiles.
