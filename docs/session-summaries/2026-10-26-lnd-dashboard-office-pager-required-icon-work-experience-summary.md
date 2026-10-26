---
title: L&D dashboard, Office Directory pager, Required icon, work experiences, portal header (summary)
date: 2026-10-26
plan: docs/plans/2026-10-26-lnd-dashboard-office-pager-required-icon-work-experience.md
---

Branch `feat/lnd-dashboard-pager-required-workexp`, rebased twice onto `main` as it moved (last onto `f216229`). Conflicts in `OfficeDirectorySection.tsx` and `LNDDashboard.tsx` were resolved by adopting `main`'s shared table classes (`abyan-table-wrap`, `abyan-table`). Pushed to `origin`.

## Shipped vs. planned

| Task | Commit | Status |
|---|---|---|
| 3. Required column | `fix(pm): show Required as an accessible icon only` | Done as planned |
| 2. Office Directory pagination | `feat(office-directory): …` | Done, plus two fixes found while verifying (below) |
| 1. L&D dashboard | `feat(lnd): …` | Done, one rule changed (below) |
| 4. Work experiences, migration | `feat(db): add applicants.work_experiences` | Done; version ordering needs attention before merge |
| 4. Work experiences, app | `feat(apply): allow multiple work experiences` | Done as planned |
| 5A. Portal header | `fix(ui): white header text and pill Logout in every portal` | Done |
| 5B. Office Account sidebar | `feat(office): Office Account console uses the portal side rail` | Done |

## Deviations and findings

- **Task 2.** Paging runs in the service layer (`queryOfficeDirectory`) after the six-table join, not as a database range (agreed). While verifying: L&D gave the directory no page gutter (it now has PM's `p-4 sm:p-6`), and the table clipped on phones instead of scrolling (§8.3), now fixed.
- **Task 1.** The period rule changed from "trainings that ended in the period" to "trainings that run during any part of it", with Year returning the calendar list unchanged. The first rule dropped trainings that span the year boundary, so Year no longer matched the old completion figure. Live data now shows 94% (32 of 34), which is what the old code computes; the 91% in the brief was older data. The IDP tag chart became a bar list (drops recharts and a non-palette colour set).
- **Task 4.** The form never stored position, company or duties, only the total. The migration therefore backfills one entry per application with years and months and null text. Years must be whole numbers, which is stricter than "non-negative". HR's Edit Applicant modal still edits only the total, so after an edit the entries no longer sum to it.
- **Task 5A.** Consolidation (point 3) was already on `main`. The dark text came from equal-specificity colour rules on the `.ph.abyan-ds` root, decided by stylesheet load order, and affected RSP as well, not only Office. The fix is in `portal-header.css` only. §9.1 of DESIGN_IDENTITY.md now specifies a pill Logout.

## Task 5 Part B: Office Account sidebar

- **Variant:** §9.12's collapsible rail (`RailNav`), the one L&D, RSP and PM use. It is 72px of icons that opens to 256px with text labels on hover, keyboard focus or tap. That is the guide's labelled variant; the guide defines no permanently expanded one.
- **Before:** a 256px white column with an "OFFICE CONSOLE" overline and five black list items (label plus sublabel), with an indigo filled box for the active item. On phones it became a horizontal strip that cut off "Training Courses".
- **After:** the gradient icon rail with circular chips. The active item is a white circle that becomes a fused pill when the rail is open. Hover and focus states come from `rail-nav.css`, and the same rail shows at every width. The content keeps its layout at a fixed 72px offset ("Phase 1: Target Interception & Adjustment", the tabs and the cards), with no overlap, horizontal scroll or second scrollbar at 1366, 768 and 375 px.
- **Kept:** each label (shown when open, and as the `aria-label`) and each sublabel (now the tooltip, as in L&D and PM). The "Office Console" heading is the rail's accessible name (`<aside aria-label="Office Console">`). The Training Courses "to review" count is a new optional `badge` on `RailNavItem`: a white pill with `--color-primary-700` text (11.65:1), included in the item's name, hidden at zero. Sections, `activeTab` state, the active-state logic and role-gated content are unchanged. There is no Settings item, so nothing is pinned to the bottom.
- **Employee portal:** it has no sidebar. Its sections are tabs in the shared header's navigation row, so there is nothing to align.
- **Files:** `src/modules/admin/pm/OfficeAccountConsole.tsx`, `src/components/RailNav.tsx`, `src/styles/rail-nav.css`, and new `src/components/RailNav.test.tsx`.

## Header contrast (WCAG AA, on `--color-primary` #363EE8)

| Text / icon | Ratio | AA (small text 4.5, icons 3) |
|---|---|---|
| Wordmark, system name, user name, bell, avatar glyph (white) | 6.97:1 | Pass |
| Role line (white 85%) | 5.47:1 | Pass |
| Logout label on its 12% fill | 5.49:1 | Pass |
| Logout hover and pressed (20% fill) | 4.62:1 | Pass |
| Avatar glyph on its 18% circle | 4.83:1 | Pass |
| Bell badge count, white on `--error-700` | 6.55:1 | Pass. Was 3.82:1 on `--error-500`; switched in a follow-up commit. |
| Before the fix: name `#28343D` on the bar | 1.83:1 | Failed |

## Checks run

- `npx tsc --noEmit`: clean.
- `npm run lint`: exit 0, no warnings (the ESLint config arrived with the rebase).
- `npm test`: 88 files, 696 tests passed (after the second rebase and Part B). New tests cover the rail badge and labels, pagination, the Office Directory URL state, the dashboard filters, per-entry validation, legacy draft conversion, the list UI, the header CSS guard, and the migration on real Postgres (PGlite).
- `npm run build`: passes. `npm run check:migrations`: OK.
- Local render against live data, read-only (writes blocked, anon reads), at 1366, 768 and 375 px. The Office console needed a stubbed office-role grant, because that table is closed to anonymous reads.

## Open items

1. ~~**Migration version order.**~~ **Resolved.** The CLI's `20261026015831` sorted before migrations already on `main`. At the user's direction it was renamed to `20261026120100`, after `main`'s latest `…120000`, before anything was pushed. No local Supabase database exists on this machine (no Docker, no `supabase/config.toml`), so nothing had applied the old version and `supabase db reset` cannot run here. An ordered replay of all 117 migrations on PGlite runs this one last. A from-scratch replay cannot complete on this repo: 82 files fail on tables no migration creates (the known clone-schema gap, starting with the first file, `20260509…`), and this migration fails there the same way as `main`'s `…120000`, because `applicants` is never created.
2. **New devDependency:** `@electric-sql/pglite` 0.5.8 (exact), used only by the migration test.
3. **Follow-up:** add start and end dates per work-experience entry, so overlapping jobs can be merged instead of double-counted.
4. The RSP dashboard is 478px wide at a 375px viewport once live data loads. The header is not the cause. Outside this plan.
