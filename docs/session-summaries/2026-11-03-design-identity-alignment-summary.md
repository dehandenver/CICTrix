---
title: Design identity alignment of the non-RSP portals
date: 2026-11-03
summary: Steps 1 to 7 of the alignment plan are done. The Super Admin, PM, L&D, Interviewer, Employee and Public pages now use design tokens and the shared remap scope. Type-check, lint, build and tests pass apart from 2 date-dependent failures that were already there. Nothing was checked in a browser, and the branch review is still to do.
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

## Checks run

- `npx tsc --noEmit`, `npm run lint` and `npm run build:verify` pass on the final commit.
- `npx vitest run` over the whole repo (run after step 4): 1493 passed, 2 failed (`src/lib/trainingProgress.test.ts`, `scripts/seed-training-attendance.test.mjs`). Both are date-dependent and fail the same way without these changes.
- Per-step folder runs after steps 5 to 7 pass: interviewer 56, employee 64, components and applicant 223.

## Not done

- Before/after screenshots (light and dark, desktop and mobile) for every portal. Nothing was viewed in a browser.
- `/code-review` on the whole branch.
- The full vitest suite was not re-run after steps 5 to 7.
