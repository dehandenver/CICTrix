-- Migration: Disable RLS on employees table for portal access
-- Created: 2026-07-18

BEGIN;

-- Disable Row Level Security on the employees table
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;

-- Grant select, insert, update, and delete privileges to authenticated and anon users
GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO authenticated, anon;

-- Retroactively fix Jean Pierre's hire date to July 17th, 2026
UPDATE employees SET date_hired = '2026-07-17' WHERE employee_number = 'EMP-2026-9056';

-- Force PostgREST schema reload so the changes take effect immediately
NOTIFY pgrst, 'reload schema';

COMMIT;
