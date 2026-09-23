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

  // IV. Civil Service Eligibility
  eligibility?: EmployeeEligibility[];

  // V. Work Experience
  workExperience?: EmployeeWorkExperience[];

  // VI. Voluntary Work
  voluntaryWork?: EmployeeVoluntaryWork[];

  // VII. Learning & Development Interventions
  ldInterventions?: EmployeeLdIntervention[];

  // VIII. Other Information
  specialSkillsHobbies?: string;
  nonAcademicDistinctions?: string;
  membershipAssociations?: string;

  // Background Information (34-40) — nullable: unanswered vs. an explicit
  // "No" are different states on a legal disclosure.
  relatedThirdDegree?: boolean | null;
  relatedFourthDegree?: boolean | null;
  relatedDetails?: string;
  adminOffenseGuilty?: boolean | null;
  adminOffenseDetails?: string;
  criminallyCharged?: boolean | null;
  criminalChargeDetails?: string;
  criminalCaseDateFiled?: string;
  criminalCaseStatus?: string;
  convictedOfCrime?: boolean | null;
  convictedDetails?: string;
  separatedFromService?: boolean | null;
  separatedDetails?: string;
  electionCandidate?: boolean | null;
  electionCandidateDetails?: string;
  resignedToCampaign?: boolean | null;
  resignedToCampaignDetails?: string;
  immigrantStatus?: boolean | null;
  immigrantCountry?: string;
  indigenousGroupMember?: boolean | null;
  indigenousGroupSpecify?: string;
  personWithDisability?: boolean | null;
  pwdIdNumber?: string;
  soloParent?: boolean | null;
  soloParentIdNumber?: string;

  // 41. References
  references?: EmployeeReference[];

  // 42. Government-issued ID (data fields only — no photo/signature/thumbmark)
  govIdType?: string;
  govIdNumber?: string;
  govIdIssuedDatePlace?: string;

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

/**
 * The five levels item 26 asks for, in the order the form prints them.
 *
 * Stored value is "Vocational" (not "Vocational / Trade Course", which is
 * only the printed form's label) — the pre-existing employee_education
 * table's `valid_education_level` check constraint only allows Elementary /
 * Secondary / Vocational / College / 'Graduate Studies' / Doctorate, and
 * writing the longer label fails that constraint. EDUCATION_LEVEL_LABELS
 * maps the stored value back to what the sheet prints.
 */
export const EDUCATION_LEVELS = [
  'Elementary',
  'Secondary',
  'Vocational',
  'College',
  'Graduate Studies',
] as const;

export const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  Vocational: 'Vocational / Trade Course',
};

export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

/**
 * One row of III. EDUCATIONAL BACKGROUND.
 *
 * Backed by the pre-existing `employee_education` table (also read by the
 * admin "employee 201 file" view) — field names here follow its real
 * columns, not the form's own item labels.
 */
export interface EmployeeEducation {
  id?: string;
  level: EducationLevel | string;
  school?: string; // column: school_name
  degree?: string; // column: course
  periodFrom?: number | null; // column: year_attended_from (int)
  periodTo?: number | null; // column: year_attended_to (int)
  highestLevelUnits?: number | null; // column: units_earned (int)
  yearGraduated?: number | null;
  scholarshipHonors?: string; // column: honors_awards
  sortOrder?: number;
}

/**
 * 27. CIVIL SERVICE ELIGIBILITY — a repeating list on the form.
 *
 * Backed by the pre-existing `employee_eligibility` table (also read by the
 * admin "employee 201 file" view in lib/api/employees.ts), not a new one —
 * field names here follow that table's real columns, which predate this PDS
 * work and don't match the form's own item labels 1:1 (e.g. `rating` is
 * numeric there, not free text).
 */
export interface EmployeeEligibility {
  id?: string;
  eligibilityName: string; // column: eligibility_type
  rating?: number | null; // column: rating (numeric)
  examDate?: string; // column: date_of_exam
  examPlace?: string; // column: place_of_examination
  licenseNumber?: string;
  licenseValidUntil?: string; // column: validity_date
  sortOrder?: number;
}

/**
 * 28. WORK EXPERIENCE — a repeating list on the form.
 *
 * Backed by the pre-existing `employee_work_experience` table (same admin
 * view as above). `positionTitle`, `departmentAgencyOfficeCompany` (column:
 * company_name) and `dateFrom` are NOT NULL on that table, so a row without
 * all three is dropped on save rather than written.
 */
export interface EmployeeWorkExperience {
  id?: string;
  dateFrom?: string; // column: from_date (NOT NULL)
  dateTo?: string; // column: to_date
  positionTitle: string; // NOT NULL
  departmentAgencyOfficeCompany?: string; // column: company_name (NOT NULL)
  statusOfAppointment?: string;
  govtService?: boolean | null; // column: is_government_service
  sortOrder?: number;
}

/** 29. VOLUNTARY WORK — a repeating list on the form. */
export interface EmployeeVoluntaryWork {
  id?: string;
  orgNameAddress: string;
  dateFrom?: string; // ISO date
  dateTo?: string; // ISO date
  numberOfHours?: number | null;
  positionNatureOfWork?: string;
  sortOrder?: number;
}

/** 30. L&D INTERVENTIONS / TRAINING PROGRAMS ATTENDED — a repeating list on
 * the form. Named after the form's own heading, not "training(s)" — the
 * codebase's existing training/L&D scheduling system is a separate,
 * unrelated feature (see the page 2-4 migration's comment on this table). */
export interface EmployeeLdIntervention {
  id?: string;
  title: string;
  dateFrom?: string; // ISO date
  dateTo?: string; // ISO date
  numberOfHours?: number | null;
  ldType?: string;
  conductedBy?: string;
  sortOrder?: number;
}

/** 41. REFERENCES — a repeating list on the form. */
export interface EmployeeReference {
  id?: string;
  name: string;
  address?: string;
  contactInfo?: string;
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
