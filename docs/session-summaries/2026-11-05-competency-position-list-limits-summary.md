# Competency position list limits: summary

Plan: `docs/plans/2026-11-05-competency-position-list-limits.md`

## Shipped

- The position dropdown in PM > Competency Framework now lists every position and keeps every search match. The `slice(0, 50)` cap is gone.
- `fetchAllRows` (`src/lib/api/fetchAllRows.ts`) pages a query past the API's 1,000-row limit. It returns the same `{ data, error }` shape as a plain query, and a failed page gives `data: null`, never a partial list.
- `readAllRequirementRows` (`pmCompetency.ts`) is now the one whole-table read of `position_competency_requirements`. It backs `listPositions`, `listAllRequirements`, `getRequiredLevelMap`, and both `buildRequiredMap` functions.

## Deviations from the plan

- The plan moved each read to `fetchAllRows` directly. They share `readAllRequirementRows` instead, so the sort order and its reason live in one place.

## Decision worth keeping

Whole-table reads sort by `position_title`, then `competency_id`, not `id`. The Summary of Ratings maps are last-row-wins and some titles collide after normalizing. Ordering by `id` changed 4 required levels against live data, and the unique key changed none.

## Checks run

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm test`: 1,577 tests passed across 168 files, including 5 new helper tests and 2 new dropdown tests.
- Live before-and-after against production data, read-only: 927 rows both ways, 2 requests, same row set and titles, 0 changed values across the 921-key and 1,060-key required-level maps.
- In the browser against the dev server: `listPositions` returned 197 positions, `listAllRequirements` returned 927 rows, and `getIPCRRecordsFromGapView` ran without error.

## Not verified

- `npm run build` fails on this machine at `vite:esbuild-transpile` with "Access is denied" removing an esbuild temp file. Unmodified `HEAD` fails the same way in a clean worktree, so the change didn't cause it. All modules transform, and the type-check passes.
- The signed-in PM page wasn't opened. Sign-in goes to the production Supabase project, so credentials weren't entered, and dropdown rendering is covered by the component test rather than a visual check.
- The other Summary of Ratings map builders aren't exported, so they weren't called in the browser. Their logic was reproduced in the live comparison and covered by existing tests.

## Open findings, unchanged

- All 117 rows of `v_competency_gap_analysis` have an empty `mapped_competency_standard`, so `getIPCRRecordsFromGapView` builds no competency breakdown, and the required-level lookup isn't reached on that path with today's data.
- `listRequirements` in `competencyFramework.ts` orders by a `position` column that doesn't exist. The same query returns a 400 from the API.
- Six position and competency pairs exist under two spellings of `Engineer II (Plan Evaluator / Civil Inspector)`. Their levels match today.
- Other whole-table reads, such as the employee read in `listPositions`, are unpaged but well under the limit (137 rows).
