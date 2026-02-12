/**
 * Employee types for the HRMO Self-Service Portal
 */

export interface Employee {
  // Profile Information
  employeeId: string;
  fullName: string;
  email: string;

  // Personal Information
  dateOfBirth: string; // ISO date: YYYY-MM-DD
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

  // Metadata
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeSession {
  employeeId: string;
  email: string;
  fullName: string;
  loginUsername?: string; // For mock demo lookups (e.g., 'employee01')
}

export interface AuthError {
  message: string;
  code?: string;
}
