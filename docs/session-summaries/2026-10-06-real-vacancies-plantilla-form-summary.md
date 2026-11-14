---
title: Real vacancies and the plantilla form (summary)
date: 2026-10-06
plan: docs/plans/2026-10-06-real-vacancies-plantilla-form.md
---

Written 2026-11-12 from a code, git and read-only database audit. No summary was recorded when the work shipped.

## What shipped

- Step 1: `.gitignore` ignores `.env.prod-dump`.
- Step 2: the landing page lists only open RSP postings (commit `8b86af2`). It was later reworked to per-plantilla rows in `8c7ea27` and `4acfa58`.
- Step 3: the Create Job form drops the shared salary fields and reorder arrows. The form was reworked again in `4dd5ee4` and `6a7f649`.
- Step 4: the applicant detail view shows the reference number (commit `c81422b`).

## Deviations from the plan

- **Dropped, Step 5:** the transactional RPC that saves a posting with its plantillas was never built, and the demo schema rebuild can't be confirmed. Migration `20261021100000_merge_postings_per_plantilla` changed the posting model to one posting per title per office, which overtook this step. The 20260928 migration was restored as `20261021000006_restore_plantilla_labels_one_application_per_plantilla`.
- **Dropped, Step 6:** the demo end-to-end tests have no record.

## Checks run

- Audit 2026-11-12: the live `jobs` table has 0 rows, confirming the plan's "unused leftover" finding.
