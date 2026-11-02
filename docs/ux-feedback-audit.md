# Loading and error feedback audit

Task 2, Step A (docs/plans/2026-10-26-loading-and-error-states.md). Every place in `src/` that fetches data or performs an action, with its loading state, its error state, and whether failures reach the user. Built on 2026-10-26 from a read-only sweep of `main`; line numbers are approximate and drift as files change.

**Status** is updated as each module is fixed:
- **Open**: not yet fixed.
- **Fixed**: the site now shows a pending state, reports success where it matters, and on failure says what went wrong, whether it completed, and what to do next.
- **Fixed (Jayyoo07)**: fixed in Jayyoo07's first slice of docs/plans/2026-10-26-loading-and-action-feedback.md (auth, applicant, employee, interviewer).
- **Tracked**: left as is, with the reason.

Short forms used in the tables:
- **lib-[]**: the lib function catches the error, `console.error`s it, and returns `[]`, `null` or `{data: []}`. The UI cannot tell "no data" from "failed".
- **opt**: optimistic UI update. The UI changes first, and the persist result is ignored.
- **sb-noreject**: supabase-js returns `{error}` instead of throwing. A bare `try { await sb.from().update() } catch {}` therefore never catches a DB error, and the `{error}` is never read.
- **raw msg**: the raw `error.message` (Postgres or Supabase text) is shown to the user.

## 0. Cross-cutting findings

These affect many rows below.

1. **No global error layer.**
   - There is no `unhandledrejection` handler. `ErrorBoundary` only catches render errors and logs them.
   - `ErrorBanner` and `friendlyError` (which hides technical text) are used in only 4 files: `RSPDashboard` (office directory), `OfficeDirectorySection`, `PMCompetencyFramework` and `PMPromotionalApplications`. Everywhere else shows raw text or nothing.
   - `logErrorForAdmin` is used only in `ApplicantWizard`.
2. **The lib layer converts failures into empty results.** Examples are `listPipeline`, `listCalendarEvents`, `listCourseDrafts`, `listOfficeRequests`, `getNewlyHiredFromSupabase`, `fetchArchivedApplicants`, `fetchReservedApplicants`, `fetchActiveInterviewers`, `getEmployeeArchive`, `listArchiveEmployees`, `getEvaluationsWithEmployee`, `getDocumentRequests`, `getEmployeeCompetencies`, `fetchHiringContext`, `fetchOtherOpenApplications`, `listActiveVacancies`, `fetchSlotsByJobPosting`, `fetchApplicantSlotLinks`, `fetchSlotApplicantCounts`, `listNotifications` and `listAttendance`. Callers using `.data` or the plain array render an empty table on failure. Several `{success:false,data:[]}` returns (PMDashboard and others) are also ignored by their callers.
3. **Job-posting persistence failures are invisible.** `saveJobPostings` and `saveJobPostingsAndWait` (`lib/recruitmentData.ts:531`) never reject. On failure they dispatch `cictrix:job-postings-persist-failed`, and nothing in `src/` listens for it. Every "created/updated" toast after a posting save is therefore unconditional. `loadJobPostings` overwrites the cache with `[]` on failure and stores the error in `getJobPostingsLoadError()`. Only `LandingPage` reads that.
4. **Scores that are localStorage-only.** The RSP applicant-score modals (`QualifiedApplicantsSection`, `ApplicantDetailsPage.handleSaveScoreSetup`) save to localStorage (`EXAM_KEY`, `CAT_KEY`, `SCORE_*`). `ForHiringPage` reads the same keys. They are not shared across browsers or admins. "Saving…" is a fake `setTimeout(300)`.
   - *Update 2026-10-30:* `QualifiedApplicantsSection` now saves to `applicant_category_scores` before it finalizes, and For Hiring and Ranking read that table (`docs/plans/2026-10-30-promotional-hiring-fixes.md`, Tasks 2–3). `ApplicantDetailsPage.handleSaveScoreSetup` can't be reached (`showViewScoresButton = false`) and also writes the missing `applicants.total_score` column. Removing it is Step 1 of `docs/plans/2026-10-30-applicant-status-and-score-writes.md`.
5. **Fake "success" with no backend.**
   - `SettingsPage` password update, notification toggles and profile save never call the server.
   - `sendTrainingEnrollmentEmail` (`lib/api/trainingEmail.ts`) is a stub: `console.info` plus `{ok:true}`. `TrainingEnrollmentEmailModal` then shows "Sent to N recipients".
   - `OfficeAccountConsole` has local-state-only "transmit to PM vault", "override rating" and "compile DPCR/OPCR" actions.
6. **Employee portal passwords.**
   - They are stored plaintext in the `employee_portal_accounts` row and in localStorage.
   - Writes go through the fire-and-forget `upsertPortalAccountToSupabase`. A failure only produces a `console.error`. The credentials are shown or printed anyway.
   - `changeEmployeePortalPassword` and `changeEmployeePortalUsername` (`EmployeePage` and `SetInitialPasswordPage`) only update localStorage. They do not update Supabase. The success message says "use the new password next time".
7. **Misleading hard-coded error text.** `lib/email.ts` network failure says "The resubmission notice has been recorded in the tracker." That text is shown for every caller. `ChangePositionModal` shows "Employee records table not yet available" for any update error.
8. **Misleading login errors.** `LoginPage`, `InterviewerLogin` and `handleEmployeeLogin` show "Invalid email/username or password" for network or server failures too.
9. **Boot-time background writers.** `main.tsx` runs `syncHiredApplicantStatus`, `syncNewlyHiredToEmployees` and `repairDefaultedEmployeeRecords` on every page load, including anonymous public pages. They write to `applicants` and `employees` using the anon key. All failures are `console.warn` or swallowed (16 empty catches in `lib/hiredApplicantSync.ts`).
10. **FastAPI backend.** `fetch('/api/...')` is used in `QualifiedApplicantsRSPPage`, `ForHiringPage`, `ApplicantRankingPage`, `InterviewerDashboard`, `lib/email.ts`, `lib/api/competencyMatching.ts`, `lib/api/employeesApi.ts` (hireApplicant) and `lib/api/employeeApplicationProfile.ts`. A code comment says the backend "currently 500s". Failure usually falls back to Supabase silently.
11. **Polling.**
    - 3s: interviewer access check (`App.tsx:336`).
    - 5s: demo workflow, notification bell and supervisor review.
    - Fixed `POLL_MS`: `OfficeTrainingCourses` (twice) and `MyTrainingsSection`.
    - `PHASE_GATE_POLL_MS`: `EmployeePage`.
    - Realtime channels via `hooks/useRealtimeRefresh.ts` in many pages.
    - Poll failures are silent everywhere.
12. **PDF and export.**
    - `lib/ipcrPdf.ts` (`generateIpcrPdf`, jsPDF, synchronous) is used only in `EmployeePage.tsx:842`.
    - CSV downloads: `RSPDashboard:3050`, `PMReportsAnalytics:205`, `LNDDashboard:344`. All are synchronous.
    - Print via `window.print()` / `window.open` + print: `RSPDashboard` ×3, `NewlyHiredPage`, `QualifiedApplicantsPage` ×2, `PMReportsAnalytics`, `LndTrainingEvaluation.exportReport`, `ApplicantRankingPage.handlePrint`, `lib/hiringFlow.printCredentialCards`.
13. **Dead or unrouted code.** `modules/admin/AdminLogin.tsx` is not routed. It sets `cictrix_admin_auth` for any non-empty email and password. `contexts/AuthContext.tsx` is never mounted, so `RoleBasedSidebar` and `RoleDashboard` are effectively dead. `lib/notifications.ts` `useDivisionNotifications` has no consumer. `/prototype/training-courses` has no async.

## 1. RSP (Recruitment, Selection and Placement)

| Module | File:line | What | Loading? | Error state? | Surfaced | Notes | Status |
|---|---|---|---|---|---|---|---|
| RSP | modules/admin/RSPDashboard.tsx:1208-1510 | Main load: `job_postings`, `jobs`, `applicants`, `raters`, `evaluations` via `Promise.allSettled`, plus `getJobPostingsFromSupabase`. Re-runs on focus, storage and custom events. | no (no state for the main load) | no | logged only (`console.log '✗ Evaluations fetch failed'`) | Rejected or errored parts become empty lists (`setRaters([])`, `setCompletedEvaluationIds(new Set())`). Falls back to `mockDatabase` (1255) and to localStorage jobs when Supabase returns 0 jobs (1262), so an outage is masked by local or mock data. | Fixed: a failed live read shows an error with Retry and says the page may show sample data (the mock fallback stays) |
| RSP | RSPDashboard.tsx:552-600 | `runRaterEmailUpdate` / `verifyRaterAccessState` helper selects and updates on `raters` | n/a | throws | caller-dependent | Builds "no matching rater" Errors. Callers swallow them (see 2820, 2926). | Tracked: only called by RSPDashboard's unreachable rater section; the live Raters page is row 83 |
| RSP | RSPDashboard.tsx:881 | `fetchArchivedApplicants` for Reports > Not Selected | yes (`notSelectedLoading` → `NotSelectedArchive`) | no | swallowed in lib | lib-[]. `.then` has no catch. An empty archive looks like "none". | Tracked: `fetchArchivedApplicants` has no callers left (Archives moved to RspArchives) |
| RSP | RSPDashboard.tsx:966-980 | `openResetPwModal`: portal account lookup (Supabase) + `getLastEmployeePasswordReset` | no | no | swallowed in lib | No try/catch. A failure leaves `lastResetInfo` blank. | Tracked: only the informational "last reset" line; the reset itself reports its outcome (row 5) |
| RSP | RSPDashboard.tsx:1008-1118 | `handleResetEmployeePasswordConfirm`: new plaintext password, `upsertEmployeePortalAccount`, `logEmployeePasswordReset` | yes (`resetPwState='working'`) | yes (`resetPwError`, rendered 6739) | raw msg | Shows success even when the Supabase upsert failed (fire-and-forget, console only). The "verify" step checks only localStorage. The audit-log failure is a `console.warn`. | Fixed: waits for the database copy; a failed save says the new password can't be used yet |
| RSP | RSPDashboard.tsx:1129 | `copyResetPwValue` (clipboard) | no | no | logged only (`console.warn`) | The user is not told the copy failed. | Fixed: success notice; a blocked clipboard says to copy by hand |
| RSP | RSPDashboard.tsx:1702 | `getNewlyHiredFromSupabase` (exclude already-hired from ranking) | no | no | swallowed in lib | lib-[]. A failure means hired people may reappear as hireable. | Tracked: feeds the Ranking Report, which no screen opens |
| RSP | RSPDashboard.tsx:1990-2030 | `listEmployeeDocumentsByType` (Reports > Documents) | yes (`documentsLoading` + delayed skeleton) | yes (`documentsError` banner 4820) | raw msg ("Could not fetch employee_documents (...)") | Good pattern, but the raw Supabase text is exposed. | Fixed: friendly message, raw text in the console |
| RSP | RSPDashboard.tsx:2220 | `getEmployeeRecordsFromSupabase` (directory fallback) | no | no | swallowed in lib | lib-[]. | Tracked: fallback source; the primary directory read (row 11) reports failures |
| RSP | RSPDashboard.tsx:2238-2258 | `employees` select for profile fields | no | no | swallowed (`if (cancelled \|\| error \|\| !Array.isArray(data)) return`) | A failure leaves the employee profile panel blank. | Tracked: optional profile fields; core details come from the directory read |
| RSP | RSPDashboard.tsx:2364-2376 | `getOfficeDirectory` (Accounts) | yes (`officeDirectoryLoading` + delayed skeleton) | yes (`ErrorBanner context=server`, 3708) | friendly | The only RSPDashboard path using `ErrorBanner`. No retry button. | Fixed: Retry added to the existing ErrorBanner |
| RSP | RSPDashboard.tsx:2688-2757 | `handleCreateJob` → `persistDashboardJobsToRecruitment` → `saveJobPostings` (background upsert) | no | no | swallowed (see §0.3) | opt. Dialog closes and the job shows regardless of the DB result. No disable or busy state. | Tracked: unreachable (/admin/rsp/jobs renders JobPostingsPage, rows 61-69) |
| RSP | RSPDashboard.tsx:2758-2772 | `handleDeleteJob`: 4 deletes via `Promise.allSettled` | no | no | swallowed | opt. Results are never inspected. Empty `catch {}`. | Tracked: unreachable, as row 12 |
| RSP | RSPDashboard.tsx:2774-2790 | `handleToggleJobStatus`: 4 updates via `allSettled` | no | no | swallowed | opt. Empty `catch {}`. | Tracked: unreachable, as row 12 |
| RSP | RSPDashboard.tsx:2801-2835 | `handleCreateRater` (save rater access and assigned positions) | no | no | logged only (`console.warn`) | opt. Dialog closes either way. | Tracked: unreachable (/admin/rsp/raters renders RaterManagementPage, rows 81-83) |
| RSP | RSPDashboard.tsx:2899-2909 | `handleDeleteRater` | no | no | swallowed | opt. The delete `{error}` is unread. Empty `catch {}`. | Tracked: unreachable, as row 15 |
| RSP | RSPDashboard.tsx:2915-2935 | `handleToggleRaterAccess` | no | no | swallowed | opt with rollback on failure, but no message to the user. Empty-ish `catch {}`. | Tracked: unreachable, as row 15 |
| RSP | RSPDashboard.tsx:3050-3075 | `triggerDocumentDownload` (staggered `downloadEmployeeDocument`, or CSV Blob fallback) | no | no | logged only | The lib falls back to `window.open` if fetch fails. `void` calls, no busy state. | Fixed: in-progress notice for multi-file downloads; a failed file opens in a tab (existing fallback) |
| RSP | RSPDashboard.tsx:3101-3220 | `handleConfirmHireApplicants`: `getNewlyHiredFromSupabase`, `saveNewlyHired` (not awaited), `hireApplicant` per applicant (FastAPI then client fallback) | no | no | logged only (`console.warn "not all hire status updates persisted"`) | Modals close and applicants are marked Hired locally even if `hireApplicant` fails. Button not disabled, so double-submit is possible. `id: hire-{id}-{ts}` creates duplicate `newly_hired` rows. | Tracked: hire modal of the Ranking Report, which no screen opens |
| RSP | RSPDashboard.tsx:3277-3328 | `handleSendBulkRequest` (`sendEmail`) | yes (`bulkRequestSending`, buttons disabled) | yes (`bulkRequestError`, 6579) | raw msg (backend `detail` or the misleading network text from §0.7) | Good state handling. | Fixed: success notice; failure is the friendly three-part message |
| RSP | RSPDashboard.tsx:4812, 5157, 5435 | `window.print()` report buttons | n/a | n/a | n/a | Synchronous. | n/a |
| RSP | components/QualifiedApplicantsPage.tsx:533-835 | `loadQualifiedApplicantsData`: `applicants`, `evaluations`, `applicant_attachments`, `job_postings` (`allSettled`; falls back to `mockDatabase` only when the applicants fetch fails). Also `saveApplicants` to localStorage. | partial (`initialLoad` skeleton on first load only) | no | logged only | Errored results become `[]`. Refreshes on focus and events with an in-flight guard. | Tracked: QualifiedApplicantsPage is not rendered anywhere |
| RSP | QualifiedApplicantsPage.tsx:468-505 | `handleSendApplicantEmail` | yes (`emailSending`) | yes (`emailError`) | raw msg | | Tracked: unreachable, as row 22 |
| RSP | QualifiedApplicantsPage.tsx:1040-1195 | Confirm hires: `hireApplicant` per row, `upsertEmployeePortalAccount`, fire-and-forget `sendEmail` of credentials | no (modal closes in `finally`) | partial | toast "Failed to hire: <names>" or generic "An error occurred... check logs"; credentials email failure is console only | Cause hidden. No disable, so double-click is possible. Navigates to new-hired even on partial failure. | Tracked: unreachable, as row 22 |
| RSP | QualifiedApplicantsPage.tsx:1250-1340 | Qualify / disqualify status write (`applicants.update`) | no | no | logged only (console.error with full detail) | opt. Toast "Status updated" fires before persistence. On failure it still runs `saveApplicants(nextApplicants)` locally, so UI and local store say updated while the DB is not. Buttons are locked (`statusDecisionLocked`) immediately. | Tracked: unreachable, as row 22 |
| RSP | QualifiedApplicantsPage.tsx:1440-1460 | `handleApproveDoc` (insert `doc_validated` into `applicant_attachments`) | no | no | logged only | opt. Review state is in localStorage (`DOC_REVIEW_KEY`). A failure means the applicant never sees "Verified". | Tracked: unreachable, as row 22 |
| RSP | QualifiedApplicantsPage.tsx:1470-1495 | `handleRequestResubmission` (insert `resubmission_request`) | no | no | logged only | opt. No email is sent from here. | Tracked: unreachable, as row 22 |
| RSP | QualifiedApplicantsPage.tsx:1538-1595 | `fetchApplicantAttachments` (primary, then secondary mock) | yes (`attachmentsLoading`) | no | swallowed (`catch → []`) | Looks like "no documents". | Tracked: unreachable, as row 22 |
| RSP | QualifiedApplicantsPage.tsx:205-226, 1706-1790 | `resolveStorageOrDirectUrl` (signed URL then public URL) and `resolveDocumentForApplicant` | n/a | no | swallowed | Two empty catches. Returns null. | Tracked: unreachable, as row 22 |
| RSP | QualifiedApplicantsPage.tsx:1793-1808 | `handlePreviewDocument` | yes (`documentActionBusy`) | partial | toast "Unable to preview..." (generic) | | Tracked: unreachable, as row 22 |
| RSP | QualifiedApplicantsPage.tsx:1810-1835 | `handleBulkDownload` (sequential resolve + anchor click) | no | no | toast count only | No try/catch or busy state. A thrown error is unhandled. | Tracked: unreachable, as row 22 |
| RSP | QualifiedApplicantsPage.tsx:2844, 2849 | `window.print()` | n/a | n/a | n/a | | Tracked: unreachable, as row 22 |
| RSP | components/QualifiedApplicantsRSPPage.tsx:66-190 | `loadData`: `applicants` (Supabase, else `fetch('/api/applicants/')`) + `evaluations` ×2 sources; `subscribeToEvaluationChanges`; `useRealtimeRefresh('applicants')` | yes (`loading` → children skeleton) | no | logged only | `catch` only does `console.error`, then `setLoading(false)` with empty state ("no applicants"). | Fixed: a failed load shows an error with Retry instead of an empty list |
| RSP | components/QualifiedApplicantsSection.tsx:355-363, 1086-1092 | Open a document: `storage.createSignedUrl` | no | no | swallowed | If there is no signedUrl and no error, nothing happens. On exception it opens the raw storage key as a URL (broken page). | Fixed: a failed link or blocked pop-up is reported; no more opening the raw storage path |
| RSP | QualifiedApplicantsSection.tsx:440-456, 1558-1576 | `ExamScoresModal.handleSave` ("Save") | simulated (`setTimeout 300`) | no | n/a | **localStorage only** (`EXAM_KEY`). No Supabase write. | Tracked: saves to this browser by design (localStorage store); see the Task 1 plan |
| RSP | QualifiedApplicantsSection.tsx:723-730, 1579-1582 | Applicant score modal "Save Scores" | simulated (300ms) | no | n/a | **localStorage only** (`CAT_KEY`). `isFinalized` is set locally. | Tracked: as row 35 |
| RSP | QualifiedApplicantsSection.tsx:629-650 | `fetchLatestEvaluationForApplicantOrEmailAnySource` + subscription | no | no | swallowed in lib | | Tracked: background refresh of the score modal; the page load (row 33) reports failures |
| RSP | QualifiedApplicantsSection.tsx:681-695 | Load `applicant_attachments` for the modal | yes (`loadingFiles`) | no | swallowed (`{data}` only; `catch → []`) | | Fixed: a failed attachment load reads "couldn't load", not "0 files" |
| RSP | components/PendingAssignmentList.tsx:132-136 | `fetchActiveInterviewers` (`raters`) + `cictrix:raters-updated` | no | no | logged only in lib (`console.error`, returns `[]`) | The interviewer dropdown is silently empty on failure. | Fixed: the interviewer picker says when the list couldn't load |
| RSP | PendingAssignmentList.tsx:257-285 | `handleEditSave` → `saveApplicantAssignment` | yes (`editSaving`) | yes (`editError`) | raw msg (`error.message`) | Also writes a local schedule cache. | Fixed: friendly message from the service layer |
| RSP | components/ScheduleApplicantsModal.tsx:140-175 | `handleConfirm` → `scheduleApplicantsBatch` | yes (`saving`, button disabled, ESC and backdrop blocked) | yes (`error`) | raw msg plus a friendly count-mismatch message | Good. | Fixed: friendly message from the service layer |
| RSP | components/ApplicantRankingPage.tsx:60-95 | Load applicants (`fetch('/api/applicants/?limit=5000')` then Supabase) | yes (`loading`, `LoadingStatus`) | no | swallowed (`catch → []`) | Two silent fallbacks, so a total failure looks like "no applicants". | Tracked: ApplicantRankingPage is not rendered (route redirects to For Hiring) |
| RSP | ApplicantRankingPage.tsx:158-245 | `handleMarkForHiring`: per applicant Supabase update + `fetch PATCH /api/applicants/:id/status` + local mirror | yes (`hiring` flag) | no | swallowed (empty catches ×3 at 175/185/197) | Update errors are never read (sb-noreject). The toast "N applicant(s) marked for hiring" is shown regardless. | Tracked: unreachable, as row 42 |
| RSP | ApplicantRankingPage.tsx:250+ | `handlePrint` (`window.open` + print) | n/a | n/a | silent if popup blocked (`if (!win) return`) | | Tracked: unreachable, as row 42 |
| RSP | components/ForHiringPage.tsx:135-420 | `load`: `job_postings`, `evaluations`, `getNewlyHiredFromSupabase`, `fetch('/api/applicants/?limit=5000')` then Supabase `applicants`, `fetchHiringContext`, `buildCompletedSet` | yes (`useTableLoading` skeleton) | no | swallowed (9 empty catches) | Each source fails independently and silently. The list can be empty or incomplete with no indication. | Fixed: a failed applicant read shows an error with Retry; the empty state is hidden |
| RSP | ForHiringPage.tsx:490-500 | `handleSelectClick` → `fetchOtherOpenApplications` | yes (`selectStep='loading'` in modal) | no | swallowed in lib | A failure is treated as "no other applications", so the notice step is skipped. | Fixed: "couldn't check other applications" is shown instead of skipping the notice |
| RSP | ForHiringPage.tsx:506-525 | `handleConfirmSelect` → `reserveSlotForApplicant` (RPC) | yes (`reserving`, button disabled) | yes (`selectError`) | raw msg | | Fixed: friendly message |
| RSP | components/NewlyHiredPage.tsx:53-195 | `load`: `applicants.select('*')`, `newly_hired.select('*')` (focus, visibility, events) | yes (`initialLoad` skeleton) | no | logged only | Both `error`s are ignored; `catch` does `setRows([])`. | Fixed: a failed load shows an error with Retry and keeps the rows already shown |
| RSP | NewlyHiredPage.tsx:260-330 | `generateCredentials`: `createEmployeeNumberAllocator` (lib warns), `upsertEmployeePortalAccount` | no | no | `alert()` only for the "none selected" case | No try/catch, so a thrown error is unhandled. | Fixed: allocator failure reported; alert() replaced with a notice |
| RSP | NewlyHiredPage.tsx:336-405 | `saveAccountDetails`: portal-account upserts, `seedEmployeeContactFromApplication`, `saveNewlyHired` | yes (`savingCredentials`) | yes (`saveError`) | raw msg | The upsert is fire-and-forget and `saveNewlyHired` swallows, so success is reported even if the DB write failed. | Fixed: waits for each account and the Newly Hired rows; says how many saved |
| RSP | NewlyHiredPage.tsx:624 | `window.print()` | n/a | n/a | n/a | | n/a |
| RSP | components/GenerateCredentialsPage.tsx:59-71 | `fetchReservedApplicants` | yes (`loading`) | no | swallowed in lib | | Fixed: a failed load shows an error with Retry; the empty state is hidden |
| RSP | GenerateCredentialsPage.tsx:104-116 | `handleGenerate` → `generateEmployeeCredentials` (`hireApplicant`, `assignApplicantToSlot` RPC, portal account, `sendEmail`, `saveNewlyHired`) | yes (`generating`, button disabled) | partial | message only if zero succeeded; `failures[]` listed per row | `sendEmail` and `saveNewlyHired` failures are swallowed (`emailSent=false` shown as "print instead"). | Fixed: each hire step's failure is listed in plain language, including account and Newly Hired saves |
| RSP | GenerateCredentialsPage.tsx:119-130 | `handleRevoke` → `revokeSlotReservation` (RPC) | yes (`revoking`) | yes (`error`) | raw msg | | Fixed: friendly message |
| RSP | lib/hiringFlow.ts:416 (`printCredentialCards`) | Credential cards printed through `window.open` | n/a | n/a | silent | | Fixed: a blocked print window is reported |
| RSP | components/SalaryGradesPage.tsx:107-117 | `listSalaryGrades` | yes (delayed loader) | yes (`error`) | raw msg | | Fixed: friendly message |
| RSP | SalaryGradesPage.tsx:362-377 | Count affected `job_postings` / `plantilla_slots` | no | partial | handled: count stays null and the warning says "unavailable" | Good handling. Empty catch is intentional. | n/a (already handled) |
| RSP | SalaryGradesPage.tsx:383-407 | `save`: sequential `updateSalaryStep` / `addSalaryStep` / `deleteSalaryStep`, then reload | yes (`saving`) | yes (`saveError` "Step N was not saved: <raw>") | raw msg | Stops at the first failure and leaves a partial save (reloaded to show the real state). | Fixed: names the step, says later steps are unchanged, friendly reason |
| RSP | components/EligibilityPointsPanel.tsx:34-125 | `listEligibilityTypes`, `upsertEligibilityType`, `setPointsForFullMarks`, `deleteEligibilityType` | yes for load (`loading`) and per row (`savingId`) | yes (`error` banner 141) | raw msg | `saveCap` (onBlur), `addType` and `removeType` have no busy state. | Fixed: friendly messages; add, remove and cap now block a second click |
| RSP | components/SalaryGradeSelect.tsx:50-62 | `listSalaryGrades` (when no `table` prop) | yes (select disabled) | yes (`error`, 96) | raw msg | | Fixed: friendly message |
| RSP | components/JobPostingsPage.tsx:223 | `listSalaryGrades` (`.then`) | no | no | swallowed | An empty salary table leaves the grade picker empty. | Tracked: list-level salary lookup; the grade picker (row 60) reports its own failure |
| RSP | JobPostingsPage.tsx:253-470 | `resolveLiveApplicants`: `applicants.select('*')`, then the mock fallback, plus `fetchApplicantSlotLinks` | no | no | logged only | | Tracked: background merge of the open applicant list; counts (row 63) report failures |
| RSP | JobPostingsPage.tsx:508-535 | `loadAllApplicants` (per-card applicant counts and list) | no | no | logged only; `setAllApplicantsRaw([])` | Counts silently drop to 0. | Fixed: a failed load shows an error with Retry; counts are no longer silently 0 |
| RSP | JobPostingsPage.tsx:470-478, 496-499 | `useRealtimeRefresh` → `loadJobPostings`; `listActiveVacancies` | no | no | swallowed | "Date Opened" blank on failure. | Fixed: job list load error is shown with Retry (getJobPostingsLoadError); Date Opened stays blank on failure |
| RSP | JobPostingsPage.tsx:692-700 | `fetchSlotApplicantCounts` | no | no | swallowed | Used to block plantilla removal. A failure means 0 and removal looks allowed. | Fixed: "couldn't check applications" note in the editor; the database still blocks a wrong removal |
| RSP | JobPostingsPage.tsx:895-1030 | `submitForm`: `validateSlots`, `saveJobPostingsAndWait`, `saveSlotsForJob` | yes (`savingJob`) | partial (`slotError`) | friendly or raw slot error | `saveJobPostingsAndWait` never rejects (§0.3). A failed upsert is not reported, and the "created" toast shows. No try/finally, so an exception leaves `savingJob` stuck. | Fixed: a failed save keeps the dialog open with the reason and rolls the list back; slot failures say the position saved |
| RSP | JobPostingsPage.tsx:1033-1052 | `duplicatePosting` | no | partial | toast (raw error appended) | | n/a (duplicatePosting no longer exists) |
| RSP | JobPostingsPage.tsx:1060-1100 | `deleteJobPosting`: confirm, local archive (localStorage), 4 deletes via `allSettled` | no | no | toast "Job post deleted" always | Delete errors are never read. Archiving of applicants is local-only. | Fixed: checks the delete result; a failure is reported and the list reloads |
| RSP | JobPostingsPage.tsx:1104-1130 | `openVacancy` / `confirmCloseVacancy` (RPC `open_vacancy` / `close_vacancy`) | yes (dialog `saving`, button disabled) | yes (toast / `closeError`) | raw msg | | Fixed: friendly messages |
| RSP | components/JobVacanciesPanel.tsx:271-276 | Open-vacancy dialog `submit` | yes (`saving`, disabled) | via parent toast | raw msg | | Fixed: via the parent's friendly notice |
| RSP | components/CloseVacancyDialog.tsx:33-37 | `submit` → `onConfirm` | yes (`saving`, disabled) | yes (`error` prop, 72) | raw msg | | Fixed: via the parents' friendly messages |
| RSP | components/JobDetailsPage.tsx:103-114 | `confirmClose` (RPC close) | via dialog | yes (`closeError`) | raw msg | | Fixed: friendly message |
| RSP | JobDetailsPage.tsx:125-135 | `loadJobPostings().catch(() => undefined)` | partial (`loaded` flag) | no | swallowed | Falls back to cache. | Fixed: a failed load no longer reads as "Job posting not found" |
| RSP | JobDetailsPage.tsx:142-175 | `fetchSlotApplicantCounts`; `applicants` names for filled slots | no | no | swallowed (`error` ignored) | | Tracked: per-plantilla counts and hire names are secondary detail on the page |
| RSP | components/ApplicationsListPage.tsx:125-175 | `load`: `applicants.select('*')`, `fetchApplicantSlotLinks`, `fetchSlotsByJobPosting` | yes (`loading`) | no | swallowed | Destructures `{data}` only, so `error` is ignored. `catch → setApplicants([])`. | Fixed: a failed load shows an error with Retry; the empty row is hidden |
| RSP | ApplicationsListPage.tsx:188 | `loadJobPostings().then` (position title) | partial (`undefined` = looking) | partial (`null` = not found) | swallowed | | Tracked: position title only; the table load (row 75) reports failures |
| RSP | ApplicationsListPage.tsx:286-310 | `removeSelectedFromShortlist` | yes (`removingShortlist`) | no | logged only | sb-noreject. Rows are set to "Under Review" locally regardless. | Fixed: only rows the database accepted move; the rest stay selected with a reason |
| RSP | components/NotSelectedArchive.tsx:14 | Display only | yes (`loading` prop) | no | n/a | Data comes from `fetchArchivedApplicants` (lib-[]). | n/a (display only) |
| RSP | modules/admin/RspDashboardOverview.tsx:135 | `getSuccessionDashboardOverview` | partial ("Loading succession data…" text) | yes (`successionError`, 588) | raw msg | | Fixed: friendly message with Retry |
| RSP | components/SuccessionPlanningPage.tsx:204-232 | `listDepartmentSummaries`; on expand `listCriticalPositions` + `listAutoSuccessors` per position | yes (`loading`, per-dept `loadingDept`) | no | swallowed | `r.ok` false is ignored, so you get an empty list or empty candidates. | Fixed: department, position and candidate failures are each reported, not shown as none |
| RSP | components/RaterManagementPage.tsx:208-310 (route `/admin/rsp/raters`) | `loadRaters`: `raters` + `profiles` from 2 clients, merged | partial (`initialLoad` skeleton) | no | swallowed (`catch → []`) | Also reloads on storage, visibility and custom events. | Fixed: a failed load shows an error row with Retry |
| RSP | RaterManagementPage.tsx:380-410 | `addRater` (insert into `raters`) | yes (`adding`) | yes (`addError`) | raw msg | | Fixed: friendly message |
| RSP | RaterManagementPage.tsx:413-440 | `handleToggleRaterAccess` (`runRaterEmailUpdate` + `verifyRaterAccessState`) | yes (`togglingEmail`) | yes (toast "Failed to update interviewer access.") | friendly | Rolls back. | Fixed: removal and access failures are friendly persistent notices |
| RSP | components/Sidebar.tsx:42 | `getApplicantsFromSupabase` for the "Qualified" badge | no | no | swallowed in lib (returns `[]`, so the `catch` fallback never runs) | The badge shows 0 on failure. | Tracked: sidebar count badge only |
| RSP | hooks/useDepartmentOptions.ts:33, usePlantillaNames.ts:20, useSalarySchedule.ts:21 | Lookup hooks | no | no | logged only | | Tracked: dropdown option lookups; the forms that use them validate on save |

## 2. PM (Performance Management)

| Module | File:line | What | Loading? | Error state? | Surfaced | Notes | Status |
|---|---|---|---|---|---|---|---|
| PM | modules/admin/PMDashboard.tsx:221-246 | `handleSendRequest` → `createDocumentRequest` | no | partial | `alert()` with raw `res.error` | No busy state or disable, so double-send is possible. | Open |
| PM | PMDashboard.tsx:261-283 | `employees_with_department` active-employee list for the bulk modal | no | no | logged only (`console.error`, `[]`) | A failure produces a misleading "No employees match the selected criteria". | Open |
| PM | PMDashboard.tsx:324-376 | `handleBulkSendRequest`: N parallel `createDocumentRequest` | no | partial | `alert("Failed to send N requests. Check console")`, then a second `alert` "sent to X employees" | The modal closes even on failure. No busy state. | Open |
| PM | PMDashboard.tsx:460-478 | `refreshDocumentRequests`; `handleReviewDecision` (approve / reject) | yes (`reviewDecisionPending`, buttons disabled) | partial | `alert(raw error)` | The refresh failure is ignored. | Open |
| PM | PMDashboard.tsx:563-617 | Evaluation groups by department (`getAllEmployees` + `getEvaluationsWithEmployee`) | no | no | swallowed in lib | `[]` on failure. | Open |
| PM | PMDashboard.tsx:630-650 | Evaluations, status counts and distribution (dashboard) | yes (`evaluationsLoading`, table skeleton) | no | swallowed (`data: []`) | `success` flags are ignored, so charts show zero or empty. | Open |
| PM | PMDashboard.tsx:653-664 | `getDocumentRequests` (action queue) | yes (`documentRequestsLoading`) | no | swallowed | | Open |
| PM | PMDashboard.tsx:672-815 | `loadIpcrStats` (`getAllEmployees`, `ipcr_submissions`, `probationary_ipcr_schedules`) | yes (`ipcrLoading`; silent refresh on realtime) | no | logged only | `subRes.error` → `[]` means "0 pending" (looks complete). `empResult.success` false leaves stale or empty data. | Open |
| PM | PMDashboard.tsx:833-838, 845-880 | `getEmployeeCompetencies`; retirements (`getAllEmployees`) | no | no | swallowed | | Open |
| PM | PMDashboard.tsx:884-905 | `fetchCycles` (`performance_cycles`) | yes (`loading`) | yes (`errorMessage` "Using local sample evaluation data") | friendly, but replaces data with FALLBACK_CYCLES sample data | Fake data is shown as real. | Open |
| PM | PMDashboard.tsx:917-946 | `handleAddCycle` (insert / update) | no | partial | `alert('Failed to save evaluation cycle')` (generic) | No busy state. | Open |
| PM | PMDashboard.tsx:948-962 | `handleDeleteCycle` (`confirm()` + delete) | no | partial | `alert` generic | | Open |
| PM | modules/admin/PmDashboardOverview.tsx:213-235 | `getIPCRRecordsFromGapView` + `getActiveHeadcountByDepartment` | yes (`loading`) | yes (`loadError`, 285) | friendly generic | Good pattern. | Open |
| PM | modules/admin/pm/PMIPCRManagement.tsx:298-310 | `departments` lookup + `resolveOfficeWeights` | no | no | swallowed | Null weights can change the displayed overall score. | Open |
| PM | PMIPCRManagement.tsx:316-350 | Employee IPCR `reload` (`loadEmployeeIpcrForReview`, legacy `getEmployeeIPCR`) | yes (`ipcrLoading`, delayed) | yes (`ipcrError`, 620) | friendly ("Error fetching IPCR details.") or raw legacy msg | | Open |
| PM | PMIPCRManagement.tsx:804-930 | Schedule IPCR cycle modal: insert `probationary_ipcr_schedules`, read `newly_hired`, create `ipcr_submissions` per employee, update or insert `phase_schedules` | yes (`saving`) | yes (`error`, 1025) | raw msg | Per-employee submission failures are console only. `phase_schedules` errors are never read. Partial failure is reported as success. | Open |
| PM | PMIPCRManagement.tsx:1124-1135, 1645-1655 | `loadSystemStates` (`getSystemPhaseStates` + `getActiveCyclePeriod`) | no | no | logged only (`console.warn`) | The phase OPEN/CLOSED badge can be stale. | Open |
| PM | PMIPCRManagement.tsx:1405-1425, 1469-1478, 1526-1535, 1583-1592, 1919-1928, 1955-1964, 1991-2000, 2027-2036 | Open or close Phase 1 / Phase 2 (`openPhase`, `closePhase`) in two views | yes (`actionBusy`, disabled) | yes | native `alert(res.error)` / `alert(res.warning)` | Raw text. Re-reads state in all cases. | Open |
| PM | PMIPCRManagement.tsx:2087-2190 | Main list `load` (`getAllEmployees`, `ipcr_submissions`, `probationary_ipcr_schedules`) + realtime | yes (`loading`) | yes (`loadError` banner 2266, foreground only) | raw msg (foreground) / logged (background) | `subRes.error` / `schedRes.error` → `[]` makes everyone "Not Started". Background reload failures are silent. | Open |
| PM | pm/PMPromotionalApplications.tsx:519-526 | `listApplications` | yes (`loading`, `useTableLoading`) | yes (`error`) | raw msg | One of the few using `ErrorBanner`. | Open |
| PM | PMPromotionalApplications.tsx:199-222 | `listApplicationDocuments`, `setDocumentStatus` (`toggleDoc`) | yes (`loading` / `busy`) | yes | raw msg | | Open |
| PM | PMPromotionalApplications.tsx:231-250 | `decideApplication` (approve / deny / endorse) | yes (`busy`) | yes | raw msg | | Open |
| PM | PMPromotionalApplications.tsx:393-430 | `NewApplicationModal`: `listEmployeesForApplication`, `listPositions` (on open); `createApplication` | no (picklists) / yes (`busy`) | no (picklists) / yes | swallowed (picklists) / raw msg | A failed picklist load leaves an empty dropdown with no message. | Open |
| PM | PMPromotionalApplications.tsx:538-548 | `runEligibilityCheck` | yes (`eligibilityLoading`) | partial | writes `error` on the list view | May not be visible on the eligibility subtab. | Open |
| PM | pm/PMReportsAnalytics.tsx:262-300 | `loadAll`: `getEvaluationsWithEmployee`, `performance_cycles`, `listCloseouts` ×5 periods | yes (`useTableLoading`) | no | swallowed | Empty or failed results are replaced with SEED_EVALS / SEED_CLOSEOUTS demo data and shown as real. | Open |
| PM | PMReportsAnalytics.tsx:205-215, 331-368 | CSV export (Blob) and `window.print()` | n/a | n/a | n/a | Synchronous. | Open |
| PM | pm/PMArchive.tsx:36-54 | `listArchiveEmployees`; `getEmployeeArchive` | yes (`loading`, `semLoading`) | no | swallowed in lib | | Open |
| PM | pm/Phase2RatingPanel.tsx:77-100 | `listPendingRatingApprovals` + realtime | yes (`loadingList`) | yes (`notice` tone err) | raw msg | | Open |
| PM | Phase2RatingPanel.tsx:130-177, 180-201, 203-236 | `handleApproveRating` (`saveRatings`), `handleReturn`, `saveEdits` (`adminEditRatings`) | yes (`approvalBusyId`, `savingEdits`) | yes (`notice`) | raw msg; `alert` for incomplete scores | | Open |
| PM | Phase2RatingPanel.tsx:238-278 | `openWindow` / `closeWindow` (`openSelfRatingPeriod`, `closeSelfRatingPeriod`, `createNotifications`) | yes (`opening`, `closing`; `confirm()`) | yes | raw msg | The `createNotifications` result is unchecked, so "notifications sent" is claimed regardless. | Open |
| PM | pm/SemesterSummarySection.tsx:47-72 | `getSemesterSectionState` + records + completion | yes (`loading`) | no | logged only | A blank section on failure. | Open |
| PM | SemesterSummarySection.tsx:86-97 | `confirmSemesterTransition` | yes (`confirming`) | yes (`confirmError`) | raw msg | | Open |
| PM | pm/SummaryOfRatings.tsx:215-240 | `getIPCRRecordsFromGapView` + `getActiveHeadcountByDepartment` | yes (`loading`) | no | logged only | Headcount failure falls back to `Map()` silently. | Open |
| PM | pm/CompetencyGapPanel.tsx:66-92 | `employee_competency_summaries` recommendations | yes (`loadingRec`) | no | logged only | | Open |
| PM | CompetencyGapPanel.tsx:215-220 | `getCompetencyTargetTrace` | yes | no | logged only (`trace=null`) | | Open |
| PM | pm/OfficeWeightingPanel.tsx:31-60 | `listWeightingOptions` / `listWeightingConfigs`; `setWeightingConfig` | yes (`loading`, `savingId`) | yes (`error`) | raw msg | | Open |
| PM | pm/PMCompetencyFramework.tsx:217-290 | `listRequirementsForPosition`, `saveRequirement`, `removeRequirement` | yes (`loading`, `savingId`) | yes (`error`) | raw msg (`ErrorBanner` imported) | | Open |
| PM | PMCompetencyFramework.tsx:536-550 | `confirmDelete` | yes (`deleting`) | yes | raw msg | | Open |
| PM | PMCompetencyFramework.tsx:780-792 | Module load (4 lists) | yes | partial | only the standards error is shown | positions / requirements / departments errors are ignored. | Open |
| PM | pm/PMMasterControlPanel.tsx, IPCRReportView.tsx, IpcrArchiveSemester.tsx | no async sites | n/a | n/a | n/a | | Open |
| PM (demo, route `/pm-demo`) | pm/demo/DemoLogin.tsx:21-30 | `demoLogin` (RPC `demo_login`) | yes (`busy`) | yes | raw msg | | Open |
| PM (demo) | demo/DemoRoot.tsx:36, demo/api.ts:136 | `loadDemoOffset` (`demo_settings`) | no | no | swallowed (`catch {}`) | | Open |
| PM (demo) | demo/DemoTimeBanner.tsx:17-23 | simulated-time buttons (`run(fn)`) | yes (`busy`) | no | n/a | Result unchecked. | Open |
| PM (demo) | demo/NotificationBell.tsx:19-47 | `listNotifications` every 5s; `markNotificationsRead` | no | no | swallowed | | Open |
| PM (demo) | demo/AccountManagement.tsx:44-86, 203-212, 276-290 | `listAccounts`, `listOffices`, `createAccount`, `setAccountStatus`, `updateAccount` | yes (`loading`/`busy`) | yes except status toggle | raw msg | The Deactivate / Reactivate button has no busy state and ignores the result. | Open |
| PM (demo) | demo/PMWorkflow.tsx:59-70, 85-100, 200-212, 296-312 | poll every 5s; `openPhase1/2` (notice is set regardless); `sendPhase1/2Notification`; `acceptAndLock` / `closeCycle` | partial (`busy`) | no | n/a | Notices claim success regardless of the result. | Open |
| PM (demo) | demo/EmployeeIPCR.tsx:42-60, 160-175, 345-360; SupervisorReview.tsx:36-50, 125-175 | targets and accomplishments submit; supervisor verify | yes (`loading`/`busy`) | yes | raw msg | SupervisorReview polls every 5s. | Open |

## 3. L&D (Learning and Development)

| Module | File:line | What | Loading? | Error state? | Surfaced | Notes | Status |
|---|---|---|---|---|---|---|---|
| L&D | modules/admin/LNDDashboard.tsx:388-410 | 6 parallel loads: `listIncompleteLockedTrainings`, `listLockingSoonWithoutRoster`, `computeNeedsAssessment`, `listSubmissions`, `listCalendarEvents`, `listActiveEmployees` | yes (`loading`) | no | logged only | The `Promise.all` is all-or-nothing, but each lib returns `[]` instead of throwing. Widgets show empty or zero. | Open |
| L&D | LNDDashboard.tsx:344-352 | `downloadCsv` | n/a | n/a | n/a | Synchronous. | Open |
| L&D | modules/admin/LndArchive.tsx:56-79 | `listArchiveOfficeDirectory`; `listTrainingArchive` | yes (`loadingOffices` / `loadingEmployees`) | no | swallowed | | Open |
| L&D | modules/admin/LndIdpFormSettings.tsx:48-56 | `getIdpConfig`, `listSubmissions` | yes (`loading` skeleton) | partial | raw msg for config; submissions error ignored | | Open |
| L&D | LndIdpFormSettings.tsx:66-76 | `saveIdpConfig` | yes (`saving`) | yes (`error`) | raw msg | | Open |
| L&D | modules/admin/LndSummaryOfRatings.tsx:49-70 | `getIPCRRecordsFromGapView` + headcount | yes (`loading`) | no | logged only | | Open |
| L&D | modules/admin/LndTrainingEvaluation.tsx:84-92 | `listEvaluableTrainings` | yes (`loadingList` text) | no | swallowed | | Open |
| L&D | LndTrainingEvaluation.tsx:96-115 | `getEvaluationBoard` | yes (`loadingBoard`, overlay) | no | swallowed (null board) | | Open |
| L&D | LndTrainingEvaluation.tsx:140-176 | `commitScores` (blur), `changeMode`, `changeReview`, `commitReportNotes` | no (no busy or disable) | yes (`flash()` "Could not save…: <raw>") | raw msg | Auto-save on blur. A silent no-op if the value is unchanged. | Open |
| L&D | LndTrainingEvaluation.tsx:161-170 | `handleFile` → `uploadOutput` (Storage upload) | yes (`uploadingId`) | yes (`flash` "Upload failed: <raw>") | raw msg | | Open |
| L&D | LndTrainingEvaluation.tsx:185-235 | `exportReport` (`window.open` + print HTML) | n/a | n/a | silent if popup blocked | | Open |
| L&D | modules/admin/LndTrainingNeeds.tsx:119-126 | `listOfficeRequests` + `computeNeedsAssessment` | yes (`useTableLoading`) | no | swallowed | | Open |
| L&D | LndTrainingNeeds.tsx:155-163 | `decideRequest` (approve / dismiss) | yes (`busy`) | yes (`flash`) | raw msg | | Open |
| L&D | modules/admin/TrainingCalendar.tsx:248-258 | Competency tags for the form (`listCompetencyTags`, `getSessionCompetencies`) | partial (`tagsLoaded`, "Loading…" placeholder) | no | swallowed | | Open |
| L&D | TrainingCalendar.tsx:270-300 | `createCalendarEvent` / `updateCalendarEvent` | yes (`saving`) | yes (`error`) | raw msg | | Open |
| L&D | TrainingCalendar.tsx:388-395 | `upsertCompetencyTag` (onCreateTag) | no | no | none | A failure (tag `null`) silently does nothing. | Open |
| L&D | TrainingCalendar.tsx:466-478 | `cancelCalendarEvent` (`confirm()`) | yes (`cancelling`) | yes | `alert` with raw msg | | Open |
| L&D | TrainingCalendar.tsx:653-660 | `listCalendarEvents` | yes (`useTableLoading`) | no | swallowed | | Open |
| L&D | modules/admin/TrainingCourses.tsx:112-130 | `createCourseDraft` / `updateCourseDraft` | yes (`saving`) | yes | raw msg | | Open |
| L&D | TrainingCourses.tsx:262-278, 667-690 | Add / remove draft member (`addDraftMember`, `removeDraftMember`) | yes (`busy`) | yes | raw msg | | Open |
| L&D | TrainingCourses.tsx:408-418, 598-647 | `runAction`: `sendDraftToDeptHead`, `returnDraftToLnd`, `finalizeCourseDraft` | yes (`busy`) | yes | raw msg | | Open |
| L&D | TrainingCourses.tsx:377-391 | `getOfficeDeptHead` / `listDraftAuditTrail` (`.then`) | no | no | swallowed | | Open |
| L&D | TrainingCourses.tsx:709-718 | `listCourseDrafts`, `listEmployeeOptions`, `getDepartmentIdOptions` | yes (`loading`, drafts only) | no | swallowed | The option lists load with no indicator. | Open |
| L&D | modules/admin/TrainingPlan.tsx:156-170 | `setPlanningWindow` | yes (`busy`) | yes | raw msg | | Open |
| L&D | TrainingPlan.tsx:298, 457-470 | `create/updatePlanEntry`, `run(fn)`: delete, promote | yes (`busy`) | yes | raw msg | | Open |
| L&D | TrainingPlan.tsx:613-620, 1156-1162 | Dismiss recommendation (`dismissRecommendation`) | yes (`busy`) | yes (thrown Error displayed) | raw msg | | Open |
| L&D | TrainingPlan.tsx:675-690 | `refresh` (entries, recommendations, window, publication) | yes (`loading`) | no | swallowed | | Open |
| L&D | TrainingPlan.tsx:742-790 | Publish, unpublish, rollover, reschedule (drag) | yes (`publishing`) | yes (`setError`) | raw msg | | Open |
| L&D | modules/admin/SeminarEnrollment.tsx:285-310 | `getManualPickerOffices`; `getOfficeEmployeesWithScores` | yes (`loadingOffices` / `loadingOffice`) | no | swallowed | | Open |
| L&D | SeminarEnrollment.tsx:325-340 | `lndAddAttendees` | yes (`busy`) | yes | raw msg | | Open |
| L&D | SeminarEnrollment.tsx:529-560 | `refresh` (5-way `Promise.all`) + on-open `generateRecommendations().catch(() => {})` | yes (`loading`, `busy='regen'`) | no | swallowed | The on-open regenerate failure is invisible. | Open |
| L&D | SeminarEnrollment.tsx:662-720 | `regenerate`, `sendSelected`, `reject`, `enroll`, `finalize`, `publish` | yes (`busy`) | yes (`say('err', …)`) | raw msg | | Open |
| L&D | modules/admin/TrainingEnrollmentEmailModal.tsx:47-54 | `sendTrainingEnrollmentEmail` | yes (`sending`) | yes | n/a | **The lib is a stub (§0.5).** The UI reports "Sent to N recipients" though nothing is sent. | Open |
| L&D | modules/admin/AttendanceGrid.tsx:70-76 | `listAttendance` | no | no | swallowed | | Open |
| L&D | AttendanceGrid.tsx:90-96 | `commit` → `setDayAttendance` | yes (`busy` per cell) | yes | `alert(raw error)` | | Open |
| L&D | components/SuccessionPlanningPage.tsx:204-232 | (also rendered in L&D / RSP) see §1 | | | | | Open |
| L&D | components/CriticalPositionPage.tsx:132-148 | `loadPositions` (`listCriticalPositions`, `getIncumbentStatuses`) | yes (`loading`) | yes (`error`, 428) | raw msg | | Open |
| L&D | CriticalPositionPage.tsx:150-185 | Metadata load (`getDepartmentById`, `listPositionTitlesForDepartment`, `getCompetencyLibrary`, `listEmployeeOptions`, `listPositionQualificationsForDepartment`) | no | no | swallowed | No try/catch. Empty dropdowns on failure. | Open |
| L&D | CriticalPositionPage.tsx:255-284 | `saveBulk` (loop of `createCriticalPosition`) | yes (`bulkSaving`) | yes (`bulkError`) | raw msg | | Open |
| L&D | CriticalPositionPage.tsx:305-330 | `openFor`: `listCompetencyRequirements` / `listTrainingRequirements` | no | no | swallowed | Drafts silently empty. Saving afterwards would then delete the real requirements. | Open |
| L&D | CriticalPositionPage.tsx:340-393 | `save`: create / update, then competency and training requirement diff (`saveCompetencyRequirement`, `remove…`) | yes (`saving`) | partial | `setError(res.error)` for the main write only | The requirement-diff results are ignored, so the modal closes on partial failure. If `saving` stays true on a throw, there is no `finally`. | Open |
| L&D | CriticalPositionPage.tsx:395-403 | `confirmDelete` (`confirm()`) | no | yes | raw msg | | Open |
| L&D | components/CriticalPositionGapAnalysisPage.tsx:62-77 | Initial load (`getDepartmentById`, `listCriticalPositions`, `listEmployeeOptions`, `getQualificationSummaries`) | yes (`loading`) | no | swallowed | No try/catch. A throw leaves it loading forever. `posRes.ok` false is ignored. | Open |
| L&D | CriticalPositionGapAnalysisPage.tsx:124-142 | Comparison (`getPositionRequirements`, `getEmployeeQualificationProfile`) | yes (`loadingComparison`) | no | swallowed (null profile = empty comparison) | | Open |
| L&D | components/SuccessionReadinessEngine.tsx, modules/admin/components/TrainingEvaluationReport.tsx | no async | n/a | n/a | n/a | | Open |

## 4. Dept Head (OfficeAccountConsole and what it renders)

`modules/admin/pm/OfficeAccountConsole.tsx` renders `Phase2RatingPanel`, `OfficeTrainingCourses`, `CriticalPositionPage`, `CriticalPositionGapAnalysisPage` and `LogoutConfirmPopover`. The first two are covered here. The other two are in §3.

| Module | File:line | What | Loading? | Error state? | Surfaced | Notes | Status |
|---|---|---|---|---|---|---|---|
| Dept Head | OfficeAccountConsole.tsx:212-232 | `loadBellNotifications` (`listNotifications` ×2 + realtime `ipcr_notifications`) | no | no | logged only (`console.warn`) | lib-[]. | Open |
| Dept Head | OfficeAccountConsole.tsx:420-451 | `loadUserSession`: `resolveEmployeeId`, `employees_with_department`, `getActiveOfficeRole`, then `refreshPendingApprovals` | yes (`officeRoleLoading`) | no | swallowed (empty catch) | An outage looks like "no office role", with no distinction between outage and no access. | Open |
| Dept Head | OfficeAccountConsole.tsx:334-343 | `refreshPendingApprovals` (`listPendingApprovals`) | yes (`approvalsLoading`) | yes (`approvalNotice` err) | raw msg | | Open |
| Dept Head | OfficeAccountConsole.tsx:316-331 | `saveEdits` (`adminEditTargets`) | yes (`savingEdits`) | yes | raw msg | | Open |
| Dept Head | OfficeAccountConsole.tsx:345-357 | `handleApprove` (`approveTargets`) | yes (`approvalBusyId`) | yes | raw msg | The approval-notification failure inside the lib is swallowed. | Open |
| Dept Head | OfficeAccountConsole.tsx:359-373 | `handleReturn` (`returnForRevision`) | yes (`approvalBusyId`) | yes | raw msg | | Open |
| Dept Head | OfficeAccountConsole.tsx:459-478 | `refreshRequests` (`listOfficeTrainingRequests`), `refreshOfficeRecs` (`listPipeline`) | yes (`loadingRequests`) / no | no | swallowed | lib-[]. | Open |
| Dept Head | OfficeAccountConsole.tsx:481-515 | `handleSubmitRequest` (`createTrainingRequest`) | yes (`isSubmittingRequest`) | partial | `alert()` for validation and raw `result.error` | | Open |
| Dept Head | OfficeAccountConsole.tsx:575-640 | `transmitTargetsToPM`, `submitOverride`, `compileDPCR`, OPCR compiler | n/a | n/a | n/a | **Local React state only.** No persistence, but toasts say "Successfully transmitted to the PM database vault" and "Rating overridden… and logged". | Open |
| Dept Head | pm/OfficeTrainingCourses.tsx:130-142 | `listOfficeTrainings` (poll every `POLL_MS`) | yes (first load only) | no | swallowed | | Open |
| Dept Head | OfficeTrainingCourses.tsx:155-160 | `listAllRecommendations` poll | no | no | swallowed | | Open |
| Dept Head | OfficeTrainingCourses.tsx:165-178 | `employees_with_department` picker | no | no | swallowed (`error` unread) | | Open |
| Dept Head | OfficeTrainingCourses.tsx:190-237 | `addCandidate`, `confirmRemove`, `sendBatchBack` (`officeAddCandidateAudited`, `officeRemoveCandidate`, `returnBatchToLnd`) | yes (`busySession`) | yes | native `alert(res.error)` (raw msg) | | Open |
| Dept Head | OfficeTrainingCourses.tsx:274-280 | `markTrainingViewedByOffice` (`openDetail`) | no | no | none | Result ignored. | Open |
| Dept Head | pm/Phase2RatingPanel.tsx | see §2 | | | | | Open |

## 5. Employee (modules/employee/*)

| Module | File:line | What | Loading? | Error state? | Surfaced | Notes | Status |
|---|---|---|---|---|---|---|---|
| Employee | EmployeeLoginPage.tsx:30-45 → App.tsx:447-505 `handleEmployeeLogin` | Login: `findEmployeePortalAccountFromSupabase` (plaintext password compare), localStorage fallback, `fetchPortalEmployeeByNumber` | yes (`loading`) | yes (`error`) | `err.message` ("Invalid username or password.") | Supabase failure falls through to the local lookup, so a network failure shows "Invalid username or password." Logout (App.tsx:534) only clears the session and does not call `supabase.auth.signOut`. | Open |
| Employee | SetInitialPasswordPage.tsx:40-60 | `changeEmployeePortalPassword` | simulated (`saving` set around a sync call) | yes | friendly | **localStorage only.** The Supabase row keeps the temp password. | Open |
| Employee | EmployeePage.tsx:224-236 | `getActiveOfficeRole` | no | no | swallowed | Treated as "not an office account". | Open |
| Employee | EmployeePage.tsx:340-352 | `office_role_assignments` `.then` | no | no | swallowed | No catch. | Open |
| Employee | EmployeePage.tsx:408-620 | `loadIPCRData` (~12 sequential lib calls) | yes (`ipcrLoading`; silent for background refreshes) | yes (`ipcrError`) | friendly generic ("Failed to load IPCR performance data.") | Only when an exception is thrown. `{success:false}` results from the lib are partly ignored. The probationary schedule `error` is unread. | Open |
| Employee | EmployeePage.tsx:640-680 | `refreshPhaseSchedules`; phase-gate poll (`PHASE_GATE_POLL_MS`, plus window focus); realtime | no | no | swallowed | | Open |
| Employee | EmployeePage.tsx:686-780 | `handleSaveWorkspaceTargets`: `getActiveCycle`, `saveTargetSetting`, `saveTargets` (two-step write) | yes (`workspaceSaving`) | yes (`ipcrError`) | raw msg | If step 2 fails after step 1 succeeded, step-1 UI state is already updated. | Open |
| Employee | EmployeePage.tsx:810-920 | `handleSubmitWorkspaceAccomplishments`: `saveAccomplishments`, `generateIpcrPdf` (jsPDF, sync), `uploadEmployeeDocument` (Storage + row), `attachPdfUrl` | yes (`workspaceSaving`) | yes (`ipcrError` + `saveSuccess` text) | raw msg | On a PDF or upload failure it shows both "Evaluation submitted, but the PDF could not be uploaded" and the raw error. No retry path for the PDF. | Open |
| Employee | EmployeePage.tsx:920-945 | `loadIPCRPeriod` (period switch) | yes (`ipcrLoading`) | yes | friendly | `success:false` is silently ignored. | Open |
| Employee | EmployeePage.tsx:997-1050 | `handleSaveIPCR` (legacy; `saveOrSubmitEmployeeIPCR`) | yes (`ipcrSaving`) | yes | raw msg | | Open |
| Employee | EmployeePage.tsx:1085-1105 | Account tab unlock (`findEmployeePortalAccount`, sync) | n/a | yes | friendly | | Open |
| Employee | EmployeePage.tsx:1130-1165 | `handleSaveUsername` / `handleSavePassword` | n/a | yes | friendly | **localStorage only** (§0.6). | Open |
| Employee | EmployeePage.tsx:1197-1212 | `fetchPortalEmployeeById` (profile hydration) | yes (`profileLoading`) | no | swallowed (`result.ok` false is ignored) | The stub profile stays and the "setup wizard" then prompts the user to re-enter data that actually exists. | Open |
| Employee | EmployeePage.tsx:1285-1320 | `listEmployeeNotifications`, `markEmployeeNotificationsRead` + realtime | no | no | swallowed | | Open |
| Employee | EmployeePage.tsx:1348-1370 | `persistProfilePatch` (`patchPortalEmployee`) | no (opt) | yes (`saveError`) | raw msg | Rolls back the optimistic update. | Open |
| Employee | EmployeePhase2.tsx:97-155 | `loadEmployeeRatingSheet`, `getRatingScale`, `markEmployeeNotificationsRead` | yes (`loading`) | yes (`notice` err) | raw msg | | Open |
| Employee | EmployeePhase2.tsx:224-258 | `persist` → `saveEmployeeRatings` (draft / submit) | yes (`saving`, buttons disabled) | yes (`notice`) | raw msg | | Open |
| Employee | IdpFormSection.tsx:66-72 | `listPositionSalaryGrades` | no | no | swallowed | | Open |
| Employee | IdpFormSection.tsx:91-125 | `getIdpConfig`, `getMySubmission` | yes ("Loading…") | yes (`error`) | raw msg | | Open |
| Employee | IdpFormSection.tsx:150-170 | `persist` → `saveSubmission` (draft / submit) | yes (`saving`) | yes | raw msg | | Open |
| Employee | MyArchiveSection.tsx:20-28 | `getEmployeeArchive` | yes (`loading`) | no | swallowed | | Open |
| Employee | MyTrainingsSection.tsx:31-40 | `listMyTrainings` + poll | yes (`loading`, first load) | no | swallowed | | Open |
| Employee | PersonalDataSheetSection.tsx:462-495 | 7 `list*` calls (children, education, eligibility, work, voluntary, L&D, references) | yes (`listsLoading`) | no | swallowed (`ok !== false` guard) | **Risk:** a failed load leaves an empty list. `saveEducation` and similar are delete-then-insert, so a later Save wipes the stored rows. | Open |
| Employee | PersonalDataSheetSection.tsx:545-790 (`savePersonalInfo`, `saveFamilyBackground`, `saveEducationalBackground`, `saveEligibilitySection`, `saveWorkExperienceSection`, `saveVoluntaryWorkSection`, `saveLdInterventionsSection`, `saveOtherInfoSection`, `saveBackgroundSection`) | `patchPortalEmployee` and `save*` | yes (`saving`, `SaveBar`) | yes (`saveError`) | raw msg | | Open |

## 6. Interviewer (modules/interviewer/*)

| Module | File:line | What | Loading? | Error state? | Surfaced | Notes | Status |
|---|---|---|---|---|---|---|---|
| Interviewer | InterviewerLogin.tsx:70-150 | Login: `raters` select, `last_login` update, `supabase.auth.signInWithPassword` | yes (`loading`) | yes (`error`) | friendly | Invalid credentials and a network failure both read "Invalid email or password…". In mock mode, an active rater logs in without a password. `last_login` write failures are swallowed. | Open |
| Interviewer | App.tsx:336-405 | Revoked-access check: `raters` select every 3s + on focus | no | no | swallowed | Shows a revoke dialog on explicit inactivity. | Open |
| Interviewer | App.tsx:540-552 | Revoked acknowledge: `supabase.auth.signOut` | no | no | swallowed (empty catch) | | Open |
| Interviewer | InterviewerDashboard.tsx:112-130 | `fetchApplicantsFromClient` (`fetch('/api/applicants/')` then `from('applicants')`), `fetchEvaluationsFromClient` | n/a | no | swallowed | `{data}` only. An error yields `[]`. | Open |
| Interviewer | InterviewerDashboard.tsx:299-366 | `fetchJobsAndApplicants`: `resolveAssignedPositionsForInterviewer`, `getJobPostingsFromSupabase`, applicants and evaluations (primary, then mock fallback) + realtime | yes (`loading`, silent refresh) | yes (`error` + Retry, 520) | raw msg | The mock-database fallback fires when the applicants list is empty. | Open |
| Interviewer | InterviewerDashboard.tsx:466-490 | `handleDeleteConfirm`: hard `delete` from `applicants` | yes (`deleting`) | partial | `alert('Failed to delete applicant.')` | Interviewers can hard-delete applicants. | Open |
| Interviewer | InterviewerApplicantsList.tsx:510-625 | `fetchApplicantsAndJob`: assigned positions, `applicants` (primary then mock), `evaluations` (`allSettled`) + realtime | yes (`loading`) | yes (`error` + Retry, 893) | raw `err.message` | The `{data}`-only fetchers ignore `error`. | Open |
| Interviewer | InterviewerApplicantsList.tsx:628-668 | `fetchAttachments` | yes (`isLoadingAttachments`) | no | swallowed | | Open |
| Interviewer | InterviewerApplicantsList.tsx:680-700 | `updateApplicantStatus` (Qualified / Not Qualified) | no | no | swallowed (empty catches) | opt. Local state and `cictrix:applicants-updated` fire first. sb-noreject, and the mock fallback never triggers. A failed write is invisible. | Open |
| Interviewer | InterviewerApplicantsList.tsx:706-725 | `handlePreviewDocument` / `handleDownloadAllDocuments` (`createSignedUrl`) | no | no | none | A null URL or thrown error is a silent no-op or unhandled rejection. | Open |
| Interviewer | InterviewerApplicantsList.tsx:436-460 | `handleSendApplicantEmail` | yes (`emailSending`) | yes (`emailError`) | raw msg | | Open |
| Interviewer | EvaluationForm.tsx:250-340 | `fetchApplicantData` (applicant and attachments, with the mock fallback) | yes (`loading` + spinner) | yes (`error`) | raw msg | | Open |
| Interviewer | EvaluationForm.tsx:360-515 | `handleSubmit`: insert `evaluations`, update applicant status `Reviewed`, local snapshots | yes (`submitting`) | yes (`error`) | a Postgrest error is not an `Error`, so the cause is hidden behind "Failed to submit evaluation" | The status update and local sync are swallowed. `Reviewed` maps back to `Under Initial Screening`. | Open: planned in `docs/plans/2026-10-30-applicant-status-and-score-writes.md` Step 3 |
| Interviewer | EditApplicantDetailsModal.tsx:60-75 | `updateApplicantDetails` | yes (`saving`) | yes | `We couldn't save the changes. <raw error> Try again.` | | Open |
| Interviewer | ApplicantDetailsPage.tsx:920-1115 (route used by RSP "view applicant") | Load applicant, attachments, evaluation with linked-id fallbacks (primary, secondary, recruitment local) | yes (`loading`) | no | swallowed (several empty catches) | Total failure falls back to local recruitment data or null. | Open |
| Interviewer | ApplicantDetailsPage.tsx:855-885 | Auto-sync of `doc_validated` rows from localStorage reviews (`void insert`) | no | no | none | **Writes to the DB just from viewing the page.** | Open |
| Interviewer | ApplicantDetailsPage.tsx:1160-1200 | Realtime attachments channel; `reloadDocEvents` (`listDocumentEvents`) | no | no | swallowed | | Open |
| Interviewer | ApplicantDetailsPage.tsx:1360-1392 | `handleSendEmail` | yes (`emailSending`) | yes (`emailError`) | raw msg | | Open |
| Interviewer | ApplicantDetailsPage.tsx:1480-1700 (`persistStatus`) | Status write (qualify, shortlist, disqualify, `action_required`) with `application_activity_log` insert; undo window via `schedulePendingDecision` | no | no | logged only | opt. "status NOT persisted to DB. Local UI updated only." is only `console.error`. The queued `void commit()` has no catch. | Open |
| Interviewer | ApplicantDetailsPage.tsx:1720-1785 (`handleSubmitResubmission`) | Inserts `resubmission_request`, `recordDocumentEvent`, `persistStatus`, `sendEmail` | partial (`resubmitSending`) | no (`resubmitError` is never set) | logged only | The toast "Resubmission notice sent" appears even if inserts or email failed. | Open |
| Interviewer | ApplicantDetailsPage.tsx:1795-1825 (`handleValidateAllDocs`) | Insert `doc_validated` rows, `recordDocumentEvent` | yes (`validationBusy`) | no | logged only | Insert results are unchecked. The toast "Verified" shows. | Open |
| Interviewer | ApplicantDetailsPage.tsx:1840-1865 (`handleUndoValidation`) | `undoDocumentValidation` | yes (`validationBusy`) | yes (`validationError`) | friendly | | Open |
| Interviewer | ApplicantDetailsPage.tsx:1885-1925 (`handleSaveScoreSetup`) | Score and status update with the mock fallback; localStorage keys | no | no | swallowed | Local plus best-effort DB write. Unreachable: the only button that opens it is behind `showViewScoresButton = false`. | Tracked: unreachable; removal planned in `docs/plans/2026-10-30-applicant-status-and-score-writes.md` Step 1 |
| Interviewer | ApplicantDetailsPage.tsx:453-464 (`openDocument`) | `createSignedUrl` + `window.open` | no | no | none | A null URL or thrown error is a silent no-op or unhandled rejection. | Open |

## 7. Applicant and public

| Module | File:line | What | Loading? | Error state? | Surfaced | Notes | Status |
|---|---|---|---|---|---|---|---|
| Public | components/LandingPage.tsx:104-165 | `loadJobPostings` + `getJobPostingsLoadError`; open vacancy list | yes (`useTableLoading`) | yes (`vacanciesError`) | raw msg | The only page that checks the load-error flag. | Open |
| Public | components/JobPortalPage.tsx:44-90 | `loadJobPostings` + `getAuthoritativeJobPostings` | yes (`loading`) | no | logged only | A failure reads as "no vacancies". | Open |
| Public | components/JobDetailsPage.tsx (portal use) | see §1 | | | | `closeVacancy` etc. are admin-only. | Open |
| Applicant | modules/applicant/ApplicantAssessmentForm.tsx:120-123 | `loadJobPostings().then(syncPostedPositions)` | no | no | swallowed | An empty position dropdown on failure. | Open |
| Applicant | modules/applicant/AttachmentsUploadForm.tsx | no async (local file validation) | n/a | yes (local) | friendly | Uploads happen in the wizard submit. | Open |
| Applicant | ApplicantWizard.tsx:217-231 | Count of earlier applications (`applicant_tracker_view`) | no | no | swallowed | | Open |
| Applicant | ApplicantWizard.tsx:440-565 | Employee prefill (promotion applicants): portal account lookup by Employee ID, `fetchEmployeeApplicationProfile` | yes (`isLoadingPrefill`) | yes (notice) | friendly | Matches by Employee ID alone with no password, so it returns PII (name, address, contact). 700ms debounce. | Open |
| Applicant | ApplicantWizard.tsx:705-765 (`uploadFiles`) | Storage `upload` + insert `applicant_attachments`, one file at a time | yes (`isSubmitting`) | yes | friendly ("File upload failed. Please check your internet…") | | Open |
| Applicant | ApplicantWizard.tsx:815-842 (`findExistingApplication`) | Duplicate-application check | no | no | swallowed (empty catch → null) | The duplicate pre-check silently skips on failure. | Open |
| Applicant | ApplicantWizard.tsx:845-1010 (`submitOne`) | Insert `applicants` (migration-fallback retries), `linkApplicationToSlots`, `uploadFiles`, `syncApplicantSubmissionToRecruitment` | yes (`isSubmitting`, per-key outcomes) | yes (outcome error) | classified messages, but the default branch shows `rawMessage.slice(0,200)` and schema text to public users | **Orphan risk:** the applicant row is inserted before the uploads. If an upload fails, a retry finds the existing application and returns `already`, so the files are never uploaded. | Open |
| Applicant | ApplicantWizard.tsx:770-805 (`cachePreviewableFiles`) | FileReader dataURLs into localStorage | no | no | swallowed | | Open |
| Applicant | ApplicantWizard.tsx:1040-1085 (`handleSubmitAll`) | Sequential submit of all selected applications | yes (`isSubmitting`) | yes (alert area with focus) | per-key messages | | Open |
| Applicant | ApplicantWizard.tsx:1240 | `loadJobPostings().then` | no | no | swallowed | | Open |
| Applicant | ApplicationStatusPage.tsx:520-595 (`runSearch`) | `applicant_tracker_view` lookup by reference or email (+ `item_number` fallback) | yes (`loading`) | yes (`error`) | `dbError.message` raw to a public user | Also loads attachments and local doc reviews. | Open |
| Applicant | ApplicationStatusPage.tsx:391-419, 459-496 | `fetchAttachments`, `fetchRecord`, realtime channels, polling | no | no | swallowed (`/* silently ignore */`) | | Open |
| Applicant | ApplicationStatusPage.tsx:427-450 | `fetchApplicantSlotLinks` + `fetchSlotsByJobPosting` | no | no | swallowed | | Open |
| Applicant | ApplicationStatusPage.tsx:620-700 (`handleReupload`) | Storage upload, insert `applicant_attachments`, update `applicants.status='Under Review'`, local mirror | yes (`uploadingKey`) | yes (`uploadErrors[key]`) | raw msg | The anon applicant updates their own status, and the update result is unchecked. | Open |
| Applicant | components/AboutPage.tsx, ContactsPage.tsx, DocumentPreviewModal.tsx:53 | `downloadEmployeeDocument` (void) | no | no | falls back to `window.open` | | Open |

## 8. Admin and other

| Module | File:line | What | Loading? | Error state? | Surfaced | Notes | Status |
|---|---|---|---|---|---|---|---|
| Admin | modules/admin/LoginPage.tsx:76-125 | `signInWithPassword`, `user_roles` select, `signOut({scope:'local'})` on role failure | yes (`loading`) | yes (`errorMsg`) | friendly | Network failure also shows "Invalid email or password." A role-fetch failure shows "No role assigned." | Open |
| Admin | modules/admin/AdminLogin.tsx:15-25 | "Login" (no auth call) | n/a | yes (empty check) | n/a | **Dead code (not routed):** sets `cictrix_admin_auth=true` for any non-empty input. | Open |
| Admin | components/LogoutConfirmPopover.tsx:63-70 | `supabase.auth.signOut` | no | no | swallowed | Admin session is cleared first, then navigates. | Open |
| Admin | App.tsx:164-181 `useSupabaseAuthState` | `auth.getSession`, `onAuthStateChange` (admin guard) | partial ('checking' state) | yes (expired page) | friendly | If the check throws it sets 'live', so the admin stays "in" with an unvalidated session. | Open |
| Admin | App.tsx:312-325 | Session heal `fetchPortalEmployeeByNumber` (`.then`) | no | no | swallowed | | Open |
| Admin | main.tsx:41-62 | `loadJobPostings`; boot syncs `syncHiredApplicantStatus`, `syncNewlyHiredToEmployees`, `repairDefaultedEmployeeRecords` (§0.9) | no | no | logged only (`console.warn`) | Runs for every visitor, writes to `applicants` and `employees`, is gated once per tab session, and has 16 empty catches. | Open |
| Admin | modules/admin/SettingsPage.tsx:117-190 | Profile save, photo pick (FileReader), password update, notifications | simulated (`isSaving`) | yes (local validation) | n/a | **No backend.** "Password updated successfully!" and "Notification preference updated!" are fake. The profile is stored in `localStorage.user`. | Open |
| Admin | modules/admin/SuperAdminDashboard.tsx:66-105 | 8 head-count queries (`applicants`, `jobs`, `raters`, `trainings`, `performance_cycles`) | yes (`loading`) | no | logged only | Per-query `.error` is ignored, so counts become 0. PM `pendingReviews` reuses the applicants "Pending" count. | Open |
| Admin | modules/admin/SystemAdministrationPage.tsx:207-225 | Office Directory (`getOfficeDirectory`) | yes (`useTableLoading`) | yes (`error`) | raw msg | | Open |
| Admin | SystemAdministrationPage.tsx:497-520, 1336-1365, 1696-1765 | Role assignments: `listAssignments`, `listDepartments`, `listEmployeeOptions`, `listAuditTrail`; `createAssignment`; `getPendingSubmissions` + `revokeOrTransfer` | yes (`loading`/`saving`/`processing`) | yes | raw msg | `listDepartments`, `listEmployeeOptions` and `listAuditTrail` failures are silent (empty lists). | Open |
| Admin | SystemAdministrationPage.tsx:1905-1925, 1996-2030 | Phase schedules: `listSchedules`, `upsertSchedule`, `deleteSchedule` | yes | yes | raw msg | | Open |
| Admin | SystemAdministrationPage.tsx:2178-2200, 2384-2420 | Locked targets: `listLockedTargets`, `fetchTargetRowsForEmployee`, `lockTargetSet` | yes (`fetching`/`saving`) | yes | raw msg | `fetchTargetRowsForEmployee` failure = 0 rows. | Open |
| Admin | SystemAdministrationPage.tsx:2528-2560 | Compliance by office (`getActiveCyclePeriod`, `getComplianceByOffice`) | yes (`loading`) | yes | raw msg | | Open |
| Admin | SystemAdministrationPage.tsx:2708-2760, 2912-2945 | Closeout: `getComplianceByOffice`, `listCompilations`, `listCloseouts`, `closeoutOffice`, `recordCompilation` | yes (`loading`/`processing`/`saving`) | yes | raw msg | `listCompilations` and `listCloseouts` failure = `[]`, so the readiness calculation can be wrong. | Open |
| Admin | components/OfficeDirectorySection.tsx:38-125 | `getOfficeDirectory` (+ Retry); on office click `employees_with_department` + `applicants` | yes (`useTableLoading`) | yes (`ErrorBanner` with Retry) for the directory; no for the drill-down | friendly | The `Promise.all(...).then` for the drill-down has no catch or error read, so the employee list can be empty or an unhandled rejection. | Open |
| Admin | modules/admin/EmployeeDirectory.tsx:44-95 | `getAllEmployees({status:'Active'})` | yes (`loading`) | no | logged only | | Open |
| Admin | modules/admin/components/EmployeeDetailPage.tsx:84-148 | `employees_with_department` / `applicants` detail; `employee_documents` list | no | no | logged only | | Open |
| Admin | EmployeeDetailPage.tsx:164-220 | `handleResetPasswordConfirm` (local portal-account upsert) | yes (`resetState`) | yes (`resetError`) | raw msg | Same fire-and-forget Supabase mirror as §0.6. | Open |
| Admin | EmployeeDetailPage.tsx:245-268 | `handleCreateRequest` (`createDocumentRequest`) | yes (`requestSaving`) | yes (`requestError`) | raw msg | | Open |
| Admin | modules/admin/components/ChangePositionModal.tsx:44-84 | `listDepartments`, positions from `employees_with_department` + `applicants` | no | no | logged only | | Open |
| Admin | ChangePositionModal.tsx:86-175 | `handleSubmit`: update `applicants` or `employees`, insert `employee_history` | yes (`loading`) | partial | `alert()` | Fixed message "Employee records table not yet available" for any employees-update error. The history insert is unchecked (sb-noreject). | Open |
| Admin | modules/admin/SupervisorAccessPage.tsx:34-90 | `getSupervisors`; `resetSupervisorPassword` | yes (`loading`/`resetting`) | yes (`loadError`) | raw msg | Password shown on screen, with a clipboard copy (failure silent). | Open |
| Admin | components/RaterManagementPage.tsx | see §1 | | | | Route `/admin/rsp/raters`. | Open |
| Admin | hooks/useRealtimeRefresh.ts:14-68 | Supabase realtime channel subscribe | n/a | no | n/a | Silent on disconnect. | Open |
| Admin | contexts/AuthContext.tsx | `getSession`, `profiles` select, `signInWithPassword`, `signOut` | `loading` | no | logged only | **Not mounted.** `RoleDashboard` and `RoleBasedSidebar` are the only consumers. | Open |

## 9. Empty catch blocks and catches that only log

The scan matched `catch {}` / `catch (e) {}` with an empty or comment-only body, `.catch(() => {})` and similar no-ops, and catches whose whole body is `console.*`. It found 180 sites.

Counts: 71 empty or comment-only catches, 106 console-only catches, 3 promise no-op catches. Many of the empty ones are benign storage or JSON-parse guards, tagged **[storage]** below. Line numbers are the `catch` keyword line. Some context phrases are the first statement of the try block.

### 9.1 Empty or comment-only `catch` blocks

**App and shell**
- App.tsx:384 – rater-access poll transient check (interviewer revoke).
- App.tsx:546 – `supabase.auth.signOut` on revoked-interviewer acknowledge.
- components/AdminLayout.tsx:52 – `readAdminSession` parse [storage].
- components/LogoutConfirmPopover.tsx:67 – `supabase.auth.signOut` on admin logout.
- components/RailNav.tsx:101, 106, 118 – sessionStorage highlight [storage].
- main.tsx:27 – purge legacy localStorage [storage].
- lib/adminSession.ts:57, 67, 72 – session write and clear [storage].
- lib/employeeSession.ts:59, 69, 74 – session write and clear [storage].
- lib/theme.ts:30, 40, 100, 143 – theme and accent [storage].
- lib/applicantSchedule.ts:21 – schedule cache write [storage].
- lib/notifications.ts:49 – last-seen write [storage].
- lib/interviewerEvalNavigation.ts:23 – score-setup read [storage].
- lib/evaluationScores.ts:130, 156 – local evaluation and snapshot JSON parse [storage].
- lib/email.ts:53 – parse error body (falls back to the status message).
- lib/api/competencyMatching.ts:73 – parse error body.
- lib/api/employeeNotifications.ts:48 – mark-read update [non-fatal].
- lib/api/employeesApi.ts:191, 228 – job and department lookup while hiring (ignored).
- lib/api/officeRoles.ts:551 – optional `performance_reviews` reroute.
- lib/api/succession.ts:1559, 1576 – succession config table unreadable (falls back silently).
- lib/plantillaSlots.ts:332 – slot applicant-count view, falls through to the link-table count.
- lib/recruitmentData.ts:517 – JSON parse in `toStringList`.
- lib/recruitmentData.ts:855 – `applicants` lookup before `saveNewlyHired` ("save rows as provided").
- lib/recruitmentData.ts:1058 – read portal accounts [storage].
- lib/hiringFlow.ts:356 – `sendEmail` of credentials (RSP can print instead).
- lib/hiringFlow.ts:374 – `saveNewlyHired` after credentials issued.
- lib/hiredApplicantSync.ts:20, 43, 66, 83, 101, 126, 206, 231, 248, 301 – boot-sync session flag [storage] and per-step ignore blocks (empty tails of `try`). Tails at 207, 302 and 67 are console-only.

**RSP**
- modules/admin/RSPDashboard.tsx:541 – `saveRaterAccessState` localStorage write.
- RSPDashboard.tsx:2769 – `handleDeleteJob` (the 4 `allSettled` deletes, empty catch).
- RSPDashboard.tsx:2787 – `handleToggleJobStatus` (empty catch).
- RSPDashboard.tsx:2906 – `handleDeleteRater` (empty catch).
- components/ApplicantRankingPage.tsx:79 – FastAPI applicants fetch (falls through to Supabase).
- ApplicantRankingPage.tsx:175 – `auth.getSession` token.
- ApplicantRankingPage.tsx:185 – direct Supabase status update on "mark for hiring".
- ApplicantRankingPage.tsx:197 – FastAPI PATCH status.
- components/ForHiringPage.tsx:99 – cached scores JSON parse [storage].
- ForHiringPage.tsx:107 – `evaluations` select in `buildCompletedSet`.
- ForHiringPage.tsx:159 – `job_postings` select.
- ForHiringPage.tsx:194, 199 – local score parse [storage].
- ForHiringPage.tsx:269 – `getNewlyHiredFromSupabase`.
- ForHiringPage.tsx:278 – portal accounts [storage].
- ForHiringPage.tsx:302 – FastAPI applicants fetch.
- ForHiringPage.tsx:310 – Supabase applicants fallback ("local store only").
- components/QualifiedApplicantsPage.tsx:196 – audit log localStorage write.
- QualifiedApplicantsPage.tsx:215 – `createSignedUrl` (falls to the public URL).
- QualifiedApplicantsPage.tsx:223 – `getPublicUrl` (final fallback).
- components/SalaryGradesPage.tsx:370 – affected-count query (intentional; count stays null).
- components/RaterManagementPage.tsx:69 – `saveRaterAccessState` [storage].

**Interviewer**
- modules/interviewer/InterviewerLogin.tsx:117, 138 – `last_login` update on login (in mock mode and in connected mode).
- InterviewerApplicantsList.tsx:695 – `updateApplicantStatus` secondary-client write.
- EvaluationForm.tsx:107, 327 – score snapshot and setup localStorage [storage].
- EvaluationForm.tsx:464 – applicant status `Reviewed` update after evaluation.
- EvaluationForm.tsx:492 – recruitment-store status sync.
- ApplicantDetailsPage.tsx:582, 603, 638, 668, 687, 708 – score setup, education, experience, written, finalized and draft localStorage reads and writes [storage].
- ApplicantDetailsPage.tsx:980 – linked-applicants lookup for the evaluation fallback.
- ApplicantDetailsPage.tsx:1009 – direct evaluation lookup (continues to the linked-id fallback).
- ApplicantDetailsPage.tsx:1109 – `resolveEvaluationOnly` by email.
- ApplicantDetailsPage.tsx:1184 – realtime attachments refetch.
- ApplicantDetailsPage.tsx:1518 – `auth.getUser` for `disqualified_by`.
- ApplicantDetailsPage.tsx:1912 – `mockDatabase` score update.

**Applicant**
- modules/applicant/ApplicantWizard.tsx:149 – appointment-type cache [storage].
- ApplicantWizard.tsx:803 – preview cache parse [storage].
- ApplicantWizard.tsx (~839) – `findExistingApplication` lookup (returns null, so the duplicate check is skipped).
- modules/applicant/ApplicationStatusPage.tsx:88 – `loadDocReviews` [storage].
- ApplicationStatusPage.tsx:398 – `fetchAttachments` ("silently ignore").
- ApplicationStatusPage.tsx:418 – `fetchRecord` polling ("silently ignore").
- modules/applicant/flow/applicationDrafts.ts:91, 99, 166 – session drafts and applied cache [storage].

**Employee, PM, L&D, other**
- modules/employee/EmployeePage.tsx:266, 270, 282 – sessionStorage subtab [storage].
- modules/employee/EmployeePhase2.tsx:140 – draft cache parse [storage].
- EmployeePhase2.tsx:167, 252 – draft cache write and remove [storage].
- modules/admin/pm/OfficeAccountConsole.tsx:445 – `loadUserSession` (outage looks like "no office role").
- modules/admin/pm/demo/session.ts:27, 35 – demo session [storage].
- modules/admin/pm/demo/api.ts:143 – `loadDemoOffset` (keeps the last known offset).
- modules/admin/LNDDashboard.tsx:198 – localStorage [storage].

### 9.2 Catches whose whole body is `console.*` (error logged, nothing shown)

- components/ApplicationsListPage.tsx:300 – `removeSelectedFromShortlist` status revert.
- components/JobPortalPage.tsx:82 – `syncJobs` (job list empty).
- components/QualifiedApplicantsPage.tsx:1129 – credentials `sendEmail` `.catch`.
- components/QualifiedApplicantsRSPPage.tsx:78 – `applicants` select (no error).
- components/QualifiedApplicantsRSPPage.tsx:183 – whole `loadData` (leaves an empty list).
- components/Sidebar.tsx:56 – badge fallback.
- contexts/AuthContext.tsx:79 – `initializeAuth`.
- lib/api/employeePortal.ts:553 – (employee-portal helper).
- lib/api/employeesApi.ts:108 – backend hire unreachable (falls back to the client path).
- lib/api/ipcrApproval.ts:56 – audit write ("best-effort").
- lib/api/ipcrApproval.ts:173, 284 – approval or return notification.
- lib/api/ipcrRatings.ts:376, 389, 667 – notification inserts.
- lib/api/ipcrTargets.ts:254 – employee lookup.
- lib/employeeDocuments.ts:504 – download fallback to `window.open`.
- lib/employeePortalData.ts:82 – portal-account Supabase upsert.
- lib/employeePortalData.ts:218 – accounts localStorage write.
- lib/employeePortalData.ts:294 – password-reset audit log.
- lib/hiredApplicantSync.ts:67, 207, 302 – boot sync tails.
- lib/hiringFlow.ts:125 – `fetchHiringContext`.
- lib/interviewerAccess.ts:73 – assigned-applicants lookup.
- lib/notifications.ts:129 – `fetchNotifications`.
- lib/plantillaSlots.ts:99, 157 – slot and link fetch.
- lib/recruitmentData.ts:733 – applicants save to Supabase.
- lib/recruitmentData.ts:902 – `saveNewlyHired` upsert exception.
- lib/recruitmentData.ts:1029, 1036, 1046 – employee-number allocator fetches.
- modules/admin/EmployeeDirectory.tsx:89 – directory load.
- modules/admin/IPCRManagementPage.tsx:170 – load.
- modules/admin/LNDDashboard.tsx:403 – six-way load.
- modules/admin/LndSummaryOfRatings.tsx:62 – load.
- modules/admin/PMDashboard.tsx:808 – `loadIpcrStats`.
- modules/admin/RSPDashboard.tsx:1130 – clipboard copy.
- modules/admin/RSPDashboard.tsx:2820 – `handleCreateRater` persist.
- modules/admin/SettingsPage.tsx:107 – profile load [storage].
- modules/admin/SuperAdminDashboard.tsx:104 – stats.
- modules/admin/components/ChangePositionModal.tsx:50, 80 – department and position lists.
- ChangePositionModal.tsx:159 – `employee_history` log (non-critical).
- modules/admin/components/EmployeeDetailPage.tsx:100, 129, 143 – detail, applicant and document fetches.
- EmployeeDetailPage.tsx:271 – clipboard.
- modules/admin/pm/CompetencyGapPanel.tsx:86 – recommendations.
- modules/admin/pm/OfficeAccountConsole.tsx:226 – bell notifications.
- modules/admin/pm/PMIPCRManagement.tsx:1130, 1651 – phase states.
- modules/admin/pm/SemesterSummarySection.tsx:66 – load.
- modules/admin/pm/SummaryOfRatings.tsx:231 – load.
- modules/applicant/ApplicationStatusPage.tsx:663 – status update on re-upload.
- ApplicationStatusPage.tsx:681 – localStorage mirror.
- modules/employee/EmployeePhase2.tsx:146 – `loadSheet`.
- modules/interviewer/ApplicantDetailsPage.tsx:1549, 1554 – activity-log insert, status write.
- ApplicantDetailsPage.tsx:1752 – resubmission insert.
- ApplicantDetailsPage.tsx:1779 – resubmission email.
- modules/interviewer/InterviewerApplicantsList.tsx:548, 565 – applicants fetch (primary and secondary).
- modules/interviewer/InterviewerDashboard.tsx:324, 334, 342 – jobs, primary and secondary fetch.
- utils/errorLogger.ts:36 – log-storage write.

### 9.3 Promise no-op catches

- components/JobDetailsPage.tsx:133 – `loadJobPostings().catch(() => undefined)`.
- modules/admin/LoginPage.tsx:76 – `supabase.auth.signOut({scope:'local'}).catch(() => {})`.
- modules/admin/SeminarEnrollment.tsx:555 – `generateRecommendations().catch(() => {})`.
- lib/api/ipcrWorkspace.ts:154, 291 – promise `.catch` no-ops on notification or audit side effects.
