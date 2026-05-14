-- ============================================================================
-- EMPLOYEE DOCUMENT REQUESTS — Employee Portal: Document Requirements + Submission Bin
-- Created: 2026-05-14
--
-- Purpose:
--   - Split employee_documents into three categories so the Employee Portal can
--     route each row to the correct tab:
--       'application' -> Document Requirements tab (Resume, Application Letter,
--                        Transcript of Records, Other Relevant Documents)
--       'compliance'  -> existing RSP Reports doc types (NBI, Medical, SALN, ...)
--       'hr_request'  -> Submission Bin tab (HR-created requests with a due date)
--   - Allow the 4 application document labels in the document_type CHECK.
--   - Allow status 'Submitted' (an hr_request row that the employee has uploaded
--     a file for, awaiting HR review).
--   - Add due_date / requested_by / description so HR requests carry their own
--     metadata. These are nullable — application/compliance rows leave them NULL.
-- ============================================================================

-- 1. Permit the 4 application document labels alongside the existing types.
ALTER TABLE employee_documents
  DROP CONSTRAINT IF EXISTS valid_document_type;

ALTER TABLE employee_documents
  ADD CONSTRAINT valid_document_type CHECK (document_type IN (
    -- Application documents (Employee Portal: Document Requirements tab)
    'Resume / Curriculum Vitae',
    'Application Letter',
    'Transcript of Records',
    'Other Relevant Documents',
    -- RSP Reports categories (compliance)
    'NBI Clearance',
    'Medical Certificate',
    'SALN',
    'Certificate of Training',
    'Performance Evaluation Form',
    'Updated Resume/CV',
    -- Legacy / onboarding categories (retained for back-compat)
    'Resume',
    'Birth Certificate',
    'Marriage Certificate',
    'Diploma',
    'Civil Service Eligibility',
    'License',
    'Government ID',
    'Tax Documents',
    'Appointment Letter',
    'Previous Employment Certificate',
    'Employment Certificate',
    'Other'
  ));

-- 2. Allow status 'Submitted' for HR-request rows fulfilled by the employee.
ALTER TABLE employee_documents
  DROP CONSTRAINT IF EXISTS valid_document_status;

ALTER TABLE employee_documents
  ADD CONSTRAINT valid_document_status CHECK (status IN (
    'Pending', 'Submitted', 'Approved', 'Rejected'
  ));

-- 3. Category column — routes each row to the right Employee Portal tab.
ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'compliance';

ALTER TABLE employee_documents
  DROP CONSTRAINT IF EXISTS valid_document_category;

ALTER TABLE employee_documents
  ADD CONSTRAINT valid_document_category CHECK (category IN (
    'application', 'compliance', 'hr_request'
  ));

-- 4. HR-request metadata. Nullable: only hr_request rows populate these.
ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS requested_by VARCHAR(160);

ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 5. Backfill: existing rows are all compliance uploads from the RSP pipeline.
UPDATE employee_documents
  SET category = 'compliance'
  WHERE category IS NULL OR category = '';

-- 6. Helpful index for the per-employee, per-category portal queries.
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_category
  ON employee_documents(employee_id, category, uploaded_at DESC);
