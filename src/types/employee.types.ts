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

  // ── Personal Data Sheet — CS Form No. 212 (Revised 2025), page 1 ──────────
  // Every field is optional: the sheet is filled in over time, and the portal
  // renders a blank box rather than blocking on a field the employee has not
  // reached yet. Names mirror the numbered items on the printed form.

  // I. Personal Information
  surname?: string;
  firstName?: string;
  middleName?: string;
  nameExtension?: string; // JR., SR.
  heightM?: number;
  weightKg?: number;
  bloodType?: string;
  umidNumber?: string;
  philsysNumber?: string;
  agencyEmployeeNo?: string;
  citizenship?: string;
  citizenshipBasis?: 'By birth' | 'By naturalization';
  dualCitizenshipCountry?: string;
  telephoneNumber?: string;

  // 17/18. Addresses are component fields because the form prints them into
  // separate boxes and a single joined string cannot be split back apart.
  residential?: AddressParts;
  permanent?: AddressParts;

  // II. Family Background
  spouseSurname?: string;
  spouseFirstName?: string;
  spouseMiddleName?: string;
  spouseNameExtension?: string;
  spouseOccupation?: string;
  spouseEmployer?: string;
  spouseBusinessAddress?: string;
  spouseTelephone?: string;
  fatherSurname?: string;
  fatherFirstName?: string;
  fatherMiddleName?: string;
  fatherNameExtension?: string;
  motherSurname?: string; // maiden surname
  motherFirstName?: string;
  motherMiddleName?: string;
  children?: EmployeeChild[];

  // III. Educational Background
  education?: EmployeeEducation[];

  // Sheet metadata
  pdsSignedAt?: string;
  pdsUpdatedAt?: string;

  // Metadata
  createdAt?: string;
  updatedAt?: string;
  personalDetailsFinalized?: boolean; // True after first edit in employee portal
}

/** One address block on the PDS (items 17 and 18). */
export interface AddressParts {
  houseLot?: string;
  street?: string;
  subdivision?: string;
  barangay?: string;
  city?: string;
  province?: string;
  zip?: string;
}

/** 23. NAME of CHILDREN — a repeating list on the form. */
export interface EmployeeChild {
  id?: string;
  fullName: string;
  dateOfBirth?: string; // ISO date
  sortOrder?: number;
}

/** The five levels item 26 asks for, in the order the form prints them. */
export const EDUCATION_LEVELS = [
  'Elementary',
  'Secondary',
  'Vocational / Trade Course',
  'College',
  'Graduate Studies',
] as const;

export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

/** One row of III. EDUCATIONAL BACKGROUND. */
export interface EmployeeEducation {
  id?: string;
  level: EducationLevel | string;
  school?: string;
  degree?: string;
  periodFrom?: string;
  periodTo?: string;
  highestLevelUnits?: string;
  yearGraduated?: number | null;
  scholarshipHonors?: string;
  sortOrder?: number;
}

/** Blank address block — keeps the form's controlled inputs from going undefined. */
export const emptyAddress = (): AddressParts => ({
  houseLot: '', street: '', subdivision: '', barangay: '', city: '', province: '', zip: '',
});

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
