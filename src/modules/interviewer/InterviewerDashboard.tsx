import {
  ArrowRight,
  Briefcase,
  Building2,
  CircleAlert,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackClosesView } from '../../hooks/useHistoryBack';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { ActionFeedback, useFeedback } from '../../components/action-feedback';
import { Dialog } from '../../components/Dialog';
import { describeActionFailure } from '../../lib/friendlyErrors';
import { POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import { isPositionAssignedToInterviewer, resolveAssignedPositionsForInterviewer } from '../../lib/interviewerAccess';
import { storeApplicantTypeForEval } from '../../lib/interviewerEvalNavigation';
import { InterviewerNavBar } from './InterviewerNavBar';
import { mockDatabase } from '../../lib/mockDatabase';
import { ensureRecruitmentSeedData, getAuthoritativeJobPostings, getJobPostingsFromSupabase } from '../../lib/recruitmentData';
import { supabase } from '../../lib/supabase';
import '../../styles/interviewer.css';
import '../../styles/abyan-tokens.css';
import '../../styles/interviewer-dashboard.css';
import type { JobPosting as RecruitmentJobPosting } from '../../types/recruitment.types';
import {
  CandidateListModal,
  DateCell,
  EvalStatusBadge,
  KPI_ORDER,
  KpiCard,
  Pager,
  SearchField,
  SelectField,
  departmentOptions,
  statusOptions,
  useDebouncedValue,
} from './InterviewerDashboardParts';
import {
  STATUS_OPTIONS,
  buildCandidateRows,
  buildKpiSets,
  formatDate,
  matchesSearch,
  matchesStatus,
  paginate,
  resolveInterviewerStamp,
  toLocalKey,
  type CandidateRow,
  type KpiKey,
  type StatusFilter,
} from './interviewerDashboardModel';
import { isScheduledForInterview } from '../../lib/applicantSchedule';

// Team-provided hero photo (public/assets/hero). If it fails to load, the
// hero falls back to the plain gradient.
const HERO_PHOTO_URL = '/assets/hero/iloilo-city-hall.webp';
const POSTINGS_PAGE_SIZE = 5;
const HISTORY_PAGE_SIZE = 5;

interface JobPosting {
  id: number;
  title: string;
  item_number: string;
  department: string;
  office: string;
  status: string;
  created_at: string;
  applicant_count: number;
  evaluated_count?: number;
  is_fully_evaluated?: boolean;
  interview_date?: string;
}

interface Applicant {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  position: string;
  office: string;
  contact_number: string;
  status: string;
  created_at: string;
  evaluation_status: 'Completed' | 'In Progress' | 'Not Yet Rated';
}

// Helper function to construct full name
const getFullName = (applicant: Applicant): string => {
  const parts = [applicant.first_name];
  if (applicant.middle_name) {
    parts.push(applicant.middle_name);
  }
  parts.push(applicant.last_name);
  return parts.join(' ');
};

interface InterviewerSessionInfo {
  email: string;
  name: string;
}

// Demo rows are recognised by their mock- id. An email domain says nothing:
// real, scheduled applicants can use @example.com addresses.
const isDemoApplicant = (applicant: any): boolean =>
  String(applicant?.id || '').toLowerCase().startsWith('mock-');

const fetchApplicantsFromClient = async (client: any): Promise<any[]> => {
  if (client && typeof client.from === 'function') {
    const { data } = await client.from('applicants').select('*');
    return data || [];
  }
  return [];
};

const fetchEvaluationsFromClient = async (client: any): Promise<any[]> => {
  const { data } = await client.from('evaluations').select('*');
  return data || [];
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const buildJobsFromPostings = (
  jobRows: RecruitmentJobPosting[],
  allApplicants: any[],
  allEvaluations: any[] = [],
) => {
  // Dedup defensively: same posting may exist twice in Supabase (e.g. created via
  // both job_postings and jobs tables, or a duplicate row was inserted). Keep the
  // first occurrence by jobCode → falls back to normalized title when jobCode is
  // empty. This is a display-layer guard and does not modify the DB.
  const seenKeys = new Set<string>();
  const dedupedRows: RecruitmentJobPosting[] = [];
  for (const job of jobRows || []) {
    const code = String(job?.jobCode || '').trim();
    const title = normalizeText(String(job?.title || ''));
    const key = code || title;
    if (!key) continue;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    dedupedRows.push(job);
  }

  const activeJobs = dedupedRows.filter((job) => String(job?.status || '').toLowerCase() === 'active');
  const activeTitleSet = new Set(activeJobs.map((job) => normalizeText(String(job?.title || ''))).filter(Boolean));

  const visibleApplicants = (allApplicants || []).filter((applicant) => {
    const position = normalizeText(String(applicant?.position || ''));
    return position && activeTitleSet.has(position);
  });

  // An interviewer is asked to evaluate the people who were scheduled, not
  // everyone who applied. Counting applications made a posting read 6 while
  // the list behind it held one scheduled candidate.
  const scheduledApplicants = visibleApplicants.filter(isScheduledForInterview);

  const applicantCountByTitle = new Map<string, number>();
  scheduledApplicants.forEach((applicant) => {
    const key = normalizeText(String(applicant?.position || ''));
    if (!key) return;
    applicantCountByTitle.set(key, (applicantCountByTitle.get(key) || 0) + 1);
  });

  // Build a set of applicant ids that already have an evaluation so we can
  // compute, per job, how many of its applicants are done.
  const evaluatedApplicantIds = new Set<string>(
    (allEvaluations || [])
      .map((evaluation: any) => String(evaluation?.applicant_id ?? '').trim())
      .filter(Boolean),
  );

  const evaluatedCountByTitle = new Map<string, number>();
  scheduledApplicants.forEach((applicant) => {
    const applicantId = String(applicant?.id ?? '').trim();
    if (!applicantId || !evaluatedApplicantIds.has(applicantId)) return;
    const key = normalizeText(String(applicant?.position || ''));
    if (!key) return;
    evaluatedCountByTitle.set(key, (evaluatedCountByTitle.get(key) || 0) + 1);
  });

  // Pick the earliest applicant.interview_date per job — that's what RSP
  // published via the Pending Assignment workflow.
  const interviewDateByTitle = new Map<string, string>();
  scheduledApplicants.forEach((applicant) => {
    const raw = String(applicant?.interview_date ?? '').trim();
    if (!raw) return;
    const key = normalizeText(String(applicant?.position || ''));
    if (!key) return;
    const existing = interviewDateByTitle.get(key);
    if (!existing || new Date(raw).getTime() < new Date(existing).getTime()) {
      interviewDateByTitle.set(key, raw);
    }
  });

  const jobs = activeJobs
    .map((job, index) => {
      const normalizedTitle = normalizeText(String(job?.title || ''));
      const office = String(job?.department || '').trim() || POSITION_TO_DEPARTMENT_MAP[job.title] || 'N/A';
      const numericId = Number(job.id);
      const applicantCount = applicantCountByTitle.get(normalizedTitle) || 0;
      const evaluatedCount = evaluatedCountByTitle.get(normalizedTitle) || 0;
      const interviewDate = interviewDateByTitle.get(normalizedTitle) || '';

      return {
        id: Number.isFinite(numericId) ? numericId : index + 1,
        title: job.title,
        item_number: job.jobCode || 'N/A',
        department: office,
        office,
        status: 'Open',
        created_at: job.postedDate || new Date().toISOString(),
        applicant_count: applicantCount,
        evaluated_count: evaluatedCount,
        is_fully_evaluated: applicantCount > 0 && evaluatedCount >= applicantCount,
        interview_date: interviewDate,
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    jobs,
    // Only the scheduled ones leave this function: the KPI cards and the
    // candidate list speak for the same people the counts do.
    visibleApplicants: scheduledApplicants,
  };
};

const filterJobsByAssignments = (jobRows: RecruitmentJobPosting[], assignedPositions: string[]) => {
  if (assignedPositions.length === 0) return jobRows;
  return jobRows.filter((job) => isPositionAssignedToInterviewer(String(job?.title ?? ''), assignedPositions));
};

export function InterviewerDashboard({
  session,
  onLogout,
}: {
  session?: InterviewerSessionInfo | null;
  onLogout?: () => void;
}) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [postingsPage, setPostingsPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);
  const [heroPhotoOk, setHeroPhotoOk] = useState(true);
  const kpiCardRefs = useRef<Partial<Record<KpiKey, HTMLDivElement | null>>>({});
  const lastOpenedKpi = useRef<KpiKey | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [applicantToDelete, setApplicantToDelete] = useState<Applicant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<{ message: string; nextStep: string } | null>(null);
  const { success: notifySuccess } = useFeedback();

  useEffect(() => {
    const syncJobs = () => {
      void fetchJobsAndApplicants(true);
    };

    const onStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === 'cictrix_rater_assigned_positions' ||
        event.key === 'cictrix_job_postings' ||
        event.key === 'cictrix_authoritative_job_postings'
      ) {
        void fetchJobsAndApplicants(true);
      }
    };

    void fetchJobsAndApplicants(false);
    
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', syncJobs);
      window.addEventListener('cictrix:job-postings-updated', syncJobs as EventListener);
      window.addEventListener('storage', onStorage);

      return () => {
        window.removeEventListener('focus', syncJobs);
        window.removeEventListener('cictrix:job-postings-updated', syncJobs as EventListener);
        window.removeEventListener('storage', onStorage);
      };
    }
    // Loader is re-created each render and is not an input; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtimeRefresh({
    channel: 'interviewer-dashboard',
    tables: ['applicants', 'evaluations', 'job_postings'],
    // The realtime hook keeps the latest callback in a ref; the loader is not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    onChange: useCallback(() => { void fetchJobsAndApplicants(true); }, []),
  });

  const fetchJobsAndApplicants = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      // CRITICAL: Always fetch applicants from Supabase (as per user requirement: "all datas must be stored in supabase")
      const primaryClient = supabase; // Always use Supabase for applicants
      const secondaryClient = (mockDatabase as any); // Fallback only if Supabase fails

      let allApplicants: any[] = [];
      let allEvaluations: any[] = [];
      ensureRecruitmentSeedData();
      const { positions } = await resolveAssignedPositionsForInterviewer(session?.email);
      
      // CRITICAL: Fetch job postings from Supabase first (source of truth), fallback to localStorage
      let canonicalJobPostings: RecruitmentJobPosting[] = [];
      try {
        canonicalJobPostings = await getJobPostingsFromSupabase();
        if (canonicalJobPostings.length === 0) {
          console.log('[INTERVIEWER] No jobs from Supabase, falling back to localStorage');
          canonicalJobPostings = getAuthoritativeJobPostings();
        } else {
          console.log('[INTERVIEWER] ✓ Loaded', canonicalJobPostings.length, 'jobs from Supabase');
        }
      } catch (err) {
        console.warn('[INTERVIEWER] Failed to fetch jobs from Supabase, using localStorage:', err);
        canonicalJobPostings = getAuthoritativeJobPostings();
      }
      
      const canonicalJobRows = filterJobsByAssignments(canonicalJobPostings, positions);

      try {
        allApplicants = await fetchApplicantsFromClient(primaryClient);
        allEvaluations = await fetchEvaluationsFromClient(primaryClient);
      } catch (primaryErr) {
        console.warn('Primary interviewer data source failed:', primaryErr);
      }

      if ((!allApplicants || allApplicants.length === 0)) {
        try {
          allApplicants = await fetchApplicantsFromClient(secondaryClient);
          allEvaluations = await fetchEvaluationsFromClient(secondaryClient);
        } catch (secondaryErr) {
          console.warn('Secondary interviewer data source failed:', secondaryErr);
        }
      }

      allApplicants = (allApplicants || []).filter((item) => !isDemoApplicant(item));

      // Single source of truth: use canonical RSP/Admin postings only.
      const { jobs: jobsFromPostings, visibleApplicants } = buildJobsFromPostings(canonicalJobRows, allApplicants, allEvaluations);
      const visibleApplicantIds = new Set(
        visibleApplicants.map((applicant: any) => String(applicant?.id ?? '').trim()).filter(Boolean)
      );
      const visibleEvaluations = (allEvaluations || []).filter((evaluation: any) =>
        visibleApplicantIds.has(String(evaluation?.applicant_id ?? '').trim())
      );

      setJobs(jobsFromPostings);
      setApplicants(visibleApplicants);
      setEvaluations(visibleEvaluations);
    } catch (err) {
      console.error('Error initializing dashboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const todayKey = toLocalKey(new Date());
  const query = useDebouncedValue(searchInput.trim().toLowerCase());
  const interviewerStamp = resolveInterviewerStamp(session);

  const departments = useMemo(() => Array.from(new Set(jobs.map((job) => job.office))).sort(), [jobs]);

  const rows = useMemo(
    () => buildCandidateRows(
      applicants,
      evaluations,
      new Map(jobs.map((job) => [normalizeText(job.title), job.office])),
      interviewerStamp,
    ),
    [applicants, evaluations, jobs, interviewerStamp],
  );

  const kpiSets = useMemo(() => buildKpiSets(rows, todayKey), [rows, todayKey]);

  const rowsByTitle = useMemo(() => {
    const map = new Map<string, CandidateRow[]>();
    rows.forEach((row) => map.set(row.titleKey, [...(map.get(row.titleKey) ?? []), row]));
    return map;
  }, [rows]);

  // Postings: search matches the title, office, or any candidate's name. With
  // no status chosen, finished postings drop out of the queue (as before);
  // a status keeps any posting with at least one matching candidate.
  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const jobRows = rowsByTitle.get(normalizeText(job.title)) ?? [];
    const matchesQuery = !query ||
      job.title.toLowerCase().includes(query) ||
      job.office.toLowerCase().includes(query) ||
      jobRows.some((row) => row.name.toLowerCase().includes(query));
    const matchesDept = departmentFilter === 'all' || job.office === departmentFilter;
    const inScope = statusFilter === 'all'
      ? !job.is_fully_evaluated
      : jobRows.some((row) => matchesStatus(row, statusFilter, todayKey));
    return matchesQuery && matchesDept && inScope;
  }), [jobs, rowsByTitle, query, departmentFilter, statusFilter, todayKey]);

  // History: evaluations this interviewer submitted, newest first.
  const historyRows = useMemo(() => rows
    .filter((row) =>
      row.evaluatedByMe &&
      matchesSearch(row, query) &&
      (departmentFilter === 'all' || row.department === departmentFilter) &&
      matchesStatus(row, statusFilter, todayKey))
    .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt)),
  [rows, query, departmentFilter, statusFilter, todayKey]);

  useEffect(() => {
    setPostingsPage(1);
    setHistoryPage(1);
  }, [query, departmentFilter, statusFilter]);

  const postings = paginate(filteredJobs, postingsPage, POSTINGS_PAGE_SIZE);
  const history = paginate(historyRows, historyPage, HISTORY_PAGE_SIZE);

  const hasActiveFilters = query !== '' || departmentFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = () => {
    setSearchInput('');
    setDepartmentFilter('all');
    setStatusFilter('all');
  };

  const openKpiModal = (kpi: KpiKey) => {
    lastOpenedKpi.current = kpi;
    setOpenKpi(kpi);
  };
  const closeKpiModal = useCallback(() => setOpenKpi(null), []);
  // Browser Back closes the list modal instead of leaving the dashboard.
  useBackClosesView(openKpi !== null, closeKpiModal, 'kpi-modal');

  // Return focus to the card that opened the modal.
  useEffect(() => {
    if (openKpi === null && lastOpenedKpi.current) {
      kpiCardRefs.current[lastOpenedKpi.current]?.focus();
      lastOpenedKpi.current = null;
    }
  }, [openKpi]);

  // Same navigation the applicants list uses for "Evaluate".
  const openEvaluation = useCallback((row: CandidateRow) => {
    storeApplicantTypeForEval(row.id, row.appType);
    navigate(`/interviewer/evaluate/${row.id}`);
  }, [navigate]);

  // There is no read-only evaluation screen in the interviewer portal, so
  // "View" opens the existing applicants list for that posting.
  const openApplicantsList = useCallback((row: CandidateRow) => {
    navigate(`/interviewer/applicants?position=${encodeURIComponent(row.position)}`);
  }, [navigate]);

  const handleViewJobApplicants = (jobTitle: string) => {
    navigate(`/interviewer/applicants?position=${encodeURIComponent(jobTitle)}`);
  };

  const handleDeleteConfirm = async () => {
    if (!applicantToDelete) return;
    const name = getFullName(applicantToDelete);

    try {
      setDeleting(true);
      setDeleteError(null);
      const { error: deleteError } = await supabase
        .from('applicants')
        .delete()
        .eq('id', applicantToDelete.id);

      if (deleteError) throw deleteError;

      // Refresh jobs data to update applicant counts
      fetchJobsAndApplicants();

      setDeleteConfirmOpen(false);
      setApplicantToDelete(null);
      notifySuccess('Applicant deleted', `${name} and their attachments were removed.`);
    } catch (err) {
      const described = describeActionFailure('delete this applicant', err);
      setDeleteError({ message: described.message, nextStep: described.nextStep });
    } finally {
      setDeleting(false);
    }
  };

  const statusLabel = STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? '';

  return (
    <div className="abyan-ds ivd">
      <InterviewerNavBar session={session} onLogout={onLogout} />

      {/* ── Hero: gradient + blended Iloilo City Hall photo, straight edges ── */}
      <header className="ivd-hero">
        {heroPhotoOk && (
          <div className="ivd-hero-photo" aria-hidden="true">
            <img
              src={HERO_PHOTO_URL}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setHeroPhotoOk(false)}
            />
            <span className="ivd-hero-photo-tint" />
          </div>
        )}
        <div className="ivd-container">
          <div className="ivd-hero-text">
            <h1 className="text-title-l">Interviewer Dashboard</h1>
            <p className="text-body-l">View assigned job postings and manage applicant evaluations</p>
          </div>
        </div>
      </header>

      <main className="ivd-container ivd-main">
        {error ? (
          <div className="ivd-card">
            <div className="ivd-alert" role="alert">
              <CircleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
              <div>
                <h3 className="text-headline-m">We couldn't load your assignments</h3>
                <p className="text-body-m">{error.replace(/[.\s]+$/, '')}. Try again, or contact RSP if this keeps happening.</p>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => void fetchJobsAndApplicants(false)}>
                  Try Again
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ── 1. KPI quick-view cards ── */}
            <section className="ivd-kpis" aria-label="Evaluation summary" aria-busy={loading}>
              {KPI_ORDER.map((kpi) => (
                <KpiCard
                  key={kpi}
                  kpi={kpi}
                  rows={kpiSets[kpi]}
                  loading={loading}
                  onOpen={() => openKpiModal(kpi)}
                  cardRef={(el) => { kpiCardRefs.current[kpi] = el; }}
                />
              ))}
            </section>

            {/* ── 2. Filters & search (§9.4) ── */}
            <section className="ivd-card ivd-filters" aria-labelledby="ivd-filters-label">
              <p id="ivd-filters-label" className="ivd-filters-label text-caps">Filters &amp; search</p>
              <div className="ivd-toolbar">
                <SearchField
                  value={searchInput}
                  onChange={setSearchInput}
                  label="Search candidate, position, or office"
                  placeholder="Search candidate, position, or office…"
                />
                <SelectField
                  value={departmentFilter}
                  onChange={setDepartmentFilter}
                  label="Department"
                  options={departmentOptions(departments)}
                  icon={Building2}
                />
                <SelectField
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as StatusFilter)}
                  label="Status"
                  options={statusOptions}
                />
              </div>

              {hasActiveFilters && (
                <div className="ivd-chips" aria-live="polite">
                  {query && (
                    <span className="ivd-chip">
                      Search: <strong>“{searchInput.trim()}”</strong>
                      <button type="button" onClick={() => setSearchInput('')} aria-label="Remove search filter">
                        <X size={14} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </span>
                  )}
                  {departmentFilter !== 'all' && (
                    <span className="ivd-chip">
                      Department: <strong>{departmentFilter}</strong>
                      <button type="button" onClick={() => setDepartmentFilter('all')} aria-label={`Remove ${departmentFilter} filter`}>
                        <X size={14} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </span>
                  )}
                  {statusFilter !== 'all' && (
                    <span className="ivd-chip">
                      Status: <strong>{statusLabel}</strong>
                      <button type="button" onClick={() => setStatusFilter('all')} aria-label={`Remove ${statusLabel} filter`}>
                        <X size={14} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </span>
                  )}
                  <button type="button" className="ivd-link" onClick={clearFilters}>Clear all</button>
                </div>
              )}
            </section>

            {/* ── 3. Assigned job postings (§9.5) ── */}
            <section className="ivd-card" aria-labelledby="ivd-postings-title">
              <div className="ivd-section-head">
                <h2 id="ivd-postings-title" className="text-title-m">Assigned job postings</h2>
                <p className="text-body-l">Open a posting to view and evaluate its applicants.</p>
              </div>

              <div className="abyan-table-wrap">
                <table className="abyan-table" aria-busy={loading}>
                  <thead>
                    <tr>
                      <th scope="col">Job title / position</th>
                      <th scope="col">Office / department</th>
                      <th scope="col" className="is-num">Applicants</th>
                      <th scope="col">Interview date</th>
                      <th scope="col" className="is-action"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 3 }, (_, i) => (
                        <tr key={`skeleton-${i}`} aria-hidden="true">
                          <td className="ivd-cell-primary"><span className="ivd-skel" style={{ width: '60%', height: 14 }} /></td>
                          <td><span className="ivd-skel" style={{ width: '70%', height: 14 }} /></td>
                          <td className="is-num"><span className="ivd-skel" style={{ width: 32, height: 24, marginLeft: 'auto' }} /></td>
                          <td className="ivd-cell-wide"><span className="ivd-skel" style={{ width: 120, height: 14 }} /></td>
                          <td className="is-action"><span className="ivd-skel" style={{ width: 148, height: 36, marginLeft: 'auto', borderRadius: 'var(--radius-pill)' }} /></td>
                        </tr>
                      ))
                    ) : postings.pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="ivd-cell-empty">
                          <div className="ivd-empty">
                            <div className="ivd-empty-icon" aria-hidden="true"><Briefcase size={24} strokeWidth={1.75} /></div>
                            {hasActiveFilters ? (
                              <>
                                <h3 className="text-title-s">No postings match these filters</h3>
                                <p className="text-body-m">Try another department or status, or clear the filters.</p>
                                <button type="button" className="btn btn-sm btn-secondary" onClick={clearFilters}>Clear Filters</button>
                              </>
                            ) : (
                              <>
                                <h3 className="text-title-s">Nothing to evaluate. You're all caught up.</h3>
                                <p className="text-body-m">New assignments from RSP will appear here.</p>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      postings.pageItems.map((job) => {
                        const remaining = Math.max(0, job.applicant_count - (job.evaluated_count ?? 0));
                        return (
                          <tr key={job.id}>
                            <td className="ivd-cell-primary">
                              <span className="ivd-job-title">{job.title}</span>
                            </td>
                            <td data-label="Office / Department">
                              <span>{job.office}</span>
                              {job.department && job.department !== job.office && (
                                <span className="ivd-job-meta text-body-s">{job.department}</span>
                              )}
                            </td>
                            <td className="is-num" data-label="Applicants">
                              <span
                                className={`ivd-count${remaining === 0 ? ' is-zero' : ''}`}
                                title={`${remaining} of ${job.applicant_count} still to evaluate`}
                                aria-label={`${remaining} of ${job.applicant_count} applicants still to evaluate`}
                              >
                                {remaining}
                              </span>
                            </td>
                            <td className="ivd-cell-wide" data-label="Interview date">
                              <DateCell raw={job.interview_date ?? ''} todayKey={todayKey} />
                            </td>
                            <td className="is-action">
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => handleViewJobApplicants(job.title)}
                                aria-label={`View applicants for ${job.title}`}
                              >
                                View<span className="ivd-view-more">Applicants</span>
                                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {!loading && (
                <Pager total={filteredJobs.length} page={postings.current} pageSize={POSTINGS_PAGE_SIZE} onPage={setPostingsPage} label="Job postings pages" />
              )}
            </section>

            {/* ── 4. Evaluation history ── */}
            <section className="ivd-card" aria-labelledby="ivd-history-title">
              <div className="ivd-section-head">
                <h2 id="ivd-history-title" className="text-title-m">Evaluation History</h2>
                <p className="text-body-l">Your submitted evaluations</p>
              </div>

              <div className="abyan-table-wrap">
                <table className="abyan-table" aria-busy={loading}>
                  <thead>
                    <tr>
                      <th scope="col">Candidate</th>
                      <th scope="col">Position</th>
                      <th scope="col">Department</th>
                      <th scope="col">Date evaluated</th>
                      <th scope="col">Result / rating</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="is-action"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 2 }, (_, i) => (
                        <tr key={`history-skeleton-${i}`} aria-hidden="true">
                          <td className="ivd-cell-primary"><span className="ivd-skel" style={{ width: '70%', height: 14 }} /></td>
                          <td><span className="ivd-skel" style={{ width: '70%', height: 14 }} /></td>
                          <td><span className="ivd-skel" style={{ width: '70%', height: 14 }} /></td>
                          <td><span className="ivd-skel" style={{ width: 96, height: 14 }} /></td>
                          <td><span className="ivd-skel" style={{ width: 96, height: 14 }} /></td>
                          <td><span className="ivd-skel" style={{ width: 88, height: 24 }} /></td>
                          <td className="is-action"><span className="ivd-skel" style={{ width: 72, height: 36, marginLeft: 'auto', borderRadius: 'var(--radius-pill)' }} /></td>
                        </tr>
                      ))
                    ) : history.pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="ivd-cell-empty">
                          <div className="ivd-empty">
                            <div className="ivd-empty-icon" aria-hidden="true"><Briefcase size={24} strokeWidth={1.75} /></div>
                            <h3 className="text-title-s">
                              {hasActiveFilters ? 'No evaluations match these filters.' : 'No evaluations submitted yet.'}
                            </h3>
                            <p className="text-body-m">
                              {hasActiveFilters
                                ? 'Clear the filters to see all of your submitted evaluations.'
                                : 'Evaluations you submit will be listed here.'}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      history.pageItems.map((row) => (
                        <tr key={row.id}>
                          <td className="ivd-cell-primary"><span className="ivd-job-title" title={row.name}>{row.name}</span></td>
                          <td data-label="Position">{row.position}</td>
                          <td data-label="Department">{row.department}</td>
                          <td data-label="Date evaluated">{formatDate(row.evaluatedAt)}</td>
                          <td data-label="Result / rating">
                            <span>{row.recommendation || '—'}</span>
                            {row.rating !== null && (
                              <span className="ivd-job-meta text-body-s">Rating {row.rating.toFixed(1)} / 5</span>
                            )}
                          </td>
                          <td data-label="Status"><EvalStatusBadge evaluated /></td>
                          <td className="is-action">
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={() => openApplicantsList(row)}
                              aria-label={`View ${row.name}`}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {!loading && (
                <Pager total={historyRows.length} page={history.current} pageSize={HISTORY_PAGE_SIZE} onPage={setHistoryPage} label="Evaluation history pages" />
              )}
            </section>
          </>
        )}
      </main>

      {openKpi && (
        <CandidateListModal
          kpi={openKpi}
          rows={kpiSets[openKpi]}
          departments={departments}
          todayKey={todayKey}
          onClose={closeKpiModal}
          onEvaluate={openEvaluation}
          onView={openApplicantsList}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => { setDeleteConfirmOpen(false); setDeleteError(null); }} title="Confirm Delete">
        <div className="modal-content">
          <div className="delete-confirm-content">
            <div className="warning-icon">⚠️</div>
            <p className="delete-warning-text">
              Are you sure you want to delete <strong>{applicantToDelete ? getFullName(applicantToDelete) : ''}</strong>?
            </p>
            <p className="delete-warning-subtext">
              This action cannot be undone. All applicant data and attachments will be permanently removed.
            </p>
            {deleteError && (
              <ActionFeedback
                className="mt-3"
                title="We couldn't delete this applicant."
                message={deleteError.message}
                nextStep={deleteError.nextStep}
                onDismiss={() => setDeleteError(null)}
              />
            )}
            <div className="delete-confirm-actions">
              <button
                className="cancel-delete-btn"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="confirm-delete-btn"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                aria-busy={deleting || undefined}
              >
                {deleting ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Trash2 size={18} />}
                <span>Delete Applicant</span>
              </button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
