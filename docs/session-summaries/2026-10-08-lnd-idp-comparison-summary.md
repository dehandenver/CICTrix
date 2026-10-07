# L&D Dashboard: IDP beside TNA — summary

Plan: `docs/plans/2026-10-08-lnd-idp-comparison.md`

## Shipped

- `src/lib/idpAnalytics.ts` (+ 7 tests): tag selections per office, % of an
  office's IDP submitters per tag, top tag per office, case-insensitive office
  matching.
- `src/modules/admin/LNDDashboard.tsx`: each analytics row is now TNA left,
  IDP right (stacked on narrower than xl):
  - tag selections stacked by office beside the TNA category chart;
  - IDP profile (% of office per tag, career dark / personal light) beside
    the radar, with its own office dropdown that follows the radar on a name
    match;
  - IDP top request per department beside the demand table;
  - fourth KPI card, IDPs submitted this cycle with the most-requested tag.
- Stacked-bar tooltip extracted so both charts share it.

## Deviations

- Not checked visually: the local app needs an admin sign-in, and the user
  asked to push before signing in.
- `npm run lint` cannot run: the repo has no ESLint config.
- A read-only query of filed `idp_submissions` returned 0 rows (no filings
  yet, or RLS hides them from unauthenticated reads), so the IDP panels may
  show their empty states until IDPs are filed.

## Checks run

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 22 files, 243 tests passed.
- `npm run build`: succeeded.
