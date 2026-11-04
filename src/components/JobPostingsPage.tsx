import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { SalaryGradeSelect } from './SalaryGradeSelect';
import { formatSalary, listSalaryGrades, type SalaryGradeRow } from '../lib/api/salaryGrades';
import {
    AlertTriangle,
    Briefcase,
    ChevronLeft,
    ChevronRight,
    FileText,
    Plus,
    Search,
    Trash2
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { JobVacanciesPanel } from './JobVacanciesPanel';
import { CloseVacancyDialog } from './CloseVacancyDialog';
import { comparePositionRows, isOpenVacancy, matchesTitleOrPlantilla, positionStatus, type PositionStatus } from '../lib/vacancySearch';
import { countListedApplicationsByPosition } from '../lib/applicationsByPosition';
import { closeVacancy, listActiveVacancies, openVacancy as openVacancyRequest, type ActiveVacancy, type CloseReason, type OpenVacancyInput } from '../lib/vacancies';
import { COMPETENCIES, EDUCATION_LEVELS, formatOfficeLabel, formatOfficeName } from '../constants/positions';
import { useDepartmentNames } from '../hooks/useDepartmentOptions';
import { getPreferredDataSourceMode } from '../lib/dataSourceMode';
import { mockDatabase } from '../lib/mockDatabase';
import {
    archiveDeletedJobPosting,
    ensureRecruitmentSeedData,
    excludeApplicantIdsFromBackfill,
    formatPHDate,
    getApplicants,
    getJobPostings,
    isJobPostingsLoaded,
    loadJobPostings,
    getJobPostingsLoadError,
    saveApplicants,
    saveJobPostings,
    saveJobPostingsAndWait,
    toTitleCase,
} from '../lib/recruitmentData';
import {
    fetchApplicantSlotLinks,
    fetchSlotApplicantCountsChecked,
    saveSlotsForJob,
} from '../lib/plantillaSlots';
import {
    applicantsPerPlantillaText,
    internalPlantillaKey,
    plantillaLabel,
    plantillaLabelForNumber,
    plantillaNumberOf,
    validatePlantillaLabels,
} from '../lib/plantillaRules';
import { isMockModeEnabled, supabase } from '../lib/supabase';
import { JobPosting, PlantillaSlotStatus } from '../types/recruitment.types';
import { RecruitmentNavigationGuide } from './RecruitmentNavigationGuide';
import { isCurriculumVitae } from '../lib/applicationDocuments';
import { reviewOutcome } from '../lib/applicantReviewQueue';
import { AdminHeader } from './AdminHeader';
import { Sidebar } from './Sidebar';
import { TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';
import { Modal } from './modal';
import { ActionFeedback, useFeedback } from './action-feedback';
import { ErrorBanner } from './ErrorBanner';
import { describeActionFailure, type ActionFailure } from '../lib/friendlyErrors';

const ITEMS_PER_PAGE = 10;

const normalizeText = (value: string) => String(value ?? '').trim().toLowerCase();

/** Maps a stored status to the list status kept on archived and locally stored applicants. */
export const toJobPostApplicantStatus = (rawStatus: string): ReturnType<typeof getApplicants>[number]['status'] => {
  const normalized = normalizeText(rawStatus);
  // Closed outcomes first: 'withdrawn - hired elsewhere' contains 'hired', and
  // 'not qualified' contains 'qualified', which counted them as qualified.
  if (normalized.includes('withdrawn')) return 'Rejected';
  if (normalized.includes('not qualified') || normalized.includes('disqual')) return 'Not Qualified';
  if (normalized.includes('reject') || normalized.includes('not selected')) return 'Rejected';
  // 'Recommended for Hiring' predates the split between screening and the
  // post-evaluation decision; migration 20260926 resolves the stored rows.
  if (normalized === 'recommended for hiring') return 'Recommended for Hiring';
  if (normalized.includes('qualified') || normalized.includes('hired') || normalized.includes('accepted')) {
    return 'Qualified';
  }
  if (normalized.includes('shortlist')) return 'Shortlisted';
  if (normalized.includes('evaluation')) return 'Interview Completed';
  if (normalized.includes('interview')) return 'For Interview';
  if (normalized.includes('review') || normalized.includes('pending')) return 'Under Review';
  return 'New Application';
};

const normalizeRomanNumeralsInText = (value: string) =>
  String(value ?? '')
    .split(/(\s+)/)
    .map((token) => (/^[ivxlcdm]+$/i.test(token) ? token.toUpperCase() : token))
    .join('');

/** Job Posts sub tabs, kept in `?tab=` so Back works. Positions is the default. */
type JobPostsTab = 'positions' | 'vacancies';

/** §10 vacancy status: Open = Success, Closed = Neutral. Derived, never edited. */
const STATUS_BADGE: Record<PositionStatus, string> = {
  Open: 'badge badge-success',
  Closed: 'badge badge-neutral',
};

/**
 * One editable row of the "Plantilla Slots" list.
 *
 * `key` is a client-side identity so React keeps focus on the right input
 * while rows are added/removed/reordered; `id` is the DB row and is absent
 * until the slot has been saved once. `label` is what the admin types
 * ("Plantilla 2", "Plantilla 100") and what everyone sees; the row's position
 * in the list is only its ordering. `itemNumber` is a hidden internal key.
 */
interface PlantillaSlotFormRow {
  key: string;
  id?: string;
  label: string;
  /** Internal key; blank for a new row until it is saved. Never shown. */
  itemNumber: string;
  /** Blank means "inherit the shared Salary Grade / Monthly Salary above". */
  salaryGrade: string;
  monthlySalary: string;
  status: PlantillaSlotStatus;
  filledByApplicantId?: string;
}

const buildSlotRow = (overrides: Partial<PlantillaSlotFormRow> = {}): PlantillaSlotFormRow => ({
  key: crypto.randomUUID(),
  label: '',
  itemNumber: '',
  salaryGrade: '',
  monthlySalary: '',
  status: 'open',
  ...overrides,
});

interface JobPostFormValues {
  title: string;
  /** Every plantilla item this post is hiring for. Never empty. */
  slots: PlantillaSlotFormRow[];
  department: string;
  division: string;
  positionLevel: string;
  positionType: JobPosting['positionType'];
  numberOfPositions: number;
  employmentType: 'Full-time' | 'Part-time' | 'Contractual' | 'Project-based';
  employmentStatus: JobPosting['employmentStatus'];
  statusLabel: 'Open' | 'Reviewing' | 'Closed';
  summary: string;
  qualifications: string;
  responsibilities: string[];
  // Spec additions on CREATE JOB → Job Information / Qualifications.
  salaryGrade: string;
  monthlySalary: string;
  qualEligibility: string;
  qualEducation: string;
  qualDegreeCourse: string;
  qualTraining: string;
  qualExperienceYears: string;
  qualExperienceMonths: string;
  qualCompetency: string;
  education: string;
  yearsOfExperience: number;
  experienceField: string;
  skills: string;
  certifications: string;
  preferred: string;
  requiredDocuments: string[];
  otherDocument: string;
  applicationDeadline: string;
  interviewStart: string;
  interviewEnd: string;
  expectedStartDate: string;
}

const buildDefaultJobForm = (): JobPostFormValues => ({
  title: '',
  // Plantilla numbers aren't a sequence (a post can hire for 21 and 13), so
  // the admin types each one; nothing is pre-filled.
  slots: [buildSlotRow({ label: '' })],
  department: '',
  division: '',
  positionLevel: '',
  positionType: 'Civil Service',
  numberOfPositions: 1,
  employmentType: 'Full-time',
  employmentStatus: 'Permanent',
  statusLabel: 'Open',
  summary: '',
  qualifications: '',
  responsibilities: [''],
  salaryGrade: '',
  monthlySalary: '',
  qualEligibility: '',
  qualEducation: '',
  qualDegreeCourse: '',
  qualTraining: '',
  qualExperienceYears: '',
  qualExperienceMonths: '',
  qualCompetency: '',
  education: "Bachelor's Degree",
  yearsOfExperience: 1,
  experienceField: 'Public Administration',
  skills: 'Communication, Records Management',
  certifications: 'Civil Service Eligibility',
  preferred: '',
  requiredDocuments: ['Application Letter'],
  otherDocument: '',
  applicationDeadline: '',
  interviewStart: '',
  interviewEnd: '',
  expectedStartDate: '',
});

export const JobPostingsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const modalBodyRef = useRef<HTMLDivElement | null>(null);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  // The job-postings cache normally loads before render (main.tsx); this covers a slow boot.
  const jobsLoad = useTableLoading(!isJobPostingsLoaded() && jobs.length === 0, jobs.length > 0);
  // Departments come from the canonical Supabase table, shared system-wide.
  const departmentsList = useDepartmentNames();
  const [liveApplicants, setLiveApplicants] = useState<ReturnType<typeof getApplicants>>([]);
  // Raw applicant rows straight from Supabase — the single source of truth for
  // both card counts and the View Applicants list. Skips findJobIdFromRow so no rows
  // are silently dropped before counting.
  const [allApplicantsRaw, setAllApplicantsRaw] = useState<any[]>([]);
  // Counts read 0 when this fails; the banner says they couldn't load instead.
  const [applicantsLoadError, setApplicantsLoadError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PositionStatus>('all');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [showGuide, setShowGuide] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** True when the edit form was opened from a job's Details page. */
  const [editOpenedFromDetails, setEditOpenedFromDetails] = useState(false);
  const [form, setForm] = useState<JobPostFormValues>(buildDefaultJobForm());
  // The CSC schedule, loaded once here and handed to every plantilla row's
  // SalaryGradeSelect — a posting can have several rows, and each fetching the
  // same 33 grades would be wasteful and could render them inconsistently.
  const [salaryTable, setSalaryTable] = useState<SalaryGradeRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    void listSalaryGrades().then((res) => {
      if (!cancelled && res.ok) setSalaryTable(res.data);
    });
    return () => { cancelled = true; };
  }, []);
  const [toast, setToast] = useState('');
  /** The vacancy the Close Vacancy confirmation is open for. */
  const [closingJob, setClosingJob] = useState<JobPosting | null>(null);
  const [closeError, setCloseError] = useState('');
  /** Active vacancy rows by posting id (Date Opened); reloaded after open/close. */
  const [activeVacancies, setActiveVacancies] = useState<Map<string, ActiveVacancy>>(new Map());
  // Job Vacancies (default, no param) vs Job Positions (?tab=positions), kept
  // in the URL so Back and refresh keep the tab. An old ?tab=vacancies still works.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: JobPostsTab = searchParams.get('tab') === 'positions' ? 'positions' : 'vacancies';
  const switchTab = (tab: JobPostsTab) => {
    setSearchParams(tab === 'vacancies' ? {} : { tab });
  };
  /** Plantilla slot ids per applicant, for the Applicants (N) count. Null until loaded. */
  const [applicantSlotLinks, setApplicantSlotLinks] = useState<Map<string, string[]> | null>(null);
  /** Validation message for the Plantilla Slots section of the modal. */
  const [slotError, setSlotError] = useState('');
  const [savingJob, setSavingJob] = useState(false);
  // A failed create/edit, shown at the top of the dialog; the dialog stays open.
  const [saveFailure, setSaveFailure] = useState<ActionFailure | null>(null);
  const feedback = useFeedback();

  // Background saves (e.g. a status change) used to fail silently: the event
  // below had no listener, so the screen kept a change the database refused.
  useEffect(() => {
    const onPersistFailed = (event: Event) => {
      const failure = describeActionFailure('save the job posts', (event as CustomEvent).detail?.error);
      feedback.error(failure.title, `${failure.message} ${failure.nextStep}`);
    };
    window.addEventListener('cictrix:job-postings-persist-failed', onPersistFailed);
    return () => window.removeEventListener('cictrix:job-postings-persist-failed', onPersistFailed);
  }, [feedback]);
  /** Applicant counts per slot id, so removing a slot can warn about them. */
  const [slotApplicantCounts, setSlotApplicantCounts] = useState<Map<string, number>>(new Map());
  // The counts couldn't be read, so "0 applicants" would be a guess.
  const [slotCountsFailed, setSlotCountsFailed] = useState(false);

  const resolveLiveApplicants = async (jobRows: JobPosting[]) => {
    const localApplicants = getApplicants();
    const activeJobs = jobRows.filter((job) => normalizeText(job.status) === 'active');

    const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
    const primaryClient = preferredMode === 'local' ? (mockDatabase as any) : supabase;
    const secondaryClient = preferredMode === 'local' ? supabase : (mockDatabase as any);

    const fetchDbApplicants = async (client: any) => {
      // select('*') protects against column drift; no order clause so a missing
      // created_at (the previous 400 cause) won't blow up the query.
      const result = await client
        .from('applicants')
        .select('*');

      if (result?.error) {
        throw result.error;
      }

      return Array.isArray(result?.data) ? result.data : [];
    };

    let dbRows: any[] = [];
    let dbFetchSucceeded = false;
    try {
      dbRows = await fetchDbApplicants(primaryClient);
      dbFetchSucceeded = true;
    } catch (primaryErr) {
      console.error('[JobPostingsPage] primary applicants fetch failed:', primaryErr);
      try {
        dbRows = await fetchDbApplicants(secondaryClient);
        dbFetchSucceeded = true;
      } catch (secondaryErr) {
        console.error('[JobPostingsPage] secondary applicants fetch failed:', secondaryErr);
        dbRows = [];
        dbFetchSucceeded = false;
      }
    }
    console.info('[JobPostingsPage] resolveLiveApplicants fetched', {
      dbFetchSucceeded,
      dbRows: dbRows.length,
    });

    const normalizeFuzzy = (value: string) =>
      normalizeRomanNumeralsInText(String(value ?? ''))
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    const expandAbbrev = (value: string) =>
      normalizeFuzzy(value)
        .replace(/\badmin\b/g, 'administrative')
        .replace(/\bit\b/g, 'information technology')
        .replace(/\bhr\b/g, 'human resource');

    const tokensOf = (value: string) =>
      new Set(expandAbbrev(value).split(/\s+/).filter((t) => t.length >= 3));

    // A real application -> slot link beats every heuristic below it. Once an
    // applicant has ticked a plantilla item there is nothing to guess at, so
    // this is consulted first and the string matching only covers rows that
    // predate the slots (or walk-in applications filed outside a posting).
    const slotLinksByApplicant = await fetchApplicantSlotLinks();
    const jobIdBySlotId = new Map<string, string>();
    activeJobs.forEach((job) => {
      (job.plantillaSlots ?? []).forEach((slot) => jobIdBySlotId.set(slot.id, job.id));
    });

    const findJobIdFromRow = (row: any) => {
      const position = normalizeText(String(row?.position ?? ''));
      const office = normalizeText(String(row?.office ?? ''));
      const itemKey = normalizeFuzzy(String(row?.item_number ?? ''));
      const explicitJobId = String(row?.job_posting_id ?? '').trim();

      const linkedSlots = slotLinksByApplicant.get(String(row?.id ?? '')) ?? [];
      for (const link of linkedSlots) {
        const jobId = jobIdBySlotId.get(link.slotId);
        if (jobId) return jobId;
      }

      if (explicitJobId) {
        const byId = activeJobs.find((job) => String(job.id) === explicitJobId);
        if (byId) return byId.id;
      }

      // 1) Strict title match
      const sameTitleRows = activeJobs.filter((job) => normalizeText(job.title) === position);
      if (sameTitleRows.length === 1) return sameTitleRows[0].id;
      if (sameTitleRows.length > 1) {
        const sameOffice = sameTitleRows.find((job) => normalizeText(job.department) === office || normalizeText(job.division ?? '') === office);
        if (sameOffice) return sameOffice.id;
        return sameTitleRows[0].id;
      }

      // 2) Item number match
      if (itemKey) {
        const byItem = activeJobs.find((job) => normalizeFuzzy(job.jobCode) === itemKey);
        if (byItem) return byItem.id;
      }

      // 3) Fuzzy title match (abbreviation expansion + substring + token overlap)
      const rowExpanded = expandAbbrev(String(row?.position ?? ''));
      if (rowExpanded) {
        const byExpanded = activeJobs.find((job) => {
          const jobExpanded = expandAbbrev(job.title);
          if (!jobExpanded) return false;
          if (rowExpanded === jobExpanded) return true;
          if (rowExpanded.includes(jobExpanded) || jobExpanded.includes(rowExpanded)) return true;
          return false;
        });
        if (byExpanded) return byExpanded.id;

        const rowTokens = tokensOf(String(row?.position ?? ''));
        if (rowTokens.size > 0) {
          const byTokens = activeJobs.find((job) => {
            const jobTokens = tokensOf(job.title);
            if (jobTokens.size === 0) return false;
            const overlap = [...jobTokens].filter((t) => rowTokens.has(t)).length;
            if (overlap / jobTokens.size < 0.75) return false;
            const jobOffice = normalizeFuzzy(job.division || job.department || '');
            const rowOfficeFuzzy = normalizeFuzzy(String(row?.office ?? ''));
            return !jobOffice || !rowOfficeFuzzy || jobOffice === rowOfficeFuzzy;
          });
          if (byTokens) return byTokens.id;
        }
      }

      return null;
    };

    const mappedDbApplicants = dbRows
      .map((row: any) => {
        const linkedJobId = findJobIdFromRow(row);
        if (!linkedJobId) return null;
        return {
          id: String(row?.id ?? crypto.randomUUID()),
          jobPostingId: linkedJobId,
          status: toJobPostApplicantStatus(String(row?.status ?? '')),
        };
      })
      .filter((row: any): row is { id: string; jobPostingId: string; status: ReturnType<typeof getApplicants>[number]['status'] } => Boolean(row));

    const mergedById = new Map<string, ReturnType<typeof getApplicants>[number]>();
    const mappedIds = new Set(mappedDbApplicants.map((entry) => entry.id));

    // Use local rows only when DB fetch failed, or to enrich rows that still exist in DB.
    localApplicants.forEach((entry) => {
      if (!dbFetchSucceeded || mappedIds.has(entry.id)) {
        mergedById.set(entry.id, entry);
      }
    });

    mappedDbApplicants.forEach((entry) => {
      const existing = mergedById.get(entry.id);
      if (!existing) {
        mergedById.set(entry.id, {
          id: entry.id,
          jobPostingId: entry.jobPostingId,
          personalInfo: {
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            address: '',
            dateOfBirth: new Date('1995-01-01T00:00:00+08:00').toISOString(),
          },
          qualificationScore: 0,
          status: entry.status,
          education: [],
          experience: [],
          skills: [],
          certifications: [],
          documents: [],
          applicationDate: new Date().toISOString(),
          notes: [],
          timeline: [],
        });
      }
    });

    setLiveApplicants(Array.from(mergedById.values()));
  };

  // Hydrate from the in-memory job-postings cache. The cache is populated
  // asynchronously from Supabase at app boot via loadJobPostings(), so this
  // effect re-runs whenever 'cictrix:job-postings-updated' fires.
  //
  // IMPORTANT: do NOT call saveJobPostings() here. Doing so on mount with an
  // empty cache (cache still loading) wiped the Supabase job_postings table
  // via the "delete rows not in current list" branch. That caused new postings
  // to appear duplicated or vanish entirely on refresh.
  const [jobPostingsCacheVersion, setJobPostingsCacheVersion] = useState(0);
  useEffect(() => {
    const bump = () => setJobPostingsCacheVersion((v) => v + 1);
    window.addEventListener('cictrix:job-postings-updated', bump as EventListener);
    return () => {
      window.removeEventListener('cictrix:job-postings-updated', bump as EventListener);
    };
  }, []);

  // Live updates: a job post change reloads the shared cache (which fires
  // 'cictrix:job-postings-updated'); an applicant change fires the existing
  // applicants refresh, which recomputes counts and the open applicant list.
  useRealtimeRefresh({
    channel: 'rsp-job-posts-postings',
    tables: ['job_postings'],
    onChange: () => { void loadJobPostings(); },
  });
  useRealtimeRefresh({
    channel: 'rsp-job-posts-applicants',
    tables: ['applicants'],
    onChange: () => { window.dispatchEvent(new CustomEvent('cictrix:applicants-updated')); },
  });

  useEffect(() => {
    ensureRecruitmentSeedData();
    const loadedJobs = getJobPostings();
    const normalizedJobs = loadedJobs.map((job) => ({
      ...job,
      title: normalizeRomanNumeralsInText(job.title),
    }));
    setJobs(normalizedJobs);
    void resolveLiveApplicants(normalizedJobs);
  }, [jobPostingsCacheVersion]);

  // Opening or closing a vacancy reloads the postings, which bumps the cache
  // version, so Date Opened refreshes with them.
  useEffect(() => {
    let cancelled = false;
    void listActiveVacancies().then((rows) => { if (!cancelled) setActiveVacancies(rows); });
    return () => { cancelled = true; };
  }, [jobPostingsCacheVersion]);

  // Dedicated fetch for raw applicant rows. This is the source the card counts and
  // the View Applicants list both consume. Using .select('*') avoids column-drift 400s,
  // and skipping .order avoids the created_at error seen previously.
  useEffect(() => {
    let cancelled = false;

    const loadAllApplicants = async () => {
      try {
        const { data, error } = await (supabase as any).from('applicants').select('*');
        if (cancelled) return;
        if (error) {
          console.error('[JobPostingsPage] allApplicantsRaw supabase error:', error);
          setApplicantsLoadError(error);
          return;
        }
        const rows = Array.isArray(data) ? data : [];
        console.info('[JobPostingsPage] allApplicantsRaw loaded', { count: rows.length });
        setAllApplicantsRaw(rows);
        setApplicantsLoadError(null);
        const links = await fetchApplicantSlotLinks();
        if (cancelled) return;
        setApplicantSlotLinks(new Map([...links].map(([applicantId, list]) => [applicantId, list.map((link) => link.slotId)])));
      } catch (err) {
        if (cancelled) return;
        console.error('[JobPostingsPage] allApplicantsRaw fetch exception:', err);
        // Keep the last counts; say they may be out of date.
        setApplicantsLoadError(err);
      }
    };

    void loadAllApplicants();

    const refresh = () => { void loadAllApplicants(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('cictrix:applicants-updated', refresh as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('cictrix:applicants-updated', refresh as EventListener);
    };
  }, []);

  useEffect(() => {
    const refreshApplicants = () => {
      const currentJobs = getJobPostings();
      void resolveLiveApplicants(currentJobs);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshApplicants();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'cictrix_qualified_applicants') {
        refreshApplicants();
      }
    };

    window.addEventListener('focus', refreshApplicants);
    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener('cictrix:applicants-updated', refreshApplicants as EventListener);
    window.addEventListener('cictrix:job-postings-updated', refreshApplicants as EventListener);
    window.addEventListener('cictrix:route-activated', refreshApplicants as EventListener);

    return () => {
      window.removeEventListener('focus', refreshApplicants);
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('cictrix:applicants-updated', refreshApplicants as EventListener);
      window.removeEventListener('cictrix:job-postings-updated', refreshApplicants as EventListener);
      window.removeEventListener('cictrix:route-activated', refreshApplicants as EventListener);
    };
  }, []);

  // Fuzzy applicant count: match by job title/office, not just jobPostingId
  const applicantCountsByJob = useMemo(() => {
    const counts = new Map<string, { applicants: number; qualified: number; toReview: number }>();
    const normalize = (value: string) =>
      String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const expandAbbrev = (value: string) =>
      normalize(value)
        .replace(/\badmin\b/g, 'administrative')
        .replace(/\bit\b/g, 'information technology')
        .replace(/\bhr\b/g, 'human resource');
    const tokens = (value: string) =>
      new Set(expandAbbrev(value).split(/\s+/).filter((t) => t.length >= 3));

    jobs.forEach((job) => {
      const jobTitleKey = normalize(job.title);
      const jobTitleExpanded = expandAbbrev(job.title);
      const jobItemKey = normalize(job.jobCode);
      const jobOfficeKey = normalize(job.division || job.department || '');
      const jobTitleTokens = tokens(job.title);

      let applicants = 0;
      let qualified = 0;
      const isQualifiedStatus = (status: string) => {
        const s = normalize(status);
        return s.includes('recommend') || s.includes('hired') || s === 'qualified';
      };
      // "Left to review" = screening not ended: not yet qualified/shortlisted, not disqualified.
      let toReview = 0;
      const tally = (row: any) => {
        applicants++;
        if (isQualifiedStatus(row?.status)) qualified++;
        if (reviewOutcome(row?.status) === 'undecided') toReview++;
      };

      for (const row of allApplicantsRaw) {
        const rowItem = normalize(row?.item_number ?? '');
        if (jobItemKey && rowItem && rowItem === jobItemKey) {
          tally(row);
          continue;
        }
        const rowPositionNormalized = normalize(row?.position);
        const rowPositionExpanded = expandAbbrev(row?.position);
        if (!jobTitleKey || !rowPositionNormalized) continue;
        if (rowPositionNormalized === jobTitleKey || rowPositionExpanded === jobTitleExpanded || rowPositionExpanded.includes(jobTitleExpanded) || jobTitleExpanded.includes(rowPositionExpanded)) {
          tally(row);
          continue;
        }
        const rowTokens = tokens(row?.position);
        const overlap = [...jobTitleTokens].filter((t) => rowTokens.has(t)).length;
        if (jobTitleTokens.size > 0 && overlap / jobTitleTokens.size >= 0.75) {
          const rowOffice = normalize(row?.office);
          if (!jobOfficeKey || !rowOffice || rowOffice === jobOfficeKey) {
            tally(row);
          }
        }
      }
      counts.set(job.id, { applicants, qualified, toReview });
    });
    return counts;
  }, [jobs, allApplicantsRaw]);

  // Job Vacancies › Applicants (N): what the filtered Applications tab will list.
  const listedApplicationCounts = useMemo(() => {
    if (!applicantSlotLinks) return undefined;
    return countListedApplicationsByPosition(
      jobs,
      allApplicantsRaw.map((row) => ({
        id: String(row?.id ?? ''),
        status: String(row?.status ?? ''),
        plantillaSlotId: row?.plantilla_slot_id ? String(row.plantilla_slot_id) : null,
        jobPostingId: row?.job_posting_id ? String(row.job_posting_id) : null,
      })),
      applicantSlotLinks,
    );
  }, [jobs, allApplicantsRaw, applicantSlotLinks]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesSearch = matchesTitleOrPlantilla(job, search);
      const matchesStatus = statusFilter === 'all' || positionStatus(job) === statusFilter;
      const matchesOffice = officeFilter === 'all' || formatOfficeName(job.department) === officeFilter;
      return matchesSearch && matchesStatus && matchesOffice;
    }).sort(comparePositionRows);
  }, [jobs, officeFilter, search, statusFilter]);

  const officeOptions = useMemo(
    // Offices only: divisions sit under their office (see formatOfficeName).
    () => Array.from(new Set(jobs.map((job) => formatOfficeName(job.department)))).sort((a, b) => a.localeCompare(b)),
    [jobs]
  );

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / ITEMS_PER_PAGE));
  const currentPageJobs = filteredJobs.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (showModal) {
      // Ensure modal always opens from the top section (Basic Information).
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [showModal]);

  // Applicants per plantilla ("Plantilla 1: 15 applicants"), shown in the list
  // and the editor, and used to stop a plantilla with applications from being
  // removed. Refreshed whenever the editor opens or closes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchSlotApplicantCountsChecked();
      if (cancelled) return;
      setSlotApplicantCounts(result.counts);
      setSlotCountsFailed(!result.ok);
    })();
    return () => { cancelled = true; };
  }, [showModal, jobs.length]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setOfficeFilter('all');
    setPage(1);
  };

  const saveJobs = (nextJobs: JobPosting[]) => {
    setJobs(nextJobs);
    saveJobPostings(nextJobs);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setSlotError('');
    setForm(buildDefaultJobForm());
    setShowModal(true);
    requestAnimationFrame(() => {
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  const openEditModal = (job: JobPosting) => {
    setEditingId(job.id);
    setSlotError('');
    setForm({
      title: job.title,
      // `legacy:` ids are the synthetic single slot recruitmentData invents for
      // a posting with no rows yet — send it back without an id so the save
      // creates a real row instead of upserting a non-existent one.
      slots: (job.plantillaSlots ?? []).length > 0
        ? (job.plantillaSlots ?? []).map((slot) => buildSlotRow({
            id: slot.id.startsWith('legacy:') ? undefined : slot.id,
            label: plantillaLabel(slot),
            itemNumber: slot.itemNumber,
            // The shared Salary Grade / Monthly Salary fields are gone; a row
            // that relied on them inherits the posting's value here.
            salaryGrade: String(slot.salaryGrade ?? job.salaryGrade ?? ''),
            monthlySalary: String(slot.monthlySalary ?? job.monthlySalary ?? ''),
            status: slot.status,
            filledByApplicantId: slot.filledByApplicantId,
          }))
        : [buildSlotRow({
            label: 'Plantilla 1',
            itemNumber: job.jobCode,
            salaryGrade: String(job.salaryGrade ?? ''),
            monthlySalary: String(job.monthlySalary ?? ''),
          })],
      department: job.department,
      division: job.division ?? '',
      positionLevel: '',
      positionType: job.positionType,
      numberOfPositions: job.numberOfPositions,
      employmentType: job.employmentStatus === 'Contractual' ? 'Contractual' : job.employmentStatus === 'Permanent' ? 'Full-time' : 'Part-time',
      employmentStatus: job.employmentStatus,
      statusLabel: job.status === 'Active' ? 'Open' : job.status === 'Draft' ? 'Reviewing' : 'Closed',
      summary: job.summary,
      qualifications: job.qualifications.preferred ?? '',
      responsibilities: job.responsibilities.length ? job.responsibilities : [''],
      education: job.qualifications.education,
      yearsOfExperience: job.qualifications.experience.years,
      experienceField: job.qualifications.experience.field,
      skills: job.qualifications.skills.join(', '),
      certifications: job.qualifications.certifications.join(', '),
      preferred: job.qualifications.preferred ?? '',
      requiredDocuments: job.requiredDocuments.filter((item) => item !== 'Other' && !isCurriculumVitae(item)),
      otherDocument: job.requiredDocuments.find((item) => item !== 'Resume/CV' && item !== 'Application Letter' && item !== 'Transcript of Records' && item !== 'NBI Clearance' && item !== 'Birth Certificate' && item !== 'SALN') ?? '',
      applicationDeadline: job.applicationDeadline.slice(0, 10),
      interviewStart: job.interviewPeriod?.start.slice(0, 10) ?? '',
      interviewEnd: job.interviewPeriod?.end.slice(0, 10) ?? '',
      expectedStartDate: job.expectedStartDate?.slice(0, 10) ?? '',
      salaryGrade: job.salaryGrade != null ? String(job.salaryGrade) : '',
      monthlySalary: job.monthlySalary != null ? String(job.monthlySalary) : '',
      qualEligibility: job.eligibility ?? job.qualifications.certifications[0] ?? '',
      qualEducation: job.qualifications.education ?? '',
      qualDegreeCourse: job.qualifications.experience.field ?? '',
      qualTraining: job.training ?? job.qualifications.preferred ?? '',
      qualExperienceYears: (() => {
        const totalYears = job.qualifications.experience.years || 0;
        return totalYears > 0 ? String(Math.floor(totalYears)) : '';
      })(),
      qualExperienceMonths: (() => {
        const totalYears = job.qualifications.experience.years || 0;
        const months = Math.round((totalYears - Math.floor(totalYears)) * 12);
        return months > 0 ? String(months) : '';
      })(),
      qualCompetency: job.competency ?? job.qualifications.skills[0] ?? '',
    });
    setShowModal(true);
    requestAnimationFrame(() => {
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  // "Edit Posting" on a job's Details page (docs/mockups/2026-10-18-job-edit-entry.html)
  // arrives here with state.editJobId; closing the form then returns to Details.
  const editRequestHandled = useRef(false);
  useEffect(() => {
    const editJobId = (location.state as { editJobId?: string } | null)?.editJobId;
    if (!editJobId || editRequestHandled.current) return;
    const job = jobs.find((item) => item.id === editJobId);
    if (!job) return;
    editRequestHandled.current = true;
    // Drop the request from history so a refresh doesn't reopen the form.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    setEditOpenedFromDetails(true);
    openEditModal(job);
  }, [location.state, location.pathname, location.search, navigate, jobs]);

  const closeModal = () => {
    setShowModal(false);
    setSaveFailure(null);
    if (editOpenedFromDetails) {
      setEditOpenedFromDetails(false);
      navigate(-1);
    }
  };

  // ─── Plantilla slot rows ──────────────────────────────────────────────────

  const updateSlot = (key: string, patch: Partial<PlantillaSlotFormRow>) => {
    setSlotError('');
    setForm((prev) => ({
      ...prev,
      slots: prev.slots.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)),
    }));
  };

  const addSlot = () => {
    setSlotError('');
    setForm((prev) => ({
      ...prev,
      slots: [...prev.slots, buildSlotRow({ label: '' })],
    }));
  };

  const removeSlot = (key: string) => {
    const target = form.slots.find((slot) => slot.key === key);
    if (!target) return;
    if (form.slots.length <= 1) return;

    // A plantilla people already applied to can't be deleted (the database
    // refuses too). Offer to close it instead, which stops new applications
    // and keeps every existing one.
    const linked = target.id ? slotApplicantCounts.get(target.id) ?? 0 : 0;
    if (linked > 0) {
      if (target.status === 'closed') {
        setSlotError(`${target.label || 'This plantilla'} has ${linked} applicant${linked === 1 ? '' : 's'}, so it can't be removed. It is already closed.`);
        return;
      }
      const closeIt = window.confirm(
        `${applicantsPerPlantillaText(target.label || 'This plantilla', linked)}.\n\n` +
        "A plantilla with applications can't be removed. Close it instead? It will stop taking new applications and keep every existing one.",
      );
      if (closeIt) updateSlot(key, { status: 'closed' });
      return;
    }
    if (target.status === 'filled') {
      const confirmed = window.confirm(
        `${target.label || 'This plantilla'} is already marked Filled. Removing it will detach the recorded hire. Continue?`,
      );
      if (!confirmed) return;
    }

    setSlotError('');
    setForm((prev) => ({ ...prev, slots: prev.slots.filter((slot) => slot.key !== key) }));
  };

  /**
   * Plantilla rules the DB also enforces (name required, unique per posting),
   * checked here so the admin gets a pointed message instead of an index error.
   */
  const validateSlots = async (): Promise<string> => {
    const missing = form.slots.findIndex((slot) => !slot.label.trim());
    if (missing >= 0) return `Enter a plantilla number for row ${missing + 1}.`;
    return validatePlantillaLabels(form.slots.map((slot) => slot.label));
  };

  const submitForm = async () => {
    // A new position is saved unopened; opening it (and its deadline) happens
    // in Job Vacancies. Editing never changes whether it is open.
    const existing = editingId ? jobs.find((job) => job.id === editingId) : undefined;
    const status: JobPosting['status'] = existing?.status ?? 'Draft';

    const missing: string[] = [];
    if (!form.title?.trim()) missing.push('Position Title');
    if (!form.department?.trim()) missing.push('Place of Assignation');
    if (!form.qualEligibility?.trim()) missing.push('Eligibility');
    if (!form.qualEducation?.trim()) missing.push('Education');
    if (missing.length > 0) {
      setToast(`Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
      return;
    }

    const missingSalary = form.slots.find((slot) => !slot.salaryGrade || !slot.monthlySalary);
    if (missingSalary) {
      setSlotError(`Enter the Salary Grade and Monthly Salary for ${missingSalary.label.trim() || 'every plantilla'}.`);
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSavingJob(true);
    const slotProblem = await validateSlots();
    if (slotProblem) {
      setSlotError(slotProblem);
      setSavingJob(false);
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSlotError('');

    const normalizedResponsibilities = form.responsibilities.map((entry) => entry.trim()).filter(Boolean);
    const requiredDocuments = [...form.requiredDocuments];
    if (form.otherDocument.trim()) {
      requiredDocuments.push(form.otherDocument.trim());
    }

    // Combine years + months into a single decimal year value.
    const expYears = parseInt(form.qualExperienceYears || '0', 10) || 0;
    const expMonths = parseInt(form.qualExperienceMonths || '0', 10) || 0;
    const totalYears = expYears + expMonths / 12;

    const jobId = editingId ?? crypto.randomUUID();
    const slotDrafts = form.slots.map((slot) => ({
      id: slot.id,
      label: slot.label.trim().replace(/\s+/g, ' '),
      // Existing rows keep their internal key; new ones get a neutral one.
      itemNumber: slot.itemNumber.trim() || internalPlantillaKey(),
      salaryGrade: Number(slot.salaryGrade),
      monthlySalary: Number(slot.monthlySalary),
      status: slot.status,
    }));

    const payload: JobPosting = {
      id: jobId,
      // Mirror of Plantilla 1; the authoritative list is plantillaSlots below.
      jobCode: slotDrafts[0].itemNumber,
      plantillaSlots: slotDrafts.map((draft, index) => ({
        id: draft.id ?? `pending:${index}`,
        jobPostingId: jobId,
        slotNumber: index + 1,
        label: draft.label,
        itemNumber: draft.itemNumber,
        salaryGrade: draft.salaryGrade,
        monthlySalary: draft.monthlySalary,
        status: draft.status,
      })),
      title: toTitleCase(form.title),
      department: form.department,
      division: form.division || undefined,
      positionType: form.positionType,
      numberOfPositions: form.numberOfPositions,
      employmentStatus: 'Permanent',
      summary: form.summary,
      responsibilities: normalizedResponsibilities,
      qualifications: {
        education: form.qualEducation,
        experience: {
          years: totalYears > 0 ? Math.round(totalYears * 100) / 100 : 0,
          field: form.qualDegreeCourse || form.experienceField,
        },
        skills: form.qualCompetency ? [form.qualCompetency] : [],
        certifications: form.qualEligibility ? [form.qualEligibility] : [],
        preferred: form.qualTraining || undefined,
      },
      // Posting-level mirror of Plantilla 1, for screens that read the posting.
      salaryGrade: slotDrafts[0].salaryGrade,
      monthlySalary: slotDrafts[0].monthlySalary,
      eligibility: form.qualEligibility || undefined,
      training: form.qualTraining || undefined,
      competency: form.qualCompetency || undefined,
      requiredDocuments,
      applicationDeadline: form.applicationDeadline ? new Date(form.applicationDeadline).toISOString() : '',
      interviewPeriod:
        form.interviewStart && form.interviewEnd
          ? { start: new Date(form.interviewStart).toISOString(), end: new Date(form.interviewEnd).toISOString() }
          : undefined,
      expectedStartDate: form.expectedStartDate ? new Date(form.expectedStartDate).toISOString() : undefined,
      status,
      postedDate: editingId ? jobs.find((job) => job.id === editingId)?.postedDate ?? new Date().toISOString() : new Date().toISOString(),
      postedBy: 'HR Admin',
      applicantCount: editingId ? jobs.find((job) => job.id === editingId)?.applicantCount ?? 0 : 0,
      qualifiedCount: editingId ? jobs.find((job) => job.id === editingId)?.qualifiedCount ?? 0 : 0,
    };

    const nextJobs = editingId
      ? jobs.map((job) => (job.id === editingId ? payload : job))
      : [payload, ...jobs];

    // The posting row has to exist in Supabase before its slots can reference
    // it, so this one waits rather than firing the write into the background.
    const previousJobs = jobs;
    const action = editingId ? 'save the changes to this position' : 'create this position';
    setJobs(nextJobs);
    setSaveFailure(null);
    let slotSave: Awaited<ReturnType<typeof saveSlotsForJob>>;
    try {
      const persisted = await saveJobPostingsAndWait(nextJobs);
      if (!persisted.ok) {
        setJobs(previousJobs);
        setSaveFailure(describeActionFailure(action, persisted.error));
        modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      slotSave = await saveSlotsForJob(jobId, slotDrafts);
    } catch (error) {
      setJobs(previousJobs);
      setSaveFailure(describeActionFailure(action, error));
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    } finally {
      setSavingJob(false);
    }

    if (!slotSave.ok) {
      // The posting saved; only its plantillas did not, so say exactly that.
      const failure = describeActionFailure('save the plantillas', slotSave.error);
      setSaveFailure({
        ...failure,
        message: 'The position itself was saved, but its plantilla changes were not.',
      });
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (slotSave.data && slotSave.data.length > 0) {
      // Replace the optimistic `pending:` ids with the real rows.
      const saved = slotSave.data;
      setJobs((prev) => prev.map((job) => (job.id === jobId ? { ...job, plantillaSlots: saved, jobCode: saved[0].itemNumber } : job)));
    }

    closeModal();
    const slotCount = slotDrafts.length;
    const slotNote = slotCount > 1 ? ` with ${slotCount} plantillas` : '';
    setToast(editingId
      ? `Job position updated${slotNote}.`
      : `Job position created${slotNote}. Open it from Job Vacancies to advertise it.`);
  };

  const deleteJobPosting = async (job: JobPosting) => {
    if (isOpenVacancy(job)) {
      setToast('Close the vacancy first before deleting this position.');
      return;
    }
    const linkedApplicants = liveApplicants.filter((row) => row.jobPostingId === job.id);
    const linkedCount = linkedApplicants.length;

    // Name the plantilla: positions sharing a title are separate rows.
    const plantillas = (job.plantillaSlots ?? []).map((slot) => plantillaLabel(slot)).join(', ');
    const target = plantillas ? `"${job.title}" (${plantillas})` : `"${job.title}"`;
    const confirmMessage = linkedCount > 0
      ? `Delete ${target}? ${linkedCount} applicant record(s) and their document references will be archived to Reports.`
      : `Delete ${target}? This action cannot be undone.`;
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    if (linkedCount > 0) {
      excludeApplicantIdsFromBackfill(linkedApplicants.map((row) => row.id));

      archiveDeletedJobPosting({
        job,
        applicants: linkedApplicants,
        deletedBy: 'HR Admin',
      });

      const remainingApplicants = liveApplicants.filter((row) => row.jobPostingId !== job.id);
      setLiveApplicants(remainingApplicants);
      saveApplicants(remainingApplicants);
    }

    saveJobs(jobs.filter((row) => row.id !== job.id));

    // The legacy `jobs` mirror and the title/item-number rows are best effort;
    // the posting itself (by id) must go, or the delete did not happen.
    const [primary] = await Promise.allSettled([
      supabase.from('job_postings').delete().eq('id', job.id),
      supabase.from('jobs').delete().eq('id', job.id),
      supabase.from('job_postings').delete().eq('title', job.title).eq('item_number', job.jobCode),
      supabase.from('jobs').delete().eq('title', job.title).eq('item_number', job.jobCode),
    ]);
    const primaryError = primary.status === 'rejected' ? primary.reason : (primary.value as { error?: unknown }).error;
    if (primaryError) {
      void loadJobPostings();
      const failure = describeActionFailure('delete this job post', primaryError);
      feedback.error(failure.title, `${failure.message} ${failure.nextStep}`);
      return;
    }

    setToast(linkedCount > 0 ? 'Job post deleted and applicant data archived to Reports.' : 'Job post deleted.');
  };

  // Opening and closing go through the database (src/lib/vacancies.ts), which
  // also opens or closes the plantillas and records the vacancy history. The
  // reload that follows refreshes the tabs, counts and Date Opened.

  /** Job Vacancies › Open Vacant Job Position. Resolves true when it opened. */
  const openVacancy = async (job: JobPosting, input: OpenVacancyInput) => {
    const result = await openVacancyRequest(job.id, input);
    if (!result.ok) {
      const failure = describeActionFailure('open this vacancy', result.error);
      feedback.error(failure.title, `${failure.message} ${failure.nextStep}`);
      return false;
    }
    await loadJobPostings();
    setToast(`Vacancy opened. Applications close on ${formatPHDate(input.deadline)}.`);
    return true;
  };

  /** Close Vacancy confirmation. Resolves true when it closed. */
  const confirmCloseVacancy = async (reason: CloseReason, remarks: string) => {
    if (!closingJob) return false;
    const result = await closeVacancy(closingJob.id, reason, remarks);
    if (!result.ok) {
      const failure = describeActionFailure('close this vacancy', result.error);
      setCloseError(`${failure.title} ${failure.message} ${failure.nextStep}`);
      return false;
    }
    setClosingJob(null);
    await loadJobPostings();
    setToast('Vacancy closed.');
    return true;
  };


  return (
    <div className="rsp-ds min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />
      <main className="admin-content bg-slate-50 !p-0">
        <div className="sticky top-14 z-30 sm:top-16 border-b border-slate-200 bg-white px-8 pt-6">
          <h1 className="!mb-1 !text-2xl font-bold">Job Posts</h1>
          <p className="!mb-4 text-base text-slate-500">Define positions once, then open them as vacancies with an application deadline. Vacancies close automatically at the deadline, or you can close them early.</p>
          {/* Tabs on white pages (DESIGN_IDENTITY §9.2) */}
          <div role="tablist" className="-mb-px flex gap-2">
            {([
              { id: 'vacancies', label: 'Job Vacancies', icon: Briefcase, count: jobs.filter((job) => isOpenVacancy(job)).length },
              { id: 'positions', label: 'Job Positions', icon: FileText, count: jobs.length },
            ] as const).map((tab) => {
              const selected = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => switchTab(tab.id)}
                  className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${selected ? 'border-[#363EE8] text-[#363EE8]' : 'border-transparent text-slate-500 hover:text-[#040E6B]'}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  <span className={`rounded-full px-2 py-px text-xs ${selected ? 'bg-[#EEF0FF] text-[#191FA8]' : 'bg-slate-100 text-slate-500'}`}>{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-6">
        {activeTab === 'vacancies' && (
          <JobVacanciesPanel
            jobs={jobs}
            loading={jobsLoad.initialLoading}
            applicantCounts={listedApplicationCounts}
            activeVacancies={activeVacancies}
            onOpenVacancy={openVacancy}
            onClose={(job) => { setCloseError(''); setClosingJob(job); }}
            onApplicants={(job) => navigate(`/admin/rsp/applications?positionId=${encodeURIComponent(job.id)}`)}
            onCreatePosition={() => { switchTab('positions'); openCreateModal(); }}
          />
        )}
        {activeTab === 'positions' && (
        <>
        <div className="mb-5 flex justify-start">
          <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white" onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            Create Job Position
          </button>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-0 shadow-sm">
          <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,0.75fr)_minmax(0,0.75fr)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                className="h-10 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-sm"
                placeholder="Search by job title or plantilla..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <select className="h-10 rounded-xl border border-slate-300 px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | PositionStatus)}>
              <option value="all">All Status</option>
              <option value="Open">Open</option>
              <option value="Closed">Closed</option>
            </select>

            <select className="h-10 rounded-xl border border-slate-300 px-3 text-sm" value={officeFilter} onChange={(event) => setOfficeFilter(event.target.value)}>
              <option value="all">All Offices</option>
              {officeOptions.map((office) => (
                <option key={office} value={office}>{office}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-700">
            <p>Showing <span className="font-semibold text-slate-900">{filteredJobs.length}</span> job positions</p>
            <button className="text-sm font-medium text-blue-700" onClick={clearFilters}>Clear Filters</button>
          </div>
        </section>

        <section className="mt-5">
          {/* The cache records a failed load; an empty list is not "no job posts". */}
          {getJobPostingsLoadError() && (
            <ErrorBanner
              error={getJobPostingsLoadError()}
              action="load the job posts"
              onRetry={() => void loadJobPostings()}
              className="mb-4"
            />
          )}
          {applicantsLoadError ? (
            <ErrorBanner
              error={applicantsLoadError}
              action="load the applicant counts"
              onRetry={() => window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'))}
              className="mb-4"
            />
          ) : null}
          {/* No overflow-hidden here: it would make this div the sticky
              scroll container, and the header would pin to the top of the
              table instead of the viewport, i.e. look like it does nothing.
              The corners are clipped on the header cells and the last row
              instead. */}
          <div className="rounded-2xl border border-slate-200 bg-white">
            <table className="abyan-table w-full min-w-full">
              <thead>
                {/* Sticky under the page header, which is itself sticky under
                    the §8.2 bar. The cells stick, not the row: a sticky <tr>
                    leaves its own background behind. The bottom rule is an
                    inset shadow rather than a border, because a border on a
                    sticky cell in a border-collapse table detaches from it
                    while scrolling. */}
                <tr className="bg-slate-50 [&>th]:sticky [&>th]:top-[168px] [&>th]:z-20 [&>th]:bg-slate-50 [&>th]:shadow-[inset_0_-1px_0_#e2e8f0] sm:[&>th]:top-[180px] [&>th:first-child]:rounded-tl-2xl [&>th:last-child]:rounded-tr-2xl">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Position Title</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Plantillas</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Office / Department</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Date Posted</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Applicants</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="w-[140px] px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className={tableBodyClass(false)}>
                {jobsLoad.initialLoading && (
                  <TableSkeletonRows show={jobsLoad.showSkeleton} rows={ITEMS_PER_PAGE}
                    columns={['two-line', 'text', 'text', 'text', 'text', 'badge', 'button']} label="Loading job postings…" />
                )}
                {!jobsLoad.initialLoading && currentPageJobs.map((job) => {
                  const liveCount = applicantCountsByJob.get(job.id) ?? { applicants: 0, qualified: 0, toReview: 0 };
                  const officeLabel = formatOfficeLabel(job.department, job.division);
                  // One posting per plantilla (2026-10-23 split), so one row each.
                  const slots = job.plantillaSlots ?? [];
                  // Open while the position has an unexpired vacancy, else Closed.
                  const status = positionStatus(job);
                  return (
                    <tr key={job.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900 text-sm">{normalizeRomanNumeralsInText(job.title)}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">
                        <span className="whitespace-nowrap">{slots.length > 0 ? slots.map((slot) => plantillaLabel(slot)).join(', ') : 'Plantilla 1'}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{officeLabel}</td>
                      <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{formatPHDate(job.postedDate)}</td>
                      <td className="px-5 py-4 text-center">
                        <span className="font-bold text-slate-900 text-sm">{liveCount.applicants}</span>
                        {liveCount.applicants > 0 && (
                          <p className={`!mb-0 mt-0.5 whitespace-nowrap text-xs font-medium ${liveCount.toReview > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                            {liveCount.toReview > 0 ? `${liveCount.toReview} left to review` : 'All reviewed'}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={STATUS_BADGE[status]}>{status}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            title="View Details"
                            className="rounded-lg border border-blue-600 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                            onClick={() => navigate(`/admin/rsp/job/${job.id}`)}
                          >
                            Details
                          </button>
                          <button type="button" title="Delete" aria-label={`Delete ${normalizeRomanNumeralsInText(job.title)}`} onClick={() => void deleteJobPosting(job)}
                            className="rounded-lg border border-rose-300 px-2 py-1.5 text-rose-500 hover:bg-rose-50 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!jobsLoad.initialLoading && currentPageJobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                      <Briefcase className="mx-auto mb-2 h-9 w-9 text-slate-300" />
                      <p className="font-medium">No job postings found for the selected filters.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between px-1 text-sm text-slate-600">
            <p>{filteredJobs.length === 0 ? 'No results' : `Showing ${(page - 1) * ITEMS_PER_PAGE + 1}–${Math.min(page * ITEMS_PER_PAGE, filteredJobs.length)} of ${filteredJobs.length}`}</p>
            <div className="flex items-center gap-2">
              <button aria-label="Previous page" className="rsp-pager flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 disabled:opacity-40 hover:bg-slate-50" onClick={() => setPage((c) => Math.max(1, c - 1))} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium">Page {page} of {totalPages || 1}</span>
              <button aria-label="Next page" className="rsp-pager flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 disabled:opacity-40 hover:bg-slate-50" onClick={() => setPage((c) => Math.min(totalPages, c + 1))} disabled={page === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
        </>
        )}
        </div>{/* /p-6 */}
      </main>

      <RecruitmentNavigationGuide open={showGuide} onClose={() => setShowGuide(false)} />

      <Modal
        open={showModal}
        onClose={closeModal}
        title={editingId ? 'Edit Position' : 'Create New Job Position'}
        subtitle={editingId ? 'Update the posting and its plantilla slots' : 'Fill in the details to create a new job posting'}
        bodyRef={modalBodyRef}
        footer={(
          <>
            <button type="button" onClick={closeModal} className="btn btn-md btn-secondary">Cancel</button>
            <button
              type="button"
              disabled={savingJob}
              aria-busy={savingJob || undefined}
              onClick={() => void submitForm()}
              className={`btn btn-md btn-primary${savingJob ? ' is-loading' : ''}`}
            >
              {!savingJob && <Plus size={15} aria-hidden="true" />}
              {editingId ? 'Save Changes' : 'Create Position'}
            </button>
          </>
        )}
      >
            <div className="space-y-5">
              {saveFailure && (
                <ActionFeedback
                  {...saveFailure}
                  onRetry={() => void submitForm()}
                  onDismiss={() => setSaveFailure(null)}
                />
              )}
              {(() => {
                const applied = editingId ? applicantCountsByJob.get(editingId)?.applicants ?? 0 : 0;
                if (applied === 0) return null;
                return (
                  <div role="note" className="flex gap-3 rounded-xl border-l-4 p-4" style={{ background: '#FCE8C8', borderLeftColor: '#E8821A', color: '#A8590A' }}>
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <p className="!mb-0 text-sm" style={{ color: '#A8590A' }}>
                      <strong>{applied} {applied === 1 ? 'person has' : 'people have'} applied.</strong> Changes apply to their applications too.
                      Requirements they were screened against may no longer match.
                    </p>
                  </div>
                );
              })()}
              <section>
                <h3 className="!mb-3 flex items-center gap-2 text-base font-bold" style={{ color: '#040E6B' }}>
                  <FileText size={16} style={{ color: '#363EE8' }} /> Job Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-900">Position Title <span className="text-red-500">*</span></label>
                    <input
                      className="w-full rounded-xl border border-slate-300 p-3 text-base"
                      placeholder="e.g., Administrative Officer III"
                      value={form.title}
                      onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                    />
                  </div>

                  {/* Plantilla Slots — one row per real vacancy. The admin types
                      each plantilla's number (they aren't a 1, 2, 3 sequence) and
                      it is stored as "Plantilla <n>"
                      (docs/mockups/2026-10-18-plantilla-numbers.html). */}
                  <div>
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <label className="block text-base font-semibold text-slate-900">
                        Plantilla Slots <span className="text-red-500">*</span>
                        <span className="ml-1.5 text-sm font-medium text-slate-500">({form.slots.length})</span>
                      </label>
                      <span className="text-xs text-slate-400">Enter each plantilla's number, e.g. 21. Numbers must be unique in this job post.</span>
                    </div>

                    {slotCountsFailed && (
                      <p role="status" className="mb-2 text-sm font-medium text-[var(--warning-700)]">
                        We couldn't check which plantillas already have applications. If you remove one that does, saving will be refused and nothing will change. Reopen this form to check again.
                      </p>
                    )}
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      {form.slots.map((slot, index) => {
                        const linkedApplicants = slot.id ? slotApplicantCounts.get(slot.id) ?? 0 : 0;
                        const canRemove = form.slots.length > 1 && linkedApplicants === 0;
                        const removeTitle = form.slots.length === 1
                          ? 'A job post needs at least one plantilla'
                          : linkedApplicants > 0
                            ? "This plantilla has applications and can't be removed. Close it instead."
                            : 'Remove this plantilla';
                        return (
                          <div key={slot.key} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                              <div className="flex min-w-0 flex-1 items-stretch">
                                <label
                                  htmlFor={`plantilla-label-${slot.key}`}
                                  className="flex shrink-0 items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-100 px-3 text-sm font-medium text-slate-600"
                                >
                                  Plantilla No.
                                </label>
                                <input
                                  id={`plantilla-label-${slot.key}`}
                                  className="min-w-0 flex-1 rounded-r-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                                  style={{ color: '#040E6B' }}
                                  inputMode="numeric"
                                  placeholder="e.g., 21"
                                  maxLength={6}
                                  required
                                  value={plantillaNumberOf(slot.label)}
                                  onChange={(event) => updateSlot(slot.key, { label: plantillaLabelForNumber(event.target.value) })}
                                />
                              </div>
                              {slot.status === 'filled' ? (
                                // Set by placing a hire, not by hand.
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Filled</span>
                              ) : (
                                <select
                                  aria-label={`Status of ${slot.label || `row ${index + 1}`}`}
                                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-700"
                                  value={slot.status}
                                  onChange={(event) => updateSlot(slot.key, { status: event.target.value as PlantillaSlotStatus })}
                                >
                                  <option value="open">Open</option>
                                  <option value="closed">Closed</option>
                                </select>
                              )}
                              <button
                                type="button"
                                aria-label={removeTitle}
                                title={removeTitle}
                                // Rows with applications stay clickable so the
                                // admin is offered "Close it instead".
                                disabled={form.slots.length === 1}
                                onClick={() => removeSlot(slot.key)}
                                className={`shrink-0 rounded-lg border p-2 transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 disabled:hover:bg-transparent ${
                                  canRemove ? 'border-rose-200 text-rose-500 hover:bg-rose-50' : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                                }`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>

                            {slot.label.trim() && !plantillaNumberOf(slot.label) && (
                              // An older free-text name; it is kept until a number is typed.
                              <p className="mt-1.5 text-xs text-slate-500">
                                Currently named "{slot.label.trim()}". Type a number to rename it.
                              </p>
                            )}

                            {/* Each plantilla carries its own salary; there is no
                                shared Salary Grade / Monthly Salary field.

                                The grade is picked from the CSC schedule and the
                                amount follows it — both were free text, which let
                                two postings at the same grade advertise different
                                salaries. */}
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <SalaryGradeSelect
                                value={slot.salaryGrade === '' ? null : Number(slot.salaryGrade)}
                                table={salaryTable}
                                required
                                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                                placeholder="Salary Grade *"
                                onChange={(grade, monthly) =>
                                  updateSlot(slot.key, {
                                    salaryGrade: grade == null ? '' : String(grade),
                                    monthlySalary: monthly == null ? '' : String(monthly),
                                  })
                                }
                              />
                              <div
                                aria-label={`Monthly Salary of ${slot.label || `row ${index + 1}`}`}
                                className="flex w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
                              >
                                {slot.monthlySalary
                                  ? `${formatSalary(Number(slot.monthlySalary))} · Step 1`
                                  : 'Monthly salary follows the grade'}
                              </div>
                            </div>

                            {slot.id && (
                              <p className="mt-2 text-xs text-slate-500">
                                {applicantsPerPlantillaText(slot.label.trim() || `Row ${index + 1}`, linkedApplicants)}
                                {linkedApplicants > 0 && " · can't be removed; close it to stop new applications"}
                              </p>
                            )}
                          </div>
                        );
                      })}

                      <button
                        type="button"
                        onClick={addSlot}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm font-semibold transition hover:bg-white"
                        style={{ borderColor: '#363EE8', color: '#363EE8' }}
                      >
                        <Plus size={14} /> Add Another Plantilla
                      </button>
                    </div>

                    {slotError && (
                      <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{slotError}</p>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-900">Place of Assignation <span className="text-red-500">*</span></label>
                    <select
                      className="w-full rounded-xl border border-slate-300 bg-white p-3 text-base"
                      value={form.department}
                      onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))}
                    >
                      <option value="">Select Office</option>
                      {departmentsList.map((office) => (
                        <option key={office} value={office}>{office}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="!mb-3 flex items-center gap-2 text-base font-bold" style={{ color: '#040E6B' }}>
                  <FileText size={16} style={{ color: '#363EE8' }} /> Qualifications
                </h3>
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Required</p>

                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-900">Eligibility <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-300 p-3 text-base"
                      placeholder="e.g., Career Service (SubProfessional) 1st level Eligibility"
                      value={form.qualEligibility}
                      onChange={(event) => setForm((prev) => ({ ...prev, qualEligibility: event.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-900">Education <span className="text-red-500">*</span></label>
                    <select
                      className="w-full rounded-xl border border-slate-300 bg-white p-3 text-base"
                      value={form.qualEducation}
                      onChange={(event) => setForm((prev) => ({ ...prev, qualEducation: event.target.value }))}
                    >
                      <option value="">Select Education Level</option>
                      {EDUCATION_LEVELS.map((level) => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>

                  <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Optional</p>

                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-900">Degree / Course</label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-300 p-3 text-base"
                      placeholder="e.g., BS Accountancy"
                      value={form.qualDegreeCourse}
                      onChange={(event) => setForm((prev) => ({ ...prev, qualDegreeCourse: event.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-900">Training</label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-300 p-3 text-base"
                      placeholder="e.g., 8 hours of Leadership and Management Training"
                      value={form.qualTraining}
                      onChange={(event) => setForm((prev) => ({ ...prev, qualTraining: event.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-900">Work Experience</label>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded-xl border border-slate-300 p-3 text-base"
                        placeholder="Years"
                        value={form.qualExperienceYears}
                        onChange={(event) => setForm((prev) => ({ ...prev, qualExperienceYears: event.target.value.replace(/[^0-9]/g, '') }))}
                      />
                      <input
                        type="number"
                        min={0}
                        max={11}
                        className="w-full rounded-xl border border-slate-300 p-3 text-base"
                        placeholder="Months"
                        value={form.qualExperienceMonths}
                        onChange={(event) => setForm((prev) => ({ ...prev, qualExperienceMonths: event.target.value.replace(/[^0-9]/g, '') }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-900">Competency</label>
                    <select
                      className="w-full rounded-xl border border-slate-300 bg-white p-3 text-base"
                      value={form.qualCompetency}
                      onChange={(event) => setForm((prev) => ({ ...prev, qualCompetency: event.target.value }))}
                    >
                      <option value="">Select Competency</option>
                      {COMPETENCIES.map((competency) => (
                        <option key={competency} value={competency}>{competency}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>
            </div>
      </Modal>

      {closingJob && (
        <CloseVacancyDialog job={closingJob} error={closeError} onCancel={() => setClosingJob(null)} onConfirm={confirmCloseVacancy} />
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 right-6 z-[400] rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>
      )}
    </div>
    </div>
  );
};
