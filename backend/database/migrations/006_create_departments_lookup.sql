-- ============================================================================
-- DEPARTMENTS LOOKUP TABLE (Phase 1)
-- Created: 2026-05-11
-- Introduces the normalized `departments` table and adds employees.department_id
-- as a FK to it. The legacy `employees.department` text column is RETAINED for
-- now so existing reads/writes continue to work; a later migration will drop it
-- once all consumers are migrated to read department via the FK or the
-- `employees_with_department` view.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create departments table (with self-referential parent + head FK)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) UNIQUE NOT NULL,
  head_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  parent_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(code);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_department_id);
CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(is_active);

COMMENT ON TABLE departments IS 'Canonical organizational units. Replaces free-text department fields.';
COMMENT ON COLUMN departments.code IS 'Short stable identifier (e.g. HR, IT, FIN). Use for cross-system references.';
COMMENT ON COLUMN departments.parent_department_id IS 'Optional parent for office -> division -> section hierarchies.';

-- ----------------------------------------------------------------------------
-- 2. Seed the 8 canonical departments
--    Mirrors src/constants/positions.ts DEPARTMENTS
-- ----------------------------------------------------------------------------
INSERT INTO departments (code, name) VALUES
  ('HR',  'Human Resources'),
  ('FIN', 'Finance'),
  ('IT',  'Information Technology'),
  ('OPS', 'Operations'),
  ('SM',  'Sales & Marketing'),
  ('CS',  'Customer Support'),
  ('LEG', 'Legal'),
  ('PRD', 'Product Management')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Add department_id FK on employees (nullable during backfill)
-- ----------------------------------------------------------------------------
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS department_id UUID
    REFERENCES departments(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);

-- ----------------------------------------------------------------------------
-- 4. Audit: capture rows whose legacy department text didn't normalize cleanly.
--    Kept as a permanent table so we can review unmapped values post-migration.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments_backfill_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  legacy_value VARCHAR(200),
  resolved_to VARCHAR(100),
  resolution VARCHAR(20) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_resolution CHECK (resolution IN ('exact', 'legacy_map', 'fallback'))
);

-- ----------------------------------------------------------------------------
-- 5. Backfill department_id
--    Strategy:
--      a. Exact match against departments.name
--      b. LEGACY_DEPARTMENT_MAP from src/lib/recruitmentData.ts
--      c. Fallback to 'Operations' (logged in audit table)
-- ----------------------------------------------------------------------------

-- 5a. Exact match
WITH matched AS (
  UPDATE employees e
  SET department_id = d.id
  FROM departments d
  WHERE e.department_id IS NULL
    AND TRIM(e.department) = d.name
  RETURNING e.id, e.department, d.name
)
INSERT INTO departments_backfill_audit (employee_id, legacy_value, resolved_to, resolution)
SELECT id, department, name, 'exact' FROM matched;

-- 5b. Legacy normalization map (mirrors LEGACY_DEPARTMENT_MAP)
WITH legacy_map(legacy_value, canonical_name) AS (
  VALUES
    ('Human Resource Management Office',   'Human Resources'),
    ('Information Technology Office',       'Information Technology'),
    ('City Planning and Development Office','Operations'),
    ('City Health Office',                  'Operations'),
    ('City Engineering Office',             'Operations'),
    ('Treasurer''s Office',                 'Finance'),
    ('Budget Office',                       'Finance'),
    ('General Services Office',             'Operations')
),
mapped AS (
  UPDATE employees e
  SET department_id = d.id
  FROM legacy_map lm
  JOIN departments d ON d.name = lm.canonical_name
  WHERE e.department_id IS NULL
    AND TRIM(e.department) = lm.legacy_value
  RETURNING e.id, e.department, d.name
)
INSERT INTO departments_backfill_audit (employee_id, legacy_value, resolved_to, resolution)
SELECT id, department, name, 'legacy_map' FROM mapped;

-- 5c. Fallback for any remaining unmapped rows
WITH fallback AS (
  UPDATE employees e
  SET department_id = d.id
  FROM departments d
  WHERE e.department_id IS NULL
    AND d.name = 'Operations'
  RETURNING e.id, e.department, d.name
)
INSERT INTO departments_backfill_audit (employee_id, legacy_value, resolved_to, resolution)
SELECT id, department, name, 'fallback' FROM fallback;

-- ----------------------------------------------------------------------------
-- 6. Enforce NOT NULL on department_id (legacy text column stays for now).
--    Phase 2 migration will drop employees.department once consumers move to
--    department_id. Until then, application writes should set BOTH fields to
--    keep them in sync.
-- ----------------------------------------------------------------------------
ALTER TABLE employees ALTER COLUMN department_id SET NOT NULL;

COMMENT ON COLUMN employees.department IS
  'DEPRECATED: legacy free-text department. Use department_id FK + departments table. Will be dropped in a follow-up migration.';

-- ----------------------------------------------------------------------------
-- 7. Convenience view: employees with department name + code flattened.
--    Useful even alongside the legacy column because it also exposes
--    department_code, and as the canonical read path once `department` is gone.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW employees_with_department AS
SELECT
  e.*,
  d.code AS department_code
FROM employees e
LEFT JOIN departments d ON d.id = e.department_id;

COMMENT ON VIEW employees_with_department IS
  'Adds department_code from the departments lookup. After legacy employees.department is dropped, this view will also expose d.name as `department` for back-compat.';

-- ----------------------------------------------------------------------------
-- 8. Sync trigger: keep legacy employees.department aligned with the FK.
--    During phase 1 both columns coexist. New code can write only
--    department_id and this trigger will populate `department` from the
--    lookup, satisfying the existing NOT NULL constraint without forcing
--    every caller to write both fields.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_employee_department_text()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.department_id IS NOT NULL THEN
    SELECT name INTO NEW.department FROM departments WHERE id = NEW.department_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_employee_department_text ON employees;
CREATE TRIGGER trigger_sync_employee_department_text
  BEFORE INSERT OR UPDATE OF department_id ON employees
  FOR EACH ROW
  EXECUTE FUNCTION sync_employee_department_text();

COMMENT ON FUNCTION sync_employee_department_text() IS
  'Phase 1 only: keeps legacy employees.department text aligned with departments.name when department_id is written. Drop together with the legacy column in phase 2.';
