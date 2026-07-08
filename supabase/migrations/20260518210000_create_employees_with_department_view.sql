-- Migration: Create compatibility view mapping Schema C (live) to Schema B (frontend expectations)

BEGIN;

DROP VIEW IF EXISTS employees_with_department CASCADE;

CREATE VIEW employees_with_department AS
SELECT
  id,
  employee_number                                AS employee_id,
  TRIM(COALESCE(first_name,'') || ' ' ||
       COALESCE(middle_name,'') || ' ' ||
       COALESCE(last_name,''))                   AS full_name,
  first_name,
  last_name,
  middle_name,
  email,
  phone                                          AS mobile_number,
  position                                       AS current_position,
  department                                     AS current_department,
  department                                     AS department,     -- frontend filters use this
  NULL::text                                     AS current_division,
  date_hired                                     AS hire_date,
  status,
  user_account_id                                AS user_id,
  date_of_birth,
  sex                                            AS gender,
  civil_status,
  nationality,
  tin_number, sss_number, philhealth_number, pagibig_number,
  created_at, modified_at AS updated_at,
  '[]'::jsonb                                    AS position_history,
  false                                          AS personal_details_finalized,
  current_address_street                         AS home_address
FROM employees;

GRANT SELECT ON employees_with_department TO anon, authenticated, service_role;

-- Reload PostgREST's schema cache so the view is immediately visible to the
-- REST API and never triggers a "not found in the schema cache" error.
NOTIFY pgrst, 'reload schema';

COMMIT;
