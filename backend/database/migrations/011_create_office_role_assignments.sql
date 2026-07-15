-- ============================================================================
-- CREATE office_role_assignments + access_change_audit TABLES
-- Module 1 · Tab 1.1 · Subtab: Access & Role Management (Phase 2).
--
-- office_role_assignments is the authoritative control record for who holds a
-- Supervisor or Department Head role in which office, plus the Office Account
-- credential generated for them. Revoking sets status='Revoked' (history is
-- never deleted) and may hand the role to a successor.
--
-- access_change_audit is the accountability log: who made each access change,
-- what role/office was affected, and when.
-- Created: 2026-06-30
-- ============================================================================

CREATE TABLE IF NOT EXISTS office_role_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  employee_id           uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_name         text,                       -- snapshot, survives employee deletion
  office_id             uuid REFERENCES departments(id) ON DELETE SET NULL,
  office_name           text,                       -- snapshot

  role                  text NOT NULL CHECK (role IN ('Supervisor', 'DeptHead')),

  -- Auto-generated / linked Office Account credentials.
  account_username      text,
  account_password      text,
  must_change_password  boolean NOT NULL DEFAULT true,

  status                text NOT NULL DEFAULT 'Active'
                          CHECK (status IN ('Active', 'Revoked')),

  assigned_by           text,
  assigned_at           timestamptz NOT NULL DEFAULT now(),

  -- Populated when access is revoked / transferred out.
  revoked_by            text,
  revoked_at            timestamptz,
  revoke_reason         text,
  successor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  successor_name        text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_role_assignments_office
  ON office_role_assignments (office_id);
CREATE INDEX IF NOT EXISTS idx_office_role_assignments_employee
  ON office_role_assignments (employee_id);
CREATE INDEX IF NOT EXISTS idx_office_role_assignments_status
  ON office_role_assignments (status);

CREATE OR REPLACE FUNCTION office_role_assignments_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_office_role_assignments_updated_at ON office_role_assignments;
CREATE TRIGGER trg_office_role_assignments_updated_at
  BEFORE UPDATE ON office_role_assignments
  FOR EACH ROW EXECUTE FUNCTION office_role_assignments_set_updated_at();


CREATE TABLE IF NOT EXISTS access_change_audit (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action                text NOT NULL CHECK (action IN ('assign', 'revoke', 'transfer', 'reroute')),
  role                  text,
  office_name           text,
  employee_name         text,
  successor_name        text,
  performed_by          text,
  details               text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_change_audit_created_at
  ON access_change_audit (created_at DESC);

-- Disable RLS so the frontend Supabase anon client can read/write, matching the
-- pattern used for supervisors (010) and employee_portal_accounts (008).
ALTER TABLE office_role_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE access_change_audit     DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON office_role_assignments TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON access_change_audit     TO authenticated, anon;
