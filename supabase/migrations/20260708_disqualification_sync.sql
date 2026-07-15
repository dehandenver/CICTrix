-- ============================================================================
-- RSP MODULE — Disqualification Status Sync (RSP -> Public Application Tracker)
-- Created: 2026-07-08
--
-- Purpose:
--   Give disqualification a real audit trail and a visibility-gated
--   applicant-facing message, and make sure the sensitive parts of that
--   trail (who disqualified the applicant, and any message the admin marked
--   as internal-only) never reach the public, unauthenticated tracker.
--
-- Notes:
--   - No migration file for `applicants` exists in this repo (it predates
--     this migrations folder), so this file is additive-only (ADD COLUMN IF
--     NOT EXISTS) and does not assume/alter the table's current shape.
--   - status stays 'Not Qualified' for a disqualified applicant — that value
--     already works end-to-end (STATUS_BADGE + stageStatesForStatus in
--     ApplicationStatusPage.tsx already treat it as the rejected/disqualified
--     state). This migration does not introduce a new status enum value.
--   - `applicant_tracker_view` is the public-safe read surface: it nulls
--     disqualification_message when disqualification_message_visible is
--     false, and omits disqualified_by entirely. The tracker page should
--     query this view instead of the base `applicants` table.
-- ============================================================================

BEGIN;

-- 1) applicants — disqualification audit fields
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS disqualified_at timestamptz,
  -- Legacy free-text reason. Written by ApplicantDetailsPage/QualifiedApplicantsPage
  -- and read by the tracker, but never created by an earlier migration.
  ADD COLUMN IF NOT EXISTS disqualification_reason text,
  ADD COLUMN IF NOT EXISTS disqualification_reason_category text,
  ADD COLUMN IF NOT EXISTS disqualification_message text,
  ADD COLUMN IF NOT EXISTS disqualification_message_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disqualified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT false;


-- 2) application_activity_log — real audit trail powering the tracker timeline
CREATE TABLE IF NOT EXISTS application_activity_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id      uuid NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  event_type          text NOT NULL,
  event_label         text NOT NULL,
  event_description   text,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visible_to_applicant boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS application_activity_log_application_idx
  ON application_activity_log (application_id);
CREATE INDEX IF NOT EXISTS application_activity_log_visible_idx
  ON application_activity_log (application_id, visible_to_applicant);


-- ============================================================================
-- Row Level Security — application_activity_log
-- Admin roles: full access (drives the RSP portal's Activity tab, including
-- internal-only notes with visible_to_applicant = false).
-- Public/anon: SELECT only rows explicitly marked visible_to_applicant = true.
-- Applicants look this table up by application id (already known from their
-- applicant record lookup), not by an authenticated session.
-- ============================================================================
ALTER TABLE application_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_activity_log_admin_all ON application_activity_log;
CREATE POLICY application_activity_log_admin_all
  ON application_activity_log
  FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'))
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND'));

DROP POLICY IF EXISTS application_activity_log_public_read ON application_activity_log;
CREATE POLICY application_activity_log_public_read
  ON application_activity_log
  FOR SELECT
  USING (visible_to_applicant = true);


-- ============================================================================
-- applicant_tracker_view — public-safe read surface for the tracker
-- Same compatibility-view pattern as employees_with_department
-- (20260518210000_create_employees_with_department_view.sql), but explicit
-- (not `a.*`) so confidential columns are structurally excluded rather than
-- merely hidden by the frontend: disqualified_by is omitted entirely, and
-- disqualification_message is redacted via CASE when not marked visible.
-- Column list matches ApplicationRecord in
-- src/modules/applicant/ApplicationStatusPage.tsx plus the new
-- disqualification fields.
-- ============================================================================
DROP VIEW IF EXISTS applicant_tracker_view CASCADE;

CREATE VIEW applicant_tracker_view AS
SELECT
  a.id,
  a.item_number,
  a.first_name,
  a.last_name,
  a.email,
  a.contact_number,
  a.position,
  a.office,
  a.status,
  a.created_at,
  a.updated_at,
  a.application_type,
  a.disqualification_reason,
  a.exam_date,
  a.exam_time,
  a.oral_exam_date,
  a.oral_exam_time,
  a.interview_date,
  a.interview_time,
  a.venue,
  a.schedule_instructions,
  a.disqualified_at,
  a.disqualification_reason_category,
  a.is_final,
  CASE
    WHEN a.disqualification_message_visible THEN a.disqualification_message
    ELSE NULL
  END AS disqualification_message,
  a.disqualification_message_visible
  -- disqualified_by is intentionally omitted — never exposed to the public tracker.
FROM applicants a;

GRANT SELECT ON applicant_tracker_view TO anon, authenticated, service_role;

-- Reload PostgREST's schema cache so the new view/columns are immediately
-- visible to the REST API. Without this, the tracker fails with
-- "Could not find the table 'public.applicant_tracker_view' in the schema cache".
NOTIFY pgrst, 'reload schema';

COMMIT;
