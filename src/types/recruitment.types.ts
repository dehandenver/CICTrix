export type PositionType = 'Civil Service' | 'COS' | 'JO' | 'Contractual';
export type EmploymentStatus = 'Permanent' | 'Temporary' | 'Contractual';

export interface JobPosting {
  id: string;
  jobCode: string;
  title: string;
  department: string;
  division?: string;
  positionType: PositionType;
  salaryGrade?: string;
  salaryRange?: { min: number; max: number };
  numberOfPositions: number;
  employmentStatus: EmploymentStatus;
  summary: string;
  responsibilities: string[];
  qualifications: {
    education: string;
    experience: { years: number; field: string };
    skills: string[];
    certifications: string[];
    preferred?: string;
  };
  requiredDocuments: string[];
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
  | 'Rejected';

export interface Applicant {
  id: string;
  jobPostingId: string;
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    dateOfBirth: string;
  };
  qualificationScore: number;
  status: ApplicantStatus;
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
  employeeInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
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
  employmentType: string;
  salaryGrade?: string;
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
  position: string;
  department: string;
  division?: string;
  startDate: string;
}
