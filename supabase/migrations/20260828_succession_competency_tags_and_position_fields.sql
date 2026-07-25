-- ============================================================================
-- Succession Planning — phase 2 schema
-- Created: 2026-07-26.  REVIEW BEFORE APPLYING.
--
-- Adds three things the succession rebuild needs as first-class data:
--   1. critical_positions.incumbent_leaving_date  — the incumbent's expected
--      leaving/retirement date (official OCBO succession-plan column).
--   2. succession_candidate_remarks               — per-candidate free-text
--      Remarks, editable by RSP admin (official form's Remarks column).
--   3. employee_training_competencies             — a REAL many-to-many join
--      between an L&D Archive training record and a competency, replacing the
--      title/keyword heuristic the Stage-2 competency match currently uses.
--
-- TAXONOMY GUARANTEE (per review request):
--   employee_training_competencies.competency_id references public.competencies
--   — the EXACT same table critical_position_competency_requirements.competency_id
--   references. So a position's required competencies and a training's tags are
--   rows in one shared 12-competency taxonomy; there is no second taxonomy in
--   play on the succession side.
--
--   NOTE: a separate table `training_competency_tags` also exists — it is the
--   L&D *Training Calendar* session-tagging taxonomy (near-identical 12 names,
--   one spacing variant on "Fiscal Management / Budgeting for LGU"). We do NOT
--   reference it here; succession stays entirely on `competencies` to keep the
--   guarantee. (Reconciling the two taxonomies into one is a separate cleanup.)
-- ============================================================================

BEGIN;

-- ── 1. Incumbent leaving/retirement date on the critical position ───────────
ALTER TABLE critical_positions
  ADD COLUMN IF NOT EXISTS incumbent_leaving_date date;

COMMENT ON COLUMN critical_positions.incumbent_leaving_date IS
  'Expected leaving/retirement date of the current incumbent, for the succession plan timeline. Null when unknown/not applicable.';

-- ── 2. Per-candidate Remarks (works for auto-discovered AND manual candidates) ─
--    Remarks can't live on succession_candidates: auto-discovered candidates
--    have no row there. This keyed table lets RSP annotate ANY candidate under a
--    position without first "adding" them. One remark per (position, employee).
CREATE TABLE IF NOT EXISTS succession_candidate_remarks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  critical_position_id  uuid NOT NULL REFERENCES critical_positions(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  remarks               text,
  updated_by            text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (critical_position_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_scr_position ON succession_candidate_remarks (critical_position_id);

-- ── 3. Training record ↔ competency join (replaces the keyword heuristic) ────
CREATE TABLE IF NOT EXISTS employee_training_competencies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_training_id  uuid NOT NULL REFERENCES employee_training(id) ON DELETE CASCADE,
  -- TODO(tech-debt): `competencies` and `training_competency_tags` are two
  -- separate 12-entry tables for the same taxonomy (one spacing variant on
  -- "Fiscal Management / Budgeting"). Reconcile them into one in a dedicated
  -- migration — until then, succession tagging MUST reference `competencies`
  -- (see the header note on this migration). A calendar-side tagging UI built
  -- against training_competency_tags would silently mismatch this join.
  competency_id         uuid NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_training_id, competency_id)
);

CREATE INDEX IF NOT EXISTS idx_etc_training   ON employee_training_competencies (employee_training_id);
CREATE INDEX IF NOT EXISTS idx_etc_competency ON employee_training_competencies (competency_id);

COMMENT ON TABLE employee_training_competencies IS
  'Many-to-many: which competencies (public.competencies) a completed L&D Archive training (employee_training) develops. Shares the same competency taxonomy as critical_position_competency_requirements. Replaces the Stage-2 title/keyword heuristic.';

-- ── 4. Anon-open posture (matches the rest of the app; browser uses anon key) ─
ALTER TABLE succession_candidate_remarks      DISABLE ROW LEVEL SECURITY;
ALTER TABLE employee_training_competencies    DISABLE ROW LEVEL SECURITY;
GRANT ALL ON succession_candidate_remarks     TO anon, authenticated, service_role;
GRANT ALL ON employee_training_competencies   TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ── Verification (run after applying) ───────────────────────────────────────
-- \d employee_training_competencies
-- SELECT conname, confrelid::regclass FROM pg_constraint
--   WHERE conrelid = 'employee_training_competencies'::regclass AND contype='f';
--   -- expect competency_id -> competencies, employee_training_id -> employee_training
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='critical_positions' AND column_name='incumbent_leaving_date';
