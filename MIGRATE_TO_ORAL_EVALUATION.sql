-- Step 1: Add Oral Interview Assessment columns
ALTER TABLE evaluations
ADD COLUMN IF NOT EXISTS communication_skills_score INTEGER CHECK (communication_skills_score >= 1 AND communication_skills_score <= 5),
ADD COLUMN IF NOT EXISTS confidence_score INTEGER CHECK (confidence_score >= 1 AND confidence_score <= 5),
ADD COLUMN IF NOT EXISTS comprehension_score INTEGER CHECK (comprehension_score >= 1 AND comprehension_score <= 5),
ADD COLUMN IF NOT EXISTS personality_score INTEGER CHECK (personality_score >= 1 AND personality_score <= 5),
ADD COLUMN IF NOT EXISTS job_knowledge_score INTEGER CHECK (job_knowledge_score >= 1 AND job_knowledge_score <= 5),
ADD COLUMN IF NOT EXISTS overall_impression_score INTEGER CHECK (overall_impression_score >= 1 AND overall_impression_score <= 5),
ADD COLUMN IF NOT EXISTS communication_skills_remarks TEXT,
ADD COLUMN IF NOT EXISTS confidence_remarks TEXT,
ADD COLUMN IF NOT EXISTS comprehension_remarks TEXT,
ADD COLUMN IF NOT EXISTS personality_remarks TEXT,
ADD COLUMN IF NOT EXISTS job_knowledge_remarks TEXT,
ADD COLUMN IF NOT EXISTS overall_impression_remarks TEXT,
ADD COLUMN IF NOT EXISTS interview_notes TEXT;

-- Step 2: Disable RLS temporarily to update policies
ALTER TABLE evaluations DISABLE ROW LEVEL SECURITY;

-- Step 3: Drop ALL existing policies (including the one that already exists)
DROP POLICY IF EXISTS "Allow public insert on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON evaluations;
DROP POLICY IF EXISTS "Enable insert for anon users only" ON evaluations;
DROP POLICY IF EXISTS "Allow authenticated users to insert evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow anon to insert evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow service role full access" ON evaluations;
DROP POLICY IF EXISTS "Allow authenticated insert on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow authenticated read on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow authenticated update on evaluations" ON evaluations;

-- Step 4: Re-enable RLS and create permissive policies
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon to insert evaluations" 
ON evaluations 
FOR INSERT 
TO anon 
WITH CHECK (true);

CREATE POLICY "Allow service role full access" 
ON evaluations 
FOR ALL 
TO service_role 
WITH CHECK (true);

CREATE POLICY "Allow authenticated to read evaluations" 
ON evaluations 
FOR SELECT 
TO authenticated 
USING (true);

-- Step 5: Verify columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'evaluations'
ORDER BY ordinal_position;
