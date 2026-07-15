# IPCR Phase 2 gating + per-indicator self-rating — Test Plan

Covers: frozen Phase 1 locked styling (Req 1), per-Success-Indicator Phase 2
(Req 2), the LOCKED→OPEN→SUBMITTED state machine with the exact notice (Req 3),
and the notification on open (Req 4).

## Prerequisite — apply migration `20260718_ipcr_phase2_gating.sql`

Run in **Supabase → SQL Editor** (DDL can't be applied from the app). Until this
runs, `phase2_status` is absent → the portal treats every record as **LOCKED**
(shows only the notice), and the Office "Open Self-Rating Period" button will error.

```sql
ALTER TABLE target_settings DROP CONSTRAINT IF EXISTS target_settings_phase2_status_check;
ALTER TABLE target_settings ADD CONSTRAINT target_settings_phase2_status_check
  CHECK (phase2_status IN ('not_started','locked','open','in_progress','completed'));
ALTER TABLE target_settings
  ADD COLUMN IF NOT EXISTS phase2_open_target_date date,
  ADD COLUMN IF NOT EXISTS phase2_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS phase2_opened_by text,
  ADD COLUMN IF NOT EXISTS phase2_submitted_at timestamptz;
ALTER TABLE success_indicator_ratings ADD COLUMN IF NOT EXISTS accomplishment text;
CREATE TABLE IF NOT EXISTS employee_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type text NOT NULL, title text NOT NULL, message text NOT NULL,
  period text, link text, is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now());
UPDATE target_settings SET phase2_status='locked'
  WHERE status='approved' AND phase2_status IN ('not_started');
UPDATE target_settings SET phase2_open_target_date=(COALESCE(approved_at,now())+interval '5 months')::date
  WHERE status='approved' AND phase2_open_target_date IS NULL;
ALTER TABLE employee_notifications DISABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON employee_notifications TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
```

(The full file is `supabase/migrations/20260718_ipcr_phase2_gating.sql`.)

## Req 1 — Phase 1 looks visibly locked when frozen

| # | Test | Expected |
|---|------|----------|
| 1.1 | Open an APPROVED employee's Phase 1 tab | MFO + Success Indicator inputs render **gray** (bg-slate-100, muted text, inset shadow, no focus ring), a **lock icon** sits next to each function-group label, badge reads "Approved & Locked" |
| 1.2 | Frozen SI text inside the Phase 2 rating table | Same grayed, read-only treatment (locked look), fully legible |
| 1.3 | Confirm still read-only server-side | Editing is blocked by the existing DB immutability trigger — unchanged |

## Req 2 — Per-Success-Indicator rating

| # | Test | Expected |
|---|------|----------|
| 2.1 | Open Phase 2 while OPEN (see Req 3) | A dense table grouped Core→Strategic→Support; each MFO is a subheader; **each Success Indicator is its own row** |
| 2.2 | Each row | frozen SI text (read-only, gray) + an **achievement** field + Q/E/T dropdowns (1–5) + a per-row **Average (A)** |
| 2.3 | No per-indicator Weight field | Correct — weight only ever existed at group level; indicator scores are unweighted |
| 2.4 | Averages | Row A = mean(Q,E,T); group A = mean of its rows' A; **Overall** = mean of the three group A's (matches existing simple-mean aggregation when no weights set) |

## Req 3 — Time-gate with exact notice

| # | Test | Expected |
|---|------|----------|
| 3.1 | Record is `locked` (right after approval) | Phase 2 shows **only** the amber notice with the exact copy below, plus "Expected to open around <Month Year>". **No** achievement fields or Q/E/T dropdowns exist in the DOM |
| 3.2 | Exact copy | "Notice: Your targets have been finalized and locked for this rating period. The Accomplishments & Self-Ratings module will be available after 4-5 months. We will notify you when the semester ends and the self-rating period opens." |
| 3.3 | Old "Accomplishment rating is currently closed" banner | Gone (replaced at source; the legacy per-group panel is dead-coded) |
| 3.4 | After the office opens the window → `open` | Full editable per-indicator table renders |
| 3.5 | Save Draft (partial) | `phase2_status → in_progress`; values persist on reload; table stays editable |
| 3.6 | Submit (all rows fully scored) | Submit enabled only when every indicator has Q, E, T; on submit `phase2_status → completed` |
| 3.7 | After submit → `completed` | Read-only grayed table + overall score; no editable controls |

## Req 3 trigger + Req 4 — Open action & notification

| # | Test | Expected |
|---|------|----------|
| 4.1 | Office Console → Ratings tab → **"Open Self-Rating Period"** | Confirms, then flips every LOCKED approved record to `open`, records `phase2_opened_by`/`phase2_opened_at` |
| 4.2 | Notification | One `employee_notifications` row per opened employee (type `phase2_open`), created in bulk |
| 4.3 | Employee opens Phase 2 after open | Sees the editable table; their unread `phase2_open` notifications are marked read |
| 4.4 | Re-run open when none locked | "No locked records to open" — idempotent, no duplicate opens |

## Status mapping (flagged conflict → resolution)
Extended the existing `target_settings.phase2_status` (no parallel field):
`approved → 'locked' → (office open) 'open' → (partial) 'in_progress' → (submit) 'completed'`.
`'not_started'` retained for back-compat and treated as locked.

## Known follow-ups
- The completed view doesn't regenerate the IPCR PDF (the old per-group flow did); overall score shows instead.
- Group-level weighting inputs aren't surfaced in the new table (overall is the unweighted mean, which equals the existing formula when no weights are set).
- A bell/badge for `employee_notifications` isn't surfaced yet — the rows are created and auto-marked read on Phase 2 open; `listEmployeeNotifications` is ready to power a badge.
