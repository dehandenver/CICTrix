---
title: Public applicant flow mobile compatibility
date: 2026-11-28
status: Done
summary: Make the public applicant flow (Job Portal, Job Details, Application Wizard, and Status Tracker) mobile-compatible using Modern Web Guidance best practices, and enforce modern-web-guidance in project rules for all future UI changes.
spec: docs/mockups/2026-10-26-tracker-application-list.html
---

## Goal

Applicants on mobile devices (down to 320–390px viewports and coarse touch pointers) can browse vacancies, view job details, complete and review single- or multi-plantilla applications, and track/resubmit documents without horizontal overflow, hover-only dead ends, clipped menus, iOS input zoom, or obscured controls. Future UI changes in this repository automatically launch the `modern-web-guidance` skill.

Settled mockups preserved:
- `docs/mockups/2026-10-26-tracker-application-list.html` (expandable multi-application list on Status Tracker)
- `docs/mockups/2026-11-22-apply-work-experience-collapsible.html` (collapsible work experience entries on Apply Wizard)
- `LandingPage.tsx` and `SharedFooter.tsx` are left untouched to avoid conflicting with active work on `feat/landing-page-modernization`.

## Approach

Apply Modern Web Guidance (`form-factor-adaptation`, `responsive-design`, `responsive-table`, `tabs`, `viewport-aware-dropdowns`, `dialog`, `forms`, `navbar`) and `DESIGN_IDENTITY.md` tokens across the public applicant flow:

1. **Project rules (`AGENTS.md`, `CLAUDE.md`, `.agents/AGENTS.md`):** Require running `modern-web-guidance` (`search` + `retrieve`) before any UI, HTML/CSS, layout, accessibility, or related client-side web change, verifying compliance, and disclosing applied guides on delivery.
2. **Job Portal (`src/components/JobPortalPage.tsx`, `src/styles/job-portal.css`):** Replace the hover-only Login menu with a touch/keyboard-accessible `popover="auto"` + `popovertarget` menu using `@supports (position-area: block-end)` anchor positioning and a `getBoundingClientRect()` fallback; add a responsive mobile header collapse (`< 640px`); wrap search and filters in `<search>` with `<input type="search">` and `font-size: max(1rem, 1em)`; wrap pagination with ellipsis (`DESIGN_IDENTITY.md §9.6`); and make the table view keyboard-scrollable with `@container (width < 600px)` stacked cards.
3. **Job Details & Application Wizard (`src/styles/applicant-flow.css`, `src/modules/applicant/flow/FlowUi.tsx`, `src/components/JobDetailsPage.tsx`, `src/modules/applicant/ApplicantWizard.tsx`, `src/modules/applicant/ApplicantAssessmentForm.tsx`, `src/styles/wizard.css`, `index.html`):**
   - Add `viewport-fit=cover` in `index.html`, switch `100vh` to `100dvh`, add `scroll-padding-top` and `scroll-padding-bottom` matching sticky headers and the fixed mobile action bar + `env(safe-area-inset-*)`, and pad safe areas on all edges.
   - Set `font-size: max(1rem, 1em)` on form inputs/selects/textareas (preventing iOS zoom), raise minimum touch target size to `44px` under `@media (pointer: coarse)`, and add `autocomplete`, `inputmode`, `enterkeyhint`, and `autocorrect="off"` on identifier/contact fields.
   - Tighten `.af-card` mobile padding to 16px, expose disabled plantilla reasons inline on touch devices rather than hover-only tooltips, convert `"Copy Answers From…"` to a viewport-aware `popover="auto"` dropdown, add scrollability edge fades and `scrollIntoView({ block: 'nearest', inline: 'nearest', container: 'nearest' })` to `.af-tabs`, and upgrade `ConfirmModal` to native `<dialog>` (`showModal()`, `closedby="any"` + pointer fallback, `overscroll-behavior: contain` on `:modal` and `::backdrop`, full-screen `100dvh` sheet on `< 640px` per `DESIGN_IDENTITY.md §9.10`).
4. **Application Status Tracker (`src/modules/applicant/ApplicationStatusPage.tsx`, `src/styles/application-status.css`):** Keep the settled expandable row layout, add `PublicTopBar` consistency or clean mobile spacing, wrap the lookup in `<search>` with `<input type="search" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="search">` (`>= 16px`), stack schedule rows below 640px, allow document headers and re-upload confirmation buttons to wrap cleanly with `44px` coarse-pointer targets, and replace hard-coded non-token accents where touched.

## Steps

1. Save this plan, update `implementation_plan.md`, and add the mandatory `modern-web-guidance` rule to `AGENTS.md`, `CLAUDE.md`, and `.agents/AGENTS.md`.
2. Update `JobPortalPage.tsx` and add scoped `src/styles/job-portal.css` for mobile header, popover Login menu, `<search>` filter toolbar, responsive `@container` table cards, and wrapped pagination.
3. Update `index.html`, `src/styles/applicant-flow.css`, `src/styles/wizard.css`, `FlowUi.tsx`, `JobDetailsPage.tsx`, `ApplicantWizard.tsx`, and `ApplicantAssessmentForm.tsx` for mobile viewport units, safe areas, `>= 16px` inputs, coarse-pointer tap targets, viewport-aware copy menu popover, scrollable tab fade hints, and native `<dialog>` mobile sheet `ConfirmModal`.
4. Update `ApplicationStatusPage.tsx` and add scoped `src/styles/application-status.css` for mobile `<search>` lookup, stacked schedule rows, wrapping document/re-upload action bars, and `44px` coarse-pointer targets.
5. Run `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build`; fix any regressions.
6. Write the session summary in `docs/session-summaries/2026-11-28-public-applicant-flow-mobile-summary.md` and regenerate `docs/plans/index.html`.

## Risks

- Native `<dialog>` (`showModal()` / `close()`) in JSDOM tests: Vitest/JSDOM does not implement `HTMLDialogElement.prototype.showModal` by default, so `ConfirmModal` must guard or fall back cleanly so existing tests (`ApplicantWizard.test.tsx`, `ApplicantWizard.promotion.test.tsx`) keep passing without mocking failures.
- Popover API (`showPopover` / `hidePopover` / `toggle` event) in JSDOM and older browsers: feature-detect `'popover' in HTMLElement.prototype` and fall back to controlled state + Escape/outside-click so both tests and older Safari/Firefox work identically.
- `JobDetailsPage.tsx` already has uncommitted `?slot=` query support in the working tree; make targeted edits only and preserve those lines.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build`
- `DESIGN_IDENTITY.md §16` PR checklist across touched public applicant screens
