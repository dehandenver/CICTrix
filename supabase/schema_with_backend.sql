-- Drop existing tables if they were created incorrectly
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS evaluations CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;

-- Create users_roles table for managing user roles
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'PM', 'RSP', 'LND', 'RATER', 'INTERVIEWER', 'APPLICANT')),
  name VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create evaluations table
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id BIGINT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES user_roles(id) ON DELETE CASCADE,
  score DECIMAL(5, 2) NOT NULL CHECK (score >= 0 AND score <= 100),
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create assignments table for linking raters/interviewers to applicants
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id BIGINT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES user_roles(id) ON DELETE CASCADE,
  assignment_type VARCHAR(50) NOT NULL CHECK (assignment_type IN ('INTERVIEWER', 'RATER')),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(applicant_id, evaluator_id, assignment_type)
);

-- Create indexes for better query performance
CREATE INDEX idx_user_roles_email ON user_roles(email);
CREATE INDEX idx_user_roles_role ON user_roles(role);
CREATE INDEX idx_evaluations_applicant_id ON evaluations(applicant_id);
CREATE INDEX idx_evaluations_evaluator_id ON evaluations(evaluator_id);
CREATE INDEX idx_assignments_applicant_id ON assignments(applicant_id);
CREATE INDEX idx_assignments_evaluator_id ON assignments(evaluator_id);

-- Note: RLS policies will be added later via the backend API
-- For now, tables are created without RLS to ensure backend has full access
