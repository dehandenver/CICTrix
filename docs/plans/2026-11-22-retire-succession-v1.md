---
title: Retire Succession V1 across pipeline, Eligibility Points, and Succession Planning UI
date: 2026-11-22
status: Done
summary: Complete the V1-to-V2 succession cutover across the backend pipeline, Eligibility Points catalog UI, and SuccessionPlanningPage (9-column V2 table without Readiness), with consolidated tests and full verification.
spec: docs/mockups/2026-10-07-succession-table.html
---

## Goal

Retire all Succession V1 scoring logic, types, and UI toggles across the repository so RSP Succession Planning, the RSP Dashboard critical-position overview, and the Eligibility Points catalog run exclusively on the V2 scoring pipeline (`fetchSuccessionPoolsV2` / `fetchSuccessionPoolV2`) and V2 fixed eligibility tiers (`0 / 7.5 / 15`). Note: per explicit user decision, `SuccessionPlanningPage` removes the `Readiness` column completely, superseding the Readiness column in `docs/mockups/2026-10-07-succession-table.html`.

## Approach

### Lane 1: Backend & Pipeline Cutover (`pipeline`)
- Extract `PositionRank`, `isDownwardMove`, and `isDownwardTitleMove` into `src/lib/api/successionDiscovery.ts`, along with `canonicalEligibilityTypeName` and `resolveRecognizedEligibility` mapping legacy `employees.eligibility` shorthand to active `eligibility_types` rows.
- Update `src/lib/api/successionPipelineV2.ts` to export `CandidateCompetencyItemV2`, `CandidateEligibilityDetailV2`, `CandidateMetaV2`, `downwardMovesExcluded`, `fetchSuccessionPoolsV2`, and `fetchSuccessionPoolV2` with batched queries, `.in('employee_training_id', ...)` filtering, active `eligibility_types` resolution, and explicit query error throws.
- Migrate `getSuccessionDashboardOverview` in `src/lib/api/succession.ts` onto `fetchSuccessionPoolsV2`, update `src/lib/api/educationAttainment.ts` comments, and delete `src/lib/api/successionCriteria.ts`, `src/lib/api/successionCriteria.test.ts`, and `src/lib/api/successionAutoSuccessors.test.ts`.

### Lane 2: Eligibility Points Catalog UI (`eligibility-ui`)
- Update `src/lib/api/eligibilityTypes.ts` to make `points` and `pointsForFullMarks` optional in `upsertEligibilityType` (defaulting to `0` and `100`) and remove `setPointsForFullMarks`.
- Update `src/components/EligibilityPointsPanel.tsx` to display the V2 info/consequence banner and 3-card fixed tier summary (`0.0 / 15 pts`, `7.5 / 15 pts`, `15.0 / 15 pts`), remove the full-marks cap and per-row point inputs, and keep the catalog table (active status toggle, remove, add) aligned with `DESIGN_IDENTITY.md`.

### Lane 3: Succession Planning UI & Docs (`succession-ui`)
- Refactor `src/components/SuccessionPlanningPage.tsx` to remove V1 imports/state (`candByPos`, `modelByPos`) and the `"Legacy Model (V1)"` / `"Reviewed Scoring (V2)"` toggle, batch-load V2 pools on department expand via `fetchSuccessionPoolsV2`, and refresh individual positions via `fetchSuccessionPoolV2` on modal save or retry.
- Render the 9-column sortable table (without Readiness), position header counts (`did not meet the minimum requirements`, `excluded as downward move(s)`), expandable 5-criterion V2 breakdown (including `date_hired` tenure fallback note, `Eligibility Details` with `"not in recognized eligibilities"`, `Required Competencies`, `Gap Analysis`, `Required Actions`, timeline, and `"Open L&D Archive →"`), `configurationNeeded` banner, and `needsReview` cards.
- Consolidate tests into `src/components/SuccessionPlanningPage.test.tsx` and delete `src/components/SuccessionPlanningPage.v2.test.tsx`.

## Steps

1. Create this plan and register it in `docs/plans/index.html`.
2. Execute the three parallel implementation lanes (`pipeline`, `eligibility-ui`, `succession-ui`).
3. Verify zero remaining V1 references, type-check, lint, full Vitest suite, cross-module smoke & sanity checks, migration drift check, and isolated Linux Docker (`node:20-alpine`) production build.
4. Record the full multi-lane session summary in `docs/session-summaries/2026-11-22-retire-succession-v1-summary.md` and regenerate `docs/plans/index.html`.

## Risks

- Removing the Readiness column intentionally diverges from `docs/mockups/2026-10-07-succession-table.html` per user decision.
- Windows Defender file-locking on temporary esbuild files during `npm run build` on the host is mitigated and verified cleanly via `npm run build:verify` on the host and a full `npm run build` in an isolated `node:20-alpine` Docker container.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build` (plus `npm run build:verify` and isolated `node:20-alpine` Docker verification)
- `npm run check:migrations`
- `git grep "successionCriteria\|listAutoSuccessors" src/`
- `DESIGN_IDENTITY.md` §16 checklist review
