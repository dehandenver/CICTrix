-- Migration: Split name field into first_name, middle_name, last_name
-- Run this in your Supabase SQL Editor to update existing applicants table

-- Step 1: Make the old 'name' column nullable (if it exists)
ALTER TABLE applicants 
ALTER COLUMN name DROP NOT NULL;

-- Step 2: Add new columns
ALTER TABLE applicants 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS middle_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);

-- Step 3: Migrate existing data (split names)
-- This attempts to split the existing 'name' column
-- Assumes format: "First Middle Last" or "First Last"
UPDATE applicants
SET 
  first_name = SPLIT_PART(name, ' ', 1),
  middle_name = CASE 
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(name, ' '), 1) >= 3 
    THEN SPLIT_PART(name, ' ', 2)
    ELSE NULL
  END,
  last_name = CASE 
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(name, ' '), 1) >= 3 
    THEN SPLIT_PART(name, ' ', 3)
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(name, ' '), 1) = 2 
    THEN SPLIT_PART(name, ' ', 2)
    ELSE name
  END
WHERE name IS NOT NULL AND (first_name IS NULL OR last_name IS NULL);

-- Step 4: Set NOT NULL constraints on required fields
ALTER TABLE applicants 
ALTER COLUMN first_name SET NOT NULL,
ALTER COLUMN last_name SET NOT NULL;

-- Step 5: Drop the old 'name' column (optional - uncomment if you want to remove it)
-- ALTER TABLE applicants DROP COLUMN name;

-- Verification query
SELECT 
  id, 
  first_name, 
  middle_name, 
  last_name,
  CONCAT(first_name, ' ', COALESCE(middle_name || ' ', ''), last_name) as full_name
FROM applicants 
LIMIT 10;
