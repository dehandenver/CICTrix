export type PositionType = 'Civil Service' | 'COS' | 'JO' | 'Contractual';
export type EmploymentStatus = 'Permanent' | 'Temporary' | 'Contractual';

export type PlantillaSlotStatus = 'open' | 'filled' | 'closed';

/**
 * One vacant plantilla item inside a job post. A post that advertises four
 * identical "Admin Aide" vacancies carries four of these, each with its own
 * real item number — the post itself no longer owns a single item number.
 *
 * `slotNumber` is the display ordinal ("Plantilla 1"). It is system-assigned
 * and re-sequenced when a middle row is removed, so it is NOT a stable key —
 * `id` and `itemNumber` are.
 */
export interface PlantillaSlot {
  id: string;
  jobPostingId: string;
  slotNumber: number;
  itemNumber: string;
  /** Per-slot overrides. Undefined means "inherit the posting's shared value". */
  salaryGrade?: number;
  monthlySalary?: number;
  status: PlantillaSlotStatus;
  filledByApplicantId?: string;
  filledAt?: string;
}

export type ApplicationSlotStatus = 'applied' | 'shortlisted' | 'not_selected' | 'hired';

/** One row of the application -> slot many-to-many. */
export interface ApplicationPlantillaLink {
  applicantId: string;
  plantillaSlotId: string;
  status: ApplicationSlotStatus;
}

export interface JobPosting {
  id: string;
  /**
   * Mirror of the FIRST plantilla slot's item number, kept in step by a DB
   * trigger (migration 20260922). The authoritative list is `plantillaSlots`;
   * this stays only because the applicant -> posting linkage across the app is
   * still string matching on it.
   */
  jobCode: string;
  /** Every plantilla item this post is hiring for. Always at least one. */
  plantillaSlots?: PlantillaSlot[];
  title: string;
  department: string;
  division?: string;
  positionType: PositionType;
  numberOfPositions: number;
  employmentStatus: EmploymentStatus;
  summary: string;
  responsibilities: string[];
  qualifications: {
    /** Highest educational attainment required, e.g. "College Graduate". */
    education: string;
    /** The course/discipline it must be in, e.g. "BS Information Technology or related". */
    educationField?: string;
    experience: { years: number; field: string };
    skills: string[];
    certifications: string[];
    preferred?: string;
  };
  requiredDocuments: string[];
  // CREATE JOB spec additions on Job Information.
  salaryGrade?: number;
  monthlySalary?: number;
  // Optional structured qualification details (mirror Qualifications form).
  eligibility?: string;
  training?: string;
  competency?: string;
  applicationDeadline: string;
  interviewPeriod?: { start: string; end: string };
  expectedStartDate?: string;
  status: 'Draft' | 'Active' | 'Closed' | 'Filled';
  postedDate: string;
  postedBy: string;
  applicantCount: number;
  qualifiedCount: number;
}

export type ApplicantStatus =
  | 'New Application'
  | 'Under Review'
  | 'Shortlisted'
  | 'For Interview'
  | 'Interview Scheduled'
  | 'Interview Completed'
  | 'Recommended for Hiring'
  | 'Not Qualified'
  | 'Rejected'
  | 'Document Verified'
  | 'Action Required';

export interface Applicant {
  id: string;
  jobPostingId: string;
  /**
   * The plantilla slots this single application is in the running for, with a
   * per-slot outcome. Empty for walk-in/direct applications that were never
   * filed against a posting.
   */
  appliedSlots?: Array<{ slotId: string; status: ApplicationSlotStatus }>;
  /** Set when the slot(s) this applicant chose were deleted by an admin. */
  needsSlotReassignment?: boolean;
  applicationType?: 'job' | 'promotion';
  internalApplication?: {
    employeeId: string;
    currentPosition?: string;
    currentDepartment?: string;
    currentDivision?: string;
    employeeUsername?: string;
  };
  /**
   * System-generated tracking code for this one application, format
   * ABYAN-000-000. Issued by the database on insert, never edited, and never
   * reissued — one per application no matter how many plantilla slots it
   * covers. Distinct from the position's Plantilla Item No.
   */
  referenceNo?: string;
  personalInfo: {
    firstName: string;
    lastName: string;
    /** The Plantilla Item No. applied for — a position code, not a tracking code. */
    itemNumber?: string;
    email: string;
    phone: string;
    address: string;
    dateOfBirth: string;
  };
  qualificationScore: number;
  status: ApplicantStatus;
  educationAttainment?: string;
  education: Array<{ degree: string; school: string; year: number }>;
  experience: Array<{ title: string; company: string; years: number }>;
  skills: string[];
  certifications: string[];
  documents: Array<{ type: string; url: string; verified: boolean }>;
  applicationDate: string;
  interview?: {
    scheduledDate: string;
    type: 'In-Person' | 'Online' | 'Phone';
    meetingLink?: string;
    interviewers: string[];
    results?: {
      technicalScore: number;
      culturalFitScore: number;
      recommendation: string;
      comments: string;
    };
  };
  notes: Array<{ author: string; content: string; date: string; pinned: boolean }>;
  timeline: Array<{ event: string; date: string; actor: string }>;
}

export type NewlyHiredStatus =
  | 'Pending Onboarding'
  | 'In Onboarding'
  | 'Onboarding Complete'
  | 'Deployed';

export interface NewlyHired {
  id: string;
  applicantId?: string;
  applicationType?: 'job' | 'promotion';
  internalApplication?: {
    employeeId: string;
    previousPosition?: string;
    previousDepartment?: string;
    previousDivision?: string;
    employeeUsername?: string;
  };
  rankingRank?: number;
  rankingScore?: number;
  employeeInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address?: string;
    emergencyContact: { name: string; relationship: string; phone: string };
    governmentIds: {
      sss?: string;
      philhealth?: string;
      pagibig?: string;
      tin?: string;
    };
  };
  position: string;
  department: string;
  division?: string;
  /**
   * The specific plantilla item this hire fills. A posting can cover several
   * identical vacancies, so reports and exports must name the item number the
   * person was actually placed into, not just the position title.
   */
  plantillaItemNumber?: string;
  plantillaSlotNumber?: number;
  employmentType: string;
  dateHired: string;
  expectedStartDate: string;
  supervisor?: string;
  status: NewlyHiredStatus;
  onboardingProgress: number;
  onboardingChecklist: Array<{
    category: string;
    item: string;
    completed: boolean;
    completedDate?: string;
    completedBy?: string;
  }>;
  documents: Array<{ type: string; url: string; verified: boolean }>;
  notes: Array<{ author: string; content: string; date: string }>;
  timeline: Array<{ event: string; date: string; actor: string }>;
  deployedDate?: string;
  employeeId?: string;
}

export interface RaterAssignment {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePosition: string;
  department: string;
  evaluationPeriod: string;
  raters: {
    immediateSupervisor: { id: string; name: string; position: string };
    departmentHead: { id: string; name: string; position: string };
    additionalRater?: { id: string; name: string; position: string };
    pmdHead: { id: string; name: string; position: string };
  };
  effectiveDate: string;
  expirationDate?: string;
  status: 'Assigned' | 'Pending' | 'Unassigned';
  createdBy: string;
  createdDate: string;
}

export interface EvaluationPeriod {
  id: string;
  name: string;
  type: 'Annual' | 'Semi-Annual' | 'Quarterly';
  startDate: string;
  endDate: string;
  submissionDeadline: string;
  status: 'Active' | 'Completed' | 'Upcoming';
}

export interface EmployeeRecord {
  id: string;
  employeeId: string;
  name: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  division?: string;
  startDate: string;
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
}
