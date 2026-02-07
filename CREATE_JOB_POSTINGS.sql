-- Create job_postings table if it doesn't exist
CREATE TABLE IF NOT EXISTS job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL,
  office VARCHAR(255) NOT NULL,
  description TEXT,
  item_number VARCHAR(100),
  status VARCHAR(50) DEFAULT 'Open' CHECK (status IN ('Open', 'Closed', 'On Hold')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_job_postings_title ON job_postings(title);
CREATE INDEX IF NOT EXISTS idx_job_postings_status ON job_postings(status);

-- Enable Row Level Security
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read job_postings" ON job_postings;
DROP POLICY IF EXISTS "Allow authenticated insert job_postings" ON job_postings;

-- Create new policies
CREATE POLICY "Allow public read job_postings"
ON job_postings FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow authenticated insert job_postings"
ON job_postings FOR INSERT
TO authenticated
WITH CHECK (true);

-- Delete existing sample data and insert fresh data
DELETE FROM job_postings WHERE title IN (
  'Administrative Officer III', 'Senior Accountant', 'IT Systems Administrator',
  'Human Resources Specialist', 'Planning Officer II', 'Civil Engineer',
  'Health Officer', 'Legal Consultant'
);

-- Insert sample job postings
INSERT INTO job_postings (title, department, office, description, item_number, status) VALUES
('Administrative Officer III', 'City Social Welfare and Development', 'City Social Welfare and Development', 'Responsible for administrative tasks', '001', 'Open'),
('Senior Accountant', 'Finance Department', 'Finance Department', 'Handle financial records and reporting', '002', 'Open'),
('IT Systems Administrator', 'Information Technology', 'Information Technology', 'Manage IT infrastructure', '003', 'Open'),
('Human Resources Specialist', 'Human Resources', 'Human Resources', 'Recruit and manage employees', '004', 'Open'),
('Planning Officer II', 'Planning Department', 'Planning Department', 'Develop and implement plans', '005', 'Open'),
('Civil Engineer', 'Engineering Department', 'Engineering Department', 'Design and supervise projects', '006', 'Open'),
('Health Officer', 'Health Services', 'Health Services', 'Public health management', '007', 'Open'),
('Legal Consultant', 'Legal Services', 'Legal Services', 'Provide legal advice', '008', 'Open');

-- Show success message
SELECT 'Job postings table updated successfully with sample data!' as message;
