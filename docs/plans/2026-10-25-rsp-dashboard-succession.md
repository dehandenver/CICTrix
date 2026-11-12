---
title: RSP dashboard succession section — ranked successors, drill-in, View all
date: 2026-10-25
status: Done
summary: The dashboard's succession section becomes one table (Key position, Incumbent leaves, Successors) whose counts come from the Succession Planning page's ranking engine; rows open the position on that page and a View all modal lists every key position.
spec: docs/mockups/2026-10-25-rsp-dashboard-succession.html
---

## Goal

The Succession planning section of the RSP dashboard shows the same successors as RSP → Succession Planning, and the RSP admin can act on it: open any key position on that page and see all key positions, not just the top 5.

## Approach

**Revised 2026-10-25.** The first version (option B: count manually named rows in `succession_candidates`, relabeled "named") showed 0 everywhere, because no screen names successors. On review the user asked to:

- remove the KPI card (Key positions, No successor, Leaving ≤ 24 mo, Talent pool, coverage bar);
- keep the table but drop the Coverage and Risk columns;
- take the data from the Succession Planning page.

So `getSuccessionDashboardOverview()` now counts each position's ranked pool with `listAutoSuccessors(id).qualified`, the list the Succession Planning page shows. The mockup file still shows the option B layout; this plan supersedes its KPI card and columns.

| # | Decision |
|---|---|
| D1 | **One table.** Columns: Key position (title over office), Incumbent leaves, Successors (ranked pool size, "—" with a tooltip when the engine failed for that position). Sorted fewest successors first, then soonest leaving date, then title. Header: "Key positions · fewest successors first". |
| D2 | **Row drill-in.** Rows are `role="link"` (Enter/Space, chevron, §9.5 hover) and navigate to `/admin/rsp/succession?dept=<departmentId>&position=<positionId>`. `OcboTableView` reads the params, expands that office, scrolls the position into view and highlights it for 2.4s. Browser Back returns to the dashboard (§8.2). |
| D3 | **View all modal.** "View all (N) →" under the table when there are more than 5 rows. Shared `Modal` at `size="lg"` (§9.10, §9.7.1), search by position or office (§9.4), pagination at 8 rows (§9.6). Rows drill in as in D2, replacing the modal's history entry. Browser Back closes it. It follows the dashboard's department filter. |
| D4 | **Engine cost.** `listAutoSuccessors` runs once per position, several queries each. Calls are capped at 4 in flight (`OVERVIEW_ENGINE_CONCURRENCY`); the section shows "Ranking successors for each key position…" until all resolve. |

## Steps

1. `src/lib/api/succession.ts`: `getSuccessionDashboardOverview()` returns `departmentId` and an engine-derived `successorCount` (null on failure); drop `talentPool`, `requiredSuccessorsCount` and the `succession_candidates` query.
2. `src/modules/admin/RspDashboardOverview.tsx`: remove the KPI card; local `SuccessionTable` (three columns) shared by the card and `SuccessionListModal`; `onOpenSuccessionPosition` prop. Styles in `src/styles/rsp-dashboard.css` under `.rspdash`.
3. `src/modules/admin/RSPDashboard.tsx`: pass `onOpenSuccessionPosition`.
4. `src/components/SuccessionPlanningPage.tsx`: `dept` / `position` deep link with an `id` on each position block.
5. Tests: `RspDashboardOverview.test.tsx` (columns, order, "—", drill-in, modal search and pages) and a new `SuccessionPlanningPage.test.tsx` (deep link).
6. `npx tsc --noEmit`, `npm run lint`, `npm test`; browser check at 1366×768 and mobile; §16 checklist; impeccable detector.

## Risks

- **Load time.** The dashboard now runs the full ranking engine for every key position (33 today). Expect a few seconds before the table appears, and that load repeats on every dashboard visit. If it is too slow, the fix is a batched engine call or a server-side view, not more concurrency.
- "Incumbent leaves" stays "—" for positions without `incumbent_leaving_date`; that is data, not a bug.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- Browser: dashboard → row → Succession page opens the right office and position; Back returns to the dashboard; View all → search, paginate, Esc and Back close it; mobile full-screen sheet; successor counts match the Succession Planning page.

## Status check 2026-11-12

Done. The concurrency cap was later replaced by a batched engine call (`2514d8f`), now recorded in the summary.

Automated checks on `origin/main` (`cd71e17`): `npx tsc --noEmit` clean; `npx vitest run` passes 635 files and 5,479 tests, including the promotion smoke tests; `npm run check:migrations` OK (130 files). Vercel built and deployed `cd71e17` to production on 2026-11-05. A local `npm run build` fails on this machine because esbuild cannot delete its own temp files; the code compiles.
