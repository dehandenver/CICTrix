---
title: Page-by-Page System Rollout Implementation Plan
date: 2026-10-28
status: Done
summary: Multi-agent sanity, smoke, and Vitest test audit certifying all 51 page surfaces across all 7 CICTrix HRIS portals on the main branch.
---

## Goal

Provide a structured, page-by-page rollout and verification certification for every module and page surface across the CICTrix HRIS application on branch `main`. All 51 page surfaces across the 7 application portals (Public, Interviewer, Employee, Super Admin, RSP, L&D, and PM) are certified for operational readiness with zero TypeScript errors, zero lint warnings, verified bundle builds, and 100% passing client/portal automated test suites.

## Approach

The system was audited through a three-tier test regimen and partitioned across 3 parallel Gemini 3.8 Flash (High effort) subagents:
1. **Sanity Verification**: `npx tsc --noEmit` validating full type safety across 3,142 application modules and `npm run lint` enforcing ESLint compliance (`--max-warnings 0`).
2. **Smoke Verification**: `npm run build:verify` (`tsc --noEmit && vite build --minify false --target esnext`) validating bundle generation, chunking, and asset integrity.
3. **Multi-Agent Portal Verification**:
   - **Agent 1 (Public, Interviewer & Employee Portals, Pages 1–21)**: 138 tests passed, 0 failures.
   - **Agent 2 (RSP Recruitment, Selection & Placement, Pages 28–40)**: 468 tests passed, 0 failures.
   - **Agent 3 (Super Admin, L&D, PM & Office Head Console, Pages 22–27, 41–51)**: 177 tests passed, 0 failures.

## Steps

### Phase 1: Public & Applicant Portal (Pages 1–7)
1. **P1 — Landing Page (`/`)**: Verified hero loop, live vacancies table, plantilla slot filtering (`LandingPage.vacancies.test.tsx`).
2. **P2 — About Page (`/about`)**: Verified mission/vision static layout and token adherence.
3. **P3 — Job Portal (`/job-portal`)**: Verified vacancy search, department filters, and responsive cards (`JobVacanciesPanel.test.tsx`).
4. **P4 — Job Details (`/job-details/:jobId`)**: Verified plantilla breakdown, qualification standards, and apply link (`JobDetailsPage.plantillas.test.tsx`).
5. **P5 — Applicant Wizard (`/apply`)**: Verified CS Form 212 6-step form validation, encrypted upload staging (`formPages.test.ts`).
6. **P6 — Application Status Tracker (`/track`)**: Verified application lookup, timeline stepper, and document re-upload (`ApplicationStatusPage.test.tsx`).
7. **P7 — Session Expired Guard (`/session-expired`)**: Verified expired token purge and clean redirect.

### Phase 2: Interviewer Portal (Pages 8–11)
8. **P8 — Interviewer Login (`/interviewer/login`)**: Verified PIN credential auth and active rater revocation polling (`InterviewerLogin.test.tsx`).
9. **P9 — Interviewer Dashboard (`/interviewer/dashboard`)**: Verified assigned vacancies counter and schedule summary.
10. **P10 — Scheduled Applicants List (`/interviewer/applicants`)**: Verified filtered roster showing scheduled candidates only (`InterviewerApplicantsList.dedupe.test.ts`).
11. **P11 — Applicant Evaluation Form (`/interviewer/evaluate/:id`)**: Verified rubric scoring, inline evidence modal, score tabulation.

### Phase 3: Employee Self-Service Portal (Pages 12–21)
12. **P12 — Employee Login (`/employee/login`)**: Verified dual-source auth and per-tab session isolation (`EmployeeLoginPage.test.tsx`).
13. **P13 — Initial Password Reset (`/employee/set-password`)**: Verified forced reset gate on first login.
14. **P14 — Employee Dashboard (`/employee/dashboard`)**: Verified profile hydration, pending cycle banner, quick nav.
15. **P15 — PDS Profile (`/employee/profile`)**: Verified CS Form 212 multi-step persistence and experience calculations (`PdsStepList.test.tsx`, `PersonalDataSheetSection.savedSections.test.ts`).
16. **P16 — Individual Development Plan (`/employee/idp`)**: Verified target competencies and intervention commitments (`idpAnalytics.test.ts`).
17. **P17 — IPCR Employee Workspace (`/employee/ipcr-workspace`)**: Verified Core/Strategic/Support target entry and Q/E/T score calculations.
18. **P18 — New Entrants Tracker (`/employee/new-entrants`)**: Verified induction milestone tracker.
19. **P19 — Training History & Catalog (`/employee/trainings`)**: Verified 2-seminar annual progress meter and certificates (`trainingCompliance.test.ts`, `courses.test.ts`).
20. **P20 — Performance Archive (`/employee/archive`)**: Verified past semester calibrated IPCR records.
21. **P21 — Account Settings (`/employee/account`)**: Verified credential and contact management.

### Phase 4: Super Admin & System Administration Portal (Pages 22–27)
22. **P22 — Admin Central Login (`/admin/login`)**: Verified Supabase Auth handshake and role-based redirect.
23. **P23 — Super Admin Overview (`/admin?module=dashboard`)**: Verified cross-module summary metrics.
24. **P24 — Supervisor Access Console (`/admin/supervisors`)**: Verified department head access assignment and office mapping.
25. **P25 — System Administration Console (`/admin/system-admin`)**: Verified user role toggles, audit log, tabbed back-nav (`SystemAdministrationPage.back.test.tsx`).
26. **P26 — Salary Grades Schedule Manager (`/admin/salary-grades`)**: Verified DBM SSL schedule and step rates (`SalaryGradesPage.test.tsx`, `salaryGrades.test.ts`).
27. **P27 — Admin Settings (`/admin/*/settings`)**: Verified system theme and session timeout configuration.

### Phase 5: Recruitment, Selection & Placement (RSP) Portal (Pages 28–40)
28. **P28 — RSP Central Dashboard (`/admin/rsp`)**: Verified funnel KPIs and selective route data loading (`RSPDashboard.dataLoading.test.tsx`, `RspDashboardOverview.test.tsx`).
29. **P29 — Job Postings Manager (`/admin/rsp/jobs`)**: Verified vacancy vs position tabs, multi-plantilla creation (`JobPostingsPage.tabs.test.tsx`).
30. **P30 — RSP Job Details Drill-Down (`/admin/rsp/job/:jobId`)**: Verified applicant list per vacancy and edit forms (`JobDetailsPage.edit.test.tsx`).
31. **P31 — Master Applications List (`/admin/rsp/applications`)**: Verified position filter and status updates (`ApplicationsListPage.test.tsx`).
32. **P32 — Qualified Applicants Review (`/admin/rsp/qualified`)**: Verified QS screening and panel endorsement (`QualifiedApplicantsSection.documents.test.tsx`).
33. **P33 — Applicant Detailed Evidence (`/admin/rsp/applicant/:id`)**: Verified decrypted evidence viewer and history preservation (`ApplicantDetailsPage.back.test.tsx`, `DocumentPreviewModal.test.tsx`).
34. **P34 — Applicant Scoring & Ranking (`/admin/rsp/applicant-score`)**: Verified exam and interview score aggregation (`ApplicantRankingPage.back.test.tsx`, `examTotalPoints.test.ts`).
35. **P35 — For Hiring Plantilla Endorsement (`/admin/rsp/for-hiring`)**: Verified scored-only filter and slot assignment (`ForHiringPage.scored.test.tsx`, `ForHiringPage.load.test.tsx`, `ForHiringPage.back.test.tsx`).
36. **P36 — Newly Hired Processing (`/admin/rsp/new-hired`)**: Verified CS Form 33 generation and onboarding status (`NewlyHiredPage.back.test.tsx`).
37. **P37 — Onboarding Credentials (`/admin/rsp/credentials`)**: Verified batch credential creation and email templates (`GenerateCredentialsPage.test.tsx`).
38. **P38 — Rater Management (`/admin/rsp/raters`)**: Verified interviewer toggle and instant rater activation sync (`RaterManagementPage.test.tsx`, `raterAccounts.test.ts`).
39. **P39 — Succession Planning Engine (`/admin/rsp/succession`)**: Verified Reviewed Scoring V2, 9-box matrix, automatic fallback (`SuccessionPlanningPage.v2.test.tsx`, `successionScoringV2.test.ts`).
40. **P40 — Gap Analysis Reports (`/admin/rsp/reports`)**: Verified bench vulnerability score and shortage warnings (`CriticalPositionGapAnalysisPage.test.tsx`).

### Phase 6: Learning & Development (L&D) Portal (Pages 41–44)
41. **P41 — L&D Dashboard (`/admin/lnd`)**: Verified annual training progress KPI and office breakdown (`trainingProgress.test.ts`).
42. **P42 — Training Directory & Enrollment (`/admin/lnd/manage`)**: Verified course creation and batch enrollment (`SeminarEnrollment.test.tsx`).
43. **P43 — TNA & Competency Gap Console**: Verified training needs analysis scoring (`trainingRecommendationScoring.test.ts`).
44. **P44 — L&D Archive**: Verified historical certifications and office drill-down back-navigation (`LndArchive.back.test.tsx`).

### Phase 7: Performance Management (PM) Portal & Office Head Console (Pages 45–51)
45. **P45 — PM Executive Dashboard (`/admin/pm`)**: Verified cycle submission rate and O/VS/S/U/P distribution (`PmDashboardOverview.test.tsx`).
46. **P46 — IPCR Cycle Management (`/admin/ipcr`, `/admin/pm/manage`)**: Verified phase opening, employee notification, submission locking (`PMIPCRManagement.back.test.tsx`).
47. **P47 — Competency Framework (`/admin/competency`)**: Verified competency rubric configuration (`CompetencyFrameworkPage.test.tsx`).
48. **P48 — Summary of Ratings (SOR)**: Verified department roll-up, publication roster, calibration overrides (`SummaryOfRatings.test.ts`, `SummaryOfRatings.back.test.tsx`).
49. **P49 — PM Performance Archive**: Verified signed IPCR forms and archived cycles (`PMArchive.back.test.tsx`).
50. **P50 — Office Head Console (`/office/dashboard`)**: Verified department head endorsement and submission verification (`OfficeAccountConsole.back.test.tsx`).
51. **P51 — IPCR Demo Sandbox (`/pm-demo`)**: Verified self-contained mock workflow demo (`demoReview.back.test.tsx`).

## Risks

- **Offline Seeder Script Integration**: `scripts/seed-training-attendance.test.mjs` test 5 attempts an unmocked live network socket to `127.0.0.1:54321`. Recommended to guard with `it.skipIf(!process.env.RUN_DB_TESTS)` in environments without active backend containers.
- **Session Expiry Divergence**: Admin Supabase token and localStorage portal sessions lapse on different clocks; managed by `useSupabaseAuthState` in `App.tsx`.
- **Rater Revocation Latency**: Handled by active 3s window-focus polling in `AppContent`.

## Checks to run

- `npx tsc --noEmit` (Passed: 0 errors)
- `npm run lint` (Passed: 0 warnings, 0 errors)
- `npm run build:verify` (Passed: 3,142 modules transformed, 0 bundle errors)
- `npx vitest run` (Passed: 120 / 120 application suites, 1,085 passed tests)
- `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`

## Status check 2026-11-14

Done, as a record of what passed on 2026-10-28 (`3b00d53`), not a current certification. Many merges have landed since. The pass counts above were not reproduced. The 2026-11-12 audit ran the checks again on `cd71e17`: `npx tsc --noEmit` clean, and `npx vitest run` passed 635 files and 5,479 tests. The open risk above still stands: `scripts/seed-training-attendance.test.mjs` opens a live network connection with no skip guard. It passed on 2026-11-12 but failed in another worktree. See `docs/session-summaries/2026-10-28-page-by-page-rollout-summary.md`.
