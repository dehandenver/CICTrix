---
title: Align the non-RSP portals with the design identity (UI only)
date: 2026-11-03
status: In Progress
summary: Bring the Super Admin, PM, Office, L&D, Interviewer, Employee and Public pages onto the DESIGN_IDENTITY.md colors, font and pill buttons by reusing the RSP utility remap and swapping inline literals for tokens, with no change to behavior, data or routing.
---

## Goal

Every portal renders on the guide's colors, Poppins, and pill buttons. Behavior, data, routing and logic stay exactly as they are.

An audit on 2026-11-03 found the drift is mostly outside `.rsp-ds`. RSP's Tailwind classes are already remapped onto tokens by `src/styles/rsp-design.css`, so RSP is largely aligned. The remaining gaps are:

- Super Admin
- PM and the Office console
- L&D sections
- Interviewer
- Employee
- parts of Public

They need two fixes: (1) Tailwind utilities that aren't remapped, and (2) inline hex colors and non-Poppins fonts that no remap can reach.

This plan doesn't supersede `2026-10-25-standard-modal.md`. Modal migration stays there.

## Approach

**Functionality guardrail.** Edits are limited to `className` strings, `style={{...}}` values and CSS files. Handlers, state, hooks, props, conditionals, Supabase calls, `src/lib/`, routes and element structure are not touched. The one exception is adding a scope class to an existing root element. Every hunk in each commit is reviewed against this rule, and any line that isn't styling is reverted.

1. **Generalize the remap scope.** In `rsp-design.css`, replace the selector `.rsp-ds` with `:is(.rsp-ds, .ds-remap)` everywhere, including the light-only `:root:not([data-theme='dark']) .rsp-ds` prefixes. `:is()` keeps single-class specificity, so RSP output is unchanged. Add any utility families the new portals use that aren't covered yet (teal, cyan, pink and so on) to the existing category and status groups, following §10.
2. **Opt each portal in.** Add `ds-remap abyan-tokens` to the portal's existing root element. This gives the root the tokens without the `.abyan-ds` text-inherit reset.
3. **Swap inline literals for tokens** using one fixed mapping:

   | Off-palette | Token |
   |---|---|
   | `#111827`, `#0F172A` | `var(--neutral-900)` |
   | `#1F2937`, `#374151`, `#1E293B`, `#212121`, `#1A1A1A` | `var(--neutral-800)` |
   | `#6B7280`, `#757575`, `#4B5563` | `var(--neutral-600)` |
   | `#9CA3AF` | `var(--neutral-400)` |
   | `#D1D5DB`, `#E5E7EB`, `#E0E0E0`, `#F0F0F0` | `var(--neutral-200)` |
   | `#F3F4F6`, `#F9FAFB`, `#F8F9FA` | `var(--bg-page)` |
   | `#050D65` | `var(--color-primary-900)` |
   | `#EEF2FF`, `#EEF0FD` | `var(--color-primary-50)` |
   | `#2E35D4` | `var(--color-primary-700)` |
   | `#EF4444`, `#DC2626`, `#C62828` | `var(--error-500)` (fill/icon) or `var(--error-700)` (text) |
   | `#B91C1C` | `var(--error-700)` |
   | `#D97706`, amber hexes | `var(--warning-500)` / `var(--warning-700)` |
   | purple / violet hexes used as category | brand blue or tint, per §10 |

   Hexes with no clear match are listed in the phase summary and left unchanged.
4. **Fonts.** Replace the inline `INTER_STACK` and `-apple-system` stacks with `var(--font-sans)`, or remove them so Poppins is inherited. Monospace stays where it shows codes or IDs.

**Rejected:** remapping the Tailwind config's default palette. That would be a token decision, it would change every page at once, and it would duplicate the remap layer that already exists.

## Steps

Each step is one commit.

1. **Remap generalization** (`rsp-design.css` only). RSP renders unchanged.
2. **Super Admin:** `SuperAdminDashboard.tsx`, `SystemAdministrationPage.tsx`, `SupervisorAccessPage.tsx`, plus the font in `LoginPage.tsx`.
3. **PM and Office console:** `PMDashboard.tsx` sections, `IPCRManagementPage.tsx`, `CompetencyFrameworkPage.tsx`, and in `pm/`: `PMIPCRManagement`, `PMReportsAnalytics`, `PMCompetencyFramework`, `PMPromotionalApplications`, `CompetencyGapPanel`, `Phase2RatingPanel`, `SemesterSummarySection`, `OfficeTrainingCourses`, `OfficeAccountConsole`.
4. **L&D:** `LNDDashboard.tsx` sections, `LndTrainingNeeds.tsx`, `LndIdpFormSettings.tsx`, `TrainingCalendar.tsx`, `TrainingPlan.tsx`, `TrainingCourses.tsx`.
5. **Interviewer:** `src/styles/interviewer.css`, which is imported globally, so grep each class's usage first. Also the inline styles in `ApplicantDetailsPage.tsx` and `EvaluationForm.tsx`.
6. **Employee:** `EmployeePage.tsx`, `EmployeePhase2.tsx`, `PersonalDataSheetSection.tsx`, `IdpFormSection.tsx`, `MyTrainingsSection.tsx`.
7. **Public:** `LandingPage.tsx`, `JobPortalPage.tsx`, `AboutPage.tsx`, `ContactsPage.tsx`, `SharedFooter.tsx`, `ApplicationStatusPage.tsx`, `wizard.css`, `SuccessionReadinessEngine.tsx`.
8. Session summary, status set to Done, index regenerated, then `/code-review` on the branch.

**Out of scope:**
- modal migration (a behavior change, owned by the standard-modal plan)
- removing the legacy `globals.css` text rule (§17 item 8)
- the Tailwind config and token values
- layout restructuring
- print templates (`ApplicantRankingPage.tsx`, `LndTrainingEvaluation.tsx`), since Poppins would need a font load in the popup
- demo and prototype pages

## Risks

- **Dark theme.** Neutral remaps stay light-only. Inline swaps use fixed values, the same as the hexes they replace, so dark-theme behavior doesn't change. Each portal gets checked in both themes.
- **Gray shift.** `#6B7280` becomes `#515F69` and so on, so text gets slightly darker with better contrast. This is intended.
- **Global `interviewer.css`.** A shared class could restyle another page, so grep its usage before editing.
- **Local sign-in.** The local anon key is disabled, so signed-in portal pages can't be checked locally. They get a temporary component harness (not committed) and the Vercel preview after an approved push.

## Checks to run

- `npx tsc --noEmit`, `npm run lint`, `npx vitest run` (10 test files assert classes or styles), and `npm run build:verify`, every phase.
- A hunk-by-hunk `git diff -U0` audit under the styling-only rule.
- Screenshots before and after at desktop and mobile widths, in the light and dark themes. Logout and modal header text still render white.
- After step 1: RSP matches its pre-change screenshots.
- The DESIGN_IDENTITY.md §16 checklist.

## Progress

Steps 1 to 4 are done. Resume at **step 5** (Interviewer).

| Step | State | Commit |
|---|---|---|
| 1. Remap generalization | Done. Reverting `:is(.rsp-ds, .ds-remap)` to `.rsp-ds` reproduces the old file byte for byte, so RSP is unchanged. | 1d77ce0 |
| 2. Super Admin and login font | Done. `SuperAdminDashboard.tsx` already used only on-palette hexes, so it only gained the scope classes. | 2ccb04c |
| 3. PM and Office console | Done. Only `IPCRManagementPage.tsx`, `CompetencyFrameworkPage.tsx` and `pm/PMReportsAnalytics.tsx` had off-palette hexes; the other listed files had none. `PMDashboard.tsx`, `IPCRManagementPage.tsx` and `CompetencyFrameworkPage.tsx` roots gained `ds-remap abyan-tokens`. | 3c8409c |
| 4. L&D | Done. Only the `LNDDashboard.tsx` root changed (`ds-remap abyan-tokens`). The five other listed files render inside it and have no off-palette hexes or Inter stacks. | d3ebb29 |
| 5 to 8 | Not started | |

**Checks run for steps 1 and 2:** `npx tsc --noEmit`, `npm run lint` and `npm run build:verify` pass. `npx vitest run` gives 1493 passed and 2 failed (`src/lib/trainingProgress.test.ts` and `scripts/seed-training-attendance.test.mjs`); both fail identically without these changes, and both are date-dependent. A `git diff -U0` audit found no non-styling lines. Tailwind emits color rules for the swapped `text-[var(--…)]`, `border-[var(--…)]` and `bg-[var(--…)]` classes.

**Not done yet:** before/after screenshots in light and dark, desktop and mobile, for Super Admin and RSP. The Super Admin pages need the temporary component harness because local sign-in is disabled. Nothing has been pushed.

**Tip for the next session:** tokens are defined on `.abyan-tokens`, not `:root`, so any file given `var(--…)` values must sit under a root that carries `abyan-tokens`. Most hits in the audit are already on-palette hexes (`#363EE8`, `#515F69`, `#040E6B`, `#E2E8F0`) and the plan doesn't ask for them to change. Only swap the off-palette ones.

**Left unchanged** (L&D): the chart colour array at `LNDDashboard.tsx:155` and the Recharts `stroke`/`fill` props at lines 719 to 721 (`#e5e7eb`, `#6b7280`, `#374151`), because they are component props, not className or style values.

**Left unchanged, no match in the plan table** (PM files): `#10b981` green in `IPCRManagementPage.tsx`, the `rgba(245,158,11,…)` amber backgrounds, and the `#d1fae5` / `#dbeafe` bucket fills in `PMReportsAnalytics.tsx`.

**Left unchanged, no match in the plan table** (Super Admin files):
- avatar colour array in `SystemAdministrationPage.tsx:573` (`#2563eb`, `#7c3aed`, `#059669`, `#d97706`, `#dc2626`, `#0891b2`, `#4f46e5`)
- blue shades `#2563EB`, `#1E40AF`, `#3B82F6`, `#DBEAFE`, `#BFDBFE`, `#F0F7FF`
- green and red shades `#047857`, `#166534`, `#991B1B`, `#FEE2E2`, `#FCA5A5`
- slate shades `#64748B`, `#475569`, `#CBD5E1`, `#F8FAFC`, `#FAFAFA`, `#F5F5F5`
