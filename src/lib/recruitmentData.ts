import {
    Applicant,
    EmployeeRecord,
    EvaluationPeriod,
    JobPosting,
    NewlyHired,
    RaterAssignment,
} from '../types/recruitment.types';
import { supabase } from './supabase';

const JOB_POSTINGS_KEY = 'cictrix_job_postings';
const AUTHORITATIVE_JOB_POSTINGS_KEY = 'cictrix_authoritative_job_postings';
const LEGACY_JOBS_KEY = 'cictrix_jobs';
const APPLICANT_POSITION_OPTIONS_KEY = 'cictrix_applicant_position_options';
const APPLICANTS_KEY = 'cictrix_qualified_applicants';
const DELETED_JOB_REPORTS_KEY = 'cictrix_deleted_job_reports';
const NEWLY_HIRED_KEY = 'cictrix_newly_hired';
const RATER_ASSIGNMENTS_KEY = 'cictrix_rater_assignments_v2';
const EVALUATION_PERIODS_KEY = 'cictrix_evaluation_periods';
const EMPLOYEE_DB_KEY = 'cictrix_employee_records';
const LEGACY_PORTAL_APPLICANTS_KEY = 'cictrix_applicants';
const LEGACY_PORTAL_ATTACHMENTS_KEY = 'cictrix_attachments';
const BACKFILL_EXCLUDED_APPLICANT_IDS_KEY = 'cictrix_backfill_excluded_applicant_ids';
const RECRUITMENT_DATA_VERSION_KEY = 'cictrix_recruitment_data_version';
const APPLICANTS_UPDATED_EVENT = 'cictrix:applicants-updated';
const RECRUITMENT_DATA_VERSION = '2026-03-08-no-demo-job-seed';

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

const getBackfillExcludedApplicantIds = (): string[] =>
  safeJsonParse<string[]>(localStorage.getItem(BACKFILL_EXCLUDED_APPLICANT_IDS_KEY), []);

const saveBackfillExcludedApplicantIds = (ids: string[]) =>
  localStorage.setItem(BACKFILL_EXCLUDED_APPLICANT_IDS_KEY, JSON.stringify(ids));

export const excludeApplicantIdsFromBackfill = (ids: string[]) => {
  const normalized = ids.map((id) => String(id).trim()).filter(Boolean);
  if (normalized.length === 0) return;

  const existing = new Set(getBackfillExcludedApplicantIds());
  normalized.forEach((id) => existing.add(id));
  saveBackfillExcludedApplicantIds(Array.from(existing));
};

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

const isLikelySeededDemoJob = (job: JobPosting) => {
  const normalizedId = String(job.id ?? '').trim();
  const normalizedPostedBy = String(job.postedBy ?? '').trim().toLowerCase();
  return /^job-\d+$/i.test(normalizedId) && normalizedPostedBy === 'hr admin';
};

const buildInitialData = () => {
  const jobs: JobPosting[] = [];
  const periods = createMockEvaluationPeriods();
  const assignments: RaterAssignment[] = [];
  const newlyHired: NewlyHired[] = [];
  const employees: EmployeeRecord[] = [];

  // Create test applicants with "Shortlisted" and "Recommended for Hiring" status for QualifiedApplicantsSection demo
  const applicants: Applicant[] = [
    {
      id: 'test-app-001',
      jobPostingId: 'job-001',
      applicationType: 'job',
      personalInfo: {
        firstName: 'Maria',
        lastName: 'Garcia',
        itemNumber: 'IT-2026-001',
        email: 'maria.garcia@test.com',
        phone: '09171234567',
        address: '123 Main St, Manila',
        dateOfBirth: '1992-05-15',
      },
      qualificationScore: 87.5,
      status: 'Recommended for Hiring',
      education: [{ degree: 'Bachelor of Science', school: 'University of Manila', year: 2014 }],
      experience: [{ title: 'Software Developer', company: 'Tech Corp', years: 8 }],
      skills: ['JavaScript', 'React', 'Node.js', 'Python'],
      certifications: ['AWS Solutions Architect'],
      documents: [{ type: 'Resume', url: '/resume.pdf', verified: true }],
      applicationDate: '2026-03-15T10:30:00+08:00',
      notes: [],
      timeline: [{ event: 'Application Submitted', date: '2026-03-15T10:30:00+08:00', actor: 'System' }],
    },
    {
      id: 'test-app-002',
      jobPostingId: 'job-001',
      applicationType: 'job',
      personalInfo: {
        firstName: 'Juan',
        lastName: 'Cruz',
        itemNumber: 'IT-2026-002',
        email: 'juan.cruz@test.com',
        phone: '09189876543',
        address: '456 Second Ave, Quezon City',
        dateOfBirth: '1990-08-22',
      },
      qualificationScore: 92.0,
      status: 'Recommended for Hiring',
      education: [{ degree: 'Master of Science in Computer Science', school: 'De La Salle University', year: 2016 }],
      experience: [{ title: 'Senior Developer', company: 'Global Tech Solutions', years: 10 }],
      skills: ['Java', 'Microservices', 'Docker', 'Kubernetes', 'AWS'],
      certifications: ['Google Cloud Certified', 'AWS Solutions Architect Pro'],
      documents: [{ type: 'Resume', url: '/resume.pdf', verified: true }],
      applicationDate: '2026-03-18T11:45:00+08:00',
      notes: [],
      timeline: [{ event: 'Application Submitted', date: '2026-03-18T11:45:00+08:00', actor: 'System' }],
    },
    {
      id: 'test-app-003',
      jobPostingId: 'job-002',
      applicationType: 'job',
      personalInfo: {
        firstName: 'Ana',
        lastName: 'Reyes',
        itemNumber: 'IT-2026-003',
        email: 'ana.reyes@test.com',
        phone: '09165550123',
        address: '789 Third Blvd, Cebu',
        dateOfBirth: '1995-12-03',
      },
      qualificationScore: 78.5,
      status: 'Shortlisted',
      education: [{ degree: 'Bachelor of Science in Information Technology', school: 'Cebu Institute of Technology', year: 2017 }],
      experience: [{ title: 'Junior Developer', company: 'StartUp Hub', years: 4 }],
      skills: ['JavaScript', 'React', 'Node.js', 'MongoDB'],
      certifications: [],
      documents: [{ type: 'Resume', url: '/resume.pdf', verified: true }],
      applicationDate: '2026-03-20T09:15:00+08:00',
      notes: [],
      timeline: [{ event: 'Application Submitted', date: '2026-03-20T09:15:00+08:00', actor: 'System' }],
    },
    {
      id: 'test-app-004',
      jobPostingId: 'job-002',
      applicationType: 'job',
      personalInfo: {
        firstName: 'Pedro',
        lastName: 'Lopez',
        itemNumber: 'IT-2026-004',
        email: 'pedro.lopez@test.com',
        phone: '09173334444',
        address: '321 Fourth Street, Davao',
        dateOfBirth: '1988-11-10',
      },
      qualificationScore: 85.0,
      status: 'Recommended for Hiring',
      education: [{ degree: 'Bachelor of Science', school: 'Mindanao State University', year: 2010 }],
      experience: [{ title: 'Senior Systems Administrator', company: 'Enterprise Solutions', years: 12 }],
      skills: ['Linux', 'AWS', 'Docker', 'Networking', 'Security'],
      certifications: ['CompTIA Security+', 'AWS Certified'],
      documents: [{ type: 'Resume', url: '/resume.pdf', verified: true }],
      applicationDate: '2026-03-22T13:20:00+08:00',
      notes: [],
      timeline: [{ event: 'Application Submitted', date: '2026-03-22T13:20:00+08:00', actor: 'System' }],
    },
    {
      id: 'test-app-005',
      jobPostingId: 'job-003',
      applicationType: 'promotion',
      internalApplication: {
        employeeId: 'EMP-001',
        currentPosition: 'HR Officer',
        currentDepartment: 'Human Resources',
        currentDivision: 'Recruitment',
        employeeUsername: 'rosa.santos',
      },
      personalInfo: {
        firstName: 'Rosa',
        lastName: 'Santos',
        itemNumber: 'HR-2026-001',
        email: 'rosa.santos@test.com',
        phone: '09166667777',
        address: '654 Fifth Lane, Iloilo',
        dateOfBirth: '1991-07-18',
      },
      qualificationScore: 88.5,
      status: 'Recommended for Hiring',
      education: [{ degree: 'Bachelor of Science in Psychology', school: 'University of the Philippines', year: 2013 }],
      experience: [{ title: 'HR Officer', company: 'Government Agency', years: 8 }],
      skills: ['Recruitment', 'Employee Relations', 'Payroll', 'Training'],
      certifications: ['HR Certification'],
      documents: [],
      applicationDate: '2026-03-25T10:00:00+08:00',
      notes: [],
      timeline: [{ event: 'Application Submitted', date: '2026-03-25T10:00:00+08:00', actor: 'System' }],
    },
  ];

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
      const normalizedJobs = existingJobs
        .filter((job) => !isLikelySeededDemoJob(job))
        .map((job) => ({
        ...job,
        department: normalizeDepartment(job.department),
      }));
      saveJobPostings(normalizedJobs);
    } else {
      saveJobPostings([]);
    }

    localStorage.setItem(RECRUITMENT_DATA_VERSION_KEY, RECRUITMENT_DATA_VERSION);
  }

  const hasSeed = Boolean(localStorage.getItem(JOB_POSTINGS_KEY));
  if (hasSeed) {
    backfillPortalApplicantsToRecruitment();
    return;
  }

  const seed = buildInitialData();
  saveJobPostings(seed.jobs);
  localStorage.setItem(APPLICANTS_KEY, JSON.stringify(seed.applicants));
  localStorage.setItem(NEWLY_HIRED_KEY, JSON.stringify(seed.newlyHired));
  localStorage.setItem(RATER_ASSIGNMENTS_KEY, JSON.stringify(seed.assignments));
  localStorage.setItem(EVALUATION_PERIODS_KEY, JSON.stringify(seed.periods));
  localStorage.setItem(EMPLOYEE_DB_KEY, JSON.stringify(seed.employees));
  localStorage.setItem(RECRUITMENT_DATA_VERSION_KEY, RECRUITMENT_DATA_VERSION);

  backfillPortalApplicantsToRecruitment();
};

// Fetch job postings from Supabase and map raw DB rows to the JobPosting type.
// The DB stores UI-domain status values ('Open', 'Reviewing', 'Closed') and
// snake_case columns (item_number, created_at), so we remap here.
export const getJobPostingsFromSupabase = async (): Promise<JobPosting[]> => {
  try {
    const { data, error } = await supabase.from('job_postings').select('*');
    if (error) {
      console.warn('[RECRUITMENT] Supabase job fetch failed:', error);
      return [];
    }
    if (!data || !Array.isArray(data)) return [];

    return data.map((row: any): JobPosting => {
      const dbStatus = String(row.status || '').toLowerCase();
      const status: JobPosting['status'] =
        dbStatus === 'closed' || dbStatus === 'filled' ? 'Closed'
        : dbStatus === 'reviewing' || dbStatus === 'draft' ? 'Draft'
        : 'Active'; // 'open' and any unknown value → 'Active'

      return {
        id: String(row.id ?? ''),
        jobCode: row.item_number || row.jobCode || '',
        title: row.title || '',
        department: row.department || '',
        division: 'Operations',
        positionType: 'Civil Service',
        salaryGrade: row.salary_grade || 'SG-10',
        salaryRange: { min: 20000, max: 30000 },
        numberOfPositions: 1,
        employmentStatus: 'Permanent',
        summary: row.summary || `${row.title || ''} recruitment posting.`,
        responsibilities: [],
        qualifications: {
          education: "Bachelor's Degree",
          experience: { years: 0, field: 'General' },
          skills: [],
          certifications: [],
        },
        requiredDocuments: [],
        applicationDeadline: new Date(Date.now() + 30 * 86400000).toISOString(),
        status,
        postedDate: row.created_at || row.postedDate || new Date().toISOString(),
        postedBy: 'HR Admin',
        applicantCount: 0,
        qualifiedCount: 0,
      };
    });
  } catch (err) {
    console.warn('[RECRUITMENT] Error fetching job postings from Supabase:', err);
    return [];
  }
};

export const getJobPostings = () => safeJsonParse<JobPosting[]>(localStorage.getItem(JOB_POSTINGS_KEY), []);

export const getAuthoritativeJobPostings = () => {
  const authoritative = safeJsonParse<JobPosting[]>(
    localStorage.getItem(AUTHORITATIVE_JOB_POSTINGS_KEY),
    []
  );
  if (authoritative.length > 0) return authoritative;
  return getJobPostings();
};

export type ApplicantPositionOption = {
  value: string;
  label: string;
  department: string;
};

const buildApplicantPositionOptions = (rows: JobPosting[]): ApplicantPositionOption[] => {
  const seen = new Set<string>();
  const applicantOptions: ApplicantPositionOption[] = [];

  rows
    .filter((job) => String(job.status ?? '').trim().toLowerCase() === 'active')
    .forEach((job) => {
      const title = String(job.title ?? '').trim();
      const department = String(job.department ?? '').trim();
      if (!title) return;
      const normalized = title.toLowerCase();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      applicantOptions.push({
        value: title,
        label: title,
        department,
      });
    });

  return applicantOptions;
};

export const getApplicantPositionOptions = () => {
  // Always derive from current postings so deleted jobs never linger in applicant options.
  const derived = buildApplicantPositionOptions(getJobPostings());
  localStorage.setItem(APPLICANT_POSITION_OPTIONS_KEY, JSON.stringify(derived));
  return derived;
};

export const saveJobPostings = (rows: JobPosting[]) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];

  // Persist both keys so all modules read the same latest job postings state.
  localStorage.setItem(JOB_POSTINGS_KEY, JSON.stringify(normalizedRows));
  localStorage.setItem(AUTHORITATIVE_JOB_POSTINGS_KEY, JSON.stringify(normalizedRows));

  // Keep legacy/mock jobs table in sync so pages reading `jobs` reflect the same source of truth.
  const legacyRows = normalizedRows.map((job, index) => ({
    id: index + 1,
    title: job.title,
    item_number: job.jobCode,
    salary_grade: job.salaryGrade ?? '',
    department: job.department,
    description: job.summary,
    status: job.status === 'Active' ? 'Open' : job.status === 'Closed' || job.status === 'Filled' ? 'Closed' : 'On Hold',
    created_at: job.postedDate,
    updated_at: new Date().toISOString(),
  }));

  localStorage.setItem(LEGACY_JOBS_KEY, JSON.stringify(legacyRows));

  // Rebuild and overwrite applicant dropdown cache from current active postings.
  const applicantOptions = buildApplicantPositionOptions(normalizedRows);

  localStorage.setItem(APPLICANT_POSITION_OPTIONS_KEY, JSON.stringify(applicantOptions));

  // CRITICAL: Also persist to Supabase (source of truth) so interviewer side sees updates across tabs/sessions
  void (async () => {
    try {
      // Upsert job postings to Supabase - this ensures interviewer side always sees latest data
      // Map JobPosting fields to the actual DB column names (item_number, not jobCode; created_at handled by DB default).
      // Map recruitment-domain status back to the UI-domain values the table stores.
      const supabaseRows = normalizedRows.map((job) => ({
        title: job.title,
        item_number: job.jobCode || '',
        department: job.department || '',
        office: job.department || '',
        status: job.status === 'Active' ? 'Open'
               : job.status === 'Draft' ? 'Reviewing'
               : job.status || 'Open',
      }));
      
      // Delete existing rows and insert new ones to ensure clean state
      await supabase.from('job_postings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (supabaseRows.length > 0) {
        const { error } = await (supabase as any).from('job_postings').insert(supabaseRows);
        if (error) {
          console.warn('[RECRUITMENT] Failed to save job postings to Supabase:', error);
        } else {
          console.log('[RECRUITMENT] ✓ Job postings saved to Supabase');
        }
      }
    } catch (err) {
      console.warn('[RECRUITMENT] Error saving job postings to Supabase:', err);
    }
  })();

  // Broadcast changes so ApplicantAssessmentForm re-syncs immediately.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cictrix:job-postings-updated'));
  }
};

export const getApplicants = () => safeJsonParse<Applicant[]>(localStorage.getItem(APPLICANTS_KEY), []);

// NEW: Fetch applicants from Supabase (the source of truth for all submitted applicants)
export const getApplicantsFromSupabase = async (): Promise<Applicant[]> => {
  try {
    // Use backend API to bypass RLS on Supabase
    const response = await fetch('/api/applicants/?skip=0&limit=1000');
    if (!response.ok) {
      console.error('[recruitmentData] Failed to fetch applicants from API');
      return getApplicants(); // Fallback to localStorage
    }
    
    const data = await response.json();
    
    // Transform data to match Applicant type
    if (!data || !Array.isArray(data)) {
      return getApplicants(); // Fallback to localStorage
    }
    
    const transformedApplicants: Applicant[] = data.map((row: any) => ({
      id: row.id,
      personalInfo: {
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        middleName: row.middle_name || '',
        email: row.email || '',
        phone: row.contact_number || '',
        address: row.address || '',
        gender: row.gender || '',
        dateOfBirth: row.dob || '',
        itemNumber: row.item_number || '',
      },
      position: row.position || '',
      jobPostingId: row.job_posting_id || 'unposted',
      applicationType: (row.application_type || 'job') as 'job' | 'promotion',
      status: row.status || 'Pending',
      applicationDate: row.created_at || new Date().toISOString(),
      notes: row.notes || [],
      timeline: row.timeline || [],
      qualificationScore: 0,
      education: [],
      experience: [],
      skills: [],
      certifications: [],
      documents: [],
      internalApplication: row.employee_id ? {
        employeeId: row.employee_id,
        currentPosition: row.current_position,
        currentDepartment: row.current_department,
        currentDivision: row.current_division,
        employeeUsername: row.employee_username,
      } : undefined,
      isPwd: row.is_pwd || false,
      createdAt: row.created_at || new Date().toISOString(),
    }));
    
    return transformedApplicants;
  } catch (err) {
    console.error('[recruitmentData] Exception fetching applicants from Supabase:', err);
    return getApplicants(); // Fallback to localStorage
  }
};
export const saveApplicants = (rows: Applicant[], options?: { broadcast?: boolean }) => {
  // Persist to localStorage for immediate access by QualifiedApplicantsPage and other UI components
  localStorage.setItem(APPLICANTS_KEY, JSON.stringify(rows));

  // Also persist to Supabase (source of truth) so changes are visible across tabs/sessions
  void (async () => {
    try {
      const supabaseRows = rows.map((applicant) => ({
        id: applicant.id,
        first_name: applicant.personalInfo?.firstName || '',
        last_name: applicant.personalInfo?.lastName || '',
        email: applicant.personalInfo?.email || '',
        contact_number: applicant.personalInfo?.phone || '',
        address: applicant.personalInfo?.address || '',
        dob: applicant.personalInfo?.dateOfBirth || '',
        item_number: applicant.personalInfo?.itemNumber || '',
        job_posting_id: applicant.jobPostingId || 'unposted',
        application_type: applicant.applicationType || 'job',
        status: applicant.status || 'New Application',
        created_at: applicant.applicationDate || new Date().toISOString(),
        notes: applicant.notes || [],
        timeline: applicant.timeline || [],
      }));

      // Upsert (update if exists, insert if new) to Supabase
      const { error } = await (supabase as any).from('applicants').upsert(supabaseRows, { 
        onConflict: 'id' 
      });

      if (error) {
        console.warn('[RECRUITMENT] Failed to save applicants to Supabase:', error);
      } else {
        console.log('[RECRUITMENT] ✓ Applicants saved to Supabase');
      }
    } catch (err) {
      console.warn('[RECRUITMENT] Error saving applicants to Supabase:', err);
    }
  })();

  // Broadcast changes so Sidebar, QualifiedApplicantsPage, and other components can re-sync
  if (options?.broadcast !== false && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(APPLICANTS_UPDATED_EVENT));
  }
};

export interface DeletedJobReport {
  id: string;
  deletedAt: string;
  deletedBy: string;
  job: JobPosting;
  applicants: Applicant[];
}

export const getDeletedJobReports = () =>
  safeJsonParse<DeletedJobReport[]>(localStorage.getItem(DELETED_JOB_REPORTS_KEY), []);

export const saveDeletedJobReports = (rows: DeletedJobReport[]) =>
  localStorage.setItem(DELETED_JOB_REPORTS_KEY, JSON.stringify(rows));

export const archiveDeletedJobPosting = (input: {
  job: JobPosting;
  applicants: Applicant[];
  deletedBy?: string;
}) => {
  const reports = getDeletedJobReports();
  const report: DeletedJobReport = {
    id: crypto.randomUUID(),
    deletedAt: new Date().toISOString(),
    deletedBy: input.deletedBy ?? 'HR Admin',
    job: input.job,
    applicants: input.applicants,
  };

  saveDeletedJobReports([report, ...reports]);
  return report;
};

export const getNewlyHired = () => safeJsonParse<NewlyHired[]>(localStorage.getItem(NEWLY_HIRED_KEY), []);

export const saveNewlyHired = async (rows: NewlyHired[]) => {
  // Newly hired records are now stored only in Supabase database
  // Do not save to localStorage to avoid quota exceeded errors

  // Always sync each newly hired record to Supabase
  for (const hired of rows) {
    const { id, applicantId, employeeInfo, position, department, division, employmentType, salaryGrade, dateHired, expectedStartDate, supervisor, status, onboardingProgress, deployedDate, employeeId } = hired;
    try {
      const result = await (supabase as any).from('newly_hired').upsert([
        {
          id,
          applicant_id: applicantId,
          first_name: employeeInfo.firstName,
          last_name: employeeInfo.lastName,
          email: employeeInfo.email,
          phone: employeeInfo.phone,
          position,
          department,
          division,
          employment_type: employmentType,
          salary_grade: salaryGrade,
          date_hired: dateHired,
          expected_start_date: expectedStartDate,
          supervisor,
          status,
          onboarding_progress: onboardingProgress,
          deployed_date: deployedDate,
          employee_id: employeeId,
          // Add other fields as needed
        }
      ], { onConflict: 'id' });
      if (result.error) {
        // eslint-disable-next-line no-console
        console.error('Supabase upsert newly_hired failed:', result.error);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Supabase upsert newly_hired exception:', err);
    }
  }
};

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
export const saveEmployeeRecords = (rows: EmployeeRecord[]) => {
  // Employee records are now stored only in Supabase database
  // Do not save to localStorage to avoid quota exceeded errors
  // Broadcasting is handled via window events if needed
};

const isRomanNumeralToken = (word: string) => /^[ivxlcdm]+$/i.test(word);

export const toTitleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (isRomanNumeralToken(word)) {
        return word.toUpperCase();
      }
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
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
  filePath?: string;
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
  applicationType?: 'job' | 'promotion';
  internalApplication?: {
    employeeId: string;
    currentPosition?: string;
    currentDepartment?: string;
    currentDivision?: string;
    employeeUsername?: string;
  };
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

const findJobPostingForSubmission = (position: string, department: string): JobPosting | null => {
  const normalizedPosition = normalizeText(position);
  const normalizedDepartment = normalizeDepartment(department);
  const jobs = getAuthoritativeJobPostings();

  const sameTitleRows = jobs.filter((job) => normalizeText(job.title) === normalizedPosition);
  if (sameTitleRows.length === 0) return null;

  if (sameTitleRows.length === 1) {
    return sameTitleRows[0];
  }

  const sameDepartmentRow = sameTitleRows.find(
    (job) => normalizeText(job.department) === normalizeText(normalizedDepartment)
  );
  if (sameDepartmentRow) {
    return sameDepartmentRow;
  }

  const activeRow = sameTitleRows.find((job) => normalizeText(job.status) === 'active');
  return activeRow ?? sameTitleRows[0];
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

  const linkedJob = findJobPostingForSubmission(input.position, input.department);
  const isPromotionalSubmission =
    input.applicationType === 'promotion' || Boolean(input.internalApplication?.employeeId);

  // Also skip if the same email is already linked to the same job posting
  // (prevents duplicates when the form is submitted more than once).
  if (input.email) {
    const targetJobId = linkedJob?.id ?? 'unposted';
    const normalizedIncomingEmail = String(input.email ?? '').trim().toLowerCase();
    const incomingEmployeeId = String(input.internalApplication?.employeeId ?? '').trim();

    const duplicate = applicants.find(
      (row) => {
        const rowEmail = String(row.personalInfo.email ?? '').trim().toLowerCase();
        if (!rowEmail || rowEmail !== normalizedIncomingEmail) return false;

        if (isPromotionalSubmission) {
          // Promotional submissions should not collide with external applications.
          const rowEmployeeId = String(row.internalApplication?.employeeId ?? '').trim();
          const sameEmployee = incomingEmployeeId && rowEmployeeId && incomingEmployeeId === rowEmployeeId;
          const samePromotionTrack = row.applicationType === 'promotion' && sameEmployee;
          return samePromotionTrack && row.jobPostingId === targetJobId;
        }

        if (targetJobId === 'unposted') {
          return row.jobPostingId === 'unposted';
        }

        return row.jobPostingId === targetJobId;
      }
    );
    if (duplicate) {
      if (isPromotionalSubmission) {
        const submittedAt = input.submittedAt ?? new Date().toISOString();
        const targetDepartment = normalizeDepartment(input.department);
        const updatedApplicants = applicants.map((row) => {
          if (row.id !== duplicate.id) return row;

          const notes = Array.isArray(row.notes) ? row.notes : [];
          const timeline = Array.isArray(row.timeline) ? row.timeline : [];

          return {
            ...row,
            jobPostingId: targetJobId,
            applicationType: 'promotion',
            internalApplication: {
              ...(row.internalApplication ?? {}),
              ...(input.internalApplication ?? {}),
            } as Applicant['internalApplication'],
            status: 'New Application',
            applicationDate: submittedAt,
            personalInfo: {
              ...row.personalInfo,
              firstName: input.firstName,
              lastName: input.lastName,
              email: input.email,
              phone: input.phone,
              address: input.address,
              itemNumber: row.personalInfo.itemNumber,
              dateOfBirth: row.personalInfo.dateOfBirth,
            },
            notes: [
              {
                author: 'System',
                content: 'Promotional application was re-submitted and synced to recruitment.',
                date: submittedAt,
                pinned: false,
              },
              ...notes,
            ],
            timeline: [
              ...timeline,
              {
                event: `Promotional application re-submitted for ${input.position} (${targetDepartment})`,
                date: submittedAt,
                actor: 'System',
              },
            ],
          };
        });

        saveApplicants(updatedApplicants as Applicant[]);
      }

      return;
    }
  }

  const submittedAt = input.submittedAt ?? new Date().toISOString();

  const documents = (input.attachments ?? []).map((file) => ({
    type: file.documentType ?? file.name,
    url: file.filePath ?? '#',
    verified: false,
  }));

  const nextApplicant: Applicant = {
    id: input.applicantId,
    jobPostingId: linkedJob?.id ?? 'unposted',
    applicationType: input.applicationType ?? 'job',
    internalApplication: input.internalApplication,
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
        content:
          input.applicationType === 'promotion'
            ? 'Promotional application submitted by an existing employee account.'
            : input.isPwd
              ? 'Applicant tagged as PWD during submission.'
              : 'Applicant submitted through applicant portal.',
        date: submittedAt,
        pinned: false,
      },
    ],
    timeline: [
      { event: 'Application Submitted', date: submittedAt, actor: 'Applicant' },
      ...(input.applicationType === 'promotion' && input.internalApplication
        ? [
            {
              event: `Internal applicant linked to employee record ${input.internalApplication.employeeId}`,
              date: submittedAt,
              actor: 'System',
            },
          ]
        : []),
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

  const excludedIds = new Set(getBackfillExcludedApplicantIds());

  for (const portalApplicant of portalApplicants) {
    if (excludedIds.has(String(portalApplicant.id))) {
      continue;
    }

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
