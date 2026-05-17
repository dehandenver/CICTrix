-- L&D Training Management Tables
-- Creates tables for training programs, sessions, enrollments, and requests.

CREATE TABLE training_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('Leadership', 'Technical', 'Soft Skills', 'Compliance')),
  description text,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Draft', 'Archived')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  title text NOT NULL,
  scheduled_date timestamptz NOT NULL,
  capacity integer NOT NULL DEFAULT 0,
  location text,
  status text NOT NULL DEFAULT 'Upcoming' CHECK (status IN ('Upcoming', 'Completed', 'Cancelled')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE training_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Enrolled' CHECK (status IN ('Enrolled', 'Completed', 'Dropped')),
  completed_at timestamptz,
  score numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, session_id)
);

CREATE TABLE training_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  program_id uuid REFERENCES training_programs(id) ON DELETE SET NULL,
  title text NOT NULL,
  justification text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at timestamptz DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admin/LND/PM read access
CREATE POLICY "Allow read access to admins, LND, and PM"
ON training_programs FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'role') IN ('super-admin', 'lnd', 'pm')
);

CREATE POLICY "Allow read access to admins, LND, and PM"
ON training_sessions FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'role') IN ('super-admin', 'lnd', 'pm')
);

CREATE POLICY "Allow read access to admins, LND, and PM"
ON training_enrollments FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'role') IN ('super-admin', 'lnd', 'pm') OR
  auth.uid() = employee_id -- employee self read
);

CREATE POLICY "Allow read access to admins, LND, and PM"
ON training_requests FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'role') IN ('super-admin', 'lnd', 'pm') OR
  auth.uid() = employee_id -- employee self read
);

-- LND write access
CREATE POLICY "Allow write access to LND and super-admin"
ON training_programs FOR ALL
TO authenticated
USING ((auth.jwt() ->> 'role') IN ('super-admin', 'lnd'));

CREATE POLICY "Allow write access to LND and super-admin"
ON training_sessions FOR ALL
TO authenticated
USING ((auth.jwt() ->> 'role') IN ('super-admin', 'lnd'));

CREATE POLICY "Allow write access to LND and super-admin"
ON training_enrollments FOR ALL
TO authenticated
USING ((auth.jwt() ->> 'role') IN ('super-admin', 'lnd'));

CREATE POLICY "Allow write access to LND and super-admin"
ON training_requests FOR ALL
TO authenticated
USING ((auth.jwt() ->> 'role') IN ('super-admin', 'lnd'));

-- Employee request creation
CREATE POLICY "Allow employees to create training requests"
ON training_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = employee_id);
