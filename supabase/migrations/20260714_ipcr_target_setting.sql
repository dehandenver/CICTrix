-- ============================================================================
-- IPCR Phase 1 — Target Setting (relational MFOs) + department weighting
-- Created: 2026-07-14
--
-- Context discovered in the live database, which shapes this migration:
--
--   * Phase 1 targets are currently three free-text columns on ipcr_workspace
--     (core_target / strategic_target / support_target). This migration adds
--     the relational MFO / success-indicator model that Phase 2 will attach
--     accomplishment + rating rows to. The text columns are NOT dropped: the
--     Phase 2 UI and the generated IPCR PDF still read them, so the frontend
--     keeps them in sync as a denormalised summary.
--
--   * Cycles reuse the existing `performance_cycles` table. Its PK is INTEGER
--     (not uuid) and its label column is `title` (not `name`), so
--     target_settings.cycle_id is integer.
--
--   * `employees` has NO department_id column — `employees.department` is a
--     plain varchar name. The only real FK to `departments` is
--     office_role_assignments.office_id / ipcr_workspace.office_id. So
--     department_weighting_configs keys on departments(id), and callers must
--     resolve an employee's department through ipcr_workspace.office_id.
--
--   * Employees and Office Accounts do NOT use Supabase Auth. They authenticate
--     against employee_portal_accounts and hold a localStorage session, so they
--     reach PostgREST as `anon` and auth.uid() is NULL for them. RLS therefore
--     cannot distinguish one employee from another.
--
--       - Weighting writes are locked to service_role. The FastAPI backend
--         performs the RBAC check (DeptHead for that department) and writes with
--         the service key. An anon client cannot insert or update a config.
--
--       - target_settings / mfos / success_indicators keep the same posture as
--         the pre-existing 20260520_allow_employee_ipcr_writes.sql: writable by
--         anon, enforcement in the app layer. This is a KNOWN GAP, tracked
--         separately; it is not made worse here, but it is not fixed either.
--
-- Idempotent: safe to re-apply.
-- ============================================================================

BEGIN;

-- ── 1. The only three legal weighting splits ────────────────────────────────
-- A lookup table rather than editable percentages: department configs reference
-- a row here by FK, so an invalid split is unrepresentable, not merely rejected.
CREATE TABLE IF NOT EXISTS weighting_schema_options (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text    NOT NULL UNIQUE,
  strategic_weight numeric NOT NULL CHECK (strategic_weight >= 0 AND strategic_weight <= 100),
  core_weight      numeric NOT NULL CHECK (core_weight      >= 0 AND core_weight      <= 100),
  support_weight   numeric NOT NULL CHECK (support_weight   >= 0 AND support_weight   <= 100),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weighting_schema_options_code_check
    CHECK (code IN ('A', 'B', 'C')),
  CONSTRAINT weights_sum_100
    CHECK (strategic_weight + core_weight + support_weight = 100)
);

INSERT INTO weighting_schema_options (code, strategic_weight, core_weight, support_weight)
VALUES ('A', 50, 50,  0),
       ('B',  0, 60, 40),
       ('C', 30, 50, 20)
ON CONFLICT (code) DO UPDATE
  SET strategic_weight = EXCLUDED.strategic_weight,
      core_weight      = EXCLUDED.core_weight,
      support_weight   = EXCLUDED.support_weight;


-- ── 2. A department's active weighting, versioned ───────────────────────────
-- Changing a weighting inserts a new row and deactivates the old one, so a
-- cycle rated last year keeps the weights that were active when it was rated.
CREATE TABLE IF NOT EXISTS department_weighting_configs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id      uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  schema_option_id   uuid NOT NULL REFERENCES weighting_schema_options(id) ON DELETE RESTRICT,
  is_active          boolean NOT NULL DEFAULT true,
  set_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  effective_from     timestamptz NOT NULL DEFAULT now(),
  deactivated_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- An inactive row must record when it stopped applying; an active one must not.
  CONSTRAINT dwc_deactivated_at_matches_is_active
    CHECK ((is_active AND deactivated_at IS NULL) OR (NOT is_active AND deactivated_at IS NOT NULL))
);

-- "Only one active weighting config per department at a time."
CREATE UNIQUE INDEX IF NOT EXISTS department_weighting_configs_one_active_idx
  ON department_weighting_configs (department_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS department_weighting_configs_department_idx
  ON department_weighting_configs (department_id, effective_from DESC);


-- ── 3. One target setting per employee per cycle ────────────────────────────
CREATE TABLE IF NOT EXISTS target_settings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid    NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_id       integer NOT NULL REFERENCES performance_cycles(id) ON DELETE RESTRICT,
  status         text    NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at   timestamptz,
  reviewed_by    uuid REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  review_comment text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT target_settings_employee_cycle_uniq UNIQUE (employee_id, cycle_id),
  -- A submitted/approved/rejected row must say when it was submitted.
  CONSTRAINT target_settings_submitted_at_present
    CHECK (status = 'draft' OR submitted_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS target_settings_employee_cycle_idx
  ON target_settings (employee_id, cycle_id);


-- performance_cycles is empty in production, and target_settings.cycle_id is a
-- NOT NULL FK to it, so Phase 1 cannot be saved until a cycle exists. Seed the
-- current calendar year if the table has no rows at all.
-- status is constrained to ('Active','Completed','Planned') by
-- 20260518_pm_performance_evaluations_and_competencies.sql — capitalised.
INSERT INTO performance_cycles (title, start_date, end_date, status)
SELECT
  to_char(now(), 'YYYY') || ' Performance Cycle',
  make_date(EXTRACT(YEAR FROM now())::int, 1, 1),
  make_date(EXTRACT(YEAR FROM now())::int, 12, 31),
  'Active'
WHERE NOT EXISTS (SELECT 1 FROM performance_cycles);


-- ── 4. MFOs and their success indicators ────────────────────────────────────
-- Real tables, not a JSON blob: Phase 2 hangs accomplishment + rating rows off
-- these exact ids.
CREATE TABLE IF NOT EXISTS mfos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_setting_id uuid NOT NULL REFERENCES target_settings(id) ON DELETE CASCADE,
  function_type     text NOT NULL CHECK (function_type IN ('core', 'strategic', 'support')),
  title             text NOT NULL DEFAULT '',
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfos_target_setting_idx
  ON mfos (target_setting_id, function_type, sort_order);

CREATE TABLE IF NOT EXISTS success_indicators (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mfo_id      uuid NOT NULL REFERENCES mfos(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS success_indicators_mfo_idx
  ON success_indicators (mfo_id, sort_order);


-- ── 5. Access ───────────────────────────────────────────────────────────────
-- Weighting: readable by everyone, writable only by service_role (FastAPI).
-- RLS is enabled with a SELECT-only policy; no INSERT/UPDATE/DELETE policy
-- exists, so those are denied for anon and authenticated. The table grants are
-- revoked too, so a future permissive policy cannot silently reopen the hole.
ALTER TABLE weighting_schema_options     ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_weighting_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weighting_schema_options_read ON weighting_schema_options;
CREATE POLICY weighting_schema_options_read
  ON weighting_schema_options FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS department_weighting_configs_read ON department_weighting_configs;
CREATE POLICY department_weighting_configs_read
  ON department_weighting_configs FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON weighting_schema_options     FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON department_weighting_configs FROM anon, authenticated;
GRANT  SELECT ON weighting_schema_options     TO anon, authenticated;
GRANT  SELECT ON department_weighting_configs TO anon, authenticated;

-- Target setting: employees reach PostgREST as anon (no Supabase Auth), so RLS
-- cannot tell one employee from another. Same posture as
-- 20260520_allow_employee_ipcr_writes.sql. KNOWN GAP — enforcement is in the
-- app layer until employee auth moves behind FastAPI or Supabase Auth.
ALTER TABLE target_settings     DISABLE ROW LEVEL SECURITY;
ALTER TABLE mfos                DISABLE ROW LEVEL SECURITY;
ALTER TABLE success_indicators  DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON target_settings    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON mfos               TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON success_indicators TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
