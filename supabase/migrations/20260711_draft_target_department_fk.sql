-- ============================================================
-- Migration: training_course_drafts.target_department -> FK
-- Date: 2026-07-11
-- Purpose: A draft names the office whose Dept Head reviews it. That was
--          stored as free text, but department names in this database are
--          not a reliable key: employees_with_department.department contains
--          values absent from `departments`, and case-variant duplicates
--          ("Office of The City Accountant" vs "office of the city
--          accountant"). Matching a Dept Head to a draft by name would be
--          wrong the moment either side is retitled.
--
--          office_role_assignments.office_id is a clean uuid FK to
--          departments(id). Page 4's Dept Head review gate joins on that, so
--          the draft must key on the same uuid.
--
-- ⚠️  Run 20260710_lnd_training_pipeline.sql BEFORE this migration.
-- Idempotent: safe to re-apply.
-- ============================================================

BEGIN;

-- ── 1. Add the FK column ────────────────────────────────────────────────────
ALTER TABLE training_course_drafts
  ADD COLUMN IF NOT EXISTS target_department_id uuid
    REFERENCES departments(id) ON DELETE RESTRICT;

-- ── 2. Backfill from the old text column, if it is still present ────────────
-- Case- and whitespace-insensitive, since that is exactly how the text values
-- drifted. Runs only while target_department still exists, so re-applying this
-- migration after the drop is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'training_course_drafts' AND column_name = 'target_department'
  ) THEN
    UPDATE training_course_drafts t
       SET target_department_id = d.id
      FROM departments d
     WHERE t.target_department_id IS NULL
       AND t.target_department IS NOT NULL
       AND lower(btrim(t.target_department)) = lower(btrim(d.name));

    -- Refuse to drop the text column while any value failed to resolve:
    -- silently losing the reviewer assignment would be worse than aborting.
    IF EXISTS (
      SELECT 1 FROM training_course_drafts
       WHERE target_department IS NOT NULL AND target_department_id IS NULL
    ) THEN
      RAISE EXCEPTION
        'Cannot drop target_department: % draft(s) have a department name that matches no row in departments. Reconcile them first.',
        (SELECT count(*) FROM training_course_drafts
          WHERE target_department IS NOT NULL AND target_department_id IS NULL);
    END IF;
  END IF;
END;
$$;

-- ── 3. Every draft must name a reviewing office ─────────────────────────────
-- This is the invariant Page 4's review gate depends on: a draft with no
-- department has no Dept Head, so it can never leave 'Sent to Dept Head'.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM training_course_drafts WHERE target_department_id IS NULL) THEN
    RAISE EXCEPTION
      'Cannot set target_department_id NOT NULL: % draft(s) still have no department.',
      (SELECT count(*) FROM training_course_drafts WHERE target_department_id IS NULL);
  END IF;
END;
$$;

ALTER TABLE training_course_drafts
  ALTER COLUMN target_department_id SET NOT NULL;

-- ── 4. Retire the text column ───────────────────────────────────────────────
ALTER TABLE training_course_drafts DROP COLUMN IF EXISTS target_department;

-- Page 4 lists drafts awaiting a given Dept Head's office.
CREATE INDEX IF NOT EXISTS training_course_drafts_target_department_id_idx
  ON training_course_drafts (target_department_id, status);

-- ── 5. Match the review gate's lookup key ───────────────────────────────────
-- getActiveOfficeRole() resolves an employee to at most one Active assignment
-- per office; this index backs that lookup.
CREATE INDEX IF NOT EXISTS office_role_assignments_employee_active_idx
  ON office_role_assignments (employee_id, status);

COMMIT;
