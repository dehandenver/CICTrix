---
title: Fix the IPCR return-for-revision lockout and add an audit history tab
date: 2026-11-03
status: Approved
summary: A returned Phase 1 IPCR stays locked for the employee and blocks Phase 2 because two status records disagree. Fix that, then give the Office Account console a History tab per phase that reads the existing audit log.
---

## Goal

When a department head returns an employee's Phase 1 IPCR for revision, the employee sees "Needs Revision" with the reviewer's comment, can edit and resubmit even if the Phase 1 window has since closed, and reaches Phase 2 once the IPCR is approved. Employees who are already stuck are freed without a data change.

The Office Account console gets a History subtab in Phase 1 and in Phase 2. Each lists the reviewer's office's audit events, newest first, filterable by employee and action.

No saved mockup covers the History surface. It follows the table toolbar, table and pagination patterns in DESIGN_IDENTITY.md §9.4 to §9.6 and the status badges in §10.

## Approach

**Root cause.** `returnForRevision` ([ipcrApproval.ts](../../src/lib/api/ipcrApproval.ts)) updates only `target_settings.status`. The employee page treats `ipcr_workspace.status = 'Targets Submitted'` as pending as well (`isPendingApproval`, [EmployeePage.tsx](../../src/modules/employee/EmployeePage.tsx)), so a returned IPCR stays read-only and shows "Pending Approval". Phase 2 only unlocks on `approved`, so the employee cannot proceed.

**Part 1, lockout fix (UI and write path).**
- `isPendingApproval` ignores the workspace status when `target_settings` is `returned_for_revision`.
- `readOnly` and the closed-window banners skip the window check for a returned IPCR.
- `saveTargetSetting` skips the window guard for a returned record. Its status is read before the guard.
- `returnForRevision` also resets `ipcr_workspace.status` to `Draft Targets`, best-effort.
- No data migration. The UI guard frees employees who are already stuck, and their next resubmit overwrites the stale workspace status.

**Part 2, audit history.**
- The log table `ipcr_audit_log` already exists and is append-only. Nothing reads it.
- The employee's submit and resubmit are logged (`submit` for Phase 1, `submit_phase2` for Phase 2). The phase is derived from the action name through one mapping constant, so there is no schema change and no migration.
- A single audit-write helper returns success or failure. The action still succeeds when the write fails, and the banner adds "Saved, but the history entry could not be recorded." This includes the four inline inserts in [ipcrRatings.ts](../../src/lib/api/ipcrRatings.ts).
- A new `src/lib/api/ipcrAudit.ts` exposes `listAuditHistory({ phase, scope })`. It joins entries to the target setting and employee, filters to the reviewer's office with `getAcceptedOfficeNames`, and resolves the actor's name.
- One shared history component is used in both subtabs.

**Rejected.** A database trigger for the audit write: the app does not pass the acting employee through to the database, so the actor would be lost. A backfill migration for stuck employees: no behavioural gain and a production write.

**Out of scope.** `returnPhase2ForRevision` only resets `phase2_status`, so it does not have the two-record drift.

## Steps

1. Branch `fix/ipcr-return-lockout-and-audit-history` from `origin/main` and save this plan.
2. Part 1, each test first: a returned IPCR with a stale workspace status is editable and shows "Needs Revision"; a returned IPCR resubmits while the window is closed; a draft submit with the window closed is still rejected; returning resets the workspace status.
3. Audit helper that reports failure, the submit and resubmit entries, and the failure warning in the approval and rating banners.
4. `listAuditHistory` with the phase split, office scope and actor names.
5. The shared History component and the History subtab in Phase 1 and Phase 2.
6. Run the checks below.
7. Write the session summary and regenerate the plans dashboard.

## Risks

- Row-level security is off on `ipcr_audit_log`, so the office filter is applied in the app and not enforced by the database. This matches the pending list today.
- Entries for IPCRs that predate this change have no employee-submit events, so their history starts at the first reviewer action.
- A returned IPCR can be edited after the Phase 1 window closes. Only a supervisor's return allows that, and approval still gates the result.
- Tests use mocked data. Live rows were not checked, so how many employees are stuck is unknown.
- Both jobs ship on one branch, so the lockout fix waits for the History tab.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- DESIGN_IDENTITY.md §16 checklist for the History tab.
