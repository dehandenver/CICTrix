import {
    Briefcase,
    Calendar,
    ChevronLeft,
    ChevronRight,
    FileText,
    Lock,
    MapPin,
    Plus,
    Search,
    Trash2,
    Users
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEPARTMENTS } from '../constants/positions';
import { getPreferredDataSourceMode } from '../lib/dataSourceMode';
import { mockDatabase } from '../lib/mockDatabase';
import {
    archiveDeletedJobPosting,
    ensureRecruitmentSeedData,
    excludeApplicantIdsFromBackfill,
    formatPHDate,
    getApplicants,
    getJobPostings,
    saveApplicants,
    saveJobPostings,
    toTitleCase,
} from '../lib/recruitmentData';
import { isMockModeEnabled, supabase } from '../lib/supabase';
import { JobPosting } from '../types/recruitment.types';
import { RecruitmentNavigationGuide } from './RecruitmentNavigationGuide';
import { Sidebar } from './Sidebar';

const ITEMS_PER_PAGE = 3;

const normalizeText = (value: string) => String(value ?? '').trim().toLowerCase();

const normalizeRomanNumeralsInText = (value: string) =>
  String(value ?? '')
    .split(/(\s+)/)
    .map((token) => (/^[ivxlcdm]+$/i.test(token) ? token.toUpperCase() : token))
    .join('');

const STATUS_COLORS: Record<JobPosting['status'], string> = {
  Draft: 'bg-slate-100 text-slate-700',
  Active: 'bg-emerald-100 text-emerald-700',
  Closed: 'bg-rose-100 text-rose-700',
  Filled: 'bg-blue-100 text-blue-700',
};

const STATUS_LABELS: Record<JobPosting['status'], string> = {
  Draft: 'Reviewing',
  Active: 'Open',
  Closed: 'Closed',
  Filled: 'Filled',
};

interface JobPostFormValues {
  title: string;
  jobCode: string;
  department: string;
  division: string;
  positionLevel: string;
  positionType: JobPosting['positionType'];
  salaryGrade: string;
  salaryMin: number;
  salaryMax: number;
  numberOfPositions: number;
  employmentType: 'Full-time' | 'Part-time' | 'Contractual' | 'Project-based';
  employmentStatus: JobPosting['employmentStatus'];
  statusLabel: 'Open' | 'Reviewing' | 'Closed';
  summary: string;
  qualifications: string;
  responsibilities: string[];
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
  jobCode: `LGU-2026-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`,
  department: '',
  division: '',
  positionLevel: '',
  positionType: 'Civil Service',
  salaryGrade: 'SG-11',
  salaryMin: 28000,
  salaryMax: 36000,
  numberOfPositions: 1,
  employmentType: 'Full-time',
  employmentStatus: 'Permanent',
  statusLabel: 'Open',
  summary: '',
  qualifications: '',
  responsibilities: [''],
  education: "Bachelor's Degree",
  yearsOfExperience: 1,
  experienceField: 'Public Administration',
  skills: 'Communication, Records Management',
  certifications: 'Civil Service Eligibility',
  preferred: '',
  requiredDocuments: ['Resume/CV', 'Application Letter'],
  otherDocument: '',
  applicationDeadline: '',
  interviewStart: '',
  interviewEnd: '',
  expectedStartDate: '',
});

export const JobPostingsPage = () => {
  const navigate = useNavigate();
  const modalBodyRef = useRef<HTMLDivElement | null>(null);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [liveApplicants, setLiveApplicants] = useState<ReturnType<typeof getApplicants>>([]);
  // Raw applicant rows straight from Supabase — the single source of truth for
  // both card counts and the View Applicants list. Skips findJobIdFromRow so no rows
  // are silently dropped before counting.
  const [allApplicantsRaw, setAllApplicantsRaw] = useState<any[]>([]);
  const [viewingApplicantsFor, setViewingApplicantsFor] = useState<JobPosting | null>(null);
  const [jobApplicantsRows, setJobApplicantsRows] = useState<Array<{ id: string; full_name: string; email: string; contact_number: string; status: string; created_at: string; total_score: number | null; position: string; office: string; matched: boolean }>>([]);
  const [jobApplicantsLoading, setJobApplicantsLoading] = useState(false);
  const [jobApplicantsSearch, setJobApplicantsSearch] = useState('');
  const [showAllApplicants, setShowAllApplicants] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | JobPosting['status']>('all');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [showGuide, setShowGuide] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<JobPostFormValues>(buildDefaultJobForm());
  const [toast, setToast] = useState('');

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

    const toStatus = (rawStatus: string): ReturnType<typeof getApplicants>[number]['status'] => {
      const normalized = normalizeText(rawStatus);
      if (normalized.includes('recommend') || normalized.includes('qualified') || normalized.includes('hired') || normalized.includes('accepted')) {
        return 'Recommended for Hiring';
      }
      if (normalized.includes('shortlist')) return 'Shortlisted';
      if (normalized.includes('interview')) return 'For Interview';
      if (normalized.includes('review') || normalized.includes('pending')) return 'Under Review';
      if (normalized.includes('reject')) return 'Rejected';
      if (normalized.includes('disqual')) return 'Not Qualified';
      return 'New Application';
    };

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

    const findJobIdFromRow = (row: any) => {
      const position = normalizeText(String(row?.position ?? ''));
      const office = normalizeText(String(row?.office ?? ''));
      const itemKey = normalizeFuzzy(String(row?.item_number ?? ''));
      const explicitJobId = String(row?.job_posting_id ?? '').trim();

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
          status: toStatus(String(row?.status ?? '')),
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

  useEffect(() => {
    ensureRecruitmentSeedData();
    const loadedJobs = getJobPostings();
    const normalizedJobs = loadedJobs.map((job) => ({
      ...job,
      title: normalizeRomanNumeralsInText(job.title),
    }));
    setJobs(normalizedJobs);
    // Normalize derived stores (legacy jobs/options) from the current source-of-truth list.
    saveJobPostings(normalizedJobs);
    // Keep the legacy liveApplicants pipeline (other flows like delete depend on it).
    void resolveLiveApplicants(normalizedJobs);
  }, []);

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
          setAllApplicantsRaw([]);
          return;
        }
        const rows = Array.isArray(data) ? data : [];
        console.info('[JobPostingsPage] allApplicantsRaw loaded', { count: rows.length });
        setAllApplicantsRaw(rows);
      } catch (err) {
        if (cancelled) return;
        console.error('[JobPostingsPage] allApplicantsRaw fetch exception:', err);
        setAllApplicantsRaw([]);
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
    const counts = new Map<string, { applicants: number; qualified: number }>();
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

      for (const row of allApplicantsRaw) {
        const rowItem = normalize(row?.item_number ?? '');
        if (jobItemKey && rowItem && rowItem === jobItemKey) {
          applicants++;
          if (isQualifiedStatus(row?.status)) qualified++;
          continue;
        }
        const rowPositionNormalized = normalize(row?.position);
        const rowPositionExpanded = expandAbbrev(row?.position);
        if (!jobTitleKey || !rowPositionNormalized) continue;
        if (rowPositionNormalized === jobTitleKey || rowPositionExpanded === jobTitleExpanded || rowPositionExpanded.includes(jobTitleExpanded) || jobTitleExpanded.includes(rowPositionExpanded)) {
          applicants++;
          if (isQualifiedStatus(row?.status)) qualified++;
          continue;
        }
        const rowTokens = tokens(row?.position);
        const overlap = [...jobTitleTokens].filter((t) => rowTokens.has(t)).length;
        if (jobTitleTokens.size > 0 && overlap / jobTitleTokens.size >= 0.75) {
          const rowOffice = normalize(row?.office);
          if (!jobOfficeKey || !rowOffice || rowOffice === jobOfficeKey) {
            applicants++;
            if (isQualifiedStatus(row?.status)) qualified++;
          }
        }
      }
      counts.set(job.id, { applicants, qualified });
    });
    return counts;
  }, [jobs, allApplicantsRaw]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!viewingApplicantsFor) {
      setJobApplicantsRows([]);
      return;
    }

    let cancelled = false;
    const job = viewingApplicantsFor;

    const fetchRows = async () => {
      setJobApplicantsLoading(true);

      // Supabase is the source of truth. Query it directly. If RLS blocks the select,
      // surface the error (so we see it in console) rather than silently falling back.
      const fetchFromSupabase = async (): Promise<{ rows: any[] | null; error: any }> => {
        // Use select('*') so the query can't fail due to a column name drift between
        // the TypeScript schema and the actual Supabase table. We read fields defensively.
        try {
          const { data, error } = await (supabase as any)
            .from('applicants')
            .select('*')
            .order('created_at', { ascending: false });
          if (error) return { rows: null, error };
          return { rows: Array.isArray(data) ? data : [], error: null };
        } catch (err) {
          return { rows: null, error: err };
        }
      };

      const fetchFromBackend = async (): Promise<any[] | null> => {
        try {
          const res = await fetch('/api/applicants/?skip=0&limit=1000');
          if (!res.ok) return null;
          const contentType = res.headers.get('content-type') ?? '';
          if (!contentType.includes('application/json')) return null;
          const payload = await res.json();
          return Array.isArray(payload) ? payload : null;
        } catch {
          return null;
        }
      };

      try {
        // Primary: Supabase
        const supabaseResult = await fetchFromSupabase();
        let data: any[] | null = supabaseResult.rows;
        let source = 'supabase';

        if (supabaseResult.error) {
          console.error('[JobPostingsPage] supabase select error:', supabaseResult.error);
        }

        // Only fall through to the backend when Supabase truly failed (not when it
        // succeeded but returned zero rows). An RLS policy that returns zero rows is
        // indistinguishable here from "there are none", so we try backend as a second
        // chance when rows is null OR when rows is empty and backend might have more.
        if (!data || data.length === 0) {
          const backendData = await fetchFromBackend();
          if (backendData && backendData.length > 0) {
            data = backendData;
            source = 'backend';
          }
        }

        if (cancelled) return;
        if (!data) {
          console.warn('[JobPostingsPage] no applicants source reachable. Check Supabase RLS or backend on :8000.');
          setJobApplicantsRows([]);
          return;
        }
        console.info(`[JobPostingsPage] applicants loaded from ${source} (${data.length} rows)`);

        const normalize = (value: string) =>
          normalizeRomanNumeralsInText(String(value ?? ''))
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');

        const expandAbbrev = (value: string) =>
          normalize(value)
            .replace(/\badmin\b/g, 'administrative')
            .replace(/\bit\b/g, 'information technology')
            .replace(/\bhr\b/g, 'human resource');

        const tokens = (value: string) =>
          new Set(expandAbbrev(value).split(/\s+/).filter((t) => t.length >= 3));

        const jobTitleKey = normalize(job.title);
        const jobTitleExpanded = expandAbbrev(job.title);
        const jobItemKey = normalize(job.jobCode);
        const jobOfficeKey = normalize(job.division || job.department || '');
        const jobTitleTokens = tokens(job.title);

        // IDs that the page's existing loader already matched to this job via
        // findJobIdFromRow (handles position+office fallback resolution).
        const preMatchedIds = new Set(
          liveApplicants
            .filter((entry) => entry.jobPostingId === job.id)
            .map((entry) => String(entry.id)),
        );

        const isMatch = (row: any) => {
          const rowId = String(row?.id ?? '');
          if (preMatchedIds.has(rowId)) return true;

          const rowItem = normalize(row?.item_number);
          if (jobItemKey && rowItem && rowItem === jobItemKey) return true;

          const rowPositionNormalized = normalize(row?.position);
          const rowPositionExpanded = expandAbbrev(row?.position);
          if (!jobTitleKey || !rowPositionNormalized) return false;

          if (rowPositionNormalized === jobTitleKey) return true;
          if (rowPositionExpanded === jobTitleExpanded) return true;
          if (rowPositionExpanded.includes(jobTitleExpanded) || jobTitleExpanded.includes(rowPositionExpanded)) return true;

          const rowTokens = tokens(row?.position);
          const overlap = [...jobTitleTokens].filter((t) => rowTokens.has(t)).length;
          if (jobTitleTokens.size > 0 && overlap / jobTitleTokens.size >= 0.75) {
            const rowOffice = normalize(row?.office);
            if (!jobOfficeKey || !rowOffice || rowOffice === jobOfficeKey) return true;
          }

          return false;
        };

        // Local status overrides: persistStatus writes status changes to the
        // recruitment store in localStorage. When RLS blocks the DB update, the UI
        // would otherwise show stale status. Overlay localStorage status on the DB
        // row so the user sees their own actions immediately.
        const localApplicants = getApplicants();
        const localStatusById = new Map<string, string>();
        for (const entry of localApplicants) {
          if (entry?.id && entry?.status) localStatusById.set(String(entry.id), String(entry.status));
        }

        const mapped = data.map((row: any) => {
          const firstName = String(row.first_name ?? '').trim();
          const middleName = String(row.middle_name ?? '').trim();
          const lastName = String(row.last_name ?? '').trim();
          const middleInitial = middleName ? `${middleName.charAt(0).toUpperCase()}.` : '';
          const fullName = [firstName, middleInitial, lastName].filter(Boolean).join(' ');
          const rowId = String(row.id);
          const localStatus = localStatusById.get(rowId);
          return {
            id: rowId,
            full_name: fullName,
            email: String(row.email ?? ''),
            contact_number: String(row.contact_number ?? ''),
            status: localStatus ?? String(row.status ?? 'New Application'),
            created_at: String(row.created_at ?? ''),
            total_score: typeof row.total_score === 'number' ? row.total_score : null,
            position: String(row.position ?? ''),
            office: String(row.office ?? ''),
            matched: isMatch(row),
          };
        });

        console.info('[JobPostingsPage] applicants fetch result', {
          jobTitle: job.title,
          jobCode: job.jobCode,
          jobOffice: job.division || job.department,
          totalRows: data.length,
          preMatchedByLiveApplicants: preMatchedIds.size,
          matchedAfterFuzzy: mapped.filter((r) => r.matched).length,
          samplePositions: Array.from(new Set(data.map((r: any) => r?.position))).slice(0, 10),
        });

        setJobApplicantsRows(mapped);
      } catch (err) {
        console.error('[JobPostingsPage] fetch applicants exception:', err);
        if (!cancelled) setJobApplicantsRows([]);
      } finally {
        if (!cancelled) setJobApplicantsLoading(false);
      }
    };

    void fetchRows();
    return () => { cancelled = true; };
  }, [viewingApplicantsFor, liveApplicants]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const query = `${job.title} ${job.jobCode} ${job.summary}`.toLowerCase();
      const matchesSearch = !search || query.includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
      const office = job.division || `${job.department} Department`;
      const matchesOffice = officeFilter === 'all' || office === officeFilter;
      return matchesSearch && matchesStatus && matchesOffice;
    });
  }, [jobs, officeFilter, search, statusFilter]);

  const officeOptions = useMemo(
    () => Array.from(new Set(jobs.map((job) => job.division || `${job.department} Department`))).sort((a, b) => a.localeCompare(b)),
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
    setForm(buildDefaultJobForm());
    setShowModal(true);
    requestAnimationFrame(() => {
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  const openEditModal = (job: JobPosting) => {
    setEditingId(job.id);
    setForm({
      title: job.title,
      jobCode: job.jobCode,
      department: job.department,
      division: job.division ?? '',
      positionLevel: '',
      positionType: job.positionType,
      salaryGrade: job.salaryGrade ?? '',
      salaryMin: job.salaryRange?.min ?? 20000,
      salaryMax: job.salaryRange?.max ?? 30000,
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
      requiredDocuments: job.requiredDocuments.filter((item) => item !== 'Other'),
      otherDocument: job.requiredDocuments.find((item) => item !== 'Resume/CV' && item !== 'Application Letter' && item !== 'Transcript of Records' && item !== 'NBI Clearance' && item !== 'Birth Certificate' && item !== 'SALN') ?? '',
      applicationDeadline: job.applicationDeadline.slice(0, 10),
      interviewStart: job.interviewPeriod?.start.slice(0, 10) ?? '',
      interviewEnd: job.interviewPeriod?.end.slice(0, 10) ?? '',
      expectedStartDate: job.expectedStartDate?.slice(0, 10) ?? '',
    });
    setShowModal(true);
    requestAnimationFrame(() => {
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  const submitForm = (status: JobPosting['status']) => {
    if (!form.title || !form.department || !form.summary || !form.applicationDeadline) {
      setToast('Please complete required fields in Basic Information and Job Description.');
      return;
    }

    const normalizedResponsibilities = form.responsibilities.map((entry) => entry.trim()).filter(Boolean);
    const requiredDocuments = [...form.requiredDocuments];
    if (form.otherDocument.trim()) {
      requiredDocuments.push(form.otherDocument.trim());
    }

    const normalizedQualifications = form.qualifications.trim();

    const payload: JobPosting = {
      id: editingId ?? crypto.randomUUID(),
      jobCode: form.jobCode.trim() || `LGU-2026-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`,
      title: toTitleCase(form.title),
      department: form.department,
      division: form.division || undefined,
      positionType: form.positionType,
      salaryGrade: form.salaryGrade,
      salaryRange: { min: form.salaryMin, max: form.salaryMax },
      numberOfPositions: form.numberOfPositions,
      employmentStatus: form.employmentType === 'Contractual' ? 'Contractual' : form.employmentType === 'Full-time' ? 'Permanent' : 'Temporary',
      summary: form.summary,
      responsibilities: normalizedResponsibilities,
      qualifications: {
        education: normalizedQualifications || form.education,
        experience: { years: form.yearsOfExperience, field: form.experienceField },
        skills: form.skills.split(',').map((item) => item.trim()).filter(Boolean),
        certifications: form.certifications.split(',').map((item) => item.trim()).filter(Boolean),
        preferred: normalizedQualifications || form.preferred || undefined,
      },
      requiredDocuments,
      applicationDeadline: new Date(form.applicationDeadline).toISOString(),
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

    saveJobs(nextJobs);
    setShowModal(false);
    setToast(editingId ? 'Job post updated successfully.' : 'Job post created successfully.');
  };

  const updateStatus = (id: string, nextStatus: JobPosting['status']) => {
    const nextJobs = jobs.map((job) => (job.id === id ? { ...job, status: nextStatus } : job));
    saveJobs(nextJobs);
    setToast(`Posting marked as ${nextStatus}.`);
    // If status is 'Filled' or 'Hired', navigate to Newly Hired page
    if (nextStatus === 'Filled') {
      navigate('/admin/rsp/new-hired');
    }
  };

  const duplicatePosting = (job: JobPosting) => {
    const duplicated: JobPosting = {
      ...job,
      id: crypto.randomUUID(),
      title: `${job.title} (Copy)`,
      jobCode: `${job.jobCode}-COPY`,
      status: 'Draft',
      postedDate: new Date().toISOString(),
    };
    saveJobs([duplicated, ...jobs]);
    setToast('Posting duplicated as draft.');
  };

  const deleteJobPosting = async (job: JobPosting) => {
    const linkedApplicants = liveApplicants.filter((row) => row.jobPostingId === job.id);
    const linkedCount = linkedApplicants.length;

    const confirmMessage = linkedCount > 0
      ? `Delete job post \"${job.title}\"? ${linkedCount} applicant record(s) and their document references will be archived to Reports.`
      : `Delete job post \"${job.title}\"? This action cannot be undone.`;
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

    await Promise.allSettled([
      supabase.from('job_postings').delete().eq('id', job.id),
      supabase.from('jobs').delete().eq('id', job.id),
      supabase.from('job_postings').delete().eq('title', job.title).eq('item_number', job.jobCode),
      supabase.from('jobs').delete().eq('title', job.title).eq('item_number', job.jobCode),
    ]);

    setToast(linkedCount > 0 ? 'Job post deleted and applicant data archived to Reports.' : 'Job post deleted.');
  };

  const closeApplication = (job: JobPosting) => {
    if (job.status === 'Active') {
      updateStatus(job.id, 'Closed');
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />
      <main className="admin-content bg-slate-50">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-2 text-base font-semibold text-blue-600">RSP Dashboard <span className="mx-2 text-slate-400">&gt;</span> <span className="text-slate-900">Job Postings</span></p>
            <h1 className="text-2xl font-bold text-slate-900">Job Postings Management</h1>
            <p className="text-sm text-slate-600">Manage and monitor all job positions and their applicants</p>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white" onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Add New Position
            </button>
          </div>
        </header>

        {viewingApplicantsFor && (() => {
          const job = viewingApplicantsFor;
          const term = jobApplicantsSearch.trim().toLowerCase();
          const searched = term
            ? jobApplicantsRows.filter((r) =>
                r.full_name.toLowerCase().includes(term) ||
                r.email.toLowerCase().includes(term) ||
                r.status.toLowerCase().includes(term) ||
                r.position.toLowerCase().includes(term),
              )
            : jobApplicantsRows;

          const matchedRows = searched.filter((r) => r.matched);
          const otherRows = searched.filter((r) => !r.matched);
          const totalMatched = jobApplicantsRows.filter((r) => r.matched).length;
          const totalInDb = jobApplicantsRows.length;

          const statusClass = (status: string) => {
            const s = status.toLowerCase();
            if (s.includes('qualified') || s.includes('shortlist') || s.includes('recommend') || s.includes('hired')) return 'bg-emerald-100 text-emerald-700';
            if (s.includes('reject') || s.includes('not qualified') || s.includes('disqual')) return 'bg-rose-100 text-rose-700';
            if (s.includes('interview')) return 'bg-purple-100 text-purple-700';
            if (s.includes('review') || s.includes('pending')) return 'bg-blue-100 text-blue-700';
            return 'bg-amber-100 text-amber-700';
          };

          const renderCard = (a: typeof jobApplicantsRows[number], i: number) => (
            <article
              key={a.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/admin/rsp/applicant/${a.id}`, {
                state: { from: '/admin/rsp/jobs', job: { id: job.id, title: job.title, jobCode: job.jobCode } },
              })}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                    #{i + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="!mb-0 text-base font-bold text-slate-900">
                        {a.full_name || <span className="italic text-slate-400">Unnamed applicant</span>}
                      </p>
                      {a.matched && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          Matched
                        </span>
                      )}
                    </div>
                    <p className="!mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-600">
                      {a.email && <span>{a.email}</span>}
                      {a.contact_number && <span>· {a.contact_number}</span>}
                    </p>
                    <p className="!mb-0 text-xs text-slate-400">
                      Applied for <span className="font-semibold text-slate-600">{a.position || '—'}</span>
                      {a.office && <> · {a.office}</>}
                      {a.created_at && <> · {formatPHDate(a.created_at)}</>}
                    </p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusClass(a.status)}`}>
                  {a.status}
                </span>
              </div>
            </article>
          );

          return (
            <>
              <section className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <button
                  type="button"
                  onClick={() => { setViewingApplicantsFor(null); setShowAllApplicants(false); }}
                  className="rounded-xl border border-slate-300 bg-slate-50 p-2.5 text-slate-600 hover:bg-slate-100"
                  aria-label="Back to job postings"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="!mb-1 text-xs font-semibold uppercase tracking-widest text-blue-600">
                    Job Postings &gt; Applicants
                  </p>
                  <h2 className="!mb-0.5 text-xl font-bold text-slate-900">{job.title}</h2>
                  <p className="!mb-0 text-sm text-slate-600">
                    {job.division || `${job.department} Department`} · Item No. {job.jobCode} · {totalMatched} matched · {totalInDb} in database
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[job.status]}`}>
                  {STATUS_LABELS[job.status]}
                </span>
              </section>

              <section className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    className="h-10 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-sm"
                    placeholder="Search applicants by name, email, position, or status…"
                    value={jobApplicantsSearch}
                    onChange={(event) => setJobApplicantsSearch(event.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={showAllApplicants}
                    onChange={(e) => setShowAllApplicants(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Show all applicants in database ({totalInDb - totalMatched} unmatched)
                </label>
              </section>

              <section className="mt-4 flex flex-col gap-3">
                {jobApplicantsLoading ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                    Loading applicants…
                  </div>
                ) : totalInDb === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
                    <Users className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <p className="!mb-1 font-semibold text-slate-600">No applicants in database</p>
                    <p className="!mb-0 text-sm text-slate-400">
                      The applicants table is empty, or row-level security is blocking reads for this account.
                    </p>
                  </div>
                ) : (
                  <>
                    {matchedRows.length > 0 && (
                      <>
                        <p className="!mb-0 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Matched to this job ({matchedRows.length})
                        </p>
                        {matchedRows.map((a, i) => renderCard(a, i))}
                      </>
                    )}

                    {matchedRows.length === 0 && !showAllApplicants && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                        <p className="!mb-1 font-semibold">No applicants matched this job posting directly.</p>
                        <p className="!mb-2">
                          {totalInDb} applicant{totalInDb !== 1 ? 's are' : ' is'} in the database, but none were linked to <span className="font-semibold">{job.title}</span> by position or item number.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowAllApplicants(true)}
                          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                          Show all applicants in database
                        </button>
                      </div>
                    )}

                    {showAllApplicants && otherRows.length > 0 && (
                      <>
                        <p className="!mb-0 mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Other applicants in database ({otherRows.length})
                        </p>
                        {otherRows.map((a, i) => renderCard(a, matchedRows.length + i))}
                      </>
                    )}

                    {searched.length === 0 && term && (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
                        <p className="!mb-0 text-sm text-slate-500">No applicants match your search.</p>
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          );
        })()}

        {!viewingApplicantsFor && (
        <>
        <section className="rounded-xl border border-slate-200 bg-white p-0 shadow-sm">
          <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,0.75fr)_minmax(0,0.75fr)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                className="h-10 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-sm"
                placeholder="Search by job title or item number..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <select className="h-10 rounded-xl border border-slate-300 px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | JobPosting['status'])}>
              <option value="all">All Status</option>
              <option value="Active">Open</option>
              <option value="Draft">Reviewing</option>
              <option value="Closed">Closed</option>
              <option value="Filled">Filled</option>
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
          <p className="mb-2 text-center text-base font-semibold text-slate-700">
            {filteredJobs.length === 0 ? 'Position 0 to 0 of 0' : `Position ${(page - 1) * ITEMS_PER_PAGE + 1} to ${Math.min(page * ITEMS_PER_PAGE, filteredJobs.length)} of ${filteredJobs.length}`}
          </p>

          <div className="grid grid-cols-[48px_minmax(0,1fr)_48px] items-start gap-3">
            <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-slate-500 disabled:opacity-40" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {currentPageJobs.map((job) => {
                const liveCount = applicantCountsByJob.get(job.id) ?? { applicants: 0, qualified: 0 };
                const officeLabel = job.division || `${job.department} Department`;
                const statusLabel = STATUS_LABELS[job.status];

                return (
                  <article key={job.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h3 className="!mb-0 text-2xl font-semibold text-slate-900">{normalizeRomanNumeralsInText(job.title)}</h3>
                      <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${STATUS_COLORS[job.status]}`}>{statusLabel}</span>
                    </div>

                    <p className="!mb-2 text-sm text-slate-500">Item No. {job.jobCode}</p>

                    <div className="space-y-1.5 text-sm text-slate-700">
                      <p className="!mb-0 flex items-center gap-2.5"><MapPin className="h-4 w-4 shrink-0 text-slate-400" /> <span>{officeLabel}</span></p>
                      <p className="!mb-0 flex items-center gap-2.5"><Calendar className="h-4 w-4 shrink-0 text-slate-400" /> <span>Posted {formatPHDate(job.postedDate)}</span></p>
                      <p className="!mb-0 flex items-center gap-2.5"><Users className="h-4 w-4 shrink-0 text-slate-400" /> <span><span className="font-bold text-slate-900">{liveCount.applicants}</span> Applicants</span></p>
                    </div>

                    <div className="mt-4 space-y-2">
                      <button
                        type="button"
                        className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-base font-semibold text-white"
                        onClick={() => {
                          setViewingApplicantsFor(job);
                          setJobApplicantsSearch('');
                        }}
                      >
                        View Applicants <ChevronRight className="ml-2 inline h-4 w-4" />
                      </button>

                      {job.status === 'Active' && (
                        <button
                          type="button"
                          onClick={() => closeApplication(job)}
                          className="w-full rounded-xl border border-orange-300 bg-white px-4 py-2.5 text-base font-medium text-orange-600"
                        >
                          <Lock className="mr-2 inline h-4 w-4" /> Close Application
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void deleteJobPosting(job)}
                        className="w-full rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-base font-medium text-rose-600"
                      >
                        <Trash2 className="mr-2 inline h-4 w-4" /> Delete
                      </button>
                    </div>
                  </article>
                );
              })}

              {currentPageJobs.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                  <Briefcase className="mx-auto h-10 w-10 text-slate-400" />
                  <p className="mt-2 font-medium">No job postings found for the selected filters.</p>
                </div>
              )}
            </div>

            <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-slate-500 disabled:opacity-40" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </section>
        </>
        )}
      </main>

      <RecruitmentNavigationGuide open={showGuide} onClose={() => setShowGuide(false)} />

      {showModal && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 p-4" onClick={() => setShowModal(false)}>
          <div className="mx-auto flex h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between bg-blue-700 px-7 py-5 text-white">
              <div>
                <h2 className="!mb-1 text-5xl font-bold">Create New Job Position</h2>
                <p className="!mb-0 text-2xl text-blue-100">Fill in the details to create a new job posting</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-2 text-white/90 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <span className="text-5xl leading-none">×</span>
              </button>
            </div>

            <div ref={modalBodyRef} className="flex-1 space-y-7 overflow-y-auto px-7 py-6">
              <section>
                <h3 className="!mb-4 flex items-center gap-2 text-4xl font-bold text-slate-900">
                  <FileText size={28} className="text-blue-600" /> Basic Information
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

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-base font-semibold text-slate-900">Item Number <span className="text-red-500">*</span></label>
                      <input
                        className="w-full rounded-xl border border-slate-300 p-3 text-base"
                        placeholder="e.g., ITEM-2024-001"
                        value={form.jobCode}
                        onChange={(event) => setForm((prev) => ({ ...prev, jobCode: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-base font-semibold text-slate-900">Salary Grade <span className="text-red-500">*</span></label>
                      <input
                        className="w-full rounded-xl border border-slate-300 p-3 text-base"
                        placeholder="e.g., SG-11"
                        value={form.salaryGrade}
                        onChange={(event) => setForm((prev) => ({ ...prev, salaryGrade: event.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-base font-semibold text-slate-900">Office/Department <span className="text-red-500">*</span></label>
                      <select
                        className="w-full rounded-xl border border-slate-300 bg-white p-3 text-base"
                        value={form.department}
                        onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))}
                      >
                        <option value="">Select Office</option>
                        {DEPARTMENTS.map((office) => (
                          <option key={office} value={office}>{office}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-base font-semibold text-slate-900">Position Level</label>
                      <select
                        className="w-full rounded-xl border border-slate-300 bg-white p-3 text-base"
                        value={form.positionLevel}
                        onChange={(event) => {
                          const value = event.target.value;
                          const mappedType: JobPosting['positionType'] =
                            value === 'Supervisory' || value === 'Managerial'
                              ? 'Civil Service'
                              : value === 'Entry Level'
                                ? 'JO'
                                : value === 'Mid Level'
                                  ? 'COS'
                                  : value === 'Senior Level'
                                    ? 'Contractual'
                                    : form.positionType;
                          setForm((prev) => ({ ...prev, positionLevel: value, positionType: mappedType }));
                        }}
                      >
                        <option value="">Select Level</option>
                        <option value="Entry Level">Entry Level</option>
                        <option value="Mid Level">Mid Level</option>
                        <option value="Senior Level">Senior Level</option>
                        <option value="Supervisory">Supervisory</option>
                        <option value="Managerial">Managerial</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-base font-semibold text-slate-900">Number of Slots</label>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-xl border border-slate-300 p-3 text-base"
                        value={form.numberOfPositions}
                        onChange={(event) => setForm((prev) => ({ ...prev, numberOfPositions: Number(event.target.value) || 1 }))}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-base font-semibold text-slate-900">Employment Type</label>
                      <select
                        className="w-full rounded-xl border border-slate-300 bg-white p-3 text-base"
                        value={form.employmentType}
                        onChange={(event) => setForm((prev) => ({ ...prev, employmentType: event.target.value as JobPostFormValues['employmentType'] }))}
                      >
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Contractual">Contractual</option>
                        <option value="Project-based">Project-based</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-base font-semibold text-slate-900">Application Deadline</label>
                      <input
                        type="date"
                        className="w-full rounded-xl border border-slate-300 p-3 text-base"
                        value={form.applicationDeadline}
                        onChange={(event) => setForm((prev) => ({ ...prev, applicationDeadline: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-base font-semibold text-slate-900">Status</label>
                      <select
                        className="w-full rounded-xl border border-slate-300 bg-white p-3 text-base"
                        value={form.statusLabel}
                        onChange={(event) => setForm((prev) => ({ ...prev, statusLabel: event.target.value as JobPostFormValues['statusLabel'] }))}
                      >
                        <option value="Open">Open</option>
                        <option value="Reviewing">Reviewing</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="!mb-4 flex items-center gap-2 text-4xl font-bold text-slate-900">
                  <FileText size={28} className="text-blue-600" /> Job Description
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-900">Description</label>
                    <textarea
                      rows={4}
                      className="w-full rounded-xl border border-slate-300 p-3 text-base"
                      placeholder="Provide a brief overview of the position..."
                      value={form.summary}
                      onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-900">Key Responsibilities</label>
                    <textarea
                      rows={4}
                      className="w-full rounded-xl border border-slate-300 p-3 text-base"
                      placeholder="List the main duties and responsibilities (one per line)..."
                      value={form.responsibilities.join('\n')}
                      onChange={(event) => setForm((prev) => ({ ...prev, responsibilities: event.target.value.split('\n') }))}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-900">Qualifications</label>
                    <textarea
                      rows={4}
                      className="w-full rounded-xl border border-slate-300 p-3 text-base"
                      placeholder="List required qualifications, education, and experience..."
                      value={form.qualifications}
                      onChange={(event) => setForm((prev) => ({ ...prev, qualifications: event.target.value }))}
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-7 py-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-2xl border border-slate-300 bg-white px-8 py-3 text-lg text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitForm(form.statusLabel === 'Open' ? 'Active' : form.statusLabel === 'Reviewing' ? 'Draft' : 'Closed')}
                className="rounded-2xl bg-blue-600 px-8 py-3 text-lg font-semibold text-white"
              >
                <Plus size={18} className="mr-2 inline" /> Create Position
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
};
