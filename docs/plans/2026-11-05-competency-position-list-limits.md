---
title: Remove the position list limits in the competency framework
date: 2026-11-05
status: Done
summary: The PM position dropdown stops at 50 of 197 positions, and whole-table reads of position_competency_requirements would silently truncate at the API's 1,000-row limit. Show every position and page those reads without changing what any caller receives.
---

## Goal

A PM can browse and search all positions in Competency Framework > Position Requirements. Reads of `position_competency_requirements` keep returning every row after the table passes 1,000 rows (927 today). Every other page behaves exactly as it does now.

## Approach

Two independent limits:

- `list.slice(0, 50)` in `PositionSearchInput` (`PMCompetencyFramework.tsx`) truncates both browsing and search results. Remove it.
- The API returns at most 1,000 rows per request, measured live against a 10,024-row table. A new `fetchAllRows` helper in `src/lib/api/` pages a query until a page comes back empty. It returns the same `{ data, error }` shape as a plain query, so each caller's error handling stays as written. A failed page returns `data: null`, never a partial list.

Callers moved to the helper:

- `listPositions` and `listAllRequirements` (`pmCompetency.ts`)
- `getRequiredLevelMap` (`competencyGapAnalysis.ts`)
- `buildRequiredMap` (`semesterSummaryOfRatings.ts`, `sorSemesterSource.ts`)

**Sort order is `position_title`, then `competency_id`, not `id`.** Those map builders are last-row-wins, and some titles collide once lowercased or stripped of their parentheses, such as the two spellings of `Engineer II (Plan Evaluator / Civil Inspector)`. Against live data, ordering by `id` changed 4 required levels in the Summary of Ratings map. Ordering by the unique key changed none, and being unique it also pages stably.

Stopping on an empty page rather than a short one matches `lndArchive.ts`, so a server limit below the page size doesn't end the read early. It costs one extra request per read.

Out of scope: `listRequirements` in `competencyFramework.ts` orders by a `position` column that doesn't exist and returns a 400 today, so paging it changes nothing. The employee read in `listPositions` stays as it is, at 137 rows.

## Steps

1. Add `fetchAllRows` with tests: multi-page reads, a lower server cap, empty tables, and an error on a later page.
2. Move the five reads to it with the stable sort, and teach the `sorSemesterSource` test mock about `.range()`.
3. Remove the 50-item cap and add a test that more than 50 positions render.
4. Compare the rebuilt maps against the current ones using live data.

## Risks

- A sort change altering last-row-wins results. Covered by the live comparison in step 4.
- A mock without `.range()` breaking tests, or one that ignores it looping forever. Covered by updating the mock and running the full suite.
- Each read makes one extra request. The cost is small, and these reads already run alongside several others.
- A full-length dropdown on `PMCompetencyFramework` only. `PMPromotionalApplications` already renders every position from the same `listPositions`.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build`
- Live before-and-after comparison of the requirement maps
- Manual pass through PM > Competency Framework, both subtabs
