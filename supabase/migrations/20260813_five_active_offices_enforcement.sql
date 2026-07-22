-- ============================================================================
-- Enforce the 5 active offices system-wide (L&D office-list reduction).
-- Created: 2026-08-13.
--
-- The `departments` table already carries exactly the 5 confirmed active
-- offices (Information Technology, Office of The City Accountant, Office of The
-- City Health Officer, Legal, Office of The City Engineer) — see 20260803. This
-- migration:
--   1. Re-asserts that 5-active / rest-inactive state (idempotent).
--   2. Repairs 5 real roster employees whose `department` had drifted back to
--      legacy office names, reassigning them to their correct active office.
--   3. Soft-deletes (status='Separated', REVERSIBLE) 5 test/junk accounts that
--      were tagged to now-removed offices.
--   4. Adds a BEFORE INSERT/UPDATE trigger on `employees` so no NEW active
--      employee can be tagged to an office that isn't active — the backend gate
--      the browser writes hit directly (there is no separate API layer).
--
-- The frontend already excludes non-active offices from every L&D aggregate by
-- reading the active department list live (getActiveOfficeNames), so this
-- migration is the durable, server-side counterpart. Review before applying.
-- ============================================================================

BEGIN;

-- ── 1. Re-assert the 5 active offices ───────────────────────────────────────
UPDATE departments SET is_active = true
 WHERE name IN ('Information Technology','Office of The City Accountant',
                'Office of The City Health Officer','Legal','Office of The City Engineer');
UPDATE departments SET is_active = false
 WHERE name NOT IN ('Information Technology','Office of The City Accountant',
                    'Office of The City Health Officer','Legal','Office of The City Engineer');

-- ── 2. Reassign 5 real roster employees to their correct active office ───────
--    (department/position had drifted to legacy corporate values; names + target
--     office/position come straight from the 20260803 slot map.)
UPDATE employees SET department = 'Office of The City Accountant',   position = 'Bookkeeper II'
  WHERE employee_number = 'EMP-7FA5BA9A';                 -- Cristina Alonzo
UPDATE employees SET department = 'Information Technology',           position = 'Information Technology Officer III'
  WHERE employee_number = 'EMP-2026-002';                 -- Antonio Delgado
UPDATE employees SET department = 'Information Technology',           position = 'Data Encoder III'
  WHERE employee_number = 'EMP-09CC4879';                 -- Rogelio Mationg
UPDATE employees SET department = 'Office of The City Accountant',   position = 'Management and Audit Analyst II'
  WHERE employee_number = 'EMP-F0156D31';                 -- Remedios Valdez
UPDATE employees SET department = 'Office of The City Health Officer', position = 'Medical Officer III'
  WHERE employee_number = 'EMP-2238FD0D';                 -- Benjamin Zamora

-- ── 3. Soft-delete 5 test/junk accounts in removed offices (reversible) ──────
--    To restore any of these, set status back to 'Active' AFTER giving them a
--    valid active-office `department` (the trigger below now requires it).
UPDATE employees SET status = 'Separated'
 WHERE employee_number IN ('EMP-NH-AD','EMP-NH-CHRIS','EMP-NH-RODRIGO','EMP-2026-9056','EMP-2026-1395')
   AND status = 'Active';

-- ── 4. Backend validation: active employees must be in an active office ──────
CREATE OR REPLACE FUNCTION enforce_active_office()
RETURNS trigger AS $$
BEGIN
  -- Only guard active employees. Separated/legacy rows may keep historical
  -- office values so audit trails and FK links survive.
  IF NEW.status = 'Active' AND NEW.department IS NOT NULL AND btrim(NEW.department) <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM departments d
       WHERE d.is_active
         AND lower(btrim(d.name)) = lower(btrim(NEW.department))
    ) THEN
      RAISE EXCEPTION
        'Office "%" is not an active office. Active employees can only be assigned to one of the 5 active offices.',
        NEW.department;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_active_office ON employees;
CREATE TRIGGER trg_enforce_active_office
  BEFORE INSERT OR UPDATE OF department, status ON employees
  FOR EACH ROW EXECUTE FUNCTION enforce_active_office();

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ── Verification (run after applying) ───────────────────────────────────────
-- SELECT name FROM departments WHERE is_active ORDER BY name;                       -- expect the 5
-- SELECT department, count(*) FROM employees WHERE status='Active' GROUP BY 1;       -- only the 5 offices
-- Attempting an insert into a removed office should now raise:
--   INSERT INTO employees (employee_number, first_name, last_name, department, status)
--   VALUES ('TEST-REJECT','x','y','Operations','Active');   -- expect: EXCEPTION
