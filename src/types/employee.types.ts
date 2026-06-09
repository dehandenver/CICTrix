/**
 * Employee types for the HRMO Self-Service Portal
 */

export interface Employee {
  // Profile Information
  employeeId: string;
  supabaseId?: string;
  fullName: string;
  email: string;

  // Personal Information
  dateOfBirth: string; // ISO date: YYYY-MM-DD
  placeOfBirth?: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other' | 'Prefer not to say';
  civilStatus: 'Single' | 'Married' | 'Widowed' | 'Divorced' | 'Separated';
  nationality: string;

  // Contact & Address
  mobileNumber: string;
  homeAddress: string;

  // Emergency Contact
  emergencyContactName: string;
  emergencyRelationship: string;
  emergencyContactNumber: string;

  // Government Identifiers
  sssNumber: string;
  philhealthNumber: string;
  pagibigNumber: string;
  tinNumber: string;
  gsisNumber?: string;

  // Work Information
  employmentStatus?: 'Regular' | 'Probationary' | 'Contractual' | 'Casual';
  dateHired?: string;
  currentPosition?: string;
  currentDepartment?: string;
  currentDivision?: string;
  positionHistory?: Array<{
    position: string;
    department: string;
    division?: string;
    effectiveDate: string;
    endDate?: string;
    changeType?: 'hire' | 'promotion' | 'transfer' | 'update';
    sourceApplicantId?: string;
    notes?: string;
  }>;

  // Metadata
  createdAt?: string;
  updatedAt?: string;
  personalDetailsFinalized?: boolean; // True after first edit in employee portal
}

export interface EmployeeSession {
  employeeId: string;
  supabaseId?: string;
  email: string;
  fullName: string;
  loginUsername?: string; // For mock demo lookups (e.g., 'employee01')
  // True when the account still has the temp password from onboarding and the
  // employee must set their own password before accessing the dashboard.
  mustChangePassword?: boolean;
}

export interface AuthError {
  message: string;
  code?: string;
}
