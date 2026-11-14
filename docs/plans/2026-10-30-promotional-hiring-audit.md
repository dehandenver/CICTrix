---
title: Verify the promotional hiring pipeline
date: 2026-10-30
status: Done
summary: Read-only audit of promotion applications, evaluation, selection, appointment, and employee updates. Approved in chat; no application code or live records will be changed.
---

> **Follow-up (updated 2026-10-30).** This audit is finished, and its findings are fixed elsewhere. [Repair the promotional hiring pipeline](2026-10-30-promotional-hiring-fixes.md) (In Progress) has fixed Tasks 1–3 and 3A, the scheduled-interviewer display. Task 4 is next and is blocked until an isolated database is available. [Fix applicant score and status writes](2026-10-30-applicant-status-and-score-writes.md) (Draft) covers the `applicants.total_score` write and the live-data seed test this audit noted. Its evidence is in [the live database check](../session-summaries/2026-10-30-live-db-claims-verification-summary.md).

## Goal

Determine which stages of the promotion hiring pipeline are verified, broken, or untested, with evidence from code, deployed schema, existing tests, and accessible UI.

## Approach

Trace the applicant/RSP hiring flow and distinguish it from the PM promotional-application module. Inspect service calls, database functions, access policies, and deployed objects. Run existing checks without submitting applications or making decisions.

## Steps

- [x] Trace internal application through screening, evaluation, selection, appointment, and employee-record update.
- [x] Compare deployed schema, functions, and permissions with application expectations; review logs/advisories.
- [x] Run TypeScript and existing tests. UI inspection was intentionally not performed: app startup invokes live database backfills, which conflicts with the read-only scope.
- [x] Record evidence, blockers, and verification limits in [the session summary](../session-summaries/2026-10-30-promotional-hiring-audit-summary.md).

## Risks

- Read-only inspection cannot prove write operations end to end; mark these as untested where appropriate.
- Distinct PM and RSP promotion flows may look connected without sharing data.
- Existing local work must remain untouched, including untracked run-queue.bat.
- No delegation, code fixes, commits, pushes, deployments, or live database writes are included.

## Checks to run

- `npx tsc --noEmit`
- Existing relevant Vitest tests (and full suite if practical).
- Read-only Supabase metadata, aggregate queries, logs, and advisors.
- Browser inspection if an accessible app/session is available.
