-- Backfill doc_validated rows for applicants whose status shows documents
-- were already reviewed (covers approvals made before the realtime insert fix).
-- Safe to run multiple times — skips rows that already exist.
INSERT INTO applicant_attachments (applicant_id, file_name, file_path, document_type, file_type, file_size)
SELECT DISTINCT
  aa.applicant_id,
  COALESCE(aa.document_type, 'other')                    AS file_name,
  'validated::' || COALESCE(aa.document_type, 'other')   AS file_path,
  'doc_validated'                                         AS document_type,
  'validation'                                            AS file_type,
  0                                                       AS file_size
FROM applicant_attachments aa
JOIN applicants a ON a.id = aa.applicant_id
WHERE a.status IN (
  'Document Verified',
  'Shortlisted',
  'For Interview',
  'Interview Scheduled',
  'Interview Completed',
  'Recommended for Hiring',
  'Hired',
  'Accepted'
)
  AND aa.document_type NOT IN ('resubmission_request', 'resubmission_resolved', 'doc_validated')
  AND aa.document_type IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM applicant_attachments dv
    WHERE dv.applicant_id = aa.applicant_id
      AND dv.document_type = 'doc_validated'
      AND dv.file_name = COALESCE(aa.document_type, 'other')
  );

-- Also update those applicants' updated_at so the tracker's realtime
-- applicants subscription fires and refreshes immediately.
UPDATE applicants
SET updated_at = NOW()
WHERE status IN (
  'Document Verified',
  'Shortlisted',
  'For Interview',
  'Interview Scheduled',
  'Interview Completed',
  'Recommended for Hiring',
  'Hired',
  'Accepted'
);
