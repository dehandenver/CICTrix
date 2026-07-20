-- ============================================================================
-- Migration: Roster finalize/publish state lives on the session
-- Date: 2026-08-12
--
-- The Enrolled/Finalized and Published subtabs previously read
-- training_recommendations, which meant they could only ever show attendees who
-- arrived through the recommendation flow. July's 94 attendees did not: July was
-- planned during June, so its rosters were seeded straight into
-- training_enrollments and have no recommendation rows at all.
--
-- training_enrollments is the real answer to "who is attending" — it is what
-- enrollFinalAttendees writes, what the calendar renders, and what the employee
-- portal reads. So those two subtabs now read the roster, and finalize/publish
-- become properties of the SESSION's roster rather than of each recommendation.
-- That is also the truer shape: a roster is finalized as a whole, not per person.
--
-- The alternative — backfilling ~94 synthetic FINALIZED recommendation rows —
-- was rejected: it would write provenance that never happened (an AI suggestion
-- and an office review) into what is now an audit table.
--
-- Idempotent.
-- ============================================================================

BEGIN;

-- roster_finalized_at already exists; publishing needs its own stamp so the two
-- states stay distinguishable.
ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS roster_published_at timestamptz;

-- ── Backfill: July's rosters were finalized before July began ───────────────
-- The monthly cadence rule says a month's rosters are settled before the month
-- starts, so July's seeded rosters are finalized by definition. Only sessions
-- that actually have attendees are stamped — an empty roster was never
-- finalized, it was simply never built.
--
-- Publishing is deliberately NOT backfilled: it is a deliberate act with no
-- undo, and stamping it here would skip the review it represents.
UPDATE training_sessions s
   SET roster_finalized_at = COALESCE(
         s.roster_finalized_at,
         s.scheduled_date - interval '1 day'
       )
 WHERE s.scheduled_date >= date_trunc('month', now())
   AND s.scheduled_date <  date_trunc('month', now()) + interval '1 month'
   AND EXISTS (
     SELECT 1 FROM training_enrollments e
      WHERE e.session_id = s.id
        AND COALESCE(e.is_active, true)
   );

CREATE INDEX IF NOT EXISTS idx_training_sessions_roster_published
  ON training_sessions (roster_published_at);

NOTIFY pgrst, 'reload schema';

COMMIT;
