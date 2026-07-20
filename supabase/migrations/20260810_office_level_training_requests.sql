-- ============================================================
-- Migration: Office-level training requests
-- Date: 2026-08-10
-- Purpose: A training request is a request for a TOPIC, not for a
--          person. The office names a competency, a topic and its
--          reasoning; L&D decides whether to run it. Who attends is
--          settled later and separately, through the recommendation
--          pipeline (training_recommendations), where the system
--          proposes attendees and the office reviews them.
--
--          The old shape forced every request to name an employee,
--          which conflated "we need this training" with "this person
--          should attend it" and made the office pick attendees
--          before a course even existed.
-- ============================================================

BEGIN;

-- ── 1. employee_id becomes optional ─────────────────────────────────────────
-- Kept (not dropped) so historical per-employee requests stay readable and
-- training_sessions.source_request_id keeps resolving.
ALTER TABLE training_requests
  ALTER COLUMN employee_id DROP NOT NULL;

-- ── 2. Attribute the request to the office, not the employee ────────────────
-- Office scoping previously had to go through the employee's department. With
-- no employee, the office must be recorded on the request itself.
ALTER TABLE training_requests
  ADD COLUMN IF NOT EXISTS requesting_office text,
  ADD COLUMN IF NOT EXISTS requested_by text;

-- ── 3. Backfill so existing rows keep their office attribution ──────────────
UPDATE training_requests tr
   SET requesting_office = e.department
  FROM employees e
 WHERE tr.employee_id = e.id
   AND tr.requesting_office IS NULL;

UPDATE training_requests tr
   SET requested_by = TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,''))
  FROM employees e
 WHERE tr.employee_id = e.id
   AND tr.requested_by IS NULL;

-- Office consoles filter by this on every load.
CREATE INDEX IF NOT EXISTS idx_training_requests_requesting_office
  ON training_requests (requesting_office);

-- Reload PostgREST's schema cache so the new columns are visible to the REST
-- API immediately instead of erroring as "not found in the schema cache".
NOTIFY pgrst, 'reload schema';

COMMIT;
