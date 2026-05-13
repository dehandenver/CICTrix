-- ============================================================================
-- REMOVE SALARY-RELATED COLUMNS
-- Drops salary_grade, monthly_salary, step_increment from all tables that
-- carry them, and removes the 'salary_adjusted' value from the
-- employee_history.valid_action CHECK constraint. Salary tracking is out of
-- scope for this system.
-- ============================================================================

-- employees
ALTER TABLE employees DROP COLUMN IF EXISTS salary_grade;
ALTER TABLE employees DROP COLUMN IF EXISTS monthly_salary;
ALTER TABLE employees DROP COLUMN IF EXISTS step_increment;

-- employee_work_experience
ALTER TABLE employee_work_experience DROP COLUMN IF EXISTS salary_grade;
ALTER TABLE employee_work_experience DROP COLUMN IF EXISTS monthly_salary;

-- job_postings (if created by Supabase outside the migrations folder)
ALTER TABLE IF EXISTS job_postings DROP COLUMN IF EXISTS salary_grade;

-- jobs legacy table (mirror column written by recruitmentData sync)
ALTER TABLE IF EXISTS jobs DROP COLUMN IF EXISTS salary_grade;

-- employee_history: rebuild valid_action CHECK without 'salary_adjusted'
ALTER TABLE employee_history DROP CONSTRAINT IF EXISTS valid_action;
ALTER TABLE employee_history ADD CONSTRAINT valid_action CHECK (action IN (
  'created', 'hired', 'regularized', 'promoted', 'transferred',
  'suspended', 'reactivated', 'role_changed', 'updated', 'separated'
));
