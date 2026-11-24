---
title: Fix core data, workflow, and UI bugs (Batch 1)
date: 2026-11-24
status: In Progress
summary: Eliminate 1,000-row Supabase truncation, fix PCPT scoring inversion and PHT date gates, repair Interviewer drafts, Applicant Tracker signing/regret details, Office Console scope leak, Super Admin live stats, toast z-index, button hover contrast, Applicant Wizard reload guard, and Succession Evidence modal counting.
---

## Goal

All 11 verified bugs across data accuracy, broken admin/portal workflows, and UI/data-loss traps are resolved without regressions. Automated unit, smoke, and sanity suites pass cleanly, and an independent verification subagent (`inherit` — Gemini 4 Neon, High effort) audits the diff and verification results.

## Approach

### Track A — Wrong Numbers & Missing Data
1. **1,000-row truncation & unbounded `.in()` queries:** Extend `src/lib/api/fetchAllRows.ts` with `fetchInChunks` (chunks `.in()` arrays and pages every chunk via `fetchAllRows`). Adopt `fetchAllRows`/`fetchInChunks` across `semesterSummaryOfRatings.ts`, `sorSemesterSource.ts`, `competencyGapAnalysis.ts`, `trainingNeeds.ts`, `succession.ts`, `hiredApplicantSync.ts`, `ipcrPhaseControl.ts`, `ipcrRatings.ts`, `employees.ts` (using `{ count: 'exact', head: true }` in `getEmployeeStatistics`), and centralized helpers in `ipcrSubmissions.ts` consumed by `PMDashboard.tsx` and `PMIPCRManagement.tsx`.
2. **PCPT scoring monotonicity:** Update `pcptRawToConvertedScore` in `src/lib/api/applicantScores.ts` so `raw < 20` scales linearly in `[0, 10)` via `(raw / 20) * 10` (preserving all `>= 20` brackets), and remove the duplicate copy in `src/components/QualifiedApplicantsSection.tsx`.
3. **Asia/Manila phase dates:** Add `src/utils/manilaDate.ts` (`todayManilaIso`) and replace UTC `toISOString().slice(0, 10)` in `phaseSchedules.ts`, `ipcrPhaseControl.ts`, and `idpSchedule.ts`.

### Track B — Broken Screens & Workflows
4. **Interviewer Save Draft:** Persist per-applicant draft state (`evaluation`, `pcptScores`, `activeTab`, `savedAt`) to `localStorage` in `src/modules/interviewer/EvaluationForm.tsx`, restore on mount with a dismissible notice, and clear on successful final submission.
5. **Applicant Tracker signing & regret letter:** Map `signing_deadline`, `signing_instructions`, and `archived_at` in `mapRow`, add `'For Contract Signing'` to `STATUS_BADGE`, and add its notice message in `src/modules/applicant/ApplicationStatusPage.tsx`.
6. **Office Head initial-load scope leak:** Pass the resolved `role` directly to `refreshPendingApprovals(role)` in `src/modules/admin/pm/OfficeAccountConsole.tsx` (refusing to fetch with `null`), and gate `OfficeTrainingCourses.tsx` queries until `officeName` is non-empty with a `cancelled` polling cleanup guard.
7. **Super Admin Dashboard live stats:** Create `src/lib/api/superAdminStats.ts` reading live counts/summaries from `applicants`, `job_postings`, `raters`, `training_sessions`, `training_enrollments`, `employees`, `departments`, `performance_cycles`, `target_settings`, and `performance_evaluations`, and wire `src/modules/admin/SuperAdminDashboard.tsx` to it while removing hardcoded fake placeholders and empty no-op Quick Actions.

### Track C — UI & Data-Loss Traps
8. **Toast z-index:** Raise `.afb-viewport` (`action-feedback.css`) and custom toasts (`JobPostingsPage.tsx`, `RaterManagementPage.tsx`) to `1200` (above `Modal` at `1000`), and lower `.admin-login-page` (`admin.css`) from `2147483000` to `100`.
9. **Colored button hover contrast:** Scope generic `button` / `button:hover` rules in `src/styles/globals.css` using `:where(button)` so Tailwind `.text-white` and `.bg-*` utilities win on hover.
10. **Applicant Wizard reload guard:** On Step 3 hydration with missing files, redirect back to `'fill'` on the Attachments page with an inline re-attach banner, and re-run `validateApp` before `confirmBatch` and inside `handleSubmitAll`.
11. **CandidateEvidenceReviewModal miscount & save-error wipe:** Guard `d != null` in `reviewedRecords`, split `loadError` vs `saveError` so save failures show an inline banner without clearing selections, disable `Save Review` on `loadError`, and disable `✕` while `saving`.

## Steps

1. Branch from `upstream/main` and save plan doc (`docs/plans/index.html` regenerated).
2. Implement Track A fixes + unit tests.
3. Implement Track B fixes + unit tests.
4. Implement Track C fixes + unit tests.
5. Run `npx tsc --noEmit`, `npm run lint`, `npm run check:migrations`, `npm run build`, full Vitest unit/smoke/sanity suites, and Docker/live checks if needed.
6. Run an independent verification subagent (`inherit` — Gemini 4 Neon, High effort) to audit the diff, tests, and checks.

## Risks

- Changing `fetchAllRows` queries requires deterministic `.order(...)` keys so paged slices neither duplicate nor drop rows; verify each table/view's primary/sort key before editing.
- Changing global `button:hover` specificity could alter unstyled legacy buttons; keep `:where(button):hover` fallback intact so unstyled buttons behave identically while utility-styled buttons preserve `.text-white`.
- Existing unit tests mocking `supabase.from(...).select(...)` without `.order()` or `.range()` must stay compatible with `fetchAllRows` or be updated where mocks assumed unpaginated single-shot calls.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm run check:migrations`
- `npm run build`
- `npx vitest run --exclude "**/.worktrees/**" --exclude "**/.claude/**"` (includes `src/test/*.smoke.test.*` and component/API sanity suites)
- Independent verification subagent (`inherit`) diff + regression audit
