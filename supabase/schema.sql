-- Create applicants table
CREATE TABLE IF NOT EXISTS applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255),
  last_name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  contact_number VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  position VARCHAR(255) NOT NULL,
  item_number VARCHAR(100) NOT NULL,
  office VARCHAR(255) NOT NULL,
  is_pwd BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Reviewed', 'Accepted', 'Rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create applicant_attachments table
CREATE TABLE IF NOT EXISTS applicant_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email);
CREATE INDEX IF NOT EXISTS idx_applicants_created_at ON applicants(created_at);
CREATE INDEX IF NOT EXISTS idx_applicant_attachments_applicant_id ON applicant_attachments(applicant_id);

-- Create storage bucket for applicant attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('applicant-attachments', 'applicant-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies (adjust based on your auth requirements)
CREATE POLICY "Allow authenticated users to upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'applicant-attachments');

CREATE POLICY "Allow authenticated users to read attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'applicant-attachments');

-- Enable Row Level Security
ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE applicant_attachments ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your auth requirements)
-- For this example, we'll allow public insert but you may want to restrict this
CREATE POLICY "Allow public insert on applicants"
ON applicants FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated read on applicants"
ON applicants FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow public insert on applicant_attachments"
ON applicant_attachments FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated read on applicant_attachments"
ON applicant_attachments FOR SELECT
TO authenticated
USING (true);

-- Create evaluations table
CREATE TABLE IF NOT EXISTS evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  interviewer_name VARCHAR(255) NOT NULL,
  technical_score INTEGER CHECK (technical_score >= 1 AND technical_score <= 5),
  communication_score INTEGER CHECK (communication_score >= 1 AND communication_score <= 5),
  overall_score INTEGER CHECK (overall_score >= 1 AND overall_score <= 5),
  comments TEXT,
  recommendation VARCHAR(50) CHECK (recommendation IN ('Highly Recommended', 'Recommended', 'Not Recommended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for evaluations
CREATE INDEX IF NOT EXISTS idx_evaluations_applicant_id ON evaluations(applicant_id);

-- Enable Row Level Security
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

-- Create policies for evaluations
CREATE POLICY "Allow authenticated insert on evaluations"
ON evaluations FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated read on evaluations"
ON evaluations FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated update on evaluations"
ON evaluations FOR UPDATE
TO authenticated
USING (true);
