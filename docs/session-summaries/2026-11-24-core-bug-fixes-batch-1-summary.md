---
title: Core bug fixes (Batch 1) — Summary
date: 2026-11-24
status: In Progress
summary: Implemented all 11 Batch 1 fixes across pagination/chunking, PCPT scoring, Asia/Manila phase dates, Interviewer drafts, Applicant Tracker, Office Console scoping, Super Admin live stats, toast z-index, button hover contrast, Applicant Wizard reload guard, and Succession Evidence modal counting.
---

## What shipped vs. planned

All 11 items in [docs/plans/2026-11-24-core-bug-fixes-batch-1.md](../plans/2026-11-24-core-bug-fixes-batch-1.md) were implemented on branch `fix/core-bug-fixes-batch-1`:

- **Track A (Data accuracy):**
  - Added `fetchInChunks` to `src/lib/api/fetchAllRows.ts` and adopted `fetchAllRows` / `fetchInChunks` across `semesterSummaryOfRatings.ts`, `sorSemesterSource.ts` (including fallback `target_settings`), `competencyGapAnalysis.ts` (including `getActiveHeadcountByDepartment`), `trainingNeeds.ts`, `succession.ts` (`getLatestOverallScores` and chunked `departmentsByEmployee`), `hiredApplicantSync.ts`, `ipcrPhaseControl.ts`, `ipcrRatings.ts`, `employees.ts` (`{ count: 'exact', head: true }` in `getEmployeeStatistics`), and centralized paginated helpers in `ipcrSubmissions.ts` used by `PMDashboard.tsx` and `PMIPCRManagement.tsx`.
  - Fixed `pcptRawToConvertedScore` monotonicity below raw `20` in `src/lib/api/applicantScores.ts` (`(raw / 20) * 10`) and removed the duplicate copy in `src/components/QualifiedApplicantsSection.tsx`.
  - Added `src/utils/manilaDate.ts` (`todayManilaIso`) and replaced UTC date slicing in `phaseSchedules.ts`, `ipcrPhaseControl.ts`, and `idpSchedule.ts` (including `closedReason`).
- **Track B (Broken workflows):**
  - Wired per-applicant `localStorage` draft persistence, restore banner, `Discard Draft`, and clear-on-submit in `src/modules/interviewer/EvaluationForm.tsx`.
  - Mapped `signing_deadline`, `signing_instructions`, and `archived_at` plus `'For Contract Signing'` badge and notice in `src/modules/applicant/ApplicationStatusPage.tsx`.
  - Passed resolved `role` directly into `refreshPendingApprovals(role)` in `src/modules/admin/pm/OfficeAccountConsole.tsx` and gated `OfficeTrainingCourses.tsx` queries on `officeName` with polling cleanup.
  - Created `src/lib/api/superAdminStats.ts` reading canonical Supabase tables and wired `src/modules/admin/SuperAdminDashboard.tsx` to live metrics, removing legacy `jobs`/`trainings` queries, hardcoded placeholders, and empty Quick Actions.
- **Track C (UI & data-loss traps):**
  - Raised `.afb-viewport` (`action-feedback.css`) and custom toasts (`JobPostingsPage.tsx`, `RaterManagementPage.tsx`) to `1200` and lowered `.admin-login-page` (`admin.css`) to `100`.
  - Scoped generic button fallback in `src/styles/globals.css` with `:where(button)` and `:where(button:hover)` (`(0, 0, 0)` specificity) so Tailwind `.text-white` and `.bg-*` utilities win on hover.
  - Added Step 3 reload file-loss guard redirecting to Page 5 (`Documents`) with an inline notice (focusing the first missing-file plantilla and clearing the notice on valid review) plus submit-time `validateTargetsForSubmit` in `src/modules/applicant/ApplicantWizard.tsx`.
  - Fixed `reviewedRecords` unreviewed miscount (`d != null`), split `loadError` vs `saveError` to preserve user selections on save error, and disabled `✕` while saving in `src/components/CandidateEvidenceReviewModal.tsx`.

## Deviations

- An independent verification subagent (`inherit` — Gemini 4 Neon, High effort) caught three defects during review: `:where(button):hover` having `(0, 1, 0)` specificity instead of `:where(button:hover)`, `reloadFileNotice` not clearing after re-attaching files, and three remaining unpaginated/unchunked queries (`getActiveHeadcountByDepartment`, `departmentsByEmployee`, and `sorSemesterSource` fallback `target_settings`), plus a `TS2698` cast in `EvaluationForm.draft.test.tsx`. All were fixed and re-verified.
- `npm run build` hit an intermittent Windows Defender `esbuild` temp-file lock after transforming all 3,158 modules; `npm run build:verify` (`tsc --noEmit && vite build --minify false --target esnext`) completed cleanly in 14.02s.

## Checks run

- `npx tsc --noEmit`: pass (exit 0)
- `npm run lint`: pass (exit 0, 0 warnings)
- `npm run check:migrations`: pass (`supabase/migrations OK (138 files)`)
- `npm run build:verify`: pass (`3158 modules transformed`, exit 0)
- `npx vitest run --exclude "**/.worktrees/**" --exclude "**/.claude/**"`: pass (`207 passed (207)`, `1,896 passed (1,896)` pre-final-1-line-fix) + targeted re-run of 13 affected unit/smoke suites (`13 passed (13)`, `93 passed (93)`) and `EvaluationForm.draft.test.tsx` (`2 passed (2)`) post-fix
- Independent verification subagent (`inherit`) verified all schema columns against the running local Docker Postgres (`supabase_db_cictrix-schema-test`) and audited the full diff.
