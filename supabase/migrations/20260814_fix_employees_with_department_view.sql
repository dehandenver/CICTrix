-- 20260814_fix_employees_with_department_view.sql
BEGIN;

DROP VIEW IF EXISTS employees_with_department CASCADE;

CREATE VIEW employees_with_department AS
SELECT
  id,
  employee_number                                AS employee_id,
  NULLIF(TRIM(regexp_replace(
    COALESCE(first_name, '') || ' ' ||
    COALESCE(middle_name, '') || ' ' ||
    COALESCE(last_name, '') || ' ' ||
    COALESCE(suffix, ''),
    '\s+', ' ', 'g'
  )), '')                                        AS full_name,
  first_name,
  last_name,
  middle_name,
  suffix,                                        -- Added suffix
  email,
  phone                                          AS mobile_number,
  position                                       AS current_position,
  department                                     AS current_department,
  department                                     AS department,
  NULL::text                                     AS current_division,
  date_hired                                     AS hire_date,
  status,
  user_account_id                                AS user_id,
  date_of_birth,
  place_of_birth,                                -- Added
  sex                                            AS gender,
  civil_status,
  nationality,
  tin_number, sss_number, philhealth_number, pagibig_number,
  gsis_number,                                   -- Added
  emergency_contact_name,                        -- Added
  emergency_contact_relationship,                -- Added
  emergency_contact_phone,                       -- Added
  employment_status,                             -- Added
  created_at, modified_at AS updated_at,
  '[]'::jsonb                                    AS position_history,
  personal_details_finalized,                    -- Real DB column mapped
  current_address_street                         AS home_address
FROM employees;

GRANT SELECT ON employees_with_department TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
