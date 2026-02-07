-- Add gender column to applicants table
-- Run this migration in your Supabase SQL Editor

-- Add gender column
ALTER TABLE applicants 
ADD COLUMN IF NOT EXISTS gender VARCHAR(10) CHECK (gender IN ('Male', 'Female'));

-- Update existing records to have a default gender (optional - you can skip this if you want to handle it manually)
-- UPDATE applicants SET gender = 'Male' WHERE gender IS NULL;

-- Create index for better query performance (optional)
CREATE INDEX IF NOT EXISTS idx_applicants_gender ON applicants(gender);

-- Verify the changes
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'applicants' 
-- AND column_name = 'gender';
