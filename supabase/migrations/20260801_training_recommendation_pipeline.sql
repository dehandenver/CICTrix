-- ============================================================================
-- Training recommendation → approval → enrollment pipeline (§6).
-- Created: 2026-08-01.
--
-- Extends the existing training_recommendations state machine (20260724) from
-- the one-step LND flow into the two-portal round-trip:
--
--   SUGGESTED  (system, IPCR-driven)
--     → LND_APPROVED     (L&D approved; now visible to the Office Account)
--     → OFFICE_FINALIZED (dept head sent the list back to L&D)
--     → ENROLLED         (L&D clicked "Enroll final attendees")
--   OFFICE_ADDED         (dept head added a candidate L&D didn't suggest; joins
--                         the same list and finalizes to OFFICE_FINALIZED)
--   DISMISSED            (unchanged)
--
-- ACCEPTED is retained in the check for backward compatibility with any existing
-- rows but is no longer produced.
--
-- office_actor records which department-head account approved/added a candidate.
--
-- Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE training_recommendations
  ADD COLUMN IF NOT EXISTS office_actor text;

ALTER TABLE training_recommendations DROP CONSTRAINT IF EXISTS training_recommendations_status_check;
ALTER TABLE training_recommendations
  ADD CONSTRAINT training_recommendations_status_check
  CHECK (status IN (
    'SUGGESTED', 'LND_APPROVED', 'OFFICE_ADDED', 'OFFICE_FINALIZED',
    'ENROLLED', 'DISMISSED', 'ACCEPTED'
  ));

NOTIFY pgrst, 'reload schema';

COMMIT;
