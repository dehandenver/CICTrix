---
title: IDP panels beside TNA on the L&D Dashboard
date: 2026-10-08
status: Done
summary: Each TNA chart on the L&D Dashboard gets an IDP panel to its right (tag selections by office, % of office per tag, top tag per office) plus an IDPs-submitted KPI card, so L&D can compare assessed gaps with what employees plan. Deployed to HR Demo and production from main.
---

## Goal

The L&D Admin can compare, office by office, what the ratings show (TNA,
assessed competency gaps) against what employees asked for in their IDP.
TNA stays on the left, IDP on the right.

## Approach

IDP is shown in its own vocabulary (the 7 form tags). No TNA-to-IDP mapping:
the tags do not line up word for word with the 12 TNA competencies, and the
form has no Cultural Transformation checkbox, so any mapping would be invented.

1. `src/lib/idpAnalytics.ts` (TDD): pure aggregation over `IdpSubmission[]`:
   selections per tag split by office, % of an office's submitters per tag,
   top tag per office, submitter counts.
2. `src/modules/admin/LNDDashboard.tsx`: load `listSubmissions(cycleYear)`
   with the existing calls; each chart section becomes a two-column row.
   - Row 1: TNA stacked bar | IDP tag selections stacked by office.
   - Row 2: TNA radar | IDP bars, % of office submitters per tag (career dark,
     personal light), own office dropdown that follows the radar when names
     match case-insensitively.
   - Row 3: TNA demand table | IDP top tag per office.
   - KPI: fourth card, IDPs submitted this cycle, top tag LGU-wide.
3. Free text (Other, specifics, recommendations) stays off the charts.

User asked to work directly on `main` and deploy to HR Demo and production.

## Risks

- Office names differ: TNA uses names like "Information Technology" and
  "Legal"; IDP uses the official 31 uppercase names. Only case-insensitive
  matches share a color or follow the radar dropdown.
- Multi-select: tag selection counts exceed headcount; percentages are per
  office submitter and do not sum to 100.

## Checks to run

- `npx vitest run`, `npm run lint`, `npm run build`
- Dashboard renders locally with real data.
- Vercel deployments for production and `cictrix-hr-demo` reach Ready.
