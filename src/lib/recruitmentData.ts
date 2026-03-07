import { DEPARTMENTS as APPLICANT_DEPARTMENTS } from '../constants/positions';
import {
    Applicant,
    EmployeeRecord,
    EvaluationPeriod,
    JobPosting,
    NewlyHired,
    RaterAssignment,
} from '../types/recruitment.types';

const JOB_POSTINGS_KEY = 'cictrix_job_postings';
const APPLICANTS_KEY = 'cictrix_qualified_applicants';
const NEWLY_HIRED_KEY = 'cictrix_newly_hired';
const RATER_ASSIGNMENTS_KEY = 'cictrix_rater_assignments_v2';
const EVALUATION_PERIODS_KEY = 'cictrix_evaluation_periods';
const EMPLOYEE_DB_KEY = 'cictrix_employee_records';
const LEGACY_PORTAL_APPLICANTS_KEY = 'cictrix_applicants';
const LEGACY_PORTAL_ATTACHMENTS_KEY = 'cictrix_attachments';
const RECRUITMENT_DATA_VERSION_KEY = 'cictrix_recruitment_data_version';
const RECRUITMENT_DATA_VERSION = '2026-03-07-department-alignment';

export const PH_LOCALE = 'en-PH';
export const PH_TIMEZONE = 'Asia/Manila';

export const formatPHDate = (value: string) =>
  new Date(value).toLocaleDateString(PH_LOCALE, {
    timeZone: PH_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export const formatPHDateTime = (value: string) =>
  new Date(value).toLocaleString(PH_LOCALE, {
    timeZone: PH_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const safeJsonParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const departments = [...APPLICANT_DEPARTMENTS];

const LEGACY_DEPARTMENT_MAP: Record<string, string> = {
  'Human Resource Management Office': 'Human Resources',
  'Information Technology Office': 'Information Technology',
  'City Planning and Development Office': 'Operations',
  'City Health Office': 'Operations',
  'City Engineering Office': 'Operations',
  "Treasurer's Office": 'Finance',
  'Budget Office': 'Finance',
  'General Services Office': 'Operations',
};

const normalizeDepartment = (value: string) => LEGACY_DEPARTMENT_MAP[value] ?? value;

const normalizeText = (value: string) => value.trim().toLowerCase();

const positions = [
  'Administrative Officer II',
  'HR Management Officer I',
  'IT Officer II',
  'Planning Officer III',
  'Nurse II',
  'Engineer III',
  'Accountant II',
  'Records Officer I',
];

const sampleSkills = [
  'Public Service Orientation',
  'Records Management',
  'Data Analysis',
  'Stakeholder Communication',
  'Project Management',
  'MS Office',
  'Policy Compliance',
  'Technical Writing',
];

const createMockJobPostings = (): JobPosting[] => {
  const now = new Date('2026-03-07T10:00:00+08:00');
  const statuses: JobPosting['status'][] = ['Active', 'Closed', 'Draft', 'Filled'];

  return Array.from({ length: 14 }).map((_, index) => {
    const postedDate = new Date(now);
    postedDate.setDate(now.getDate() - index * 3);

    const deadline = new Date(postedDate);
    deadline.setDate(postedDate.getDate() + 21);

    const expectedStartDate = new Date(deadline);
    expectedStartDate.setDate(deadline.getDate() + 15);

    const status = statuses[index % statuses.length];
    const applicantCount = 8 + (index % 6) * 4;

    return {
      id: `job-${index + 1}`,
      jobCode: `LGU-2026-${String(index + 1).padStart(3, '0')}`,
      title: positions[index % positions.length],
      department: departments[index % departments.length],
      division: index % 2 === 0 ? 'Administration Division' : 'Operations Division',
      positionType: (['Civil Service', 'COS', 'JO', 'Contractual'] as const)[index % 4],
      salaryGrade: `SG-${9 + (index % 6)}`,
      salaryRange: { min: 23000 + index * 1000, max: 34000 + index * 1000 },
      numberOfPositions: (index % 3) + 1,
      employmentStatus: (['Permanent', 'Temporary', 'Contractual'] as const)[index % 3],
      summary: `Lead ${positions[index % positions.length]} role supporting ${departments[index % departments.length]} service delivery.`,
      responsibilities: [
        'Prepare and submit required reports on schedule.',
        'Coordinate with internal and external stakeholders.',
        'Implement office policies and process improvements.',
      ],
      qualifications: {
        education: index % 3 === 0 ? 'Bachelor\'s Degree' : 'Master\'s Degree',
        experience: { years: 2 + (index % 4), field: 'Public Administration' },
        skills: sampleSkills.slice(0, 5),
        certifications: ['CSC Professional Eligibility'],
        preferred: 'Experience working in government HRIS projects.',
      },
      requiredDocuments: ['Resume/CV', 'Application Letter', 'Transcript of Records', 'NBI Clearance'],
      applicationDeadline: deadline.toISOString(),
      interviewPeriod:
        status === 'Active'
          ? {
              start: new Date(deadline.getTime() + 2 * 86400000).toISOString(),
              end: new Date(deadline.getTime() + 9 * 86400000).toISOString(),
            }
          : undefined,
      expectedStartDate: expectedStartDate.toISOString(),
      status,
      postedDate: postedDate.toISOString(),
      postedBy: 'HR Admin',
      applicantCount,
      qualifiedCount: Math.max(2, Math.floor(applicantCount * 0.35)),
    };
  });
};


const createMockEvaluationPeriods = (): EvaluationPeriod[] => [
  {
    id: 'period-2025',
    name: '2025 Annual IPCR',
    type: 'Annual',
    startDate: '2025-01-01T00:00:00+08:00',
    endDate: '2025-12-31T23:59:00+08:00',
    submissionDeadline: '2025-12-15T23:59:00+08:00',
    status: 'Completed',
  },
  {
    id: 'period-2026',
    name: '2026 Annual IPCR',
    type: 'Annual',
    startDate: '2026-01-01T00:00:00+08:00',
    endDate: '2026-12-31T23:59:00+08:00',
    submissionDeadline: '2026-12-15T23:59:00+08:00',
    status: 'Active',
  },
  {
    id: 'period-2027',
    name: '2027 Annual IPCR',
    type: 'Annual',
    startDate: '2027-01-01T00:00:00+08:00',
    endDate: '2027-12-31T23:59:00+08:00',
    submissionDeadline: '2027-12-15T23:59:00+08:00',
    status: 'Upcoming',
  },
];

const buildInitialData = () => {
  const jobs = createMockJobPostings();
  const applicants: Applicant[] = [];
  const newlyHired: NewlyHired[] = [];
  const assignments: RaterAssignment[] = [];
  const periods = createMockEvaluationPeriods();
  const employees: EmployeeRecord[] = [];

  return { jobs, applicants, newlyHired, assignments, periods, employees };
};

export const ensureRecruitmentSeedData = () => {
  const currentVersion = localStorage.getItem(RECRUITMENT_DATA_VERSION_KEY);
  if (currentVersion !== RECRUITMENT_DATA_VERSION) {
    // Clear demo people data so testing can start from a clean state.
    localStorage.setItem(APPLICANTS_KEY, JSON.stringify([]));
    localStorage.setItem(NEWLY_HIRED_KEY, JSON.stringify([]));
    localStorage.setItem(RATER_ASSIGNMENTS_KEY, JSON.stringify([]));
    localStorage.setItem(EMPLOYEE_DB_KEY, JSON.stringify([]));

    // Align old department labels to applicant-side canonical department list.
    const existingJobs = safeJsonParse<JobPosting[]>(localStorage.getItem(JOB_POSTINGS_KEY), []);
    if (existingJobs.length) {
      const normalizedJobs = existingJobs.map((job) => ({
        ...job,
        department: normalizeDepartment(job.department),
      }));
      localStorage.setItem(JOB_POSTINGS_KEY, JSON.stringify(normalizedJobs));
    }

    localStorage.setItem(RECRUITMENT_DATA_VERSION_KEY, RECRUITMENT_DATA_VERSION);
  }

  const hasSeed = Boolean(localStorage.getItem(JOB_POSTINGS_KEY));
  if (hasSeed) {
    backfillPortalApplicantsToRecruitment();
    return;
  }

  const seed = buildInitialData();
  localStorage.setItem(JOB_POSTINGS_KEY, JSON.stringify(seed.jobs));
  localStorage.setItem(APPLICANTS_KEY, JSON.stringify(seed.applicants));
  localStorage.setItem(NEWLY_HIRED_KEY, JSON.stringify(seed.newlyHired));
  localStorage.setItem(RATER_ASSIGNMENTS_KEY, JSON.stringify(seed.assignments));
  localStorage.setItem(EVALUATION_PERIODS_KEY, JSON.stringify(seed.periods));
  localStorage.setItem(EMPLOYEE_DB_KEY, JSON.stringify(seed.employees));
  localStorage.setItem(RECRUITMENT_DATA_VERSION_KEY, RECRUITMENT_DATA_VERSION);

  backfillPortalApplicantsToRecruitment();
};

export const getJobPostings = () => safeJsonParse<JobPosting[]>(localStorage.getItem(JOB_POSTINGS_KEY), []);
export const saveJobPostings = (rows: JobPosting[]) => localStorage.setItem(JOB_POSTINGS_KEY, JSON.stringify(rows));

export const getApplicants = () => safeJsonParse<Applicant[]>(localStorage.getItem(APPLICANTS_KEY), []);
export const saveApplicants = (rows: Applicant[]) => localStorage.setItem(APPLICANTS_KEY, JSON.stringify(rows));

export const getNewlyHired = () => safeJsonParse<NewlyHired[]>(localStorage.getItem(NEWLY_HIRED_KEY), []);
export const saveNewlyHired = (rows: NewlyHired[]) => localStorage.setItem(NEWLY_HIRED_KEY, JSON.stringify(rows));

export const getRaterAssignments = () =>
  safeJsonParse<RaterAssignment[]>(localStorage.getItem(RATER_ASSIGNMENTS_KEY), []);
export const saveRaterAssignments = (rows: RaterAssignment[]) =>
  localStorage.setItem(RATER_ASSIGNMENTS_KEY, JSON.stringify(rows));

export const getEvaluationPeriods = () =>
  safeJsonParse<EvaluationPeriod[]>(localStorage.getItem(EVALUATION_PERIODS_KEY), []);
export const saveEvaluationPeriods = (rows: EvaluationPeriod[]) =>
  localStorage.setItem(EVALUATION_PERIODS_KEY, JSON.stringify(rows));

export const getEmployeeRecords = () =>
  safeJsonParse<EmployeeRecord[]>(localStorage.getItem(EMPLOYEE_DB_KEY), []);
export const saveEmployeeRecords = (rows: EmployeeRecord[]) =>
  localStorage.setItem(EMPLOYEE_DB_KEY, JSON.stringify(rows));

export const toTitleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ');

export const toCsv = (headers: string[], rows: Array<Array<string | number>>) => {
  const escape = (value: string | number) => {
    const stringValue = `${value ?? ''}`;
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
};

export const downloadTextFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const generateEmployeeId = (indexSeed: number) =>
  `EMP-2026-${String(indexSeed).padStart(3, '0')}`;

type SyncAttachment = {
  name: string;
  type: string;
  size: number;
  documentType?: string;
};

type ApplicantSubmissionSyncInput = {
  applicantId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  position: string;
  department: string;
  isPwd?: boolean;
  submittedAt?: string;
  attachments?: SyncAttachment[];
};

type LegacyPortalApplicant = {
  id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  address: string;
  contact_number: string;
  email: string;
  position: string;
  office: string;
  is_pwd?: boolean;
  created_at?: string;
};

type LegacyPortalAttachment = {
  applicant_id: string;
  file_name: string;
  document_type?: string;
};

const ensureJobPostingForSubmission = (position: string, department: string): JobPosting => {
  const normalizedPosition = normalizeText(position);
  const normalizedDepartment = normalizeDepartment(department);
  const jobs = getJobPostings();

  const existing = jobs.find(
    (job) => normalizeText(job.title) === normalizedPosition && normalizeText(job.department) === normalizeText(normalizedDepartment)
  );
  if (existing) return existing;

  const now = new Date();
  const deadline = new Date(now.getTime() + 30 * 86400000);
  const nextJobNumber = jobs.length + 1;
  const nextJob: JobPosting = {
    id: crypto.randomUUID(),
    jobCode: `LGU-2026-${String(nextJobNumber).padStart(3, '0')}`,
    title: position,
    department: normalizedDepartment,
    division: 'Operations',
    positionType: 'Civil Service',
    salaryGrade: 'SG-10',
    salaryRange: { min: 20000, max: 30000 },
    numberOfPositions: 1,
    employmentStatus: 'Permanent',
    summary: `Applicant intake posting for ${position}.`,
    responsibilities: ['Screen applicants and coordinate interview workflow.'],
    qualifications: {
      education: "Bachelor's Degree",
      experience: { years: 0, field: 'General' },
      skills: [],
      certifications: [],
    },
    requiredDocuments: ['Resume/CV', 'Application Letter'],
    applicationDeadline: deadline.toISOString(),
    expectedStartDate: new Date(deadline.getTime() + 14 * 86400000).toISOString(),
    status: 'Active',
    postedDate: now.toISOString(),
    postedBy: 'Applicant Intake Sync',
    applicantCount: 0,
    qualifiedCount: 0,
  };

  saveJobPostings([nextJob, ...jobs]);
  return nextJob;
};

export const syncApplicantSubmissionToRecruitment = (
  input: ApplicantSubmissionSyncInput,
  options?: { skipEnsure?: boolean }
) => {
  if (!options?.skipEnsure) {
    ensureRecruitmentSeedData();
  }

  const applicants = getApplicants();
  if (applicants.some((row) => row.id === input.applicantId)) {
    return;
  }

  const linkedJob = ensureJobPostingForSubmission(input.position, input.department);
  const submittedAt = input.submittedAt ?? new Date().toISOString();

  const documents = (input.attachments ?? []).map((file) => ({
    type: file.documentType ?? file.name,
    url: '#',
    verified: false,
  }));

  const nextApplicant: Applicant = {
    id: input.applicantId,
    jobPostingId: linkedJob.id,
    personalInfo: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      address: input.address,
      dateOfBirth: new Date('1995-01-01T00:00:00+08:00').toISOString(),
    },
    qualificationScore: 0,
    status: 'New Application',
    education: [],
    experience: [],
    skills: [],
    certifications: [],
    documents,
    applicationDate: submittedAt,
    interview: undefined,
    notes: [
      {
        author: 'System',
        content: input.isPwd ? 'Applicant tagged as PWD during submission.' : 'Applicant submitted through applicant portal.',
        date: submittedAt,
        pinned: false,
      },
    ],
    timeline: [
      { event: 'Application Submitted', date: submittedAt, actor: 'Applicant' },
      { event: 'Synced to Recruitment Admin', date: submittedAt, actor: 'System' },
    ],
  };

  saveApplicants([nextApplicant, ...applicants]);
};

const backfillPortalApplicantsToRecruitment = () => {
  const portalApplicants = safeJsonParse<LegacyPortalApplicant[]>(
    localStorage.getItem(LEGACY_PORTAL_APPLICANTS_KEY),
    []
  );
  if (!portalApplicants.length) return;

  const portalAttachments = safeJsonParse<LegacyPortalAttachment[]>(
    localStorage.getItem(LEGACY_PORTAL_ATTACHMENTS_KEY),
    []
  );

  for (const portalApplicant of portalApplicants) {
    const attachments = portalAttachments
      .filter((entry) => entry.applicant_id === portalApplicant.id)
      .map((entry) => ({
        name: entry.file_name,
        type: 'application/octet-stream',
        size: 0,
        documentType: entry.document_type,
      }));

    syncApplicantSubmissionToRecruitment({
      applicantId: portalApplicant.id,
      firstName: portalApplicant.first_name,
      middleName: portalApplicant.middle_name ?? undefined,
      lastName: portalApplicant.last_name,
      email: portalApplicant.email,
      phone: portalApplicant.contact_number,
      address: portalApplicant.address,
      position: portalApplicant.position,
      department: portalApplicant.office,
      isPwd: portalApplicant.is_pwd,
      submittedAt: portalApplicant.created_at,
      attachments,
    }, { skipEnsure: true });
  }
};
