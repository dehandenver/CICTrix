# IPCR — Office validation + Phase 2 open/close — Test Plan

Extends the previous Phase 2 gating work. New: admin edit/override before approval,
approval auto-locks Phase 2 + notifies, and an explicit **Close Rating Period**
action (`closed` state) alongside Open.

## Prerequisite — apply migrations (Supabase → SQL Editor)

`20260718` (from the prior task) **and** `20260719` (new) must be applied:

```sql
-- 20260719: add the 'closed' state
ALTER TABLE target_settings DROP CONSTRAINT IF EXISTS target_settings_phase2_status_check;
ALTER TABLE target_settings ADD CONSTRAINT target_settings_phase2_status_check
  CHECK (phase2_status IN ('not_started','locked','open','in_progress','completed','closed'));
ALTER TABLE target_settings
  ADD COLUMN IF NOT EXISTS phase2_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS phase2_closed_by text;
NOTIFY pgrst, 'reload schema';
```

## Req 1 — Office validates (edit/override → approve) gates everything

| # | Test | Expected |
|---|------|----------|
| 1.1 | Employee submits Phase 1 | `status = submitted_for_approval`; appears in Office Console → Targets → pending list |
| 1.2 | Office clicks **Edit / Override** on a submission | MFO titles + Success Indicator text become inline inputs |
| 1.3 | Change text → **Save Edits** | `mfos.title` / `success_indicators.description` updated; `ipcr_audit_log` gets an `admin_edit` row (actor + time); list refreshes with new text |
| 1.4 | **Return for Revision** (optional comment) | `status = returned_for_revision`; employee edits + resubmits → back to pending |
| 1.5 | **Approve & Freeze** | `status = approved`; **`phase2_status` auto-set to `locked`**; `phase2_open_target_date` = approval + ~5 months; approve audit row |
| 1.6 | Employee notified on approval | One `employee_notifications` row, type `ipcr_validated`: "Your IPCR targets have been validated and are now locked for this rating period." |
| 1.7 | Immutability | After approval, editing MFO/SI is rejected server-side (DB trigger) — Edit/Override is only offered while pending |
| 1.8 | **Approve ≠ open** | Phase 2 stays LOCKED after approval; employee sees only the locked notice, not the rating form |

## Req 2 — Phase 1 grayed/locked visual
Unchanged from prior task: Phase 1 tab inputs + frozen SI text render grayed (bg-slate-100, muted, inset, no focus) with lock icons — consistent with the server-side freeze.

## Req 3 — Per-Success-Indicator Phase 2
Unchanged: per-indicator achievement + Q/E/T + row Average, group averages, overall (unweighted mean = existing formula with no weights).

## Req 4 — Open AND Close

| # | Test | Expected |
|---|------|----------|
| 4.1 | LOCKED employee view | Only the exact locked notice + expected-open date; **no** form fields in the DOM |
| 4.2 | Office → Ratings → **Open Rating Period** | Every `locked` approved record → `open`; `phase2_opened_by/at` recorded; `phase2_open` notification per employee |
| 4.3 | Employee after open | Editable per-indicator table; unread notifications marked read on view |
| 4.4 | Save Draft / Submit | `open → in_progress` (partial) → `completed` (submit) |
| 4.5 | Office → **Close Rating Period** (while some are open/in_progress, not all submitted) | Those records → `closed`; `phase2_closed_by/at` recorded; `phase2_closed` notification per employee. `completed` records left as-is. **Not an error** that some hadn't finished |
| 4.6 | Employee after close (had saved work) | Read-only table showing their **saved** ratings (no data loss) + the CLOSED notice (distinct copy: "…has closed… for your reference…"), not the LOCKED copy |
| 4.7 | Employee after close (never started) | Read-only empty table + the closed notice |
| 4.8 | Re-run Open/Close when none match | "No … records to …" — idempotent |

## Req 5 — Three distinct notifications
`ipcr_validated` (approve) · `phase2_open` (open) · `phase2_closed` (close) — separate `employee_notifications` rows with distinct copy, not collapsed.

## Status mapping (flagged, mapped — no parallel field)
`submitted_for_approval → returned_for_revision / approved` (Phase 1) → approval auto-sets `phase2_status = locked → (Open) open → (save) in_progress → (submit) completed` OR `(Close) closed`. Spec's `PHASE2_SUBMITTED` = `completed`.

## Known follow-ups
- Open/Close are bulk across all matching records (not yet department-scoped — `listRatableTargets`/pending lists aren't office-scoped yet; per-cycle scoping is supported via the optional `cycleId` param).
- No IPCR-PDF regeneration in the completed/closed view; overall score shown instead.
- `employee_notifications` rows are created + auto-read on Phase 2 open; a bell/badge isn't surfaced yet (`listEmployeeNotifications` is ready).
