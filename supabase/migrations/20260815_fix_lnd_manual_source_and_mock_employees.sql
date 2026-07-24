-- ============================================================================
-- Migration: Fix lnd_manual source constraint + soft-delete 3 mock employees
-- Date: 2026-08-15
--
-- Two problems fixed atomically:
--
-- A. source constraint on training_recommendations blocked manual adds.
--    lndAddAttendees() inserts source='lnd_manual' but the existing CHECK only
--    permitted 'ai_recommended' | 'office_account_added'. Every manual add
--    silently failed at the DB level. Fixed by adding 'lnd_manual' to the
--    allowed values.
--
-- B. Three Active employee records are confirmed test/placeholder data created
--    during development. They have nonsensical names, no IPCR records, and are
--    tagged with NH (new-hire placeholder) or an otherwise-sequential number
--    pointing to test insertion. Soft-deleted (status → 'Separated') so they
--    are excluded from all L&D aggregates, Office Account lists, and the Add
--    Attendees picker automatically — 'Active' filters everywhere gate them out.
--    Reversible: UPDATE employees SET status='Active' ... WHERE ...
--
-- Confirmed mock accounts (reviewed 2026-08-15):
--   EMP-NH-CHLOE   | Chloe Mmmm FFfff          | Information Technology
--   EMP-NH-SKYE    | Skye Denver Saladar Celeste | Information Technology
--   EMP-2026-2855  | Ronald Mcdonald Dela Rosa   | Information Technology
--
-- All other employees with no finalized IPCR are confirmed REAL new-hires
-- (58 of them, e.g. Wilfredo Navarro Sarmiento EMP-2024-001) and are
-- intentionally left Active — they will appear in the picker with the
-- "No rating yet" label introduced alongside this migration.
-- ============================================================================

BEGIN;

-- ── A. Add 'lnd_manual' to the source constraint ────────────────────────────
-- Existing constraint only allowed 'ai_recommended' | 'office_account_added'.
-- L&D admin manual adds use 'lnd_manual' — this was the root cause of the
-- silent persistence failure in the Add Attendees modal.

ALTER TABLE training_recommendations
  DROP CONSTRAINT IF EXISTS training_recommendations_source_check;

ALTER TABLE training_recommendations
  ADD CONSTRAINT training_recommendations_source_check
  CHECK (source IN ('ai_recommended', 'office_account_added', 'lnd_manual'));

-- ── B. Soft-delete 3 confirmed mock/placeholder employee accounts ────────────
-- Separating (not deleting) preserves FK integrity and makes this reversible.

UPDATE employees
   SET status = 'Separated',
       modified_at = now()
 WHERE employee_number IN ('EMP-NH-CHLOE', 'EMP-NH-SKYE', 'EMP-2026-2855')
   AND status = 'Active';

-- Verify the right rows were hit (should be 3):
-- SELECT employee_number, first_name, last_name, status
--   FROM employees
--  WHERE employee_number IN ('EMP-NH-CHLOE', 'EMP-NH-SKYE', 'EMP-2026-2855');

NOTIFY pgrst, 'reload schema';

COMMIT;
