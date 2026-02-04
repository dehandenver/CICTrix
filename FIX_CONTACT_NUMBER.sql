-- COMPLETE FRESH SETUP FOR CICTRIX HRIS SYSTEM
-- This script drops existing tables and recreates everything from scratch
-- WARNING: This will delete all existing data!
-- Run this ONCE in your Supabase SQL Editor

-- Step 1: Drop all storage policies
DROP POLICY IF EXISTS "Allow authenticated users to upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to read attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload attachments" ON storage.objects;

-- Step 2: Drop all existing tables (CASCADE removes dependent objects)
DROP TABLE IF EXISTS evaluations CASCADE;
DROP TABLE IF EXISTS applicant_attachments CASCADE;
DROP TABLE IF EXISTS applicants CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS raters CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;

-- Step 3: Create fresh tables with correct schema

-- Applicants table
CREATE TABLE applicants (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  contact_number VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  position VARCHAR(255) NOT NULL,
  item_number VARCHAR(100) NOT NULL,
  office VARCHAR(255) NOT NULL,
  is_pwd BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Reviewed', 'Accepted', 'Rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Applicant attachments table
CREATE TABLE applicant_attachments (
  id BIGSERIAL PRIMARY KEY,
  applicant_id BIGINT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  document_type VARCHAR(100) DEFAULT 'other',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Evaluations table
CREATE TABLE evaluations (
  id BIGSERIAL PRIMARY KEY,
  applicant_id BIGINT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  interviewer_name VARCHAR(255) NOT NULL,
  technical_score INTEGER CHECK (technical_score >= 1 AND technical_score <= 5),
  communication_score INTEGER CHECK (communication_score >= 1 AND communication_score <= 5),
  overall_score INTEGER CHECK (overall_score >= 1 AND overall_score <= 5),
  comments TEXT,
  recommendation VARCHAR(50) CHECK (recommendation IN ('Highly Recommended', 'Recommended', 'Not Recommended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Jobs table
CREATE TABLE jobs (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  item_number VARCHAR(100) NOT NULL,
  salary_grade VARCHAR(50),
  department VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'Open' CHECK (status IN ('Open', 'Closed', 'On Hold')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Raters table
CREATE TABLE raters (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  department VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User roles table
CREATE TABLE user_roles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super-admin', 'rsp', 'lnd', 'pm')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 4: Create indexes for better performance
CREATE INDEX idx_applicants_email ON applicants(email);
CREATE INDEX idx_applicants_created_at ON applicants(created_at);
CREATE INDEX idx_applicant_attachments_applicant_id ON applicant_attachments(applicant_id);
CREATE INDEX idx_evaluations_applicant_id ON evaluations(applicant_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_department ON jobs(department);
CREATE INDEX idx_raters_email ON raters(email);
CREATE INDEX idx_raters_is_active ON raters(is_active);

-- Step 5: Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('applicant-attachments', 'applicant-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Step 6: Enable Row Level Security
ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE applicant_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE raters ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS Policies

-- Applicants policies
CREATE POLICY "Allow public insert on applicants"
ON applicants FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow public read on applicants"
ON applicants FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow public update on applicants"
ON applicants FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Applicant attachments policies
CREATE POLICY "Allow public insert on applicant_attachments"
ON applicant_attachments FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow public read on applicant_attachments"
ON applicant_attachments FOR SELECT TO anon, authenticated USING (true);

-- Evaluations policies
CREATE POLICY "Allow public insert on evaluations"
ON evaluations FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow public read on evaluations"
ON evaluations FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow public update on evaluations"
ON evaluations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Jobs policies
CREATE POLICY "Allow public insert on jobs"
ON jobs FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow public read on jobs"
ON jobs FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow public update on jobs"
ON jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow public delete on jobs"
ON jobs FOR DELETE TO anon, authenticated USING (true);

-- Raters policies
CREATE POLICY "Allow public insert on raters"
ON raters FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow public read on raters"
ON raters FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow public update on raters"
ON raters FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow public delete on raters"
ON raters FOR DELETE TO anon, authenticated USING (true);

-- User roles policies
CREATE POLICY "Allow read own role"
ON user_roles FOR SELECT TO authenticated USING (auth.uid() = id);

-- Storage policies
CREATE POLICY "Allow public upload attachments"
ON storage.objects FOR INSERT TO anon, authenticated 
WITH CHECK (bucket_id = 'applicant-attachments');

CREATE POLICY "Allow public read attachments"
ON storage.objects FOR SELECT TO anon, authenticated 
USING (bucket_id = 'applicant-attachments');

CREATE POLICY "Allow public update attachments"
ON storage.objects FOR UPDATE TO anon, authenticated 
USING (bucket_id = 'applicant-attachments')
WITH CHECK (bucket_id = 'applicant-attachments');

CREATE POLICY "Allow public delete attachments"
ON storage.objects FOR DELETE TO anon, authenticated 
USING (bucket_id = 'applicant-attachments');

-- Step 8: Verify setup
SELECT 'Setup completed successfully!' as status;
