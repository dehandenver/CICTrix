-- ============================================================================
-- ADD SCHEDULE + INTERVIEWER ASSIGNMENT COLUMNS TO APPLICANTS
-- Powers the Qualified Applicants "Pending Assignment" → "Scheduled / For
-- Interview" subtab flow in RSPDashboard.
-- Created: 2026-06-05
-- ============================================================================

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS exam_date date;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS exam_time time;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS interview_date date;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS interview_time time;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS assigned_interviewer_email text;

-- Ensure the frontend anon client can read/write these (matches the existing
-- disable-RLS pattern in 003 / 005 / 006).
GRANT SELECT, UPDATE ON applicants TO authenticated, anon;
