---
title: Sync every IPCR surface from the authoritative record (summary)
date: 2026-10-26
plan: docs/plans/2026-10-26-ipcr-surface-sync.md
---

Written 2026-11-12 from a code, git and read-only database audit. No summary was recorded when the work shipped.

## What shipped

- Migration `20261026022600_fill_ipcr_accomplishments` fills the missing accomplishment text.
- Migration `20261026023000_finalize_ipcr_surfaces` adds the `finalize_ipcr_surfaces` function, two triggers and the backfill of the seeded IPCRs.
- `src/lib/api/ipcrRatings.ts` calls the `finalize_ipcr_surfaces` RPC on save and returns `{ ok: false }` when it fails.
- Summary of Ratings uses the "All rated periods" label. `ipcrPeriods.ts` adds `Jan 1-Jun 30 2026` to the canonical rating periods.
- Performance History shows each semester once through `normalizeSemesterKey` (commit `61f00f5`).
- Main commit `2e007c7`; PRs #29 and #31 merged.

## Deviations from the plan

- Follow-up migrations: `20261027120534_ipcr_performance_competency_tag` and `20261028075525_fix_finalize_ipcr_trigger`.
- The plan expected 272 mirrored records. Live on 2026-11-12: `ipcr_performance` 787 rows across 117 employees, `ipcr_submissions` 569, `locked_targets` 284, `performance_evaluations` 281, consistent with the backfill plus records seeded since.
- 24 `success_indicator_ratings` rows still have no accomplishment text, possibly rows added after the fill.

## Checks run

- Audit 2026-11-12: read-only SELECTs for the counts above, and both `finalize_ipcr` triggers present.
- Not done: the seven-screen manual pass, and a dedicated test for the RPC error path.
