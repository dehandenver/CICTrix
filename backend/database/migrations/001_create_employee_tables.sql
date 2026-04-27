-- ============================================================================
-- EMPLOYEE ACCOUNTS SYSTEM - DATABASE SCHEMA
-- Created: April 27, 2026
-- Database: Supabase PostgreSQL
-- ============================================================================

-- ============================================================================
-- TABLE 1: employees (Main employee table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS employees (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number VARCHAR(50) UNIQUE NOT NULL,
  
  -- Link to recruitment (if hired through RSP)
  qualified_applicant_id UUID REFERENCES qualified_applicants(id) ON DELETE SET NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  
  -- Personal information
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  suffix VARCHAR(20),
  
  -- Contact information
  email VARCHAR(200) UNIQUE NOT NULL,
  phone VARCHAR(20),
  alternate_phone VARCHAR(20),
  
  -- Address
  current_address_street VARCHAR(200),
  current_address_barangay VARCHAR(100),
  current_address_city VARCHAR(100),
  current_address_province VARCHAR(100),
  current_address_zipcode VARCHAR(10),
  
  permanent_address_street VARCHAR(200),
  permanent_address_barangay VARCHAR(100),
  permanent_address_city VARCHAR(100),
  permanent_address_province VARCHAR(100),
  permanent_address_zipcode VARCHAR(10),
  
  -- Personal details
  date_of_birth DATE,
  place_of_birth VARCHAR(200),
  sex VARCHAR(20),
  civil_status VARCHAR(20),
  nationality VARCHAR(100) DEFAULT 'Filipino',
  
  -- Government IDs
  tin_number VARCHAR(50),
  sss_number VARCHAR(50),
  philhealth_number VARCHAR(50),
  pagibig_number VARCHAR(50),
  gsis_number VARCHAR(50),
  
  -- Emergency contact
  emergency_contact_name VARCHAR(200),
  emergency_contact_relationship VARCHAR(100),
  emergency_contact_phone VARCHAR(20),
  emergency_contact_address TEXT,
  
  -- Employment details
  department VARCHAR(100) NOT NULL,
  position VARCHAR(200) NOT NULL,
  salary_grade VARCHAR(10),
  step_increment INT DEFAULT 1,
  monthly_salary DECIMAL(10,2),
  
  employment_status VARCHAR(50) NOT NULL DEFAULT 'Probationary',
  plantilla_item_number VARCHAR(50),
  
  -- Dates
  date_hired DATE NOT NULL,
  date_regularized DATE,
  date_separated DATE,
  
  -- Work details
  office_location VARCHAR(200),
  work_schedule VARCHAR(100),
  reports_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  
  -- Status
  status VARCHAR(50) DEFAULT 'Active',
  separation_reason VARCHAR(100),
  separation_remarks TEXT,
  
  -- Account access
  user_account_id UUID,
  user_role VARCHAR(50) DEFAULT 'employee',
  account_status VARCHAR(50) DEFAULT 'Pending',
  last_login TIMESTAMP WITH TIME ZONE,
  
  -- Photo
  photo_url VARCHAR(500),
  
  -- Metadata
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  modified_by UUID,
  modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_employment_status CHECK (employment_status IN ('Regular', 'Probationary', 'Casual', 'Contractual', 'Co-terminus')),
  CONSTRAINT valid_status CHECK (status IN ('Active', 'On Leave', 'Suspended', 'Separated', 'Retired', 'Deceased')),
  CONSTRAINT valid_sex CHECK (sex IN ('Male', 'Female', 'Other')),
  CONSTRAINT valid_civil_status CHECK (civil_status IN ('Single', 'Married', 'Widowed', 'Separated', 'Divorced')),
  CONSTRAINT valid_account_status CHECK (account_status IN ('Active', 'Inactive', 'Locked', 'Pending'))
);

-- Indexes for common queries
CREATE INDEX idx_employees_employee_number ON employees(employee_number);
CREATE INDEX idx_employees_email ON employees(email);
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_employment_status ON employees(employment_status);
CREATE INDEX idx_employees_date_hired ON employees(date_hired);
CREATE INDEX idx_employees_reports_to ON employees(reports_to);

-- ============================================================================
-- TABLE 2: employee_education
-- ============================================================================
CREATE TABLE IF NOT EXISTS employee_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  level VARCHAR(50) NOT NULL,
  school_name VARCHAR(200) NOT NULL,
  course VARCHAR(200),
  year_graduated INT,
  units_earned INT,
  year_attended_from INT,
  year_attended_to INT,
  honors_awards VARCHAR(200),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_education_level CHECK (level IN ('Elementary', 'Secondary', 'Vocational', 'College', 'Graduate Studies', 'Doctorate'))
);

CREATE INDEX idx_employee_education_employee_id ON employee_education(employee_id);

-- ============================================================================
-- TABLE 3: employee_work_experience
-- ============================================================================
CREATE TABLE IF NOT EXISTS employee_work_experience (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  position_title VARCHAR(200) NOT NULL,
  company_name VARCHAR(200) NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE,
  is_present BOOLEAN DEFAULT FALSE,
  monthly_salary DECIMAL(10,2),
  salary_grade VARCHAR(10),
  is_government_service BOOLEAN DEFAULT FALSE,
  duties_responsibilities TEXT,
  separation_reason VARCHAR(200),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_employee_work_experience_employee_id ON employee_work_experience(employee_id);

-- ============================================================================
-- TABLE 4: employee_eligibility
-- ============================================================================
CREATE TABLE IF NOT EXISTS employee_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  eligibility_type VARCHAR(200) NOT NULL,
  rating DECIMAL(5,2),
  date_of_exam DATE,
  place_of_examination VARCHAR(200),
  license_number VARCHAR(100),
  validity_date DATE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_employee_eligibility_employee_id ON employee_eligibility(employee_id);

-- ============================================================================
-- TABLE 5: employee_training
-- ============================================================================
CREATE TABLE IF NOT EXISTS employee_training (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  training_title VARCHAR(200) NOT NULL,
  training_type VARCHAR(50),
  conducted_by VARCHAR(200),
  sponsor VARCHAR(200),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  number_of_hours DECIMAL(5,2),
  certificate_number VARCHAR(100),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_training_type CHECK (training_type IN ('Orientation', 'Technical', 'Leadership', 'Compliance', 'Other'))
);

CREATE INDEX idx_employee_training_employee_id ON employee_training(employee_id);

-- ============================================================================
-- TABLE 6: employee_documents
-- ============================================================================
CREATE TABLE IF NOT EXISTS employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  document_type VARCHAR(100) NOT NULL,
  document_name VARCHAR(200) NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_size INT,
  
  uploaded_by UUID NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_document_type CHECK (document_type IN (
    'Resume', 'Birth Certificate', 'Marriage Certificate', 'Diploma',
    'Transcript of Records', 'Civil Service Eligibility', 'License',
    'Government ID', 'Tax Documents', 'Appointment Letter',
    'Previous Employment Certificate', 'Other'
  ))
);

CREATE INDEX idx_employee_documents_employee_id ON employee_documents(employee_id);
CREATE INDEX idx_employee_documents_document_type ON employee_documents(document_type);

-- ============================================================================
-- TABLE 7: employee_history (Audit Trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS employee_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  action VARCHAR(50) NOT NULL,
  field_changed VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  
  effective_date DATE,
  reason TEXT,
  remarks TEXT,
  
  performed_by UUID NOT NULL,
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_action CHECK (action IN (
    'created', 'hired', 'regularized', 'promoted', 'transferred',
    'salary_adjusted', 'suspended', 'reactivated', 'role_changed', 'updated', 'separated'
  ))
);

CREATE INDEX idx_employee_history_employee_id ON employee_history(employee_id);
CREATE INDEX idx_employee_history_action ON employee_history(action);
CREATE INDEX idx_employee_history_performed_at ON employee_history(performed_at);

-- ============================================================================
-- TABLE 8: employee_leave_balances
-- ============================================================================
CREATE TABLE IF NOT EXISTS employee_leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  year INT NOT NULL,
  
  -- Leave types and balances
  vacation_leave_balance DECIMAL(5,2) DEFAULT 15.00,
  vacation_leave_earned DECIMAL(5,2) DEFAULT 0,
  vacation_leave_used DECIMAL(5,2) DEFAULT 0,
  
  sick_leave_balance DECIMAL(5,2) DEFAULT 15.00,
  sick_leave_earned DECIMAL(5,2) DEFAULT 0,
  sick_leave_used DECIMAL(5,2) DEFAULT 0,
  
  maternity_leave_balance DECIMAL(5,2) DEFAULT 105.00,
  maternity_leave_used DECIMAL(5,2) DEFAULT 0,
  
  paternity_leave_balance DECIMAL(5,2) DEFAULT 7.00,
  paternity_leave_used DECIMAL(5,2) DEFAULT 0,
  
  special_leave_balance DECIMAL(5,2) DEFAULT 3.00,
  special_leave_used DECIMAL(5,2) DEFAULT 0,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(employee_id, year)
);

CREATE INDEX idx_employee_leave_balances_employee_id ON employee_leave_balances(employee_id);
CREATE INDEX idx_employee_leave_balances_year ON employee_leave_balances(year);

-- ============================================================================
-- TABLE 9: employee_settings (New - for role-based preferences)
-- ============================================================================
CREATE TABLE IF NOT EXISTS employee_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  
  -- Notification preferences
  email_notifications_enabled BOOLEAN DEFAULT TRUE,
  notification_frequency VARCHAR(50) DEFAULT 'daily',
  
  -- Profile visibility
  profile_visibility VARCHAR(50) DEFAULT 'private',
  
  -- Language and locale
  preferred_language VARCHAR(20) DEFAULT 'en',
  timezone VARCHAR(50) DEFAULT 'Asia/Manila',
  
  -- Work preferences
  work_mode VARCHAR(50),
  emergency_contact_verified BOOLEAN DEFAULT FALSE,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_employee_settings_employee_id ON employee_settings(employee_id);

-- ============================================================================
-- FUNCTION: Update employee's modified_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_employee_modified_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Automatically update modified_at on employee updates
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_employee_modified_at ON employees;
CREATE TRIGGER trigger_employee_modified_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_employee_modified_at();

-- ============================================================================
-- FUNCTION: Generate employee number
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_employee_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  year INT;
  sequence INT;
  counter VARCHAR(5);
BEGIN
  year := EXTRACT(YEAR FROM NOW());
  sequence := (SELECT COALESCE(MAX(CAST(SUBSTRING(employee_number, 12) AS INT)), 0) + 1
               FROM employees
               WHERE employee_number LIKE 'EMP-' || year || '-%');
  counter := LPAD(sequence::TEXT, 5, '0');
  RETURN 'EMP-' || year || '-' || counter;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE employees IS 'Main employee records table - stores all employee information';
COMMENT ON TABLE employee_education IS 'Educational background of employees';
COMMENT ON TABLE employee_work_experience IS 'Previous work experience records';
COMMENT ON TABLE employee_eligibility IS 'Professional eligibility and certifications';
COMMENT ON TABLE employee_training IS 'Training and professional development records';
COMMENT ON TABLE employee_documents IS 'Uploaded employee documents (resumes, certificates, etc.)';
COMMENT ON TABLE employee_history IS 'Audit trail - all changes to employee records';
COMMENT ON TABLE employee_leave_balances IS 'Annual leave balance tracking per employee';
COMMENT ON TABLE employee_settings IS 'Employee-specific settings and preferences';

COMMENT ON COLUMN employees.employee_number IS 'Format: EMP-2026-00001';
COMMENT ON COLUMN employees.employment_status IS 'Regular, Probationary, Casual, Contractual, or Co-terminus';
COMMENT ON COLUMN employees.status IS 'Active, On Leave, Suspended, Separated, Retired, or Deceased';
COMMENT ON COLUMN employees.account_status IS 'Active, Inactive, Locked, or Pending (awaiting activation)';

-- ============================================================================
-- NOTES FOR IMPLEMENTATION
-- ============================================================================
/*
MIGRATION CHECKLIST:
✓ 1. Run this SQL file in Supabase
✓ 2. Enable Row Level Security (RLS) policies for each table
✓ 3. Create API endpoints for CRUD operations
✓ 4. Create Admin Dashboard UI
✓ 5. Create Employee Portal UI
✓ 6. Integrate with RSP module (when applicant is hired)
✓ 7. Create PM module integration (auto-create performance records)
✓ 8. Create L&D module integration (auto-create training records)

EMPLOYEE NUMBER FORMAT:
- EMP-YYYY-#####
- Example: EMP-2026-00001 (first employee in 2026)
- Auto-generated using generate_employee_number() function

STATUS TRANSITIONS:
Active → On Leave → Active (repeatable)
Active → Suspended → Active OR Separated
Active → Separated (final)
Probationary → (after 6 months) → Regular

PERMISSIONS:
- Super Admin: Full access to all employees
- RSP Admin: Create/manage employees, hire from applicants
- PM Admin: View employees, set performance records
- L&D Admin: View employees, manage training
- Department Head: View/manage own department employees
- Supervisor: View/manage direct reports
- Employee: View own profile

INTEGRATION POINTS:
1. RSP Module: When applicant is hired, create employee record
2. PM Module: Auto-create performance evaluation record for new employee
3. L&D Module: Auto-create training enrollment record for new employee
4. Authentication: Link to auth_users via user_account_id

AUDIT TRAIL:
All significant changes logged in employee_history table:
- Hiring, regularization, promotion, transfer, suspension, separation
- Salary adjustments, role changes
- Account status changes
*/
