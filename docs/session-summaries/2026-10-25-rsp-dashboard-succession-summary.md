# RSP dashboard succession section — summary

Plan: `docs/plans/2026-10-25-rsp-dashboard-succession.md`

## What shipped vs. planned

- **Data source.** `getSuccessionDashboardOverview()` counts each key position's successors with the ranking engine (`listAutoSuccessors().qualified`), the pool RSP → Succession Planning shows. It runs at most 4 engine calls at once. `talentPool`, `requiredSuccessorsCount` and the `succession_candidates` query are gone.
- **Layout.** The KPI card (Key positions, No successor, Leaving ≤ 24 mo, Talent pool, coverage bar) is removed. The section is one table: Key position, Incumbent leaves, Successors, sorted fewest successors first.
- **Drill-in.** Rows open `/admin/rsp/succession?dept=…&position=…`. The Succession Planning page expands that office, scrolls to the position and highlights it.
- **View all.** A large modal lists every key position with search and 8-row pagination. It follows the department filter, and Back closes it.

## Deviations

- The first build followed option B: named-only counts relabeled "named", with a KPI card and Coverage and Risk columns. After review the user asked to remove the KPI card, the Coverage and Risk columns, and to use the Succession Planning page's data, so the plan was revised the same day.
- The modal's risk filter was dropped along with the Risk column; search is its only filter.
- Added 2026-11-12 (audit): the D4 concurrency cap (`OVERVIEW_ENGINE_CONCURRENCY`) is gone. Commit `2514d8f` replaced the per-position engine calls with one batched `listAutoSuccessorsForPositions` call, which is the fix the plan named for slow loading.

## Checks run

- `npx tsc --noEmit`: clean.
- `npm test`: 57 files, 509 tests passed, including the updated `RspDashboardOverview.test.tsx` and the new `SuccessionPlanningPage.test.tsx`.
- `npm run lint`: could not run. The repo has no ESLint config, which predates this change.
- Impeccable detector: one finding, the 3px left border on the existing exam/interview session list (`.rd-ev`). It isn't part of this change and was left alone.
- **Not checked in a browser.** The local `.env` uses a disabled legacy Supabase key, so the dashboard cannot load data locally. Load time with the engine and the rendered layout are unverified.
