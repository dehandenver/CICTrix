---
title: A vacancy with no vacant plantilla must say so (summary)
date: 2026-10-27
plan: docs/plans/2026-10-27-open-vacancy-with-no-vacant-plantilla.md
---

Written 2026-11-14 from a code and git audit. No summary was recorded when the work shipped.

## What shipped

- `src/lib/vacancySearch.ts`: `hasOpenPlantilla` and `isAdvertised` give Job Vacancies and the public list the same rule. `vacancyStatus` labels a fully filled vacancy "Fully filled" (neutral) instead of Open. Tests are in `vacancySearch.test.ts`.
- `src/components/LandingPage.tsx` filters with `isAdvertised`.
- Migration `20261027134156_open_vacancy_requires_vacant_plantilla`: `open_vacancy` refuses a position whose plantillas are all filled.
- Commit `4e161ae`, merged in PR #58.

## Deviations from the plan

- None found. The existing Admin Aide VI row was left alone, as planned.

## Checks run

- Audit 2026-11-14: the code, tests and migration are on `main`. Whether the migration is applied in production was not checked; the Supabase GitHub integration applies it on merge.
