-- ============================================================================
-- EMPLOYEE DOCUMENT REQUEST SOURCES (PM and LND Integration)
-- Created: 2026-05-19
--
-- Purpose:
--   - Add `request_source` to support requests originating from PM and LND
--     using identical logic to hr_request but retaining source knowledge.
-- ============================================================================

ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS request_source VARCHAR(10) DEFAULT 'HR';

ALTER TABLE employee_documents
  DROP CONSTRAINT IF EXISTS valid_request_source;

ALTER TABLE employee_documents
  ADD CONSTRAINT valid_request_source CHECK (request_source IN ('HR', 'PM', 'LND'));

-- Backfill existing rows as HR source.
UPDATE employee_documents
  SET request_source = 'HR'
  WHERE request_source IS NULL;

-- Keep the constraints on existing columns but add an index for querying by source
CREATE INDEX IF NOT EXISTS idx_employee_documents_category_source
  ON employee_documents(category, request_source);
