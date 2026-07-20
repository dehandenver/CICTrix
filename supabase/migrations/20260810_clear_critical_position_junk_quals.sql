-- ============================================================================
-- Critical Positions: clear placeholder qualification values.
-- Created: 2026-08-10.
--
-- Before required_education / required_eligibility became read-only (fed from
-- the position's job posting), they were free-text inputs. One row —
-- "Computer Programmer II" in Information Technology — was saved with keyboard
-- mashing in both fields, and RSP's Succession Planning renders whatever is
-- stored, verbatim, as though it were a real requirement.
--
-- Matched on the exact known junk strings rather than a heuristic, so this can
-- never null out a legitimate requirement that merely looks unusual. Once
-- cleared the position falls back to its job posting's qualifications, or to
-- "—" while those postings are still unpopulated.
--
-- Idempotent: re-running matches nothing.
-- ============================================================================

BEGIN;

UPDATE critical_positions
   SET required_education   = CASE WHEN required_education   IN ('sdada')  THEN NULL ELSE required_education   END,
       required_eligibility = CASE WHEN required_eligibility IN ('adadas') THEN NULL ELSE required_eligibility END,
       updated_at           = now()
 WHERE required_education   IN ('sdada')
    OR required_eligibility IN ('adadas');

COMMIT;
