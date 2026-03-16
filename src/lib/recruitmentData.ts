import {
    Applicant,
    EmployeeRecord,
    EvaluationPeriod,
    JobPosting,
    NewlyHired,
    RaterAssignment,
} from '../types/recruitment.types';

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

  // Broadcast changes so ApplicantAssessmentForm re-syncs immediately.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cictrix:job-postings-updated'));
  }
};

export const getApplicants = () => safeJsonParse<Applicant[]>(localStorage.getItem(APPLICANTS_KEY), []);
export const saveApplicants = (rows: Applicant[]) => {
  localStorage.setItem(APPLICANTS_KEY, JSON.stringify(rows));

  if (typeof window !== 'undefined') {
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

        saveApplicants(updatedApplicants);
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
