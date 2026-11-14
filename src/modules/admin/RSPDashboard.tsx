import {
  AlertCircle,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileText,
  Filter,
  Lock,
  Mail,
  MapPin,
  GitBranch,
  ListChecks,
  Plus,
  Search,
  Settings,
  Shield,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { QualifiedApplicantsSection } from '../../components/QualifiedApplicantsSection';
import { ErrorBanner } from '../../components/ErrorBanner';
import { getAdminEmail } from '../../lib/adminSession';
import { funnelBucket, normalizeStatus, type FunnelBucket } from '../../lib/api/applicantStatus';
import { dashboardPostingStatus } from '../../lib/vacancySearch';
import { RspArchives, type ArchiveRecord } from './rsp-archives';
import { fetchWrittenExamTotals } from '../../lib/api/examTotalPoints';
import {
  fetchApplicantCategoryScores,
  hasFinalizedCategoryScores,
} from '../../lib/api/applicantScores';
import { failureText } from '../../lib/friendlyErrors';
import { useFeedback } from '../../components/action-feedback';
import { TopScorerBadge, topScorerIds, topScorerRowClass } from '../../components/data-table';
import { WRITTEN_EXAM_FORM_SHARE, convertExamScore, totalForPosition } from '../../lib/examTotalPoints';
import { SuccessionPlanningPage } from '../../components/SuccessionPlanningPage';
import { RspDashboardOverview } from './RspDashboardOverview';
import { EligibilityPointsPanel } from '../../components/EligibilityPointsPanel';
import { SalaryGradeSelect } from '../../components/SalaryGradeSelect';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AdminHeader } from '../../components/AdminHeader';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { Sidebar } from '../../components/Sidebar';
import { useDepartmentNames } from '../../hooks/useDepartmentOptions';
import { useBackClosesView } from '../../hooks/useHistoryBack';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { getPreferredDataSourceMode } from '../../lib/dataSourceMode';
import {
  createPassword,
  createUniqueUsername,
  findEmployeePortalAccount,
  findEmployeePortalAccountFromSupabaseByEmployeeIdOrEmail,
  getEmployeePortalAccounts,
  getLastEmployeePasswordReset,
  logEmployeePasswordReset,
  type EmployeePasswordResetLog,
  type EmployeePortalAccount,
  upsertEmployeePortalAccount,
} from '../../lib/employeePortalData';
import { mockDatabase } from '../../lib/mockDatabase';
import {
  ensureRecruitmentSeedData,
  getAuthoritativeJobPostings,
  getDeletedJobReports,
  getEmployeeRecordsFromSupabase,
  getJobPostingsFromSupabase,
  loadJobPostings,
  getNewlyHiredFromSupabase,
  getApplicants as getRecruitmentApplicants,
  saveDeletedJobReports,
  saveJobPostings,
  saveNewlyHired,
  resolveDepartmentForPosition,
  type DeletedJobReport,
} from '../../lib/recruitmentData';
import { runSingleFlight, invalidateCacheKey } from '../../lib/singleFlight';
import { mergeLocalSchedules } from '../../lib/applicantSchedule';
import { isMockModeEnabled, supabase } from '../../lib/supabase';
import { hireApplicant } from '../../lib/api/employeesApi';
import { getOfficeDirectory, type OfficeDirectoryRow } from '../../lib/api/officeDirectory';
import {
  EMPLOYEE_DOCUMENTS_UPDATED_EVENT,
  EMPLOYEE_DOCUMENTS_BUCKET,
  listEmployeeDocumentsByType,
  type EmployeeDocumentSubmission as SupabaseEmployeeDocumentSubmission,
  type EmployeeDocumentType,
} from '../../lib/employeeDocuments';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { DocumentCollectionModal } from '../../components/DocumentCollectionModal';
import { sendEmail } from '../../lib/email';
import '../../styles/admin.css';
import type { EmployeeRecord, JobPosting, NewlyHired } from '../../types/recruitment.types';
import { usePlantillaNames } from '../../hooks/usePlantillaNames';
import { internalPlantillaKey } from '../../lib/plantillaRules';
import { SkeletonList, TableSkeletonRows, tableBodyClass, useDelayedLoading } from '../../components/table-loading';
import { Modal } from '../../components/modal';

type JobStatus = 'Open' | 'Reviewing' | 'Closed';
type Section = 'dashboard' | 'jobs' | 'qualified' | 'applicant-score' | 'new-hired' | 'raters' | 'accounts' | 'succession' | 'reports' | 'settings';
type BulkRecipientMode = 'all' | 'department' | 'selected';
type EmployeeDocumentTemplateId = (typeof BULK_REQUEST_TEMPLATES)[number]['id'];
const EMPLOYEE_DIRECTORY_OFFICES_PER_PAGE = 6;

// Session lives in the shared per-tab module so every screen reads one identity.
const getCurrentAdminEmail = (): string => getAdminEmail();

interface JobRecord {
  id: number | string;
  title: string;
  item_number: string;
  department: string;
  status: JobStatus;
  created_at: string;
  applicant_count: number;
  // The full posting this row came from. The dashboard only edits a handful of
  // columns, but it re-persists EVERY row on any change (status toggle, delete),
  // so without carrying the rest of the posting along, qualifications/salary
  // grade/deadline would be overwritten with defaults on every such write.
  posting?: JobPosting;
}

interface ApplicantRecord {
  id: string;
  employeeId?: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  contact_number: string;
  position: string;
  /**
   * The plantilla item number of the posting applied to. This is the real key
   * between an applicant and a job; matching on `position` (the job title)
   * instead double-counts whenever two postings share a title.
   */
  item_number?: string;
  office: string;
  status: string;
  created_at: string;
  /**
   * When this person was actually hired — distinct from created_at, which for
   * an applicant is when they APPLIED. Drives the "Newly Hired" badge in the
   * Office Directory. Left undefined when we have no real hire date on record;
   * the badge is then simply not shown rather than guessed from the wrong date.
   */
  hire_date?: string;
  total_score: number | null;
  qualification_score?: number | null;
  // Schedule fields set by PendingAssignmentList / Rater Management.
  exam_date?: string | null;
  exam_time?: string | null;
  interview_date?: string | null;
  interview_time?: string | null;
  assigned_interviewer_email?: string | null;
  oral_exam_date?: string | null;
  oral_exam_time?: string | null;
  venue?: string | null;
  // Optional metadata used by the assessment-form rendering paths.
  appointmentType?: 'original' | 'promotional';
  positionType?: 'rank-and-file' | 'executive';
  education_level?: string | null;
  years_of_experience?: number | null;
  application_type?: string | null;
}

interface RaterRecord {
  id: number;
  name: string;
  email: string;
  department: string;
  is_active: boolean;
  last_login: string | null;
}

interface BulkRequestEmployee {
  id: string;
  name: string;
  department: string;
}

interface RankingPositionCard {
  position: string;
  department: string;
  itemNumber: string;
  qualifiedCount: number;
}

interface RankingApplicantRow {
  id: string;
  fullName: string;
  email: string;
  position: string;
  department: string;
  total: number;
  experience: number;
  performance: number;
  potential: number;
  written: number;
  interview: number;
}

interface StoredScoringCategory {
  initialScore?: number | null;
  finalScore?: number | null;
}

interface StoredApplicantCategoryScores {
  education?: StoredScoringCategory;
  experience?: StoredScoringCategory;
  performance?: StoredScoringCategory;
  pcpt?: StoredScoringCategory;
  potential?: StoredScoringCategory;
  writtenExam?: StoredScoringCategory;
  oralExam?: StoredScoringCategory;
  appointmentType?: 'original' | 'promotional';
  positionType?: 'rank-and-file' | 'executive';
}

const RSP_CATEGORY_SCORES_KEY = 'cictrix_category_scores';

interface AssessmentPositionCard {
  position: string;
  department: string;
  itemNumber: string;
  totalApplicants: number;
  qualifiedCount: number;
  hiredCount: number;
  disqualifiedCount: number;
}

type AssessmentStatusFilter = 'all' | 'qualified' | 'hired' | 'disqualified';

interface EmployeeDocumentSubmission {
  id: string;
  applicantId: string;
  fullName: string;
  employeeCode: string;
  position: string;
  office: string;
  submittedDate: string;
  status: 'Approved' | 'Pending' | 'Rejected';
  documentUrl: string;
  documentType: string;
  fileName?: string;
  fileType?: string | null;
}

const BULK_REQUEST_TEMPLATES = [
  {
    id: 'nbi',
    name: 'NBI Clearance',
    description: 'Updated NBI Clearance (must be valid for current year)',
  },
  {
    id: 'medical',
    name: 'Medical Certificate',
    description: 'Recent medical certificate issued by an accredited clinic or hospital',
  },
  {
    id: 'saln',
    name: 'SALN (Statement of Assets, Liabilities and Net Worth)',
    description: 'Latest signed SALN form based on agency template',
  },
  {
    id: 'training',
    name: 'Certificate of Training',
    description: 'Certificate for completed mandatory orientation or skills training',
  },
  {
    id: 'pef',
    name: 'Performance Evaluation Form',
    description: 'Completed and signed latest performance evaluation form',
  },
  {
    id: 'resume',
    name: 'Updated Resume/CV',
    description: 'Most recent resume with updated work experience and credentials',
  },
] as const;

const SETTINGS_TABS = [
  { id: 'profile', label: 'Profile Settings', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'system', label: 'System Settings', icon: Settings },
  { id: 'email', label: 'Email Configuration', icon: Mail },
  { id: 'appearance', label: 'Appearance', icon: Briefcase },
  { id: 'localization', label: 'Localization', icon: Building2 },
] as const;

/**
 * Office names are compared across sources that don't agree on casing/spacing
 * (departments table vs. the office stored on an applicant), so match on a
 * normalized form rather than a raw ===.
 */
const normalizeOfficeName = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const EMPLOYEE_DIRECTORY_POSITIONS_BY_DEPARTMENT: Record<string, string[]> = {
  'Information Technology': [
    'Information Technology Officer I',
    'Information Technology Officer II',
    'Information Technology Officer III',
    'Senior IT Officer',
    'IT Manager',
  ],
  'Human Resources': ['HR Officer I', 'HR Officer II', 'Senior HR Officer'],
  'Finance': ['Accountant I', 'Accountant II', 'Finance Officer'],
  'Operations': ['Administrative Assistant', 'Operations Assistant', 'Operations Manager', 'Project Coordinator'],
  'Sales & Marketing': [],
  'Customer Support': [],
  'Product Management': [],
};

const ALL_EMPLOYEE_POSITIONS = Array.from(
  new Set([
    ...Object.values(EMPLOYEE_DIRECTORY_POSITIONS_BY_DEPARTMENT).flat(),
    'Administrative Officer',
    'Human Resource Specialist',
    'IT Specialist',
    'Accountant',
    'Budget Officer',
    'Project Coordinator',
    'Data Analyst',
  ])
).sort();

type SuccessionView = 'plan' | 'eligibility-points';

/** Succession Planning sub-tabs (DESIGN_IDENTITY §9.2, as in Job Posts). */
const SUCCESSION_TABS = [
  { id: 'plan', label: 'Succession Plan', icon: GitBranch },
  { id: 'eligibility-points', label: 'Eligibility Points', icon: ListChecks },
] as const;

const resolveSection = (pathname: string, search: string): Section => {
  if (pathname === '/admin/rsp/jobs' || pathname === '/admin/rsp/applications') return 'jobs';
  if (pathname === '/admin/rsp/qualified') return 'qualified';
  if (pathname === '/admin/rsp/applicant-score') return 'applicant-score';
  if (pathname === '/admin/rsp/new-hired') return 'new-hired';
  if (pathname === '/admin/rsp/raters' || pathname === '/admin/raters') return 'raters';
  if (pathname === '/admin/rsp/accounts') return 'accounts';
  if (pathname === '/admin/rsp/succession') return 'succession';
  if (pathname === '/admin/rsp/reports') return 'reports';
  if (pathname === '/admin/rsp/settings' || pathname === '/admin/settings') return 'settings';

  const module = new URLSearchParams(search).get('module');
  if (pathname === '/admin' && module === 'rsp') return 'dashboard';

  return 'dashboard';
};

const formatDate = (dateValue: string) => {
  if (!dateValue) return '--';
  return new Date(dateValue).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/** How long a new hire keeps the "Newly Hired" badge in the Office Directory. */
const NEWLY_HIRED_BADGE_DAYS = 14;
/** Archive record key prefix for a deleted job post's preserved report. */
const DELETED_JOB_KEY = 'deleted:';

/**
 * True for the two weeks following someone's hire date. Returns false when the
 * hire date is missing, unparseable, or in the future — we would rather show no
 * badge than a wrong one.
 */
const isNewlyHired = (hireDate: string | null | undefined): boolean => {
  if (!hireDate) return false;
  const hired = new Date(hireDate);
  if (Number.isNaN(hired.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  hired.setHours(0, 0, 0, 0);

  const daysSinceHire = Math.floor((today.getTime() - hired.getTime()) / 86400000);
  return daysSinceHire >= 0 && daysSinceHire < NEWLY_HIRED_BADGE_DAYS;
};

type FunnelStage = 'pending' | 'reviewed' | 'shortlisted' | 'qualified' | 'hired' | 'notQualified' | 'hiredElsewhere';

/**
 * Place an applicant in exactly ONE funnel stage.
 *
 * Delegates to the workflow module rather than matching substrings. The tests
 * this used to do mis-stated the pipeline badly: "Not Qualified" matched
 * 'qualif' and was counted as QUALIFIED, and "Hired" fell through every bucket
 * and disappeared from the funnel entirely. Those cases are now pinned by
 * tests in applicantStatus.test.ts against the values production really holds.
 *
 * The stage names here are the dashboard's own, kept because the bar labels and
 * colours are keyed on them; funnelBucket's names are the workflow's.
 */
const BUCKET_TO_STAGE: Record<FunnelBucket, FunnelStage> = {
  pending: 'pending',
  screening: 'reviewed',
  assessment: 'shortlisted',
  qualified: 'qualified',
  selected: 'hired',
  closed: 'notQualified',
  withdrawn: 'hiredElsewhere',
};

const funnelStageOf = (rawStatus: string): FunnelStage => {
  const status = normalizeStatus(rawStatus);
  // An unmapped value still has to appear somewhere, or an applicant vanishes
  // from a count that claims to total everyone. Showing it as awaiting first
  // touch surfaces it for attention; it does not change what is stored.
  if (status === null) return 'pending';
  return BUCKET_TO_STAGE[funnelBucket(status)];
};

const mapRecruitmentPostingsToDashboardJobs = (rows: JobPosting[]): JobRecord[] => {
  return rows.map((item) => ({
    id: item.id,
    title: String(item.title ?? ''),
    item_number: String(item.jobCode ?? ''),
    department: String(item.department ?? 'Unassigned'),
    status:
      item.status === 'Closed'
        ? 'Closed'
        : item.status === 'Draft'
          ? 'Reviewing'
          : 'Open',
    created_at: String(item.postedDate ?? new Date().toISOString()),
    applicant_count: Number(item.applicantCount ?? 0),
    posting: item,
  }));
};

const persistDashboardJobsToRecruitment = (rows: JobRecord[]) => {
  const nowIso = new Date().toISOString();
  const mapped: JobPosting[] = rows.map((row, index) => {
    const base = row.posting;
    return {
      // Preserve everything the dashboard doesn't edit. Only the columns the
      // dashboard actually owns are overwritten below.
      ...(base ?? {}),
      id: String(row.id ?? base?.id ?? crypto.randomUUID()),
      jobCode: row.item_number || base?.jobCode || `ABYAN-2026-${String(index + 1).padStart(3, '0')}`,
      title: row.title,
      department: row.department || base?.department || 'Operations',
      division: base?.division,
      positionType: base?.positionType ?? 'Civil Service',
      numberOfPositions: base?.numberOfPositions ?? 1,
      employmentStatus: base?.employmentStatus ?? 'Permanent',
      summary: base?.summary ?? '',
      responsibilities: base?.responsibilities ?? [],
      qualifications: base?.qualifications ?? {
        education: '',
        experience: { years: 0, field: '' },
        skills: [],
        certifications: [],
      },
      requiredDocuments: base?.requiredDocuments ?? [],
      applicationDeadline: base?.applicationDeadline ?? '',
      status: row.status === 'Closed' ? 'Closed' : row.status === 'Reviewing' ? 'Draft' : 'Active',
      postedDate: row.created_at || base?.postedDate || nowIso,
      postedBy: base?.postedBy ?? 'HR Admin',
      applicantCount: row.applicant_count ?? 0,
      qualifiedCount: base?.qualifiedCount ?? 0,
    };
  });

  saveJobPostings(mapped);
};

// Status → colour follows DESIGN_IDENTITY.md §10. Negatives are checked first:
// "disqualified" contains "qualified" and must not render green.
const getStatusClass = (status: string) => {
  const lowered = status.toLowerCase();
  if (lowered.includes('disqualif') || lowered.includes('reject') || lowered.includes('cancel')) return 'bg-red-100 text-red-700';
  if (lowered.includes('open')) return 'bg-green-100 text-green-700';
  if (lowered.includes('review') || lowered.includes('interview') || lowered.includes('pending')) return 'bg-amber-100 text-amber-700';
  if (lowered.includes('closed')) return 'bg-slate-100 text-slate-700';
  if (lowered.includes('qualified') || lowered.includes('completed') || lowered.includes('hired')) return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-700';
};

const applicantNameFromRow = (row: any) => {
  if (typeof row?.name === 'string' && row.name.trim().length > 0) return row.name;
  const first = row?.first_name ?? '';
  const middle = row?.middle_name ?? '';
  const last = row?.last_name ?? '';
  return `${first} ${middle} ${last}`.replace(/\s+/g, ' ').trim() || 'Unnamed Applicant';
};

const toAssessmentStatusBucket = (status: string): AssessmentStatusFilter | 'other' => {
  const normalized = (status || '').toLowerCase();
  if (normalized.includes('hired') || normalized.includes('accept')) return 'hired';
  if (normalized.includes('disqual') || normalized.includes('reject')) return 'disqualified';
  if (normalized.includes('qualified') || normalized.includes('shortlist') || normalized.includes('recommend')) return 'qualified';
  return 'other';
};

const normalizeTextValue = (value: string) => value.trim().toLowerCase();

const documentTypeKeywordsByTemplate: Record<EmployeeDocumentTemplateId, string[]> = {
  nbi: ['nbi'],
  medical: ['medical', 'med cert', 'medical certificate'],
  saln: ['saln', 'statement of assets', 'liabilities'],
  training: ['training', 'certificate of training'],
  pef: ['performance', 'evaluation'],
  resume: ['resume', 'cv'],
};

const matchesDocumentTemplate = (templateId: EmployeeDocumentTemplateId, documentType: string) => {
  const normalizedType = normalizeTextValue(documentType);
  const keywords = documentTypeKeywordsByTemplate[templateId] || [];
  return keywords.some((keyword) => normalizedType.includes(keyword));
};

/**
 * Bridge between the short card id (used in URL/UI state) and the canonical
 * document_type value stored in Supabase / used by the Employee Portal upload flow.
 */
const TEMPLATE_ID_TO_DOCUMENT_TYPE: Record<EmployeeDocumentTemplateId, EmployeeDocumentType> = {
  nbi: 'NBI Clearance',
  medical: 'Medical Certificate',
  saln: 'SALN',
  training: 'Certificate of Training',
  pef: 'Performance Evaluation Form',
  resume: 'Updated Resume/CV',
};

const getPreferredClient = () => {
  const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
  return preferredMode === 'local' ? (mockDatabase as any) : supabase;
};

const getAccessClient = () => {
  // Access toggles should use the real rater DB when Supabase is configured.
  return isMockModeEnabled ? (mockDatabase as any) : supabase;
};
const RATER_ACCESS_STATE_KEY = 'cictrix_rater_access_state_map';

const saveRaterAccessState = (email: string, isActive: boolean) => {
  try {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const raw = localStorage.getItem(RATER_ACCESS_STATE_KEY);
    const current = raw ? JSON.parse(raw) : {};
    const next = current && typeof current === 'object' ? { ...current } : {};
    next[normalizedEmail] = isActive;
    localStorage.setItem(RATER_ACCESS_STATE_KEY, JSON.stringify(next));
  } catch { /* localStorage unavailable (private mode or quota); persisting here is best-effort. */ }
};

const runRaterEmailUpdate = async (
  client: any,
  updates: Record<string, unknown>,
  email: string,
  anchorId?: number | string
) => {
  const normalizedEmail = normalizeEmailKey(email);
  const { data, error } = await client.from('raters').select('id,email');
  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const matchedIds = rows
    .filter((row: any) => String(row?.email ?? '').trim().toLowerCase() === normalizedEmail)
    .map((row: any) => String(row?.id ?? '').trim())
    .filter(Boolean);

  const normalizedAnchorId = String(anchorId ?? '').trim();
  if (normalizedAnchorId && !matchedIds.includes(normalizedAnchorId)) {
    matchedIds.push(normalizedAnchorId);
  }

  if (matchedIds.length === 0) {
    throw new Error('No matching rater account found for update.');
  }

  const updateResults = await Promise.all(
    matchedIds.map((id) => client.from('raters').update(updates).eq('id', id))
  );

  const allFailed = updateResults.every((result: any) => Boolean(result?.error));
  if (allFailed) {
    throw new Error('Failed to persist rater access update.');
  }
};

const verifyRaterAccessState = async (client: any, email: string, expectedIsActive: boolean) => {
  const normalizedEmail = normalizeEmailKey(email);
  const { data, error } = await client.from('raters').select('id,email,is_active');
  if (error) {
    throw error;
  }

  const rows = (Array.isArray(data) ? data : []).filter(
    (row: any) => String(row?.email ?? '').trim().toLowerCase() === normalizedEmail
  );

  if (rows.length === 0) {
    throw new Error('No matching rater account found after update.');
  }

  const mismatch = rows.some((row: any) => Boolean(row?.is_active) !== expectedIsActive);
  if (mismatch) {
    throw new Error('Rater access update did not persist for all matching rows.');
  }
};

const normalizeEmailKey = (email: string) => email.trim().toLowerCase();

const deriveEvaluationTotalScore = (row: any): number => {
  if (typeof row?.overall_score === 'number' && row.overall_score > 0) {
    return Number(row.overall_score);
  }

  const oralScores = [
    row?.communication_skills_score,
    row?.confidence_score,
    row?.comprehension_score,
    row?.personality_score,
    row?.job_knowledge_score,
    row?.overall_impression_score,
  ];

  const numeric = oralScores.filter((value) => typeof value === 'number') as number[];
  if (numeric.length === 0) return 0;
  const total = numeric.reduce((sum, value) => sum + value, 0);
  return Number(Math.min(100, Math.max(0, Math.round((total / 30) * 100))));
};

// Scoring conversion tables








const loadStoredCategoryScores = (): Record<string, StoredApplicantCategoryScores> => {
  try {
    const raw = localStorage.getItem(RSP_CATEGORY_SCORES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};





const getSavedScoredApplicantIdSet = (): Set<string> => {
  const scores = loadStoredCategoryScores();
  return new Set(
    Object.entries(scores)
      .filter(([, value]) => hasFinalizedCategoryScores(value))
      .map(([applicantId]) => applicantId)
  );
};

const resolveScoreValue = (category?: StoredScoringCategory): number => {
  const finalValue = typeof category?.finalScore === 'number' ? category.finalScore : null;
  if (finalValue !== null) return finalValue;
  return typeof category?.initialScore === 'number' ? category.initialScore : 0;
};

const pcptRawToConverted = (raw: number): number => {
  if (raw >= 35) return 20;
  if (raw >= 32) return 18;
  if (raw >= 29) return 16;
  if (raw >= 26) return 14;
  if (raw >= 23) return 12;
  if (raw >= 20) return 10;
  return Number(Math.max(0, Math.min(20, (raw / 30) * 20)).toFixed(2));
};

// Rater assigned_positions live exclusively in Supabase (raters.assigned_positions).
// No local cache — every read goes through the DB.

export const RSPDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const section = resolveSection(location.pathname, location.search);

  // The parent only reads the recruitment snapshot for the sections that
  // render it. Succession's two views load their own data, so they skip both
  // the reads and the realtime subscriptions below (and every section-scoped
  // loader further down). Rater Management renders this shell as `raters`.
  const loadsRecruitmentData =
    section === 'dashboard' ||
    section === 'accounts' ||
    section === 'reports' ||
    section === 'raters';
  const loadsNewlyHired = section === 'accounts' || section === 'reports';
  const loadsAccountData = section === 'accounts';

  // Plantilla names for posting/application rows (never their internal keys).
  // Only the legacy Jobs branch prints a plantilla summary.
  const { summaryForPosting } = usePlantillaNames(section === 'jobs');

  // Live updates: both events feed the dashboard's existing syncJobs reload.
  useRealtimeRefresh({
    channel: 'rsp-dashboard-postings',
    tables: ['job_postings'],
    onChange: () => { void loadJobPostings(); },
    enabled: loadsRecruitmentData,
  });
  useRealtimeRefresh({
    channel: 'rsp-dashboard-applicants',
    tables: ['applicants', 'evaluations'],
    onChange: () => { window.dispatchEvent(new CustomEvent('cictrix:applicants-updated')); },
    enabled: loadsRecruitmentData,
  });

  // Which succession view is showing: the ranked plan (default), or the points
  // that produce its Eligibility column (?view=eligibility-points). Kept in the
  // URL like Job Posts' tab, so refresh and Back keep it.
  const successionView: SuccessionView =
    new URLSearchParams(location.search).get('view') === 'eligibility-points' ? 'eligibility-points' : 'plan';
  const setSuccessionView = (view: SuccessionView) =>
    navigate({ pathname: location.pathname, search: view === 'plan' ? '' : `?view=${view}` });

  // Departments come from the canonical Supabase table, shared system-wide.
  // Only the Accounts views render a department dropdown.
  const employeeDirectoryDepartments = useDepartmentNames(loadsAccountData);

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [applicants, setApplicants] = useState<ApplicantRecord[]>([]);
  // Written Exam total points per position, for the printed assessment form.
  const [examTotals, setExamTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    if (section !== 'reports') return;
    let cancelled = false;
    void fetchWrittenExamTotals().then((result) => { if (!cancelled) setExamTotals(result.totals); });
    return () => { cancelled = true; };
  }, [section]);
  // Applicants with at least one scored evaluation; the dashboard uses it to
  // flag interviews that were held but never scored.
  const [evaluatedApplicantIds, setEvaluatedApplicantIds] = useState<Set<string>>(new Set());
  const [raters, setRaters] = useState<RaterRecord[]>([]);
  const [deletedJobReports, setDeletedJobReports] = useState<DeletedJobReport[]>([]);
  const [completedEvaluationIds, setCompletedEvaluationIds] = useState<Set<string>>(new Set());

  const [jobsSearch, setJobsSearch] = useState('');
  const [jobsStatus, setJobsStatus] = useState('all');
  const [jobsOffice, setJobsOffice] = useState('all');
  const [jobsPage, setJobsPage] = useState(0);

  const [reportsView, setReportsView] = useState<'overview' | 'documents'>('overview');
  const [activeRankingPosition, setActiveRankingPosition] = useState<string | null>(null);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [showHireApplicantsModal, setShowHireApplicantsModal] = useState(false);
  const [selectedHireApplicantIds, setSelectedHireApplicantIds] = useState<string[]>([]);
  const [activeAssessmentPosition, setActiveAssessmentPosition] = useState<string | null>(null);
  const [showAssessmentFormsModal, setShowAssessmentFormsModal] = useState(false);
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState<AssessmentStatusFilter>('all');
  const [assessmentSearch, setAssessmentSearch] = useState('');
  const [, setRankingPositionFilter] = useState<string>('all');
  const [activeDocumentTemplateId, setActiveDocumentTemplateId] = useState<EmployeeDocumentTemplateId | null>(null);
  const [expandedDocumentOffices, setExpandedDocumentOffices] = useState<Record<string, boolean>>({});
  const [selectedDocumentSubmissionIds, setSelectedDocumentSubmissionIds] = useState<string[]>([]);
  const [previewSubmission, setPreviewSubmission] = useState<EmployeeDocumentSubmission | null>(null);
  const [documentCollection, setDocumentCollection] = useState<EmployeeDocumentSubmission[] | null>(null);

  const [raterSearch, setRaterSearch] = useState('');
  const [raterStatus, setRaterStatus] = useState('all');
  const [raterAssignedPositionsByEmail, setRaterAssignedPositionsByEmail] = useState<Record<string, string[]>>({});
  const [accountsView, setAccountsView] = useState<'directory' | 'office' | 'details'>('directory');
  const [employeeDirectoryPage, setEmployeeDirectoryPage] = useState(0);
  const [officeDirectoryRows, setOfficeDirectoryRows] = useState<OfficeDirectoryRow[]>([]);
  const [officeDirectoryLoading, setOfficeDirectoryLoading] = useState(false);
  const showOfficeDirectoryLoader = useDelayedLoading(officeDirectoryLoading);
  const [officeDirectoryError, setOfficeDirectoryError] = useState('');
  const [selectedDirectoryCard, setSelectedDirectoryCard] = useState<{ office: string } | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employeeDetailsTab, setEmployeeDetailsTab] = useState<'personal' | 'documents'>('personal');
  const [showPositionChangeModal, setShowPositionChangeModal] = useState(false);

  // Browser Back steps out of one drill-down level at a time.
  useBackClosesView(accountsView !== 'directory', () => setAccountsView('directory'), 'acct-office');
  useBackClosesView(accountsView === 'details', () => setAccountsView('office'), 'acct-details');
  useBackClosesView(reportsView !== 'overview', () => { setReportsView('overview'); setActiveDocumentTemplateId(null); }, 'archives-view');

  // Reset password flow for the Employee Accounts detail panel
  const [resetPwState, setResetPwState] = useState<'idle' | 'confirm' | 'working' | 'done' | 'error'>('idle');
  const [resetPwUsername, setResetPwUsername] = useState<string | null>(null);
  const [resetPwValue, setResetPwValue] = useState<string | null>(null);
  const [resetPwError, setResetPwError] = useState<string | null>(null);
  // The live applicants read failed on the last load (see the main load).
  const [liveDataError, setLiveDataError] = useState<unknown>(null);
  const [officeDirectoryAttempt, setOfficeDirectoryAttempt] = useState(0);
  const feedback = useFeedback();
  const [lastResetInfo, setLastResetInfo] = useState<EmployeePasswordResetLog | null>(null);

  // Prefer matching by email (most authoritative since it's per-person), then by employee_number.
  const findExistingPortalAccountForEmployee = async (details: ApplicantRecord): Promise<EmployeePortalAccount | null> => {
    const empNumber = String(
      details.employeeId ?? employeeNumberById.get(details.id) ?? '',
    ).trim();
    const empEmail = String((details as any).email ?? '').trim().toLowerCase();
    const accounts = getEmployeePortalAccounts();

    const localMatch = (
      (empEmail
        ? accounts.find((a) => String(a.employee.email ?? '').trim().toLowerCase() === empEmail)
        : null)
      ?? (empNumber
        ? accounts.find((a) => String(a.employee.employeeId ?? '').trim() === empNumber)
        : null)
      ?? null
    );
    if (localMatch) return localMatch;

    if (!empEmail && !empNumber) return null;

    return await findEmployeePortalAccountFromSupabaseByEmployeeIdOrEmail(empNumber || undefined, empEmail || undefined);
  };

  const openResetPwModal = async () => {
    setResetPwState('confirm');
    setResetPwError(null);
    setLastResetInfo(null);
    if (!selectedEmployeeDetails) return;
    const existingAccount = await findExistingPortalAccountForEmployee(selectedEmployeeDetails);
    if (!existingAccount) return;
    const lastReset = await getLastEmployeePasswordReset(existingAccount.id);
    setLastResetInfo(lastReset);
  };

  const handleResetEmployeePasswordConfirm = async () => {
    if (!selectedEmployeeDetails) {
      setResetPwError('No employee selected.');
      setResetPwState('error');
      return;
    }

    setResetPwState('working');
    setResetPwError(null);

    try {
      const empNumber = String(
        selectedEmployeeDetails.employeeId
        ?? employeeNumberById.get(selectedEmployeeDetails.id)
        ?? '',
      ).trim();
      const empEmail = String((selectedEmployeeDetails as any).email ?? '').trim().toLowerCase();
      const detailFirstName = String(selectedEmployeeDetails.first_name ?? '').trim();
      const detailLastName = String(selectedEmployeeDetails.last_name ?? '').trim();
      const fullName = (detailFirstName || detailLastName)
        ? `${detailFirstName} ${detailLastName}`.trim()
        : String(selectedEmployeeDetails.full_name ?? '').trim();
      const firstName = detailFirstName || fullName.split(' ')[0] || '';
      const lastName = detailLastName
        || (fullName.split(' ').length > 1 ? fullName.split(' ').slice(1).join(' ') : '');
      const fullNameNormalized = fullName.toLowerCase();

      const accounts = getEmployeePortalAccounts();
      const existingAccount = await findExistingPortalAccountForEmployee(selectedEmployeeDetails);

      // Build the username that should be assigned to the *current* employee.
      // Sanitize the same way createUniqueUsername does so we can compare apples-to-apples.
      const sanitize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
      const expectedBase = `${sanitize(firstName)}${sanitize(lastName)}`;

      if (!existingAccount && !expectedBase) {
        setResetPwError(
          `No employee-portal account exists for ${empNumber || empEmail || 'this employee'} ` +
          `and no first/last name available to create one. Generate credentials from Newly Hired first.`,
        );
        setResetPwState('error');
        return;
      }

      // Decide which username to assign:
      //   1) If the account exists and its username matches the current employee's name → keep it.
      //   2) Otherwise (stale account from a different employee, or missing) → regenerate from the
      //      current first/last name, ensuring it doesn't collide with other accounts.
      let username = existingAccount?.username ?? '';
      const usernameMatchesCurrent =
        Boolean(username) &&
        (
          sanitize(username) === expectedBase ||
          sanitize(username).startsWith(expectedBase) // tolerates johnsmith1, johnsmith2, etc.
        );

      if (!usernameMatchesCurrent) {
        const occupied = new Set(
          accounts
            .filter((a) => a !== existingAccount) // don't count the slot we're about to overwrite
            .map((a) => a.username.toLowerCase()),
        );
        username = createUniqueUsername(firstName || 'employee', lastName || empNumber || 'user', occupied);
      }

      const newPassword = createPassword();

      const baseEmployee = existingAccount?.employee ?? {
        employeeId: empNumber,
        fullName: `${firstName} ${lastName}`.trim() || username,
        email: empEmail,
        dateOfBirth: '',
        age: 0,
        gender: 'Prefer not to say' as const,
        civilStatus: 'Single' as const,
        nationality: 'Filipino',
        mobileNumber: String((selectedEmployeeDetails as any).phone ?? '').trim(),
        homeAddress: '',
        emergencyContactName: '',
        emergencyRelationship: '',
        emergencyContactNumber: '',
        sssNumber: '',
        philhealthNumber: '',
        pagibigNumber: '',
        tinNumber: '',
        currentPosition: String((selectedEmployeeDetails as any).position ?? '').trim(),
        currentDepartment: String((selectedEmployeeDetails as any).office ?? (selectedEmployeeDetails as any).department ?? '').trim(),
        positionHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Always realign the stored profile to the *current* employee's identifiers so
      // the portal account never drifts from who the row actually represents.
      const realignedEmployee = {
        ...baseEmployee,
        employeeId: empNumber || baseEmployee.employeeId,
        fullName: `${firstName} ${lastName}`.trim() || baseEmployee.fullName,
        email: empEmail || baseEmployee.email,
      };

      const accountId = existingAccount?.id ?? `employee-account-${empNumber || username}`;

      const saved = await upsertEmployeePortalAccount({
        id: accountId,
        username,
        password: newPassword,
        employee: realignedEmployee,
        mustChangePassword: true,
      });
      // The employee signs in against the database copy; until it is stored,
      // the new password only works in this browser.
      if (!saved.ok) {
        setResetPwError(`${failureText('reset the password', saved.error)} The employee can't sign in with the new password yet.`);
        setResetPwState('error');
        return;
      }

      // Sanity-check the new credential pair authenticates.
      const verify = findEmployeePortalAccount(username, newPassword);
      if (!verify) {
        setResetPwError("We couldn't confirm the new password. It may not be active yet. Try resetting it again.");
        setResetPwState('error');
        return;
      }

      // Note: fullNameNormalized is only used here to keep ESLint quiet about the local.
      void fullNameNormalized;

      await logEmployeePasswordReset({
        accountId,
        username,
        employeeNumber: empNumber || undefined,
        resetBy: getCurrentAdminEmail(),
      });

      setResetPwUsername(username);
      setResetPwValue(newPassword);
      setResetPwState('done');
    } catch (error) {
      console.error('handleResetEmployeePasswordConfirm: failed', error);
      setResetPwError(failureText('reset the password', error));
      setResetPwState('error');
    }
  };

  const closeResetPwModal = () => {
    setResetPwState('idle');
    setResetPwUsername(null);
    setResetPwValue(null);
    setResetPwError(null);
    setLastResetInfo(null);
  };

  const copyResetPwValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      feedback.success('Copied', 'Paste it where you need it.');
    } catch (error) {
      console.warn('clipboard write failed', error);
      feedback.warning("We couldn't copy it.", 'Your browser blocked the clipboard. Select the text and copy it yourself.');
    }
  };
  const [savedScoredApplicantIds, setSavedScoredApplicantIds] = useState<Set<string>>(getSavedScoredApplicantIdSet);
  const [positionChangeForm, setPositionChangeForm] = useState({
    changeType: 'promotion' as 'promotion' | 'succession' | 'transfer',
    newDepartment: 'IT Department',
    newPosition: '',
    effectiveDate: '',
    notes: '',
  });

  const [showJobDialog, setShowJobDialog] = useState(false);
  const [showRaterDialog, setShowRaterDialog] = useState(false);
  const [showBulkRequestDialog, setShowBulkRequestDialog] = useState(false);

  const [bulkRequestForm, setBulkRequestForm] = useState({
    documentName: '',
    description: '',
    dueDate: '',
    recipientMode: 'all' as BulkRecipientMode,
    department: '',
    selectedEmployeeIds: [] as string[],
    templateFileName: '',
  });

  const EMPTY_NEW_JOB = {
    title: '',
    item_number: '',
    department: '',
    status: 'Open' as JobStatus,
    position_level: '',
    slots: '1',
    employment_type: 'Full-time',
    application_deadline: '',
    description: '',
    responsibilities: '',
    // Structured CSC Qualification Standards. These used to be one free-text
    // blob that was thrown away on save; they now persist to job_postings
    // (migration 021) and drive both the portal's Qualifications panel and the
    // applicant gap analysis.
    salary_grade: '',
    education_requirement: '',
    education_field: '',
    experience_years: '',
    experience_field: '',
    training_requirement: '',
    eligibility: '',
    required_skills: '',
  };

  const [newJob, setNewJob] = useState(EMPTY_NEW_JOB);

  const [newRater, setNewRater] = useState({
    name: '',
    email: '',
    department: '',
  });

  const [raterAccessForm, setRaterAccessForm] = useState({
    raterName: '',
    accessLevel: 'Interviewer',
    assignedPositions: [] as string[],
    startDate: '',
    endDate: '',
  });

  const [settingsTab, setSettingsTab] = useState<(typeof SETTINGS_TABS)[number]['id']>('profile');
  const [profileForm] = useState({
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    email: 'juan.delacruz@iloilo.gov.ph',
    role: 'RSP',
    department: 'Human Resource Management Office',
    bio: '',
  });

  useEffect(() => {
    if (!loadsRecruitmentData) return;

    let inFlight = false;
    let pending = false;
    let disposed = false;

    const load = async () => {
      ensureRecruitmentSeedData();
      void fetchApplicantCategoryScores();
      setDeletedJobReports(getDeletedJobReports());

      // Assignments load from Supabase below (raters.assigned_positions).
      // No localStorage seed — start empty so a stale browser cache can't
      // leak into the UI before the DB fetch resolves.
      setRaterAssignedPositionsByEmail({});

      // CRITICAL: Always fetch applicants from Supabase (as per user requirement: "all datas must be stored in supabase")
      const primaryClient = supabase; // Always use Supabase for applicants
      const secondaryClient = (mockDatabase as any); // Fallback only if Supabase fails

      // The shared recruitment snapshot. `job_postings`/`jobs` used to be read
      // here too and thrown away; canonical postings are loaded below through
      // getJobPostingsFromSupabase, which also maps plantilla slots.
      const fetchBundle = async (client: any, cacheKey: string) =>
        runSingleFlight(
          cacheKey,
          () =>
            Promise.allSettled([
              client.from('applicants').select('*').order('created_at', { ascending: false }),
              client.from('raters').select('*').order('created_at', { ascending: false }),
              client.from('evaluations').select('*'),
            ]),
          1200,
        );

      let [applicantsRes, ratersRes, evaluationsRes] = await fetchBundle(
        primaryClient,
        `rsp-dashboard:recruitment:primary` // Always use supabase cache key
      );
      if (disposed) return;

      const primaryRaters =
        ratersRes.status === 'fulfilled' && !ratersRes.value.error && Array.isArray(ratersRes.value.data)
          ? ratersRes.value.data
          : [];

      const primaryApplicantsFetchSucceeded =
        applicantsRes.status === 'fulfilled' && !applicantsRes.value.error && Array.isArray(applicantsRes.value.data);

      // Say when the live read failed: the fallback below is the local mock
      // store, so the page would otherwise show sample records as real ones.
      setLiveDataError(primaryApplicantsFetchSucceeded
        ? null
        : (applicantsRes.status === 'rejected' ? applicantsRes.reason : applicantsRes.value.error) ?? 'Applicants could not be read');

      // Fallback only on fetch failure. Empty DB results are authoritative.
      if (!primaryApplicantsFetchSucceeded) {
        [applicantsRes, ratersRes, evaluationsRes] = await fetchBundle(
          secondaryClient,
          `rsp-dashboard:recruitment:secondary`
        );
        if (disposed) return;
      }

      // CRITICAL: Fetch job postings from Supabase first (source of truth), fallback to localStorage
      let canonicalJobPostings = await getJobPostingsFromSupabase();
      if (disposed) return;
      if (canonicalJobPostings.length === 0) {
        console.log('[RSP] No jobs from Supabase, falling back to localStorage');
        canonicalJobPostings = getAuthoritativeJobPostings();
      } else {
        console.log('[RSP] ✓ Loaded', canonicalJobPostings.length, 'jobs from Supabase');
      }

      const canonicalJobs = mapRecruitmentPostingsToDashboardJobs(canonicalJobPostings);
      setJobs(canonicalJobs);

      if (applicantsRes.status === 'fulfilled' && !applicantsRes.value.error && Array.isArray(applicantsRes.value.data)) {
        const recruitmentApplicants = getRecruitmentApplicants();
        const recruitmentById = new Map(recruitmentApplicants.map((entry) => [String(entry.id), entry]));
        const recruitmentByEmail = new Map(
          recruitmentApplicants
            .map((entry) => [normalizeEmailKey(entry.personalInfo.email || ''), entry] as const)
            .filter(([email]) => Boolean(email))
        );

        const evaluationBestScore = new Map<string, number>();
        const evaluationsByApplicantId = new Map<string, any>();

        console.log('[RSP] Evaluations response status:', evaluationsRes.status);
        if (evaluationsRes.status === 'fulfilled' && !evaluationsRes.value.error && Array.isArray(evaluationsRes.value.data)) {
          console.log('[RSP] ✓ Evaluations fetched, count:', evaluationsRes.value.data.length);
          evaluationsRes.value.data.forEach((e: any) => {
            console.log('[RSP] Raw evaluation - applicant_id:', e.applicant_id, 'name:', e.interviewer_name, 'email:', e.email, 'scores:', {
              personality: e.personality_score,
              comm: e.communication_skills_score,
              conf: e.confidence_score,
              comp: e.comprehension_score,
              job_k: e.job_knowledge_score,
              overall: e.overall_impression_score
            });
          });

          evaluationsRes.value.data.forEach((item: any) => {
            const applicantId = String(item?.applicant_id ?? '').trim();
            if (!applicantId) {
              console.log('[RSP] Skipping evaluation with no applicant_id');
              return;
            }
            const score = deriveEvaluationTotalScore(item);

            const hasScore =
              score > 0 ||
              (typeof item?.overall_score === 'number' && item.overall_score > 0) ||
              (typeof item?.overall_impression_score === 'number' && item.overall_impression_score > 0) ||
              (typeof item?.personality_score === 'number' && item.personality_score > 0);

            if (score > 0) {
              const current = evaluationBestScore.get(applicantId) ?? 0;
              if (score >= current) {
                evaluationBestScore.set(applicantId, score);
                evaluationsByApplicantId.set(applicantId, item);
              }
            }

            if (!hasScore) return;
          });
          console.log('[RSP] ✓ Evaluations stored in map, count:', evaluationsByApplicantId.size);
        } else {
          console.log('[RSP] ✗ Evaluations fetch failed or no data. Status:', evaluationsRes.status, 'Error:', evaluationsRes.status === 'fulfilled' ? evaluationsRes.value.error : 'pending/rejected');
        }

        const normalized = applicantsRes.value.data.map((item: any) => {
          const applicantId = String(item?.id ?? crypto.randomUUID());
          const emailKey = normalizeEmailKey(String(item?.email ?? ''));
          const recruitmentMatchById = applicantId ? recruitmentById.get(applicantId) : undefined;
          const recruitmentMatchByEmail = emailKey ? recruitmentByEmail.get(emailKey) : undefined;
          const recruitmentMatch = recruitmentMatchById ?? recruitmentMatchByEmail;

          const rawDbScore = typeof item?.total_score === 'number' ? item.total_score : 0;
          const evalScore = applicantId ? (evaluationBestScore.get(applicantId) ?? 0) : 0;
          const recruitmentScoreById = applicantId ? Number(recruitmentById.get(applicantId)?.qualificationScore ?? 0) : 0;
          const recruitmentScoreByEmail = emailKey ? Number(recruitmentByEmail.get(emailKey)?.qualificationScore ?? 0) : 0;
          const resolvedScore = Math.max(rawDbScore, evalScore, recruitmentScoreById, recruitmentScoreByEmail);

          const dbStatus = String(item?.status ?? 'Pending');
          const recruitmentStatus = String(recruitmentMatch?.status ?? '').trim();
          const resolvedStatus =
            recruitmentStatus.length > 0
              ? recruitmentStatus
              : dbStatus;

          return {
            id: applicantId,
            full_name: applicantNameFromRow(item),
            email: String(item?.email ?? ''),
            contact_number: String(item?.contact_number ?? ''),
            position: String(item?.position ?? ''),
            item_number: String(item?.item_number ?? ''),
            office: String(item?.office ?? item?.department ?? 'Unassigned'),
            status: resolvedStatus,
            created_at: String(item?.created_at ?? new Date().toISOString()),
            total_score: resolvedScore > 0 ? resolvedScore : null,
            exam_date: item?.exam_date ?? null,
            exam_time: item?.exam_time ?? null,
            interview_date: item?.interview_date ?? null,
            interview_time: item?.interview_time ?? null,
            assigned_interviewer_email: item?.assigned_interviewer_email ?? null,
            oral_exam_date: item?.oral_exam_date ?? null,
            oral_exam_time: item?.oral_exam_time ?? null,
            venue: item?.venue ?? null,
            application_type: item?.application_type ?? null,
            education_level: item?.education_level ?? item?.educational_attainment ?? item?.education ?? null,
            years_of_experience: item?.years_of_experience != null ? Number(item.years_of_experience) : null,
          };
        });

        // Include local-only recruitment rows (common in mock mode) so hires
        // appear in Newly Hired immediately after status change.
        const mergedById = new Map<string, ApplicantRecord>(
          normalized.map((row: ApplicantRecord) => [String(row.id), row])
        );

        recruitmentApplicants.forEach((entry) => {
          const entryId = String(entry.id ?? '').trim();
          if (!entryId || mergedById.has(entryId)) return;

          mergedById.set(entryId, {
            id: entryId,
            full_name: `${entry.personalInfo.firstName} ${entry.personalInfo.lastName}`.replace(/\s+/g, ' ').trim() || 'Unnamed Applicant',
            email: String(entry.personalInfo.email ?? ''),
            contact_number: String(entry.personalInfo.phone ?? ''),
            position: String(canonicalJobs.find((job) => job.id === entry.jobPostingId)?.title ?? ''),
            office: String(canonicalJobs.find((job) => job.id === entry.jobPostingId)?.department ?? 'Unassigned'),
            status: String(entry.status ?? 'Pending'),
            created_at: String(entry.applicationDate ?? new Date().toISOString()),
            total_score: Number(entry.qualificationScore ?? 0) > 0 ? Number(entry.qualificationScore) : null,
          });
        });

        // Store evaluations in state for use in Assessment Forms
        (window as any).__evaluationsByApplicantId = evaluationsByApplicantId;
        setEvaluatedApplicantIds(new Set(evaluationBestScore.keys()));

        // Merge localStorage schedule cache so schedule columns show immediately
        // even when the Supabase columns are present but the fetch raced a save.
        setApplicants(mergeLocalSchedules(Array.from(mergedById.values())));
      } else {
        setApplicants([]);
      }

      if (ratersRes.status === 'fulfilled' && !ratersRes.value.error && Array.isArray(ratersRes.value.data)) {
        const ratersSource = primaryRaters.length > 0 ? primaryRaters : ratersRes.value.data;
        const assignmentsFromDb: Record<string, string[]> = {};

        ratersSource.forEach((item: any) => {
          const emailKey = normalizeEmailKey(String(item?.email ?? ''));
          if (!emailKey) return;

          assignmentsFromDb[emailKey] = Array.isArray(item?.assigned_positions)
            ? item.assigned_positions.filter((value: any) => typeof value === 'string')
            : [];
        });

        setRaterAssignedPositionsByEmail(assignmentsFromDb);

        const normalized = ratersSource.map((item: any, index: number) => ({
          id: Number(item?.id ?? index + 1),
          name: String(item?.name ?? ''),
          email: String(item?.email ?? ''),
          department: String(item?.department ?? 'Unassigned'),
          is_active: Boolean(item?.is_active ?? true),
          last_login: item?.last_login ? String(item.last_login) : null,
        }));
        setRaters(normalized);
      } else {
        setRaters([]);
      }

      if (evaluationsRes.status === 'fulfilled' && !evaluationsRes.value.error && Array.isArray(evaluationsRes.value.data)) {
        const completed = new Set<string>();
        evaluationsRes.value.data.forEach((item: any) => {
          const applicantId = String(item?.applicant_id ?? '').trim();
          if (!applicantId) return;

          const hasScore =
            deriveEvaluationTotalScore(item) > 0 ||
            (typeof item?.overall_score === 'number' && item.overall_score > 0) ||
            (typeof item?.overall_impression_score === 'number' && item.overall_impression_score > 0) ||
            (typeof item?.personality_score === 'number' && item.personality_score > 0);
          if (!hasScore) return;

          completed.add(applicantId);
        });

        setCompletedEvaluationIds(completed);
      } else {
        setCompletedEvaluationIds(new Set());
      }
    };

    const syncJobs = () => {
      if (disposed) return;

      // CRITICAL: Invalidate cache when new evaluations are submitted
      // This ensures we fetch fresh evaluation data instead of using cached bundle
      invalidateCacheKey('rsp-dashboard:recruitment:primary');
      invalidateCacheKey('rsp-dashboard:recruitment:secondary');

      if (inFlight) {
        pending = true;
        return;
      }

      inFlight = true;
      void load().finally(() => {
        inFlight = false;
        if (pending && !disposed) {
          pending = false;
          syncJobs();
        }
      });
    };

    const onStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === 'cictrix_job_postings' ||
        event.key === 'cictrix_authoritative_job_postings'
      ) {
        // Route through the scheduler so a storage event can never overlap an
        // in-flight load and let an older response win.
        syncJobs();
      }
    };

    syncJobs();
    window.addEventListener('focus', syncJobs);
    window.addEventListener('cictrix:job-postings-updated', syncJobs as EventListener);
    window.addEventListener('cictrix:applicants-updated', syncJobs as EventListener);
    window.addEventListener('storage', onStorage);

    return () => {
      disposed = true;
      window.removeEventListener('focus', syncJobs);
      window.removeEventListener('cictrix:job-postings-updated', syncJobs as EventListener);
      window.removeEventListener('cictrix:applicants-updated', syncJobs as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [loadsRecruitmentData]);

  useEffect(() => {
    // Guard against a stale modal backdrop when users navigate away from Reports.
    if (section !== 'reports') {
      setShowRankingModal(false);
      setShowHireApplicantsModal(false);
      setShowAssessmentFormsModal(false);
      setSelectedHireApplicantIds([]);
      setActiveRankingPosition(null);
      setActiveAssessmentPosition(null);
      setAssessmentStatusFilter('all');
      setAssessmentSearch('');
      setActiveDocumentTemplateId(null);
      setExpandedDocumentOffices({});
      setSelectedDocumentSubmissionIds([]);
      setReportsView('overview');
      setRankingPositionFilter('all');
    }
    if (section !== 'accounts') {
      setAccountsView('directory');
    }
  }, [section]);

  useEffect(() => {
    const forceCloseAllOverlays = () => {
      setShowRankingModal(false);
      setShowHireApplicantsModal(false);
      setShowAssessmentFormsModal(false);
      setShowJobDialog(false);
      setShowRaterDialog(false);
      setShowBulkRequestDialog(false);
      setSelectedHireApplicantIds([]);
      setActiveRankingPosition(null);
      setActiveAssessmentPosition(null);
      setAssessmentStatusFilter('all');
      setAssessmentSearch('');
      setActiveDocumentTemplateId(null);
      setExpandedDocumentOffices({});
      setSelectedDocumentSubmissionIds([]);
      setReportsView('overview');
    };

    window.addEventListener('cictrix:force-close-overlays', forceCloseAllOverlays as EventListener);
    return () => {
      window.removeEventListener('cictrix:force-close-overlays', forceCloseAllOverlays as EventListener);
    };
  }, []);

  const jobsWithCounts = useMemo(() => {
    // Count against the plantilla item number, which uniquely identifies a
    // posting. The previous version keyed on the job TITLE, so two postings
    // sharing a title (e.g. three "Accountant III" openings) each claimed the
    // same applicants and every one of them reported an inflated count.
    // Title is kept only as a fallback for legacy rows with no item number.
    const byItem = new Map<string, number>();
    const byTitle = new Map<string, number>();
    applicants.forEach((applicant) => {
      const item = String(applicant.item_number ?? '').trim();
      if (item) byItem.set(item, (byItem.get(item) ?? 0) + 1);
      else {
        const title = applicant.position;
        if (title) byTitle.set(title, (byTitle.get(title) ?? 0) + 1);
      }
    });

    return jobs.map((job) => {
      const item = String(job.item_number ?? '').trim();
      const count = (item ? byItem.get(item) ?? 0 : 0) + (byTitle.get(job.title) ?? 0);
      return { ...job, applicant_count: count };
    });
  }, [jobs, applicants]);

  const officeOptions = useMemo(() => Array.from(new Set(applicants.map((a) => a.office).filter(Boolean))), [applicants]);
  const departmentSelectionOptions = useMemo(() => {
    const defaults = [
      'Human Resource Management Office',
      'Information Technology',
      'Finance',
      'Operations',
    ];
    return Array.from(new Set([...officeOptions, ...defaults].filter(Boolean)));
  }, [officeOptions]);
  const assignableJobPositions = useMemo(() => {
    return Array.from(
      new Set(
        jobs
          .filter((job) => String(job?.status ?? '').trim().toLowerCase() === 'active')
          .map((job) => job.title)
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobsWithCounts.filter((job) => {
      const term = jobsSearch.toLowerCase();
      const matchesSearch =
        !term ||
        job.title.toLowerCase().includes(term) ||
        job.item_number.toLowerCase().includes(term);
      const matchesStatus = jobsStatus === 'all' || job.status.toLowerCase() === jobsStatus;
      const matchesOffice = jobsOffice === 'all' || job.department === jobsOffice;
      return matchesSearch && matchesStatus && matchesOffice;
    });
  }, [jobsWithCounts, jobsSearch, jobsStatus, jobsOffice]);

  const jobsPerPage = 6;
  const pageCount = Math.max(1, Math.ceil(filteredJobs.length / jobsPerPage));
  const safePage = Math.min(jobsPage, pageCount - 1);
  const pagedJobs = filteredJobs.slice(safePage * jobsPerPage, safePage * jobsPerPage + jobsPerPage);



  // Loaded from Supabase newly_hired table; refreshed when saveNewlyHired
  // dispatches 'cictrix:newly-hired-updated'. Used by both
  // rankingPositionCards (card counts) and activeRankingRows (list) to
  // exclude applicants the admin has already confirmed for hire.
  const [newlyHiredRows, setNewlyHiredRows] = useState<NewlyHired[]>([]);
  useEffect(() => {
    if (!loadsNewlyHired) return;
    let cancelled = false;
    const refresh = async () => {
      const rows = await getNewlyHiredFromSupabase();
      if (!cancelled) setNewlyHiredRows(rows);
    };
    void refresh();
    window.addEventListener('cictrix:newly-hired-updated', refresh as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener('cictrix:newly-hired-updated', refresh as EventListener);
    };
  }, [loadsNewlyHired]);

  const hiredApplicantIds = useMemo(
    () =>
      new Set(
        newlyHiredRows
          .map((row) => String(row.applicantId ?? '').trim())
          .filter(Boolean),
      ),
    [newlyHiredRows],
  );

  const rankingPositionCards = useMemo<RankingPositionCard[]>(() => {
    const reportEligibleJobs = jobs.filter((job) => job.status !== 'Closed');
    const reportEligibleTitleSet = new Set(reportEligibleJobs.map((job) => job.title));
    const qualifiedByPosition = new Map<string, number>();

    applicants.forEach((applicant) => {
      // Already-hired applicants must not inflate the qualified-count badge
      // on position cards. Source of truth is Supabase newly_hired.
      if (hiredApplicantIds.has(String(applicant.id))) return;
      if (!savedScoredApplicantIds.has(applicant.id)) return;
      const normalizedStatus = (applicant.status || '').toLowerCase();
      // Negative outcomes always exclude.
      const isExplicitlyExcluded =
        normalizedStatus.includes('disqual') ||
        normalizedStatus.includes('not qualified') ||
        normalizedStatus.includes('reject') ||
        normalizedStatus.includes('withdrawn') ||
        normalizedStatus.includes('hired') ||
        normalizedStatus.includes('deployed');
      if (isExplicitlyExcluded) return;
      // RSP-saved scores OR an explicit qualified status OR completed evaluation
      // all count as eligible for ranking. The first condition is the new path so
      // applicants whose status is still "New Application" surface here once the
      // RSP saves their category scores.
      const hasQualifyingSignal =
        savedScoredApplicantIds.has(applicant.id) ||
        normalizedStatus.includes('qualified') ||
        normalizedStatus.includes('shortlist') ||
        normalizedStatus.includes('recommended') ||
        completedEvaluationIds.has(applicant.id);
      if (!hasQualifyingSignal || !applicant.position || !reportEligibleTitleSet.has(applicant.position)) return;
      qualifiedByPosition.set(applicant.position, (qualifiedByPosition.get(applicant.position) || 0) + 1);
    });

    const cardsFromJobs = reportEligibleJobs
      .filter((job) => (qualifiedByPosition.get(job.title) || 0) > 0)
      .map((job) => ({
        position: job.title,
        department: job.department || 'Unassigned Department',
        itemNumber: job.item_number || 'N/A',
        qualifiedCount: qualifiedByPosition.get(job.title) || 0,
      }));

    const unique = new Map<string, RankingPositionCard>();
    cardsFromJobs.forEach((card) => {
      if (!unique.has(card.position)) unique.set(card.position, card);
    });

    return Array.from(unique.values()).sort((a, b) => b.qualifiedCount - a.qualifiedCount || a.position.localeCompare(b.position));
  }, [applicants, completedEvaluationIds, jobs, savedScoredApplicantIds, hiredApplicantIds]);

  const activeRankingCard = useMemo(
    () => rankingPositionCards.find((card) => card.position === activeRankingPosition) || null,
    [rankingPositionCards, activeRankingPosition]
  );

  const activeRankingRows = useMemo<RankingApplicantRow[]>(() => {
    if (!activeRankingPosition) return [];

    const eligibleTitles = new Set(jobs.filter((job) => job.status !== 'Closed').map((job) => job.title));
    if (!eligibleTitles.has(activeRankingPosition)) return [];

    const candidates = applicants.filter((applicant) => {
      if (hiredApplicantIds.has(String(applicant.id))) return false;
      if (!savedScoredApplicantIds.has(applicant.id)) return false;
      if (applicant.position !== activeRankingPosition) return false;
      const normalizedStatus = (applicant.status || '').toLowerCase();
      // Match the qualification gate used by rankingPositionCards: scored + not
      // explicitly excluded ⇒ rankable. Keeps negative-status applicants out.
      const isExplicitlyExcluded =
        normalizedStatus.includes('disqual') ||
        normalizedStatus.includes('not qualified') ||
        normalizedStatus.includes('reject') ||
        normalizedStatus.includes('withdrawn') ||
        normalizedStatus.includes('hired') ||
        normalizedStatus.includes('deployed');
      if (isExplicitlyExcluded) return false;
      return (
        savedScoredApplicantIds.has(applicant.id) ||
        normalizedStatus.includes('qualified') ||
        normalizedStatus.includes('shortlist') ||
        normalizedStatus.includes('recommended') ||
        completedEvaluationIds.has(applicant.id)
      );
    });

    const categoryScores = loadStoredCategoryScores();

    const rows = candidates
      .map((applicant) => {
        const stored = categoryScores[applicant.id];
        const experience = Number(resolveScoreValue(stored?.experience).toFixed(2));
        const performance = Number(resolveScoreValue(stored?.performance).toFixed(2));
        const potential = Number(resolveScoreValue(stored?.potential).toFixed(2));

        // The Applicant Score screen stores the raw score; convert it against the
        // position's configured total, capped at the 30-point share.
        const written = convertExamScore(
          resolveScoreValue(stored?.writtenExam),
          totalForPosition(examTotals, applicant.position),
        ).points;

        const pcptRawOrConverted = resolveScoreValue(stored?.pcpt);
        const interview = Number((pcptRawOrConverted > 20 ? pcptRawToConverted(pcptRawOrConverted) : pcptRawOrConverted).toFixed(2));

        const education = Number(resolveScoreValue(stored?.education).toFixed(2));
        const computedTotal = Number((education + experience + performance + potential + written + interview).toFixed(2));
        const fallbackTotal = Number((applicant.total_score || 0).toFixed(2));
        const total = computedTotal > 0 ? computedTotal : fallbackTotal;

        return {
          id: applicant.id,
          fullName: applicant.full_name,
          email: applicant.email,
          position: applicant.position,
          department: applicant.office || activeRankingCard?.department || 'Unassigned Department',
          total,
          experience,
          performance,
          potential,
          written,
          interview,
        };
      })
      .sort((a, b) => b.total - a.total || a.fullName.localeCompare(b.fullName));

    return rows;
  }, [activeRankingPosition, applicants, completedEvaluationIds, activeRankingCard, jobs, savedScoredApplicantIds, hiredApplicantIds, examTotals]);

  // The ranking report is one position, so it is one comparison group (Task 5).
  const rankingTopIds = useMemo(
    () => topScorerIds(activeRankingRows, { idOf: (row) => row.id, scoreOf: (row) => row.total }),
    [activeRankingRows],
  );

  useEffect(() => {
    const syncSavedScores = () => setSavedScoredApplicantIds(getSavedScoredApplicantIdSet());

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === RSP_CATEGORY_SCORES_KEY) {
        syncSavedScores();
      }
    };

    syncSavedScores();
    window.addEventListener('focus', syncSavedScores);
    window.addEventListener('storage', onStorage);
    window.addEventListener('cictrix:category-scores-updated', syncSavedScores as EventListener);

    return () => {
      window.removeEventListener('focus', syncSavedScores);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('cictrix:category-scores-updated', syncSavedScores as EventListener);
    };
  }, []);

  const rankingSummary = useMemo(() => {
    if (activeRankingRows.length === 0) {
      return {
        highest: 0,
        average: 0,
        lowest: 0,
      };
    }

    const totals = activeRankingRows.map((row) => row.total);
    const sum = totals.reduce((acc, value) => acc + value, 0);
    return {
      highest: Math.max(...totals),
      average: Number((sum / totals.length).toFixed(2)),
      lowest: Math.min(...totals),
    };
  }, [activeRankingRows]);

  const assessmentPositionCards = useMemo<AssessmentPositionCard[]>(() => {
    const reportEligibleJobs = jobs.filter((job) => job.status !== 'Closed');
    const counts = new Map<string, { total: number; qualified: number; hired: number; disqualified: number }>();

    applicants.forEach((applicant) => {
      if (!applicant.position) return;
      const current = counts.get(applicant.position) || { total: 0, qualified: 0, hired: 0, disqualified: 0 };
      current.total += 1;
      const bucket = toAssessmentStatusBucket(applicant.status);
      if (bucket === 'qualified') current.qualified += 1;
      if (bucket === 'hired') current.hired += 1;
      if (bucket === 'disqualified') current.disqualified += 1;
      counts.set(applicant.position, current);
    });

    // Deduplicate jobs by title - keep only the first occurrence of each position
    const seenTitles = new Set<string>();
    const deduplicatedJobs = reportEligibleJobs.filter((job) => {
      if (seenTitles.has(job.title)) return false;
      seenTitles.add(job.title);
      return true;
    });

    return deduplicatedJobs
      .map((job) => {
        const count = counts.get(job.title) || { total: 0, qualified: 0, hired: 0, disqualified: 0 };
        return {
          position: job.title,
          department: job.department || 'Unassigned Department',
          itemNumber: job.item_number || 'N/A',
          totalApplicants: count.total,
          qualifiedCount: count.qualified,
          hiredCount: count.hired,
          disqualifiedCount: count.disqualified,
        };
      })
      .filter((card) => card.totalApplicants > 0)
      .sort((a, b) => b.totalApplicants - a.totalApplicants || a.position.localeCompare(b.position));
  }, [jobs, applicants]);

  const activeAssessmentCard = useMemo(() => {
    if (!activeAssessmentPosition) return null;
    const card = assessmentPositionCards.find((card) => card.position === activeAssessmentPosition);
    // Fallback: if no exact match, try case-insensitive match
    if (!card && assessmentPositionCards.length > 0) {
      const fallback = assessmentPositionCards.find(
        (card) => card.position.toLowerCase() === activeAssessmentPosition.toLowerCase()
      );
      return fallback || null;
    }
    return card || null;
  }, [assessmentPositionCards, activeAssessmentPosition]);

  const activeAssessmentApplicants = useMemo(() => {
    if (!activeAssessmentPosition) return [] as ApplicantRecord[];
    return applicants
      .filter((applicant) => applicant.position === activeAssessmentPosition)
      .sort((a, b) => (b.total_score || 0) - (a.total_score || 0) || a.full_name.localeCompare(b.full_name));
  }, [activeAssessmentPosition, applicants]);

  const filteredAssessmentApplicants = useMemo(() => {
    const term = assessmentSearch.trim().toLowerCase();
    return activeAssessmentApplicants.filter((applicant) => {
      const bucket = toAssessmentStatusBucket(applicant.status);
      if (assessmentStatusFilter !== 'all' && bucket !== assessmentStatusFilter) return false;
      if (!term) return true;
      return applicant.full_name.toLowerCase().includes(term) || applicant.email.toLowerCase().includes(term);
    });
  }, [activeAssessmentApplicants, assessmentStatusFilter, assessmentSearch]);

  const assessmentFilterCounts = useMemo(() => {
    const counts = {
      all: activeAssessmentApplicants.length,
      qualified: 0,
      hired: 0,
      disqualified: 0,
    };
    activeAssessmentApplicants.forEach((applicant) => {
      const bucket = toAssessmentStatusBucket(applicant.status);
      if (bucket === 'qualified') counts.qualified += 1;
      if (bucket === 'hired') counts.hired += 1;
      if (bucket === 'disqualified') counts.disqualified += 1;
    });
    return counts;
  }, [activeAssessmentApplicants]);

  const activeDocumentTemplate = useMemo(
    () => BULK_REQUEST_TEMPLATES.find((template) => template.id === activeDocumentTemplateId) || null,
    [activeDocumentTemplateId]
  );

  // Real employee-document submissions, fetched from Supabase whenever the
  // active card changes or an upload event fires from the Employee Portal.
  const [activeDocumentSubmissions, setActiveDocumentSubmissions] = useState<EmployeeDocumentSubmission[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const showDocumentsLoader = useDelayedLoading(documentsLoading);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDocumentTemplateId) {
      setActiveDocumentSubmissions([]);
      setDocumentsError(null);
      return;
    }

    const canonicalType = TEMPLATE_ID_TO_DOCUMENT_TYPE[activeDocumentTemplateId];
    let cancelled = false;

    const refresh = async () => {
      setDocumentsLoading(true);
      setDocumentsError(null);
      try {
        const rows = await listEmployeeDocumentsByType(canonicalType);
        if (cancelled) return;
        const mapped = rows.map((row: SupabaseEmployeeDocumentSubmission): EmployeeDocumentSubmission => ({
          id: row.id,
          applicantId: row.employee_id,
          fullName: row.full_name,
          employeeCode: row.employee_number,
          position: row.position,
          office: row.department,
          submittedDate: formatDate(row.uploaded_at),
          // RSP Reports only surfaces compliance docs, which never use the
          // 'Submitted' status (that is hr_request-only). Coerce to satisfy
          // the narrower local type.
          status: row.status === 'Submitted' ? 'Pending' : (row.status ?? 'Pending'),
          documentUrl: row.file_url,
          documentType: row.document_type,
          fileName: row.file_name,
          fileType: row.file_type,
        }));
        setActiveDocumentSubmissions(mapped);
      } catch (error) {
        if (cancelled) return;
        console.error('listEmployeeDocumentsByType: refresh failed', error);
        setDocumentsError(failureText('load the document submissions', error, { mode: 'load' }));
        setActiveDocumentSubmissions([]);
      } finally {
        if (!cancelled) setDocumentsLoading(false);
      }
    };

    void refresh();

    const handleUpdate = () => { void refresh(); };
    window.addEventListener(EMPLOYEE_DOCUMENTS_UPDATED_EVENT, handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(EMPLOYEE_DOCUMENTS_UPDATED_EVENT, handleUpdate);
    };
  }, [activeDocumentTemplateId]);

  // Reference the now-unused matcher so the import stays valid for any future use
  // and TypeScript doesn't flag it; the Reports view itself reads from Supabase above.
  void matchesDocumentTemplate;

  const documentSubmissionsByOffice = useMemo(() => {
    const grouped = new Map<string, EmployeeDocumentSubmission[]>();
    activeDocumentSubmissions.forEach((submission) => {
      const current = grouped.get(submission.office) || [];
      current.push(submission);
      grouped.set(submission.office, current);
    });

    return Array.from(grouped.entries())
      .map(([office, submissions]) => ({
        office,
        submissions,
        total: submissions.length,
        selected: submissions.filter((entry) => selectedDocumentSubmissionIds.includes(entry.id)).length,
      }))
      .sort((a, b) => b.total - a.total || a.office.localeCompare(b.office));
  }, [activeDocumentSubmissions, selectedDocumentSubmissionIds]);

  const totalSelectedDocumentSubmissions = selectedDocumentSubmissionIds.length;

  useEffect(() => {
    if (!activeRankingPosition) return;
    const stillVisible = rankingPositionCards.some((card) => card.position === activeRankingPosition);
    if (!stillVisible) {
      setShowRankingModal(false);
      setShowHireApplicantsModal(false);
      setSelectedHireApplicantIds([]);
      setActiveRankingPosition(null);
    }
  }, [activeRankingPosition, rankingPositionCards]);

  useEffect(() => {
    if (!activeAssessmentPosition) return;
    const stillVisible = assessmentPositionCards.some((card) => card.position === activeAssessmentPosition);
    if (!stillVisible) {
      setShowAssessmentFormsModal(false);
      setActiveAssessmentPosition(null);
      setAssessmentStatusFilter('all');
      setAssessmentSearch('');
    }
  }, [activeAssessmentPosition, assessmentPositionCards]);


  // All non-hired applicants grouped by office(dept) → position for historical ranking view
  const rankingHistoricalData = useMemo(() => {
    const notHired = applicants.filter(a => !a.status.toLowerCase().includes('hired'));
    const byDept = new Map<string, Map<string, ApplicantRecord[]>>();
    notHired.forEach(a => {
      const dept = a.office || 'No Department';
      const pos = a.position || 'No Position';
      if (!byDept.has(dept)) byDept.set(dept, new Map());
      const posMap = byDept.get(dept)!;
      if (!posMap.has(pos)) posMap.set(pos, []);
      posMap.get(pos)!.push(a);
    });
    return byDept;
  }, [applicants]);

  const newlyHiredApplicants = useMemo(() => {
    const applicantsById = new Map(applicants.map((applicant) => [String(applicant.id), applicant] as const));

    if (newlyHiredRows.length > 0) {
      const mapped = newlyHiredRows.map((row) => {
        const applicantId = String(row.applicantId ?? '').trim();
        const linked = applicantId ? applicantsById.get(applicantId) : undefined;

        if (linked) {
          return {
            ...linked,
            status: 'Hired',
          };
        }

        const fullName = `${row.employeeInfo.firstName ?? ''} ${row.employeeInfo.lastName ?? ''}`.replace(/\s+/g, ' ').trim();
        return {
          id: applicantId || String(row.id),
          employeeId: row.employeeId,
          full_name: fullName || 'Newly Hired Applicant',
          email: String(row.employeeInfo.email ?? ''),
          contact_number: String(row.employeeInfo.phone ?? ''),
          position: String(row.position ?? ''),
          office: String(row.department ?? ''),
          status: 'Hired',
          created_at: String(row.dateHired ?? new Date().toISOString()),
          total_score: typeof row.rankingScore === 'number' ? row.rankingScore : null,
        } as ApplicantRecord;
      });

      const uniqueById = new Map<string, ApplicantRecord>();
      mapped.forEach((entry) => {
        uniqueById.set(String(entry.id), entry as ApplicantRecord);
      });
      return Array.from(uniqueById.values());
    }

    return applicants.filter((applicant) => ['accepted', 'hired'].includes(applicant.status.toLowerCase()));
  }, [applicants, newlyHiredRows]);

  const credentialedNewlyHiredRows = useMemo(
    () =>
      newlyHiredRows.filter(
        (row) => Boolean(row.employeeId) && Boolean(row.applicantId)
      ),
    [newlyHiredRows]
  );

  const credentialedApplicantIds = useMemo(
    () => new Set(credentialedNewlyHiredRows.map((row) => String(row.applicantId))),
    [credentialedNewlyHiredRows]
  );

  const employeeNumberFromNewlyHired = useMemo(() => {
    const map = new Map<string, string>();
    credentialedNewlyHiredRows.forEach((row) => {
      if (!row.applicantId || !row.employeeId) return;
      map.set(String(row.applicantId), row.employeeId);
    });
    return map;
  }, [credentialedNewlyHiredRows]);

  // getEmployeePortalAccounts reads module storage; these deps intentionally invalidate the cache.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const portalAccounts = useMemo(() => getEmployeePortalAccounts(), [credentialedNewlyHiredRows, section]);

  const portalAccountByEmployeeId = useMemo(
    () => new Map(portalAccounts.map((account) => [String(account.employee.employeeId ?? '').trim(), account])),
    [portalAccounts]
  );

  const portalAccountByApplicantId = useMemo(() => {
    const map = new Map<string, (typeof portalAccounts)[number]>();
    credentialedNewlyHiredRows.forEach((row) => {
      if (!row.applicantId || !row.employeeId) return;
      const account = portalAccountByEmployeeId.get(String(row.employeeId).trim());
      if (account) map.set(String(row.applicantId), account);
    });
    return map;
  }, [credentialedNewlyHiredRows, portalAccountByEmployeeId]);

  // Real hire dates, keyed by BOTH applicant id and employee number so any
  // directory source can resolve one. newly_hired.dateHired is set at the
  // moment the account is generated, so it is the authoritative hire date.
  const hireDateByKey = useMemo(() => {
    const map = new Map<string, string>();
    newlyHiredRows.forEach((row) => {
      const dateHired = String(row.dateHired ?? '').trim();
      if (!dateHired) return;
      const applicantId = String(row.applicantId ?? '').trim();
      const employeeId = String(row.employeeId ?? '').trim();
      if (applicantId) map.set(applicantId, dateHired);
      if (employeeId) map.set(employeeId, dateHired);
    });
    return map;
  }, [newlyHiredRows]);

  const credentialedApplicantDirectorySource = useMemo(
    () =>
      applicants
        .filter((employee) => credentialedApplicantIds.has(employee.id))
        .map((employee) => {
          const employeeId = employeeNumberFromNewlyHired.get(employee.id);
          return {
            ...employee,
            employeeId,
            hire_date:
              hireDateByKey.get(String(employee.id)) ??
              (employeeId ? hireDateByKey.get(String(employeeId)) : undefined),
          };
        }),
    [applicants, credentialedApplicantIds, employeeNumberFromNewlyHired, hireDateByKey]
  );

  // Loaded from Supabase employees table on mount. Used as the fallback
  // source for the employee directory when no portal account is found.
  const [supabaseEmployeeRecords, setSupabaseEmployeeRecords] = useState<EmployeeRecord[]>([]);
  useEffect(() => {
    if (!loadsAccountData) return;
    let cancelled = false;
    void (async () => {
      const rows = await getEmployeeRecordsFromSupabase();
      if (!cancelled) setSupabaseEmployeeRecords(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadsAccountData]);

  // Full personal fields per employee, read straight from the base `employees`
  // table (anon-readable) and keyed by employee_number. The account-detail
  // profile panel needs date/place of birth, address, sex, civil status and
  // emergency contact — NONE of which the portal-account object carries
  // (portalAccountFromRow defaults them to '' / 'Other' / 'Single'), which is
  // why every employee's profile rendered blank. This is the canonical source.
  const [employeePersonalByNumber, setEmployeePersonalByNumber] = useState<Map<string, any>>(new Map());
  useEffect(() => {
    if (!loadsAccountData) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await (supabase as any)
        .from('employees')
        .select(
          'employee_number, first_name, middle_name, last_name, suffix, position, department, status, email, phone, current_address_street, date_of_birth, place_of_birth, sex, civil_status, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, date_hired',
        );
      if (cancelled || error || !Array.isArray(data)) return;
      const map = new Map<string, any>();
      data.forEach((row: any) => {
        const num = String(row?.employee_number ?? '').trim();
        if (num) map.set(num, row);
      });
      setEmployeePersonalByNumber(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadsAccountData]);

  const fallbackEmployeeDirectorySource = useMemo(() => {
    const seenEmployeeIds = new Set<string>();

    // Add employees from the Supabase employees table.
    const records = supabaseEmployeeRecords.reduce<ApplicantRecord[]>((acc, record) => {
      const employeeId = String(record.employeeId ?? '').trim();
      if (!employeeId) return acc;

      seenEmployeeIds.add(employeeId);
      const account = portalAccountByEmployeeId.get(employeeId);

      acc.push({
        id: employeeId,
        employeeId,
        // Prefer the DB name; only fall back to a portal-account name or the
        // 'Employee' placeholder. Using `||` (not `??`) so an empty-string
        // account name can't blank out a real employee's name in the list.
        full_name: String(record.name || account?.employee.fullName || 'Employee'),
        first_name: record.firstName || undefined,
        last_name: record.lastName || undefined,
        email: String(account?.employee.email ?? ''),
        contact_number: String(account?.employee.mobileNumber ?? ''),
        position: String(record.position ?? '').trim() || 'Unassigned Position',
        office: String(record.department ?? record.division ?? '').trim() || 'Unassigned Office',
        status: 'Active',
        created_at: String(record.startDate ?? account?.createdAt ?? new Date().toISOString()),
        // employees.date_hired first; otherwise the moment their portal
        // account was generated, which is when the hire flow ran.
        hire_date:
          hireDateByKey.get(employeeId) ||
          String(record.startDate ?? '').trim() ||
          account?.createdAt ||
          undefined,
        total_score: null,
      });

      return acc;
    }, []);

    // Also add any portal accounts that aren't in the employees table.
    portalAccounts.forEach((account) => {
      const employeeId = String(account.employee.employeeId ?? '').trim();
      if (!employeeId || seenEmployeeIds.has(employeeId)) return;

      records.push({
        id: employeeId,
        employeeId,
        full_name: account.employee.fullName,
        email: account.employee.email,
        contact_number: account.employee.mobileNumber || '',
        position: account.employee.currentPosition || 'Employee',
        office: account.employee.currentDepartment || 'Unassigned',
        status: 'Active',
        created_at: account.createdAt,
        hire_date: hireDateByKey.get(employeeId) || account.createdAt || undefined,
        total_score: null,
      });
    });

    return records;
  }, [hireDateByKey, portalAccountByEmployeeId, portalAccounts, supabaseEmployeeRecords]);

  const directoryEmployeesSource = useMemo(
    () => {
      const merged = new Map<string, ApplicantRecord>();

      // Add credentialed applicants (those with employee numbers generated)
      credentialedApplicantDirectorySource.forEach((employee) => {
        const key = String(employee.employeeId ?? employee.id).trim();
        if (!key) return;
        merged.set(key, employee);
      });

      // Add ALL hired applicants (even those without credentials yet)
      applicants
        .filter((app) => app.status === 'Hired')
        .forEach((employee) => {
          const key = String(employee.id).trim();
          if (!key || merged.has(key)) return;
          merged.set(key, {
            ...employee,
            status: 'Hired',
            employeeId: undefined, // No employee number yet
            // No credentials generated, so no newly_hired row to read a hire
            // date from. created_at is their APPLICATION date, so it is not a
            // stand-in — leave undefined and show no badge.
            hire_date: hireDateByKey.get(key),
          });
        });

      // Add fallback employee records
      fallbackEmployeeDirectorySource.forEach((employee) => {
        const key = String(employee.employeeId ?? employee.id).trim();
        if (!key || merged.has(key)) return;
        merged.set(key, employee);
      });

      return Array.from(merged.values());
    },
    [applicants, credentialedApplicantDirectorySource, fallbackEmployeeDirectorySource, hireDateByKey]
  );

  // Office Directory: same fetch (getOfficeDirectory) and Office / Department
  // Head / Employees shape used by the PM division, so both divisions read
  // identical department-head and headcount data.
  useEffect(() => {
    if (section !== 'accounts' || officeDirectoryRows.length > 0) return;
    setOfficeDirectoryLoading(true);
    setOfficeDirectoryError('');
    getOfficeDirectory().then((result) => {
      if (result.ok) {
        setOfficeDirectoryRows(result.data);
      } else {
        setOfficeDirectoryError((result as { ok: false; error: string }).error);
      }
      setOfficeDirectoryLoading(false);
    });
  }, [section, officeDirectoryRows.length, officeDirectoryAttempt]);

  // Headcount comes from getOfficeDirectory() so this page, PM and System
  // Administration all report the same numbers from one query.
  // Active offices only — the directory reflects the current org (deactivated
  // offices are managed on the System Administration page, not here).
  const activeOfficeDirectoryRows = useMemo(
    () => officeDirectoryRows.filter((row) => row.isActive),
    [officeDirectoryRows]
  );

  const filteredOfficeDirectoryRows = useMemo(
    () => activeOfficeDirectoryRows,
    [activeOfficeDirectoryRows]
  );

  const officeDirectoryTotalEmployees = useMemo(
    () => activeOfficeDirectoryRows.reduce((sum, row) => sum + row.employeeCount, 0),
    [activeOfficeDirectoryRows]
  );

  const employeeDirectoryPageCount = Math.max(1, Math.ceil(filteredOfficeDirectoryRows.length / EMPLOYEE_DIRECTORY_OFFICES_PER_PAGE));
  const safeEmployeeDirectoryPage = Math.min(employeeDirectoryPage, employeeDirectoryPageCount - 1);
  const paginatedOfficeDirectoryRows = useMemo(
    () =>
      filteredOfficeDirectoryRows.slice(
        safeEmployeeDirectoryPage * EMPLOYEE_DIRECTORY_OFFICES_PER_PAGE,
        (safeEmployeeDirectoryPage + 1) * EMPLOYEE_DIRECTORY_OFFICES_PER_PAGE
      ),
    [filteredOfficeDirectoryRows, safeEmployeeDirectoryPage]
  );

  useEffect(() => {
    if (employeeDirectoryPage > employeeDirectoryPageCount - 1) {
      setEmployeeDirectoryPage(Math.max(0, employeeDirectoryPageCount - 1));
    }
  }, [employeeDirectoryPage, employeeDirectoryPageCount]);

  const employeeNumberById = useMemo(() => {
    const employeeNumberMap = new Map<string, string>();

    directoryEmployeesSource.forEach((employee, index) => {
      const storedEmployeeNumber = employeeNumberFromNewlyHired.get(employee.id);
      if (storedEmployeeNumber) {
        employeeNumberMap.set(employee.id, storedEmployeeNumber);
        return;
      }

      const year = Number.isNaN(new Date(employee.created_at).getFullYear())
        ? '2026'
        : String(new Date(employee.created_at).getFullYear());
      employeeNumberMap.set(employee.id, `EMP-${year}-${String(index + 1).padStart(3, '0')}`);
    });

    return employeeNumberMap;
  }, [directoryEmployeesSource, employeeNumberFromNewlyHired]);

  const selectedOfficeEmployees = useMemo(() => {
    if (!selectedDirectoryCard) return [];
    // The office roster is the real employees for this office (the same set the
    // directory table counts), sourced from the employees table and deduped by
    // employee number — NOT the recruitment merge (directoryEmployeesSource),
    // which folded in hired applicants and duplicated people (14 ≠ 11).
    return fallbackEmployeeDirectorySource.filter(
      (employee) => normalizeOfficeName(employee.office) === normalizeOfficeName(selectedDirectoryCard.office),
    );
  }, [fallbackEmployeeDirectorySource, selectedDirectoryCard]);

  const selectedEmployeeDetails = useMemo(
    () => directoryEmployeesSource.find((employee) => (employee.id === selectedEmployeeId || employee.employeeId === selectedEmployeeId)) ?? null,
    [directoryEmployeesSource, selectedEmployeeId]
  );

  // Authoritative employee row from the `employees` table for the selected
  // person. The directory merge (directoryEmployeesSource) can hand back a row
  // with empty name/position/office — or the office-list id (which IS the
  // employee_number) may not resolve in that merge at all — leaving the whole
  // detail blank. Resolving straight from the DB by employee_number guarantees
  // the panel is populated for any real employee.
  const selectedEmployeeDbRecord = useMemo(() => {
    const candidates = [
      selectedEmployeeId, // office-directory clicks pass the employee_number directly
      selectedEmployeeDetails?.employeeId,
      selectedEmployeeDetails ? employeeNumberById.get(selectedEmployeeDetails.id) : null,
      selectedEmployeeDetails?.id,
      selectedEmployeeDetails ? employeeNumberFromNewlyHired.get(selectedEmployeeDetails.id) : null,
    ];
    for (const c of candidates) {
      const key = String(c ?? '').trim();
      if (key && employeePersonalByNumber.has(key)) return employeePersonalByNumber.get(key);
    }
    return null;
  }, [selectedEmployeeId, selectedEmployeeDetails, employeeNumberById, employeeNumberFromNewlyHired, employeePersonalByNumber]);

  // Full name assembled from the DB row when the merge didn't supply one.
  const selectedEmployeeDbName = useMemo(() => {
    if (!selectedEmployeeDbRecord) return null;
    const parts = [
      selectedEmployeeDbRecord.first_name,
      selectedEmployeeDbRecord.middle_name,
      selectedEmployeeDbRecord.last_name,
      selectedEmployeeDbRecord.suffix,
    ]
      .map((p: unknown) => String(p ?? '').trim())
      .filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  }, [selectedEmployeeDbRecord]);

  const selectedEmployeeProfile = useMemo(() => {
    if (!selectedEmployeeId && !selectedEmployeeDetails) return null;
    const resolvedEmployeeId = String(
      selectedEmployeeId
        ?? selectedEmployeeDetails?.employeeId
        ?? (selectedEmployeeDetails ? employeeNumberById.get(selectedEmployeeDetails.id) : null)
        ?? selectedEmployeeDetails?.id
        ?? (selectedEmployeeDetails ? employeeNumberFromNewlyHired.get(selectedEmployeeDetails.id) : null)
        ?? ''
    ).trim();
    const portalAccount =
      (resolvedEmployeeId ? portalAccountByEmployeeId.get(resolvedEmployeeId) : null) ??
      (selectedEmployeeDetails ? portalAccountByApplicantId.get(selectedEmployeeDetails.id) : null);
    const emp = portalAccount?.employee;
    // Canonical personal data lives in the `employees` table; the portal-account
    // object only carries name/email/phone, so prefer the DB row for everything.
    const rec = selectedEmployeeDbRecord;
    const nn = (v: unknown) => {
      const s = String(v ?? '').trim();
      return s ? s : null;
    };
    const computeAge = (dob: string | undefined) => {
      if (!dob) return null;
      const birth = new Date(dob);
      if (Number.isNaN(birth.getTime())) return null;
      const today = new Date();
      let years = today.getFullYear() - birth.getFullYear();
      const hasBirthdayPassed =
        today.getMonth() > birth.getMonth() ||
        (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
      if (!hasBirthdayPassed) years -= 1;
      return years;
    };
    const dob = nn(rec?.date_of_birth) || nn(emp?.dateOfBirth);
    const ageFromDob = computeAge(dob ?? undefined);
    return {
      email: nn(rec?.email) || nn(selectedEmployeeDetails?.email) || nn(emp?.email),
      phone: nn(rec?.phone) || nn(selectedEmployeeDetails?.contact_number) || nn(emp?.mobileNumber),
      address: nn(rec?.current_address_street) || nn(emp?.homeAddress),
      dateOfBirth: dob ? formatDate(dob) : null,
      placeOfBirth: nn(rec?.place_of_birth) || nn(emp?.placeOfBirth),
      age: ageFromDob != null ? `${ageFromDob} years old` : (emp?.age ? `${emp.age} years old` : null),
      sex: nn(rec?.sex) || nn(emp?.gender),
      civilStatus: nn(rec?.civil_status) || nn(emp?.civilStatus),
      emergencyContactName: nn(rec?.emergency_contact_name) || nn(emp?.emergencyContactName),
      emergencyContactRelationship: nn(rec?.emergency_contact_relationship) || nn(emp?.emergencyRelationship),
      emergencyContactPhone: nn(rec?.emergency_contact_phone) || nn(emp?.emergencyContactNumber),
      dateHired: nn(rec?.date_hired)
        ? formatDate(rec.date_hired)
        : (selectedEmployeeDetails?.created_at ? formatDate(selectedEmployeeDetails.created_at) : null),
    };
  }, [selectedEmployeeId, selectedEmployeeDetails, selectedEmployeeDbRecord, employeeNumberById, employeeNumberFromNewlyHired, portalAccountByApplicantId, portalAccountByEmployeeId]);

  const selectedEmployeeDocuments = useMemo(() => {
    if (!selectedEmployeeDetails) return [] as Array<{
      id: string;
      name: string;
      description: string;
      status: 'awaiting_review' | 'rejected' | 'pending_submission';
      requestedAt: string;
      dueAt: string;
      submittedAt?: string;
      rejectionReason?: string;
    }>;

    return [
      {
        id: `nbi-${selectedEmployeeDetails.id}`,
        name: 'NBI Clearance',
        description: 'Updated NBI Clearance (must be valid for 2026)',
        status: 'awaiting_review',
        requestedAt: 'Feb 10, 2026',
        dueAt: 'Feb 20, 2026',
        submittedAt: 'Feb 15, 2026',
      },
      {
        id: `medical-${selectedEmployeeDetails.id}`,
        name: 'Medical Certificate',
        description: 'Annual physical examination results',
        status: 'rejected',
        requestedAt: 'Feb 10, 2026',
        dueAt: 'Feb 25, 2026',
        submittedAt: 'Feb 14, 2026',
        rejectionReason: 'Image is blurry and unreadable. Please submit a clearer copy.',
      },
      {
        id: `saln-${selectedEmployeeDetails.id}`,
        name: 'SALN (Statement of Assets, Liabilities and Net Worth)',
        description: 'SALN for the year 2025',
        status: 'pending_submission',
        requestedAt: 'Feb 12, 2026',
        dueAt: 'Feb 28, 2026',
      },
    ];
  }, [selectedEmployeeDetails]);

  useEffect(() => {
    if (!selectedEmployeeDetails) return;
    const currentDepartment = (selectedEmployeeDetails as any).department || 'IT Department';
    const currentPosition = selectedEmployeeDetails.position || '';
    setPositionChangeForm((prev) => ({
      ...prev,
      newDepartment: employeeDirectoryDepartments.includes(currentDepartment)
        ? currentDepartment
        : 'IT Department',
      newPosition: currentPosition,
    }));
  }, [selectedEmployeeDetails, employeeDirectoryDepartments]);

  const bulkRequestEmployees = useMemo<BulkRequestEmployee[]>(() => {
    return directoryEmployeesSource.map((employee) => ({
      id: employee.id,
      name: employee.full_name,
      department: employee.office || 'Unassigned Office',
    }));
  }, [directoryEmployeesSource]);

  const bulkRequestDepartments = useMemo(
    () => Array.from(new Set(bulkRequestEmployees.map((employee) => employee.department))).sort((a, b) => a.localeCompare(b)),
    [bulkRequestEmployees]
  );

  const selectedDepartmentEmployees = useMemo(
    () => bulkRequestEmployees.filter((employee) => employee.department === bulkRequestForm.department),
    [bulkRequestEmployees, bulkRequestForm.department]
  );

  const selectedEmployeesList = useMemo(
    () => bulkRequestEmployees.filter((employee) => bulkRequestForm.selectedEmployeeIds.includes(employee.id)),
    [bulkRequestEmployees, bulkRequestForm.selectedEmployeeIds]
  );

  const bulkRequestRecipientCount = useMemo(() => {
    if (bulkRequestForm.recipientMode === 'all') return bulkRequestEmployees.length;
    if (bulkRequestForm.recipientMode === 'department') return selectedDepartmentEmployees.length;
    return selectedEmployeesList.length;
  }, [
    bulkRequestEmployees.length,
    bulkRequestForm.recipientMode,
    selectedDepartmentEmployees.length,
    selectedEmployeesList.length,
  ]);

  const isBulkRequestSendDisabled =
    !bulkRequestForm.documentName.trim() ||
    !bulkRequestForm.description.trim() ||
    !bulkRequestForm.dueDate ||
    bulkRequestRecipientCount === 0 ||
    (bulkRequestForm.recipientMode === 'department' && !bulkRequestForm.department);

  const departmentsSummary = useMemo(() => {
    const map = new Map<string, { hires: number; pending: number }>();
    newlyHiredApplicants.forEach((applicant) => {
      const current = map.get(applicant.office) ?? { hires: 0, pending: 0 };
      current.hires += 1;
      if (!completedEvaluationIds.has(applicant.id)) {
        current.pending += 1;
      }
      map.set(applicant.office, current);
    });
    return Array.from(map.entries()).map(([department, value]) => ({ department, ...value }));
  }, [newlyHiredApplicants, completedEvaluationIds]);

  const filteredRaters = useMemo(() => {
    return raters.filter((rater) => {
      const term = raterSearch.toLowerCase();
      const matchesSearch =
        !term ||
        rater.name.toLowerCase().includes(term) ||
        rater.email.toLowerCase().includes(term) ||
        rater.department.toLowerCase().includes(term);
      const matchesStatus = raterStatus === 'all' || (raterStatus === 'active' ? rater.is_active : !rater.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [raters, raterSearch, raterStatus]);

  const sectionTitle = {
    dashboard: 'RSP Dashboard',
    jobs: 'Applications',
    qualified: 'Qualified Applicants',
    'applicant-score': 'Applicant Score',
    'new-hired': 'Newly Hired Employees',
    raters: 'Rater Management & Access Control',
    accounts: 'Office Directory',
    reports: 'Archives',
    settings: 'Settings',
    succession: 'Succession Planning',
  }[section];

  const goToSection = (target: Section) => {
    if (target === 'dashboard') navigate('/admin/rsp');
    if (target === 'jobs') navigate('/admin/rsp/jobs');
    if (target === 'qualified') navigate('/admin/rsp/qualified');
    if (target === 'new-hired') navigate('/admin/rsp/new-hired');
    if (target === 'raters') navigate('/admin/rsp/raters');
    if (target === 'accounts') navigate('/admin/rsp/accounts');
    if (target === 'succession') navigate('/admin/rsp/succession');
    if (target === 'reports') navigate('/admin/rsp/reports');
    if (target === 'settings') navigate('/admin/rsp/settings');
  };

  const handleCreateJob = async () => {
    if (!newJob.title || !newJob.department) return;
    // Internal key only (never shown). Plantillas are named in the Job Posts editor.
    const itemKey = newJob.item_number || internalPlantillaKey();

    const createdAt = new Date().toISOString();
    // job_postings.id is a uuid column — the old code handed it an incrementing
    // integer, so the upsert was rejected and the posting only ever existed in
    // the local cache.
    const id = crypto.randomUUID();

    const splitLines = (value: string): string[] =>
      value
        .split(/[\n;•]+/)
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean);

    // The posting as the rest of the app understands it. Everything the RSP
    // typed is preserved here and persisted by mapJobPostingToSupabaseRow.
    const posting: JobPosting = {
      id,
      jobCode: itemKey,
      title: newJob.title,
      department: newJob.department,
      positionType: 'Civil Service',
      numberOfPositions: Number(newJob.slots) || 1,
      employmentStatus: 'Permanent',
      summary: newJob.description.trim(),
      responsibilities: splitLines(newJob.responsibilities),
      qualifications: {
        education: newJob.education_requirement.trim(),
        educationField: newJob.education_field.trim() || undefined,
        experience: {
          years: Number(newJob.experience_years) || 0,
          field: newJob.experience_field.trim(),
        },
        skills: splitLines(newJob.required_skills),
        certifications: [],
      },
      salaryGrade: newJob.salary_grade ? Number(newJob.salary_grade) : undefined,
      eligibility: newJob.eligibility.trim() || undefined,
      training: newJob.training_requirement.trim() || undefined,
      requiredDocuments: [],
      applicationDeadline: newJob.application_deadline || '',
      status: newJob.status === 'Closed' ? 'Closed' : newJob.status === 'Reviewing' ? 'Draft' : 'Active',
      postedDate: createdAt,
      postedBy: 'HR Admin',
      applicantCount: 0,
      qualifiedCount: 0,
    };

    const nextJobs: JobRecord[] = [
      {
        id,
        title: newJob.title,
        item_number: itemKey,
        department: newJob.department,
        status: newJob.status,
        created_at: createdAt,
        applicant_count: 0,
        posting,
      },
      ...jobs,
    ];
    setJobs(nextJobs);
    persistDashboardJobsToRecruitment(nextJobs);

    setShowJobDialog(false);
    setNewJob(EMPTY_NEW_JOB);
  };

  const handleDeleteJob = async (job: JobRecord) => {
    const nextJobs = jobs.filter((item) => item.id !== job.id);
    setJobs(nextJobs);

    persistDashboardJobsToRecruitment(nextJobs);

    try {
      await Promise.allSettled([
        supabase.from('job_postings').delete().eq('id', job.id),
        supabase.from('jobs').delete().eq('id', job.id),
        supabase.from('job_postings').delete().eq('title', job.title).eq('item_number', job.item_number),
        supabase.from('jobs').delete().eq('title', job.title).eq('item_number', job.item_number),
      ]);
    } catch { /* Best-effort Supabase sync; the local state is already updated and a failure is not surfaced. */ }
  };

  const handleToggleJobStatus = async (job: JobRecord) => {
    const updatedStatus: JobStatus = job.status === 'Closed' ? 'Open' : 'Closed';
    const nextJobs = jobs.map((item) => (item.id === job.id ? { ...item, status: updatedStatus } : item));
    setJobs(nextJobs);

    persistDashboardJobsToRecruitment(nextJobs);

    try {
      await Promise.allSettled([
        (supabase as any).from('job_postings').update({ status: updatedStatus }).eq('id', job.id),
        (supabase as any).from('jobs').update({ status: updatedStatus }).eq('id', job.id),
        (supabase as any).from('job_postings').update({ status: updatedStatus }).eq('title', job.title).eq('item_number', job.item_number),
        (supabase as any).from('jobs').update({ status: updatedStatus }).eq('title', job.title).eq('item_number', job.item_number),
      ]);
    } catch { /* Best-effort Supabase sync; the local state is already updated and a failure is not surfaced. */ }
  };

  const handleCreateRater = async () => {
    if (!newRater.name || !newRater.email || !newRater.department) return;

    const assignmentKey = normalizeEmailKey(newRater.email);
    const nextPositions = [...raterAccessForm.assignedPositions];

    // Optimistic UI update — actual persistence happens via Supabase below.
    setRaterAssignedPositionsByEmail((prev) => ({
      ...prev,
      [assignmentKey]: nextPositions,
    }));

    setRaters((prev) => prev.map((rater) =>
      normalizeEmailKey(rater.email) === assignmentKey
        ? { ...rater, is_active: true }
        : rater
    ));

    try {
      const client = getAccessClient();
      await runRaterEmailUpdate(
        client,
        {
          is_active: true,
          assigned_positions: nextPositions,
        },
        newRater.email,
      );
      saveRaterAccessState(newRater.email, true);
    } catch (err) {
      console.warn('[RSPDashboard] Failed to persist rater assigned_positions:', err);
    }

    setShowRaterDialog(false);
    setNewRater({ name: '', email: '', department: '' });
    setRaterAccessForm({
      raterName: '',
      accessLevel: 'Interviewer',
      assignedPositions: [],
      startDate: '',
      endDate: '',
    });
  };

  const closeRaterDialog = () => {
    setShowRaterDialog(false);
    setNewRater({ name: '', email: '', department: '' });
    setRaterAccessForm({
      raterName: '',
      accessLevel: 'Interviewer',
      assignedPositions: [],
      startDate: '',
      endDate: '',
    });
  };

  const handleRaterNameChange = (nameValue: string) => {
    setRaterAccessForm((prev) => ({ ...prev, raterName: nameValue }));
    setNewRater((prev) => ({ ...prev, name: nameValue }));

    const normalizedName = nameValue.trim().toLowerCase();
    if (!normalizedName) {
      setNewRater((prev) => ({ ...prev, name: '', email: '', department: '' }));
      return;
    }

    const selected = raters.find((rater) => rater.name.trim().toLowerCase() === normalizedName);
    if (!selected) {
      setNewRater((prev) => ({ ...prev, name: nameValue, email: '', department: '' }));
      return;
    }

    const assignmentKey = normalizeEmailKey(selected.email);
    const existingAssignments = raterAssignedPositionsByEmail[assignmentKey] ?? [];

    setNewRater((prev) => ({
      ...prev,
      name: selected.name,
      email: selected.email,
      department: selected.department,
    }));

    setRaterAccessForm((prev) => ({
      ...prev,
      raterName: selected.name,
      assignedPositions: [...existingAssignments],
    }));
  };

  const toggleAssignedPosition = (position: string) => {
    setRaterAccessForm((prev) => ({
      ...prev,
      assignedPositions: prev.assignedPositions.includes(position)
        ? prev.assignedPositions.filter((item) => item !== position)
        : [...prev.assignedPositions, position],
    }));
  };

  const handleDeleteRater = async (id: number) => {
    const target = raters.find((rater) => rater.id === id);

    setRaters((prev) => prev.filter((rater) => rater.id !== id));

    if (target?.email) {
      const assignmentKey = normalizeEmailKey(target.email);
      setRaterAssignedPositionsByEmail((prev) => {
        const next = { ...prev };
        delete next[assignmentKey];
        return next;
      });
    }

    try {
      const client = getPreferredClient();
      await client.from('raters').delete().eq('id', id);
    } catch { /* Best-effort Supabase sync; the local state is already updated and a failure is not surfaced. */ }
  };

  const handleToggleRaterAccess = async (rater: RaterRecord) => {
    const nextIsActive = !rater.is_active;
    const emailKey = normalizeEmailKey(rater.email);

    // Optimistic UI update so status changes immediately.
    setRaters((prev) =>
      prev.map((item) =>
        normalizeEmailKey(item.email) === emailKey ? { ...item, is_active: nextIsActive } : item
      )
    );

    try {
      const client = getAccessClient();
      await runRaterEmailUpdate(client, { is_active: nextIsActive }, emailKey, rater.id);
      await verifyRaterAccessState(client, emailKey, nextIsActive);
      saveRaterAccessState(emailKey, nextIsActive);
    } catch {
      // Rollback on failure to keep UI consistent with persisted data.
      setRaters((prev) =>
        prev.map((item) =>
          normalizeEmailKey(item.email) === emailKey ? { ...item, is_active: rater.is_active } : item
        )
      );
    }
  };

  const handleBulkTemplateSelect = (templateId: (typeof BULK_REQUEST_TEMPLATES)[number]['id']) => {
    const template = BULK_REQUEST_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;

    setBulkRequestForm((prev) => ({
      ...prev,
      documentName: template.name,
      description: template.description,
    }));
  };

  const handleBulkRecipientModeChange = (mode: BulkRecipientMode) => {
    setBulkRequestForm((prev) => ({
      ...prev,
      recipientMode: mode,
      department: mode === 'department' ? prev.department : '',
      selectedEmployeeIds: mode === 'selected' ? prev.selectedEmployeeIds : [],
    }));
  };

  // Archives' type-to-confirm dialog has already asked; this only removes the data.
  const purgeArchivedRecord = (key: string) => {
    if (!key.startsWith(DELETED_JOB_KEY)) return;
    const archiveId = key.slice(DELETED_JOB_KEY.length);
    setDeletedJobReports((prev) => {
      const next = prev.filter((report) => report.id !== archiveId);
      saveDeletedJobReports(next);
      return next;
    });
  };

  // Job posts and evaluation records for Archives; employees and applicants
  // are loaded by the module itself (docs/plans/2026-10-25-rsp-archives.md).
  const archiveRecords = useMemo<ArchiveRecord[]>(() => {
    const out: ArchiveRecord[] = [];
    // Job posts holds deleted posts only; closed posts stay on Job Posts.
    deletedJobReports.forEach((report) => {
      const documents = report.applicants.reduce((total, applicant) => total + applicant.documents.length, 0);
      out.push({
        key: `${DELETED_JOB_KEY}${report.id}`, group: 'jobs', type: 'Deleted', name: report.job.title,
        ref: report.job.jobCode || '', position: report.job.title, department: report.job.department || '—',
        date: report.deletedAt,
        facts: [{ label: 'Deleted by', value: report.deletedBy || '—' }],
        people: report.applicants.map((applicant) => ({
          name: `${applicant.personalInfo.firstName} ${applicant.personalInfo.lastName}`.trim() || 'Unnamed',
          status: applicant.status,
          detail: `${applicant.documents.length} document${applicant.documents.length === 1 ? '' : 's'}`,
        })),
        action: { kind: 'purge', applicants: report.applicants.length, documents },
      });
    });
    // One record per position: the ranking, with its assessment forms one click away.
    rankingHistoricalData.forEach((posMap, dept) => posMap.forEach((rows, pos) => {
      const latest = rows.reduce((max, row) => (row.created_at > max ? row.created_at : max), '');
      const ranked = rows.slice().sort((a, b) => (b.total_score ?? -1) - (a.total_score ?? -1));
      out.push({
        key: `eval:${dept}:${pos}`, group: 'evaluations', type: 'Ranking', name: pos, ref: '',
        position: pos, department: dept, date: latest,
        people: ranked.map((row) => ({
          name: row.full_name,
          status: normalizeStatus(row.status) ?? row.status,
          score: row.total_score != null ? row.total_score.toFixed(2) : '',
        })),
        action: { kind: 'assessment', position: pos },
      });
    }));
    return out;
  }, [deletedJobReports, rankingHistoricalData]);

  const closeRankingReport = () => {
    setShowRankingModal(false);
    setShowHireApplicantsModal(false);
    setSelectedHireApplicantIds([]);
    setActiveRankingPosition(null);
  };

  const openAssessmentForms = (position: string) => {
    setActiveAssessmentPosition(position);
    setAssessmentStatusFilter('all');
    setAssessmentSearch('');
    setShowAssessmentFormsModal(true);
  };

  const closeAssessmentForms = () => {
    setShowAssessmentFormsModal(false);
    setActiveAssessmentPosition(null);
    setAssessmentStatusFilter('all');
    setAssessmentSearch('');
  };


  useEffect(() => {
    if (reportsView !== 'documents') return;
    if (Object.keys(expandedDocumentOffices).length > 0) return;
    if (documentSubmissionsByOffice.length === 0) return;

    const initialExpanded: Record<string, boolean> = {};
    documentSubmissionsByOffice.forEach((group, index) => {
      initialExpanded[group.office] = index === 0;
    });
    setExpandedDocumentOffices(initialExpanded);
  }, [reportsView, documentSubmissionsByOffice, expandedDocumentOffices]);

  const toggleDocumentOffice = (office: string) => {
    setExpandedDocumentOffices((prev) => ({ ...prev, [office]: !prev[office] }));
  };

  const toggleDocumentSubmission = (submissionId: string) => {
    setSelectedDocumentSubmissionIds((prev) =>
      prev.includes(submissionId) ? prev.filter((id) => id !== submissionId) : [...prev, submissionId]
    );
  };

  const selectAllInOffice = (office: string, selected: boolean) => {
    const officeIds = activeDocumentSubmissions.filter((entry) => entry.office === office).map((entry) => entry.id);
    setSelectedDocumentSubmissionIds((prev) => {
      if (selected) {
        return Array.from(new Set([...prev, ...officeIds]));
      }
      return prev.filter((id) => !officeIds.includes(id));
    });
  };

  const toggleHireApplicantSelection = (applicantId: string) => {
    setSelectedHireApplicantIds((prev) =>
      prev.includes(applicantId) ? prev.filter((id) => id !== applicantId) : [...prev, applicantId]
    );
  };

  const handleConfirmHireApplicants = async () => {
    if (!activeRankingPosition || selectedHireApplicantIds.length === 0) return;

    const selectedRows = activeRankingRows.filter((row) => selectedHireApplicantIds.includes(row.id));
    if (selectedRows.length === 0) return;

    const rankingMetaByApplicantId = new Map(
      activeRankingRows.map((row, index) => [
        row.id,
        {
          rank: index + 1,
          score: row.total,
        },
      ])
    );

    // Fetch fresh from Supabase to avoid creating duplicates if a concurrent
    // session already added one of these applicants.
    const existing = await getNewlyHiredFromSupabase();
    const existingApplicantIds = new Set(existing.map((item) => item.applicantId));
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() + 7);

    const toAdd: NewlyHired[] = selectedRows
      .filter((row) => !existingApplicantIds.has(row.id))
      .map((row) => {
        const nameParts = row.fullName.trim().split(/\s+/);
        const firstName = nameParts[0] || row.fullName;
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Applicant';

        return {
          id: `hire-${row.id}-${now.getTime()}`,
          applicantId: row.id,
          rankingRank: rankingMetaByApplicantId.get(row.id)?.rank ?? 0,
          rankingScore: rankingMetaByApplicantId.get(row.id)?.score ?? 0,
          employeeInfo: {
            firstName,
            lastName,
            email: row.email,
            phone: '',
            emergencyContact: {
              name: '',
              relationship: '',
              phone: '',
            },
            governmentIds: {},
          },
          position: row.position,
          department: row.department,
          employmentType: 'Permanent',
          dateHired: now.toISOString(),
          expectedStartDate: startDate.toISOString(),
          status: 'Pending Onboarding',
          onboardingProgress: 0,
          onboardingChecklist: [
            {
              category: 'Documentation',
              item: 'Sign employment contract',
              completed: false,
            },
            {
              category: 'Orientation',
              item: 'Attend orientation',
              completed: false,
            },
          ],
          documents: [],
          notes: [
            {
              author: 'RSP Admin',
              content: 'Selected from Application Ranking Report.',
              date: now.toISOString(),
            },
          ],
          timeline: [
            {
              event: 'Candidate selected for hiring',
              date: now.toISOString(),
              actor: 'RSP Admin',
            },
          ],
        };
      });

    // Local Newly Hired store is the source of truth for the sidebar; write it
    // first so the user sees immediate feedback even if DB persistence fails.
    if (toAdd.length > 0) {
      saveNewlyHired([...existing, ...toAdd]);
    }

    // Persist the status flip. Try the FastAPI backend first (which also
    // creates the employee row); fall back to a direct Supabase UPDATE when
    // it's unreachable (e.g. on Vercel where no Python backend runs). The
    // Newly Hired page filters applicants by status === 'hired', so this
    // flip is what makes the hire show up there.
    const persistOne = async (id: string): Promise<boolean> => {
      try {
        await hireApplicant(id);
        return true;
      } catch (err) {
        console.error('[RSPDashboard] hireApplicant failed', id, err);
        return false;
      }
    };

    const persistResults = await Promise.all(selectedRows.map((row) => persistOne(row.id)));
    const allPersisted = persistResults.every(Boolean);
    if (!allPersisted) {
      console.warn(
        '[RSPDashboard] not all hire status updates persisted — Newly Hired may be incomplete until the next refresh.',
      );
    }

    // Always update the in-memory applicants list and close the modals so the user
    // gets visual confirmation. Newly Hired sidebar reads from the local store
    // (already written above), so the entries appear immediately.
    const selectedIdSet = new Set(selectedRows.map((row) => row.id));
    setApplicants((prev) => prev.map((applicant) => (selectedIdSet.has(applicant.id) ? { ...applicant, status: 'Hired' } : applicant)));
    setShowHireApplicantsModal(false);
    setShowRankingModal(false);
    setSelectedHireApplicantIds([]);
    setActiveRankingPosition(null);

    // Notify other listeners so dependent views (Newly Hired stats, sidebar count)
    // refresh without requiring a navigation.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
      window.dispatchEvent(new CustomEvent('cictrix:newly-hired-updated'));
    }
  };

  const handleBulkEmployeeToggle = (employeeId: string) => {
    setBulkRequestForm((prev) => {
      const selected = prev.selectedEmployeeIds.includes(employeeId)
        ? prev.selectedEmployeeIds.filter((id) => id !== employeeId)
        : [...prev.selectedEmployeeIds, employeeId];

      return {
        ...prev,
        selectedEmployeeIds: selected,
      };
    });
  };

  const resetBulkRequestForm = () => {
    setBulkRequestForm({
      documentName: '',
      description: '',
      dueDate: '',
      recipientMode: 'all',
      department: '',
      selectedEmployeeIds: [],
      templateFileName: '',
    });
  };

  const closeBulkRequestDialog = () => {
    setShowBulkRequestDialog(false);
    resetBulkRequestForm();
  };

  const openOfficeEmployees = (office: string) => {
    setSelectedDirectoryCard({ office });
    setSelectedEmployeeId(null);
    setAccountsView('office');
  };


  const openEmployeeDetails = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setEmployeeDetailsTab('personal');
    setShowPositionChangeModal(false);
    setAccountsView('details');
  };

  const [bulkRequestSending, setBulkRequestSending] = useState(false);
  const [bulkRequestError, setBulkRequestError] = useState<string | null>(null);

  const handleSendBulkRequest = async () => {
    if (isBulkRequestSendDisabled) return;

    // Resolve recipients based on the selected mode.
    const recipientEmployees =
      bulkRequestForm.recipientMode === 'all'
        ? bulkRequestEmployees
        : bulkRequestForm.recipientMode === 'department'
          ? selectedDepartmentEmployees
          : selectedEmployeesList;

    const emails = recipientEmployees
      .map((employee: any) => String(employee?.email ?? '').trim())
      .filter((email: string) => Boolean(email));

    if (emails.length === 0) {
      setBulkRequestError(
        'None of the selected employees have an email on file. Update their records first.',
      );
      return;
    }

    setBulkRequestSending(true);
    setBulkRequestError(null);

    const dueDate = bulkRequestForm.dueDate
      ? new Date(bulkRequestForm.dueDate).toLocaleDateString()
      : 'as soon as possible';

    const subject = `Document Request: ${bulkRequestForm.documentName}`;
    const body =
      `Good day,\n\n` +
      `You are requested to submit the following document:\n\n` +
      `Document: ${bulkRequestForm.documentName}\n` +
      `Description: ${bulkRequestForm.description}\n` +
      `Due Date: ${dueDate}\n\n` +
      `Please log in to the Employee Portal at /employee/login and upload your file ` +
      `under Document Requirements.\n\n` +
      `Thank you,\nAbyan HRIS — RSP Office`;

    try {
      // Send a single email with the recipients in TO so the SMTP server delivers
      // the same message in one round-trip. The backend accepts a list.
      await sendEmail({
        to: emails,
        subject,
        body,
      });
      closeBulkRequestDialog();
      feedback.success('Request sent', `Emailed ${emails.length} employee${emails.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setBulkRequestError(failureText('send the request', error));
    } finally {
      setBulkRequestSending(false);
    }
  };

  return (
    <div className="rsp-ds min-h-screen bg-slate-100 text-slate-800">
      <AdminHeader
        userName="RSP Admin"
        divisionLabel="RSP Division"
      />
      <div className="admin-layout">
        {/* The role is NOT forced to 'rsp' here. Doing that gave a super admin
            viewing this module the full RSP navigation — Jobs, Applications,
            Qualified — and the routes accepted them, so "view the RSP module"
            became "operate the RSP portal". Letting Sidebar read the session
            keeps a super admin on their own menu. */}
        <Sidebar activeModule="RSP" />

        <main className="admin-content !p-0">
          {liveDataError ? (
            <div className="px-6 pt-6">
              <ErrorBanner
                error={liveDataError}
                action="load the live applicant data"
                onRetry={() => window.dispatchEvent(new Event('cictrix:applicants-updated'))}
              />
              <p className="!mb-0 mt-2 text-sm text-[var(--neutral-800)]">
                Until it loads, counts and lists on this page may come from sample data stored in this browser, not the database.
              </p>
            </div>
          ) : null}
          {/* The dashboard draws its own gradient header strip with filters. */}
          {/* dash-lg: dashboard text enlarged (src/styles/dashboard-scale.css).
              Must be an ANCESTOR of .rspdash so the generated rules outrank
              rsp-dashboard.css by one class. */}
          {section === 'dashboard' && (
            <div className="dash-lg">
            <RspDashboardOverview
              // Open = accepting applications now (status and Manila deadline),
              // the rule the Job Vacancies tab counts with.
              jobs={jobsWithCounts.map((job) => ({
                ...job,
                status: dashboardPostingStatus(job.status, job.posting),
                applicationDeadline: job.posting?.applicationDeadline,
              }))}
              applicants={applicants}
              evaluatedApplicantIds={evaluatedApplicantIds}
              stageOf={funnelStageOf}
              onOpenJobs={() => goToSection('jobs')}
              onOpenApplicants={() => navigate('/admin/rsp/applications')}
              onOpenQualified={() => goToSection('qualified')}
              onOpenSuccession={() => goToSection('succession')}
              onOpenSuccessionPosition={(departmentId, positionId, opts) =>
                navigate(
                  `/admin/rsp/succession?${new URLSearchParams({ dept: departmentId, position: positionId })}`,
                  { replace: opts?.replace },
                )
              }
              onOpenNewHired={() => goToSection('new-hired')}
            />
            </div>
          )}
          {section !== 'dashboard' && (
          <div className={`border-b border-[var(--border-color)] bg-white px-4 sm:px-6 lg:px-8 ${section === 'succession' ? 'pt-5 lg:pt-6' : 'py-5 lg:py-6'}`}>
            <h1 className="!mb-1 !text-xl font-bold sm:!text-2xl">{sectionTitle}</h1>
            <p className={`${section === 'succession' ? '!mb-4' : '!mb-0'} text-sm text-[var(--text-secondary)] sm:text-base`}>
              {section === 'jobs' && 'Manage and monitor all job positions and their applicants'}
              {section === 'qualified' && 'List of applicants who passed the evaluation and are eligible for further processing'}
              {section === 'applicant-score' && 'View and update applicant evaluation scores for original and promotional applicants'}
              {section === 'new-hired' && 'Generate employee accounts for newly hired staff'}
              {section === 'raters' && 'Assign raters and define their evaluation access for specific job positions'}
              {section === 'accounts' && 'Browse and view employee records organized by position'}
              {section === 'reports' && 'Former employees, past positions, closed applications, job posts and evaluation records'}
              {section === 'succession' && 'Build and manage the pipeline for critical roles and leadership continuity'}
              {section === 'settings' && 'Manage your personal information and account details'}
            </p>
            {/* Tabs on white pages (DESIGN_IDENTITY §9.2), as in Job Posts. The
                points behind the Eligibility column live here rather than in
                Settings: they are part of the succession model, and an admin
                reading a ranking is the one who needs to change them. */}
            {section === 'succession' && (
              <div role="tablist" aria-label="Succession Planning views" className="-mb-px flex gap-2">
                {SUCCESSION_TABS.map((tab) => {
                  const selected = successionView === tab.id;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setSuccessionView(tab.id)}
                      className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${selected ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-slate-500 hover:text-[var(--color-primary-900)]'}`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          )}

          <div className={section === 'dashboard' ? 'hidden' : 'space-y-6 p-8'}>
            {section === 'jobs' && (
              <>
                <div className="flex justify-end">
                  <Button onClick={() => setShowJobDialog(true)} className="!px-6 !py-3 text-base">
                    <Plus size={20} /> Add New Position
                  </Button>
                </div>

                <section className="rounded-2xl border border-[var(--border-color)] bg-white">
                  <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-3">
                    <div className="relative xl:col-span-1">
                      <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        value={jobsSearch}
                        onChange={(e) => {
                          setJobsSearch(e.target.value);
                          setJobsPage(0);
                        }}
                        placeholder="Search by job title..."
                        className="w-full rounded-xl border border-[var(--border-color)] py-3 pl-11 pr-4 text-lg"
                      />
                    </div>
                    <div className="relative">
                      <Filter size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                      <select
                        value={jobsStatus}
                        onChange={(e) => {
                          setJobsStatus(e.target.value);
                          setJobsPage(0);
                        }}
                        className="w-full rounded-xl border border-[var(--border-color)] py-3 pl-11 pr-4 text-lg"
                      >
                        <option value="all">All Status</option>
                        <option value="open">Open</option>
                        <option value="reviewing">Reviewing</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div>
                      <select
                        value={jobsOffice}
                        onChange={(e) => {
                          setJobsOffice(e.target.value);
                          setJobsPage(0);
                        }}
                        className="w-full rounded-xl border border-[var(--border-color)] p-3 text-lg"
                      >
                        <option value="all">All Offices</option>
                        {officeOptions.map((office) => (
                          <option key={office} value={office}>{office}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="border-t border-[var(--border-color)] px-5 py-4 text-base text-[var(--text-secondary)]">
                    Showing <span className="font-semibold text-[var(--text-primary)]">{filteredJobs.length}</span> job positions
                  </div>
                </section>

                <div className="text-center text-lg text-[var(--text-secondary)]">
                  Position {filteredJobs.length === 0 ? 0 : safePage * jobsPerPage + 1} to {Math.min((safePage + 1) * jobsPerPage, filteredJobs.length)} of {filteredJobs.length}
                </div>

                <section className="flex items-start gap-4">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setJobsPage((prev) => Math.max(0, prev - 1))}
                    className="rounded-xl border border-[var(--border-color)] bg-white p-3 text-[var(--text-muted)] disabled:opacity-40"
                  >
                    <ChevronLeft size={28} />
                  </button>

                  <div className="grid flex-1 grid-cols-1 gap-5 xl:grid-cols-3">
                    {pagedJobs.map((job) => (
                      <article key={job.id} className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <h3 className="!mb-0 text-2xl font-semibold text-[var(--text-primary)]">{job.title}</h3>
                          <span className={`rounded-full px-4 py-1 text-base font-semibold ${getStatusClass(job.status)}`}>{job.status}</span>
                        </div>
                        {summaryForPosting(job.id) && <p className="!mb-3 text-lg text-[var(--text-secondary)]">{summaryForPosting(job.id)}</p>}
                        <p className="!mb-1 flex items-center gap-2 text-base text-[var(--text-secondary)]"><Building2 size={18} /> {job.department}</p>
                        <p className="!mb-1 flex items-center gap-2 text-base text-[var(--text-secondary)]"><Calendar size={18} /> Posted {formatDate(job.created_at)}</p>
                        <p className="!mb-5 flex items-center gap-2 text-base text-[var(--text-secondary)]"><Users size={18} /> {job.applicant_count} Applicants</p>

                        <Button className="mb-3 w-full !py-3 text-base" onClick={() => navigate(`/interviewer/applicants?position=${encodeURIComponent(job.title)}`)}>
                          View Applicants <ChevronRight size={16} />
                        </Button>

                        <button
                          type="button"
                          className="mb-3 w-full rounded-xl border border-orange-300 py-3 text-base text-orange-600"
                          onClick={() => handleToggleJobStatus(job)}
                        >
                          <Lock size={16} className="mr-2 inline-block" />
                          {job.status === 'Closed' ? 'Reopen Application' : 'Close Application'}
                        </button>

                        <button
                          type="button"
                          className="w-full rounded-xl border border-red-300 py-3 text-base text-red-600"
                          onClick={() => handleDeleteJob(job)}
                        >
                          <Trash2 size={16} className="mr-2 inline-block" /> Delete
                        </button>
                      </article>
                    ))}
                    {pagedJobs.length === 0 && <p className="col-span-full text-center text-base text-[var(--text-secondary)]">No job postings found.</p>}
                  </div>

                  <button
                    type="button"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setJobsPage((prev) => Math.min(pageCount - 1, prev + 1))}
                    className="rounded-xl border border-[var(--border-color)] bg-white p-3 text-[var(--text-muted)] disabled:opacity-40"
                  >
                    <ChevronRight size={28} />
                  </button>
                </section>
              </>
            )}

            {section === 'qualified' && (
              <QualifiedApplicantsSection
                applicants={applicants}
                completedEvaluationIds={completedEvaluationIds}
              />
            )}

            {section === 'applicant-score' && (
              <QualifiedApplicantsSection
                applicants={applicants}
                completedEvaluationIds={completedEvaluationIds}
              />
            )}

            {section === 'new-hired' && (
              <>
                <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                  <article className="rounded-2xl border border-[var(--border-color)] bg-white p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="!mb-2 !text-xs text-[var(--text-secondary)]">Total Newly Hired</p>
                        <p className="!mb-0 !text-xl font-bold">{newlyHiredApplicants.length}</p>
                      </div>
                      <div className="rounded-2xl bg-blue-100 p-3 text-blue-600"><UserPlus size={22} /></div>
                    </div>
                  </article>
                  <article className="rounded-2xl border border-[var(--border-color)] bg-white p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="!mb-2 !text-xs text-[var(--text-secondary)]">With Credentials</p>
                        <p className="!mb-0 !text-xl font-bold text-green-600">{newlyHiredApplicants.filter((a) => completedEvaluationIds.has(a.id)).length}</p>
                      </div>
                      <div className="rounded-2xl bg-green-100 p-3 text-green-600"><UserCheck size={22} /></div>
                    </div>
                  </article>
                  <article className="rounded-2xl border border-[var(--border-color)] bg-white p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="!mb-2 !text-xs text-[var(--text-secondary)]">Pending Credentials</p>
                        <p className="!mb-0 !text-xl font-bold text-orange-600">{newlyHiredApplicants.filter((a) => !completedEvaluationIds.has(a.id)).length}</p>
                      </div>
                      <div className="rounded-2xl bg-orange-100 p-3 text-orange-600"><Lock size={22} /></div>
                    </div>
                  </article>
                </section>

                <h2 className="!mb-3 !text-xl font-semibold">Departments</h2>
                <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                  {departmentsSummary.map((department) => (
                    <article key={department.department} className="flex items-center gap-4 rounded-2xl border border-[var(--border-color)] bg-white p-5">
                      <div className="rounded-2xl bg-blue-100 p-3 text-blue-600"><Building2 size={22} /></div>
                      <div className="flex-1">
                        <p className="!mb-1 !text-lg font-semibold text-[var(--text-primary)]">{department.department}</p>
                        <p className="!mb-0 !text-sm text-[var(--text-secondary)]">{department.hires} Newly Hired</p>
                        <p className="!mb-0 !text-sm text-[var(--text-secondary)]">{department.pending} pending</p>
                      </div>
                      <ChevronRight size={20} className="text-[var(--text-muted)]" />
                    </article>
                  ))}
                  {departmentsSummary.length === 0 && <p className="col-span-full text-base text-[var(--text-secondary)]">No newly hired records found.</p>}
                </section>
              </>
            )}

            {section === 'raters' && (
              <>
                <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                  <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="!mb-2 text-base text-[var(--text-secondary)]">Total Raters</p>
                        <p className="!mb-0 text-3xl font-bold">{raters.length}</p>
                      </div>
                      <div className="rounded-2xl bg-blue-100 p-4 text-blue-600"><Users size={28} /></div>
                    </div>
                  </article>
                  <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="!mb-2 text-base text-[var(--text-secondary)]">Active Raters</p>
                        <p className="!mb-0 text-3xl font-bold text-green-600">{raters.filter((r) => r.is_active).length}</p>
                      </div>
                      <div className="rounded-2xl bg-green-100 p-4 text-green-600"><UserCheck size={28} /></div>
                    </div>
                  </article>
                  <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="!mb-2 text-base text-[var(--text-secondary)]">Inactive Raters</p>
                        <p className="!mb-0 text-3xl font-bold text-slate-600">{raters.filter((r) => !r.is_active).length}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-100 p-4 text-slate-600"><Clock3 size={28} /></div>
                    </div>
                  </article>
                </section>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-3">
                    <Button className="!px-6 !py-3 text-base" onClick={() => setShowRaterDialog(true)}>
                      <Plus size={18} /> Add New Rater
                    </Button>
                    <button type="button" className="rounded-xl border border-[var(--border-color)] bg-white px-6 py-3 text-base text-[var(--text-secondary)]">
                      <Download size={18} className="mr-2 inline-block" /> Download Rater List
                    </button>
                  </div>
                  <div className="flex w-full gap-3 xl:w-auto">
                    <div className="relative flex-1 xl:w-80">
                      <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        value={raterSearch}
                        onChange={(e) => setRaterSearch(e.target.value)}
                        placeholder="Search raters..."
                        className="w-full rounded-xl border border-[var(--border-color)] py-3 pl-11 pr-4 text-lg"
                      />
                    </div>
                    <select value={raterStatus} onChange={(e) => setRaterStatus(e.target.value)} className="rounded-xl border border-[var(--border-color)] px-4 py-3 text-lg">
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <section className="abyan-table-wrap">
                  <table className="abyan-table w-full">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-600">
                      <tr>
                        <th className="px-5 py-4">Rater Name</th>
                        <th className="px-5 py-4">Designation / Position</th>
                        <th className="px-5 py-4">Access Role</th>
                        <th className="px-5 py-4">Assigned Job Position(s)</th>
                        <th className="px-5 py-4">Last Login</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRaters.map((rater) => (
                        <tr key={rater.id} className="border-t border-[var(--border-color)] text-base align-middle hover:bg-slate-50/40">
                          <td className="px-5 py-4 font-semibold text-slate-900">{rater.name}</td>
                          <td className="px-5 py-4 text-slate-600">{rater.department}</td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">Interviewer</span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                              {((raterAssignedPositionsByEmail[normalizeEmailKey(rater.email)] || []).length > 0
                                ? raterAssignedPositionsByEmail[normalizeEmailKey(rater.email)]
                                : ['--']
                              ).slice(0, 3).map((position) => (
                                <span
                                  key={`${rater.id}-${position}`}
                                  className={`${position === '--' ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-blue-100 bg-blue-50 text-blue-700'} rounded-md border px-2.5 py-1 text-sm font-medium`}
                                >
                                  {position}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-slate-600">{rater.last_login ? formatDate(rater.last_login) : '--'}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${rater.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                              {rater.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${rater.is_active ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                                onClick={() => handleToggleRaterAccess(rater)}
                              >
                                {rater.is_active ? 'Revoke Access' : 'Grant Access'}
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                                onClick={() => handleDeleteRater(rater.id)}
                              >
                                <Trash2 size={14} className="mr-1.5" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredRaters.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-5 py-8 text-center text-base text-[var(--text-secondary)]">No raters found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </section>
              </>
            )}

            {section === 'accounts' && (
              <>
                {accountsView === 'directory' ? (
                  <>
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-slate-500">{officeDirectoryTotalEmployees} total employees</p>
                    </div>

                    <ErrorBanner error={officeDirectoryError} action="load the office directory" onRetry={() => setOfficeDirectoryAttempt((n) => n + 1)} />

<Modal
                    open={showPositionChangeModal && Boolean(selectedEmployeeDetails)}
                    onClose={() => setShowPositionChangeModal(false)}
                    size="lg"
                    title="Change Position"
                    subtitle={selectedEmployeeDetails ? `Update position for ${selectedEmployeeDetails.full_name}` : undefined}
                    footer={(
                      <>
                        <button type="button" className="btn btn-md btn-secondary" onClick={() => setShowPositionChangeModal(false)}>Cancel</button>
                        <button type="button" className="btn btn-md btn-primary" onClick={() => setShowPositionChangeModal(false)}>Apply Position Change</button>
                      </>
                    )}
                  >
                  {selectedEmployeeDetails && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 xl:grid-cols-2">
                            <div>
                              <p className="!mb-1 text-lg text-[var(--text-secondary)]">Current Position</p>
                              <p className="!mb-0 text-xl font-semibold text-[var(--text-primary)]">{selectedEmployeeDetails.position || '--'}</p>
                            </div>
                            <div>
                              <p className="!mb-1 text-lg text-[var(--text-secondary)]">Current Department</p>
                              <p className="!mb-0 text-xl font-semibold text-[var(--text-primary)]">{selectedEmployeeDetails.office || '--'}</p>
                            </div>
                          </div>

                          <div>
                            <p className="!mb-2 text-xl font-semibold text-[var(--text-primary)]">Change Type <span className="text-red-500">*</span></p>
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                              {[
                                { id: 'promotion', label: 'Promotion' },
                                { id: 'succession', label: 'Succession' },
                                { id: 'transfer', label: 'Transfer' },
                              ].map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => setPositionChangeForm((prev) => ({ ...prev, changeType: option.id as 'promotion' | 'succession' | 'transfer' }))}
                                  className={`rounded-xl border px-4 py-3 text-lg font-semibold ${positionChangeForm.changeType === option.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-[var(--border-color)] text-[var(--text-secondary)]'}`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xl font-semibold text-[var(--text-primary)]">New Position <span className="text-red-500">*</span></label>
                              <select
                                value={positionChangeForm.newPosition}
                                onChange={(event) => {
                                  const nextPosition = event.target.value;
                                  const nextDept = resolveDepartmentForPosition(nextPosition);
                                  setPositionChangeForm((prev) => ({
                                    ...prev,
                                    newPosition: nextPosition,
                                    newDepartment: nextDept,
                                  }));
                                }}
                                className="w-full rounded-xl border border-[var(--border-color)] px-4 py-3 text-xl"
                              >
                                <option value="">Select a position</option>
                                {ALL_EMPLOYEE_POSITIONS.map((position) => (
                                  <option key={position} value={position}>{position}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="mb-1 block text-xl font-semibold text-[var(--text-primary)]">New Department <span className="text-red-500">*</span></label>
                              <select
                                value={positionChangeForm.newDepartment}
                                disabled
                                className="w-full rounded-xl border border-[var(--border-color)] bg-slate-100 px-4 py-3 text-xl cursor-not-allowed"
                              >
                                {employeeDirectoryDepartments.map((department) => (
                                  <option key={department} value={department}>{department}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="mb-1 block text-xl font-semibold text-[var(--text-primary)]">Effective Date <span className="text-red-500">*</span></label>
                            <input
                              type="date"
                              value={positionChangeForm.effectiveDate}
                              onChange={(event) => setPositionChangeForm((prev) => ({ ...prev, effectiveDate: event.target.value }))}
                              className="w-full rounded-xl border border-[var(--border-color)] px-4 py-3 text-xl"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-xl font-semibold text-[var(--text-primary)]">Notes / Justification</label>
                            <textarea
                              rows={4}
                              value={positionChangeForm.notes}
                              onChange={(event) => setPositionChangeForm((prev) => ({ ...prev, notes: event.target.value }))}
                              placeholder="Enter any additional notes or justification for this position change..."
                              className="w-full rounded-xl border border-[var(--border-color)] px-4 py-3 text-xl"
                            />
                          </div>

                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-800">
                            <strong>Note:</strong> This action will update the employee's position and department. All related records will be updated accordingly.
                          </div>
                        </div>
                  )}
                  </Modal>
                <section>
                      <div className="abyan-table-wrap">
                        <table className="abyan-table w-full min-w-full">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Office / Department</th>
                              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department Head</th>
                              <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Employees</th>
                            </tr>
                          </thead>
                          <tbody className={tableBodyClass(false)}>
                            {officeDirectoryLoading || showOfficeDirectoryLoader ? (
                              <TableSkeletonRows show={showOfficeDirectoryLoader} columns={3} label="Loading offices…" />
                            ) : (
                              <>
                                {paginatedOfficeDirectoryRows.map((row) => (
                                  <tr
                                    key={row.officeId}
                                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0 cursor-pointer"
                                    onClick={() => openOfficeEmployees(row.officeName)}
                                  >
                                    <td className="px-5 py-4">
                                      <span className="inline-flex items-center gap-1.5 font-semibold text-sm text-slate-900"><MapPin size={13} className="text-slate-400" /> {row.officeName}</span>
                                    </td>
                                    <td className="px-5 py-4 text-sm">
                                      {row.deptHead ? (
                                        <div>
                                          <p className="!mb-0 font-medium text-slate-700">{row.deptHead.name}</p>
                                          <p className="!mb-0 text-xs text-slate-400">{row.deptHead.contact}</p>
                                        </div>
                                      ) : (
                                        <span className="text-amber-600 text-xs font-semibold">Unassigned</span>
                                      )}
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                      <span className="font-bold text-slate-900 text-sm">{row.employeeCount}</span>
                                    </td>
                                  </tr>
                                ))}
                                {filteredOfficeDirectoryRows.length === 0 && (
                                  <tr>
                                    <td colSpan={3} className="px-5 py-12 text-center text-slate-500">
                                      <Briefcase className="mx-auto mb-2 h-9 w-9 text-slate-300" />
                                      <p className="font-medium">No offices found.</p>
                                    </td>
                                  </tr>
                                )}
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      <p className="!mb-0">
                        Showing {filteredOfficeDirectoryRows.length === 0 ? 0 : safeEmployeeDirectoryPage * EMPLOYEE_DIRECTORY_OFFICES_PER_PAGE + 1}-{Math.min((safeEmployeeDirectoryPage + 1) * EMPLOYEE_DIRECTORY_OFFICES_PER_PAGE, filteredOfficeDirectoryRows.length)} of {filteredOfficeDirectoryRows.length} offices
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          aria-label="Previous page"
                          className="rsp-pager inline-flex items-center justify-center rounded border border-slate-300 p-1 disabled:opacity-40"
                          onClick={() => setEmployeeDirectoryPage((current) => Math.max(0, current - 1))}
                          disabled={safeEmployeeDirectoryPage === 0 || filteredOfficeDirectoryRows.length === 0}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="font-semibold text-slate-800">Page {safeEmployeeDirectoryPage + 1} / {employeeDirectoryPageCount}</span>
                        <button
                          aria-label="Next page"
                          className="rsp-pager inline-flex items-center justify-center rounded border border-slate-300 p-1 disabled:opacity-40"
                          onClick={() => setEmployeeDirectoryPage((current) => Math.min(employeeDirectoryPageCount - 1, current + 1))}
                          disabled={safeEmployeeDirectoryPage >= employeeDirectoryPageCount - 1 || filteredOfficeDirectoryRows.length === 0}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </footer>
                  </>
                ) : accountsView === 'office' ? (
                  <>
                    <BackButton onBack={() => setAccountsView('directory')} />
                    <div>
                      <h2 className="!mb-0.5 text-xl font-bold text-[var(--text-primary)]">{selectedDirectoryCard?.office ?? 'Office'}</h2>
                      <p className="!mb-0 text-sm text-[var(--text-secondary)]">{selectedOfficeEmployees.length} employee{selectedOfficeEmployees.length === 1 ? '' : 's'}</p>
                    </div>

                    <section className="abyan-table-wrap">
                      <table className="abyan-table w-full">
                        <thead className="bg-slate-50 text-left">
                          <tr>
                            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Employee</th>
                            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedOfficeEmployees.map((employee) => {
                            const empNum = employeeNumberById.get(employee.id) ?? '';
                            const newHire = isNewlyHired(employee.hire_date);
                            return (
                              <tr key={employee.id} onClick={() => openEmployeeDetails(employee.id)} className="cursor-pointer hover:bg-slate-50 transition-colors">
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-2">
                                    <p className="!mb-0 font-semibold" style={{ color: '#040E6B' }}>{employee.full_name}</p>
                                    {newHire && (
                                      <span
                                        className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700"
                                        title={`Hired ${formatDate(employee.hire_date!)} — badge shows for ${NEWLY_HIRED_BADGE_DAYS} days`}
                                      >
                                        Newly Hired
                                      </span>
                                    )}
                                  </div>
                                  {empNum && <p className="!mb-0 mt-0.5 text-xs font-medium" style={{ color: '#363EE8' }}>{empNum}</p>}
                                  <p className="!mb-0 mt-0.5 text-xs text-slate-400">{employee.email || '--'}</p>
                                </td>
                                <td className="px-5 py-3.5 text-slate-600">{employee.position || '--'}</td>
                              </tr>
                            );
                          })}
                          {selectedOfficeEmployees.length === 0 && (
                            <tr>
                              <td colSpan={2} className="px-5 py-8 text-center text-sm text-slate-400">No employees found for this office.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </section>
                  </>
                ) : (
                  <>
                    <BackButton onBack={() => setAccountsView('office')} />
                    {/* Header — matches Applicant detail style */}
                    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                          <User size={24} className="text-blue-600" />
                        </div>
                        <div>
                          <h2 className="!mb-0.5 text-xl font-bold" style={{ color: '#040E6B' }}>
                            {selectedEmployeeDbName ?? selectedEmployeeDetails?.full_name ?? 'Employee'}
                          </h2>
                          <p className="!mb-2 text-sm text-slate-500">{selectedEmployeeDbRecord?.position ?? selectedEmployeeDetails?.position ?? '—'}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${(selectedEmployeeDbRecord?.status ?? selectedEmployeeDetails?.status)?.toLowerCase().includes('inactive') ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {(selectedEmployeeDbRecord?.status ?? selectedEmployeeDetails?.status)?.toLowerCase().includes('inactive') ? 'Inactive' : 'Active'}
                            </span>
                            {(selectedEmployeeDbRecord?.employee_number ?? (selectedEmployeeDetails && employeeNumberById.get(selectedEmployeeDetails.id))) && (
                              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                {selectedEmployeeDbRecord?.employee_number ?? employeeNumberById.get(selectedEmployeeDetails!.id)}
                              </span>
                            )}
                            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                              {selectedEmployeeDbRecord?.department ?? selectedEmployeeDetails?.office ?? 'Unassigned Office'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowPositionChangeModal(true)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => { void openResetPwModal(); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <Lock size={13} /> Reset Password
                        </button>
                      </div>
                    </div>

                    {/* Tab bar — matches Applicant detail style */}
                    <div className="flex items-center gap-0 border-b border-slate-200">
                      <button
                        type="button"
                        onClick={() => setEmployeeDetailsTab('personal')}
                        className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${employeeDetailsTab === 'personal' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        <User size={14} /> Overview
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmployeeDetailsTab('documents')}
                        className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${employeeDetailsTab === 'documents' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        <FileText size={14} /> Documents
                        {selectedEmployeeDocuments.length > 0 && (
                          <span className="ml-0.5 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{selectedEmployeeDocuments.length}</span>
                        )}
                      </button>
                    </div>

                    {/* Overview tab content */}
                    {employeeDetailsTab === 'personal' ? (
                      <div className="space-y-4">
                        {/* Personal Information */}
                        <section className="rounded-2xl border border-slate-200 bg-white p-5">
                          <h3 className="!mb-4 text-xs font-bold uppercase tracking-widest" style={{ color: '#363EE8' }}>Personal Information</h3>
                          <div className="divide-y divide-slate-100">
                            {([
                              ['Full Name', selectedEmployeeDbName ?? selectedEmployeeDetails?.full_name],
                              ['Email Address', selectedEmployeeProfile?.email],
                              ['Phone Number', selectedEmployeeProfile?.phone],
                              ['Address', selectedEmployeeProfile?.address],
                              ['Date of Birth', selectedEmployeeProfile?.dateOfBirth],
                              ['Place of Birth', selectedEmployeeProfile?.placeOfBirth],
                              ['Age', selectedEmployeeProfile?.age],
                              ['Sex', selectedEmployeeProfile?.sex],
                              ['Civil Status', selectedEmployeeProfile?.civilStatus],
                            ] as [string, string | null | undefined][]).map(([label, value]) => (
                              <div key={label} className="flex items-center justify-between py-3">
                                <p className="!mb-0 text-sm text-slate-500">{label}</p>
                                <p className="!mb-0 text-sm font-medium" style={{ color: '#040E6B' }}>{value || '—'}</p>
                              </div>
                            ))}
                          </div>
                        </section>

                        {/* Employment Details */}
                        <section className="rounded-2xl border border-slate-200 bg-white p-5">
                          <h3 className="!mb-4 text-xs font-bold uppercase tracking-widest" style={{ color: '#363EE8' }}>Employment Details</h3>
                          <div className="divide-y divide-slate-100">
                            {([
                              ['Employee Number', selectedEmployeeDbRecord?.employee_number ?? (selectedEmployeeDetails ? (employeeNumberById.get(selectedEmployeeDetails.id) ?? null) : null)],
                              ['Position', selectedEmployeeDbRecord?.position ?? selectedEmployeeDetails?.position],
                              ['Department / Office', selectedEmployeeDbRecord?.department ?? selectedEmployeeDetails?.office],
                              ['Date Hired', selectedEmployeeProfile?.dateHired],
                              ['Employment Status', (selectedEmployeeDbRecord?.status ?? selectedEmployeeDetails?.status)?.toLowerCase().includes('inactive') ? 'Inactive' : 'Active'],
                            ] as [string, string | null | undefined][]).map(([label, value]) => (
                              <div key={label} className="flex items-center justify-between py-3">
                                <p className="!mb-0 text-sm text-slate-500">{label}</p>
                                <p className="!mb-0 text-sm font-medium" style={{ color: '#040E6B' }}>{value || '—'}</p>
                              </div>
                            ))}
                          </div>
                        </section>

                        {/* Emergency Contact */}
                        <section className="rounded-2xl border border-slate-200 bg-white p-5">
                          <h3 className="!mb-4 text-xs font-bold uppercase tracking-widest" style={{ color: '#363EE8' }}>Emergency Contact</h3>
                          <div className="divide-y divide-slate-100">
                            {([
                              ['Contact Person', selectedEmployeeProfile?.emergencyContactName],
                              ['Relationship', selectedEmployeeProfile?.emergencyContactRelationship],
                              ['Phone Number', selectedEmployeeProfile?.emergencyContactPhone],
                            ] as [string, string | null | undefined][]).map(([label, value]) => (
                              <div key={label} className="flex items-center justify-between py-3">
                                <p className="!mb-0 text-sm text-slate-500">{label}</p>
                                <p className="!mb-0 text-sm font-medium" style={{ color: '#040E6B' }}>{value || '—'}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    ) : (
                      /* Documents tab content */
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="!mb-0.5 text-base font-bold" style={{ color: '#040E6B' }}>Document Requirements</h3>
                            <p className="!mb-0 text-sm text-slate-500">Manage and review employee document submissions</p>
                          </div>
                          <button type="button" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                            <FileText size={14} /> Request Document
                          </button>
                        </div>

                        {selectedEmployeeDocuments.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
                            No documents requested yet.
                          </div>
                        ) : selectedEmployeeDocuments.map((doc) => (
                          <article key={doc.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                            <div className="mb-2 flex items-center gap-3">
                              <h4 className="!mb-0 text-sm font-bold" style={{ color: '#040E6B' }}>{doc.name}</h4>
                              {doc.status === 'awaiting_review' && <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">Awaiting Review</span>}
                              {doc.status === 'rejected' && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">Rejected</span>}
                              {doc.status === 'pending_submission' && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Pending Submission</span>}
                            </div>
                            <p className="!mb-2 text-xs text-slate-500">{doc.description}</p>
                            <p className="!mb-2 text-xs text-slate-400">
                              <Calendar size={11} className="mr-1 inline" /> Requested: {doc.requestedAt}
                              {' · '}
                              <Calendar size={11} className="mr-1 inline" /> Due: {doc.dueAt}
                              {doc.submittedAt && (
                                <> · <Download size={11} className="mr-1 inline" /> Submitted: {doc.submittedAt}</>
                              )}
                            </p>
                            {doc.status === 'awaiting_review' && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" className="inline-flex items-center gap-1 rounded-xl bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700"><Eye size={13} /> View Document</button>
                                <button type="button" className="inline-flex items-center gap-1 rounded-xl bg-green-600 px-3 py-1.5 text-xs font-semibold text-white"><Check size={13} /> Approve</button>
                                <button type="button" className="inline-flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"><X size={13} /> Request Resubmission</button>
                              </div>
                            )}
                            {doc.status === 'rejected' && (
                              <>
                                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                                  <strong>Rejection Reason:</strong> {doc.rejectionReason}
                                </div>
                                <p className="!mb-0 mt-2 text-xs font-semibold text-red-700">
                                  <AlertCircle size={12} className="mr-1 inline" /> Awaiting resubmission from employee
                                </p>
                              </>
                            )}
                          </article>
                        ))}
                      </div>
                    )}

                    <Modal
                    open={showPositionChangeModal && Boolean(selectedEmployeeDetails)}
                    onClose={() => setShowPositionChangeModal(false)}
                    size="lg"
                    title="Change Position"
                    subtitle={selectedEmployeeDetails ? `Update position for ${selectedEmployeeDetails.full_name}` : undefined}
                    footer={(
                      <>
                        <button type="button" className="btn btn-md btn-secondary" onClick={() => setShowPositionChangeModal(false)}>Cancel</button>
                        <button type="button" className="btn btn-md btn-primary" onClick={() => setShowPositionChangeModal(false)}>Apply Position Change</button>
                      </>
                    )}
                  >
                  {selectedEmployeeDetails && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 xl:grid-cols-2">
                              <div>
                                <p className="!mb-1 text-lg text-[var(--text-secondary)]">Current Position</p>
                                <p className="!mb-0 text-xl font-semibold text-[var(--text-primary)]">{selectedEmployeeDetails.position || '--'}</p>
                              </div>
                              <div>
                                <p className="!mb-1 text-lg text-[var(--text-secondary)]">Current Department</p>
                                <p className="!mb-0 text-xl font-semibold text-[var(--text-primary)]">{selectedEmployeeDetails.office || '--'}</p>
                              </div>
                            </div>

                            <div>
                              <p className="!mb-2 text-xl font-semibold text-[var(--text-primary)]">Change Type <span className="text-red-500">*</span></p>
                              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                                {[
                                  { id: 'promotion', label: 'Promotion' },
                                  { id: 'succession', label: 'Succession' },
                                  { id: 'transfer', label: 'Transfer' },
                                ].map((option) => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setPositionChangeForm((prev) => ({ ...prev, changeType: option.id as 'promotion' | 'succession' | 'transfer' }))}
                                    className={`rounded-xl border px-4 py-3 text-lg font-semibold ${positionChangeForm.changeType === option.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-[var(--border-color)] text-[var(--text-secondary)]'}`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-xl font-semibold text-[var(--text-primary)]">New Position <span className="text-red-500">*</span></label>
                                <select
                                  value={positionChangeForm.newPosition}
                                  onChange={(event) => {
                                    const nextPosition = event.target.value;
                                    const nextDept = resolveDepartmentForPosition(nextPosition);
                                    setPositionChangeForm((prev) => ({
                                      ...prev,
                                      newPosition: nextPosition,
                                      newDepartment: nextDept,
                                    }));
                                  }}
                                  className="w-full rounded-xl border border-[var(--border-color)] px-4 py-3 text-xl"
                                >
                                  <option value="">Select a position</option>
                                  {ALL_EMPLOYEE_POSITIONS.map((position) => (
                                    <option key={position} value={position}>{position}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-1 block text-xl font-semibold text-[var(--text-primary)]">New Department <span className="text-red-500">*</span></label>
                                <select
                                  value={positionChangeForm.newDepartment}
                                  disabled
                                  className="w-full rounded-xl border border-[var(--border-color)] bg-slate-100 px-4 py-3 text-xl cursor-not-allowed"
                                >
                                  {employeeDirectoryDepartments.map((department) => (
                                    <option key={department} value={department}>{department}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="mb-1 block text-xl font-semibold text-[var(--text-primary)]">Effective Date <span className="text-red-500">*</span></label>
                              <input
                                type="date"
                                value={positionChangeForm.effectiveDate}
                                onChange={(event) => setPositionChangeForm((prev) => ({ ...prev, effectiveDate: event.target.value }))}
                                className="w-full rounded-xl border border-[var(--border-color)] px-4 py-3 text-xl"
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-xl font-semibold text-[var(--text-primary)]">Notes / Justification</label>
                              <textarea
                                rows={4}
                                value={positionChangeForm.notes}
                                onChange={(event) => setPositionChangeForm((prev) => ({ ...prev, notes: event.target.value }))}
                                placeholder="Enter any additional notes or justification for this position change..."
                                className="w-full rounded-xl border border-[var(--border-color)] px-4 py-3 text-xl"
                              />
                            </div>

                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-800">
                              <strong>Note:</strong> This action will update the employee's position and department. All related records will be updated accordingly.
                            </div>
                          </div>
                  )}
                  </Modal>
                  </>
                )}
              </>
            )}

            {section === 'reports' && (
              <>
                {reportsView !== 'documents' && (
                  <RspArchives records={archiveRecords} onPurge={purgeArchivedRecord} onOpenAssessment={openAssessmentForms} />
                )}

                {reportsView === 'documents' && (
                  <section className="space-y-4">
                    <BackButton onBack={() => { setReportsView('overview'); setActiveDocumentTemplateId(null); }} />
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="!mb-1 !text-2xl font-bold text-[var(--text-primary)]">{activeDocumentTemplate?.name.replace(' (Statement of Assets, Liabilities and Net Worth)', '') || 'Employee Documents'}</h2>
                        <p className="!mb-0 !text-sm text-[var(--text-secondary)]">
                          {documentsLoading ? 'Loading submissions…' : `${activeDocumentSubmissions.length} total submissions across all departments`}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {totalSelectedDocumentSubmissions > 0 && (
                          <button
                            type="button"
                            onClick={() => setDocumentCollection(activeDocumentSubmissions.filter((entry) => selectedDocumentSubmissionIds.includes(entry.id)))}
                            className="btn btn-primary btn-md"
                          >
                            View Selected ({totalSelectedDocumentSubmissions})
                          </button>
                        )}
                        {totalSelectedDocumentSubmissions > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedDocumentSubmissionIds([])}
                            className="rounded-xl border border-[var(--border-color)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)]"
                          >
                            Clear Selection
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="rounded-xl border border-[var(--border-color)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)]"
                        >
                          Print
                        </button>
                      </div>
                    </div>

                    {documentsError && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
                        <p className="!mb-0" role="alert">{documentsError}</p>
                      </div>
                    )}

                    {!documentsError && !documentsLoading && documentSubmissionsByOffice.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-white p-8 text-center">
                        <p className="!mb-1 !text-base font-semibold text-[var(--text-primary)]">
                          No submissions yet for this document.
                        </p>
                        <p className="!mb-0 !text-sm text-[var(--text-secondary)]">
                          Employees can upload from the Employee Portal → Document Requirements.
                          Submissions appear here as soon as they're uploaded.
                        </p>
                      </div>
                    )}

                    {!documentsError && documentsLoading && documentSubmissionsByOffice.length === 0 && (
                      <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-white" aria-busy="true">
                        <SkeletonList show={showDocumentsLoader} rows={4} label="Loading submissions…" />
                      </div>
                    )}

                    <div className="space-y-3">
                      {documentSubmissionsByOffice.map((group) => {
                        const isExpanded = expandedDocumentOffices[group.office] ?? false;
                        return (
                          <article key={group.office} className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-white">
                            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                              <button
                                type="button"
                                onClick={() => toggleDocumentOffice(group.office)}
                                className="inline-flex items-center gap-2 text-left !text-lg font-semibold text-[var(--text-primary)]"
                              >
                                <ChevronRight size={20} className={`${isExpanded ? 'rotate-90' : ''} transition`} />
                                {group.office}
                                <span className="rounded-md bg-purple-100 px-2 py-1 text-sm font-semibold text-purple-700">{group.total} submitted</span>
                                {group.selected > 0 && <span className="rounded-md bg-purple-600 px-2 py-1 text-sm font-semibold text-white">{group.selected} selected</span>}
                              </button>

                              <div className="flex flex-wrap items-center gap-3 text-sm">
                                <button type="button" onClick={() => selectAllInOffice(group.office, true)} className="text-purple-600">Select All</button>
                                <button type="button" onClick={() => selectAllInOffice(group.office, false)} className="text-[var(--text-secondary)]">Deselect All</button>
                                <button
                                  type="button"
                                  onClick={() => setDocumentCollection(group.submissions)}
                                  className="btn btn-secondary btn-sm"
                                >
                                  View Documents
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="border-t border-[var(--border-color)] px-5 py-4">
                                <div className="space-y-3">
                                  {group.submissions.map((entry) => {
                                    const checked = selectedDocumentSubmissionIds.includes(entry.id);
                                    return (
                                      <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-color)] bg-slate-50 px-4 py-3">
                                        <label className="flex items-start gap-3">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleDocumentSubmission(entry.id)}
                                            className="mt-1 h-4 w-4"
                                          />
                                          <div>
                                            <p className="!mb-1 !text-base font-semibold text-[var(--text-primary)]">
                                              {entry.fullName} <span className="!text-xs font-normal text-[var(--text-secondary)]">{entry.employeeCode} • {entry.position}</span>
                                            </p>
                                            <p className="!mb-0 !text-sm text-[var(--text-secondary)]">Submitted: {entry.submittedDate}</p>
                                          </div>
                                        </label>

                                        <div className="flex items-center gap-3">
                                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${entry.status === 'Approved' ? 'bg-green-100 text-green-700' : entry.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {entry.status}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => setPreviewSubmission(entry)}
                                            disabled={!entry.documentUrl || entry.documentUrl === '#'}
                                            className="btn btn-secondary btn-sm"
                                          >
                                            View
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}

              </>
            )}

            {section === 'succession' && (
              <div className="space-y-5">
                {successionView === 'plan' ? <SuccessionPlanningPage /> : <EligibilityPointsPanel />}
              </div>
            )}

            {section === 'settings' && (
              <section className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="rounded-2xl border border-[var(--border-color)] bg-white p-3">
                  {SETTINGS_TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSettingsTab(tab.id)}
                        className={`mb-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base ${settingsTab === tab.id ? 'bg-blue-100 text-blue-700' : 'text-[var(--text-primary)] hover:bg-slate-50'}`}
                      >
                        <Icon size={22} /> {tab.label}
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                  <h3 className="!mb-1 text-2xl font-semibold">Profile Settings</h3>
                  <p className="!mb-5 text-lg text-[var(--text-secondary)]">Personal information is view-only in this screen.</p>

                  <div className="mb-6 flex items-center gap-4">
                    <div className="rounded-full bg-blue-100 p-4 text-blue-600"><User size={42} /></div>
                    <div>
                      <Button>Change Photo</Button>
                      <p className="!mb-0 mt-2 text-lg text-[var(--text-secondary)]">JPG, PNG or GIF. Max size 2MB</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-base font-semibold">First Name</label>
                      <input className="w-full rounded-xl border border-[var(--border-color)] bg-slate-50 p-3 text-base" value={profileForm.firstName} readOnly />
                    </div>
                    <div>
                      <label className="mb-2 block text-base font-semibold">Last Name</label>
                      <input className="w-full rounded-xl border border-[var(--border-color)] bg-slate-50 p-3 text-base" value={profileForm.lastName} readOnly />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-base font-semibold">Email Address</label>
                    <input className="w-full rounded-xl border border-[var(--border-color)] bg-slate-50 p-3 text-base" value={profileForm.email} readOnly />
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-base font-semibold">Role</label>
                    <input className="w-full rounded-xl border border-[var(--border-color)] bg-slate-50 p-3 text-base" value={profileForm.role} readOnly />
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-base font-semibold">Department</label>
                    <select className="w-full rounded-xl border border-[var(--border-color)] bg-slate-50 p-3 text-base" value={profileForm.department} disabled>
                      <option>Human Resource Management Office</option>
                      <option>Information Technology</option>
                      <option>Finance</option>
                      <option>Operations</option>
                    </select>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-base font-semibold">Bio</label>
                    <textarea className="w-full rounded-xl border border-[var(--border-color)] bg-slate-50 p-3 text-base" rows={4} value={profileForm.bio} readOnly placeholder="Tell us about yourself..." />
                  </div>
                </div>
              </section>
            )}
          </div>
        </main>

        {showRankingModal && activeRankingCard && (
          <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/45 p-4" onClick={closeRankingReport}>
            <div className="max-h-[95vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}>
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 text-white">
                <div>
                  <h2 className="!mb-1 text-3xl font-bold">Applicant Ranking Report</h2>
                  <p className="!mb-0 text-base font-medium">{activeRankingCard.position} • {activeRankingCard.department}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowHireApplicantsModal(true)}
                    className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600"
                  >
                    👥 Select Hired Applicants
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/30"
                  >
                    🖨️ Print Report
                  </button>
                  <button
                    type="button"
                    onClick={closeRankingReport}
                    className="rounded-lg border border-white/30 bg-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/30"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="max-h-[81vh] space-y-6 overflow-y-auto p-6">
                {/* Report Title and Metadata */}
                <div className="text-center">
                  <h1 className="!mb-2 !text-3xl font-bold text-gray-900">Ranking of Qualified Applicants</h1>
                  <p className="!mb-0 text-base text-blue-600 font-medium">(Qualified Applicants Only - Passed Pre-Assessment)</p>
                </div>

                {/* Position Details */}
                <div className="text-center">
                  <h2 className="!mb-1 !text-2xl font-semibold text-gray-900">{activeRankingCard.position}</h2>
                  <p className="!mb-0 text-base text-gray-600">{activeRankingCard.department}</p>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="rounded-lg border-2 border-blue-100 bg-blue-50 p-4">
                    <p className="!mb-2 text-xs font-semibold uppercase text-gray-600">Report Date</p>
                    <p className="!mb-0 !text-lg font-bold text-gray-900">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>
                  <div className="rounded-lg border-2 border-blue-100 bg-blue-50 p-4">
                    <p className="!mb-2 text-xs font-semibold uppercase text-gray-600">Appointment Type</p>
                    <p className="!mb-0 !text-lg font-bold text-gray-900">PROMOTION</p>
                  </div>
                  <div className="rounded-lg border-2 border-blue-100 bg-blue-50 p-4">
                    <p className="!mb-2 text-xs font-semibold uppercase text-gray-600">Total Qualified Applicants</p>
                    <p className="!mb-0 !text-lg font-bold text-gray-900">{activeRankingRows.length}</p>
                  </div>
                  <div className="rounded-lg border-2 border-blue-100 bg-blue-50 p-4">
                    <p className="!mb-2 text-xs font-semibold uppercase text-gray-600">Score Range</p>
                    <p className="!mb-0 !text-lg font-bold text-purple-600">{(rankingSummary.highest - rankingSummary.lowest).toFixed(2)}</p>
                  </div>
                </div>

                {/* Score Statistics Cards */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
                    <p className="!mb-2 text-xs font-semibold uppercase text-gray-600">Highest Score</p>
                    <p className="!mb-0 !text-3xl font-bold text-blue-600">{rankingSummary.highest.toFixed(2)}</p>
                    <span className="inline-block mt-2 text-xl">🏆</span>
                  </div>
                  <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4">
                    <p className="!mb-2 text-xs font-semibold uppercase text-gray-600">Average Score</p>
                    <p className="!mb-0 !text-3xl font-bold text-green-600">{rankingSummary.average.toFixed(2)}</p>
                    <span className="inline-block mt-2 text-xl">📊</span>
                  </div>
                  <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4">
                    <p className="!mb-2 text-xs font-semibold uppercase text-gray-600">Lowest Score</p>
                    <p className="!mb-0 !text-3xl font-bold text-orange-600">{rankingSummary.lowest.toFixed(2)}</p>
                    <span className="inline-block mt-2 text-xl">📌</span>
                  </div>
                  <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-4">
                    <p className="!mb-2 text-xs font-semibold uppercase text-gray-600">Score Range</p>
                    <p className="!mb-0 !text-3xl font-bold text-purple-600">{(rankingSummary.highest - rankingSummary.lowest).toFixed(2)}</p>
                    <span className="inline-block mt-2 text-xl">📈</span>
                  </div>
                </div>

                {/* Scoring Criteria */}
                <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
                  <h3 className="!mb-3 text-lg font-semibold text-gray-900">Scoring Criteria</h3>
                  <div className="flex flex-wrap justify-around gap-4 text-sm">
                    <div className="text-center">
                      <p className="!mb-1 font-semibold text-gray-900">Experience: 20%</p>
                    </div>
                    <div className="text-center">
                      <p className="!mb-1 font-semibold text-gray-900">Performance: 20%</p>
                    </div>
                    <div className="text-center">
                      <p className="!mb-1 font-semibold text-gray-900">Potential: 20%</p>
                    </div>
                    <div className="text-center">
                      <p className="!mb-1 font-semibold text-gray-900">Written: 20%</p>
                    </div>
                    <div className="text-center">
                      <p className="!mb-1 font-semibold text-gray-900">Interview: 20%</p>
                    </div>
                  </div>
                </div>

                {/* Rankings Table */}
                <div>
                  <h3 className="!mb-3 text-lg font-bold text-gray-900">Applicant Rankings</h3>
                  <div className="abyan-table-wrap">
                    <table className="abyan-table w-full min-w-[900px]">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold w-12">Rank</th>
                          <th className="px-4 py-3 text-left font-semibold">Name</th>
                          <th className="px-4 py-3 text-center font-semibold">Exp. (20%)</th>
                          <th className="px-4 py-3 text-center font-semibold">Perf. (20%)</th>
                          <th className="px-4 py-3 text-center font-semibold">Pot. (20%)</th>
                          <th className="px-4 py-3 text-center font-semibold">Written (20%)</th>
                          <th className="px-4 py-3 text-center font-semibold">Interview (20%)</th>
                          <th className="px-4 py-3 text-center font-semibold">Total Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeRankingRows.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-4 text-center text-gray-500">
                              No qualified applicants found for this position.
                            </td>
                          </tr>
                        ) : (
                          activeRankingRows.map((row, index) => {
                            const isTop = rankingTopIds.has(row.id);
                            return (
                              <tr key={row.id} className={topScorerRowClass(isTop)}>
                                <td className="px-4 py-3 font-bold text-gray-900">{index + 1}</td>
                                <td className="px-4 py-3 font-semibold text-gray-900">
                                  <span className="flex flex-wrap items-center gap-2">{row.fullName}{isTop && <TopScorerBadge />}</span>
                                </td>
                                <td className="px-4 py-3 text-center">{row.experience.toFixed(2)}</td>
                                <td className="px-4 py-3 text-center">{row.performance.toFixed(2)}</td>
                                <td className="px-4 py-3 text-center">{row.potential.toFixed(2)}</td>
                                <td className="px-4 py-3 text-center">{row.written.toFixed(2)}</td>
                                <td className="px-4 py-3 text-center">{row.interview.toFixed(2)}</td>
                                <td className="px-4 py-3 text-center font-bold text-[var(--color-primary-900)]">{row.total.toFixed(2)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Legend */}
                <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-4">
                  <h3 className="!mb-3 text-base font-semibold text-gray-900">Legend:</h3>
                  <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-6 rounded border-l-[3px] border-[var(--color-primary)] bg-[var(--color-primary-50)]" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}></div>
                      <TopScorerBadge />
                      <span className="text-sm text-gray-700">Highest total score for this position (ties are all marked)</span>
                    </div>
                  </div>
                </div>

                {/* Certification and Signatures */}
                <div className="space-y-4 border-t-2 border-slate-300 pt-6">
                  <p className="!mb-0 text-sm text-gray-700 text-justify">
                    This is to certify that the above ranking is based on the weighted scoring system as mandated by the Civil Service Commission and the Local Government Code.
                  </p>

                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="!mb-1 text-sm font-semibold text-gray-900">Prepared by:</p>
                      <div className="mt-8 border-t-2 border-gray-400"></div>
                      <p className="!mt-2 !mb-0 text-sm font-semibold text-gray-900">RSP Staff</p>
                      <p className="!mb-0 text-xs text-gray-600">Recruitment, Selection & Placement Division</p>
                    </div>
                    <div>
                      <p className="!mb-1 text-sm font-semibold text-gray-900">Reviewed by:</p>
                      <div className="mt-8 border-t-2 border-gray-400"></div>
                      <p className="!mt-2 !mb-0 text-sm font-semibold text-gray-900">HRMO Chief</p>
                      <p className="!mb-0 text-xs text-gray-600">Human Resource Management Office</p>
                    </div>
                  </div>

                  <p className="!mb-0 text-xs text-gray-500 text-center">
                    This is a system-generated report from the Human Resource Information System<br />
                    Generated on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {showHireApplicantsModal && (
          <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/45 p-4" onClick={() => setShowHireApplicantsModal(false)}>
            <div className="w-full max-w-3xl rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}>
              <div className="border-b border-[var(--border-color)] px-5 py-4">
                <h3 className="!mb-1 text-xl font-semibold text-[var(--text-primary)]">Select Applicants to Hire</h3>
                <p className="!mb-0 text-sm text-[var(--text-secondary)]">Choose applicants from ranked results to move to Newly Hired.</p>
              </div>
              <div className="max-h-[56vh] space-y-2 overflow-y-auto px-5 py-4">
                {activeRankingRows.length === 0 ? (
                  <p className="!mb-0 text-sm text-[var(--text-secondary)]">No applicants available.</p>
                ) : (
                  activeRankingRows.map((row, index) => (
                    <label key={row.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--border-color)] px-3 py-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedHireApplicantIds.includes(row.id)}
                          onChange={() => toggleHireApplicantSelection(row.id)}
                          className="h-4 w-4"
                        />
                        <div>
                          <p className="!mb-0 text-sm font-semibold text-[var(--text-primary)]">#{index + 1} {row.fullName}</p>
                          <p className="!mb-0 text-xs text-[var(--text-secondary)]">{row.email}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{row.total.toFixed(2)}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowHireApplicantsModal(false)}
                  className="rounded-lg border border-[var(--border-color)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmHireApplicants}
                  disabled={selectedHireApplicantIds.length === 0}
                  className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Hire Selected ({selectedHireApplicantIds.length})
                </button>
              </div>
            </div>
          </div>
        )}

        <Modal
          open={showAssessmentFormsModal}
          onClose={closeAssessmentForms}
          size="xl"
          flush
          printable
          title={activeAssessmentCard ? `Assessment Forms - ${activeAssessmentCard.position}` : 'No assessment forms available'}
          subtitle={activeAssessmentCard
            ? `${activeAssessmentCard.department} • ${activeAssessmentApplicants.length} applicant${activeAssessmentApplicants.length === 1 ? '' : 's'}`
            : undefined}
          footer={(
            <>
              <button type="button" onClick={closeAssessmentForms} className="btn btn-md btn-secondary">Close</button>
              {activeAssessmentCard && (
                <button type="button" onClick={() => window.print()} className="btn btn-md btn-primary">Print All Forms</button>
              )}
            </>
          )}
        >
              {!activeAssessmentCard ? (
                <div className="flex h-full items-center justify-center p-8 text-center">
                  <p className="!mb-0 text-base text-[var(--text-secondary)]">
                    {activeAssessmentPosition ? `Position "${activeAssessmentPosition}" not found in database` : 'Please select a position'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="assessment-print-scroll h-full overflow-y-auto">
                    <div className="assessment-print-no border-b border-[var(--border-color)] px-6 py-5">
                      <p className="!mb-2 text-xl font-semibold text-[var(--text-primary)]">Filter by Status:</p>
                      <div className="flex flex-wrap gap-2">
                        {([
                          { key: 'all', label: 'All Applicants', count: assessmentFilterCounts.all, activeClass: 'bg-blue-600 text-white border-blue-600' },
                          { key: 'qualified', label: 'Qualified', count: assessmentFilterCounts.qualified, activeClass: 'bg-blue-600 text-white border-blue-600' },
                          { key: 'hired', label: 'Hired', count: assessmentFilterCounts.hired, activeClass: 'bg-green-600 text-white border-green-600' },
                          { key: 'disqualified', label: 'Disqualified', count: assessmentFilterCounts.disqualified, activeClass: 'bg-red-600 text-white border-red-600' },
                        ] as Array<{ key: AssessmentStatusFilter; label: string; count: number; activeClass: string }>).map((tab) => {
                          const active = assessmentStatusFilter === tab.key;
                          return (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => setAssessmentStatusFilter(tab.key)}
                              className={`rounded-xl border px-4 py-2 text-lg font-semibold ${active ? tab.activeClass : 'border-[var(--border-color)] bg-white text-[var(--text-primary)]'}`}
                            >
                              {tab.label} <span className="ml-2 rounded-full bg-black px-2 py-[2px] text-sm text-white">{tab.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="assessment-print-no border-b border-[var(--border-color)] px-6 py-4">
                      <input
                        type="text"
                        value={assessmentSearch}
                        onChange={(event) => setAssessmentSearch(event.target.value)}
                        placeholder="Search applicant by name to jump to their form..."
                        className="w-full rounded-xl border border-[var(--border-color)] px-4 py-3 text-xl"
                      />
                    </div>

                    <div className="space-y-4 px-6 py-5">
                      {filteredAssessmentApplicants.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-slate-50 p-8 text-center text-lg text-[var(--text-secondary)]">
                          No applicants match the selected status/filter.
                        </div>
                      ) : (
                        filteredAssessmentApplicants.map((applicant, index) => {

                          const bucket = toAssessmentStatusBucket(applicant.status);
                          const badgeClass =
                            bucket === 'hired'
                              ? 'bg-green-100 text-green-700'
                              : bucket === 'disqualified'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-blue-100 text-blue-700';


                          const storedScores = loadStoredCategoryScores();
                          const storedBase = storedScores[applicant.id] || {};
                          const evalRow = (() => {
                            const map = (window as any).__evaluationsByApplicantId;
                            if (!map || typeof map.get !== 'function') {
                              console.log('[EVAL LOOKUP] ✗ No eval map for:', applicant.full_name);
                              return null;
                            }

                            // Try direct ID match first
                            const result = map.get(String(applicant.id).trim()) ?? null;
                            if (result) {
                              console.log('[EVAL LOOKUP] ✓ Found by direct ID for:', applicant.full_name, 'personality_score:', result.personality_score);
                              return result;
                            }

                            // Try case-insensitive ID match
                            const idLower = String(applicant.id).trim().toLowerCase();
                            for (const [key, value] of map.entries()) {
                              if (String(key).trim().toLowerCase() === idLower) {
                                console.log('[EVAL LOOKUP] ✓ Found by case-insensitive ID for:', applicant.full_name);
                                return value;
                              }
                            }

                            // Try email-based match
                            const appEmail = String(applicant.email).trim().toLowerCase();
                            if (appEmail) {
                              for (const [, value] of map.entries()) {
                                if (String(value?.email ?? '').trim().toLowerCase() === appEmail) {
                                  console.log('[EVAL LOOKUP] ✓ Found by email for:', applicant.full_name, 'personality_score:', value?.personality_score);
                                  return value;
                                }
                              }
                            }

                            console.log('[EVAL LOOKUP] ✗ No eval found for:', applicant.full_name, 'ID:', String(applicant.id).substring(0, 8) + '...', 'Email:', appEmail);
                            return null;
                          })() as any;

                          // Merge interviewer evaluation fields as fallback for missing RSP/admin values
                          const stored = { ...storedBase };
                          if (evalRow) {
                            // Written Exam
                            if (!stored.writtenExam && typeof evalRow.written_exam === 'number') {
                              stored.writtenExam = { finalScore: evalRow.written_exam };
                            }
                            // Oral Exam
                            if (!stored.oralExam) {
                              if (typeof evalRow.oral_exam === 'number') {
                                stored.oralExam = { finalScore: evalRow.oral_exam };
                              } else {
                                // Fallback: compute from component scores if present
                                // CRITICAL: personality_score can be PCPT (6-30) or oral (1-5)
                                // Only include it if it's in oral range (1-5)
                                const oralScores = [
                                  evalRow.communication_skills_score,
                                  evalRow.confidence_score,
                                  evalRow.comprehension_score,
                                  // Only include personality_score if it's oral-range (1-5), not PCPT-range (6-30)
                                  typeof evalRow.personality_score === 'number' && evalRow.personality_score > 0 && evalRow.personality_score < 6
                                    ? evalRow.personality_score
                                    : undefined,
                                  evalRow.job_knowledge_score,
                                  evalRow.overall_impression_score,
                                ];
                                const numeric = oralScores.filter((v) => typeof v === 'number') as number[];
                                if (numeric.length > 0) {
                                  // Sum of 6 scores (max 5 each = max 30), normalize to 0-100 range
                                  const total = numeric.reduce((sum, v) => sum + v, 0);
                                  const normalized = Math.min(100, (total / 30) * 100);
                                  console.log('[ORAL DEBUG] Computed oral from components:', {
                                    scores: numeric,
                                    total,
                                    normalized,
                                    hasOralPersonality: numeric.some(v => v === evalRow.personality_score)
                                  });
                                  stored.oralExam = { finalScore: normalized };
                                }
                              }
                            }
                            // PCPT
                            if (!stored.pcpt && typeof evalRow.personality_score === 'number') {
                              stored.pcpt = { finalScore: evalRow.personality_score };
                            }
                            // Performance
                            if (!stored.performance && typeof evalRow.performance_rating === 'number') {
                              stored.performance = { finalScore: evalRow.performance_rating };
                            }
                            // Potential
                            if (!stored.potential && typeof evalRow.potential_score === 'number') {
                              stored.potential = { finalScore: evalRow.potential_score };
                            }
                          }

                          // Helper for clamping
                          const clamp20 = (n: number) => Math.min(20, Math.max(0, n));

                          // Appointment type logic
                          const appointmentType = stored?.appointmentType || applicant.appointmentType || 'original';

                          // --- Education ---
                          // Assume educationLevel is a number 0-20 (or use mapping if needed)
                          const educationRaw = resolveScoreValue(stored?.education);
                          let educationScore = 0;
                          if (appointmentType === 'original' || appointmentType === 'promotional') {
                            educationScore = clamp20(educationRaw);
                          }

                          // --- Experience ---
                          const experienceRaw = resolveScoreValue(stored?.experience);
                          let experienceScore = 0;
                          if (appointmentType === 'original' || appointmentType === 'promotional') {
                            experienceScore = clamp20(experienceRaw);
                          }

                          // --- Written Exam (Original only) ---
                          let writtenExamScore = null;
                          let writtenExceedsTotal = false;
                          const writtenExamTotal = totalForPosition(examTotals, applicant.position);
                          if (appointmentType === 'original') {
                            let writtenRaw = resolveScoreValue(stored?.writtenExam);
                            // If missing, try interviewer evaluation
                            if ((!writtenRaw || writtenRaw <= 0) && typeof evalRow?.written_exam === 'number') {
                              writtenRaw = evalRow.written_exam;
                            }
                            // The configured total replaces the old fixed 30/35 maximum; a score
                            // above it is capped at the 20-point share and flagged on the form.
                            if (typeof writtenRaw === 'number' && writtenRaw > 0) {
                              const converted = convertExamScore(writtenRaw, writtenExamTotal, WRITTEN_EXAM_FORM_SHARE);
                              writtenExamScore = converted.points;
                              writtenExceedsTotal = converted.exceedsTotal;
                            }
                          }

                          // --- Oral Exam (Original only) ---
                          let oralExamScore = null;
                          if (appointmentType === 'original') {
                            let oralRaw = resolveScoreValue(stored?.oralExam);
                            // If missing, try interviewer evaluation
                            if ((!oralRaw || oralRaw <= 0) && typeof evalRow?.oral_exam === 'number') {
                              oralRaw = evalRow.oral_exam;
                            }
                            console.log('[ORAL EXAM DEBUG] oralRaw:', oralRaw, 'type:', typeof oralRaw);
                            oralExamScore = typeof oralRaw === 'number' && oralRaw > 0 ? clamp20((oralRaw / 100) * 20) : null;
                            if (oralExamScore) {
                              console.log('[ORAL EXAM DEBUG] oralRaw:', oralRaw, '→ oralExamScore:', oralExamScore);
                            } else {
                              console.log('[ORAL EXAM DEBUG] ✗ No oral exam score (oralRaw:', oralRaw, ')');
                            }
                          }

                          // --- Performance (Promotional only) ---
                          let performanceScore = null;
                          if (appointmentType === 'promotional') {
                            const perfRaw = resolveScoreValue(stored?.performance);
                            // finalScore is already the converted score (12 for VS, 14 for O)
                            performanceScore = typeof perfRaw === 'number' && perfRaw > 0 ? clamp20(perfRaw) : null;
                          }

                          // --- PCPT (both) ---
                          let pcptRaw = resolveScoreValue(stored?.pcpt);
                          // Fallback to interviewer row if not present
                          if ((!pcptRaw || pcptRaw <= 0) && typeof evalRow?.personality_score === 'number') {
                            // CRITICAL: personality_score can be two different scales:
                            // - PCPT sum: 6-30 (when interviewer filled PCPT tab)
                            // - Oral score: 1-5 (legacy or oral-only evaluation)
                            // Detect by range: if >= 6, it's PCPT; if < 6, it's oral

                            console.log('[PCPT DEBUG] evalRow.personality_score:', evalRow.personality_score, 'type:', typeof evalRow.personality_score);

                            if (evalRow.personality_score >= 6) {
                              // This is PCPT data (6-30 range)
                              pcptRaw = evalRow.personality_score;
                              console.log('[PCPT DEBUG] ✓ Detected as PCPT (range 6-30), pcptRaw:', pcptRaw);
                            } else if (evalRow.personality_score > 0 && evalRow.personality_score < 6) {
                              // This is oral personality score (1-5), convert to PCPT-like range
                              // Assume it's roughly representative, scale to 6-30 range
                              pcptRaw = Math.round((evalRow.personality_score / 5) * 24 + 6); // Maps 1-5 to 6-30
                              console.log('[PCPT DEBUG] ⚠ Detected as oral (1-5), scaling to PCPT range, pcptRaw:', pcptRaw);
                            }
                          }
                          let pcptScore = null;
                          if (typeof pcptRaw === 'number' && pcptRaw > 0) {
                            pcptScore = clamp20((pcptRaw / 35) * 20);
                            console.log('[PCPT DEBUG] pcptRaw:', pcptRaw, '→ pcptScore:', pcptScore);
                          } else {
                            console.log('[PCPT DEBUG] ✗ No PCPT data (pcptRaw:', pcptRaw, ')');
                          }

                          // --- Potential (Promotional only) ---
                          let potentialScore = null;
                          if (appointmentType === 'promotional') {
                            const potRaw = resolveScoreValue(stored?.potential);
                            potentialScore = typeof potRaw === 'number' && potRaw > 0 ? clamp20((potRaw / 100) * 20) : null;
                          }

                          // --- Total Score ---
                          let totalScore = 0;
                          if (appointmentType === 'original') {
                            totalScore =
                              (educationScore || 0) +
                              (experienceScore || 0) +
                              (writtenExamScore || 0) +
                              (oralExamScore || 0) +
                              (pcptScore || 0);
                          } else {
                            totalScore =
                              (educationScore || 0) +
                              (experienceScore || 0) +
                              (performanceScore || 0) +
                              (pcptScore || 0) +
                              (potentialScore || 0);
                          }

                          return (
                            <article key={applicant.id} className="assessment-form-card space-y-3">
                              <div className="inline-flex items-center gap-3 rounded-xl bg-blue-100 px-4 py-2">
                                <p className="!mb-0 text-3xl font-semibold text-blue-800">Form {index + 1} of {filteredAssessmentApplicants.length}: {applicant.full_name}</p>
                                <span className={`rounded-md px-2 py-1 text-base font-semibold uppercase ${badgeClass}`}>{bucket === 'other' ? applicant.status : bucket}</span>
                              </div>

                              <div className="rounded-xl border-2 border-black bg-white p-5">
                                {/* Header */}
                                <div className="mb-4 rounded-md border-2 border-black p-5 text-center">
                                  <div className="mb-2 flex items-center justify-between">
                                    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-black text-center font-bold text-black">
                                      SEAL
                                    </div>
                                    <div>
                                      <p className="!mb-1 text-sm text-black font-bold">Republic of the Philippines</p>
                                      <p className="!mb-1 text-base font-bold text-black">CITY GOVERNMENT OF ILOILO</p>
                                      <p className="!mb-0 text-sm text-black">Iloilo City</p>
                                    </div>
                                    <div className="border-2 border-black p-3 text-center">
                                      <p className="!mb-1 text-xs font-bold text-black">CONTROL</p>
                                      <p className="!mb-0 text-base font-bold text-black">NO.</p>
                                      <p className="!mb-0 text-lg font-bold text-black">0001</p>
                                    </div>
                                  </div>
                                  <p className="!mb-1 text-base font-bold text-black">HUMAN RESOURCE MANAGEMENT OFFICE</p>
                                  <p className="!mb-0 text-sm text-black">APPLICANT ASSESSMENT REPORT</p>
                                </div>

                                {/* Position and Qualification */}
                                <div className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                                  <div className="rounded-md border-2 border-black p-3">
                                    <p className="!mb-1 text-sm font-semibold text-black">POSITION:</p>
                                    <p className="!mb-0 text-base font-semibold text-black">{activeAssessmentCard.position}</p>
                                  </div>
                                  <div className="rounded-md border-2 border-black p-3">
                                    <p className="!mb-1 text-sm font-semibold text-black">QUALIFICATION:</p>
                                    <div className="flex items-center gap-3">
                                      <input type="checkbox" checked={bucket !== 'disqualified'} readOnly className="h-4 w-4" />
                                      <span className="text-sm font-semibold text-black">Qualified</span>
                                      <input type="checkbox" checked={bucket === 'disqualified'} readOnly className="h-4 w-4 ml-4" />
                                      <span className="text-sm font-semibold text-black">Disqualified</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Applicant Name */}
                                <div className="mb-3 rounded-md border-2 border-black p-3">
                                  <p className="!mb-1 text-sm font-semibold text-black">NAME OF APPLICANT:</p>
                                  <p className="!mb-0 text-base font-semibold text-black">{applicant.full_name.toUpperCase()}</p>
                                </div>

                                {/* Pre-Assessment */}
                                {bucket !== 'disqualified' && (
                                  <div className="mb-3 rounded-md border-2 border-black">
                                    <p className="!mb-0 border-b-2 border-black bg-gray-200 px-3 py-2 text-base font-semibold text-black">PRE-ASSESSMENT</p>
                                    <div className="space-y-2 px-3 py-3 text-sm text-black">
                                      <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={true} readOnly />
                                        <span>Education (College Degree: Bachelor's or equivalent in relevant field)</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={true} readOnly />
                                        <span>Training (Training hours/certificates of specific trainings)</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={true} readOnly />
                                        <span>Experience (Years/months of relevant work experience)</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={true} readOnly />
                                        <span>Eligibility (CS Professional / Appropriate RA 1080)</span>
                                      </label>
                                    </div>
                                  </div>
                                )}

                                {/* Point-Based Assessment */}
                                <div className="abyan-table-wrap mb-3">
                                  <p className="!mb-0 border-b-2 border-black bg-gray-200 px-3 py-2 text-base font-semibold text-black">POINT-BASED ASSESSMENT</p>
                                  <table className="abyan-table w-full text-black">
                                    <thead>
                                      <tr>
                                        <th className="border-b-2 border-black px-3 py-2 text-left font-semibold">ASSESSMENT DATA</th>
                                        <th className="border-b-2 border-black border-l-2 px-3 py-2 text-center font-semibold w-20">Points</th>
                                        <th className="border-b-2 border-black border-l-2 px-3 py-2 text-center font-semibold w-24">Actual Score</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {/* Education */}
                                      <tr>
                                        <td colSpan={3} className="border-b-2 border-black px-3 py-2 font-semibold bg-gray-100">EDUCATION</td>
                                      </tr>
                                      <tr>
                                        <td className="border-b border-black px-3 py-2">Education Level Attainment</td>
                                        <td className="border-b border-l-2 border-black px-3 py-2 text-center">20</td>
                                        <td className="border-b border-l-2 border-black px-3 py-2 text-center font-semibold">{educationScore !== null ? educationScore.toFixed(2) : 'N/A'}</td>
                                      </tr>
                                      {/* Experience */}
                                      <tr>
                                        <td colSpan={3} className="border-b-2 border-black px-3 py-2 font-semibold bg-gray-100">EXPERIENCE</td>
                                      </tr>
                                      <tr>
                                        <td className="border-b border-black px-3 py-2">Relevant Work Experience</td>
                                        <td className="border-b border-l-2 border-black px-3 py-2 text-center">20</td>
                                        <td className="border-b border-l-2 border-black px-3 py-2 text-center font-semibold">{experienceScore !== null ? experienceScore.toFixed(2) : 'N/A'}</td>
                                      </tr>
                                      {/* Written Exam (Original only) */}
                                      {appointmentType === 'original' && (
                                        <>
                                          <tr>
                                            <td colSpan={3} className="border-b-2 border-black px-3 py-2 font-semibold bg-gray-100">WRITTEN EXAMINATION</td>
                                          </tr>
                                          <tr>
                                            <td className="border-b border-black px-3 py-2">Written Exam</td>
                                            <td className="border-b border-l-2 border-black px-3 py-2 text-center">20</td>
                                            <td className="border-b border-l-2 border-black px-3 py-2 text-center font-semibold">
                                              {writtenExamScore !== null ? writtenExamScore.toFixed(2) : 'N/A'}
                                              {writtenExceedsTotal && (
                                                <span className="block text-xs font-semibold">Score exceeds total ({writtenExamTotal})</span>
                                              )}
                                            </td>
                                          </tr>
                                        </>
                                      )}
                                      {/* Oral Exam (Original only) */}
                                      {appointmentType === 'original' && (
                                        <>
                                          <tr>
                                            <td colSpan={3} className="border-b-2 border-black px-3 py-2 font-semibold bg-gray-100">ORAL EXAMINATION</td>
                                          </tr>
                                          <tr>
                                            <td className="border-b border-black px-3 py-2">Oral Exam</td>
                                            <td className="border-b border-l-2 border-black px-3 py-2 text-center">20</td>
                                            <td className="border-b border-l-2 border-black px-3 py-2 text-center font-semibold">{oralExamScore !== null ? oralExamScore.toFixed(2) : 'N/A'}</td>
                                          </tr>
                                        </>
                                      )}
                                      {/* Performance (Promotional only) */}
                                      {appointmentType === 'promotional' && (
                                        <>
                                          <tr>
                                            <td colSpan={3} className="border-b-2 border-black px-3 py-2 font-semibold bg-gray-100">PERFORMANCE</td>
                                          </tr>
                                          <tr>
                                            <td className="border-b border-black px-3 py-2">Performance Rating (Last 2 Semesters)</td>
                                            <td className="border-b border-l-2 border-black px-3 py-2 text-center">20</td>
                                            <td className="border-b border-l-2 border-black px-3 py-2 text-center font-semibold">{performanceScore !== null ? performanceScore.toFixed(2) : 'N/A'}</td>
                                          </tr>
                                        </>
                                      )}
                                      {/* PCPT (both) */}
                                      <tr>
                                        <td colSpan={3} className="border-b-2 border-black px-3 py-2 font-semibold bg-gray-100">PSYCHOSOCIAL / COMPETENCY</td>
                                      </tr>
                                      <tr>
                                        <td className="border-b border-black px-3 py-2">PCPT Assessment</td>
                                        <td className="border-b border-l-2 border-black px-3 py-2 text-center">20</td>
                                        <td className="border-b border-l-2 border-black px-3 py-2 text-center font-semibold">{pcptScore !== null ? pcptScore.toFixed(2) : 'N/A'}</td>
                                      </tr>
                                      {/* Potential (Promotional only) */}
                                      {appointmentType === 'promotional' && (
                                        <>
                                          <tr>
                                            <td colSpan={3} className="border-b-2 border-black px-3 py-2 font-semibold bg-gray-100">POTENTIAL</td>
                                          </tr>
                                          <tr>
                                            <td className="border-b-2 border-black px-3 py-2">Potential Assessment</td>
                                            <td className="border-b-2 border-l-2 border-black px-3 py-2 text-center">20</td>
                                            <td className="border-b-2 border-l-2 border-black px-3 py-2 text-center font-semibold">{potentialScore !== null ? potentialScore.toFixed(2) : 'N/A'}</td>
                                          </tr>
                                        </>
                                      )}
                                      {/* Total */}
                                      <tr className="bg-gray-100">
                                        <td className="border-b-2 border-black px-3 py-2 text-right font-bold">TOTAL SCORE:</td>
                                        <td className="border-b-2 border-l-2 border-black px-3 py-2 text-center font-bold">100</td>
                                        <td className="border-b-2 border-l-2 border-black px-3 py-2 text-center font-bold text-lg">{totalScore.toFixed(2)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>

                                {/* Recommendation */}
                                {bucket !== 'disqualified' && (
                                  <div className="mb-3 rounded-md border-2 border-black">
                                    <p className="!mb-0 border-b-2 border-black bg-gray-200 px-3 py-2 text-base font-semibold text-black">RECOMMENDATION</p>
                                    <div className="space-y-2 px-3 py-3 text-sm text-black">
                                      <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={bucket === 'hired'} readOnly />
                                        <span className="font-semibold">For Hiring/Appointment</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <input type="checkbox" checked={bucket === 'qualified'} readOnly />
                                        <span>For Consideration</span>
                                      </label>
                                    </div>
                                  </div>
                                )}

                                {/* Remarks for Disqualified */}
                                {bucket === 'disqualified' && (
                                  <div className="mb-3 rounded-md border-2 border-black">
                                    <p className="!mb-0 border-b-2 border-black bg-gray-200 px-3 py-2 text-base font-semibold text-black">REMARKS:</p>
                                    <div className="px-3 py-3 text-sm text-black italic">
                                      Did not meet minimum qualifications. Pre-assessment completed only.
                                    </div>
                                  </div>
                                )}

                                {/* Signatures */}
                                <div className="space-y-3 text-sm text-black">
                                  <div className="border-t-2 border-black pt-3"></div>
                                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                                    <div>
                                      <p className="!mb-6 font-semibold">Assessed by:</p>
                                      <div className="border-b-2 border-black"></div>
                                      <p className="!mt-1 !mb-0 text-xs font-semibold">RSP Officer</p>
                                      <p className="!mb-0 text-xs">Date: __________</p>
                                    </div>
                                    {bucket !== 'disqualified' && (
                                      <div>
                                        <p className="!mb-6 font-semibold">Interviewed by:</p>
                                        <div className="border-b-2 border-black"></div>
                                        <p className="!mt-1 !mb-0 text-xs font-semibold">Dr. Maria Santos</p>
                                        <p className="!mb-0 text-xs">Interview Panel</p>
                                        <p className="!mb-0 text-xs">Date: __________</p>
                                      </div>
                                    )}
                                    <div>
                                      <p className="!mb-6 font-semibold">Reviewed by:</p>
                                      <div className="border-b-2 border-black"></div>
                                      <p className="!mt-1 !mb-0 text-xs font-semibold">HRMO Chief</p>
                                      <p className="!mb-0 text-xs">Date: __________</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
        </Modal>

        {showJobDialog && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 px-3 py-4" onClick={() => setShowJobDialog(false)}>
            <div className="flex h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between bg-blue-700 px-7 py-5 text-white">
                <div>
                  <h2 className="!mb-1 text-5xl font-bold">Create New Job Position</h2>
                  <p className="!mb-0 text-2xl text-blue-100">Fill in the details to create a new job posting</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowJobDialog(false)}
                  className="rounded-lg p-2 text-white/90 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close"
                >
                  <span className="text-5xl leading-none">×</span>
                </button>
              </div>

              <div className="flex-1 space-y-7 overflow-y-auto px-7 py-6">
                <section>
                  <h3 className="!mb-4 flex items-center gap-2 text-4xl font-bold text-[var(--text-primary)]">
                    <FileText size={28} className="text-blue-600" /> Basic Information
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Position Title <span className="text-red-500">*</span></label>
                      <input
                        className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                        placeholder="e.g., Administrative Officer III"
                        value={newJob.title}
                        onChange={(event) => setNewJob((prev) => ({ ...prev, title: event.target.value }))}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Office/Department <span className="text-red-500">*</span></label>
                        <select
                          className="w-full rounded-xl border border-[var(--border-color)] bg-white p-3 text-base"
                          value={newJob.department}
                          onChange={(event) => setNewJob((prev) => ({ ...prev, department: event.target.value }))}
                        >
                          <option value="">Select Office</option>
                          {departmentSelectionOptions.map((office) => (
                            <option key={office} value={office}>{office}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Position Level</label>
                        <select
                          className="w-full rounded-xl border border-[var(--border-color)] bg-white p-3 text-base"
                          value={newJob.position_level}
                          onChange={(event) => setNewJob((prev) => ({ ...prev, position_level: event.target.value }))}
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
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Number of Slots</label>
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                          value={newJob.slots}
                          onChange={(event) => setNewJob((prev) => ({ ...prev, slots: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Employment Type</label>
                        <select
                          className="w-full rounded-xl border border-[var(--border-color)] bg-white p-3 text-base"
                          value={newJob.employment_type}
                          onChange={(event) => setNewJob((prev) => ({ ...prev, employment_type: event.target.value }))}
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
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Application Deadline</label>
                        <input
                          type="date"
                          className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                          value={newJob.application_deadline}
                          onChange={(event) => setNewJob((prev) => ({ ...prev, application_deadline: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Status</label>
                        <select
                          className="w-full rounded-xl border border-[var(--border-color)] bg-white p-3 text-base"
                          value={newJob.status}
                          onChange={(event) => setNewJob((prev) => ({ ...prev, status: event.target.value as JobStatus }))}
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
                  <h3 className="!mb-4 flex items-center gap-2 text-4xl font-bold text-[var(--text-primary)]">
                    <FileText size={28} className="text-blue-600" /> Job Description
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Description</label>
                      <textarea
                        rows={4}
                        className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                        placeholder="Provide a brief overview of the position..."
                        value={newJob.description}
                        onChange={(event) => setNewJob((prev) => ({ ...prev, description: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Key Responsibilities</label>
                      <textarea
                        rows={4}
                        className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                        placeholder="List the main duties and responsibilities (one per line)..."
                        value={newJob.responsibilities}
                        onChange={(event) => setNewJob((prev) => ({ ...prev, responsibilities: event.target.value }))}
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="!mb-2 flex items-center gap-2 text-4xl font-bold text-[var(--text-primary)]">
                    <FileText size={28} className="text-blue-600" /> Qualification Standards
                  </h3>
                  <p className="mb-4 text-base text-[var(--text-secondary)]">
                    What this position actually requires. Applicants see these on the job posting, and
                    the portal uses them to show each person exactly what they're missing. Leave a field
                    blank if it genuinely doesn't apply — blanks show as "Not specified" rather than a
                    made-up requirement.
                  </p>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">
                          Highest Educational Attainment
                        </label>
                        <select
                          className="w-full rounded-xl border border-[var(--border-color)] bg-white p-3 text-base"
                          value={newJob.education_requirement}
                          onChange={(event) =>
                            setNewJob((prev) => ({ ...prev, education_requirement: event.target.value }))
                          }
                        >
                          <option value="">Not specified</option>
                          <option value="Elementary Graduate">Elementary Graduate</option>
                          <option value="High School Graduate">High School Graduate</option>
                          <option value="College Level">College Level</option>
                          <option value="College Graduate">College Graduate</option>
                          <option value="Masteral Units">Masteral Units</option>
                          <option value="Graduate School">Graduate School</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">
                          Field of Study
                        </label>
                        <input
                          className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                          placeholder="e.g. BS Information Technology or related field"
                          value={newJob.education_field}
                          onChange={(event) =>
                            setNewJob((prev) => ({ ...prev, education_field: event.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                      <div>
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">
                          Years of Experience
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                          placeholder="0"
                          value={newJob.experience_years}
                          onChange={(event) =>
                            setNewJob((prev) => ({ ...prev, experience_years: event.target.value }))
                          }
                        />
                      </div>
                      <div className="xl:col-span-2">
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">
                          Experience In
                        </label>
                        <input
                          className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                          placeholder="e.g. Systems administration / network operations"
                          value={newJob.experience_field}
                          onChange={(event) =>
                            setNewJob((prev) => ({ ...prev, experience_field: event.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                      <div>
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">
                          Salary Grade
                        </label>
                        {/* Picked from the CSC schedule rather than typed, so a
                            position cannot carry a grade the schedule does not
                            have. This field only ranks the position; the amount
                            shown is context. */}
                        <SalaryGradeSelect
                          value={newJob.salary_grade === '' ? null : Number(newJob.salary_grade)}
                          className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                          onChange={(grade) =>
                            setNewJob((prev) => ({ ...prev, salary_grade: grade == null ? '' : String(grade) }))
                          }
                        />
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                          Ranks this position within its department.
                        </p>
                      </div>
                      <div>
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">
                          Training
                        </label>
                        <input
                          className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                          placeholder="e.g. 8 hours of relevant training"
                          value={newJob.training_requirement}
                          onChange={(event) =>
                            setNewJob((prev) => ({ ...prev, training_requirement: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">
                          Eligibility
                        </label>
                        <input
                          className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                          placeholder="e.g. CS Professional / RA 1080"
                          value={newJob.eligibility}
                          onChange={(event) =>
                            setNewJob((prev) => ({ ...prev, eligibility: event.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">
                        Required Skills
                      </label>
                      <textarea
                        rows={4}
                        className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                        placeholder="One skill per line, e.g.&#10;Network administration&#10;SQL&#10;Technical documentation"
                        value={newJob.required_skills}
                        onChange={(event) =>
                          setNewJob((prev) => ({ ...prev, required_skills: event.target.value }))
                        }
                      />
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        One per line. These drive the applicant's skills-gap comparison.
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              <div className="flex justify-end gap-3 border-t border-[var(--border-color)] px-7 py-4">
                <Button variant="secondary" onClick={() => setShowJobDialog(false)} className="!px-8 !py-3 text-lg">
                  Cancel
                </Button>
                <Button onClick={handleCreateJob} className="!px-8 !py-3 text-lg">
                  <Plus size={18} /> Create Position
                </Button>
              </div>
            </div>
          </div>
        )}

        {showRaterDialog && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 px-3 py-4" onClick={closeRaterDialog}>
            <div className="flex h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between bg-blue-700 px-7 py-5 text-white">
                <div>
                  <h2 className="!mb-1 text-5xl font-bold">Assign Rater Access</h2>
                  <p className="!mb-0 text-2xl text-blue-100">Grant access to interviewer portal</p>
                </div>
                <button
                  type="button"
                  onClick={closeRaterDialog}
                  className="rounded-lg p-2 text-white/90 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close"
                >
                  <span className="text-5xl leading-none">×</span>
                </button>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto px-7 py-6">
                <section>
                  <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Select Rater <span className="text-red-500">*</span></label>
                  <select
                    value={raterAccessForm.raterName}
                    onChange={(event) => handleRaterNameChange(event.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-white p-3 text-lg"
                  >
                    <option value="">Choose a rater...</option>
                    {raters.map((rater) => (
                      <option key={rater.id} value={rater.name}>{rater.name} ({rater.email})</option>
                    ))}
                  </select>
                </section>

                <section>
                  <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Designation / Role</label>
                  <input
                    className="w-full rounded-xl border border-[var(--border-color)] bg-white p-3 text-lg"
                    value={newRater.department}
                    placeholder="Auto-filled based on selected rater"
                    readOnly
                  />
                  <p className="!mb-0 mt-2 text-base text-[var(--text-secondary)]">Auto-filled based on selected rater</p>
                </section>

                <section>
                  <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Access Level <span className="text-red-500">*</span></label>
                  <select
                    value={raterAccessForm.accessLevel}
                    onChange={(event) => setRaterAccessForm((prev) => ({ ...prev, accessLevel: event.target.value }))}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-white p-3 text-lg"
                    disabled
                  >
                    <option value="Interviewer">Interviewer</option>
                  </select>
                </section>

                <section>
                  <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Assign Job Positions <span className="text-red-500">*</span></label>
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-white p-4">
                    {assignableJobPositions.length === 0 ? (
                      <p className="text-sm text-[var(--text-secondary)]">No active job postings are available. Post or activate a job first.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-x-10 gap-y-4 xl:grid-cols-2">
                        {assignableJobPositions.map((position) => {
                          const checked = raterAccessForm.assignedPositions.includes(position);
                          return (
                            <label key={position} className="flex cursor-pointer items-center gap-3 text-xl text-[var(--text-primary)]">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleAssignedPosition(position)}
                                className="h-6 w-6 rounded border-[var(--border-color)]"
                              />
                              <span>{position}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="!mb-0 mt-2 text-base text-[var(--text-secondary)]">Selected: {raterAccessForm.assignedPositions.length} position{raterAccessForm.assignedPositions.length === 1 ? '' : 's'}</p>
                </section>

                <section>
                  <h3 className="!mb-3 text-4xl font-bold text-[var(--text-primary)]">Access Duration (Optional)</h3>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-base font-semibold text-[var(--text-secondary)]">Start Date</label>
                      <div className="relative">
                        <Calendar size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                          type="date"
                          value={raterAccessForm.startDate}
                          onChange={(event) => setRaterAccessForm((prev) => ({ ...prev, startDate: event.target.value }))}
                          className="w-full rounded-xl border border-[var(--border-color)] py-3 pl-11 pr-4 text-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-base font-semibold text-[var(--text-secondary)]">End Date</label>
                      <div className="relative">
                        <Calendar size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                          type="date"
                          value={raterAccessForm.endDate}
                          onChange={(event) => setRaterAccessForm((prev) => ({ ...prev, endDate: event.target.value }))}
                          className="w-full rounded-xl border border-[var(--border-color)] py-3 pl-11 pr-4 text-lg"
                        />
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <div className="flex justify-end gap-3 border-t border-[var(--border-color)] px-7 py-4">
                <Button variant="secondary" onClick={closeRaterDialog} className="!px-8 !py-3 text-lg">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateRater}
                  disabled={!newRater.name || !newRater.email || raterAccessForm.assignedPositions.length === 0}
                  className="!px-8 !py-3 text-lg"
                >
                  Save & Generate Access
                </Button>
              </div>
            </div>
          </div>
        )}

        {showBulkRequestDialog && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4 py-6" onClick={closeBulkRequestDialog}>
            <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between border-b border-[var(--border-color)] px-8 py-6">
                <div>
                  <h2 className="!mb-1 text-5xl font-bold text-[var(--text-primary)]">Bulk Document Request</h2>
                  <p className="!mb-0 text-2xl text-[var(--text-secondary)]">Request documents from multiple employees at once</p>
                </div>
                <button type="button" onClick={closeBulkRequestDialog} className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-primary)]">
                  <span className="text-4xl leading-none">×</span>
                </button>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto px-8 py-6">
                <section>
                  <h3 className="!mb-3 text-2xl font-semibold text-[var(--text-primary)]">Quick Templates (Optional)</h3>
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {BULK_REQUEST_TEMPLATES.map((template) => {
                      const isSelected = bulkRequestForm.documentName === template.name;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleBulkTemplateSelect(template.id)}
                          className={`rounded-2xl border px-4 py-4 text-left transition ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-[var(--border-color)] hover:border-blue-300'}`}
                        >
                          <p className="!mb-0 text-2xl font-semibold text-[var(--text-primary)]">{template.name}</p>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <label className="mb-2 block text-xl font-semibold text-[var(--text-primary)]">Document Name <span className="text-red-500">*</span></label>
                  <input
                    value={bulkRequestForm.documentName}
                    onChange={(event) => setBulkRequestForm((prev) => ({ ...prev, documentName: event.target.value }))}
                    className="w-full rounded-xl border border-[var(--border-color)] p-4 text-3xl"
                    placeholder="Enter document name"
                  />
                </section>

                <section>
                  <label className="mb-2 block text-xl font-semibold text-[var(--text-primary)]">Description / Requirements <span className="text-red-500">*</span></label>
                  <textarea
                    value={bulkRequestForm.description}
                    onChange={(event) => setBulkRequestForm((prev) => ({ ...prev, description: event.target.value }))}
                    className="w-full rounded-xl border border-[var(--border-color)] p-4 text-2xl"
                    rows={4}
                    placeholder="Describe the required document"
                  />
                </section>

                <section>
                  <label className="mb-2 block text-xl font-semibold text-[var(--text-primary)]">Due Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={bulkRequestForm.dueDate}
                    onChange={(event) => setBulkRequestForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    className="w-full rounded-xl border border-[var(--border-color)] p-4 text-3xl"
                  />
                </section>

                <section>
                  <label className="mb-2 block text-xl font-semibold text-[var(--text-primary)]">Upload Template File (Optional)</label>
                  <input
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      setBulkRequestForm((prev) => ({ ...prev, templateFileName: file ? file.name : '' }));
                    }}
                    className="w-full rounded-xl border border-[var(--border-color)] p-4 text-xl"
                  />
                  {bulkRequestForm.templateFileName && (
                    <p className="!mb-0 mt-2 text-base text-[var(--text-secondary)]">Selected file: {bulkRequestForm.templateFileName}</p>
                  )}
                </section>

                <section>
                  <label className="mb-3 block text-xl font-semibold text-[var(--text-primary)]">Send Request To <span className="text-red-500">*</span></label>

                  <div className="space-y-3">
                    {[
                      {
                        id: 'all' as const,
                        title: 'All Employees',
                        subtitle: `${bulkRequestEmployees.length} employee${bulkRequestEmployees.length === 1 ? '' : 's'} will receive this request`,
                        icon: Users,
                      },
                      {
                        id: 'department' as const,
                        title: 'By Department',
                        subtitle: 'Select a specific department',
                        icon: Building2,
                      },
                      {
                        id: 'selected' as const,
                        title: 'Selected Employees',
                        subtitle: 'Choose specific employees from the list',
                        icon: UserCheck,
                      },
                    ].map((option) => {
                      const Icon = option.icon;
                      const isSelected = bulkRequestForm.recipientMode === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => handleBulkRecipientModeChange(option.id)}
                          className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-[var(--border-color)] hover:border-blue-300'}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`rounded-2xl p-3 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-[var(--text-muted)]'}`}>
                              <Icon size={24} />
                            </div>
                            <div>
                              <p className="!mb-0 text-3xl font-semibold text-[var(--text-primary)]">{option.title}</p>
                              <p className="!mb-0 text-xl text-[var(--text-secondary)]">{option.subtitle}</p>
                            </div>
                          </div>
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${isSelected ? 'border-blue-600 text-blue-600' : 'border-slate-300 text-transparent'}`}>
                            <Check size={16} />
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {bulkRequestForm.recipientMode === 'department' && (
                    <div className="mt-4 rounded-2xl border border-[var(--border-color)] bg-slate-50 p-4">
                      <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Department</label>
                      <select
                        value={bulkRequestForm.department}
                        onChange={(event) => setBulkRequestForm((prev) => ({ ...prev, department: event.target.value }))}
                        className="w-full rounded-xl border border-[var(--border-color)] p-3 text-lg"
                      >
                        <option value="">Select a department</option>
                        {bulkRequestDepartments.map((department) => (
                          <option key={department} value={department}>{department}</option>
                        ))}
                      </select>
                      <p className="!mb-0 mt-2 text-base text-[var(--text-secondary)]">
                        {bulkRequestForm.department
                          ? `${selectedDepartmentEmployees.length} employee${selectedDepartmentEmployees.length === 1 ? '' : 's'} in this department`
                          : 'Choose a department to preview recipients'}
                      </p>
                    </div>
                  )}

                  {bulkRequestForm.recipientMode === 'selected' && (
                    <div className="mt-4 rounded-2xl border border-[var(--border-color)] bg-slate-50 p-4">
                      <p className="!mb-2 text-base font-semibold text-[var(--text-primary)]">Select Employees</p>
                      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                        {bulkRequestEmployees.map((employee) => {
                          const checked = bulkRequestForm.selectedEmployeeIds.includes(employee.id);
                          return (
                            <label key={employee.id} className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--border-color)] bg-white px-3 py-2">
                              <div>
                                <p className="!mb-0 text-base font-semibold text-[var(--text-primary)]">{employee.name}</p>
                                <p className="!mb-0 text-sm text-[var(--text-secondary)]">{employee.department}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleBulkEmployeeToggle(employee.id)}
                                className="h-4 w-4"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                  <p className="!mb-0 text-xl text-blue-700">
                    <strong>Summary:</strong> This document request will be sent to <strong>{bulkRequestRecipientCount}</strong> employee{bulkRequestRecipientCount === 1 ? '' : 's'}.
                    {bulkRequestForm.recipientMode === 'all' && ' All employees will be notified.'}
                    {bulkRequestForm.recipientMode === 'department' && bulkRequestForm.department && ` ${bulkRequestForm.department} employees will be notified.`}
                    {bulkRequestForm.recipientMode === 'selected' && bulkRequestRecipientCount > 0 && ' Selected employees will be notified.'}
                  </p>
                </section>
              </div>

              <div className="border-t border-[var(--border-color)] px-8 py-5">
                {bulkRequestError && (
                  <p className="!mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {bulkRequestError}
                  </p>
                )}
                <div className="flex justify-end gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => { closeBulkRequestDialog(); setBulkRequestError(null); }}
                    disabled={bulkRequestSending}
                    className="!px-8 !py-3 text-lg"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSendBulkRequest}
                    disabled={isBulkRequestSendDisabled || bulkRequestSending}
                    className="!px-8 !py-3 text-lg"
                  >
                    <FileText size={18} /> {bulkRequestSending ? 'Sending…' : `Send to ${bulkRequestRecipientCount} Employee${bulkRequestRecipientCount === 1 ? '' : 's'}`}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {documentCollection && <DocumentCollectionModal
          title="Employee Documents"
          subtitle="Select a document to view, print, or download."
          files={documentCollection.map((entry) => ({
            id: entry.id, url: entry.documentUrl, fileName: entry.fileName || '', fileType: entry.fileType,
            bucket: EMPLOYEE_DOCUMENTS_BUCKET, label: `${entry.fullName} — ${entry.documentType}`,
            subtitle: `${entry.employeeCode} • ${entry.position} • Submitted ${entry.submittedDate}`,
          }))}
          onClose={() => setDocumentCollection(null)}
        />}
        <DocumentPreviewModal
          viewFirst
          open={previewSubmission !== null}
          storageBucket={EMPLOYEE_DOCUMENTS_BUCKET}
          fileUrl={previewSubmission?.documentUrl ?? ''}
          fileName={previewSubmission?.fileName || ''}
          fileType={previewSubmission?.fileType ?? null}
          title={previewSubmission ? `${previewSubmission.fullName} — ${previewSubmission.documentType}` : ''}
          subtitle={previewSubmission ? `${previewSubmission.employeeCode} • ${previewSubmission.position} • Submitted ${previewSubmission.submittedDate}` : ''}
          onClose={() => setPreviewSubmission(null)}
        />

        <Modal
          open={resetPwState !== 'idle'}
          onClose={closeResetPwModal}
          dismissible={resetPwState !== 'working'}
          size="sm"
          title={resetPwState === 'done' ? 'New Password Generated' : 'Reset Employee Password'}
          footer={
            resetPwState === 'confirm' ? (
              <>
                <button type="button" onClick={closeResetPwModal} className="btn btn-md btn-secondary">Cancel</button>
                <button type="button" onClick={handleResetEmployeePasswordConfirm} className="btn btn-md btn-destructive">Yes, reset password</button>
              </>
            ) : resetPwState === 'working' ? (
              <button type="button" disabled aria-busy="true" className="btn btn-md btn-destructive is-loading">Yes, reset password</button>
            ) : resetPwState === 'done' ? (
              <button type="button" onClick={closeResetPwModal} className="btn btn-md btn-primary">Done</button>
            ) : (
              <button type="button" onClick={closeResetPwModal} className="btn btn-md btn-secondary">Close</button>
            )
          }
        >
              <div className="space-y-4">
                {resetPwState === 'confirm' && selectedEmployeeDetails && (
                  <>
                    <p className="!mb-0 text-sm text-slate-700">
                      Generate a new password for{' '}
                      <span className="font-semibold">
                        {(selectedEmployeeDetails.first_name || selectedEmployeeDetails.last_name)
                          ? `${selectedEmployeeDetails.first_name ?? ''} ${selectedEmployeeDetails.last_name ?? ''}`.trim()
                          : (selectedEmployeeDetails.full_name || 'Unnamed Employee')}
                      </span>
                      {employeeNumberById.get(selectedEmployeeDetails.id)
                        ? ` (${employeeNumberById.get(selectedEmployeeDetails.id)})`
                        : ''}
                      ? This generates a new password and invalidates the previous one immediately.
                    </p>
                    {lastResetInfo && (
                      <p className="!mb-0 text-xs text-slate-500">
                        Last reset by {lastResetInfo.reset_by || 'unknown'} on{' '}
                        {new Date(lastResetInfo.reset_at).toLocaleString()}.
                      </p>
                    )}
                  </>
                )}

                {resetPwState === 'working' && (
                  <p className="!mb-0 text-sm text-slate-600">Generating new password…</p>
                )}

                {resetPwState === 'done' && resetPwValue && (
                  <>
                    <p className="!mb-0 text-sm text-slate-700">
                      Password reset successfully. Share these credentials with the employee — they
                      won't be shown again.
                    </p>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="mb-2">
                        <p className="!mb-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Username</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="!mb-0 font-mono text-sm font-semibold text-slate-900">{resetPwUsername}</p>
                          <button
                            type="button"
                            onClick={() => copyResetPwValue(resetPwUsername ?? '')}
                            className="btn btn-sm btn-secondary"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="!mb-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">New Password</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="!mb-0 font-mono text-sm font-semibold text-red-600">{resetPwValue}</p>
                          <button
                            type="button"
                            onClick={() => copyResetPwValue(resetPwValue)}
                            className="btn btn-sm btn-secondary"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>

                    <p className="!mb-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      The employee should change this password on their first login.
                    </p>
                  </>
                )}

                {resetPwState === 'error' && (
                  <p className="!mb-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {resetPwError ?? "We couldn't reset the password. Try again."}
                  </p>
                )}
              </div>
        </Modal>
      </div>
    </div>
  );
};
