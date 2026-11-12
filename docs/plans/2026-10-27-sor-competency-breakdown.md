---
title: Populate the Summary of Ratings competency breakdown
date: 2026-10-27
status: Done
summary: Run the AI competency matcher/assessor into the mirror so Summary of Ratings shows a real per-competency breakdown, and render assessed competencies with a nullable required level so an unconfigured Competency Map no longer blanks the whole panel.
---

## Goal

Every employee row in the PM Summary of Ratings (and the shared L&D view) expands to a
per-competency Required/Possessed breakdown with the existing IPCR drill-down, for every
employee whose IPCR is finalized and assessed. A competency with no Competency Map row shows
its possessed score with "Required level not configured" instead of being dropped. The
dead-end line "No competency breakdown available for this employee." remains only for
employees the assessor has never scored, and says so.

Supersedes nothing; extends `docs/plans/2026-10-26-ipcr-surface-sync.md` and the data map in
`docs/ipcr-data-map.md`.

## Approach

Three separate failures stack up, verified against production on 2026-10-27:

1. `finalize_ipcr_surfaces` (migration `20261026023000`) mirrors each success indicator into
   `ipcr_performance` with `competency_id` and `mapped_competency_standard` hardcoded `null`.
   All 760 rows carry null, because there is no competency tagging upstream to copy.
2. `v_competency_gap_analysis` groups by `ipcr.competency_id`, so it emits one null-competency
   row per employee (114 rows, `required_proficiency` collapsing to the 3.0 fallback).
3. `getIPCRRecordsFromGapView` (`src/lib/api/competencyGapAnalysis.ts`) drops any competency
   with no `position_competency_requirements` row for the position. `Number(null)` is 0, so it
   drops all of them, `competencies` is `[]`, and `CompetencyGapPanel` returns at its
   `comps.length === 0` branch.

Underneath, the assessor's output tables are empty (`ipcr_competency_matches` 0 rows,
`employee_competencies` 0 rows). Only `backend/app/routes/competency_matching.py` and
`competency_assessment.py` (Gemini) write them, and no frontend code calls either route.

The shape of the fix:

- **Substance of the breakdown** comes from the assessor. It already computes possessed per
  competency from the mapped targets' Q/E/T scores, which is exactly what the card shows.
- **The bridge** is `ipcr_performance.competency_id`: the mirror writes it from
  `ipcr_competency_matches` (join on `success_indicator_id`), so the existing view, the
  archive, and 2.4 all become competency-aware at once. Repointing the Summary of Ratings at
  `employee_competencies` instead was rejected: it would leave the view and archive stale and
  duplicate the view's period aggregation in JS.
- **Required becomes nullable** in the record and the card. The Map covers 7 of the 92
  position titles currently in the gap view (employee plantilla titles like "Construction &
  Maint General Foreman" have no Map row; the Map holds generic titles like "Construction and
  Maintenance Foreman"). Keeping "drop if unmapped" would leave the screenshot unchanged for
  85 positions, so an assessed competency now renders with required unknown and `isGap: false`.
  This deliberately relaxes the "Map is the only source of what applies" rule from commit
  `7b91acf`; the Map stays the source of *how much* is required.

Two backend defects have to be fixed before any batch run, or the data will be wrong:

- `employee_competencies` has a unique `(employee_id, competency_id)` — no `cycle_id` — and the
  assessor upserts on that pair. Assessing cycle 5 then 6 overwrites cycle 5's rows and stamps
  them cycle 6, which breaks the semester section's `cycle_id` scope.
- The assessor fetches `ipcr_competency_matches` by employee only, then skips the matcher when
  any rows exist. Assessed across cycles, cycle 6 reuses cycle 5's matches, whose
  `success_indicator_id`s are not in cycle 6's ratings, so possessed comes out empty.

## Steps

1. **Migration 1 — cycle-aware competency rows.** New file via
   `npx supabase migration new cycle_aware_employee_competencies`:
   drop unique `(employee_id, competency_id)`, add unique
   `(employee_id, competency_id, cycle_id)`. Table is empty, so no backfill needed. Verify with
   `pg_get_indexdef`.
2. **Migration 2 — tag the mirror with competencies.** New file via
   `npx supabase migration new ipcr_performance_competency_tag`:
   - rewrite `finalize_ipcr_surfaces` so the `ipcr_performance` insert takes
     `competency_id` / `mapped_competency_standard` from `ipcr_competency_matches` joined on
     `success_indicator_id = si.id` (a target can map to several competencies; take the
     highest-confidence row per indicator, `null` when unmapped);
   - add `public.sync_ipcr_performance_competencies(p_employee_num text default null,
     p_rating_period text default null)` that backfills tagged rows from matches by
     `employee_num` + `success_indicator_id` + period, so a post-finalization assessment run
     can be applied without re-running the fan-out;
   - backfill all existing tagged rows once inside the migration, and assert that no mirrored
     row with a matching `success_indicator_id` match keeps a null `competency_id`.
3. **Backend — cycle-correct assessor.** In `backend/app/routes/competency_assessment.py`:
   filter stored matches by `rating_period = str(cycle_id)`; re-run the matcher when that cycle
   has none; change the `employee_competencies` upsert to
   `on_conflict="employee_id,competency_id,cycle_id"`.
4. **Backend — batch runner.** `backend/run_competency_batch.py`: for a given `--cycle`, select
   every `target_settings` row with `status='approved' and phase2_status='completed'`, call
   `assess_employee_competencies` in-process, log per-employee success/failure, and finish by
   calling `sync_ipcr_performance_competencies`. Default to `--dry-run --limit 1` so one
   employee can be inspected before the full run.
5. **Run the batch for cycle 6 only first** (January–June 2026, 114 employees), then decide on 5
   and 7 after reviewing the output. Needs `backend/.env` with `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_KEY`, `JWT_SECRET_KEY` and `GEMINI_API_KEY` (none is present in the repo or root
   `.env` today, and `backend/.env` does not exist). Confirmation required: ~114 Gemini matcher
   calls + ~114 assessment calls; all three cycles would be ~544.
   Run with `python backend/run_competency_batch.py --cycle 6 --dry-run`, then `--limit 1`, then
   the full cycle.
6. **Verify the data** with read-only SQL: `ipcr_competency_matches` rows per cycle,
   `employee_competencies` rows per employee per cycle (≤12), and mirrored
   `ipcr_performance.competency_id` non-null for every indicator that has a match.
7. **Frontend — nullable required.** `src/modules/admin/pm/SummaryOfRatings.tsx` `IPCRRatingRecord`:
   `required?: number`, add `requiredAvailable?: boolean`. `src/lib/api/competencyGapAnalysis.ts`:
   stop dropping unmapped competencies; emit `required: null, isGap: false` when the Map has no
   row. `src/lib/api/semesterSummaryOfRatings.ts`: same for `getSemesterRatingRecords`, and stop
   skipping employees whose position has no Map rows — union the Map's competencies with those
   present in `employee_competencies`.
8. **Frontend — panel.** `CompetencyGapPanel.tsx`: render "Required level not configured" for a
   null required, exclude it from the gap count and from `summarizeGaps`'s gap list (mention the
   count of unconfigured competencies in one clause); replace the empty state with the actual
   reason — assessment not run for this employee this period — and keep it short.
9. **Map coverage, real sources only.** New script `scripts/backfill-competency-map-titles.mjs`
   (separate from `backfill-competency-map.mjs`, which derives from the gap view and therefore
   cannot help while the view is untagged). It seeds Map rows from `qualification_standards`
   (real levels, applied to employee titles that normalise to the same base title) and by
   inheriting a generic Map title's rows onto matching plantilla titles (strip parentheticals,
   `&`→`and`, `Maint`→`Maintenance`, drop punctuation), all tagged `source='auto-synced'` for
   PM review. Simulated against production: 109 new rows, covering 77 of 163 employee position
   titles (7 today); the other 86 stay "required not configured" until a PM sets them. Run with
   `--dry` first.

## Risks

- **Gemini mapping quality.** A target can be assigned to the wrong competency. Mitigation:
  inspect the cycle-6 dry run (one employee's matches + possessed) before the full batch; the
  drill-down already exposes confidence and justification per target, and
  `flag_for_review`/`confidence` are stored.
- **Cost and time.** ~272 matcher + ~272 assessment calls for three cycles; start with cycle 6.
- **Wrong-cycle overwrite.** Must land migration 1 and the backend upsert change before any
  batch; otherwise cycle history is destroyed one cycle at a time and is not recoverable.
  Table is empty today, so there is no data to lose in the migration itself.
- **Required unknown for most employees.** After this, the screenshot employee shows possessed
  per competency with "Required level not configured", not a gap badge. That is the honest
  state until the Map is filled; step 9 or PM entry closes it. Expect the gap counts and
  "Training recommended" badges to stay empty for unmapped positions.
- **Mirror tagging depends on `success_indicator_id`** being populated on matches. The
  assessor attaches it; standalone matcher rows do too (`_rows_from_result`). Rows without it
  fall back to null rather than text matching, so a partial match is visible, not silent.
- **Live writes.** Migrations go through PR and the Supabase integration, not
  `apply_migration` (repo rule). The batch writes to production; it needs explicit approval and
  a `service_role` key that must not be committed.

## Checks to run

- `npx supabase migration new` for each migration (never hand-named); `npm run check:migrations`
- `npx tsc --noEmit`, `npm run lint`, `npm test`
- `python backend/test_competency_assessment_math.py` after the assessor changes
- Read-only SQL after the batch: matches per cycle > 0; `employee_competencies` distinct
  `(employee_id, competency_id, cycle_id)`; mirrored rows with a match all have
  `competency_id`; `v_competency_gap_analysis` returns >1 row per employee with a name
- Manual pass: PM Summary of Ratings → Office of the City Engineer → Martin, Elizabeth →
  expanded panel shows competency cards; L&D Summary of Ratings shows the same panel
- `DESIGN_IDENTITY.md` §16 checklist for the card/empty-state copy changes

## Status check 2026-11-12

Done. Mirror tagging (Step 6) was dropped: 0 of 787 `ipcr_performance` rows carry a `competency_id`, and the later previous-semester plan no longer reads the mirror. See `docs/session-summaries/2026-10-27-sor-competency-breakdown-summary.md`.

Automated checks on `origin/main` (`cd71e17`): `npx tsc --noEmit` clean; `npx vitest run` passes 635 files and 5,479 tests, including the promotion smoke tests; `npm run check:migrations` OK (130 files). Vercel built and deployed `cd71e17` to production on 2026-11-05. A local `npm run build` fails on this machine because esbuild cannot delete its own temp files; the code compiles.
