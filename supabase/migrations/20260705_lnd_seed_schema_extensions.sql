-- ============================================================
-- Migration: LND/PM Seed Schema Extensions
-- Date: 2026-07-05
-- Purpose: Adds columns + tables required to support full LND
--          demo seed data. All statements use IF NOT EXISTS
--          guards and are safe to apply to any environment.
-- ⚠️  Run this BEFORE executing scripts/seed-demo-data.mjs.
-- ============================================================

BEGIN;

-- ── 1. training_requests: add LND-specific profiling columns ─────────────────
ALTER TABLE training_requests
  ADD COLUMN IF NOT EXISTS category text
    CHECK (category IN (
      'Cultural Transformation','Employee Development','Leadership','Technical'
    )),
  ADD COLUMN IF NOT EXISTS competency text,
  ADD COLUMN IF NOT EXISTS rationales text[],
  ADD COLUMN IF NOT EXISTS current_proficiency integer
    CHECK (current_proficiency BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS desired_proficiency integer
    CHECK (desired_proficiency BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS after_training_metric text,
  ADD COLUMN IF NOT EXISTS post_training_proficiency integer;

-- ── 2. training_sessions: add instructor, internal flag, plan status ──────────
ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS instructor_name text,
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS plan_status text
    CHECK (plan_status IN ('Proposed','Approved','Needs Budget','Confirmed')),
  ADD COLUMN IF NOT EXISTS source_request_id uuid
    REFERENCES training_requests(id) ON DELETE SET NULL;

-- ── 3. training_enrollments: add attendance + pre/post-test columns ───────────
ALTER TABLE training_enrollments
  ADD COLUMN IF NOT EXISTS attendance_status text
    CHECK (attendance_status IN ('Present','Absent','Excused')),
  ADD COLUMN IF NOT EXISTS pre_test_score  numeric,
  ADD COLUMN IF NOT EXISTS post_test_score numeric,
  ADD COLUMN IF NOT EXISTS evaluation_type text NOT NULL DEFAULT 'quiz_score'
    CHECK (evaluation_type IN ('quiz_score','file_submission')),
  ADD COLUMN IF NOT EXISTS submission_file_path text;

-- ── 4. Individual Development Plans ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idp_entries (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  goal_title     text        NOT NULL,
  competency_name text,
  target_date    date,
  current_level  integer     CHECK (current_level BETWEEN 1 AND 5),
  target_level   integer     CHECK (target_level  BETWEEN 1 AND 5),
  status         text        NOT NULL DEFAULT 'In Progress'
                             CHECK (status IN ('In Progress','Completed','Deferred')),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE idp_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'idp_entries' AND policyname = 'idp_admin_all'
  ) THEN
    CREATE POLICY idp_admin_all ON idp_entries FOR ALL
      USING (
        (auth.jwt()->'user_metadata'->>'role') IN ('ADMIN','PM','LND')
        OR (auth.jwt()->>'role') IN ('super-admin','pm','lnd')
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'idp_entries' AND policyname = 'idp_self_read'
  ) THEN
    -- Employees can read their own IDP entries.
    -- Matches against the old-schema column user_account_id.
    CREATE POLICY idp_self_read ON idp_entries FOR SELECT
      USING (
        employee_id IN (
          SELECT id FROM employees WHERE user_account_id = auth.uid()
        )
      );
  END IF;
END;
$$;

-- ── 5. Focus Group Discussion notes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fgd_notes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  department      text        NOT NULL,
  session_date    date        NOT NULL,
  facilitator     text,
  participants    text[],
  training_need   text        NOT NULL,
  category        text
                  CHECK (category IN (
                    'Cultural Transformation','Employee Development','Leadership','Technical'
                  )),
  competency_name text,
  notes           text,
  source_label    text        NOT NULL DEFAULT 'FGD',
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fgd_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fgd_notes' AND policyname = 'fgd_admin_all'
  ) THEN
    CREATE POLICY fgd_admin_all ON fgd_notes FOR ALL
      USING (
        (auth.jwt()->'user_metadata'->>'role') IN ('ADMIN','PM','LND')
        OR (auth.jwt()->>'role') IN ('super-admin','pm','lnd')
      );
  END IF;
END;
$$;

COMMIT;
