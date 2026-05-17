-- Migration: Create centralized employees table
-- Includes fields tracking personal, work, and government ID data.

BEGIN;

DROP TABLE IF EXISTS employees CASCADE;

CREATE TABLE employees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id text UNIQUE NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name text NOT NULL,
    email text UNIQUE NOT NULL,
    date_of_birth date,
    place_of_birth text,
    gender text CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
    civil_status text CHECK (civil_status IN ('Single', 'Married', 'Widowed', 'Divorced', 'Separated')),
    nationality text,
    mobile_number text,
    home_address text,
    emergency_contact_name text,
    emergency_relationship text,
    emergency_contact_number text,
    sss_number text,
    philhealth_number text,
    pagibig_number text,
    tin_number text,
    current_position text,
    current_department text,
    current_division text,
    status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'On Leave', 'Resigned', 'Terminated')),
    hire_date date,
    position_history jsonb NOT NULL DEFAULT '[]'::jsonb,
    personal_details_finalized boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS employees_department_idx ON employees USING btree (current_department);
CREATE INDEX IF NOT EXISTS employees_status_idx ON employees USING btree (status);

-- Updated_at Trigger
CREATE OR REPLACE FUNCTION set_employees_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_employees_updated_at ON employees;
CREATE TRIGGER trigger_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION set_employees_updated_at();

-- RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Note: The admin policy checks the user_metadata ->> 'role'. Adjust if your roles are stored elsewhere (e.g., in a public.users table)
CREATE POLICY employees_admin_all
  ON employees
  FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('ADMIN', 'PM', 'RSP', 'LND')
  );

CREATE POLICY employees_self_read
  ON employees
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY employees_self_update
  ON employees
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    -- Prevent updates to sensitive columns. If the user tries to change these, the update will be rejected by RLS.
    status = (SELECT status FROM employees e WHERE e.id = id) AND
    hire_date IS NOT DISTINCT FROM (SELECT hire_date FROM employees e WHERE e.id = id) AND
    employee_id = (SELECT employee_id FROM employees e WHERE e.id = id) AND
    user_id IS NOT DISTINCT FROM (SELECT user_id FROM employees e WHERE e.id = id) AND
    current_position IS NOT DISTINCT FROM (SELECT current_position FROM employees e WHERE e.id = id) AND
    current_department IS NOT DISTINCT FROM (SELECT current_department FROM employees e WHERE e.id = id) AND
    current_division IS NOT DISTINCT FROM (SELECT current_division FROM employees e WHERE e.id = id)
  );

COMMIT;
