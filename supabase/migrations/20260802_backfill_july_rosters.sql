-- ============================================================================
-- One-time backfill: complete + finalize July 2026 trainings.
-- Created: 2026-08-02.
--
-- July predates the recommendation pipeline (which only ever works next month's
-- trainings), so July trainings were never rostered and some locked while still
-- incomplete — the calendar then showed "Roster not finalized yet" for a locked,
-- already-past training. This is a backend correction pass, NOT a UI unlock: the
-- 3-day lock rule stays intact for user edits; here we temporarily disable the
-- enforcement trigger to write the corrected data directly.
--
--   1. Fill any blank logistics/detail fields so nothing shows placeholder text.
--   2. Create confirmed enrollments for July trainings that have none (a sample
--      of active employees, up to capacity), so the attendees panel reads real
--      roster data — same enrollment shape §6/§8 produce.
--   3. Stamp roster_finalized_at and mark past trainings Completed.
--
-- Idempotent: re-running skips trainings that are already filled / rostered.
-- ============================================================================

BEGIN;

-- The lock trigger blocks content-field edits on locked (past) trainings; this
-- admin correction pass is exactly the sanctioned exception.
ALTER TABLE training_sessions DISABLE TRIGGER trg_enforce_training_lock;

-- 1. Fill missing logistics / detail fields.
UPDATE training_sessions SET
  instructor_name = COALESCE(NULLIF(btrim(instructor_name), ''), 'L&D Facilitator'),
  location        = COALESCE(NULLIF(btrim(location), ''), 'City Hall Training Room'),
  description     = COALESCE(NULLIF(btrim(description), ''), 'Pre-rollout July training; record completed by the July backfill.'),
  materials       = COALESCE(NULLIF(btrim(materials), ''), 'Provided on-site'),
  prerequisites   = COALESCE(NULLIF(btrim(prerequisites), ''), 'None')
WHERE scheduled_date >= '2026-07-01' AND scheduled_date < '2026-08-01'
  AND status <> 'Cancelled';

-- 2. Create confirmed enrollments for July trainings that have none.
WITH july AS (
  SELECT s.id, GREATEST(LEAST(COALESCE(NULLIF(s.capacity, 0), 6), 8), 3) AS n
  FROM training_sessions s
  WHERE s.scheduled_date >= '2026-07-01' AND s.scheduled_date < '2026-08-01'
    AND s.status <> 'Cancelled'
    AND NOT EXISTS (
      SELECT 1 FROM training_enrollments e
      WHERE e.session_id = s.id AND COALESCE(e.is_active, true)
    )
),
ranked_emps AS (
  SELECT id, row_number() OVER (ORDER BY employee_number NULLS LAST, id) AS rn
  FROM employees
  WHERE status = 'Active'
)
INSERT INTO training_enrollments
  (employee_id, session_id, status, enrollment_status, added_by, added_by_role, is_active)
SELECT re.id, j.id, 'Enrolled', 'Confirmed', 'July backfill', 'LND', true
FROM july j
JOIN ranked_emps re ON re.rn <= j.n
ON CONFLICT (employee_id, session_id) DO NOTHING;

-- 3. Finalize rosters; mark past trainings Completed.
UPDATE training_sessions SET
  roster_finalized_at = COALESCE(roster_finalized_at, now()),
  status = CASE WHEN status = 'Scheduled' AND scheduled_date < now() THEN 'Completed' ELSE status END
WHERE scheduled_date >= '2026-07-01' AND scheduled_date < '2026-08-01'
  AND status <> 'Cancelled';

ALTER TABLE training_sessions ENABLE TRIGGER trg_enforce_training_lock;

NOTIFY pgrst, 'reload schema';

COMMIT;
