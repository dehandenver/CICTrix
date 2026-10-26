---
title: L&D Dashboard redesign, Layout A (TNA · IDP · Trainings Done)
date: 2026-10-14
status: Done
summary: Replace the L&D Dashboard's oversized KPI row and paired TNA|IDP rows with three compact module summary cards and one chart row per module, built from real data. Adds the 2-trainings-per-year compliance chart, a "still needs training" employee list, and a Department filter. Deploy to HR Demo and production from main.
---

## Goal

The L&D Admin sees TNA, IDP and Trainings Done at a glance on one page with
sensible sizing, and can tell which employees still have not met the mandated
2 trainings per year.

## Approach

> **Superseded 2026-10-26** for the header and summary cards by
> `docs/plans/2026-10-26-lnd-dashboard-office-pager-required-icon-work-experience.md`
> (RSP dashboard pattern). The chart rows below still apply.

Mockup: `docs/mockups/2026-10-14-lnd-dashboard-layout-a.html` (v5 from the
ui-preview session). Layout comes from the mockup; colors and components come
from `DESIGN_IDENTITY.md` / `abyan-tokens.css`, not the mockup's hex values.

Page order: header with cycle year → existing two warning banners (unchanged) →
3 summary cards → TNA row → IDP row → Trainings Done row.

### Data mapping (real sources only)

| Mockup element | Source | Note |
|---|---|---|
| TNA: employees with gaps | existing `employeesWithGaps` | unchanged logic |
| TNA: offices assessed x/N | offices in `computeNeedsAssessment()` / active offices | |
| TNA: "Coverage 78%" | **dropped** | no "assessed vs not assessed" field is exposed; would be invented |
| TNA heatmap, 12 × office | `needs[].offices[].demand` over the real `COMPETENCY_LIST` | cell = % of office headcount with the gap; 6-step legend |
| Top competency needs, `n / N` | `affected` summed over offices / active headcount | denominator is active headcount (what the assessment divides by), not "employees assessed" |
| IDP: submitted x of N | `listSubmissions(cycle)` / active headcount | |
| IDP: approved, linked to TNA | **dropped** | no approval status on IDPs; TNA↔IDP mapping rejected in the 2026-10-08 plan |
| IDP status by office | submitted vs not yet submitted per office | no draft/approved states are queryable |
| IDP requests by tag | existing `tagSelectionsByOffice` chart | kept |
| Trainings: completion x of y | existing `trainingProgress(calendarEvents)` | |
| Trainings: hours | **dropped** | no duration/hours field on calendar events |
| 2-training compliance | new pure fn: per active employee, count this year's non-cancelled, ended calendar events where they are an attendee with `attendanceStatus === 'Present'`; bucket 0 / 1 / 2+ | overall bar + one bar per department |
| Still needs training list | same fn, employees with < 2, 0-of-2 first; name, department, position | "Export list" downloads CSV of the filtered list |
| Department filter | client-side filter over the compliance data | applies to the Trainings Done row only |

### Removed from the dashboard

TNA radar, TNA demand table, IDP profile-by-department bars, IDP top-tag-per-office
table, and the department drill-down modal. This reverses the side-by-side layout
from `2026-10-08-lnd-idp-comparison.md`, per the Layout A decision.

## Steps

1. `src/lib/trainingCompliance.ts` (TDD, Vitest): `trainingCompliance(employees, events, now)`
   → per-employee count, buckets, per-department breakdown. Edge cases: cancelled
   events, future events, Absent/Excused, employee attending the same event twice.
2. Active employee list: reuse the `employees_with_department` query through a
   function in `src/lib/api/` (no inline Supabase in the component).
3. `LNDDashboard.tsx`: rebuild `LndDashboardContent` render to the mockup;
   remove the unused state/memos for the dropped sections.
4. Checks below, then commit on `main` (Conventional Commit, no AI signature)
   and push `HEAD:main` from a clean worktree of `origin/main`. The local
   `C:\Users\Trisha\CICTrix` checkout (517 behind, uncommitted edits) is not touched.
5. Vercel git integration deploys both projects; confirm both reach Ready.

User asked to work directly on `main` and deploy to HR Demo and production.

## Risks

- Compliance depends on attendance being marked. Trainings with no attendance
  recorded count as 0 for everyone on the roster, which overstates "needs training".
- Office names: IDP uses official uppercase names, TNA uses directory names;
  per-office IDP status uses case-insensitive `matchOffice`, unmatched offices listed separately.
- Production and demo use different Supabase projects; the layout is the same,
  numbers differ.

## Checks to run

- `npx vitest run`, `npm run lint`, `npx tsc --noEmit`, `npm run build`
- Dashboard renders locally against real data at 1440px and 1024px.
- Vercel deployments for `abyan-hris-iloilo` and `cictrix-hr-demo` reach Ready.
