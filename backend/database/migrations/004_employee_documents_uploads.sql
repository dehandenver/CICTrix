-- ============================================================================
-- EMPLOYEE DOCUMENTS — RSP Reports / Employee Portal upload pipeline
-- Created: 2026-05-01
--
-- Purpose:
--   - Loosen the document_type CHECK so the 6 RSP report categories fit:
--     NBI Clearance, Medical Certificate, SALN, Certificate of Training,
--     Performance Evaluation Form, Updated Resume/CV.
--   - Add status (Pending/Approved/Rejected) so RSP can track verification.
--   - Add file_type (MIME) so the UI can show appropriate previews.
--   - Disable RLS so the frontend (anon + authenticated) can read/write directly,
--     matching the existing approach in 003_disable_rls_evaluations.sql.
--   - Create a public Storage bucket `employee-documents` for the actual files.
-- ============================================================================

-- 1. Drop the strict CHECK and re-add a permissive one covering RSP categories.
ALTER TABLE employee_documents
  DROP CONSTRAINT IF EXISTS valid_document_type;

ALTER TABLE employee_documents
  ADD CONSTRAINT valid_document_type CHECK (document_type IN (
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
  ));

-- 2. Add status + file_type columns if they don't exist yet.
ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Pending';

ALTER TABLE employee_documents
  DROP CONSTRAINT IF EXISTS valid_document_status;

ALTER TABLE employee_documents
  ADD CONSTRAINT valid_document_status CHECK (status IN ('Pending', 'Approved', 'Rejected'));

ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS file_type VARCHAR(120);

-- 3. Make uploaded_by nullable — Employee Portal does not currently use Supabase auth,
--    so we cannot guarantee a UUID for the uploader (employee_id is sufficient).
ALTER TABLE employee_documents
  ALTER COLUMN uploaded_by DROP NOT NULL;

-- 4. Disable RLS so the frontend client can read/write directly,
--    matching the pattern used in 003_disable_rls_evaluations.sql.
ALTER TABLE employee_documents DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON employee_documents TO authenticated, anon;

-- 5. Storage bucket for the actual files.
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage bucket policies — allow read/write from any client.
DROP POLICY IF EXISTS "employee_documents_read"   ON storage.objects;
DROP POLICY IF EXISTS "employee_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "employee_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "employee_documents_delete" ON storage.objects;

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

-- 6. Helpful index for "all submissions of type X" (RSP detail page).
CREATE INDEX IF NOT EXISTS idx_employee_documents_type_uploaded_at
  ON employee_documents(document_type, uploaded_at DESC);
