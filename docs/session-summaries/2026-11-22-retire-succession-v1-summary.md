# Retire Succession V1 across pipeline, Eligibility Points, and Succession Planning UI

Plan: `docs/plans/2026-11-22-retire-succession-v1.md`.

## Shipped

### Backend & Pipeline Cutover (`pipeline`)
- Created `src/lib/api/successionDiscovery.ts` (`PositionRank`, `isDownwardMove`, `isDownwardTitleMove`, `canonicalEligibilityTypeName`, `resolveRecognizedEligibility`) and `src/lib/api/successionDiscovery.test.ts` (25 tests).
- Updated `src/lib/api/successionPipelineV2.ts` with `fetchSuccessionPoolsV2`, `fetchSuccessionPoolV2`, `CandidateMetaV2`, `CandidateCompetencyItemV2`, `CandidateEligibilityDetailV2`, `downwardMovesExcluded`, active `eligibility_types` catalog resolution, `.in('employee_training_id', ...)` competency filtering, and explicit query error throws; updated `src/lib/api/successionPipelineV2.test.ts` (13 tests).
- Updated `src/lib/api/succession.ts` (`getSuccessionDashboardOverview` on `fetchSuccessionPoolsV2`, removed V1 scoring types/functions/helpers), `src/lib/api/successionDashboardOverview.test.ts` (8 tests), `src/lib/api/successionScores.test.ts` (32 tests), and the doc comment in `src/lib/api/educationAttainment.ts` (13 tests in `educationAttainment.test.ts`).
- Deleted `src/lib/api/successionCriteria.ts`, `src/lib/api/successionCriteria.test.ts`, and `src/lib/api/successionAutoSuccessors.test.ts`.

### Eligibility Points Catalog UI (`eligibility-ui`)
- Updated `src/lib/api/eligibilityTypes.ts` to make `points` and `pointsForFullMarks` optional in `upsertEligibilityType` (defaulting to `0` and `100`) and removed `setPointsForFullMarks`.
- Updated `src/components/EligibilityPointsPanel.tsx` with the V2 info/consequence banner and 3-card fixed tier summary (`0.0 / 15 pts`, `7.5 / 15 pts`, `15.0 / 15 pts`), removed the full-marks cap and per-row points inputs, and retained the catalog table (Recognized active checkbox with Saving…/Saved, Remove, and footer add form) using `DESIGN_IDENTITY.md` tokens and `.btn` classes.
- Added 3 tests to `src/components/EligibilityPointsPanel.test.tsx`.

### Succession Planning UI & Docs (`succession-ui`)
- Refactored `src/components/SuccessionPlanningPage.tsx` to be 100% V2-backed via `fetchSuccessionPoolsV2` (batch-loaded when a department opens) and `fetchSuccessionPoolV2` (single-position refresh after `CandidateEvidenceReviewModal` saves and on per-position retry).
- Removed all V1 imports, V1 state (`candByPos`, `modelByPos`), the `"Legacy Model (V1)"` / `"Reviewed Scoring (V2)"` toggle, and the `Readiness` column and badges.
- Implemented the 9-column sortable V2 table (`Rank`, `Candidate / Present Position`, `Performance (30%)`, `Experience (20%)`, `Training (20%)`, `Education (15%)`, `Eligibility (15%)`, `Total Score`, `Actions`), position header counts (`did not meet the minimum requirements`, `excluded as downward move(s)`), `configurationNeeded` banner, `needsReview` cards, and the expandable 5-criterion V2 breakdown (`date_hired` tenure fallback note, `Eligibility Details` with `"not in recognized eligibilities"`, `Required Competencies`, `Gap Analysis`, `Required Actions`, timeline, and `"Open L&D Archive →"`).
- Consolidated tests into `src/components/SuccessionPlanningPage.test.tsx` (3 tests) and deleted `src/components/SuccessionPlanningPage.v2.test.tsx`.

## Deviations

- Removed the `Readiness` column from `SuccessionPlanningPage.tsx` as explicitly directed by the user, superseding the Readiness column shown in `docs/mockups/2026-10-07-succession-table.html`.

## Checks run

- `npx tsc --noEmit`: passed (exit 0).
- `npm run lint`: passed (exit 0, 0 warnings).
- Focused Succession & Eligibility suite: 8 files, 256/256 tests passed (`successionDiscovery.test.ts`, `successionScoringV2.test.ts`, `successionPipelineV2.test.ts`, `successionDashboardOverview.test.ts`, `successionScores.test.ts`, `EligibilityPointsPanel.test.tsx`, `SuccessionPlanningPage.test.tsx`, `educationAttainment.test.ts`).
- Full host test suite (Node 24): 171 test files, 1,562/1,562 tests passed.
- `npm run build:verify` (host): passed (exit 0; 3,154 modules transformed, chunks emitted to `dist/`).
- `git grep "successionCriteria\|listAutoSuccessors" src/`: 0 matches (exit 1).
- Cross-module smoke & sanity suite: 9 test files, 33/33 passed (`RSPDashboard.successionTabs.test.tsx`, `RSPDashboard.dataLoading.test.tsx`, `RSPDashboard.back.test.tsx`, `RspDashboardOverview.test.tsx`, `CriticalPositionGapAnalysisPage.test.tsx`, `CandidateEvidenceReviewModal.test.tsx`, `SuccessionPlanningPage.test.tsx`, `EligibilityPointsPanel.test.tsx`, `trainingRecommendationScoring.test.ts`).
- `npm run check:migrations`: passed (133 migration files OK).
- Live HTTP smoke check (`vite preview --port 4173`): HTTP 200 (`Content-Type: text/html`) with `<div id="root"></div>`.
- Isolated Docker verification (`node:20-alpine` on Docker Desktop 4.97.0 / Engine 29.9.2):
  - `npx tsc --noEmit`: exit 0.
  - `npm run lint`: exit 0, 0 warnings.
  - `npm test`: 170/171 test files, 1,559/1,562 tests passed (all succession, scoring, pipeline, and UI tests passed 100%; 3 crypto mock tests pass on Node 24 host).
  - `npm run build` (`tsc && vite build`): exit 0 (3,154 modules transformed and minified in 19.07s without Windows esbuild temp-file locks).
