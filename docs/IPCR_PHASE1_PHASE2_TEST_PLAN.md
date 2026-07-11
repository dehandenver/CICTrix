# IPCR Phase 1 + Phase 2 — Test Plan & Runbook

Covers the RSP→portal sync, the historical seeder, the Phase 1 approval state
machine, and the new Phase 2 per-indicator QET rating. All server-side
enforcement is in the database (triggers + CHECK constraints) so it holds even
against a direct PostgREST write, not just the UI.

## 0. Setup / runbook

Requires `.env` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service role).

```bash
# 1. Apply migrations (Supabase dashboard or CLI), in order:
#    20260714_ipcr_target_setting.sql
#    20260715_ipcr_phase1_workflow_phase2.sql
#    20260716_ipcr_designated_approvers.sql   ← new

# 2. Sync the whole RSP roster into both portals (idempotent, re-runnable):
npm run sync:rsp

# 3. Seed a frozen Phase 1 + blank Phase 2 shell for every synced employee:
npm run seed:ipcr-historical
```

`sync:rsp` and `seed:ipcr-historical` are both safe to run repeatedly.

## 1. RSP → portal sync (`scripts/sync-rsp-portals.mjs`)

| # | Test | Expected |
|---|------|----------|
| 1.1 | Run `npm run sync:rsp` on a fresh DB | Every **Active** employee gets one `employee_portal_accounts` row; summary prints created/backfilled counts |
| 1.2 | Run it **again** | 0 created; existing logins keep their password/username; only missing profile fields backfilled (idempotent — match on `employee_number`) |
| 1.3 | An employee whose `position` contains Head/Chief/Director/Supervisor/Manager | Gets an Active `office_role_assignments` row (DeptHead vs Supervisor per keyword) for their resolved office; a plain staffer does **not** |
| 1.4 | Employee who is both a dept head and an ordinary employee | `ipcr_designated_approvers.is_dual_role = true` |
| 1.5 | Approver resolution | `approver_source = 'reports_to'` when `reports_to` is set to another active employee; else `'office_dept_head'`; else `'unassigned'` (surfaced as "TBD - Assign Approver") |
| 1.6 | `approver_employee_id` is never the employee themselves | Guaranteed by `ipcr_designated_approvers_not_self` CHECK |

## 2. Historical seeder (`scripts/seed-ipcr-historical.mjs`)

| # | Test | Expected |
|---|------|----------|
| 2.1 | Run after the sync | One APPROVED/frozen `target_settings` per employee under a **Completed** cycle "January–June 2026" |
| 2.2 | Content relevance | Accounting/payroll → finance MFOs; IT/helpdesk → systems MFOs; Records → document-mgmt MFOs; unmatched positions → the generic fallback template. Grouped Core/Strategic/Support |
| 2.3 | Approver | `approved_by` / `reviewed_by` = the designated approver, **never** the employee (holds even for dual-role heads — verify a head's frozen record is approved by someone else) |
| 2.4 | Audit trail | `ipcr_audit_log` has past-dated `submit` → (≈⅓ of records) `admin_edit` → `approve` |
| 2.5 | Phase 2 shell | Every success indicator has a `success_indicator_ratings` row with Q/E/T all `null`, `rated_by` = approver; `target_settings.phase2_status = 'not_started'` |
| 2.6 | Workspace mirror | `ipcr_workspace` row per employee, period "January–June 2026", status "Targets Submitted", flattened targets present |
| 2.7 | Re-run | No duplicates; children replaced, audit reset, same approved end-state |

## 3. Phase 1 approval state machine

| # | Test | Expected |
|---|------|----------|
| 3.1 | Employee saves draft → **Submit Targets for Approval** | `status: draft → submitted_for_approval`; employee can no longer edit (locked) |
| 3.2 | Submission appears in Office Account Console → Targets → Individual Target Verification | Listed with its MFOs/indicators |
| 3.3 | Office Account edits an MFO/indicator before approving | Edit persists (admin can correct, not just approve/reject) |
| 3.4 | **Return for Revision** with a comment | `status → returned_for_revision`; employee can edit and re-submit → back to `submitted_for_approval`; `review_comment` cleared on re-submit |
| 3.5 | **Approve & Freeze** | `status → approved`, `approved_by`/`approved_at` set |
| 3.6 | **Immutability** — try to UPDATE/INSERT/DELETE an MFO or success indicator of an approved record (direct PostgREST, bypassing UI) | Rejected by trigger `ipcr_block_edit_when_approved` ("approved and frozen") |
| 3.7 | Phase 2 ratings on an approved record | Allowed — the trigger deliberately exempts `success_indicator_ratings` |

## 4. Self-approval block (dual-role edge case)

| # | Test | Expected |
|---|------|----------|
| 4.1 | Log in as a dual-role head who submitted their own IPCR; open it in the Office Account Console | Approve/Return controls replaced with "This is your own IPCR — must be approved by another office account" |
| 4.2 | Force `approveTargets` with `approver = submitter` (client) | Rejected: "You cannot approve your own IPCR." |
| 4.3 | Direct DB write setting `approved_by = employee_id` | Rejected by `target_settings_no_self_approval` CHECK |

## 5. Phase 2 QET rating (`Office Account Console → Ratings → Review`)

| # | Test | Expected |
|---|------|----------|
| 5.1 | Open the Ratings tab | Left list shows every frozen IPCR with a `not_started/in_progress/completed` chip and `rated/total` progress |
| 5.2 | Select a record | Frozen MFO + Success Indicator text shown **read-only**; Q/E/T dropdowns (1–5) per indicator |
| 5.3 | Score some (not all) indicators → **Save Progress** | `target_settings.phase2_status = 'in_progress'`; values persist on reload; per-indicator rows written to `success_indicator_ratings` as three separate integers |
| 5.4 | **Complete Rating** disabled until every indicator has all three dimensions | Button greyed with tooltip; enabled only when complete |
| 5.5 | Complete | `phase2_status = 'completed'`, `phase2_completed_at` set; category averages + overall score + adjectival rolled up into `ipcr_workspace`; notice shows overall + adjectival |
| 5.6 | Storage check | No pre-averaged value stored per indicator — Q/E/T are three integer columns; averaging happens only at roll-up/read |
| 5.7 | Rater opens **their own** frozen IPCR to rate | Inputs hidden, "must be rated by another Office Account" notice; `saveRatings` rejects `rater == employee` |
| 5.8 | A different Office Account changes a value another rater entered | `overridden_by`/`overridden_at` set; "edited by office" chip shows |

## Notes / known follow-ups

- Neither the pending-approval list nor the ratable-records list is scoped to the
  rater's office yet (both list all) — a shared follow-up, mirrored from the
  existing `listPendingApprovals`.
- Employees/Office Accounts authenticate as PostgREST `anon` (no Supabase Auth),
  so identity-dependent guards (self-approval/self-rating) live in the app layer;
  identity-independent ones (approved-record immutability, `approved_by <> employee_id`)
  are enforced in the database and cannot be bypassed by a direct client write.
