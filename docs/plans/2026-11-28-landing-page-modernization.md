---
title: Modernize ABYAN landing page
date: 2026-11-28
status: Done
summary: Fix mobile header overflow, touch and keyboard Login access, WCAG focus and contrast blockers, responsive vacancy table and pagination, civic trust cues, and asset/bfcache performance on the public ABYAN landing page.
spec: .impeccable/critique/2026-11-27T17-50-04Z__src-components-landingpage-tsx.md
---

## User Scope Decisions (2026-11-28)

- Run all 5 phases on new branch `feat/landing-page-modernization` (branched from `ca43e25`, matching `upstream/main`).
- Keep hero `"Apply for a Job"` (`/job-portal`) and footer `"Apply for a Job"` (`/apply`) destinations unchanged.
- Keep footer contact email (`cictrix23@gmail.com`) and the three social buttons unchanged (still clean up heading levels, inline styles, JS hover handlers, and logo dimensions/lazy loading).
- Place official Iloilo City / OCHRMO attribution inside the hero subtitle (not as a kicker/eyebrow above `<h1>`).

## Goal

Bring the public ABYAN landing page (`LandingPage.tsx`, `SharedFooter.tsx`, and its supporting styles and document head) up to modern web guidance and `DESIGN_IDENTITY.md` without overturning settled visual decisions. When finished, the page renders cleanly with zero horizontal overflow at `390×844` and `1440×900`, the Login menu and vacancy table work reliably on touch and keyboard, the live DOM passes `impeccable detect` with zero warnings, official Iloilo City / OCHRMO identity is visible above the fold, and closing dates, pagination, and job-detail routing behave reliably across viewports and time zones.

Settled mockups preserved by this plan (not superseded):
- `docs/mockups/2026-10-15-landing-hero-loop.html` — keeps Option A drifting rings and pulse background, restoring the mockup's own pause toggle for WCAG 2.2.2 compliance.
- `docs/mockups/2026-10-21-vacant-jobs-plantilla-rows.html` — keeps the flat one-row-per-open-plantilla structure on desktop and mirrors one-card-per-plantilla below `600px`.

## Approach

Findings from the dual-agent critique (`.impeccable/critique/2026-11-27T17-50-04Z__src-components-landingpage-tsx.md`), `modern-web-guidance` audit, and live desktop/mobile browser inspection trace back to five root causes:

1. **Hover-only disclosure and non-collapsing header (`LandingPage.tsx:223-290`):** The header stays a single flex row at `390px` (colliding `"ABYAN"` with `"Home"` and pushing `"Login"` past the viewport edge), and the Login dropdown relies solely on CSS `group-hover` with an unbridged `mt-2` gap. Replacing it with a click/tap/keyboard `<button popovertarget>` + `<ul popover="auto">` disclosure (with feature-detected JS fallback for older engines, `@supports (position-area: block-end)` with `getBoundingClientRect()` fallback, and a mobile collapse menu) fixes touch, keyboard, and narrow screens without adding an npm dependency.
2. **Focus, contrast, and landmark gaps (`abyan-tokens.css:133, 150`, `LandingPage.tsx:218-460`, `SharedFooter.tsx:31-73`):** `.btn:focus-visible` removes `outline` while `.btn-white` defines neither `:hover` nor `:focus-visible`; the search placeholder (`#94A3B8`) fails WCAG AA at `2.6:1`; the page lacks `<main>`, a skip link, `scroll-padding-top`, `<search>`, explicit `<label for>` bindings, `scope="col"`, `<caption>`, and skips `h2` → `h4`.
3. **Legacy CSS cascade collisions and table/date bugs (`rsp-design.css:143-229`, `globals.css:270-276`, `LandingPage.tsx:156-215, 379, 445-499`, `JobDetailsPage.tsx:86, 202`):** Missing `.rsp-pager` causes `rsp-design.css` to restyle pagination buttons into thick blue pills with `1.50:1` disabled states; `globals.css:271` turns `<span>Login</span>` `#040E6B` while its icon stays `#363EE8`; `formatDate` parses `YYYY-MM-DD` as UTC midnight (off-by-one west of UTC); pagination lacks `flex-wrap` and ellipsis beyond 7 pages (`DESIGN_IDENTITY.md §9.6`); and row `Apply` navigates to `/apply` only to be bounced immediately to `/job-details/:id` by `ApplicantWizard.tsx:360`. Routing directly via `<Link to="/job-details/:id?slot=:slotId">` (and reading `?slot=` in `JobDetailsPage.tsx` when `location.state` is empty) makes every vacancy link bookmarkable and middle-clickable.
4. **Civic trust and footer debt (`LandingPage.tsx:223-339`, `SharedFooter.tsx:9-125`):** Iloilo City Government / OCHRMO attribution is hidden until the footer, `"Apply for a Job"` points to `/job-portal` in the hero vs `/apply` in the footer, `Plantilla` is unexplained, and `SharedFooter.tsx` relies on 16 inline `style` objects, JS `onMouseEnter`/`onMouseLeave` mutations, a personal Gmail, and three dead `href="#"` social links.
5. **Text scaling, motion control, and CWV waste (`index.html:21-26`, `globals.css:1, 461, 562`, `landing-hero.css`, `abyan-tokens.css:114-136, 209-215`):** `Cache-Control: no-store` kills bfcache; both `index.html` and `globals.css` fetch 6 Poppins weights (300–800 vs `§4`'s 400–700); `html { font-size: 16px }` locks root text scaling; fixed `.btn`/`.badge` heights risk clipping under text zoom; oversized PNG logos lack `width`/`height` and below-the-fold lazy loading; and the >5s hero loop has no visible pause button.

Primary files touched:
- `src/components/LandingPage.tsx`
- `src/components/SharedFooter.tsx`
- `src/components/JobDetailsPage.tsx` (small `?slot=` fallback read)
- `src/styles/landing-page.css` (new landing-scoped stylesheet for popover, mobile nav, `@container` table cards, footer classes, and placeholder contrast)
- `src/styles/landing-hero.css`
- `src/styles/abyan-tokens.css`
- `src/styles/globals.css` (remove duplicate `@import` and `html { font-size: 16px }` lock only)
- `index.html`
- `src/components/LandingPage.vacancies.test.tsx`

## Steps

### Phase 0 — Branch Setup
1. Confirm clean branch separation from the current `docs/security-audit-refresh` working tree and create a dedicated feature branch (e.g., `feat/landing-page-modernization`) off `main` before editing any source file.

### Phase 1 — Header, Mobile Collapse & Accessible Login Popover (P0)
2. Refactor `<header>` in `src/components/LandingPage.tsx` and add `src/styles/landing-page.css`:
   - Convert Login to a `<button type="button">` with a chevron icon toggling a `<ul id="login-portals" popover="auto">` navigation disclosure (using native Popover API where supported plus a lightweight React open/Escape/outside-click fallback when `HTMLElement.prototype.popover` is absent, and `@supports (position-area: block-end)` + `position-try-fallbacks: flip-block, flip-inline` with a `getBoundingClientRect()` fallback). Keep optional desktop hover preview only inside `matchMedia('(hover: hover)')` with a `::before` hover bridge.
   - Add a mobile menu button + popover panel for `< 640px` viewports so `"ABYAN"`, nav links, and `"Login"` never collide or overflow horizontally at `390px`.
   - Replace raw `<a href>` header and Login dropdown links with React Router `<Link to>`, wrap nav in `<nav aria-label="Primary">`, set `aria-current="page"` on `Home`, unify Login icon and label color to `#040E6B` (`§8.1`), and replace decorative green (`#059669`) and purple (`#7C3AED`) chips with brand tokens (`§3.6`).

### Phase 2 — Focus Rings, Contrast, Landmarks & Accessible Toolbar (P0)
3. Update `src/styles/abyan-tokens.css` to add `.btn-white:hover` (`var(--color-primary-50)`), `.btn-white:focus-visible` (`outline: 2px solid var(--color-white); outline-offset: 3px`), and `@media (forced-colors: active)` outline fallbacks for all `box-shadow`-only focus rings.
4. Add landmarks, headings, and form semantics in `src/components/LandingPage.tsx` and `src/components/SharedFooter.tsx`:
   - Add a visually-hidden-until-focused skip link (`Skip to main content` → `#main-content`), wrap hero and vacancies sections in `<main id="main-content">`, and set `scroll-padding-top` ≥ sticky header height.
   - Change footer `<h4>` headings in `SharedFooter.tsx` to `<h3>` so heading hierarchy runs `h1 → h2 → h3`.
   - Convert hero `"Apply for a Job"` from `<button onClick>` to `<Link to>` matching `"Track Application"`.
   - Wrap the vacancies toolbar in `<search>`, switch the search field to `<input type="search">` with an associated `<label>` (`sr-only`), `name="q"`, `enterkeyhint="search"`, `autocorrect="off"`, `spellcheck="false"`, `#515F69` placeholder/icon contrast (`6.58:1`), and `font-size: max(1rem, 1em)` on mobile to prevent iOS zoom.
   - Add explicit `<label htmlFor>` + `name` on both Sort (`"Sort by"`, keeping `'department'` default per existing test) and Entries (`"Show entries"`), and replace `border-2 border-[#363EE8]` on Entries with resting `border border-slate-200` (`§9.4`).
   - Add `<caption className="sr-only">Currently Vacant Jobs</caption>`, `scope="col"` on all six `<th>`s, decorative `aria-hidden="true"` on icons, row-specific accessible names on each `Apply` control, and a visually hidden `role="status"` live region announcing filtered counts.

### Phase 3 — Responsive Vacancy Table, Pagination, Date & Row Routing Fixes (P1)
5. Upgrade the vacancy table and controls in `src/components/LandingPage.tsx`, `src/styles/landing-page.css`, and `src/components/JobDetailsPage.tsx`:
   - Add `tabIndex={0} role="region" aria-labelledby="vacant-jobs-heading"` to `.abyan-table-wrap` and add a `@container (width < 600px)` stacked-card layout preserving one card per open plantilla with `::before` field labels and a full-width ≥44px `Apply` button.
   - Right-align `Plantilla` and `Monthly Salary` with `.is-num` (`tabular-nums`) and right-align the `Apply` column (`§9.5`).
   - Fix pagination: apply `.rsp-pager` so `rsp-design.css` renders `8px` square buttons with accessible disabled states instead of hijacked pills; wrap in `<nav aria-label="Vacancies pagination">` with `flex-wrap`; add `type="button"` and `aria-current="page"`; add ellipsis truncation when `totalPages > 7` (`§9.6`); and hide pagination when 0 vacancies match.
   - Replace `[...vacancyJobs].sort(...)` + `localeCompare` with `toSorted()` and a hoisted `Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })`.
   - Fix `formatDate` to parse `YYYY-MM-DD` explicitly without UTC-to-local day shift and handle invalid date strings safely.
   - Route each row's `Apply` directly via `<Link to={`/job-details/${encodeURIComponent(job.itemNumber)}?slot=${encodeURIComponent(job.plantillaSlotId)}`} state={{ landingJob: job }} className="btn btn-sm btn-primary">` and read `?slot=` as a fallback in `JobDetailsPage.tsx` when `location.state` is empty.
   - Remove raw `{vacanciesError}` from public render (`L410`), style `"Try again"` with `.btn .btn-sm .btn-secondary`, and add a `"Clear search"` button in the empty-search state.

### Phase 4 — Civic Trust, Copy Clarity & Footer Cleanup (P1)
6. Strengthen above-the-fold identity and clean up `SharedFooter.tsx`:
   - Add concise official attribution in the hero eyebrow (`Office of the City Human Resource Management Officer · Iloilo City Government`) and wrap `"Abyan mo sa pag-asenso."` in `<span lang="fil">`.
   - Clarify the `Currently Vacant Jobs` subtitle so first-time applicants know each row is one open plantilla item and `Apply` opens qualification details first.
   - Unify `"Apply for a Job"` link targets between hero and `SharedFooter.tsx`, and switch `SharedFooter.tsx` Portals links from `<a href>` to `<Link to>`.
   - Refactor `SharedFooter.tsx` inside `.abyan-ds` using token CSS classes (removing all 16 inline `style` objects, JS `onMouseEnter`/`onMouseLeave` handlers, inconsistent `mix-blend-mode: screen`, dead `href="#"` social links unless real URLs are provided, and the forward-dated `2026 – 2027` copyright span).

### Phase 5 — Typography Scaling, Motion Pause Control & Core Web Vitals (P2)
7. Polish typography, motion controls, and asset/cache behavior:
   - Add a subtle, keyboard-accessible hero Pause/Play background button toggling `animation-play-state: paused`, move `landing-hero.css` animations into `@media (prefers-reduced-motion: no-preference)`, replace the duplicate nested `.landing-hero-bg` div with `.landing-hero-pulses`, and scope reduced-motion rules in `abyan-tokens.css` so non-motion color transitions remain active.
   - Apply `clamp(2.5rem, 1.8rem + 2.2vw, 3.75rem)` + `text-wrap: balance` on hero `<h1>`, `text-wrap: pretty` on hero `<p>`, `font-size-adjust: from-font` on the landing root, and migrate fixed `.btn`/`.badge` `height` to `min-block-size`.
   - Remove duplicate `html { font-size: 16px }` declarations in `src/styles/globals.css` and add `<meta name="text-scale" content="scale" />` in `index.html`.
   - Remove `<meta http-equiv="Cache-Control" content="no-store, ...">`, `Pragma`, and `Expires` from `index.html`; remove the duplicate `@import` in `src/styles/globals.css:1`; trim `index.html:26` Google Fonts to `wght@400;500;600;700`; add explicit `width`/`height` on header and footer `<img>` logos plus `loading="lazy"` on below-the-fold footer logos; update `<title>` to include `Iloilo City Government`; and clean up `LandingPage.tsx:432` JSX typo and unused refs.
8. Update and expand `src/components/LandingPage.vacancies.test.tsx` to cover the updated row link accessible names, Login click/keyboard toggle and Escape dismiss, pagination ellipsis and zero-result hiding, timezone-safe `formatDate`, empty-search clear button, and hidden raw error strings.

## Risks

- **Shared stylesheet changes (`globals.css`, `abyan-tokens.css`, `SharedFooter.tsx`):** Removing `html { font-size: 16px }`, changing `.btn`/`.badge` to `min-block-size`, and refactoring `SharedFooter.tsx` affect other public and authenticated pages (`AboutPage`, `JobPortalPage`, portals). Mitigate by keeping landing-only rules in `src/styles/landing-page.css`, keeping default root sizing identical at 100% browser zoom (`16px` browser default), and spot-checking `AboutPage` and `JobPortalPage` visually alongside the landing page.
- **Existing test expectations (`LandingPage.vacancies.test.tsx`):** Existing assertions query `getByRole('button', { name: 'Apply' })`, expect default `'department'` sort, and assert `Showing 1 to 3 of 3 jobs`. Keep `'department'` as default sort and `"Showing X to Y of Z jobs"` copy, and intentionally update the row CTA assertion to match the accessible `<Link>` role/name.
- **Dirty current branch (`docs/security-audit-refresh`):** Unrelated uncommitted docs and migration files are present in the working tree. Do not edit code until working on a clean branch or worktree created from `main`.
- **Browser support for Popover API & CSS Anchor Positioning:** Older browsers without `popover` or `position-area` must still open and align the Login dropdown cleanly. Gate `inset: auto; margin: 0` inside `@supports (position-area: block-end)` and ship both the feature-detected open fallback and `getBoundingClientRect()` positioning fallback.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test` (including updated `src/components/LandingPage.vacancies.test.tsx` and `JobDetailsPage.plantillas.test.tsx`)
- `npm run build`
- Live DOM scan on local dev server: `impeccable detect --json http://localhost:5173/` (expect exit `0`, 0 warnings)
- Live browser verification at `1440×900` and `390×844` (confirm zero horizontal overflow, Login tap/keyboard/Escape, `.btn-white` focus ring, mobile `@container` vacancy cards, pagination states, and footer layout)
- `DESIGN_IDENTITY.md §16` PR consistency checklist
- Re-run `/impeccable critique` after fixes to confirm score improvement over `18/36`
