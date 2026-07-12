# Succession Planning — Test Plan

RSP Portal drill-down: **Departments → Critical Positions → Ranked Candidates**.
Candidate ranking is derived **live** from each employee's latest *completed* IPCR
overall score — never a stored snapshot.

## Prerequisites — apply migration + seed IPCR scores

1. **Migration** `20260720_succession_planning.sql` (Supabase → SQL Editor):
   creates `critical_positions` + `succession_candidates`. It is idempotent.

2. **Seed IPCR scores** so ranking has data. On a fresh DB the historical IPCR
   seed leaves every Phase 2 empty, so *without this step every candidate shows
   under "Not yet rated."* Run, in order:

   ```bash
   node scripts/sync-rsp-portals.mjs
   node scripts/seed-ipcr-historical.mjs
   npm run seed:ipcr-scores
   ```

   `seed:ipcr-scores` fills synthetic Q/E/T for **existing** employees' approved
   records and flips `phase2_status → completed`. It invents no people.

## Findings that shaped this build (Step 0)

- The prior Succession view was a hardcoded mock (fictional people, invented IPCR
  numbers). **Replaced** with a real, DB-backed drill-down.
- IPCR overall score lives per `(employee, period)` and is computed on Phase 2
  completion; the roll-up formula (`computeOverallScore` + `bucketForScore`,
  scale: Outstanding ≥4.75, Very Satisfactory ≥4.0, …) is reused verbatim.
- No dedicated succession admin role exists; the view is gated by being inside the
  RSP Portal (RSP admin). Management actions use the admin-session email for audit.

## Req 1 — Departments table (top level)

| # | Test | Expected |
|---|------|----------|
| 1.1 | Open RSP Portal → Succession | Sortable table of active departments: name, # critical positions, # vacant critical |
| 1.2 | Vacant column | A critical position with no linked incumbent counts toward "Vacant Critical" (red badge); 0 shows muted |
| 1.3 | Click a department row (or chevron) | Row expands (accordion) to that department's **Critical Positions** — *not* a flat employee list |
| 1.4 | Counts stay in sync | After adding/removing a critical position, the department's counts refresh |
| 1.5 | Breadcrumb | Shows `Departments`; clicking a crumb collapses back to that level |

## Req 2 — Critical Positions (inside an expanded department)

| # | Test | Expected |
|---|------|----------|
| 2.1 | Department with **zero** critical positions | Empty state: "No critical positions identified for this department yet" + Add prompt (not an empty table) |
| 2.2 | **Add Critical Position** | Modal scoped to the department: title (required), optional incumbent picker, optional criticality reason |
| 2.3 | Save | Row appears: title, `Critical` tag, incumbent name (or "No incumbent linked" + `Vacant` tag), reason tag if given |
| 2.4 | **Edit** a position | Pencil → same modal prefilled; changes persist and re-render |
| 2.5 | **Remove** a position | Trash → confirm → position (and its candidates, via cascade) removed; counts refresh |
| 2.6 | Explicit-only | A position is critical **only** because an admin added it — nothing is auto-flagged |

## Req 3 — Ranked candidates (inside an expanded critical position)

| # | Test | Expected |
|---|------|----------|
| 3.1 | Position with **zero** candidates | Empty state: "No succession candidates identified yet" + Add prompt |
| 3.2 | **Add Succession Candidate** | Picker lists **same-department employees first** (`Same dept` tag), searchable company-wide; optional note |
| 3.3 | Duplicate add | Adding the same employee twice is rejected ("already a candidate for this position") |
| 3.4 | Ranking order | Rated candidates sorted **highest → lowest** by latest completed IPCR overall score; each shows adjectival + numeric score + period so the basis is visible |
| 3.5 | Mixed rated/unrated | Unrated candidates appear in a **separate "Not yet rated" group at the bottom** — not hidden, not ranked as zero |
| 3.6 | Live re-rank | Re-run `seed:ipcr-scores` or complete a *newer* Phase 2 for a candidate, reopen the list → their rank reflects the new score (no stale snapshot) |
| 3.7 | Edit note / Remove | Note edits persist; remove drops the candidate from the list |

## Req 4 — Permissions

| # | Test | Expected |
|---|------|----------|
| 4.1 | Visibility | The Succession view is only reachable inside the RSP Portal; non-RSP portals (Employee, L&D, PM, Super Admin viewer) have no route to it |
| 4.2 | Audit | `critical_positions.created_by` and `succession_candidates.added_by` record the acting admin's session email |

> Note: the tables use the same anon-open / app-layer-enforced posture as the
> other IPCR tables (RLS disabled). Portal-level access is the guard, consistent
> with the rest of RSPDashboard.

## Req 5 — Navigation / UI consistency

| # | Test | Expected |
|---|------|----------|
| 5.1 | Styling | Table, cards, badges, and modals reuse RSP Portal tokens (`--border-color`, `--text-*`, slate headers) and the shared `Button` |
| 5.2 | Hierarchy | Breadcrumb + nested accordion always make the current level (Dept → Position → Candidates) clear |

## Regression

- RSP Portal renders `<SuccessionPlanningPage />` with no props (unchanged call site).
- `npx tsc --noEmit` is clean.
- Other IPCR flows are untouched **except** that `seed:ipcr-scores` marks seeded
  records `completed` — run it only in dev/demo environments.
