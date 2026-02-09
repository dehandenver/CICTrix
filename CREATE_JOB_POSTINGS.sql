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
  'Administrative Officer', 'Accountant', 'IT Specialist',
  'Human Resource Specialist', 'Budget Officer', 'Legal Officer',
  'Project Coordinator', 'Data Analyst'
);

-- Insert sample job postings using standardized position names from positions.ts
INSERT INTO job_postings (title, department, office, description, item_number, status) VALUES
('Administrative Officer', 'Operations', 'Operations', 'Responsible for administrative tasks and office management', '001', 'Open'),
('Human Resource Specialist', 'Human Resources', 'Human Resources', 'Recruit, hire and manage employees', '002', 'Open'),
('IT Specialist', 'Information Technology', 'Information Technology', 'Manage IT infrastructure and systems', '003', 'Open'),
('Accountant', 'Finance', 'Finance', 'Handle financial records and accounting tasks', '004', 'Open'),
('Budget Officer', 'Finance', 'Finance', 'Prepare and manage organizational budgets', '005', 'Open'),
('Legal Officer', 'Legal', 'Legal', 'Provide legal advice and services', '006', 'Open'),
('Project Coordinator', 'Operations', 'Operations', 'Coordinate and manage projects', '007', 'Open'),
('Data Analyst', 'Product Management', 'Product Management', 'Analyze data and provide insights', '008', 'Open');

-- Show success message
SELECT 'Job postings table updated successfully with sample data!' as message;
