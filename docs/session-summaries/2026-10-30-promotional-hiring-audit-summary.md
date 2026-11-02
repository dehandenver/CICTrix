---
title: Promotional hiring pipeline audit
date: 2026-10-30
summary: The promotion pipeline is partially implemented but not ready for end-to-end sign-off. Read-only evidence identifies selection, employee identity, account preservation, persistence, and authorization blockers.
---

## Outcome

**Not fully functional.** Application submission and scheduling have live evidence, but no completed promotional hire was found among non-deleted promotion applications. Two core defects were reproduced locally against the actual source using in-memory fixtures, without HTTP or database writes.

Plan: [Verify the promotional hiring pipeline](../plans/2026-10-30-promotional-hiring-audit.md).

> **Status since this audit (updated 2026-10-30).** This file records what the audit found; it is not the current state. Fixes are tracked in [Repair the promotional hiring pipeline](../plans/2026-10-30-promotional-hiring-fixes.md) (In Progress). Tasks 1–3 fixed fresh-browser promotion entry, durable score saves, and For Hiring visibility and ranking, including the `applicants.total_score` read. Task 3A fixed scheduled promotions hidden from interviewers (an `@example.com` "demo" filter). Tasks 4–8, covering completing the appointment and isolated acceptance, are not started. The remaining `applicants.total_score` **write** and the live-data seed test are covered by [Fix applicant score and status writes](../plans/2026-10-30-applicant-status-and-score-writes.md) (Draft). That plan also found the write is in unreachable code.

## Stage assessment

| Stage | Assessment | Evidence and limit |
| --- | --- | --- |
| Employee identification and prefill | Partial; fresh-browser login gap | `ApplicantWizard.tsx:1185-1192` validates the landing promotion login against local accounts only. The separate prefill effect at lines 467-478 does support a remote lookup, but is not called by that credential check. This is source inspection, not a live login test. |
| Application submission and scheduling | Live evidence, not newly exercised | One non-deleted `promotion` application is `Interview/Exam Scheduled`, linked to an existing employee and a plantilla. `ApplicantWizard.tsx:905-938` writes promotion identity fields into `applicants`. |
| Screening and promotion scoring | Implemented; not verified end to end | The RSP scoring UI distinguishes internal promotions and requires education, experience, performance, and potential; interviewer PCPT is separate. Live promotion has zero linked evaluations and zero category-score rows. Formula/service tests pass, but do not prove a promotion write/read round trip. |
| For Hiring and ranking | Broken | Prior-account/hire email filtering can hide a new qualified promotion. The separate ranking report reads `applicants.total_score`, which is absent from the deployed table, instead of joining `applicant_category_scores`. |
| Reservation / signing | Implemented and deployed; writes untested | `reserve_plantilla_slot` and `revoke_plantilla_reservation` exist. Reservation locks the slot and applicant; fill/archive/withdraw triggers are present. No reservation or fill was executed. |
| Appointment / employee update | Broken fallback; backend schema mismatch | Actual fallback reproduced inserting a second employee. Backend promotion update includes `employees.department_id`, absent in the live schema. |
| Existing portal-account preservation | Not correctly implemented in active generation flow | `hiringFlow.ts` unconditionally creates a temporary password and upserts a portal account after hiring; it does not branch for internal promotions or look up their existing account. |
| PM promotion eligibility | Incomplete and disconnected | Separate tables/module; empty score map always produces Pending. Component is not imported elsewhere in `src`. Approval only changes the PM request row; no bridge to hiring/employee updates was found. |
| Authorization | Unsafe | Live anonymous grants and permissive RLS allow reads/writes across hiring records, scores, employee records, and portal accounts; several relevant tables have RLS disabled. |

## Confirmed blockers

### Qualified promotions can disappear from For Hiring

`src/components/ForHiringPage.tsx:300-326` adds every prior hire email and cached portal-account email to `generatedEmails`, then excludes any new application with that email. Existing employees naturally already have such records. It does not distinguish the older application from the new promotion.

An isolated diagnostic extracted/transpiled the actual `includeApplicant` function and supplied a new qualified/completed application plus an existing-account email. Result: `included: false`. No network or live writes occurred. This verifies the filtering defect, not that the current live promotion has already encountered it.

### The fallback hires a second employee instead of promoting the existing one

`src/lib/api/employeesApi.ts:124-173` treats an existing employee number as a collision, generates another number, and inserts a new employee at lines 243-269. It also resets `date_hired` and can alter the email to avoid a perceived collision. No promotion-specific update branch exists in this fallback.

An isolated diagnostic ran the actual transpiled `hireApplicant` with mocked Supabase and deliberately unavailable HTTP. Assertions confirmed:

- Two employee rows after starting with one.
- The original employee remains unchanged in the old role.
- The new employee has a different number and a new hire date.
- No UPDATE to the existing employee occurred.
- No HTTP requests or live database writes occurred.

The Python backend has a promotion-specific update at `backend/app/routes/employees.py:163-174`, but writes `department_id`. Read-only `information_schema.columns` inspection confirms that column does not exist on the deployed `employees` table. The backend endpoint was not called because it mutates records; its deployed availability/version was not established.

### Credential generation does not preserve existing employee access

`src/lib/hiringFlow.ts:177-208` omits application type and existing employee/account identifiers from the reserved-applicant model. At lines 294-329 it always calls `hireApplicant`, creates a password, and upserts `portal-${employeeId}`. Depending on the existing account identifier and hire path, this can overwrite access or create another account rather than preserving the employee's credentials. This is source-confirmed behavior; no live account was changed.

`mustChangePassword` is also not persisted in the portal-account payload or restored by `portalAccountFromRow` (`src/lib/employeePortalData.ts:33-78`), so its fresh-browser enforcement cannot be assumed.

### Score saves can appear finalized even when persistence fails

`src/components/QualifiedApplicantsSection.tsx:746-753` marks the scoring modal finalized after invoking `onSave`. Its handler at lines 1667-1671 discards the promise/result of `saveApplicantCategoryScores`. That service writes the browser cache before attempting Supabase (`src/lib/api/applicantScores.ts:373-438`). A remote failure can therefore leave a locally finalized result with no durable score.

### Hiring authorization and credentials are exposed

Live metadata confirms anonymous SELECT/INSERT/UPDATE privileges on `applicants`, `employees`, `evaluations`, `plantilla_slots`, `applicant_category_scores`, and `employee_portal_accounts`. Enabled RLS on employee/account/score tables is permissive (`true` policies); `evaluations` and `plantilla_slots` have RLS disabled. Anonymous column privilege includes SELECT on the portal `password` column. No actual password values were queried.

Portal credentials are stored/compared as plaintext in `src/lib/employeePortalData.ts:33-36, 60-74, 109-112`; it also includes a hardcoded demo password at lines 154-158. Its value is intentionally not repeated here. This is not a server-authorized employee identity check.

Supabase security advisors also flag relevant RLS-disabled tables. [RLS advisory guidance](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).

### The separate PM promotion module is not a completed hiring integration

`src/lib/api/promotionalApplications.ts:308-312` always constructs an empty competency score map, so configured requirements report Pending even when the employee has a closed IPCR. `decideApplication` only updates `promotional_applications`; there are no live triggers on that table to update employees or create RSP applications. The live PM tables contain three applications and zero `application_documents` rows. Source search finds no import of `PMPromotionalApplications` outside its own file, so this is not evidence of an active PM-to-RSP pipeline.

## Verification

- `npx tsc --noEmit`: passed, exit 0.
- Initial unrestricted `npm test`: timed out after 120 seconds because discovery also traversed nested `.worktrees` and `.claude/worktrees`. No configuration was changed.
- `npm test -- --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"`: 132 files passed, one failed; **1,189 tests passed, one failed**. Existing relevant scoring, hiring-context, For Hiring, credential-page, and tracker tests passed. React act warnings were present.
- The sole scoped-suite failure is `scripts/seed-training-attendance.test.mjs:63`: expected 167 employees, received 172. That test invokes a live-data dry run with `writeSql: false` and `applyDb: false`; its fixed employee-count expectation is unrelated to promotional hiring. *(Later: the test counts active employees in the 5 seeded offices, not all employees; the fix is Step 5 of the applicant score and status plan.)*
- Two isolated actual-source diagnostics reproduced the selection filter and duplicate-employee fallback defects. These used only in-memory fixtures, not real writes.
- Supabase reads: deployed columns/view definition, constraints, triggers, reservation functions, RLS/policies/grants, aggregate promotion progress, PM row counts, security/performance advisors, and recent log queries.
- Recent logs included GET 400 requests using synthetic applicant ID `a1`; these are test-shaped requests and were not treated as evidence of a live promotion failure. Logs did not establish a successful promotional hire.

## Scope and deviations

Only this audit summary, its plan, and the generated plans dashboard were changed. No application implementation, schema, policies, employee records, accounts, decisions, appointments, or email sends were intentionally changed. No commits, pushes, or deployments were made. The pre-existing untracked `run-queue.bat` was left untouched.

Browser tabs were checked, but the app itself was not loaded. `src/main.tsx:57-63` automatically starts applicant-status/employee backfills and repair writes on page load; navigating the app could violate the approved read-only boundary. Browser and write-path end-to-end acceptance therefore remain untested. Completing an audit is not a sign-off on pipeline functionality.

Before a successful end-to-end sign-off, the promotion-specific defects and access controls need an approved remediation scope, followed by an isolated test that preserves employee UUID, employee number, original hire date, and existing credentials while updating the role and target plantilla.
