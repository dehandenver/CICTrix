-- Module 4: Promotional Applications
-- Run after migration 016 (competency framework tables must exist).

-- Main application record. Stage moves through:
--   Submitted → Document Review → Dept Head Endorsement → PM Final Review → Approved | Denied
CREATE TABLE IF NOT EXISTS promotional_applications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        text,
  employee_name      text NOT NULL,
  current_position   text,
  target_position    text NOT NULL,
  department         text,
  stage              text NOT NULL DEFAULT 'Submitted',
  current_owner      text,
  notes              text,
  submitted_by       text,
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  stage_updated_at   timestamptz,
  stage_updated_by   text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Per-application document checklist rows (one row per required doc type).
CREATE TABLE IF NOT EXISTS promotional_application_docs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES promotional_applications(id) ON DELETE CASCADE,
  document_type   text NOT NULL,
  file_name       text,
  status          text NOT NULL DEFAULT 'Pending',
  notes           text,
  submitted_at    timestamptz,
  submitted_by    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Final decision record written when PM sets stage to Approved or Denied.
CREATE TABLE IF NOT EXISTS promotional_decisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid NOT NULL REFERENCES promotional_applications(id) ON DELETE CASCADE,
  employee_name    text NOT NULL,
  target_position  text NOT NULL,
  decision         text NOT NULL CHECK (decision IN ('Approved', 'Denied')),
  decided_by       text NOT NULL,
  notes            text,
  decided_at       timestamptz NOT NULL DEFAULT now()
);
