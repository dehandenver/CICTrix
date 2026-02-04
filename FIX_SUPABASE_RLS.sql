-- Run this in your Supabase SQL Editor to fix "failed to fetch" errors
-- This allows anonymous (public) access for the HRIS system

-- DROP existing restrictive policies
DROP POLICY IF EXISTS "Allow authenticated read on applicants" ON applicants;
DROP POLICY IF EXISTS "Allow authenticated read on applicant_attachments" ON applicant_attachments;
DROP POLICY IF EXISTS "Allow authenticated insert on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow authenticated read on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow authenticated update on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow public read on applicants" ON applicants;
DROP POLICY IF EXISTS "Allow public update on applicants" ON applicants;
DROP POLICY IF EXISTS "Allow public read on applicant_attachments" ON applicant_attachments;
DROP POLICY IF EXISTS "Allow public insert on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow public read on evaluations" ON evaluations;
DROP POLICY IF EXISTS "Allow public update on evaluations" ON evaluations;

-- CREATE new policies allowing anonymous access
-- Applicants: Allow public read (for interviewer dashboard)
CREATE POLICY "Allow public read on applicants"
ON applicants FOR SELECT
TO anon, authenticated
USING (true);

-- Allow public update (for changing status during evaluation)
CREATE POLICY "Allow public update on applicants"
ON applicants FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Applicant Attachments: Allow public read (for viewing resumes)
CREATE POLICY "Allow public read on applicant_attachments"
ON applicant_attachments FOR SELECT
TO anon, authenticated
USING (true);

-- Evaluations: Allow public insert/read
CREATE POLICY "Allow public insert on evaluations"
ON evaluations FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public read on evaluations"
ON evaluations FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public update on evaluations"
ON evaluations FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Storage: Allow public read for attachments
DROP POLICY IF EXISTS "Allow authenticated users to read attachments" ON storage.objects;

-- Storage: Allow public upload for attachments
DROP POLICY IF EXISTS "Allow authenticated users to upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload attachments" ON storage.objects;

CREATE POLICY "Allow public read attachments"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'applicant-attachments');

CREATE POLICY "Allow public upload attachments"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'applicant-attachments');
