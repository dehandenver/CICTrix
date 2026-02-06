-- Migration: Split name field into first_name, middle_name, last_name
-- Run this in your Supabase SQL Editor to update existing applicants table

-- Step 1: Add new columns
ALTER TABLE applicants 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS middle_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);

-- Step 2: Migrate existing data (split names)
-- This attempts to split the existing 'name' column
-- Assumes format: "First Middle Last" or "First Last"
UPDATE applicants
SET 
  first_name = CASE 
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(name, ' '), 1) >= 3 
    THEN STRING_TO_ARRAY(name, ' ')[1]
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(name, ' '), 1) = 2 
    THEN STRING_TO_ARRAY(name, ' ')[1]
    ELSE name
  END,
  middle_name = CASE 
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(name, ' '), 1) >= 3 
    THEN STRING_TO_ARRAY(name, ' ')[2]
    ELSE ''
  END,
  last_name = CASE 
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(name, ' '), 1) >= 3 
    THEN ARRAY_TO_STRING(STRING_TO_ARRAY(name, ' ')[3:], ' ')
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(name, ' '), 1) = 2 
    THEN STRING_TO_ARRAY(name, ' ')[2]
    ELSE ''
  END
WHERE first_name IS NULL OR last_name IS NULL;

-- Step 3: Set NOT NULL constraints on required fields
ALTER TABLE applicants 
ALTER COLUMN first_name SET NOT NULL,
ALTER COLUMN last_name SET NOT NULL;

-- Step 4: Drop the old 'name' column (optional - uncomment if you want to remove it)
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
