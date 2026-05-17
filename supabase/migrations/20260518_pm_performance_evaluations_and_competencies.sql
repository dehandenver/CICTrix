-- ============================================================================
-- PM MODULE — Performance Evaluations & Competency Tracking
-- Created: 2026-05-18
--
-- Purpose:
--   Back the Performance Management dashboard (PMDashboard.tsx) with live
--   tables in place of the hardcoded mock arrays.
--
--   1. performance_cycles      — kept defensive (already used by the code but
--                                no migration file existed; treat as upsert).
--   2. performance_evaluations — one row per employee per cycle, carries the
--                                evaluation workflow status and final IPCR
--                                score used by every dashboard widget.
--   3. competencies            — catalog of competencies tracked org-wide.
--   4. employee_competencies   — per-employee proficiency vs. required level;
--                                drives the "Skill Gap Alerts by Department"
--                                widget.
--
-- Notes:
--   - "Document requests" reuse the existing employee_documents table with
--     category='hr_request' (migration 006). No separate table here.
--   - "Upcoming Retirements" reads employees.date_of_birth (already present
--     in the live employees schema, migration 20260510). No new column.
--   - RLS follows the same admin-role gate used elsewhere in the project
--     (ADMIN/PM/RSP/LND can read+write; employees can read their own row).
-- ============================================================================

BEGIN;

-- 1) performance_cycles (defensive create; matches what code expects today)
CREATE TABLE IF NOT EXISTS performance_cycles (
  id          serial      PRIMARY KEY,
  title       text        NOT NULL,
  start_date  date        NOT NULL,
  end_date    date        NOT NULL,
  status      text        NOT NULL DEFAULT 'Planned'
              CHECK (status IN ('Active', 'Completed', 'Planned')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS performance_cycles_status_idx
  ON performance_cycles (status);


-- 2) performance_evaluations — workflow + IPCR score per employee per cycle
CREATE TABLE IF NOT EXISTS performance_evaluations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cycle_id        integer REFERENCES performance_cycles(id) ON DELETE SET NULL,

  -- Workflow status used by the Action Required Queue + Evaluation Status KPIs.
  status          text NOT NULL DEFAULT 'Planning'
                  CHECK (status IN (
                    'Planning',
                    'Self Evaluation',
                    'Supervisor Review',
                    'Approved',
                    'Rejected'
                  )),

  -- IPCR final score on the official adjectival scale (1.0 – 5.0).
  -- See feedback memory project_ipcr_rating_scale.md for the buckets used
  -- by getAdjectival() in SummaryOfRatings.tsx.
  final_score     numeric(4,2) CHECK (final_score IS NULL OR (final_score BETWEEN 0 AND 5)),

  period          text,                              -- e.g. 'Q1 2025', 'Jan – Jun 2025'
  supervisor_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  approved_at     timestamptz,
  rejection_reason text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (employee_id, cycle_id)
);

CREATE INDEX IF NOT EXISTS performance_evaluations_status_idx
  ON performance_evaluations (status);
CREATE INDEX IF NOT EXISTS performance_evaluations_cycle_idx
  ON performance_evaluations (cycle_id);
CREATE INDEX IF NOT EXISTS performance_evaluations_employee_idx
  ON performance_evaluations (employee_id);

CREATE OR REPLACE FUNCTION performance_evaluations_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS performance_evaluations_updated_at ON performance_evaluations;
CREATE TRIGGER performance_evaluations_updated_at
  BEFORE UPDATE ON performance_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION performance_evaluations_set_updated_at();


-- 3) competencies — catalog
CREATE TABLE IF NOT EXISTS competencies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  category    text,                                  -- 'Technical', 'Leadership', 'Soft Skills', ...
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- 4) employee_competencies — per-employee assessment driving skill-gap widget
CREATE TABLE IF NOT EXISTS employee_competencies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  competency_id    uuid NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,

  -- 1 (lowest) … 5 (highest). gap = required - proficiency, clamped at 0.
  proficiency_level integer NOT NULL CHECK (proficiency_level BETWEEN 1 AND 5),
  required_level    integer NOT NULL CHECK (required_level BETWEEN 1 AND 5),
  assessed_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (employee_id, competency_id)
);

CREATE INDEX IF NOT EXISTS employee_competencies_employee_idx
  ON employee_competencies (employee_id);
CREATE INDEX IF NOT EXISTS employee_competencies_competency_idx
  ON employee_competencies (competency_id);


-- ============================================================================
-- Row Level Security — admin roles read+write; employees see their own row.
-- ============================================================================
ALTER TABLE performance_cycles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_evaluations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE competencies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_competencies    ENABLE ROW LEVEL SECURITY;

-- performance_cycles: admin roles full access; everyone authenticated can read.
DROP POLICY IF EXISTS performance_cycles_admin_all ON performance_cycles;
CREATE POLICY performance_cycles_admin_all
  ON performance_cycles
  FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'))
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'));

DROP POLICY IF EXISTS performance_cycles_authenticated_read ON performance_cycles;
CREATE POLICY performance_cycles_authenticated_read
  ON performance_cycles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- performance_evaluations: admin roles full; employees read their own row.
DROP POLICY IF EXISTS performance_evaluations_admin_all ON performance_evaluations;
CREATE POLICY performance_evaluations_admin_all
  ON performance_evaluations
  FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'))
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'));

DROP POLICY IF EXISTS performance_evaluations_self_read ON performance_evaluations;
CREATE POLICY performance_evaluations_self_read
  ON performance_evaluations
  FOR SELECT
  USING (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

-- competencies: admin full; authenticated read.
DROP POLICY IF EXISTS competencies_admin_all ON competencies;
CREATE POLICY competencies_admin_all
  ON competencies
  FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'))
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'));

DROP POLICY IF EXISTS competencies_authenticated_read ON competencies;
CREATE POLICY competencies_authenticated_read
  ON competencies
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- employee_competencies: admin full; employees read own.
DROP POLICY IF EXISTS employee_competencies_admin_all ON employee_competencies;
CREATE POLICY employee_competencies_admin_all
  ON employee_competencies
  FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'))
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'));

DROP POLICY IF EXISTS employee_competencies_self_read ON employee_competencies;
CREATE POLICY employee_competencies_self_read
  ON employee_competencies
  FOR SELECT
  USING (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

COMMIT;
