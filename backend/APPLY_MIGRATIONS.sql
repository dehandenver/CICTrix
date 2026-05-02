-- ============================================================================
-- COMPLETE CICTRIX DATABASE SETUP
-- Creates all necessary tables in correct dependency order
-- ============================================================================

-- ============================================================================
-- STEP 1: Employee Documents will reference the applicants table
-- (Applicants are hired and become employees)
-- ============================================================================

-- ============================================================================
-- STEP 2: Create employee_documents table
-- ============================================================================
CREATE TABLE IF NOT EXISTS employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'Pending',
  file_type VARCHAR(120),
  file_url VARCHAR(500),
  uploaded_by UUID,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_document_type CHECK (document_type IN (
    -- RSP Reports categories (canonical)
    'NBI Clearance',
    'Medical Certificate',
    'SALN',
    'Certificate of Training',
    'Performance Evaluation Form',
    'Updated Resume/CV',
    -- Onboarding categories (legacy, retained for back-compat)
    'Resume',
    'Birth Certificate',
    'Marriage Certificate',
    'Diploma',
    'Transcript of Records',
    'Civil Service Eligibility',
    'License',
    'Government ID',
    'Tax Documents',
    'Appointment Letter',
    'Previous Employment Certificate',
    'Other'
  )),
  CONSTRAINT valid_document_status CHECK (status IN ('Pending', 'Approved', 'Rejected'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_type_uploaded_at ON employee_documents(document_type, uploaded_at DESC);

-- Disable RLS so the frontend client can read/write directly
ALTER TABLE employee_documents DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON employee_documents TO authenticated, anon;

-- ============================================================================
-- STEP 3: Create Storage bucket for employee documents
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies if any
DROP POLICY IF EXISTS "employee_documents_read"   ON storage.objects;
DROP POLICY IF EXISTS "employee_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "employee_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "employee_documents_delete" ON storage.objects;

-- Create new storage policies
CREATE POLICY "employee_documents_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'employee-documents');

CREATE POLICY "employee_documents_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'employee-documents');

CREATE POLICY "employee_documents_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'employee-documents');

CREATE POLICY "employee_documents_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'employee-documents');

-- ============================================================================
-- STEP 4: Seed the missing applicant record (if not already exists)
-- ============================================================================
-- Note: Only insert if the applicant doesn't already exist
-- Check first, then insert only if needed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM applicants WHERE email = 'rodrigodutae@gmail.com') THEN
    INSERT INTO applicants (
      first_name,
      last_name,
      email,
      status
    ) VALUES (
      'Rodrigo',
      'Dutae',
      'rodrigodutae@gmail.com',
      'hired'
    );
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION - Check if setup was successful
-- ============================================================================

-- Verify employee_documents table exists
SELECT 'employee_documents' as table_name, EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'employee_documents'
) as table_exists;

-- Verify the applicant exists
SELECT id, first_name, last_name, email, status
FROM applicants 
WHERE email = 'rodrigodutae@gmail.com';

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
