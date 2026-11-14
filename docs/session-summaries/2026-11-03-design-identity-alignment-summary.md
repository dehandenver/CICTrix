---
title: Design identity alignment of the non-RSP portals
date: 2026-11-03
summary: Steps 1 to 7 of the alignment plan are done and merged in #11 and #12. The Super Admin, PM, L&D, Interviewer, Employee and Public pages now use design tokens and the shared remap scope. Type-check, lint, build and tests pass apart from 2 failures that were already there. Before/after screenshots show only the intended colour changes.
---

## What shipped

Implements [the plan](../plans/2026-11-03-design-identity-alignment.md). Styling only: edits are limited to `className` strings, `style` values and CSS. Every added line in each commit was checked to contain a token or a scope class.

| Step | Commit | Result |
|---|---|---|
| 1. Remap generalization | `1d77ce0` | `rsp-design.css` selectors are now `:is(.rsp-ds, .ds-remap)`. RSP output is unchanged. |
| 2. Super Admin and login font | `2ccb04c` | Off-palette hexes and amber hexes mapped to tokens; Inter stack replaced with `var(--font-sans)`. |
| 3. PM and Office console | `3c8409c` | Three files had off-palette hexes; the other listed files had none. |
| 4. L&D | `d3ebb29` | One root class change; the other files render inside it. |
| 5. Interviewer | `bb07704` | 71 hexes in the global `interviewer.css`, each with an on-palette `var()` fallback, plus the inline styles and root in `ApplicantDetailsPage.tsx`. |
| 6. Employee | `192c516` | `EmployeePage.tsx`, `EmployeePhase2.tsx`, `PersonalDataSheetSection.tsx`. |
| 7. Public | `a2f2533` | Landing, Job Portal, About, Contacts, Application Status, `wizard.css`, `SuccessionReadinessEngine.tsx`. |

## Deviations from the plan

- Step 2's commit was first typed `style(admin)`, which CLAUDE.md does not allow; it was reworded to `refactor(admin)`.
- Step 5 uses `var(--token, #fallback)` in `interviewer.css`, because the file is global and its generic class names (`.job-title`, `.empty-state`) also match elements outside a token scope.
- Fonts in the Public pages were left as they are: they are already Poppins-first, which matches the design identity fallback order.
- Left unchanged because the plan table has no match: Recharts `stroke`/`fill` props and chart colour arrays, the `#10b981` green and amber backgrounds in the PM pages, `#F0F2FD`, `#F8FAFC` and `#F8FAFF` page backgrounds, and the `#d97706` SVG stroke attribute.

## Code review

`/code-review` (high effort) on the branch gave 7 findings. Fixed in `b8ffffa`: `ds-remap` removed from the Application Status root so the tracker's legacy sections keep their no-remap opt-out, the `wizard.css` hex fallbacks dropped, and the Employee root now uses `var(--bg-page)` and `var(--font-sans)`. No change needed: dark theme (all remap selectors are light-only) and the nested scope classes on `IPCRManagementPage` and `CompetencyFrameworkPage` (both also render as standalone routes). Skipped at the time: the legacy-variable re-pointing and the missing visual checks, both settled by the screenshots below.

## Checks run

- `npx tsc --noEmit`, `npm run lint` and `npm run build:verify` pass.
- `npx vitest run` over the whole repo on the merged code: 1493 passed, 2 failed. The failures were already there. `src/lib/trainingProgress.test.ts` depends on the machine timezone (the test assumes Manila; the container runs UTC) and passes with `TZ=Asia/Manila`. `scripts/seed-training-attendance.test.mjs` needs a real `.env` and live Supabase data. An earlier version of this summary called both date-dependent, which was wrong.
- Before/after screenshots, Playwright, desktop 1366x768 and mobile 390x844, light and dark:
  - Public pages (Home, About, Job Portal, Track, Apply): 0 to 1.9% of pixels differ in light theme and 0 to 0.7% in dark. Page backgrounds and secondary text are slightly cooler. The Track page is unchanged, so its legacy sections still render as before.
  - PM, L&D, Employee and the Interviewer applicant page, through a temporary harness that rendered each component in mock mode (not committed): the PM warning banner moved to the `--warning-100` tint, Employee invalid fields moved to `#E05252` borders with `#B42323` messages, and L&D is essentially unchanged. Dark theme matches the before state, including a dark-band quirk on the PM page that was there before this work.

## Left open

- The Interviewer applicant page showed only a not-found state in the harness, so its real layout is unchecked.
- Everything was seen with placeholder data, not real records.
- The mobile header overlap of the ABYAN logo and the Home link on the public pages was there before this work.
