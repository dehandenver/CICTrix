-- ============================================================================
-- IPCR designated approvers — resolves "who approves this employee's own IPCR"
-- Created: 2026-07-16
-- Builds on 20260715_ipcr_phase1_workflow_phase2.sql.
--
-- Why a table and not just a lookup at approval time:
--
--   * Dual-role users (a department head who is also the Office Account for their
--     own office) must NOT approve their own IPCR. The self-approval block is
--     already enforced (target_settings CHECK approved_by <> employee_id, plus a
--     client guard). But blocking self-approval is not enough — someone else has
--     to be nominated, or the record can never be approved. This table records
--     that nominee, computed once by the RSP→portal sync from real org data:
--       1. the employee's own reports_to supervisor, else
--       2. the Active Dept Head of their office (when that is a different person),
--          else
--       3. nobody yet — surfaced as "TBD - Assign Approver".
--
--   * The historical seeder reads approver_employee_id to set approved_by on the
--     frozen Phase 1 record and rated_by on the Phase 2 rating shell, so both the
--     sync and the seed agree on a single, never-self approver.
--
-- Idempotent: safe to re-apply.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ipcr_designated_approvers (
  employee_id          uuid PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  approver_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  -- How the approver was chosen, for the "why this person" explanation in the UI.
  approver_source      text NOT NULL DEFAULT 'unassigned'
                         CHECK (approver_source IN ('reports_to', 'office_dept_head', 'unassigned')),
  -- True when this employee holds an Active Office Account (Supervisor/DeptHead)
  -- over their OWN office, i.e. the dual-role case the self-approval block exists
  -- for. Purely informational; the block itself is enforced elsewhere.
  is_dual_role         boolean NOT NULL DEFAULT false,
  -- Snapshot of the office used to resolve the approver, for auditability.
  office_id            uuid REFERENCES departments(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- Defence in depth: a designated approver may never be the employee themselves,
  -- mirroring target_settings_no_self_approval.
  CONSTRAINT ipcr_designated_approvers_not_self
    CHECK (approver_employee_id IS NULL OR approver_employee_id <> employee_id)
);

CREATE INDEX IF NOT EXISTS ipcr_designated_approvers_approver_idx
  ON ipcr_designated_approvers (approver_employee_id);

CREATE INDEX IF NOT EXISTS ipcr_designated_approvers_dual_role_idx
  ON ipcr_designated_approvers (is_dual_role) WHERE is_dual_role;

-- Same access posture as the rest of the IPCR tables: employees/Office Accounts
-- reach PostgREST as anon and read this to render the approver banner. The sync
-- writes it with the service key, but anon writes are left open to match the
-- existing IPCR tables (KNOWN GAP, enforcement is app-layer).
ALTER TABLE ipcr_designated_approvers DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON ipcr_designated_approvers TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
