# Session Summary: Public Applicant Flow Mobile Compatibility

- **Date:** 2026-11-28
- **Plan:** [2026-11-28-public-applicant-flow-mobile.md](../plans/2026-11-28-public-applicant-flow-mobile.md)
- **Branch:** `feat/public-applicant-flow-mobile`
- **Status:** Done (local edits verified; not committed or pushed)

## What shipped vs. planned

1. **Mandatory Modern Web Guidance project rules**
   - Updated `AGENTS.md`, `CLAUDE.md`, and `.agents/AGENTS.md` so every UI, HTML/CSS, layout, responsiveness, accessibility, form, dialog, popover, navigation, or client-side DOM/UX change launches `modern-web-guidance` (`search` + `retrieve`) first, verifies compliance, and discloses applied guides on delivery.
2. **Job Portal (`src/components/JobPortalPage.tsx`, `src/styles/job-portal.css`)**
   - Replaced the `group-hover`-only Login menu with a click/tap/keyboard-accessible `popover="auto"` + `popovertarget` menu using `@supports (position-area: block-end)` anchor positioning, `getBoundingClientRect()` fallback, and desktop-only hover preview (`matchMedia('(hover: hover)')`).
   - Added a `< 640px` collapsible mobile navigation drawer, replaced raw `<a href>` links with React Router `<Link>`, replaced decorative hero circles and non-brand Login portal chip colors with brand tokens (`DESIGN_IDENTITY.md §3.5`, `§3.6`).
   - Wrapped the search and filters in `<search>` with `<input type="search">`, `font-size: max(1rem, 1em)` on mobile, `44px` coarse-pointer targets, accessible view-toggle labels (`aria-pressed`), `@container (width < 640px)` stacked cards on the table view (`tabIndex={0} role="region"`), and wrapping pagination with ellipsis (`DESIGN_IDENTITY.md §9.6`).
3. **Job Details & Application Wizard (`index.html`, `src/styles/applicant-flow.css`, `src/styles/wizard.css`, `src/modules/applicant/flow/FlowUi.tsx`, `src/modules/applicant/ApplicantWizard.tsx`, `src/modules/applicant/ApplicantAssessmentForm.tsx`)**
   - Added `viewport-fit=cover` in `index.html`, switched `100vh` shells to `100dvh`, added `scroll-padding-top` and `scroll-padding-bottom` matching the sticky header and fixed mobile action bar + `env(safe-area-inset-*)`, and added safe-area inline padding.
   - Enforced `font-size: max(1rem, 1em)` on mobile/coarse form controls, raised coarse-pointer touch targets to `44px`, tightened mobile card/review padding to `16px`, stacked `.af-row` below `420px`, exposed disabled plantilla reasons inline on `@media (hover: none)`, and added `autoComplete`, `inputMode`, `enterKeyHint`, `autoCorrect`, `autoCapitalize`, and `spellCheck` attributes on personal/contact/employee-auth fields.
   - Added scroll-snap, scroll-driven edge fades (`@property --af-fade-start`/`--af-fade-end`), and `scrollIntoView({ block: 'nearest', inline: 'nearest', container: 'nearest' })` to `.af-tabs`.
   - Upgraded `"Copy Answers From…"` to a viewport-aware `popover="auto"` button group with `@supports (position-area: block-end)` and JS `getBoundingClientRect()` fallback.
   - Upgraded `ConfirmModal` to native `<dialog>` (`showModal()`, `closedby="any"` + pointer bounding-rect fallback, `overscroll-behavior: contain` on `:modal` and `::backdrop`, full-screen `100dvh` sheet below `640px` per `DESIGN_IDENTITY.md §9.10`).
4. **Application Status Tracker (`src/modules/applicant/ApplicationStatusPage.tsx`, `src/styles/application-status.css`, `src/modules/applicant/ApplicationStatusPage.test.tsx`)**
   - Wrapped the lookup in `<search>` with `<input type="search">` (`>= 16px` mobile input, `autocorrect="off"`, `autocapitalize="none"`, `spellcheck="false"`, `enterkeyhint="search"`), stacked schedule rows below `640px`, allowed Application Details / Notices / Document / re-upload headers and action bars to wrap cleanly with `44px` coarse-pointer touch targets, and preserved the settled expandable list layout (`docs/mockups/2026-10-26-tracker-application-list.html`).

## Deviations

- `LandingPage.tsx` and `SharedFooter.tsx` were intentionally left untouched to avoid conflicting with uncommitted work on `feat/landing-page-modernization`.
- Used `Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover')` instead of `Object.hasOwn` to match the repo's TypeScript `lib` target.
- Updated `ApplicationStatusPage.test.tsx` (`searchFor` helper) from `getByRole('textbox')` to `getByRole('searchbox')` to reflect the semantic `<input type="search">` upgrade.

## Checks run

- `npx tsc --noEmit`: passed (0 errors).
- `npm run lint`: passed (0 warnings, 0 errors).
- `npx vitest run --exclude ".worktrees/**" --exclude ".claude/**" src/test/`: passed (6 smoke test files, 12 tests).
- `npx vitest run --exclude ".worktrees/**" --exclude ".claude/**"`: passed (207 test files, 1,902 tests).
- `npm run build`: `tsc` passed and Vite transformed all 3,161 modules, then failed locally with a Windows `esbuild` temp-file unlink lock (`[vite:esbuild-transpile] remove ...\esbuild-...: Access is denied`).
