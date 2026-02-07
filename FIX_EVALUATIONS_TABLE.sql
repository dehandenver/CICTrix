-- COMPREHENSIVE FIX: Transform evaluations table from backend schema to form schema
-- This handles the fact that your actual database uses schema_with_backend.sql

-- Step 1: Show current structure
SELECT 'BEFORE MIGRATION - Current columns:' as status;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'evaluations'
ORDER BY ordinal_position;

-- Step 2: Disable RLS to safely modify table
ALTER TABLE evaluations DISABLE ROW LEVEL SECURITY;

-- Step 3: Make existing NOT NULL columns nullable
ALTER TABLE evaluations ALTER COLUMN evaluator_id DROP NOT NULL;
ALTER TABLE evaluations ALTER COLUMN score DROP NOT NULL;

-- Step 4: Add ALL the oral interview columns
ALTER TABLE evaluations
ADD COLUMN IF NOT EXISTS interviewer_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS recommendation VARCHAR(50) CHECK (recommendation IS NULL OR recommendation IN ('Highly Recommended', 'Recommended', 'Not Recommended')),
ADD COLUMN IF NOT EXISTS communication_skills_score INTEGER CHECK (communication_skills_score IS NULL OR (communication_skills_score >= 1 AND communication_skills_score <= 5)),
ADD COLUMN IF NOT EXISTS confidence_score INTEGER CHECK (confidence_score IS NULL OR (confidence_score >= 1 AND confidence_score <= 5)),
ADD COLUMN IF NOT EXISTS comprehension_score INTEGER CHECK (comprehension_score IS NULL OR (comprehension_score >= 1 AND comprehension_score <= 5)),
ADD COLUMN IF NOT EXISTS personality_score INTEGER CHECK (personality_score IS NULL OR (personality_score >= 1 AND personality_score <= 5)),
ADD COLUMN IF NOT EXISTS job_knowledge_score INTEGER CHECK (job_knowledge_score IS NULL OR (job_knowledge_score >= 1 AND job_knowledge_score <= 5)),
ADD COLUMN IF NOT EXISTS overall_impression_score INTEGER CHECK (overall_impression_score IS NULL OR (overall_impression_score >= 1 AND overall_impression_score <= 5)),
ADD COLUMN IF NOT EXISTS communication_skills_remarks TEXT,
ADD COLUMN IF NOT EXISTS confidence_remarks TEXT,
ADD COLUMN IF NOT EXISTS comprehension_remarks TEXT,
ADD COLUMN IF NOT EXISTS personality_remarks TEXT,
ADD COLUMN IF NOT EXISTS job_knowledge_remarks TEXT,
ADD COLUMN IF NOT EXISTS overall_impression_remarks TEXT,
ADD COLUMN IF NOT EXISTS interview_notes TEXT;

-- Step 5: Drop ALL existing policies (clean slate)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'evaluations') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON evaluations', r.policyname);
    END LOOP;
END $$;

-- Step 6: Re-enable RLS
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

-- Step 7: Create simple, permissive policies for anon role
CREATE POLICY "anon_insert" 
ON evaluations 
FOR INSERT
TO anon 
WITH CHECK (true);

CREATE POLICY "anon_select" 
ON evaluations 
FOR SELECT
TO anon 
USING (true);

CREATE POLICY "anon_update" 
ON evaluations 
FOR UPDATE
TO anon 
USING (true)
WITH CHECK (true);

CREATE POLICY "anon_delete" 
ON evaluations 
FOR DELETE
TO anon 
USING (true);

-- Step 8: Create policies for authenticated users
CREATE POLICY "authenticated_insert" 
ON evaluations 
FOR INSERT
TO authenticated 
WITH CHECK (true);

CREATE POLICY "authenticated_select" 
ON evaluations 
FOR SELECT
TO authenticated 
USING (true);

CREATE POLICY "authenticated_update" 
ON evaluations 
FOR UPDATE
TO authenticated 
USING (true)
WITH CHECK (true);

CREATE POLICY "authenticated_delete" 
ON evaluations 
FOR DELETE
TO authenticated 
USING (true);

-- Step 9: Create policies for service role
CREATE POLICY "service_role_insert" 
ON evaluations 
FOR INSERT
TO service_role 
WITH CHECK (true);

CREATE POLICY "service_role_select" 
ON evaluations 
FOR SELECT
TO service_role 
USING (true);

CREATE POLICY "service_role_update" 
ON evaluations 
FOR UPDATE
TO service_role 
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_delete" 
ON evaluations 
FOR DELETE
TO service_role 
USING (true);

-- Step 10: Verify final structure
SELECT 'AFTER MIGRATION - Final columns:' as status;
SELECT column_name, data_type, is_nullable, 
       CASE WHEN is_nullable = 'NO' THEN '❌ NOT NULL' ELSE '✅ Nullable' END as null_constraint
FROM information_schema.columns
WHERE table_name = 'evaluations'
ORDER BY ordinal_position;

-- Step 11: Verify policies
SELECT 'AFTER MIGRATION - Policies:' as status;
SELECT policyname, cmd, roles::text
FROM pg_policies
WHERE tablename = 'evaluations'
ORDER BY policyname;

-- Step 12: Success message
SELECT '✅ Migration complete! Your evaluations table is now ready for oral interview forms.' as status;
