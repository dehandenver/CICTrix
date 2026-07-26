-- ============================================================================
-- 20260829: semester transition state — the L&D "which semester" gate.
--
-- The Summary of Ratings module now has two semesters in play at once:
--   • the NEW (collecting) semester — the Active performance_cycle whose IPCR
--     collection is still in progress. It drives the new "Semester Summary of
--     Ratings" section, which populates as finalized IPCRs arrive.
--   • the CURRENT (L&D-consumed) semester — the most recent FULLY-completed
--     semester. Every L&D read (training recommendations, needs assessment)
--     stays pinned to this one, undisturbed, until the new semester is 100%
--     complete AND a PM confirms the cutover.
--
-- This singleton table records that pointer plus the completion snapshot the PM
-- transition panel reads. Promotion (new → current) is app-driven on PM confirm
-- (src/lib/api/semesterTransition.ts confirmSemesterTransition) — deliberately
-- NOT a DB trigger, so a transient 100% can never auto-switch L&D mid-review.
--
-- Same anon-open, app-layer-enforced posture as the other IPCR/training tables
-- (RLS off, anon grants). Idempotent — safe to re-apply.
-- Created: 2026-08-29
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS semester_transition_state (
  id                 integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- the semester L&D reads (most recent fully-completed)
  current_cycle_id   integer REFERENCES performance_cycles(id) ON DELETE SET NULL,
  -- the collecting semester (Active cycle); null between cycles
  new_cycle_id       integer REFERENCES performance_cycles(id) ON DELETE SET NULL,
  -- in_progress: still collecting · ready: 100% reached, awaiting PM ·
  -- complete: PM-confirmed, new promoted to current
  completion_status  text NOT NULL DEFAULT 'in_progress'
                       CHECK (completion_status IN ('in_progress', 'ready', 'complete')),
  -- last computed completion snapshot, for the PM transition panel
  completed_count    integer NOT NULL DEFAULT 0,
  expected_count     integer NOT NULL DEFAULT 0,
  -- PM cutover audit
  confirmed_by       text,
  confirmed_at       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Seed the singleton exactly once. Best-effort at seed time:
--   new_cycle_id     = the Active cycle (the semester being collected)
--   current_cycle_id = the most recent NON-active cycle by start_date
--                      (the last finished semester L&D should keep reading)
-- Either may be NULL if the schedule isn't set up yet; the app tolerates that
-- and getLndSourceCycleId falls back to the latest finalized data.
INSERT INTO semester_transition_state (id, current_cycle_id, new_cycle_id, completion_status)
SELECT
  1,
  (SELECT id FROM performance_cycles
     WHERE status IS DISTINCT FROM 'Active'
     ORDER BY start_date DESC NULLS LAST
     LIMIT 1),
  (SELECT id FROM performance_cycles
     WHERE status = 'Active'
     ORDER BY start_date DESC NULLS LAST
     LIMIT 1),
  'in_progress'
WHERE NOT EXISTS (SELECT 1 FROM semester_transition_state WHERE id = 1);

ALTER TABLE semester_transition_state DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON semester_transition_state TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
