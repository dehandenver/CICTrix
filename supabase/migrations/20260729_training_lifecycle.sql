-- ============================================================================
-- Training lifecycle: planning / published / locked + the 3-day lock rule.
-- Created: 2026-07-29.
--
-- Lifecycle status is DERIVED, not stored, so it can never drift:
--   * locked    — now() >= start_date - 3 days (or the training has started/
--                 finished). Enforced here by a trigger.
--   * published — every detail field is filled: facilitator (instructor_name),
--                 venue (location), description, materials, prerequisites, and
--                 at least one objective.
--   * planning  — only the 5 core fields are present (title, category, start/
--                 end date, capacity, objectives) and some detail field is blank.
-- planning vs published is computed in the app from field completeness; this
-- migration adds the missing detail columns and enforces the lock.
--
-- The lock is a HARD system rule, not a permission toggle: a BEFORE UPDATE
-- trigger rejects any change to a locked training's CONTENT fields, no matter
-- who (anon or authenticated) makes the request — the DB is the single point of
-- enforcement because the browser writes to training_sessions directly. Purely
-- operational columns (status, roster workflow timestamps) stay editable so a
-- session can still be marked Completed / Cancelled after it locks.
--
-- No scheduled job: because "locked" is computed from start_date, it is always
-- correct the instant the clock crosses start_date - 3 days.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- Detail fields required to reach 'published' (facilitator=instructor_name and
-- venue=location already exist from earlier migrations).
ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS description   text,
  ADD COLUMN IF NOT EXISTS materials     text,
  ADD COLUMN IF NOT EXISTS prerequisites text;

-- ── The lock rule ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_training_lock() RETURNS trigger AS $$
BEGIN
  -- Locked once we are within 3 days of the start (this also covers trainings
  -- that have already started or finished).
  IF now() >= (OLD.scheduled_date - interval '3 days') THEN
    IF ( NEW.title           IS DISTINCT FROM OLD.title
      OR NEW.category         IS DISTINCT FROM OLD.category
      OR NEW.scheduled_date   IS DISTINCT FROM OLD.scheduled_date
      OR NEW.end_date         IS DISTINCT FROM OLD.end_date
      OR NEW.capacity         IS DISTINCT FROM OLD.capacity
      OR NEW.objectives       IS DISTINCT FROM OLD.objectives
      OR NEW.instructor_name  IS DISTINCT FROM OLD.instructor_name
      OR NEW.location         IS DISTINCT FROM OLD.location
      OR NEW.description       IS DISTINCT FROM OLD.description
      OR NEW.materials        IS DISTINCT FROM OLD.materials
      OR NEW.prerequisites    IS DISTINCT FROM OLD.prerequisites
      OR NEW.program_id       IS DISTINCT FROM OLD.program_id
      OR NEW.is_internal      IS DISTINCT FROM OLD.is_internal
    ) THEN
      RAISE EXCEPTION 'Training is locked: editing closes 3 days before start.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_training_lock ON training_sessions;
CREATE TRIGGER trg_enforce_training_lock
  BEFORE UPDATE ON training_sessions
  FOR EACH ROW EXECUTE FUNCTION enforce_training_lock();

-- ── Seed: 6 published + 4 planning (August 2026) + 1 near-term demo row ───────
-- Fixed ids so re-running is a no-op. program_id null (standalone), no roster.
INSERT INTO training_sessions
  (id, program_id, title, category, scheduled_date, end_date, capacity, status, is_internal,
   objectives, instructor_name, location, description, materials, prerequisites)
VALUES
  -- 6 PUBLISHED (all detail fields filled)
  ('a1000000-0000-4000-8000-000000000001', NULL, 'Ethical Public Service Foundations', 'Cultural Transformation',
   '2026-08-04 09:00:00+08', '2026-08-05 16:00:00+08', 30, 'Scheduled', true,
   ARRAY['Explain the Code of Conduct for public officials','Apply ethical decision-making to LGU scenarios'],
   'Atty. Maria Santos', 'City Hall Training Room A', 'Two-day grounding in public-service ethics and accountability.',
   'Printed Code of Conduct handbook; case-study packet', 'None'),
  ('a1000000-0000-4000-8000-000000000002', NULL, 'Local Governance & LGU Operations', 'Leadership',
   '2026-08-06 09:00:00+08', NULL, 25, 'Scheduled', true,
   ARRAY['Describe the LGU organizational structure','Map service-delivery workflows'],
   'Dir. Roberto Cruz', 'City Hall Conference Hall', 'One-day overview of local governance operations.',
   'Slides; LGU org chart', 'Basic familiarity with LGU departments'),
  ('a1000000-0000-4000-8000-000000000003', NULL, 'Fiscal Management & LGU Budgeting', 'Technical',
   '2026-08-11 09:00:00+08', '2026-08-13 16:00:00+08', 20, 'Scheduled', true,
   ARRAY['Prepare an LGU annual budget','Interpret fiscal reports'],
   'CPA Jose Reyes', 'Budget Office Seminar Room', 'Hands-on budgeting workshop for finance staff.',
   'Laptops; spreadsheet templates', 'Spreadsheet basics'),
  ('a1000000-0000-4000-8000-000000000004', NULL, 'Digital Literacy for Government Services', 'Technical',
   '2026-08-14 09:00:00+08', '2026-08-15 16:00:00+08', 40, 'Scheduled', true,
   ARRAY['Use the e-services portal','Practice safe data handling'],
   'Engr. Carla Mendoza', 'ICT/MIS Computer Lab', 'Digital skills for front-line service delivery.',
   'Lab computers; e-services guide', 'None'),
  ('a1000000-0000-4000-8000-000000000005', NULL, 'Community Engagement & Public Communication', 'Employee Development',
   '2026-08-18 09:00:00+08', '2026-08-19 16:00:00+08', 35, 'Scheduled', true,
   ARRAY['Design a community consultation','Deliver clear public messaging'],
   'Ms. Angela Flores', 'City Hall Training Room B', 'Building trust through effective community engagement.',
   'Workbook; sample IEC materials', 'None'),
  ('a1000000-0000-4000-8000-000000000006', NULL, 'Disaster Risk Reduction & Management Drill', 'Technical',
   '2026-08-25 09:00:00+08', '2026-08-26 16:00:00+08', 50, 'Scheduled', true,
   ARRAY['Execute the LGU emergency response plan','Coordinate evacuation procedures'],
   'DRRMO Chief Daniel Lim', 'Municipal Evacuation Center', 'Field drill on disaster preparedness and response.',
   'Safety vests; two-way radios; response manual', 'Cleared for physical activity'),
  -- 4 PLANNING (core fields only; detail fields blank)
  ('a1000000-0000-4000-8000-000000000007', NULL, 'Records Management Modernization', 'Technical',
   '2026-08-07 09:00:00+08', '2026-08-08 16:00:00+08', 20, 'Scheduled', true,
   ARRAY['Adopt the new records-classification scheme'], NULL, NULL, NULL, NULL, NULL),
  ('a1000000-0000-4000-8000-000000000008', NULL, 'Leadership in Public Administration', 'Leadership',
   '2026-08-20 09:00:00+08', '2026-08-21 16:00:00+08', 15, 'Scheduled', true,
   ARRAY['Strengthen team leadership in a public setting'], NULL, NULL, NULL, NULL, NULL),
  ('a1000000-0000-4000-8000-000000000009', NULL, 'Transparency & Accountability Workshop', 'Cultural Transformation',
   '2026-08-27 09:00:00+08', NULL, 25, 'Scheduled', true,
   ARRAY['Apply transparency practices to daily work'], NULL, NULL, NULL, NULL, NULL),
  ('a1000000-0000-4000-8000-000000000010', NULL, 'Change Management for LGUs', 'Employee Development',
   '2026-08-28 09:00:00+08', '2026-08-29 16:00:00+08', 30, 'Scheduled', true,
   ARRAY['Lead teams through organizational change'], NULL, NULL, NULL, NULL, NULL),
  -- 1 DEMO row: starts within 3 days of the seed date, so it is already LOCKED
  -- while still in planning — makes the dashboard "went live incomplete" warning
  -- visible immediately. Safe to keep; it simply demonstrates the rule.
  ('a1000000-0000-4000-8000-000000000011', NULL, 'New-Hire Onboarding Orientation', 'Employee Development',
   '2026-07-18 09:00:00+08', NULL, 20, 'Scheduled', true,
   ARRAY['Complete new-hire onboarding requirements'], NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
