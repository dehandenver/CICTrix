-- ============================================================================
-- Succession Planning: critical positions + succession candidates.
-- Created: 2026-07-20.
--
-- The RSP Portal's Succession Planning view drills down:
--   Departments → Critical Positions → Ranked Candidates
--
--   * critical_positions   — a job title an RSP admin has EXPLICITLY flagged as
--                            requiring a succession plan, scoped to a department.
--                            The incumbent link + criticality reason are optional
--                            context. Marking critical is a deliberate action,
--                            never inferred.
--   * succession_candidates — employees an RSP admin nominated as potential
--                            successors for one critical position. Ranking is NOT
--                            stored here; it is derived live at query time from the
--                            candidate's latest completed IPCR overall score, so it
--                            never goes stale.
--
-- Access: same anon-open posture as the other IPCR/RSP tables (RLS disabled,
-- grants to anon+authenticated). The management UI lives inside the RSP Portal,
-- which is already access-gated; enforcement is app-layer.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- ── Critical positions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS critical_positions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id         uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  -- Nullable: a critical position may be vacant, or the incumbent may not be an
  -- employee record we can link. ON DELETE SET NULL so removing an employee never
  -- deletes the position (which is the thing the plan hangs off of).
  incumbent_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  criticality_reason    text,
  created_by            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS critical_positions_dept_idx
  ON critical_positions (department_id);

-- ── Succession candidates ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS succession_candidates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  critical_position_id uuid NOT NULL REFERENCES critical_positions(id) ON DELETE CASCADE,
  employee_id          uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  note                 text,
  added_by             text,
  added_at             timestamptz NOT NULL DEFAULT now(),
  -- The same employee can't be nominated twice for the same position.
  CONSTRAINT succession_candidates_unique UNIQUE (critical_position_id, employee_id)
);

CREATE INDEX IF NOT EXISTS succession_candidates_position_idx
  ON succession_candidates (critical_position_id);

-- ── Access — app-layer enforcement, consistent with the other IPCR tables ────
ALTER TABLE critical_positions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE succession_candidates DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON critical_positions    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON succession_candidates TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
