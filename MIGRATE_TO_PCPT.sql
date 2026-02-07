-- Migrate evaluations table to PCPT Assessment format
-- This script adds the new PCPT scoring columns and deprecates the old ones

-- Drop the old evaluations table if it exists and we're starting fresh
-- ALTER TABLE evaluations DROP COLUMN IF EXISTS technical_score;
-- ALTER TABLE evaluations DROP COLUMN IF EXISTS communication_score;
-- ALTER TABLE evaluations DROP COLUMN IF EXISTS overall_score;

-- Add new PCPT assessment columns
ALTER TABLE evaluations
ADD COLUMN IF NOT EXISTS appearance_score INTEGER CHECK (appearance_score >= 1 AND appearance_score <= 5),
ADD COLUMN IF NOT EXISTS voice_score INTEGER CHECK (voice_score >= 1 AND voice_score <= 5),
ADD COLUMN IF NOT EXISTS personality_score INTEGER CHECK (personality_score >= 1 AND personality_score <= 5),
ADD COLUMN IF NOT EXISTS alertness_score INTEGER CHECK (alertness_score >= 1 AND alertness_score <= 5),
ADD COLUMN IF NOT EXISTS confidence_score INTEGER CHECK (confidence_score >= 1 AND confidence_score <= 5),
ADD COLUMN IF NOT EXISTS composure_score INTEGER CHECK (composure_score >= 1 AND composure_score <= 5);

-- Verify the table structure
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'evaluations'
ORDER BY ordinal_position;
