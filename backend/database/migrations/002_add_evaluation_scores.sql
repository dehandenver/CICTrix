-- ============================================================================
-- EVALUATIONS TABLE SCHEMA UPDATE
-- Add individual score fields for oral interview and PCPT evaluations
-- Created: April 28, 2026
-- ============================================================================

-- Update evaluations table to include all interviewer score fields
-- NOTE: Removed CHECK constraints - validation happens in application layer
ALTER TABLE evaluations
ADD COLUMN IF NOT EXISTS communication_skills_score INTEGER,
ADD COLUMN IF NOT EXISTS confidence_score INTEGER,
ADD COLUMN IF NOT EXISTS comprehension_score INTEGER,
ADD COLUMN IF NOT EXISTS personality_score INTEGER,
ADD COLUMN IF NOT EXISTS job_knowledge_score INTEGER,
ADD COLUMN IF NOT EXISTS overall_impression_score INTEGER,
ADD COLUMN IF NOT EXISTS communication_skills_remarks TEXT,
ADD COLUMN IF NOT EXISTS confidence_remarks TEXT,
ADD COLUMN IF NOT EXISTS comprehension_remarks TEXT,
ADD COLUMN IF NOT EXISTS personality_remarks TEXT,
ADD COLUMN IF NOT EXISTS job_knowledge_remarks TEXT,
ADD COLUMN IF NOT EXISTS overall_impression_remarks TEXT,
ADD COLUMN IF NOT EXISTS interview_notes TEXT,
ADD COLUMN IF NOT EXISTS recommendation VARCHAR(50),
ADD COLUMN IF NOT EXISTS interviewer_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS job_posting_id UUID,
ADD COLUMN IF NOT EXISTS email VARCHAR(200);

-- Create index on job_posting_id for faster queries
CREATE INDEX IF NOT EXISTS idx_evaluations_job_posting_id ON evaluations(job_posting_id);

-- Add comment for documentation
COMMENT ON TABLE evaluations IS 'Stores interviewer evaluations for applicants including oral interview scores and PCPT assessment scores';
