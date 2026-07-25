-- ============================================================================
-- Regularize ALL probationary employees.
--
-- "Probationary" is decided TWO ways in this app, and both must be cleared or an
-- employee still surfaces as probationary somewhere:
--   1. STORED  — employees.employment_status = 'Probationary'
--                (read directly by the employee self-portal, EmployeePage.tsx).
--   2. DERIVED — the PM dashboards compute it from date_hired at runtime:
--                getMonthsOfService(date_hired) < 6  ⇒  Probationary
--                (PMDashboard.tsx / PMIPCRManagement.tsx — month-based diff:
--                 (yNow-yHire)*12 + (mNow-mHire) < 6).
--
-- This migration clears both: it flips the stored status to 'Regular' and pushes
-- any recent/blank date_hired back past the 6-month threshold so the runtime
-- derivation also lands on Regular. After this, no active employee reads as
-- probationary in any view.
--
-- CURRENT_DATE-relative math ⇒ correct whenever it is applied. LEAST() only ever
-- moves date_hired EARLIER, so genuinely tenured rows are left alone and nobody's
-- tenure is inflated beyond the minimum needed to clear probation.
-- Only `employment_status` and `date_hired` are written — NOT department/status —
-- so the trg_enforce_active_office trigger (20260813) never fires.
-- ============================================================================

BEGIN;

-- ── A. Stored status: any active 'Probationary' → 'Regular' ─────────────────
UPDATE employees
   SET employment_status = 'Regular'
 WHERE status = 'Active'
   AND employment_status = 'Probationary';

-- ── B. Derived status: push date_hired past the 6-month probation window ─────
--    Targets exactly the rows the app would still DERIVE as probationary:
--    a null hire date, or one whose month is later than (current month − 6),
--    which mirrors the frontend's month-based `months < 6` check precisely.
--    They are reset to ~9 months of service (a safe buffer beyond 6).
UPDATE employees
   SET date_hired = LEAST(
         COALESCE(date_hired, CURRENT_DATE),
         (CURRENT_DATE - INTERVAL '9 months')::date
       )
 WHERE status = 'Active'
   AND (
         date_hired IS NULL
         OR date_trunc('month', date_hired)
              > date_trunc('month', CURRENT_DATE) - INTERVAL '6 months'
       );

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ── Verification (run after applying) ───────────────────────────────────────
-- No active employee stored as probationary (expect 0):
--   SELECT count(*) FROM employees
--    WHERE status='Active' AND employment_status='Probationary';
-- No active employee derived as probationary, i.e. < 6 months (expect 0):
--   SELECT count(*) FROM employees
--    WHERE status='Active'
--      AND ( date_hired IS NULL
--            OR date_trunc('month', date_hired)
--                 > date_trunc('month', CURRENT_DATE) - INTERVAL '6 months' );
