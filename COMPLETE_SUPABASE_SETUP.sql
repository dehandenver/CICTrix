-- Complete Supabase Setup for HRIS System
-- Run this ONCE in your Supabase SQL Editor

-- Step 1: Create Tables
-- ===================

-- Create applicants table (or add status column if it exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'applicants') THEN
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
  ELSE
    -- Add missing columns if they don't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'applicants' AND column_name = 'status') THEN
      ALTER TABLE applicants ADD COLUMN status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Reviewed', 'Accepted', 'Rejected'));
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'applicants' AND column_name = 'created_at') THEN
      ALTER TABLE applicants ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'applicants' AND column_name = 'updated_at') THEN
      ALTER TABLE applicants ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
  END IF;
END $$;

-- Create applicant_attachments table
CREATE TABLE IF NOT EXISTS applicant_attachments (
  id BIGSERIAL PRIMARY KEY,
  applicant_id BIGINT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create evaluations table
CREATE TABLE IF NOT EXISTS evaluations (
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

-- Step 2: Create Indexes
-- ======================

CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email);
CREATE INDEX IF NOT EXISTS idx_applicants_created_at ON applicants(created_at);
CREATE INDEX IF NOT EXISTS idx_applicant_attachments_applicant_id ON applicant_attachments(applicant_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_applicant_id ON evaluations(applicant_id);

-- Step 3: Create Storage Bucket
-- =============================

INSERT INTO storage.buckets (id, name, public)
VALUES ('applicant-attachments', 'applicant-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Step 4: Enable Row Level Security
-- =================================

ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE applicant_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

-- Step 5: Drop Old Policies (if they exist)
-- =========================================

DROP POLICY IF EXISTS "Allow public insert on applicants" ON applicants;
DROP POLICY IF EXISTS "Allow authenticated read on applicants" ON applicants;
DROP POLICY IF EXISTS "Allow public read on applicants" ON applicants;
DROP POLICY IF EXISTS "Allow public update on applicants" ON applicants;

DROP POLICY IF EXISTS "Allow public insert on applicant_attachments" ON applicant_attachments;
DROP POLICY IF EXISTS "Allow authenticated read on applicant_attachments" ON applicant_attachments;
DROP POLICY IF EXISTS "Allow public read on applicant_attachments" ON applicant_attachments;

DROP POLICY IF EXISTS "Allow authenticated insert on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow authenticated read on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow authenticated update on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow public insert on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow public read on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow public update on evaluations" ON evaluations;

DROP POLICY IF EXISTS "Allow authenticated users to upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to read attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read attachments" ON storage.objects;

-- Step 6: Create Public Access Policies
-- =====================================

-- Applicants: Allow public access for applicant form and interviewer dashboard
CREATE POLICY "Allow public insert on applicants"
ON applicants FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public read on applicants"
ON applicants FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public update on applicants"
ON applicants FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Applicant Attachments: Allow public access
CREATE POLICY "Allow public insert on applicant_attachments"
ON applicant_attachments FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public read on applicant_attachments"
ON applicant_attachments FOR SELECT
TO anon, authenticated
USING (true);

-- Evaluations: Allow public access
CREATE POLICY "Allow public insert on evaluations"
ON evaluations FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public read on evaluations"
ON evaluations FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public update on evaluations"
ON evaluations FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Storage: Allow public upload and read for attachments
CREATE POLICY "Allow public upload attachments"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'applicant-attachments');

CREATE POLICY "Allow public read attachments"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'applicant-attachments');
