-- Migration: Disable RLS on employees table for portal access
-- Created: 2026-07-18

BEGIN;

-- Disable Row Level Security on the employees table
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;

-- Grant select, insert, update, and delete privileges to authenticated and anon users
GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO authenticated, anon;

-- Retroactively fix Jean Pierre's hire date to July 17th, 2026
UPDATE employees SET date_hired = '2026-07-17' WHERE employee_number = 'EMP-2026-9056';

-- Insert missing ipcr_submissions row for Jean Pierre's Phase 2 rating submission (Submitted to Office)
INSERT INTO ipcr_submissions (employee_id, employee_name, office_id, office_name, period, phase, stage, updated_by)
VALUES (
  '339a4e5a-d4d4-455d-a1e1-48f50de34595',
  'Jean Francois Pierre',
  (SELECT id FROM departments WHERE name = 'Information Technology'),
  'Information Technology',
  'July–December 2026',
  'rating',
  'Submitted to Office',
  'jean.pierre@cityhall.gov.ph'
)
ON CONFLICT (employee_id, period, phase) DO UPDATE
SET stage = 'Submitted to Office', updated_by = 'jean.pierre@cityhall.gov.ph';

-- Force PostgREST schema reload so the changes take effect immediately
NOTIFY pgrst, 'reload schema';

COMMIT;
