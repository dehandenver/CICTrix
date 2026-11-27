---
title: Modernize ABYAN landing page — session summary
date: 2026-11-28
status: Done
plan: docs/plans/2026-11-28-landing-page-modernization.md
summary: Shipped all 5 phases of the ABYAN public landing page modernization on branch feat/landing-page-modernization, verified across desktop and mobile viewports with zero detector findings and passing tests.
---

## What shipped vs. planned

All five phases from [2026-11-28-landing-page-modernization.md](../plans/2026-11-28-landing-page-modernization.md) shipped on `feat/landing-page-modernization` (branched from `ca43e25`, matching `upstream/main`):

- **Phase 1 — Header, Mobile Collapse & Accessible Login Popover:** Replaced the hover-only Login menu with a click/tap/keyboard `<button popovertarget>` + `<ul popover="auto">` disclosure (with React state + Escape/outside-click fallback when `HTMLElement.prototype.popover` is unavailable, and `@supports (position-area: block-end)` + `getBoundingClientRect()` fallback), added a `< 640px` mobile Menu drawer resolving the `390px` header collision and horizontal overflow, converted header/portal `<a>` links to React Router `<Link>`, unified Login icon/label color to `#040E6B`, and replaced decorative green/purple portal chips with brand tokens (`DESIGN_IDENTITY.md §3.6`).
- **Phase 2 — Focus Rings, Contrast, Landmarks & Toolbar:** Added `.btn-white:hover` / `:focus-visible` and `@media (forced-colors: active)` outline fallbacks in `src/styles/abyan-tokens.css`, darkened the search placeholder/icon to `#515F69` (`6.58:1`), added a skip link, `<main id="main-content">`, `scroll-padding-top`, `role="search"` toolbar with explicit `<label htmlFor>` bindings, `<caption>`, `<th scope="col">`, row-specific `Apply` accessible names, a `role="status"` live region, and fixed `SharedFooter.tsx` `h4` → `h3`.
- **Phase 3 — Responsive Vacancy Table, Pagination, Date & Row Routing:** Added `tabIndex={0} role="region" aria-labelledby` on `.abyan-table-wrap`, `@container (width < 600px)` stacked plantilla cards, right-aligned numeric/action columns, `.rsp-pager` square pagination with ellipsis (`> 7` pages) and zero-result hiding, hoisted `Intl.Collator` + non-mutating `sortedCopy`, timezone-safe `formatClosingDate`, hidden raw `{vacanciesError}`, `"Clear search"` empty-state recovery, and direct `/job-details/:itemNumber?slot=:plantillaSlotId` row links with `?slot=` fallback in `JobDetailsPage.tsx`.
- **Phase 4 — Civic Trust & Footer Cleanup:** Added `Office of the City Human Resource Management Officer, Iloilo City Government` attribution inside the hero lead, tagged `"Abyan mo sa pag-asenso."` with `lang="fil"`, clarified the `Currently Vacant Jobs` subtitle, refactored `SharedFooter.tsx` onto `.abyan-ds` CSS classes (removing all 16 inline `style` objects, JS hover handlers, and `mix-blend-mode: screen`), added explicit logo `width`/`height` + `loading="lazy"`, and fixed copyright to a single current year.
- **Phase 5 — Typography Scaling, Reduced Motion & CWV:** Moved hero loop animations inside `@media (prefers-reduced-motion: no-preference)`, removed the duplicate `.landing-hero-bg` wrapper, applied fluid `clamp()` + `text-wrap: balance`/`pretty` + `font-size-adjust: from-font`, migrated `.btn`/`.badge` fixed heights to `min-block-size`, removed `html { font-size: 16px }` and duplicate `@import` in `globals.css`, added `<meta name="text-scale" content="scale" />`, removed `Cache-Control: no-store` meta tags, and trimmed Google Fonts in `index.html` to `400;500;600;700`.

## Deviations from original draft plan

- Per user direction: kept hero `"Apply for a Job"` (`/job-portal`), footer `"Apply for a Job"` (`/apply`), footer email (`cictrix23@gmail.com`), and the three social buttons intact; removed the hero background pause toggle so the Option A loop plays cleanly without extra hero chrome (still respects OS `prefers-reduced-motion`).
- Per `craft-floor.md`: placed OCHRMO / Iloilo City Government attribution naturally in the hero lead paragraph instead of a kicker/eyebrow above `<h1>`.
- Used `<div role="search">` instead of `<search>` so React 18 produces zero unrecognized-tag warnings while preserving the `search` ARIA landmark.
- Dropped hover auto-open on the desktop Login button after live browser verification caught a hover+click race that immediately closed the popover on click; Login now opens deterministically via click, tap, and keyboard (`Enter`/`Space`), closing on `Escape` or outside click.

## Checks run

- `npx tsc --noEmit` — pass (`0` errors)
- `npx eslint src/components/LandingPage.tsx src/components/SharedFooter.tsx src/components/JobDetailsPage.tsx src/components/LandingPage.vacancies.test.tsx src/components/JobDetailsPage.plantillas.test.tsx --max-warnings 0` — pass (`0` warnings)
- `npx vitest run --exclude ".worktrees/**" --exclude ".claude/**" src/components/LandingPage.vacancies.test.tsx src/components/JobDetailsPage.plantillas.test.tsx` — pass (`15/15` tests)
- `npm run build:verify` — pass (`dist/` built cleanly; standard `npm run build` hit a local Windows esbuild temp-file `Access is denied` lock during minification)
- `impeccable detect --json http://localhost:5173/` — pass (`[]`, exit `0`, 0 warnings)
- Live browser verification at `1440×900` and `390×844` — pass (`0` console errors, `0` failed requests, `0` horizontal overflow at `390px`, single-row desktop toolbar, click/Escape Login popover, readable white mobile drawer links, stacked mobile plantilla cards, square `.rsp-pager` pagination)
