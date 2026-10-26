---
title: L&D dashboard redesign, Office Directory pagination, Required icon, multiple work experiences
date: 2026-10-26
status: In Progress
summary: Five tasks done one at a time — L&D dashboard to the RSP dashboard pattern, server-style paginated Office Directory with URL state, icon-only Required column in PM Position Requirements, a repeatable work-experience list in the application form with a migration, and white text plus a pill Logout in the shared portal header.
---

## Goal

1. The L&D Dashboard follows the RSP dashboard pattern (gradient hero, period and department controls, titled sections, KPI strips) while keeping every existing metric.
2. The Office Directory has §9.6 pagination with a page-size selector, search, and page/search state in the URL.
3. PM > Competency Framework > Position Requirements shows the Required status once, as an accessible icon.
4. Applicants can enter up to 10 work experiences per application, and these are stored, reviewed and shown to HR.

## Approach

### Task 1: L&D dashboard (`src/modules/admin/LNDDashboard.tsx`)

- **Supersedes** `docs/mockups/2026-10-14-lnd-dashboard-layout-a.html` (Layout A) for the header and summary cards, at the user's request on 2026-10-26. Layout A's plain title block and three top-bordered summary cards are replaced by the RSP structure (`docs/mockups/2026-10-15-rsp-dashboard-kpis.html`, `RspDashboardOverview.tsx`). Layout A's charts are kept and restyled.
- Reuse `src/styles/rsp-dashboard.css`: wrap the page in its `.rspdash` scope and use its hero, segmented toggle, select, section header, stat strip, card, bar, legend and badge classes. That file already uses only DESIGN_IDENTITY tokens, so no new stylesheet is needed.
- Hero: "Dashboard & Analytics", a one-line subtitle, a Month / Quarter / Year toggle (`aria-pressed`, group `aria-label="Period"`), an office select (`aria-label`), and "As of <date>". The breadcrumb stays above the title in white. The title is a `role="heading"` div, for the same `admin.css` reason as RSP.
- Sections, each with an icon chip, title, muted subtitle and a "View all ›" link that switches the L&D section:
  - **Training Needs Assessment** (`clipboard-list` → Requests & Needs): strip with skill gaps, offices assessed x/N, and competencies with gaps x/12.
  - **Competency Gaps** (`alert-triangle` → Summary of Ratings): the heatmap with its legend, and Top competency needs as a bar list with right-aligned counts.
  - **Individual Development Plans** (`target` → IDP Form): strip with % submitted, offices with IDPs, and top requested tag, then the IDP-by-office bars and the tag chart.
  - **Trainings** (`graduation-cap` → Training Calendar): strip with % completion, % meeting the 2-training rule, and trained at least once, then the compliance bars and the "Still needs training" table.
- All current values stay. Warning and negative states use the strip's `warn` / `risk` tones (the §3.6 700 shades), for example 0% IDPs submitted and the 2-training shortfall.
- **How the filters apply:**
  - The office filter moves into the hero and scopes every section: employees, needs per office, IDPs per employee, and compliance per department. It replaces the Trainings-only Department dropdown.
  - The period toggle scopes **training completion** (trainings that ended in the period). The 2-training rule is yearly by definition, IDPs are per cycle year, and the needs assessment has no dates, so those three ignore the period. Each such section's subtitle says so ("2026 cycle"), and I'll list the gap in the summary.
- Drift fixed in this file only: the IDP purple `#7c3aed` / `#f5f0ff` (not in the palette) becomes brand blue, and the hard-coded tag-chart palette becomes the §9.11 series order. The pager in the trainings table switches to the shared `Pagination` from Task 2.
- Empty states for "No assessed gaps yet" and "No gaps yet": icon, short title, and one line saying what fills the panel.
- Responsive: the RSP breakpoints (1100px stacks two-column rows; 760px gives a 2×2 strip and 16px gutters). The heatmap scrolls inside its card on small screens.

### Task 2: Office Directory pagination (`src/components/OfficeDirectorySection.tsx`)

- **What "server-side" means here.** There is no API server for this. `getOfficeDirectory()` joins six Supabase tables in the browser by normalized office names, and there are about 5 active offices. Database-level `range()` paging would need a new view or RPC to compute head and headcount in SQL. That's a large change with no benefit at this size.
- Instead, I'll add `queryOfficeDirectory({ page, pageSize, search })` to `src/lib/api/officeDirectory.ts`. It returns `{ rows, total, page, pageCount }`, applies active-only, search (`filterOfficeDirectory`), clamping and slicing in the service layer, and the component calls only that. `getOfficeDirectory()` stays unchanged for RSP and System Administration.
- New shared `src/components/Pagination.tsx` (§9.6): "Showing X–Y of Z offices", Previous/Next, page numbers with ellipsis, and a "Show [10/25/50] entries" select (default 10). `getPageList` moves from the interviewer model to `src/lib/pagination.ts`. The interviewer model re-exports it, so its callers don't change.
- A §9.4 search input ("Search office or department head"). Any search or page-size change resets to page 1.
- URL state through `useSearchParams` with `replace`: `odPage`, `odSize`, `odQ`. Bad or out-of-range values clamp, and the URL is rewritten to the clamped value. Opening an office still pushes one history entry (`useBackClosesView`), so Back returns to the same page and search.
- States: skeleton while loading, "No offices match '<q>'" with a Clear search action, and the existing error banner with Retry.

### Task 3: Required column (`src/modules/admin/pm/PMCompetencyFramework.tsx`)

- Replace `✅ Yes` / `❌ No` with a Lucide `check-circle-2` (`--success-500`) or `x-circle` (`--neutral-400`, muted). Each icon has `role="img"`, an `aria-label`, and a `title` tooltip ("Required" / "Not required").
- No data or action changes. The Competency Map tab lists only requirements and has no Required column, so nothing changes there. The counter and the Proficiency Level column are untouched, and the test confirms they still render.

### Task 4: Multiple work experiences

- **What exists today.** Position, company and duties are never saved. Only their sum is stored, as `applicants.years_of_experience`. Drafts live in sessionStorage, one per plantilla key, so plantilla isolation already holds.
- `src/lib/workExperience.ts` holds the entry type, `MAX_WORK_EXPERIENCES = 10`, validation, `totalExperienceYears(entries)`, legacy-draft conversion, and the DB payload mapping.
- `ApplicantFormData` replaces the five flat fields with `work_experiences: WorkExperienceEntry[]`. `loadDrafts` converts an old flat draft into a one-item list.
- UI (`ApplicantAssessmentForm.tsx`): the HR policy notice stays at the top. Each entry is a card headed "Work experience N", with the same five fields and a Remove button that is hidden when only one entry remains. "+ Add another work experience" is disabled at 10, with a helper line. Focus moves to the new card's heading.
- **Validation:**
  - A single, completely blank entry is allowed, as today, so applicants with no experience can still apply.
  - Any entry with data needs all fields and more than 0 total time.
  - Years must be a whole number ≥ 0, and months a whole number from 0 to 11.
  - Errors appear inline per field, keyed `work_experiences.<i>.<field>`.
- **Database:** a new migration (created with `npx supabase migration new applicant_work_experiences`) adds `applicants.work_experiences jsonb not null default '[]'` with an array check. It backfills each row that has `years_of_experience > 0` into a one-item array of whole years plus leftover months, with null text fields, because nothing else was ever stored.
- `years_of_experience` keeps being written, now as the sum across entries. Scoring (`QualifiedApplicantsSection`, `ApplicantDetailsPage`), the SRP ranking SQL and the Edit modal keep working unchanged.
- The insert retries without `work_experiences` if the migration hasn't reached that database yet, which is the existing missing-column pattern.
- **Reads:**
  - The Review & Submit step lists every entry.
  - HR's ApplicantDetailsPage shows the total plus each entry, falling back to today's total-only view for old rows.
  - The promotion prefill (`employeeApplicationProfile`) fills entry 1 from the most recent PDS experience, as it does now.
  - I'll grep exports and CSVs for experience fields during the build and update any I find.
- **Auto-summing for qualification checks.** This plan already sums the entries into `years_of_experience`, which is what qualification matching and scoring read. The caveat: entries have no dates, so overlapping or concurrent jobs double-count. If that matters, a follow-up should add from/to dates per entry and sum the merged date ranges.

### Task 5: Portal header (added 2026-10-26)

**Part A, top header.** The RSP Admin header is the reference; the Office Account and Employee headers must match it.

- **What exists.** `main` gained `047e00d` (one shared `PortalHeader`, plan `2026-10-26-portal-header.md`) after this branch started; the branch was rebased onto it. RSP, L&D and PM use it through `AdminHeader`; the Office Account console and the Employee portal render it directly, with the bell as the optional `notifications` prop. Consolidation (point 3) is therefore already done; nothing is copied per portal.
- **Dark text, root cause.** The header root is `<header class="ph abyan-ds">`. `.ph { color: white }` and the token block's `.abyan-ds { color: var(--neutral-800) }` have equal specificity on the same element, so the colour depends on stylesheet load order, which differs per page. Where the token file loads later (measured on RSP: name, role and avatar glyph computed `rgb(40,52,61)`), everything that inherits turns dark. `.ph-user-role` and the popover text rules tie with the `.abyan-ds :where(span, p…)` reset the same way.
- **Fix in `portal-header.css` only.** The bar takes its white on `.ph-bar`, which does not carry `.abyan-ds`, and every colour-setting rule is scoped under `.ph`, so it outranks the reset and the global `span` rule regardless of load order. Colours are tokens: `--color-white` for text and icons, `--on-blue-muted` for the role line.
- **Logout as a pill.** Radius `--radius-pill`, existing translucent fill and thin light border, white icon and SemiBold white label, with hover, focus-visible and a new active state. The height stays 44px, the same component RSP uses. This changes DESIGN_IDENTITY.md §9.1 ("Header Logout: glass rectangle, radius 12px"), so the guide is updated in the same change. The avatar stays a translucent circle with the divider before Logout.
- **Verify.** Side-by-side screenshots of RSP, Office Account and Employee at 1366px and 375px, computed colours checked in the browser, and WCAG AA contrast ratios for every text and icon colour on `--color-primary`.

**Part B, sidebar.** Not yet received; to be planned when its text arrives.

## Decisions (2026-10-26 approval)

- D1: The active section is written to `?module=` in both L&D (already read on load) and PM (added, minimal), so a refresh returns to the Office Directory.
- D2: Search only. `queryOfficeDirectory()` takes a `filters` object (currently empty) so an assigned/unassigned filter can be added later.
- D3: The period toggle scopes training completion only, with a short note under the toggle that says so.
- D4: Branch from `main`, one commit per task starting with Task 3. The Task 4 migration is its own commit.
- D5: The form gets a note asking applicants not to count overlapping periods twice. Per-entry start and end dates are a follow-up.
- D6: No ESLint config is added.

## Steps

1. Branch `feat/lnd-dashboard-pager-required-workexp` from `main`.
2. Task 3 (smallest): edit, add a test, run checks, commit `fix(pm): show Required as an accessible icon only`.
3. Task 2: `src/lib/pagination.ts` and `Pagination.tsx` with tests, then `queryOfficeDirectory` with tests, then wire the component and the URL. Run checks and commit `feat(office-directory): paginate with page size, search and URL state`.
4. Task 1: restructure the dashboard, reuse `Pagination`, test the period and office filter helpers. Run checks, render locally, commit `feat(lnd): redesign dashboard to the portal dashboard pattern`.
5. Task 4: `workExperience.ts` with tests (validation, sum, legacy conversion, per-plantilla drafts), then the migration and the SQL backfill check, then the form, review step, submit and HR view. After checks and `npm run check:migrations`, commit the migration on its own (`feat(db): add applicants.work_experiences`), then the app changes (`feat(apply): allow multiple work experiences`).
6. Task 5 Part A: rebase onto `main` (shared header), fix the colour cascade and the Logout radius in `portal-header.css`, update §9.1, add a test, verify. Commit `fix(ui): white header text and pill Logout in every portal`.
7. Session summary in `docs/session-summaries/`, then status Done.

## Risks

- `rsp-dashboard.css` is named for RSP but would style L&D too. A later RSP-only edit could change L&D. I'll mention it in the CSS header comment.
- Global `globals.css` text colors fight white hero text. RSP's scoped reset already handles this inside `.rspdash`.
- Task 4 changes `ApplicantFormData`. Every usage must move to the array, and tsc will catch any I miss.
- The migration touches `applicants`, which has no creating migration in the repo (see the clone schema gap note). `add column if not exists` is safe either way. It reaches production only when the PR merges.

## Checks to run

`npx tsc --noEmit`, `npm test`, `npm run build`, and `npm run check:migrations` (Task 4). `npm run lint` currently can't run because the repo has no ESLint config. I'll report that, not add one. I'll also do a local render at 1366×768, 768 and 375 widths. Pages behind the live Supabase login may not show real data locally, and I'll say so if that happens.
