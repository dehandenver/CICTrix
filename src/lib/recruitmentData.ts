import {
    Applicant,
    EmployeeRecord,
    EvaluationPeriod,
    JobPosting,
    NewlyHired,
    RaterAssignment,
} from '../types/recruitment.types';
import { supabase } from './supabase';

const APPLICANTS_KEY = 'cictrix_qualified_applicants';
const DELETED_JOB_REPORTS_KEY = 'cictrix_deleted_job_reports';
const RATER_ASSIGNMENTS_KEY = 'cictrix_rater_assignments_v2';
const EVALUATION_PERIODS_KEY = 'cictrix_evaluation_periods';
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
  // Job postings now live in Supabase; this function only seeds remaining
  // localStorage-backed tables (applicants, newly hired, raters, employees).
  const currentVersion = localStorage.getItem(RECRUITMENT_DATA_VERSION_KEY);
  if (currentVersion !== RECRUITMENT_DATA_VERSION) {
    localStorage.setItem(APPLICANTS_KEY, JSON.stringify([]));
    // newly_hired and employees no longer seeded — Supabase is the only store.
    localStorage.setItem(RATER_ASSIGNMENTS_KEY, JSON.stringify([]));
    localStorage.setItem(RECRUITMENT_DATA_VERSION_KEY, RECRUITMENT_DATA_VERSION);
  }

  const hasSeed = Boolean(localStorage.getItem(APPLICANTS_KEY));
  if (!hasSeed) {
    const seed = buildInitialData();
    localStorage.setItem(APPLICANTS_KEY, JSON.stringify(seed.applicants));
    // newly_hired and employees seed dropped — those load from Supabase now.
    localStorage.setItem(RATER_ASSIGNMENTS_KEY, JSON.stringify(seed.assignments));
    localStorage.setItem(EVALUATION_PERIODS_KEY, JSON.stringify(seed.periods));
  }

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
    if (!data || !Array.isArray(data)) {
      console.warn('[RECRUITMENT] Supabase returned no data');
      return [];
    }

    console.log('[RECRUITMENT] Fetched from Supabase:', data.length, 'jobs:', data.map((r: any) => ({ id: r.id, title: r.title, dbStatus: r.status })));

    return data.map((row: any): JobPosting => {
      const status = mapSupabaseStatusToJobPostingStatus(row.status);

      // Read what the posting ACTUALLY says. Anything genuinely unset stays
      // empty/undefined so the UI can render "Not specified" instead of a
      // made-up requirement (the old mapper hardcoded "Bachelor's Degree" and
      // a 30-day deadline for every single job).
      return {
        id: String(row.id ?? ''),
        jobCode: row.item_number || row.jobCode || '',
        title: row.title || '',
        department: row.department || '',
        division: row.division || undefined,
        positionType: (row.position_type || 'Civil Service') as JobPosting['positionType'],
        numberOfPositions: Number(row.number_of_positions ?? 1) || 1,
        employmentStatus: (row.employment_status || 'Permanent') as JobPosting['employmentStatus'],
        summary: row.summary || row.description || '',
        responsibilities: toStringList(row.responsibilities),
        qualifications: {
          education: String(row.education_requirement ?? '').trim(),
          educationField: row.education_field || undefined,
          experience: {
            years: Number(row.experience_years ?? 0) || 0,
            field: String(row.experience_field ?? '').trim(),
          },
          skills: toStringList(row.required_skills),
          certifications: toStringList(row.certifications),
          preferred: row.preferred_qualifications || undefined,
        },
        salaryGrade: row.salary_grade == null ? undefined : Number(row.salary_grade),
        monthlySalary: row.monthly_salary == null ? undefined : Number(row.monthly_salary),
        eligibility: row.eligibility || undefined,
        training: row.training_requirement || undefined,
        competency: row.competency || undefined,
        requiredDocuments: toStringList(row.required_documents),
        applicationDeadline: row.application_deadline || '',
        expectedStartDate: row.expected_start_date || undefined,
        status,
        postedDate: row.created_at || row.postedDate || new Date().toISOString(),
        postedBy: row.posted_by || 'HR Admin',
        applicantCount: 0,
        qualifiedCount: 0,
      };
    });
  } catch (err) {
    console.warn('[RECRUITMENT] Error fetching job postings from Supabase:', err);
    return [];
  }
};

// ─── Job postings: Supabase-backed in-memory cache ──────────────────────────
// Source of truth is the Supabase `job_postings` table. We keep a module-level
// cache so the existing sync API (getJobPostings/getAuthoritativeJobPostings/
// saveJobPostings) keeps working without forcing every caller to await.
// Boot the cache by awaiting loadJobPostings() in main.tsx before render.

let jobPostingsCache: JobPosting[] = [];
let jobPostingsLoaded = false;

const dispatchJobPostingsUpdated = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cictrix:job-postings-updated'));
  }
};

export const loadJobPostings = async (): Promise<JobPosting[]> => {
  console.log('[recruitmentData] loadJobPostings called');
  const rows = await getJobPostingsFromSupabase();
  console.log('[recruitmentData] loadJobPostings got', rows.length, 'rows from Supabase');
  jobPostingsCache = rows;
  jobPostingsLoaded = true;
  dispatchJobPostingsUpdated();
  console.log('[recruitmentData] loadJobPostings cache updated and event dispatched');
  return rows;
};

export const isJobPostingsLoaded = (): boolean => jobPostingsLoaded;

export const getJobPostings = (): JobPosting[] => jobPostingsCache;

export const getAuthoritativeJobPostings = (): JobPosting[] => jobPostingsCache;

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

export const getApplicantPositionOptions = (): ApplicantPositionOption[] =>
  buildApplicantPositionOptions(getJobPostings());

const mapJobPostingToSupabaseRow = (job: JobPosting) => ({
  id: job.id,
  title: job.title,
  item_number: job.jobCode || '',
  department: job.department || '',
  office: job.department || '',
  // job_postings.status has a CHECK constraint allowing only:
  //   'Open' | 'Closed' | 'On Hold'
  // Map the broader app-domain statuses into this allowed set.
  status:
    job.status === 'Active' ? 'Open'
    : job.status === 'Filled' ? 'Closed'
    : job.status === 'Closed' ? 'Closed'
    : 'On Hold',

  // Real posting + qualification fields (migration 021). Before that column set
  // existed these were dropped on save and re-invented on read, so every job
  // advertised the same fake "Bachelor's Degree".
  summary: job.summary || null,
  division: job.division || null,
  position_type: job.positionType || null,
  employment_status: job.employmentStatus || null,
  number_of_positions: job.numberOfPositions ?? 1,
  salary_grade: job.salaryGrade ?? null,
  monthly_salary: job.monthlySalary ?? null,

  education_requirement: job.qualifications?.education || null,
  education_field: job.qualifications?.educationField || null,
  experience_years: job.qualifications?.experience?.years ?? 0,
  experience_field: job.qualifications?.experience?.field || null,
  training_requirement: job.training || null,
  eligibility: job.eligibility || null,
  competency: job.competency || null,
  preferred_qualifications: job.qualifications?.preferred || null,

  responsibilities: job.responsibilities ?? [],
  required_skills: job.qualifications?.skills ?? [],
  certifications: job.qualifications?.certifications ?? [],
  required_documents: job.requiredDocuments ?? [],

  application_deadline: toDateOnly(job.applicationDeadline),
  expected_start_date: toDateOnly(job.expectedStartDate),
  posted_by: job.postedBy || null,
});

// job_postings.application_deadline / expected_start_date are DATE columns;
// the app carries ISO timestamps. Null out anything unparseable rather than
// letting Postgres reject the whole upsert.
const toDateOnly = (value: string | undefined | null): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

// jsonb list columns arrive as arrays, but tolerate a JSON string or a
// comma/newline-separated string typed into the RSP free-text fields.
const toStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
      } catch {
        // fall through to the separator split
      }
    }
    return trimmed
      .split(/[\n,;•]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

const mapSupabaseStatusToJobPostingStatus = (raw: string | null | undefined): JobPosting['status'] => {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'closed') return 'Closed';
  if (v === 'on hold') return 'Draft';
  return 'Active';
};

const persistJobPostingsToSupabase = async (rows: JobPosting[]): Promise<void> => {
  // Upsert-only. The previous version also ran
  //   .delete().not('id', 'in', keptIds)
  // to "sync" Supabase to the in-memory list. That nuked rows whenever the
  // local cache was incomplete (race during initial load, partial refresh, a
  // second dashboard out of sync) — which is how postings have been silently
  // vanishing and new postings have inherited orphan applicants by title
  // collision. Deletions happen explicitly at the call sites
  // (JobPostingsPage.deleteJobPosting, RSPDashboard.handleDeleteJob).
  const client = supabase as any;

  const supabaseRows = rows.filter((job) => Boolean(job.id)).map(mapJobPostingToSupabaseRow);
  console.log('[recruitmentData] Persisting to Supabase, converting:', rows.map(r => ({ id: r.id, title: r.title, appStatus: r.status })), 'to:', supabaseRows);
  if (supabaseRows.length === 0) {
    console.warn('[recruitmentData] No valid rows to persist');
    return;
  }

  try {
    const { error: upsertError } = await client
      .from('job_postings')
      .upsert(supabaseRows, { onConflict: 'id' });
    if (upsertError) {
      console.error('[RECRUITMENT] Upsert failed:', upsertError);
      // Surface persistence failures so silent RLS / network problems don't
      // strand newly added postings in the local cache (admin sees them but
      // the LandingPage / Interviewer reading from Supabase do not).
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('cictrix:job-postings-persist-failed', {
            detail: { error: upsertError, rowCount: supabaseRows.length },
          }),
        );
      }
    } else {
      console.log('[RECRUITMENT] Upsert succeeded, rows persisted:', supabaseRows.length);
    }
  } catch (err) {
    console.error('[RECRUITMENT] Error persisting job postings to Supabase:', err);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cictrix:job-postings-persist-failed', {
          detail: { error: err, rowCount: supabaseRows.length },
        }),
      );
    }
  }
};

export const saveJobPostings = (rows: JobPosting[]): void => {
  const normalizedRows = Array.isArray(rows) ? rows : [];

  console.log('[recruitmentData] saveJobPostings called with:', normalizedRows.map(r => ({ id: r.id, title: r.title, status: r.status })));

  // Update cache + notify subscribers synchronously for instant UI feedback.
  jobPostingsCache = normalizedRows;
  jobPostingsLoaded = true;
  dispatchJobPostingsUpdated();

  console.log('[recruitmentData] Dispatched cictrix:job-postings-updated event');

  // Persist to Supabase in the background (source of truth).
  void persistJobPostingsToSupabase(normalizedRows);
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

// Newly Hired data lives exclusively in Supabase (newly_hired table).
// Deprecated: returns []. Callers should use getNewlyHiredFromSupabase()
// or listen for the 'cictrix:newly-hired-updated' event.
export const getNewlyHired = (): NewlyHired[] => [];

const dispatchNewlyHiredUpdated = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cictrix:newly-hired-updated'));
  }
};

const mapNewlyHiredRow = (row: any): NewlyHired => ({
  id: String(row?.id ?? ''),
  applicantId: row?.applicant_id ? String(row.applicant_id) : undefined,
  rankingRank: typeof row?.ranking_rank === 'number' ? row.ranking_rank : 0,
  rankingScore: typeof row?.ranking_score === 'number' ? row.ranking_score : 0,
  employeeInfo: {
    firstName: String(row?.first_name ?? ''),
    lastName: String(row?.last_name ?? ''),
    email: String(row?.email ?? ''),
    phone: String(row?.phone ?? ''),
    emergencyContact: { name: '', relationship: '', phone: '' },
    governmentIds: {},
  },
  position: String(row?.position ?? ''),
  department: String(row?.department ?? ''),
  division: row?.division ? String(row.division) : undefined,
  employmentType: (row?.employment_type ?? 'Permanent') as NewlyHired['employmentType'],
  dateHired: String(row?.date_hired ?? new Date().toISOString()),
  expectedStartDate: String(row?.expected_start_date ?? new Date().toISOString()),
  supervisor: row?.supervisor ? String(row.supervisor) : undefined,
  status: (row?.status ?? 'Pending Onboarding') as NewlyHired['status'],
  onboardingProgress: Number(row?.onboarding_progress ?? 0),
  onboardingChecklist: [],
  documents: [],
  notes: [],
  timeline: [],
  deployedDate: row?.deployed_date ? String(row.deployed_date) : undefined,
  employeeId: row?.employee_id ? String(row.employee_id) : undefined,
});

export const getNewlyHiredFromSupabase = async (): Promise<NewlyHired[]> => {
  try {
    const { data, error } = await (supabase as any)
      .from('newly_hired')
      .select('*')
      .order('date_hired', { ascending: false });
    if (error) {
      console.warn('[recruitmentData] newly_hired fetch failed:', error);
      return [];
    }
    return Array.isArray(data) ? data.map(mapNewlyHiredRow) : [];
  } catch (err) {
    console.warn('[recruitmentData] newly_hired fetch exception:', err);
    return [];
  }
};

export const saveNewlyHired = async (rows: NewlyHired[]) => {
  // Source of truth: Supabase newly_hired table. No localStorage.
  for (const hired of rows) {
    const { id, applicantId, employeeInfo, position, department, division, employmentType, dateHired, expectedStartDate, supervisor, status, onboardingProgress, deployedDate, employeeId } = hired;
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
  dispatchNewlyHiredUpdated();
};

export const getRaterAssignments = () =>
  safeJsonParse<RaterAssignment[]>(localStorage.getItem(RATER_ASSIGNMENTS_KEY), []);
export const saveRaterAssignments = (rows: RaterAssignment[]) =>
  localStorage.setItem(RATER_ASSIGNMENTS_KEY, JSON.stringify(rows));

export const getEvaluationPeriods = () =>
  safeJsonParse<EvaluationPeriod[]>(localStorage.getItem(EVALUATION_PERIODS_KEY), []);
export const saveEvaluationPeriods = (rows: EvaluationPeriod[]) =>
  localStorage.setItem(EVALUATION_PERIODS_KEY, JSON.stringify(rows));

// Deprecated: employee records live in Supabase only. Returns [].
// Use getEmployeeRecordsFromSupabase().
export const getEmployeeRecords = (): EmployeeRecord[] => [];

export const saveEmployeeRecords = (_rows: EmployeeRecord[]) => {
  // Persistence happens in src/lib/api/employees.ts via Supabase.
  // No-op kept so legacy imports don't break.
};

const mapEmployeeRow = (row: any): EmployeeRecord => ({
  id: String(row?.id ?? ''),
  employeeId: String(row?.employee_id ?? ''),
  name: String(row?.full_name ?? ''),
  firstName: String(row?.first_name ?? ''),
  lastName: String(row?.last_name ?? ''),
  position: String(row?.current_position ?? ''),
  department: String(row?.department ?? row?.current_department ?? ''),
  division: row?.current_division ? String(row.current_division) : undefined,
  startDate: String(row?.hire_date ?? row?.created_at ?? ''),
  positionHistory: Array.isArray(row?.position_history) ? row.position_history : [],
});

export const getEmployeeRecordsFromSupabase = async (): Promise<EmployeeRecord[]> => {
  try {
    const { data, error } = await (supabase as any).from('employees_with_department').select('*');
    if (error) {
      console.warn('[recruitmentData] employees fetch failed:', error);
      return [];
    }
    return Array.isArray(data) ? data.map(mapEmployeeRow) : [];
  } catch (err) {
    console.warn('[recruitmentData] employees fetch exception:', err);
    return [];
  }
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

/**
 * Returns an `allocator()` that hands out unique `EMP-2026-NNN` numbers,
 * skipping any value that already appears in any of these sources:
 *   - Supabase `employees.employee_number`
 *   - Supabase `newly_hired.employee_id`
 *   - the local employee records cache
 *   - the local employee portal accounts (localStorage legacy)
 *   - any extra numbers the caller passes in (e.g. rows currently on screen)
 *
 * Each call to the returned `allocator()` reserves the chosen number so two
 * employees inside the same batch can't get the same value.
 */
export const createEmployeeNumberAllocator = async (
  extraReserved: Iterable<string> = [],
): Promise<{ allocate: () => string; reserved: Set<string> }> => {
  const reserved = new Set<string>();

  const addIfPresent = (value: unknown) => {
    const str = String(value ?? '').trim();
    if (str) reserved.add(str);
  };

  for (const v of extraReserved) addIfPresent(v);

  // Pull from Supabase.
  try {
    const empRes = await (supabase as any).from('employees_with_department').select('employee_id');
    for (const row of (empRes?.data ?? []) as any[]) addIfPresent(row?.employee_id);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('createEmployeeNumberAllocator: employees fetch failed', error);
  }
  try {
    const nhRes = await (supabase as any).from('newly_hired').select('employee_id');
    for (const row of (nhRes?.data ?? []) as any[]) addIfPresent(row?.employee_id);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('createEmployeeNumberAllocator: newly_hired fetch failed', error);
  }

  // Pull employee_id values from the Supabase employees table so number
  // allocation does not collide with existing employees.
  try {
    const empRes = await (supabase as any).from('employees_with_department').select('employee_id');
    for (const row of (empRes?.data ?? []) as any[]) addIfPresent(row?.employee_id);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('createEmployeeNumberAllocator: employees fetch failed', error);
  }
  try {
    const raw = localStorage.getItem('cictrix_employee_portal_accounts');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const account of parsed) addIfPresent(account?.employee?.employeeId);
      }
    }
  } catch { /* ignore */ }

  let sequence = 1;
  const allocate = (): string => {
    while (true) {
      const candidate = generateEmployeeId(sequence++);
      if (!reserved.has(candidate)) {
        reserved.add(candidate);
        return candidate;
      }
    }
  };

  return { allocate, reserved };
};

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
  educationAttainment?: string;
  educationDegree?: string;
  educationSchool?: string;
  workExperienceYears?: number;
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
    educationAttainment: input.educationAttainment,
    education: input.educationDegree
      ? [{ degree: input.educationDegree, school: input.educationSchool ?? '', year: new Date().getFullYear() }]
      : [],
    experience: input.workExperienceYears != null
      ? [{ title: 'Applicant', company: '', years: input.workExperienceYears }]
      : [],
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
