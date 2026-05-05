import {
    AlertCircle,
    Bell,
    Briefcase,
    Building2,
    Calculator,
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
    Phone,
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
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AdminHeader } from '../../components/AdminHeader';
import { Button } from '../../components/Button';
import { Sidebar } from '../../components/Sidebar';
import { getPreferredDataSourceMode } from '../../lib/dataSourceMode';
import {
    createPassword,
    createUniqueUsername,
    findEmployeePortalAccount,
    getEmployeePortalAccounts,
    upsertEmployeePortalAccount,
} from '../../lib/employeePortalData';
import { mockDatabase } from '../../lib/mockDatabase';
import {
    ensureRecruitmentSeedData,
    getAuthoritativeJobPostings,
    getDeletedJobReports,
    getEmployeeRecords,
    getJobPostingsFromSupabase,
    getNewlyHired,
    getApplicants as getRecruitmentApplicants,
    saveDeletedJobReports,
    saveJobPostings,
    saveNewlyHired,
    type DeletedJobReport,
} from '../../lib/recruitmentData';
import { runSingleFlight, invalidateCacheKey } from '../../lib/singleFlight';
import { isMockModeEnabled, supabase } from '../../lib/supabase';
import {
    EMPLOYEE_DOCUMENTS_UPDATED_EVENT,
    downloadEmployeeDocument,
    listEmployeeDocumentsByType,
    type EmployeeDocumentSubmission as SupabaseEmployeeDocumentSubmission,
    type EmployeeDocumentType,
} from '../../lib/employeeDocuments';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import '../../styles/admin.css';
import type { JobPosting, NewlyHired } from '../../types/recruitment.types';

type JobStatus = 'Open' | 'Reviewing' | 'Closed';
type Section = 'dashboard' | 'jobs' | 'qualified' | 'new-hired' | 'raters' | 'accounts' | 'reports' | 'settings';
type BulkRecipientMode = 'all' | 'department' | 'selected';
type EmployeeDocumentTemplateId = (typeof BULK_REQUEST_TEMPLATES)[number]['id'];
type EmployeeDirectoryCardStatus = 'Active' | 'Inactive' | 'Mixed';

const EMPLOYEE_DIRECTORY_POSITIONS_PER_PAGE = 6;

interface JobRecord {
  id: number | string;
  title: string;
  item_number: string;
  department: string;
  status: JobStatus;
  created_at: string;
  applicant_count: number;
}

interface ApplicantRecord {
  id: string;
  employeeId?: string;
  full_name: string;
  email: string;
  contact_number: string;
  position: string;
  office: string;
  status: string;
  created_at: string;
  total_score: number | null;
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

const EMPLOYEE_DIRECTORY_DEPARTMENTS = [
  'IT Department',
  'HR Department',
  'Finance Department',
  'General Services',
  'Legal Department',
  'Operations',
];

const EMPLOYEE_DIRECTORY_POSITIONS_BY_DEPARTMENT: Record<string, string[]> = {
  'IT Department': [
    'Information Technology Officer I',
    'Information Technology Officer II',
    'Information Technology Officer III',
    'Senior IT Officer',
    'IT Manager',
  ],
  'HR Department': ['HR Officer I', 'HR Officer II', 'Senior HR Officer'],
  'Finance Department': ['Accountant I', 'Accountant II', 'Finance Officer'],
  'General Services': ['Administrative Assistant', 'Operations Assistant'],
  'Legal Department': ['Legal Officer I', 'Legal Officer II'],
  Operations: ['Operations Officer I', 'Operations Officer II'],
};

const resolveSection = (pathname: string, search: string): Section => {
  if (pathname === '/admin/rsp/jobs') return 'jobs';
  if (pathname === '/admin/rsp/qualified') return 'qualified';
  if (pathname === '/admin/rsp/new-hired') return 'new-hired';
  if (pathname === '/admin/rsp/raters' || pathname === '/admin/raters') return 'raters';
  if (pathname === '/admin/rsp/accounts') return 'accounts';
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

const mapRecruitmentPostingsToDashboardJobs = (rows: JobPosting[]): JobRecord[] => {
  return rows.map((item) => ({
    id: item.id,
    title: String(item.title ?? ''),
    item_number: String(item.jobCode ?? ''),
    department: String(item.department ?? 'Unassigned'),
    status:
      item.status === 'Closed' || item.status === 'Filled'
        ? 'Closed'
        : item.status === 'Draft'
          ? 'Reviewing'
          : 'Open',
    created_at: String(item.postedDate ?? new Date().toISOString()),
    applicant_count: Number(item.applicantCount ?? 0),
  }));
};

const persistDashboardJobsToRecruitment = (rows: JobRecord[]) => {
  const nowIso = new Date().toISOString();
  const mapped: JobPosting[] = rows.map((row, index) => ({
    id: String(row.id ?? crypto.randomUUID()),
    jobCode: row.item_number || `LGU-2026-${String(index + 1).padStart(3, '0')}`,
    title: row.title,
    department: row.department || 'Operations',
    division: 'Operations',
    positionType: 'Civil Service',
    salaryGrade: 'SG-10',
    salaryRange: { min: 20000, max: 30000 },
    numberOfPositions: 1,
    employmentStatus: 'Permanent',
    summary: `${row.title} recruitment posting.`,
    responsibilities: ['Review and process applications.'],
    qualifications: {
      education: "Bachelor's Degree",
      experience: { years: 0, field: 'General' },
      skills: [],
      certifications: [],
    },
    requiredDocuments: ['Resume/CV', 'Application Letter'],
    applicationDeadline: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: row.status === 'Closed' ? 'Closed' : row.status === 'Reviewing' ? 'Draft' : 'Active',
    postedDate: row.created_at || nowIso,
    postedBy: 'HR Admin',
    applicantCount: row.applicant_count ?? 0,
    qualifiedCount: 0,
  }));

  saveJobPostings(mapped);
};

const getStatusClass = (status: string) => {
  const lowered = status.toLowerCase();
  if (lowered.includes('open')) return 'bg-green-100 text-green-700';
  if (lowered.includes('review')) return 'bg-blue-100 text-blue-700';
  if (lowered.includes('closed')) return 'bg-slate-200 text-slate-700';
  if (lowered.includes('qualified') || lowered.includes('completed')) return 'bg-emerald-100 text-emerald-700';
  if (lowered.includes('pending')) return 'bg-amber-100 text-amber-700';
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
  } catch {
  }
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

const RATER_ASSIGNMENTS_KEY = 'cictrix_rater_assigned_positions';

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
const convertEducationScore = (level: string): number => {
  const levels: Record<string, number> = {
    'Elementary Level': 10,
    'Elementary Graduate': 11,
    'High School Level': 12,
    'High School Graduate': 13,
    'College Level': 14,
    'College Graduate': 16,
    'Masteral Units': 18,
    'Graduate School': 20,
  };
  return levels[level] || 16;
};

const convertExperienceScore = (years: number): number => {
  if (years >= 21) return 18;
  if (years >= 16) return 18;
  if (years >= 11) return 16;
  if (years >= 6) return 14;
  if (years >= 1) return 12;
  return 10;
};

const convertPerformanceScore = (rating: string): number => {
  const ratings: Record<string, number> = {
    'Very Satisfactory': 12,
    'Outstanding': 14,
  };
  return ratings[rating] || 12;
};

const convertPcptScore = (rawScore: number): number => {
  if (rawScore >= 35) return 20;
  if (rawScore >= 32) return 18;
  if (rawScore >= 29) return 16;
  if (rawScore >= 26) return 14;
  if (rawScore >= 23) return 12;
  if (rawScore >= 20) return 10;
  return 0;
};

const convertPotentialScore = (rawScore: number): number => {
  if (rawScore >= 91) return 20;
  if (rawScore >= 81) return 18;
  if (rawScore >= 71) return 16;
  if (rawScore >= 61) return 14;
  if (rawScore >= 51) return 12;
  return 0;
};

const convertWrittenExamScore = (rawScore: number, positionType: 'rank-and-file' | 'executive' = 'rank-and-file'): number => {
  if (positionType === 'executive') {
    if (rawScore >= 30) return 20;
    if (rawScore >= 25) return 18;
    if (rawScore >= 20) return 16;
    if (rawScore >= 15) return 14;
    if (rawScore >= 10) return 12;
    return 10;
  } else {
    if (rawScore >= 26) return 20;
    if (rawScore >= 21) return 18;
    if (rawScore >= 16) return 16;
    if (rawScore >= 11) return 14;
    if (rawScore >= 10) return 12;
    return 0;
  }
};

const convertOralExamScore = (rawScore: number): number => {
  if (rawScore >= 96) return 20;
  if (rawScore >= 91) return 18;
  if (rawScore >= 86) return 16;
  if (rawScore >= 81) return 14;
  if (rawScore >= 76) return 12;
  return 10;
};

const calculateTotalScore = (scores: {
  education: number;
  experience: number;
  performance?: number;
  pcpt: number;
  potential?: number;
  writtenExam?: number;
  oralExam?: number;
  appointmentType: 'original' | 'promotional';
}): number => {
  if (scores.appointmentType === 'original') {
    return (scores.education + scores.experience + (scores.writtenExam || 0) + (scores.oralExam || 0) + scores.pcpt);
  } else {
    return (scores.education + scores.experience + (scores.performance || 0) + scores.pcpt + (scores.potential || 0));
  }
};

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

const generateDemoEvaluationScores = (applicants: ApplicantRecord[]): Record<string, number> => {
  // Generate realistic demo scores for applicants using the conversion tables
  const demoScores = new Map<string, number>();
  
  applicants.slice(0, 4).forEach((applicant, index) => {
    const appointmentType = index % 2 === 0 ? 'original' : 'promotional';
    
    // Generate diverse scores for demo purposes
    const education = convertEducationScore(['College Graduate', 'Masteral Units', 'Graduate School', 'College Graduate'][index] || 'College Graduate');
    const experience = convertExperienceScore([3, 8, 12, 6][index] || 5);
    const pcpt = convertPcptScore([28, 34, 30, 25][index] || 28);
    
    let total = 0;
    if (appointmentType === 'original') {
      const writtenExam = convertWrittenExamScore([22, 28, 24, 20][index] || 22, 'rank-and-file');
      const oralExam = convertOralExamScore([85, 92, 88, 82][index] || 85);
      total = calculateTotalScore({
        education,
        experience,
        writtenExam,
        oralExam,
        pcpt,
        appointmentType,
      });
    } else {
      const performance = convertPerformanceScore(['Outstanding', 'Very Satisfactory', 'Outstanding', 'Very Satisfactory'][index] || 'Outstanding');
      const potential = convertPotentialScore([75, 88, 82, 70][index] || 75);
      total = calculateTotalScore({
        education,
        experience,
        performance,
        potential,
        pcpt,
        appointmentType,
      });
    }
    
    demoScores.set(applicant.id, Math.round(total * 100) / 100);
  });

  return Object.fromEntries(demoScores);
};

const DEMO_EVALUATION_SCORES_KEY = 'cictrix_demo_evaluation_scores';

const hasFinalizedCategoryScores = (entry?: StoredApplicantCategoryScores): boolean => {
  if (!entry) return false;

  const categories: Array<StoredScoringCategory | undefined> = [
    entry.education,
    entry.experience,
    entry.performance,
    entry.pcpt,
    entry.potential,
    entry.writtenExam,
  ];

  const hasAnyFinalScore = categories.some((category) => typeof category?.finalScore === 'number');
  if (hasAnyFinalScore) return true;

  // Backward compatibility: older saves may rely on metadata without explicit final scores.
  return Boolean(entry.appointmentType || entry.positionType);
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

const normalizeWrittenScore = (value: number): number => {
  // New flow stores written raw score (0-100). Legacy flow may store already-converted <= 30.
  if (value <= 30) return Number(value.toFixed(2));
  return Number((value * 0.3).toFixed(2));
};

const loadRaterAssignments = (): Record<string, string[]> => {
  try {
    const raw = localStorage.getItem(RATER_ASSIGNMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, string[]>;
  } catch {
    return {};
  }
};

const saveRaterAssignments = (assignments: Record<string, string[]>) => {
  try {
    localStorage.setItem(RATER_ASSIGNMENTS_KEY, JSON.stringify(assignments));
  } catch {
  }
};

export const RSPDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const section = resolveSection(location.pathname, location.search);

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [applicants, setApplicants] = useState<ApplicantRecord[]>([]);
  const [raters, setRaters] = useState<RaterRecord[]>([]);
  const [deletedJobReports, setDeletedJobReports] = useState<DeletedJobReport[]>([]);
  const [expandedArchiveIds, setExpandedArchiveIds] = useState<Record<string, boolean>>({});
  const [completedEvaluationIds, setCompletedEvaluationIds] = useState<Set<string>>(new Set());

  const [jobsSearch, setJobsSearch] = useState('');
  const [jobsStatus, setJobsStatus] = useState('all');
  const [jobsOffice, setJobsOffice] = useState('all');
  const [jobsPage, setJobsPage] = useState(0);

  const [qualifiedTab, setQualifiedTab] = useState<'all' | 'completed' | 'pending'>('all');
  const [qualifiedSearch, setQualifiedSearch] = useState('');
  const [qualifiedPosition, setQualifiedPosition] = useState('all');
  const [qualifiedOffice, setQualifiedOffice] = useState('all');
  const [reportsView, setReportsView] = useState<'overview' | 'ranking' | 'assessment' | 'documents'>('overview');
  const [activeRankingPosition, setActiveRankingPosition] = useState<string | null>(null);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [showHireApplicantsModal, setShowHireApplicantsModal] = useState(false);
  const [selectedHireApplicantIds, setSelectedHireApplicantIds] = useState<string[]>([]);
  const [activeAssessmentPosition, setActiveAssessmentPosition] = useState<string | null>(null);
  const [showAssessmentFormsModal, setShowAssessmentFormsModal] = useState(false);
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState<AssessmentStatusFilter>('all');
  const [assessmentSearch, setAssessmentSearch] = useState('');
  const [activeDocumentTemplateId, setActiveDocumentTemplateId] = useState<EmployeeDocumentTemplateId | null>(null);
  const [expandedDocumentOffices, setExpandedDocumentOffices] = useState<Record<string, boolean>>({});
  const [selectedDocumentSubmissionIds, setSelectedDocumentSubmissionIds] = useState<string[]>([]);
  const [previewSubmission, setPreviewSubmission] = useState<EmployeeDocumentSubmission | null>(null);

  const [raterSearch, setRaterSearch] = useState('');
  const [raterStatus, setRaterStatus] = useState('all');
  const [raterAssignedPositionsByEmail, setRaterAssignedPositionsByEmail] = useState<Record<string, string[]>>({});
  const [accountsView, setAccountsView] = useState<'overview' | 'directory' | 'position' | 'details'>('overview');
  const [employeeDirectorySearch, setEmployeeDirectorySearch] = useState('');
  const [employeeDirectoryStatusFilter, setEmployeeDirectoryStatusFilter] = useState<'all' | EmployeeDirectoryCardStatus>('all');
  const [employeeDirectoryOfficeFilter, setEmployeeDirectoryOfficeFilter] = useState('all');
  const [employeeDirectoryPage, setEmployeeDirectoryPage] = useState(0);
  const [selectedDirectoryCard, setSelectedDirectoryCard] = useState<{ position: string; office: string } | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employeeDetailsTab, setEmployeeDetailsTab] = useState<'personal' | 'documents'>('personal');
  const [showPositionChangeModal, setShowPositionChangeModal] = useState(false);

  // Reset password flow for the Employee Accounts detail panel
  const [resetPwState, setResetPwState] = useState<'idle' | 'confirm' | 'working' | 'done' | 'error'>('idle');
  const [resetPwUsername, setResetPwUsername] = useState<string | null>(null);
  const [resetPwValue, setResetPwValue] = useState<string | null>(null);
  const [resetPwError, setResetPwError] = useState<string | null>(null);

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
      const firstName = String((selectedEmployeeDetails as any).first_name ?? '').trim();
      const lastName = String((selectedEmployeeDetails as any).last_name ?? '').trim();
      const fullNameNormalized = `${firstName} ${lastName}`.trim().toLowerCase();

      const accounts = getEmployeePortalAccounts();

      // Prefer matching by email (most authoritative since it's per-person), then by employee_number.
      const existingAccount =
        (empEmail
          ? accounts.find((a) => String(a.employee.email ?? '').trim().toLowerCase() === empEmail)
          : null)
        ?? (empNumber
          ? accounts.find((a) => String(a.employee.employeeId ?? '').trim() === empNumber)
          : null)
        ?? null;

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

      upsertEmployeePortalAccount({
        id: existingAccount?.id ?? `employee-account-${empNumber || username}`,
        username,
        password: newPassword,
        employee: realignedEmployee,
      });

      // Sanity-check the new credential pair authenticates.
      const verify = findEmployeePortalAccount(username, newPassword);
      if (!verify) {
        setResetPwError('Password generated but verification failed. Please retry.');
        setResetPwState('error');
        return;
      }

      // Note: fullNameNormalized is only used here to keep ESLint quiet about the local.
      void fullNameNormalized;

      setResetPwUsername(username);
      setResetPwValue(newPassword);
      setResetPwState('done');
    } catch (error) {
      console.error('handleResetEmployeePasswordConfirm: failed', error);
      setResetPwError(error instanceof Error ? error.message : String(error));
      setResetPwState('error');
    }
  };

  const closeResetPwModal = () => {
    setResetPwState('idle');
    setResetPwUsername(null);
    setResetPwValue(null);
    setResetPwError(null);
  };

  const copyResetPwValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      console.warn('clipboard write failed', error);
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

  const [newJob, setNewJob] = useState({
    title: '',
    item_number: '',
    department: '',
    status: 'Open' as JobStatus,
    salary_grade: '',
    position_level: '',
    slots: '1',
    employment_type: 'Full-time',
    application_deadline: '',
    description: '',
    responsibilities: '',
    qualifications: '',
  });

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
    let inFlight = false;
    let pending = false;
    let disposed = false;

    const load = async () => {
      ensureRecruitmentSeedData();
      setDeletedJobReports(getDeletedJobReports());

      const localAssignments = loadRaterAssignments();
      setRaterAssignedPositionsByEmail(localAssignments);

      // CRITICAL: Always fetch applicants from Supabase (as per user requirement: "all datas must be stored in supabase")
      const primaryClient = supabase; // Always use Supabase for applicants
      const secondaryClient = (mockDatabase as any); // Fallback only if Supabase fails

      const fetchBundle = async (client: any, cacheKey: string) =>
        runSingleFlight(
          cacheKey,
          () =>
            Promise.allSettled([
              client.from('job_postings').select('*').order('created_at', { ascending: false }),
              client.from('jobs').select('*').order('created_at', { ascending: false }),
              client.from('applicants').select('*').order('created_at', { ascending: false }),
              client.from('raters').select('*').order('created_at', { ascending: false }),
              client.from('evaluations').select('*'),
            ]),
          1200,
        );

      let [, , applicantsRes, ratersRes, evaluationsRes] = await fetchBundle(
        primaryClient,
        `rsp-bundle:supabase:primary` // Always use supabase cache key
      );

      const primaryRaters =
        ratersRes.status === 'fulfilled' && !ratersRes.value.error && Array.isArray(ratersRes.value.data)
          ? ratersRes.value.data
          : [];

      const primaryApplicantsFetchSucceeded =
        applicantsRes.status === 'fulfilled' && !applicantsRes.value.error && Array.isArray(applicantsRes.value.data);

      // Fallback only on fetch failure. Empty DB results are authoritative.
      if (!primaryApplicantsFetchSucceeded) {
        [, , applicantsRes, ratersRes, evaluationsRes] = await fetchBundle(
          secondaryClient,
          `rsp-bundle:supabase:secondary`
        );
      }

      // CRITICAL: Fetch job postings from Supabase first (source of truth), fallback to localStorage
      let canonicalJobPostings = await getJobPostingsFromSupabase();
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

        const applicantEmailById = new Map<string, string>();
        const applicantIdsByEmail = new Map<string, string[]>();
        applicantsRes.value.data.forEach((item: any) => {
          const applicantId = String(item?.id ?? '').trim();
          const emailKey = normalizeEmailKey(String(item?.email ?? ''));
          if (!applicantId || !emailKey) return;
          applicantEmailById.set(applicantId, emailKey);
          const current = applicantIdsByEmail.get(emailKey) ?? [];
          if (!current.includes(applicantId)) {
            applicantIdsByEmail.set(emailKey, [...current, applicantId]);
          }
        });

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

            const linkedEmail = applicantEmailById.get(applicantId);
            const linkedIds = linkedEmail ? applicantIdsByEmail.get(linkedEmail) ?? [] : [];
            const targetIds = Array.from(new Set([applicantId, ...linkedIds]));

            if (score > 0) {
              targetIds.forEach((targetId) => {
                const current = evaluationBestScore.get(targetId) ?? 0;
                if (score >= current) {
                  evaluationBestScore.set(targetId, score);
                  evaluationsByApplicantId.set(targetId, item);
                }
              });
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
            office: String(item?.office ?? item?.department ?? 'Unassigned'),
            status: resolvedStatus,
            created_at: String(item?.created_at ?? new Date().toISOString()),
            total_score: resolvedScore > 0 ? resolvedScore : null,
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
        
        setApplicants(Array.from(mergedById.values()));
      } else {
        setApplicants([]);
      }

      if (ratersRes.status === 'fulfilled' && !ratersRes.value.error && Array.isArray(ratersRes.value.data)) {
        const ratersSource = primaryRaters.length > 0 ? primaryRaters : ratersRes.value.data;
        const mergedAssignments = { ...localAssignments };

        ratersSource.forEach((item: any) => {
          const emailKey = normalizeEmailKey(String(item?.email ?? ''));
          if (!emailKey) return;

          const fromRow = Array.isArray(item?.assigned_positions)
            ? item.assigned_positions.filter((value: any) => typeof value === 'string')
            : null;

          if (fromRow && fromRow.length > 0) {
            mergedAssignments[emailKey] = fromRow;
          }
        });

        setRaterAssignedPositionsByEmail(mergedAssignments);
        saveRaterAssignments(mergedAssignments);

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
        const applicantRows =
          applicantsRes.status === 'fulfilled' && !applicantsRes.value.error && Array.isArray(applicantsRes.value.data)
            ? applicantsRes.value.data
            : [];

        const applicantEmailById = new Map<string, string>();
        const applicantIdsByEmail = new Map<string, string[]>();
        applicantRows.forEach((item: any) => {
          const applicantId = String(item?.id ?? '').trim();
          const emailKey = normalizeEmailKey(String(item?.email ?? ''));
          if (!applicantId || !emailKey) return;
          applicantEmailById.set(applicantId, emailKey);
          if (!emailKey) return;
          const current = applicantIdsByEmail.get(emailKey) ?? [];
          if (!current.includes(applicantId)) {
            applicantIdsByEmail.set(emailKey, [...current, applicantId]);
          }
        });

        evaluationsRes.value.data.forEach((item: any) => {
          const applicantId = String(item?.applicant_id ?? '').trim();
          if (!applicantId) return;

          const hasScore =
            deriveEvaluationTotalScore(item) > 0 ||
            (typeof item?.overall_score === 'number' && item.overall_score > 0) ||
            (typeof item?.overall_impression_score === 'number' && item.overall_impression_score > 0) ||
            (typeof item?.personality_score === 'number' && item.personality_score > 0);
          if (!hasScore) return;

          const linkedEmail = applicantEmailById.get(applicantId);
          const linkedIds = linkedEmail ? applicantIdsByEmail.get(linkedEmail) ?? [] : [];
          Array.from(new Set([applicantId, ...linkedIds])).forEach((targetId) => {
            completed.add(targetId);
          });
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
      invalidateCacheKey('rsp-bundle:supabase:primary');
      invalidateCacheKey('rsp-bundle:supabase:secondary');

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
        void load();
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
  }, []);

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
    const counts = new Map<string, number>();
    applicants.forEach((applicant) => {
      const key = applicant.position;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    return jobs.map((job) => ({
      ...job,
      applicant_count: counts.get(job.title) ?? 0,
    }));
  }, [jobs, applicants]);

  const dashboardStats = useMemo(() => {
    const totalJobs = jobsWithCounts.filter((job) => job.status !== 'Closed').length;
    const totalApplicants = applicants.length;
    const shortlisted = applicants.filter((applicant) =>
      ['shortlisted', 'reviewed', 'qualified', 'accepted'].includes(applicant.status.toLowerCase())
    ).length;
    const underReview = jobsWithCounts.filter((job) => job.status === 'Reviewing').length;

    return { totalJobs, totalApplicants, shortlisted, underReview };
  }, [jobsWithCounts, applicants]);

  const funnelStats = useMemo(() => {
    const pending = applicants.filter((a) => a.status.toLowerCase().includes('pending')).length;
    const reviewed = applicants.filter((a) => a.status.toLowerCase().includes('review')).length;
    const shortlisted = applicants.filter((a) => a.status.toLowerCase().includes('shortlist')).length;
    const qualified = applicants.filter((a) => a.status.toLowerCase().includes('qualif')).length;
    return { pending, reviewed, shortlisted, qualified };
  }, [applicants]);

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
  const positionOptions = useMemo(() => Array.from(new Set(applicants.map((a) => a.position).filter(Boolean))), [applicants]);
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

  const qualifiedApplicants = useMemo(() => {
    const base = applicants.filter((applicant) => {
      const normalized = applicant.status.toLowerCase();
      return normalized.includes('qualified') || normalized.includes('shortlist') || completedEvaluationIds.has(applicant.id);
    });

    const withEvaluationState = base.map((applicant) => ({
      ...applicant,
      evaluation_state: completedEvaluationIds.has(applicant.id) ? 'completed' : 'pending',
    }));

    return withEvaluationState.filter((applicant) => {
      if (qualifiedTab !== 'all' && applicant.evaluation_state !== qualifiedTab) return false;
      if (qualifiedPosition !== 'all' && applicant.position !== qualifiedPosition) return false;
      if (qualifiedOffice !== 'all' && applicant.office !== qualifiedOffice) return false;

      const term = qualifiedSearch.toLowerCase();
      if (!term) return true;

      return (
        applicant.full_name.toLowerCase().includes(term) ||
        applicant.position.toLowerCase().includes(term) ||
        applicant.office.toLowerCase().includes(term)
      );
    });
  }, [applicants, completedEvaluationIds, qualifiedTab, qualifiedPosition, qualifiedOffice, qualifiedSearch]);

  const avgQualifiedScore = useMemo(() => {
    if (qualifiedApplicants.length === 0) return 0;
    const scored = qualifiedApplicants.filter((applicant) => typeof applicant.total_score === 'number') as Array<
      ApplicantRecord & { total_score: number }
    >;
    if (scored.length === 0) return 0;
    return scored.reduce((sum, applicant) => sum + applicant.total_score, 0) / scored.length;
  }, [qualifiedApplicants]);

  const rankingPositionCards = useMemo<RankingPositionCard[]>(() => {
    const reportEligibleJobs = jobs.filter((job) => job.status !== 'Closed');
    const reportEligibleTitleSet = new Set(reportEligibleJobs.map((job) => job.title));
    const qualifiedByPosition = new Map<string, number>();

    applicants.forEach((applicant) => {
      if (!savedScoredApplicantIds.has(applicant.id)) return;
      const normalizedStatus = (applicant.status || '').toLowerCase();
      // Negative outcomes always exclude.
      const isExplicitlyExcluded =
        normalizedStatus.includes('disqual') ||
        normalizedStatus.includes('not qualified') ||
        normalizedStatus.includes('reject') ||
        normalizedStatus.includes('withdrawn');
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
  }, [applicants, completedEvaluationIds, jobs, savedScoredApplicantIds]);

  const activeRankingCard = useMemo(
    () => rankingPositionCards.find((card) => card.position === activeRankingPosition) || null,
    [rankingPositionCards, activeRankingPosition]
  );

  const activeRankingRows = useMemo<RankingApplicantRow[]>(() => {
    if (!activeRankingPosition) return [];

    const eligibleTitles = new Set(jobs.filter((job) => job.status !== 'Closed').map((job) => job.title));
    if (!eligibleTitles.has(activeRankingPosition)) return [];

    const candidates = applicants.filter((applicant) => {
      if (!savedScoredApplicantIds.has(applicant.id)) return false;
      if (applicant.position !== activeRankingPosition) return false;
      const normalizedStatus = (applicant.status || '').toLowerCase();
      // Match the qualification gate used by rankingPositionCards: scored + not
      // explicitly excluded ⇒ rankable. Keeps negative-status applicants out.
      const isExplicitlyExcluded =
        normalizedStatus.includes('disqual') ||
        normalizedStatus.includes('not qualified') ||
        normalizedStatus.includes('reject') ||
        normalizedStatus.includes('withdrawn');
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

        const writtenRawOrConverted = resolveScoreValue(stored?.writtenExam);
        const written = Number(normalizeWrittenScore(writtenRawOrConverted).toFixed(2));

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
  }, [activeRankingPosition, applicants, completedEvaluationIds, activeRankingCard, jobs, savedScoredApplicantIds]);

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
          status: row.status ?? 'Pending',
          documentUrl: row.file_url,
          documentType: row.document_type,
          fileName: row.file_name,
          fileType: row.file_type,
        }));
        setActiveDocumentSubmissions(mapped);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error('listEmployeeDocumentsByType: refresh failed', error);
        setDocumentsError(message);
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

  const newlyHiredRows = useMemo(() => getNewlyHired(), [section, applicants]);

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
  }, [credentialedNewlyHiredRows, portalAccountByEmployeeId, portalAccounts]);

  const credentialedApplicantDirectorySource = useMemo(
    () =>
      applicants
        .filter((employee) => credentialedApplicantIds.has(employee.id))
        .map((employee) => ({
          ...employee,
          employeeId: employeeNumberFromNewlyHired.get(employee.id),
        })),
    [applicants, credentialedApplicantIds, employeeNumberFromNewlyHired]
  );

  const fallbackEmployeeDirectorySource = useMemo(() => {
    const employeeRecords = getEmployeeRecords();
    const seenEmployeeIds = new Set<string>();
    
    // Add employees from recruitment records
    const records = employeeRecords.reduce<ApplicantRecord[]>((acc, record) => {
        const employeeId = String(record.employeeId ?? '').trim();
        if (!employeeId) return acc;

        seenEmployeeIds.add(employeeId);
        const account = portalAccountByEmployeeId.get(employeeId);

        acc.push({
          id: employeeId,
          employeeId,
          full_name: String(account?.employee.fullName ?? record.name ?? 'Employee'),
          email: String(account?.employee.email ?? ''),
          contact_number: String(account?.employee.mobileNumber ?? ''),
          position: String(record.position ?? '').trim() || 'Unassigned Position',
          office: String(record.department ?? record.division ?? '').trim() || 'Unassigned Office',
          status: 'Active',
          created_at: String(record.startDate ?? account?.createdAt ?? new Date().toISOString()),
          total_score: null,
        });

        return acc;
      }, []);

    // Also add any portal accounts that aren't in recruitment records
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
        total_score: null,
      });
    });

    return records;
  }, [portalAccountByEmployeeId, portalAccounts]);

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
    [applicants, credentialedApplicantDirectorySource, fallbackEmployeeDirectorySource]
  );

  const employeeDirectoryCards = useMemo(() => {
    const source = directoryEmployeesSource;
    const searchTerm = employeeDirectorySearch.trim().toLowerCase();
    const grouped = new Map<string, { position: string; office: string; count: number; activeCount: number; inactiveCount: number; status: EmployeeDirectoryCardStatus }>();

    source.forEach((employee) => {
      // Skip placeholder/unassigned positions
      const position = employee.position || 'Unassigned Position';
      if (position === 'Employee' || position === 'Unassigned Position' || !position.trim()) {
        return;
      }

      const office = employee.office || 'Unassigned Office';
      const isInactive = employee.status.toLowerCase().includes('inactive');
      const key = `${position}__${office}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.count += 1;
        if (isInactive) {
          existing.inactiveCount += 1;
        } else {
          existing.activeCount += 1;
        }
      } else {
        grouped.set(key, {
          position,
          office,
          count: 1,
          activeCount: isInactive ? 0 : 1,
          inactiveCount: isInactive ? 1 : 0,
          status: isInactive ? 'Inactive' : 'Active',
        });
      }
    });

    let cards = Array.from(grouped.values())
      .map((card) => ({
        ...card,
        status:
          card.activeCount > 0 && card.inactiveCount > 0
            ? 'Mixed'
            : card.inactiveCount > 0
              ? 'Inactive'
              : 'Active',
      }))
      .sort((a, b) => a.position.localeCompare(b.position));

    if (searchTerm) {
      cards = cards.filter((card) =>
        card.position.toLowerCase().includes(searchTerm) || card.office.toLowerCase().includes(searchTerm)
      );
    }

    if (employeeDirectoryStatusFilter !== 'all') {
      cards = cards.filter((card) => card.status === employeeDirectoryStatusFilter);
    }

    if (employeeDirectoryOfficeFilter !== 'all') {
      cards = cards.filter((card) => card.office === employeeDirectoryOfficeFilter);
    }

    return {
      cards,
      totalEmployees: source.length,
      totalPositions: grouped.size,
    };
  }, [directoryEmployeesSource, employeeDirectoryOfficeFilter, employeeDirectorySearch, employeeDirectoryStatusFilter]);

  const employeeDirectoryOfficeOptions = useMemo(
    () =>
      Array.from(new Set(directoryEmployeesSource.map((employee) => employee.office || 'Unassigned Office'))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [directoryEmployeesSource]
  );

  const employeeDirectoryPageCount = Math.max(1, Math.ceil(employeeDirectoryCards.cards.length / EMPLOYEE_DIRECTORY_POSITIONS_PER_PAGE));
  const safeEmployeeDirectoryPage = Math.min(employeeDirectoryPage, employeeDirectoryPageCount - 1);
  const paginatedEmployeeDirectoryCards = useMemo(
    () =>
      employeeDirectoryCards.cards.slice(
        safeEmployeeDirectoryPage * EMPLOYEE_DIRECTORY_POSITIONS_PER_PAGE,
        (safeEmployeeDirectoryPage + 1) * EMPLOYEE_DIRECTORY_POSITIONS_PER_PAGE
      ),
    [employeeDirectoryCards.cards, safeEmployeeDirectoryPage]
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

  const selectedPositionEmployees = useMemo(() => {
    if (!selectedDirectoryCard) return [];
    return directoryEmployeesSource.filter(
      (employee) => employee.position === selectedDirectoryCard.position && employee.office === selectedDirectoryCard.office
    );
  }, [directoryEmployeesSource, selectedDirectoryCard]);

  const selectedEmployeeDetails = useMemo(
    () => directoryEmployeesSource.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [directoryEmployeesSource, selectedEmployeeId]
  );

  const selectedEmployeeProfile = useMemo(() => {
    if (!selectedEmployeeDetails) return null;
    const resolvedEmployeeId = String(
      selectedEmployeeDetails.employeeId ?? employeeNumberFromNewlyHired.get(selectedEmployeeDetails.id) ?? ''
    ).trim();
    const portalAccount =
      (resolvedEmployeeId ? portalAccountByEmployeeId.get(resolvedEmployeeId) : null) ??
      portalAccountByApplicantId.get(selectedEmployeeDetails.id);
    const emp = portalAccount?.employee;
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
    const ageFromDob = computeAge(emp?.dateOfBirth);
    return {
      address: emp?.homeAddress || selectedEmployeeDetails.contact_number || '--',
      dateOfBirth: emp?.dateOfBirth || '--',
      placeOfBirth: emp?.placeOfBirth || '--',
      age: ageFromDob != null ? `${ageFromDob} years old` : (emp?.age != null ? `${emp.age} years old` : '--'),
      sex: emp?.gender || '--',
      civilStatus: emp?.civilStatus || '--',
      emergencyContactName: emp?.emergencyContactName || '--',
      emergencyContactRelationship: emp?.emergencyRelationship || '--',
      emergencyContactPhone: emp?.emergencyContactNumber || '--',
      dateHired: formatDate(selectedEmployeeDetails.created_at),
    };
  }, [selectedEmployeeDetails, employeeNumberFromNewlyHired, portalAccountByApplicantId, portalAccountByEmployeeId]);

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
    const currentDepartment = selectedEmployeeDetails.office || 'IT Department';
    const currentPosition = selectedEmployeeDetails.position || '';
    setPositionChangeForm((prev) => ({
      ...prev,
      newDepartment: EMPLOYEE_DIRECTORY_DEPARTMENTS.includes(currentDepartment)
        ? currentDepartment
        : 'IT Department',
      newPosition: currentPosition,
    }));
  }, [selectedEmployeeDetails]);

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
    jobs: 'Job Postings Management',
    qualified: 'Qualified Applicants',
    'new-hired': 'Newly Hired Employees',
    raters: 'Rater Management & Access Control',
    accounts: 'Account Management',
    reports: 'Reports & Document Generation',
    settings: 'Settings',
  }[section];

  const goToSection = (target: Section) => {
    if (target === 'dashboard') navigate('/admin/rsp');
    if (target === 'jobs') navigate('/admin/rsp/jobs');
    if (target === 'qualified') navigate('/admin/rsp/qualified');
    if (target === 'new-hired') navigate('/admin/rsp/new-hired');
    if (target === 'raters') navigate('/admin/rsp/raters');
    if (target === 'accounts') navigate('/admin/rsp/accounts');
    if (target === 'reports') navigate('/admin/rsp/reports');
    if (target === 'settings') navigate('/admin/rsp/settings');
  };

  const handleCreateJob = async () => {
    if (!newJob.title || !newJob.item_number || !newJob.department) return;

    const payload = {
      title: newJob.title,
      item_number: newJob.item_number,
      department: newJob.department,
      office: newJob.department,
      status: newJob.status,
      created_at: new Date().toISOString(),
    };

    const numericIds = jobs
      .map((job) => (typeof job.id === 'number' ? job.id : Number.NaN))
      .filter((id) => Number.isFinite(id)) as number[];
    const localId = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1;
    const nextJobs = [{ ...payload, id: localId, applicant_count: 0 } as JobRecord, ...jobs];
    setJobs(nextJobs);
    persistDashboardJobsToRecruitment(nextJobs);

    setShowJobDialog(false);
    setNewJob({
      title: '',
      item_number: '',
      department: '',
      status: 'Open',
      salary_grade: '',
      position_level: '',
      slots: '1',
      employment_type: 'Full-time',
      application_deadline: '',
      description: '',
      responsibilities: '',
      qualifications: '',
    });
  };

  const handleDeleteJob = async (job: JobRecord) => {
    const nextJobs = jobs.filter((item) => item.id !== job.id);
    setJobs(nextJobs);

    // Persist through the central recruitment utility so all dependent caches/events stay in sync.
    const nextRecruitmentRows: JobPosting[] = nextJobs.map((row, index) => ({
      id: String(row.id ?? crypto.randomUUID()),
      jobCode: row.item_number || `LGU-2026-${String(index + 1).padStart(3, '0')}`,
      title: row.title,
      department: row.department || 'Operations',
      division: 'Operations',
      positionType: 'Civil Service',
      salaryGrade: 'SG-10',
      salaryRange: { min: 20000, max: 30000 },
      numberOfPositions: 1,
      employmentStatus: 'Permanent',
      summary: `${row.title} recruitment posting.`,
      responsibilities: ['Review and process applications.'],
      qualifications: {
        education: "Bachelor's Degree",
        experience: { years: 0, field: 'General' },
        skills: [],
        certifications: [],
      },
      requiredDocuments: ['Resume/CV', 'Application Letter'],
      applicationDeadline: new Date(Date.now() + 30 * 86400000).toISOString(),
      status: row.status === 'Closed' ? 'Closed' : row.status === 'Reviewing' ? 'Draft' : 'Active',
      postedDate: row.created_at || new Date().toISOString(),
      postedBy: 'HR Admin',
      applicantCount: row.applicant_count ?? 0,
      qualifiedCount: 0,
    }));
    saveJobPostings(nextRecruitmentRows);

    try {
      await Promise.allSettled([
        supabase.from('job_postings').delete().eq('id', job.id),
        supabase.from('jobs').delete().eq('id', job.id),
        supabase.from('job_postings').delete().eq('title', job.title).eq('item_number', job.item_number),
        supabase.from('jobs').delete().eq('title', job.title).eq('item_number', job.item_number),
      ]);
    } catch {
    }
  };

  const handleToggleJobStatus = async (job: JobRecord) => {
    const updatedStatus: JobStatus = job.status === 'Closed' ? 'Open' : 'Closed';
    const nextJobs = jobs.map((item) => (item.id === job.id ? { ...item, status: updatedStatus } : item));
    setJobs(nextJobs);

    // Persist through the central recruitment utility so all dependent caches/events stay in sync.
    const nextRecruitmentRows: JobPosting[] = nextJobs.map((row, index) => ({
      id: String(row.id ?? crypto.randomUUID()),
      jobCode: row.item_number || `LGU-2026-${String(index + 1).padStart(3, '0')}`,
      title: row.title,
      department: row.department || 'Operations',
      division: 'Operations',
      positionType: 'Civil Service',
      salaryGrade: 'SG-10',
      salaryRange: { min: 20000, max: 30000 },
      numberOfPositions: 1,
      employmentStatus: 'Permanent',
      summary: `${row.title} recruitment posting.`,
      responsibilities: ['Review and process applications.'],
      qualifications: {
        education: "Bachelor's Degree",
        experience: { years: 0, field: 'General' },
        skills: [],
        certifications: [],
      },
      requiredDocuments: ['Resume/CV', 'Application Letter'],
      applicationDeadline: new Date(Date.now() + 30 * 86400000).toISOString(),
      status: row.status === 'Closed' ? 'Closed' : row.status === 'Reviewing' ? 'Draft' : 'Active',
      postedDate: row.created_at || new Date().toISOString(),
      postedBy: 'HR Admin',
      applicantCount: row.applicant_count ?? 0,
      qualifiedCount: 0,
    }));
    saveJobPostings(nextRecruitmentRows);

    try {
      await Promise.allSettled([
        (supabase as any).from('job_postings').update({ status: updatedStatus }).eq('id', job.id),
        (supabase as any).from('jobs').update({ status: updatedStatus }).eq('id', job.id),
        (supabase as any).from('job_postings').update({ status: updatedStatus }).eq('title', job.title).eq('item_number', job.item_number),
        (supabase as any).from('jobs').update({ status: updatedStatus }).eq('title', job.title).eq('item_number', job.item_number),
      ]);
    } catch {
    }
  };

  const handleCreateRater = async () => {
    if (!newRater.name || !newRater.email || !newRater.department) return;

    const assignmentKey = normalizeEmailKey(newRater.email);
    const nextAssignments = {
      ...raterAssignedPositionsByEmail,
      [assignmentKey]: [...raterAccessForm.assignedPositions],
    };
    setRaterAssignedPositionsByEmail(nextAssignments);
    saveRaterAssignments(nextAssignments);

    setRaters((prev) => prev.map((rater) =>
      normalizeEmailKey(rater.email) === assignmentKey
        ? { ...rater, is_active: true }
        : rater
    ));

    try {
      const client = getAccessClient();
      await runRaterEmailUpdate(client, { is_active: true }, newRater.email);
      saveRaterAccessState(newRater.email, true);
    } catch {
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
      const nextAssignments = { ...raterAssignedPositionsByEmail };
      delete nextAssignments[assignmentKey];
      setRaterAssignedPositionsByEmail(nextAssignments);
      saveRaterAssignments(nextAssignments);
    }

    try {
      const client = getPreferredClient();
      await client.from('raters').delete().eq('id', id);
    } catch {
    }
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

  const toggleArchiveDetails = (archiveId: string) => {
    setExpandedArchiveIds((prev) => ({
      ...prev,
      [archiveId]: !prev[archiveId],
    }));
  };

  const handleDeleteArchivePermanently = (archiveId: string, title: string) => {
    const confirmed = window.confirm(
      `Permanently delete archived report for \"${title}\"? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletedJobReports((prev) => {
      const next = prev.filter((report) => report.id !== archiveId);
      saveDeletedJobReports(next);
      return next;
    });

    setExpandedArchiveIds((prev) => {
      const next = { ...prev };
      delete next[archiveId];
      return next;
    });
  };

  const openRankingReport = (position: string) => {
    setActiveRankingPosition(position);
    setSelectedHireApplicantIds([]);
    setShowRankingModal(true);
  };

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

  const openDocumentTemplate = (templateId: EmployeeDocumentTemplateId) => {
    setActiveDocumentTemplateId(templateId);
    setReportsView('documents');
    setSelectedDocumentSubmissionIds([]);
    setExpandedDocumentOffices({});
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

  const triggerDocumentDownload = (entries: EmployeeDocumentSubmission[]) => {
    if (entries.length === 0) return;
    const downloadable = entries.filter((entry) => entry.documentUrl && entry.documentUrl !== '#');

    if (downloadable.length > 0) {
      downloadable.forEach((entry, index) => {
        window.setTimeout(() => {
          const fileName =
            `${entry.fullName}-${entry.documentType}`.replace(/\s+/g, '_') || 'document';
          void downloadEmployeeDocument({
            file_url: entry.documentUrl,
            file_name: fileName,
          });
        }, index * 120);
      });
      return;
    }

    const lines = [
      'Name,Employee Code,Position,Office,Submitted Date,Status',
      ...entries.map((entry) =>
        [entry.fullName, entry.employeeCode, entry.position, entry.office, entry.submittedDate, entry.status]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeDocumentTemplate?.id || 'employee-documents'}-${new Date().getTime()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

    const existing = getNewlyHired();
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

    // Persist the status flip to the backend (relative /api → Vite proxy on :8000).
    // If the backend is unavailable, fall back to Supabase. We verify Supabase
    // succeeded by reading back the row(s); RLS can return error:null with 0 rows.
    const persistOne = async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/applicants/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicant_id: id, status: 'hired' }),
        });
        if (res.ok) return true;
        console.warn('[RSPDashboard] hire backend PATCH failed', id, res.status);
      } catch (err) {
        console.warn('[RSPDashboard] hire backend PATCH threw', id, err);
      }
      try {
        const { data: updated, error } = await (supabase as any)
          .from('applicants')
          .update({ status: 'Hired' })
          .eq('id', id)
          .select('id, status');
        if (error) {
          console.error('[RSPDashboard] hire supabase update error', id, error);
          return false;
        }
        if (!Array.isArray(updated) || updated.length === 0) {
          console.error('[RSPDashboard] hire supabase update returned 0 rows for', id, '— likely RLS blocking UPDATE');
          return false;
        }
        return true;
      } catch (err) {
        console.error('[RSPDashboard] hire supabase update threw', id, err);
        return false;
      }
    };

    const persistResults = await Promise.all(selectedRows.map((row) => persistOne(row.id)));
    const allPersisted = persistResults.every(Boolean);
    if (!allPersisted) {
      console.warn(
        '[RSPDashboard] not all hire status updates persisted to DB — local Newly Hired entries were saved regardless.',
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

  const openBulkRequestDialog = () => {
    setShowBulkRequestDialog(true);
  };

  const openPositionEmployees = (position: string, office: string) => {
    setSelectedDirectoryCard({ position, office });
    setSelectedEmployeeId(null);
    setAccountsView('position');
  };

  const clearEmployeeDirectoryFilters = () => {
    setEmployeeDirectorySearch('');
    setEmployeeDirectoryStatusFilter('all');
    setEmployeeDirectoryOfficeFilter('all');
    setEmployeeDirectoryPage(0);
  };

  const openEmployeeDetails = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setEmployeeDetailsTab('personal');
    setShowPositionChangeModal(false);
    setAccountsView('details');
  };

  const handleSendBulkRequest = () => {
    if (isBulkRequestSendDisabled) return;
    closeBulkRequestDialog();
  };

  const urgentItems = [
    {
      title: 'Deadline Approaching',
      subtitle:
        jobsWithCounts.length > 0
          ? `${jobsWithCounts[0].title} closes soon`
          : 'No active job deadlines found',
      color: 'border-l-[4px] border-l-orange-500 bg-orange-50',
    },
    {
      title: 'Pending Reviews',
      subtitle: `${funnelStats.pending} applications awaiting initial review`,
      color: 'border-l-[4px] border-l-blue-500 bg-blue-50',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />

      <main className="admin-content !p-0">
        <div className="border-b border-[var(--border-color)] bg-white px-8 py-6">
          <h1 className={`!mb-1 font-bold ${section === 'new-hired' || section === 'reports' ? '!text-xl' : '!text-2xl'}`}>{sectionTitle}</h1>
          <p className={`!mb-0 text-[var(--text-secondary)] ${section === 'new-hired' || section === 'reports' ? '!text-sm' : '!text-base'}`}>
            {section === 'dashboard' && 'Overview of recruitment, selection and placement activities'}
            {section === 'jobs' && 'Manage and monitor all job positions and their applicants'}
            {section === 'qualified' && 'List of applicants who passed the evaluation and are eligible for further processing'}
            {section === 'new-hired' && 'Generate employee accounts for newly hired staff'}
            {section === 'raters' && 'Assign raters and define their evaluation access for specific job positions'}
            {section === 'accounts' && 'Manage employee accounts and information'}
            {section === 'reports' && 'Generate official government reports and access employee documents'}
            {section === 'settings' && 'Manage your personal information and account details'}
          </p>
        </div>

        <div className="space-y-6 p-8">
          {section === 'dashboard' && (
            <>
              <section className="grid grid-cols-1 gap-5 xl:grid-cols-4">
                {[
                  { label: 'Total Job Openings', value: dashboardStats.totalJobs, icon: FileText, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
                  { label: 'Total Applicants', value: dashboardStats.totalApplicants, icon: Users, iconBg: 'bg-green-100', iconColor: 'text-green-600' },
                  { label: 'Shortlisted Applicants', value: dashboardStats.shortlisted, icon: UserCheck, iconBg: 'bg-purple-100', iconColor: 'text-purple-600' },
                  { label: 'Positions Under Review', value: dashboardStats.underReview, icon: Clock3, iconBg: 'bg-orange-100', iconColor: 'text-orange-600' },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <article key={card.label} className="rounded-2xl border border-[var(--border-color)] bg-white p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="!mb-2 text-sm text-[var(--text-secondary)]">{card.label}</p>
                          <p className="!mb-0 text-2xl font-bold text-[var(--text-primary)]">{card.value}</p>
                        </div>
                        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${card.iconBg}`}>
                          <Icon className={card.iconColor} size={24} />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>

              <section>
                <h2 className="!mb-4 text-lg font-semibold">Quick Actions</h2>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  {[
                    { title: 'Manage Job Postings', subtitle: 'View and manage all positions', icon: FileText, action: 'jobs' as Section },
                    { title: 'Qualified Applicants', subtitle: 'View all qualified candidates', icon: UserCheck, action: 'qualified' as Section },
                    { title: 'All Applicants', subtitle: 'Review all submissions', icon: Users, path: '/interviewer/dashboard' },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={card.title}
                        type="button"
                        onClick={() => {
                          if ('path' in card && card.path) {
                            navigate(card.path);
                          } else if ('action' in card && card.action) {
                            goToSection(card.action as Section);
                          }
                        }}
                        className="flex items-center gap-4 rounded-2xl border border-[var(--border-color)] bg-white px-5 py-4 text-left transition hover:border-[var(--primary-color)]"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                          <Icon size={22} />
                        </div>
                        <div className="flex-1">
                          <p className="!mb-1 text-base font-semibold text-[var(--text-primary)]">{card.title}</p>
                          <p className="!mb-0 text-sm text-[var(--text-secondary)]">{card.subtitle}</p>
                        </div>
                        <ChevronRight size={22} className="text-[var(--text-muted)]" />
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <div className="space-y-4 rounded-2xl border border-[var(--border-color)] bg-white p-5 xl:col-span-2">
                  <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4">
                    <h3 className="!mb-0 text-lg font-semibold">Urgent Items</h3>
                    <Clock3 className="text-orange-500" size={20} />
                  </div>
                  {urgentItems.map((item) => (
                    <article key={item.title} className={`rounded-2xl p-4 ${item.color}`}>
                      <p className="!mb-1 text-base font-semibold text-[var(--text-primary)]">{item.title}</p>
                      <p className="!mb-0 text-sm text-[var(--text-secondary)]">{item.subtitle}</p>
                    </article>
                  ))}
                </div>

                <div className="rounded-2xl border border-[var(--border-color)] bg-white p-5">
                  <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4">
                    <h3 className="!mb-0 text-lg font-semibold">Application Funnel</h3>
                    <ChevronRight className="rotate-[-45deg] text-blue-600" size={20} />
                  </div>
                  <div className="space-y-4 pt-5">
                    {[
                      { label: 'Pending', value: funnelStats.pending, color: 'bg-amber-500' },
                      { label: 'Reviewed', value: funnelStats.reviewed, color: 'bg-blue-500' },
                      { label: 'Shortlisted', value: funnelStats.shortlisted, color: 'bg-purple-500' },
                      { label: 'Qualified', value: funnelStats.qualified, color: 'bg-green-500' },
                    ].map((item) => {
                      const maxValue = Math.max(1, funnelStats.pending, funnelStats.reviewed, funnelStats.shortlisted, funnelStats.qualified);
                      const width = `${(item.value / maxValue) * 100}%`;
                      return (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span>{item.label}</span>
                            <span className="font-semibold">{item.value}</span>
                          </div>
                          <div className="h-3 rounded-full bg-slate-200">
                            <div className={`h-3 rounded-full ${item.color}`} style={{ width }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border-color)] bg-white p-5">
                  <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-4">
                    <h3 className="!mb-0 text-lg font-semibold">Recent Activity</h3>
                    <Calendar className="text-[var(--text-muted)]" size={20} />
                  </div>
                  <div className="space-y-4">
                    {applicants.slice(0, 5).map((applicant) => (
                      <div key={applicant.id} className="flex items-start gap-4 border-b border-[var(--border-color)] pb-3 last:border-b-0">
                        <div className="rounded-xl bg-blue-100 p-3 text-blue-600">
                          <FileText size={18} />
                        </div>
                        <div>
                          <p className="!mb-1 text-base text-[var(--text-primary)]">{applicant.full_name}</p>
                          <p className="!mb-0 text-sm text-[var(--text-secondary)]">{formatDate(applicant.created_at)}</p>
                        </div>
                      </div>
                    ))}
                    {applicants.length === 0 && <p className="!mb-0 text-sm text-[var(--text-secondary)]">No recent activity found.</p>}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--border-color)] bg-white p-5">
                  <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-4">
                    <h3 className="!mb-0 text-lg font-semibold">Positions by Department</h3>
                    <Building2 className="text-[var(--text-muted)]" size={20} />
                  </div>
                  <div className="space-y-3">
                    {officeOptions.map((office) => {
                      const officeApplicants = applicants.filter((applicant) => applicant.office === office);
                      const officePositions = new Set(officeApplicants.map((applicant) => applicant.position)).size;
                      return (
                        <div key={office} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                          <div>
                            <p className="!mb-1 text-base font-semibold text-[var(--text-primary)]">{office}</p>
                            <p className="!mb-0 text-sm text-[var(--text-secondary)]">{officePositions} position{officePositions === 1 ? '' : 's'}</p>
                          </div>
                          <p className="!mb-0 text-right text-xl font-bold text-blue-600">{officeApplicants.length}</p>
                        </div>
                      );
                    })}
                    {officeOptions.length === 0 && <p className="!mb-0 text-sm text-[var(--text-secondary)]">No department data available.</p>}
                  </div>
                </div>
              </section>
            </>
          )}

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
                      placeholder="Search by job title or item number..."
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
                      <p className="!mb-3 text-lg text-[var(--text-secondary)]">Item No. {job.item_number}</p>
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

              <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-white shadow-sm">
                <table className="w-full border-collapse">
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
              {accountsView === 'overview' ? (
                <>
                  <section className="rounded-2xl border border-[var(--border-color)] bg-white p-6 xl:w-3/5">
                    <button
                      type="button"
                      onClick={() => setAccountsView('directory')}
                      className="flex w-full items-center gap-4 rounded-2xl border border-[var(--border-color)] px-6 py-6 text-left transition hover:border-[var(--primary-color)]"
                    >
                      <div className="rounded-2xl bg-blue-100 p-4 text-blue-600"><Users size={28} /></div>
                      <div className="flex-1">
                        <p className="!mb-1 text-xl font-semibold text-[var(--text-primary)]">Employee Directory</p>
                        <p className="!mb-0 text-lg text-[var(--text-secondary)]">View and manage all employee accounts, personal information, and document requirements</p>
                      </div>
                      <ChevronRight size={30} className="text-[var(--text-muted)]" />
                    </button>
                  </section>

                  <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6 xl:w-3/5">
                    <h3 className="!mb-3 text-xl font-semibold text-blue-900">What you can do:</h3>
                    <ul className="list-disc space-y-2 pl-6 text-base text-blue-800">
                      <li>View all employees organized by position</li>
                      <li>Access detailed employee profiles with personal information</li>
                      <li>Request and manage employee document submissions</li>
                      <li>Approve or request resubmission of documents</li>
                    </ul>
                  </section>
                </>
              ) : accountsView === 'directory' ? (
                <>
                  <section className="flex items-start justify-between gap-4">
                    <div>
                      <p className="!mb-1 text-base text-blue-600">RSP / Employees</p>
                      <h2 className="!mb-1 text-4xl font-bold text-[var(--text-primary)]">Employee Directory</h2>
                      <p className="!mb-0 text-lg text-[var(--text-secondary)]">
                        Browse employees by position • {employeeDirectoryCards.totalEmployees} total employees
                      </p>
                    </div>
                    <Button
                      type="button"
                      className="relative z-10 !px-6 !py-3 text-lg"
                      onClick={openBulkRequestDialog}
                    >
                      <FileText size={20} /> Bulk Document Request
                    </Button>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.3fr)_280px_280px]">
                      <div className="relative">
                        <Search size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          value={employeeDirectorySearch}
                          onChange={(e) => {
                            setEmployeeDirectorySearch(e.target.value);
                            setEmployeeDirectoryPage(0);
                          }}
                          placeholder="Search by position or office..."
                          className="h-12 w-full rounded-lg border border-slate-300 pl-10 pr-3 text-base"
                        />
                      </div>

                      <select
                        className="h-12 rounded-lg border border-slate-300 px-3 text-base"
                        value={employeeDirectoryStatusFilter}
                        onChange={(e) => {
                          setEmployeeDirectoryStatusFilter(e.target.value as 'all' | EmployeeDirectoryCardStatus);
                          setEmployeeDirectoryPage(0);
                        }}
                      >
                        <option value="all">All Status</option>
                        <option value="Active">Active</option>
                        <option value="Mixed">Mixed</option>
                        <option value="Inactive">Inactive</option>
                      </select>

                      <select
                        className="h-12 rounded-lg border border-slate-300 px-3 text-base"
                        value={employeeDirectoryOfficeFilter}
                        onChange={(e) => {
                          setEmployeeDirectoryOfficeFilter(e.target.value);
                          setEmployeeDirectoryPage(0);
                        }}
                      >
                        <option value="all">All Offices</option>
                        {employeeDirectoryOfficeOptions.map((office) => (
                          <option key={office} value={office}>{office}</option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-base text-slate-600">
                      <p className="!mb-0">Showing {employeeDirectoryCards.cards.length} position{employeeDirectoryCards.cards.length === 1 ? '' : 's'}</p>
                      <button type="button" className="text-sm font-medium text-blue-700" onClick={clearEmployeeDirectoryFilters}>
                        Clear Filters
                      </button>
                    </div>
                  </section>

                  <div className="flex items-center justify-center text-lg font-semibold text-slate-700">
                    {employeeDirectoryCards.cards.length === 0
                      ? 'Position 0 to 0 of 0'
                      : `Position ${safeEmployeeDirectoryPage * EMPLOYEE_DIRECTORY_POSITIONS_PER_PAGE + 1} to ${Math.min((safeEmployeeDirectoryPage + 1) * EMPLOYEE_DIRECTORY_POSITIONS_PER_PAGE, employeeDirectoryCards.cards.length)} of ${employeeDirectoryCards.cards.length}`}
                  </div>

                  <section className="grid grid-cols-[56px_minmax(0,1fr)_56px] items-start gap-4">
                    <button
                      type="button"
                      onClick={() => setEmployeeDirectoryPage((current) => Math.max(0, current - 1))}
                      disabled={safeEmployeeDirectoryPage === 0 || employeeDirectoryCards.cards.length === 0}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft size={24} />
                    </button>

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                      {paginatedEmployeeDirectoryCards.map((card) => (
                        <button
                          key={`${card.position}-${card.office}`}
                          type="button"
                          onClick={() => openPositionEmployees(card.position, card.office)}
                          className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${card.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : card.status === 'Inactive' ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-700'}`}>
                              {card.status}
                            </span>
                            <ChevronRight size={18} className="text-slate-400" />
                          </div>
                          <h3 className="!mb-2 text-2xl font-bold text-slate-900">{card.position}</h3>
                          <div className="space-y-2 text-base text-slate-600">
                            <p className="!mb-0 inline-flex items-center gap-2"><MapPin size={16} className="text-slate-400" /> {card.office}</p>
                            <p className="!mb-0 inline-flex items-center gap-2"><Users size={16} className="text-slate-400" /> {card.count} employee{card.count === 1 ? '' : 's'}</p>
                            <p className="!mb-0 inline-flex items-center gap-2"><UserCheck size={16} className="text-slate-400" /> {card.activeCount} active • {card.inactiveCount} inactive</p>
                          </div>
                          <div className="mt-5 rounded-xl bg-blue-600 px-4 py-3 text-center text-base font-semibold text-white">
                            View Employees
                          </div>
                        </button>
                      ))}
                      {employeeDirectoryCards.cards.length === 0 && (
                        <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                          <Briefcase className="mx-auto h-10 w-10 text-slate-400" />
                          <p className="mt-2 font-medium">No positions found for the selected filters.</p>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setEmployeeDirectoryPage((current) => Math.min(employeeDirectoryPageCount - 1, current + 1))}
                      disabled={safeEmployeeDirectoryPage >= employeeDirectoryPageCount - 1 || employeeDirectoryCards.cards.length === 0}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight size={24} />
                    </button>
                  </section>

                  <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    <p className="!mb-0">
                      Showing {employeeDirectoryCards.cards.length === 0 ? 0 : safeEmployeeDirectoryPage * EMPLOYEE_DIRECTORY_POSITIONS_PER_PAGE + 1}-{Math.min((safeEmployeeDirectoryPage + 1) * EMPLOYEE_DIRECTORY_POSITIONS_PER_PAGE, employeeDirectoryCards.cards.length)} of {employeeDirectoryCards.cards.length} positions
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded border border-slate-300 p-1 disabled:opacity-40"
                        onClick={() => setEmployeeDirectoryPage((current) => Math.max(0, current - 1))}
                        disabled={safeEmployeeDirectoryPage === 0 || employeeDirectoryCards.cards.length === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="font-semibold text-slate-800">Page {safeEmployeeDirectoryPage + 1} / {employeeDirectoryPageCount}</span>
                      <button
                        className="rounded border border-slate-300 p-1 disabled:opacity-40"
                        onClick={() => setEmployeeDirectoryPage((current) => Math.min(employeeDirectoryPageCount - 1, current + 1))}
                        disabled={safeEmployeeDirectoryPage >= employeeDirectoryPageCount - 1 || employeeDirectoryCards.cards.length === 0}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </footer>

                  <div>
                    <Button variant="secondary" onClick={() => setAccountsView('overview')}>
                      <ChevronLeft size={18} /> Back to Account Management
                    </Button>
                  </div>
                </>
              ) : accountsView === 'position' ? (
                <>
                  <section>
                    <button
                      type="button"
                      onClick={() => setAccountsView('directory')}
                      className="mb-3 inline-flex items-center gap-2 text-xl font-semibold text-blue-600"
                    >
                      <ChevronLeft size={24} /> Employees
                    </button>
                    <h2 className="!mb-1 text-4xl font-bold text-[var(--text-primary)]">{selectedDirectoryCard?.position ?? 'Position'}</h2>
                    <p className="!mb-0 text-lg text-[var(--text-secondary)]">{selectedPositionEmployees.length} employee{selectedPositionEmployees.length === 1 ? '' : 's'}</p>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-white">
                    <table className="w-full border-collapse">
                      <thead className="bg-slate-50 text-left text-sm uppercase tracking-wide text-[var(--text-secondary)]">
                        <tr>
                          <th className="px-5 py-4">Employee Name</th>
                          <th className="px-5 py-4">Employee Number</th>
                          <th className="px-5 py-4">Position</th>
                          <th className="px-5 py-4">Department</th>
                          <th className="px-5 py-4">Status</th>
                          <th className="px-5 py-4">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPositionEmployees.map((employee) => {
                          const statusLabel = employee.status.toLowerCase().includes('inactive') ? 'Inactive' : 'Active';
                          return (
                            <tr key={employee.id} className="border-t border-[var(--border-color)] text-lg">
                              <td className="px-5 py-4">
                                <p className="!mb-0 font-semibold text-[var(--text-primary)]">{employee.full_name}</p>
                                <p className="!mb-0 text-base text-[var(--text-secondary)]">{employee.email || '--'}</p>
                              </td>
                              <td className="px-5 py-4 text-[var(--text-secondary)]">{employeeNumberById.get(employee.id) ?? '--'}</td>
                              <td className="px-5 py-4 text-[var(--text-secondary)]">{employee.position || '--'}</td>
                              <td className="px-5 py-4 text-[var(--text-secondary)]">{employee.office || '--'}</td>
                              <td className="px-5 py-4">
                                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusLabel === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'}`}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                <button
                                  type="button"
                                  onClick={() => openEmployeeDetails(employee.id)}
                                  className="rounded-full border border-[var(--border-color)] p-2 text-[var(--text-muted)] transition hover:border-blue-400 hover:text-blue-600"
                                >
                                  <ChevronRight size={18} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {selectedPositionEmployees.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-5 py-8 text-center text-base text-[var(--text-secondary)]">No employees found for this position.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </section>
                </>
              ) : (
                <>
                  <section>
                    <button
                      type="button"
                      onClick={() => setAccountsView('position')}
                      className="mb-3 inline-flex items-center gap-2 text-xl font-semibold text-blue-600"
                    >
                      <ChevronLeft size={24} /> Back to Employees
                    </button>

                    <div className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                      <div className="mb-5 flex items-start gap-5">
                        <div className="rounded-2xl bg-blue-100 p-5 text-blue-600"><User size={48} /></div>
                        <div>
                          <h2 className="!mb-1 text-4xl font-bold text-[var(--text-primary)]">{selectedEmployeeDetails?.full_name ?? 'Employee'}</h2>
                          <p className="!mb-3 text-xl text-[var(--text-secondary)]">{selectedEmployeeDetails?.position || '--'}</p>
                          <div className="flex flex-wrap gap-2 text-base">
                            <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">{selectedEmployeeDetails?.office || 'Unassigned Office'}</span>
                            <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">
                              {selectedEmployeeDetails?.status?.toLowerCase().includes('inactive') ? 'Inactive' : 'Active'}
                            </span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-[var(--text-secondary)]">{selectedEmployeeDetails ? employeeNumberById.get(selectedEmployeeDetails.id) : '--'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 border-b border-[var(--border-color)]">
                        <button
                          type="button"
                          onClick={() => setEmployeeDetailsTab('personal')}
                          className={`mr-6 border-b-2 px-2 py-3 text-xl font-semibold ${employeeDetailsTab === 'personal' ? 'border-blue-600 text-blue-600' : 'border-transparent text-[var(--text-secondary)]'}`}
                        >
                          Personal Details
                        </button>
                        <button
                          type="button"
                          onClick={() => setEmployeeDetailsTab('documents')}
                          className={`border-b-2 px-2 py-3 text-xl font-semibold ${employeeDetailsTab === 'documents' ? 'border-blue-600 text-blue-600' : 'border-transparent text-[var(--text-secondary)]'}`}
                        >
                          Documents & Requirements <span className="ml-1 rounded-full bg-blue-600 px-2 py-0.5 text-sm text-white">{selectedEmployeeDocuments.length}</span>
                        </button>
                      </div>

                      {employeeDetailsTab === 'personal' ? (
                        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                          <div className="space-y-5">
                            <section className="rounded-2xl border border-[var(--border-color)] p-5">
                              <h3 className="!mb-3 flex items-center gap-2 text-2xl font-semibold text-[var(--text-primary)]"><Mail size={20} className="text-blue-600" /> Contact Information</h3>
                              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <div>
                                  <p className="!mb-1 text-base text-[var(--text-secondary)]">Email Address</p>
                                  <p className="!mb-0 text-xl text-[var(--text-primary)]">{selectedEmployeeDetails?.email || '--'}</p>
                                </div>
                                <div>
                                  <p className="!mb-1 text-base text-[var(--text-secondary)]">Contact Number</p>
                                  <p className="!mb-0 flex items-center gap-2 text-xl text-[var(--text-primary)]"><Phone size={16} className="text-[var(--text-muted)]" /> {selectedEmployeeDetails?.contact_number || '--'}</p>
                                </div>
                                <div className="xl:col-span-2">
                                  <p className="!mb-1 text-base text-[var(--text-secondary)]">Address</p>
                                  <p className="!mb-0 flex items-center gap-2 text-xl text-[var(--text-primary)]"><MapPin size={16} className="text-[var(--text-muted)]" /> {selectedEmployeeProfile?.address || '--'}</p>
                                </div>
                              </div>
                            </section>

                            <section className="rounded-2xl border border-[var(--border-color)] p-5">
                              <h3 className="!mb-3 text-2xl font-semibold text-[var(--text-primary)]">Personal Details</h3>
                              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <div>
                                  <p className="!mb-1 text-base text-[var(--text-secondary)]">Date of Birth</p>
                                  <p className="!mb-0 text-xl text-[var(--text-primary)]">{selectedEmployeeProfile?.dateOfBirth || '--'}</p>
                                </div>
                                <div>
                                  <p className="!mb-1 text-base text-[var(--text-secondary)]">Place of Birth</p>
                                  <p className="!mb-0 text-xl text-[var(--text-primary)]">{selectedEmployeeProfile?.placeOfBirth || '--'}</p>
                                </div>
                                <div>
                                  <p className="!mb-1 text-base text-[var(--text-secondary)]">Age</p>
                                  <p className="!mb-0 text-xl text-[var(--text-primary)]">{selectedEmployeeProfile?.age || '--'}</p>
                                </div>
                                <div>
                                  <p className="!mb-1 text-base text-[var(--text-secondary)]">Sex</p>
                                  <p className="!mb-0 text-xl text-[var(--text-primary)]">{selectedEmployeeProfile?.sex || '--'}</p>
                                </div>
                                <div>
                                  <p className="!mb-1 text-base text-[var(--text-secondary)]">Civil Status</p>
                                  <p className="!mb-0 text-xl text-[var(--text-primary)]">{selectedEmployeeProfile?.civilStatus || '--'}</p>
                                </div>
                              </div>
                            </section>

                            <section className="rounded-2xl border border-[var(--border-color)] p-5">
                              <h3 className="!mb-3 flex items-center gap-2 text-2xl font-semibold text-[var(--text-primary)]"><AlertCircle size={20} className="text-red-500" /> Emergency Contact</h3>
                              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <div>
                                  <p className="!mb-1 text-base text-[var(--text-secondary)]">Contact Person</p>
                                  <p className="!mb-0 text-xl text-[var(--text-primary)]">{selectedEmployeeProfile?.emergencyContactName || '--'}</p>
                                </div>
                                <div>
                                  <p className="!mb-1 text-base text-[var(--text-secondary)]">Relationship</p>
                                  <p className="!mb-0 text-xl text-[var(--text-primary)]">{selectedEmployeeProfile?.emergencyContactRelationship || '--'}</p>
                                </div>
                                <div>
                                  <p className="!mb-1 text-base text-[var(--text-secondary)]">Phone Number</p>
                                  <p className="!mb-0 text-xl text-[var(--text-primary)]">{selectedEmployeeProfile?.emergencyContactPhone || '--'}</p>
                                </div>
                              </div>
                            </section>
                          </div>

                          <div className="space-y-4">
                            <section className="rounded-2xl border border-[var(--border-color)] p-5">
                              <div className="mb-3 flex items-center justify-between">
                                <h3 className="!mb-0 text-2xl font-semibold text-[var(--text-primary)]">Employment Details</h3>
                                <button
                                  type="button"
                                  onClick={() => setShowPositionChangeModal(true)}
                                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                                >
                                  Edit
                                </button>
                              </div>
                              <p className="!mb-1 text-base text-[var(--text-secondary)]">Employee Number</p>
                              <p className="!mb-3 text-xl font-semibold text-[var(--text-primary)]">{selectedEmployeeDetails ? employeeNumberById.get(selectedEmployeeDetails.id) : '--'}</p>
                              <p className="!mb-1 text-base text-[var(--text-secondary)]">Position</p>
                              <p className="!mb-3 text-xl text-[var(--text-primary)]">{selectedEmployeeDetails?.position || '--'}</p>
                              <p className="!mb-1 text-base text-[var(--text-secondary)]">Department</p>
                              <p className="!mb-3 text-xl text-[var(--text-primary)]">{selectedEmployeeDetails?.office || '--'}</p>
                              <p className="!mb-1 text-base text-[var(--text-secondary)]">Date Hired</p>
                              <p className="!mb-3 text-xl text-[var(--text-primary)]">{selectedEmployeeProfile?.dateHired || '--'}</p>
                              <p className="!mb-1 text-base text-[var(--text-secondary)]">Employment Status</p>
                              <p className="!mb-0 text-xl text-green-700">{selectedEmployeeDetails?.status?.toLowerCase().includes('inactive') ? 'Inactive' : 'Active'}</p>
                            </section>

                            <section className="rounded-2xl border border-[var(--border-color)] p-5">
                              <h3 className="!mb-3 text-2xl font-semibold text-[var(--text-primary)]">Reset Password</h3>
                              <button
                                type="button"
                                onClick={() => { setResetPwState('confirm'); setResetPwError(null); }}
                                className="w-full rounded-xl bg-red-600 px-4 py-3 text-base font-semibold text-white"
                              >
                                <Lock size={16} className="mr-2 inline" /> Reset Password
                              </button>
                            </section>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-5 space-y-5">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h3 className="!mb-1 text-3xl font-bold text-[var(--text-primary)]">Document Requirements</h3>
                              <p className="!mb-0 text-lg text-[var(--text-secondary)]">Manage and review employee document submissions</p>
                            </div>
                            <button type="button" className="rounded-xl bg-blue-600 px-4 py-2 text-lg font-semibold text-white">
                              <FileText size={16} className="mr-2 inline" /> Request Document
                            </button>
                          </div>

                          {selectedEmployeeDocuments.map((doc) => (
                            <article key={doc.id} className="rounded-2xl border border-[var(--border-color)] bg-white p-5">
                              <div className="mb-2 flex items-center gap-3">
                                <h4 className="!mb-0 text-2xl font-semibold text-[var(--text-primary)]">{doc.name}</h4>
                                {doc.status === 'awaiting_review' && <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">Awaiting Review</span>}
                                {doc.status === 'rejected' && <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">Rejected</span>}
                                {doc.status === 'pending_submission' && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">Pending Submission</span>}
                              </div>
                              <p className="!mb-2 text-lg text-[var(--text-secondary)]">{doc.description}</p>
                              <p className="!mb-2 text-base text-[var(--text-secondary)]">
                                <Calendar size={16} className="mr-1 inline" /> Requested: {doc.requestedAt}
                                {'  '}•{'  '}
                                <Calendar size={16} className="mr-1 inline" /> Due: {doc.dueAt}
                                {doc.submittedAt ? (
                                  <>
                                    {'  '}•{'  '}
                                    <Download size={16} className="mr-1 inline" /> Submitted: {doc.submittedAt}
                                  </>
                                ) : null}
                              </p>

                              {doc.status === 'awaiting_review' && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button type="button" className="rounded-xl bg-blue-100 px-4 py-2 text-base text-blue-700"><Eye size={16} className="mr-1 inline" /> View Document</button>
                                  <button type="button" className="rounded-xl bg-green-600 px-4 py-2 text-base text-white"><Check size={16} className="mr-1 inline" /> Approve</button>
                                  <button type="button" className="rounded-xl bg-red-600 px-4 py-2 text-base text-white"><X size={16} className="mr-1 inline" /> Request Resubmission</button>
                                </div>
                              )}

                              {doc.status === 'rejected' && (
                                <>
                                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-lg text-red-700">
                                    <strong>Rejection Reason:</strong> {doc.rejectionReason}
                                  </div>
                                  <p className="!mb-0 mt-3 text-base font-semibold text-red-700">
                                    <AlertCircle size={16} className="mr-1 inline" /> Awaiting resubmission from employee
                                  </p>
                                </>
                              )}
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  {showPositionChangeModal && selectedEmployeeDetails && (
                    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPositionChangeModal(false)}>
                      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-start justify-between border-b border-[var(--border-color)] px-6 py-5">
                          <div>
                            <h3 className="!mb-1 text-3xl font-bold text-[var(--text-primary)]">Change Position</h3>
                            <p className="!mb-0 text-lg text-[var(--text-secondary)]">Update position for {selectedEmployeeDetails.full_name}</p>
                          </div>
                          <button type="button" className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-slate-100" onClick={() => setShowPositionChangeModal(false)}>
                            <X size={26} />
                          </button>
                        </div>

                        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">
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
                              <label className="mb-1 block text-xl font-semibold text-[var(--text-primary)]">New Department <span className="text-red-500">*</span></label>
                              <select
                                value={positionChangeForm.newDepartment}
                                onChange={(event) => {
                                  const nextDepartment = event.target.value;
                                  const firstPosition = EMPLOYEE_DIRECTORY_POSITIONS_BY_DEPARTMENT[nextDepartment]?.[0] || '';
                                  setPositionChangeForm((prev) => ({
                                    ...prev,
                                    newDepartment: nextDepartment,
                                    newPosition: firstPosition,
                                  }));
                                }}
                                className="w-full rounded-xl border border-[var(--border-color)] px-4 py-3 text-xl"
                              >
                                {EMPLOYEE_DIRECTORY_DEPARTMENTS.map((department) => (
                                  <option key={department} value={department}>{department}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="mb-1 block text-xl font-semibold text-[var(--text-primary)]">New Position <span className="text-red-500">*</span></label>
                              <select
                                value={positionChangeForm.newPosition}
                                onChange={(event) => setPositionChangeForm((prev) => ({ ...prev, newPosition: event.target.value }))}
                                className="w-full rounded-xl border border-[var(--border-color)] px-4 py-3 text-xl"
                              >
                                <option value="">Select a position</option>
                                {(EMPLOYEE_DIRECTORY_POSITIONS_BY_DEPARTMENT[positionChangeForm.newDepartment] || []).map((position) => (
                                  <option key={position} value={position}>{position}</option>
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

                        <div className="flex justify-end gap-3 border-t border-[var(--border-color)] px-6 py-4">
                          <button type="button" className="rounded-xl border border-[var(--border-color)] px-5 py-2 text-base" onClick={() => setShowPositionChangeModal(false)}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="rounded-xl bg-blue-600 px-6 py-2 text-base font-semibold text-white"
                            onClick={() => setShowPositionChangeModal(false)}
                          >
                            Apply Position Change
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {section === 'reports' && (
            <>
              {reportsView === 'overview' ? (
                <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                  {[
                    {
                      title: 'Application Ranking Report',
                      subtitle: 'Generate comparative assessment reports with applicant rankings',
                      icon: FileText,
                      color: 'bg-blue-100 text-blue-600',
                      onClick: () => setReportsView('ranking'),
                    },
                    {
                      title: 'Assessment Forms',
                      subtitle: 'View and print individual applicant assessment reports',
                      icon: Briefcase,
                      color: 'bg-green-100 text-green-600',
                      onClick: () => setReportsView('assessment'),
                    },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={card.title}
                        type="button"
                        onClick={card.onClick}
                        className="rounded-2xl border border-[var(--border-color)] bg-white p-5 text-left transition hover:border-[var(--primary-color)]"
                      >
                          <div className="mb-6 flex items-start justify-between">
                            <div className={`rounded-2xl p-3 ${card.color}`}><Icon size={24} /></div>
                            <ChevronRight size={22} className="text-[var(--text-muted)]" />
                        </div>
                          <h3 className="!mb-2 !text-lg font-semibold">{card.title}</h3>
                          <p className="!mb-4 !text-sm text-[var(--text-secondary)]">{card.subtitle}</p>
                          <span className="rounded-full bg-slate-100 px-3 py-1 !text-xs text-[var(--text-secondary)]">Official Template</span>
                      </button>
                    );
                  })}
                </section>
              ) : reportsView === 'documents' ? null : reportsView === 'ranking' ? (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-white p-5">
                    <div>
                      <p className="!mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Reports / Application Ranking</p>
                      <h2 className="!mb-1 text-2xl font-semibold text-[var(--text-primary)]">Application Ranking Reports</h2>
                      <p className="!mb-0 text-base text-[var(--text-secondary)]">Generate ranking reports per position and select applicants to hire.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReportsView('overview')}
                      className="rounded-lg border border-[var(--border-color)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
                    >
                      Back to Reports
                    </button>
                  </div>

                  {rankingPositionCards.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-white p-6 text-center">
                      <p className="!mb-0 text-base text-[var(--text-secondary)]">No qualified applicants available for ranking reports yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {rankingPositionCards.map((card) => (
                        <article key={card.position} className="rounded-2xl border border-[var(--border-color)] bg-white p-5">
                          <p className="!mb-1 text-sm text-[var(--text-secondary)]">{card.department}</p>
                          <h3 className="!mb-2 text-xl font-semibold text-[var(--text-primary)]">{card.position}</h3>
                          <p className="!mb-4 text-sm text-[var(--text-secondary)]">
                            Item No.: <span className="font-semibold text-[var(--text-primary)]">{card.itemNumber}</span>
                            {' • '}
                            Qualified Applicants: <span className="font-semibold text-[var(--text-primary)]">{card.qualifiedCount}</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => openRankingReport(card.position)}
                            className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white"
                          >
                            Generate Ranking Report
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              ) : (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-white p-5">
                    <div>
                      <p className="!mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Reports / Assessment Forms</p>
                      <h2 className="!mb-1 text-2xl font-semibold text-[var(--text-primary)]">Assessment Forms</h2>
                      <p className="!mb-0 text-base text-[var(--text-secondary)]">Select a job position to view and print assessment forms.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReportsView('overview')}
                      className="rounded-lg border border-[var(--border-color)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
                    >
                      Back to Reports
                    </button>
                  </div>

                  {assessmentPositionCards.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-white p-6 text-center">
                      <p className="!mb-0 text-base text-[var(--text-secondary)]">No assessment forms available for current job postings.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {assessmentPositionCards.map((card, index) => (
                        <article key={card.position} className="rounded-2xl border border-[var(--border-color)] bg-white p-5">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">Position #{index + 1}</span>
                                <span className="text-sm text-[var(--text-secondary)]">{card.itemNumber}</span>
                              </div>
                              <h3 className="!mb-2 !text-lg font-semibold text-[var(--text-primary)]">{card.position}</h3>
                              <p className="!mb-0 !text-sm text-[var(--text-secondary)]">{card.department} • {card.totalApplicants} Total Applicants</p>
                            </div>
                            <div className="rounded-2xl bg-green-100 p-3 text-green-600">
                              <FileText size={24} />
                            </div>
                          </div>

                          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                            <span className="rounded-md bg-green-100 px-2 py-1 font-semibold text-green-700">{card.hiredCount} Hired</span>
                            <span className="rounded-md bg-blue-100 px-2 py-1 font-semibold text-blue-700">{card.qualifiedCount} Qualified</span>
                            <span className="rounded-md bg-red-100 px-2 py-1 font-semibold text-red-700">{card.disqualifiedCount} Disqualified</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => openAssessmentForms(card.position)}
                            className="w-full rounded-xl bg-green-600 px-4 py-2.5 text-base font-semibold text-white"
                          >
                            View Assessment Forms
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {reportsView !== 'documents' ? (
                <>
                  <section>
                    <h2 className="!mb-1 !text-lg font-semibold">Employee Documents</h2>
                    <p className="!text-sm text-[var(--text-secondary)]">Access and download documents submitted by employees</p>
                  </section>

                  <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    {BULK_REQUEST_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => openDocumentTemplate(template.id)}
                        className="rounded-2xl border border-[var(--border-color)] bg-white p-5 text-center transition hover:border-[var(--primary-color)]"
                      >
                        <div className="mb-3 inline-flex rounded-2xl bg-indigo-100 p-3 text-indigo-600">
                          <FileText size={22} />
                        </div>
                        <h3 className="!mb-0 !text-sm font-semibold text-[var(--text-primary)]">{template.name.replace(' (Statement of Assets, Liabilities and Net Worth)', '')}</h3>
                      </button>
                    ))}
                  </section>

                  <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                    <h3 className="!mb-3 !text-base font-semibold text-blue-900">Document Generation Guidelines</h3>
                    <ul className="list-disc space-y-2 pl-6 !text-sm text-blue-800">
                      <li>All reports follow official government formatting standards</li>
                      <li>Ranking reports are automatically formatted for landscape printing</li>
                      <li>Assessment forms are portrait-oriented with conditional logic for disqualified applicants</li>
                      <li>Use the Print function in your browser to generate PDF documents</li>
                    </ul>
                  </section>
                </>
              ) : (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="!mb-1 text-sm text-blue-600">
                        <button
                          type="button"
                          onClick={() => { setReportsView('overview'); setActiveDocumentTemplateId(null); }}
                          className="cursor-pointer underline-offset-2 hover:underline"
                        >
                          RSP / Reports
                        </button>
                        {' / '}
                        {activeDocumentTemplate?.name.replace(' (Statement of Assets, Liabilities and Net Worth)', '') || 'Employee Documents'}
                      </p>
                      <h2 className="!mb-1 !text-2xl font-bold text-[var(--text-primary)]">{activeDocumentTemplate?.name.replace(' (Statement of Assets, Liabilities and Net Worth)', '') || 'Employee Documents'}</h2>
                      <p className="!mb-0 !text-sm text-[var(--text-secondary)]">
                        {documentsLoading ? 'Loading submissions…' : `${activeDocumentSubmissions.length} total submissions across all departments`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {totalSelectedDocumentSubmissions > 0 && (
                        <button
                          type="button"
                          onClick={() => triggerDocumentDownload(activeDocumentSubmissions.filter((entry) => selectedDocumentSubmissionIds.includes(entry.id)))}
                          className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white"
                        >
                          Download Selected ({totalSelectedDocumentSubmissions})
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
                      <p className="!mb-1 font-semibold">Could not load submissions.</p>
                      <p className="!mb-0">{documentsError}</p>
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
                                onClick={() => triggerDocumentDownload(group.submissions)}
                                className="rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white"
                              >
                                Download All
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
                                          className="text-sm font-semibold text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          View
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => triggerDocumentDownload([entry])}
                                          disabled={!entry.documentUrl || entry.documentUrl === '#'}
                                          className="text-sm font-semibold text-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          Download
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

              {reportsView !== 'documents' && (
              <section className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="!mb-1 !text-lg font-semibold">Deleted Job Archives</h2>
                    <p className="!text-sm text-[var(--text-secondary)]">Applicants and document references preserved when a job post is deleted</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-base text-[var(--text-secondary)]">{deletedJobReports.length} archive{deletedJobReports.length === 1 ? '' : 's'}</span>
                </div>

                {deletedJobReports.length === 0 ? (
                  <p className="!mb-0 text-base text-[var(--text-secondary)]">No deleted job archives yet.</p>
                ) : (
                  <div className="space-y-3">
                    {deletedJobReports.map((report) => {
                      const isExpanded = Boolean(expandedArchiveIds[report.id]);
                      const docCount = report.applicants.reduce((total, applicant) => total + applicant.documents.length, 0);
                      return (
                        <div key={report.id} className="rounded-xl border border-[var(--border-color)] bg-slate-50 p-4">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="!mb-0 text-lg font-semibold text-[var(--text-primary)]">{report.job.title}</p>
                            <span className="rounded-full bg-white px-2 py-1 text-sm text-[var(--text-secondary)]">Deleted {formatDate(report.deletedAt)}</span>
                          </div>
                          <p className="!mb-0 text-base text-[var(--text-secondary)]">
                            Applicants archived: <span className="font-semibold text-[var(--text-primary)]">{report.applicants.length}</span>
                            {' • '}
                            Documents archived: <span className="font-semibold text-[var(--text-primary)]">{docCount}</span>
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => toggleArchiveDetails(report.id)}
                              className="rounded-lg border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
                            >
                              {isExpanded ? 'Hide Details' : 'View Details'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteArchivePermanently(report.id, report.job.title)}
                              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                            >
                              Permanently Delete
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="mt-4 space-y-3 rounded-xl border border-[var(--border-color)] bg-white p-4">
                              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                                <p className="!mb-0 text-sm text-[var(--text-secondary)]">Job Code: <span className="font-semibold text-[var(--text-primary)]">{report.job.jobCode || '--'}</span></p>
                                <p className="!mb-0 text-sm text-[var(--text-secondary)]">Department: <span className="font-semibold text-[var(--text-primary)]">{report.job.department || '--'}</span></p>
                                <p className="!mb-0 text-sm text-[var(--text-secondary)]">Deleted By: <span className="font-semibold text-[var(--text-primary)]">{report.deletedBy || '--'}</span></p>
                                <p className="!mb-0 text-sm text-[var(--text-secondary)]">Deleted At: <span className="font-semibold text-[var(--text-primary)]">{formatDate(report.deletedAt)}</span></p>
                              </div>

                              <div className="space-y-2">
                                {report.applicants.length === 0 ? (
                                  <p className="!mb-0 text-sm text-[var(--text-secondary)]">No applicants archived for this job post.</p>
                                ) : (
                                  report.applicants.map((applicant) => (
                                    <div key={applicant.id} className="rounded-lg border border-[var(--border-color)] bg-slate-50 p-3">
                                      <p className="!mb-1 text-base font-semibold text-[var(--text-primary)]">
                                        {applicant.personalInfo.firstName} {applicant.personalInfo.lastName}
                                      </p>
                                      <p className="!mb-1 text-sm text-[var(--text-secondary)]">Email: {applicant.personalInfo.email || '--'}</p>
                                      <p className="!mb-2 text-sm text-[var(--text-secondary)]">Status: {applicant.status}</p>
                                      <div className="space-y-1">
                                        {applicant.documents.length === 0 ? (
                                          <p className="!mb-0 text-sm text-[var(--text-secondary)]">No documents archived.</p>
                                        ) : (
                                          applicant.documents.map((doc, index) => (
                                            <div key={`${applicant.id}-${doc.type}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
                                              <span className="font-semibold text-[var(--text-primary)]">{doc.type}</span>
                                              {doc.url && doc.url !== '#' && /^(https?:|data:|blob:)/i.test(doc.url) ? (
                                                <a
                                                  href={doc.url}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="text-blue-700 underline"
                                                >
                                                  Open File
                                                </a>
                                              ) : doc.url && doc.url !== '#' ? (
                                                <span className="text-[var(--text-secondary)]">Stored path: {doc.url}</span>
                                              ) : (
                                                <span className="text-[var(--text-secondary)]">No file URL</span>
                                              )}
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
              )}
            </>
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
                <div className="overflow-x-auto rounded-lg border-2 border-slate-300">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead className="bg-slate-900 text-white">
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
                          const isTopApplicant = index === 0;
                          const isTop3 = index < 3;
                          return (
                            <tr 
                              key={row.id} 
                              className={`border-t border-slate-200 text-sm ${
                                isTopApplicant 
                                  ? 'bg-yellow-100' 
                                  : isTop3 
                                  ? 'bg-blue-50' 
                                  : ''
                              }`}
                            >
                              <td className="px-4 py-3 font-bold text-gray-900">
                                {isTopApplicant ? `🏆 ${index + 1}` : index + 1}
                              </td>
                              <td className="px-4 py-3 font-semibold text-gray-900">{row.fullName}</td>
                              <td className="px-4 py-3 text-center">{row.experience.toFixed(2)}</td>
                              <td className="px-4 py-3 text-center">{row.performance.toFixed(2)}</td>
                              <td className="px-4 py-3 text-center">{row.potential.toFixed(2)}</td>
                              <td className="px-4 py-3 text-center">{row.written.toFixed(2)}</td>
                              <td className="px-4 py-3 text-center">{row.interview.toFixed(2)}</td>
                              <td className="px-4 py-3 text-center font-bold text-blue-600">{row.total.toFixed(2)}</td>
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
                    <div className="h-4 w-6 rounded bg-yellow-100 border border-yellow-300"></div>
                    <span className="text-sm text-gray-700">Rank 1 (Top Applicant)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-6 rounded bg-blue-100 border border-blue-300"></div>
                    <span className="text-sm text-gray-700">Ranks 2-3 (Top 3 Applicants)</span>
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

      {showAssessmentFormsModal && (
        <div className="assessment-print-overlay fixed inset-0 z-[245] flex items-center justify-center bg-black/70 p-4" onClick={closeAssessmentForms}>
          <div className="assessment-print-modal max-h-[92vh] w-full max-w-[1320px] overflow-hidden rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}>
            {!activeAssessmentCard ? (
              <div className="flex items-center justify-center p-8 text-center">
                <div>
                  <p className="!mb-2 text-2xl font-semibold text-red-600">No assessment forms available</p>
                  <p className="!mb-4 text-base text-[var(--text-secondary)]">
                    {activeAssessmentPosition ? `Position "${activeAssessmentPosition}" not found in database` : 'Please select a position'}
                  </p>
                  <button
                    type="button"
                    onClick={closeAssessmentForms}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-white font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="assessment-print-no flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-6 py-5">
                  <div>
                    <h2 className="!mb-1 text-4xl font-semibold text-[var(--text-primary)]">Assessment Forms - {activeAssessmentCard.position}</h2>
                    <p className="!mb-0 text-2xl text-[var(--text-secondary)]">{activeAssessmentCard.department} • {activeAssessmentApplicants.length} applicant{activeAssessmentApplicants.length === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="rounded-xl bg-[var(--primary-color)] px-5 py-3 text-xl font-semibold text-white"
                    >
                      Print All Forms
                    </button>
                    <button
                      type="button"
                      onClick={closeAssessmentForms}
                      className="rounded-xl border border-[var(--border-color)] px-3 py-2 text-2xl text-[var(--text-muted)]"
                    >
                      ×
                    </button>
                  </div>
                </div>

            <div className="assessment-print-scroll max-h-[78vh] overflow-y-auto">
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
                      let result = map.get(String(applicant.id).trim()) ?? null;
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
                    const positionType = stored?.positionType || applicant.positionType || 'rank-and-file';

                    // --- Education ---
                    // Assume educationLevel is a number 0-20 (or use mapping if needed)
                    let educationRaw = resolveScoreValue(stored?.education);
                    let educationScore = 0;
                    if (appointmentType === 'original' || appointmentType === 'promotional') {
                      educationScore = clamp20(educationRaw);
                    }

                    // --- Experience ---
                    let experienceRaw = resolveScoreValue(stored?.experience);
                    let experienceScore = 0;
                    if (appointmentType === 'original' || appointmentType === 'promotional') {
                      experienceScore = clamp20(experienceRaw);
                    }

                    // --- Written Exam (Original only) ---
                    let writtenExamScore = null;
                    if (appointmentType === 'original') {
                      let writtenRaw = resolveScoreValue(stored?.writtenExam);
                      // If missing, try interviewer evaluation
                      if ((!writtenRaw || writtenRaw <= 0) && typeof evalRow?.written_exam === 'number') {
                        writtenRaw = evalRow.written_exam;
                      }
                      const maxRaw = positionType === 'executive' ? 35 : 30;
                      writtenExamScore = typeof writtenRaw === 'number' && writtenRaw > 0 ? clamp20((writtenRaw / maxRaw) * 20) : null;
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
                      performanceScore = typeof perfRaw === 'number' && perfRaw > 0 ? clamp20((perfRaw / 5.0) * 20) : null;
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
                          <div className="mb-3 rounded-md border-2 border-black overflow-hidden">
                            <p className="!mb-0 border-b-2 border-black bg-gray-200 px-3 py-2 text-base font-semibold text-black">POINT-BASED ASSESSMENT</p>
                            <table className="w-full border-collapse text-sm text-black">
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
                                      <td className="border-b border-l-2 border-black px-3 py-2 text-center font-semibold">{writtenExamScore !== null ? writtenExamScore.toFixed(2) : 'N/A'}</td>
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
          </div>
        </div>
      )}

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
                      <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Item Number <span className="text-red-500">*</span></label>
                      <input
                        className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                        placeholder="e.g., ITEM-2024-001"
                        value={newJob.item_number}
                        onChange={(event) => setNewJob((prev) => ({ ...prev, item_number: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Salary Grade <span className="text-red-500">*</span></label>
                      <input
                        className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                        placeholder="e.g., SG-11"
                        value={newJob.salary_grade}
                        onChange={(event) => setNewJob((prev) => ({ ...prev, salary_grade: event.target.value }))}
                      />
                    </div>
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
                  <div>
                    <label className="mb-2 block text-base font-semibold text-[var(--text-primary)]">Qualifications</label>
                    <textarea
                      rows={4}
                      className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base"
                      placeholder="List required qualifications, education, and experience..."
                      value={newJob.qualifications}
                      onChange={(event) => setNewJob((prev) => ({ ...prev, qualifications: event.target.value }))}
                    />
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

            <div className="flex justify-end gap-3 border-t border-[var(--border-color)] px-8 py-5">
              <Button variant="secondary" onClick={closeBulkRequestDialog} className="!px-8 !py-3 text-lg">
                Cancel
              </Button>
              <Button onClick={handleSendBulkRequest} disabled={isBulkRequestSendDisabled} className="!px-8 !py-3 text-lg">
                <FileText size={18} /> Send to {bulkRequestRecipientCount} Employee{bulkRequestRecipientCount === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <DocumentPreviewModal
        open={previewSubmission !== null}
        fileUrl={previewSubmission?.documentUrl ?? ''}
        fileName={previewSubmission?.fileName || previewSubmission?.documentType || ''}
        fileType={previewSubmission?.fileType ?? null}
        title={previewSubmission ? `${previewSubmission.fullName} — ${previewSubmission.documentType}` : ''}
        subtitle={previewSubmission ? `${previewSubmission.employeeCode} • ${previewSubmission.position} • Submitted ${previewSubmission.submittedDate}` : ''}
        onClose={() => setPreviewSubmission(null)}
      />

      {resetPwState !== 'idle' && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 px-4"
          onClick={() => { if (resetPwState !== 'working') closeResetPwModal(); }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="!mb-0 text-base font-semibold text-slate-900">
                {resetPwState === 'done' ? 'New Password Generated' : 'Reset Employee Password'}
              </h3>
              <button
                type="button"
                onClick={closeResetPwModal}
                disabled={resetPwState === 'working'}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {resetPwState === 'confirm' && selectedEmployeeDetails && (
                <>
                  <p className="!mb-0 text-sm text-slate-700">
                    Generate a new password for{' '}
                    <span className="font-semibold">
                      {selectedEmployeeDetails.full_name || `${(selectedEmployeeDetails as any).first_name ?? ''} ${(selectedEmployeeDetails as any).last_name ?? ''}`.trim()}
                    </span>
                    {employeeNumberById.get(selectedEmployeeDetails.id)
                      ? ` (${employeeNumberById.get(selectedEmployeeDetails.id)})`
                      : ''}
                    ? The old password will stop working immediately.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeResetPwModal}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleResetEmployeePasswordConfirm}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      Yes, reset password
                    </button>
                  </div>
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
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
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
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>

                  <p className="!mb-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    The employee should change this password on their first login.
                  </p>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={closeResetPwModal}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}

              {resetPwState === 'error' && (
                <>
                  <p className="!mb-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {resetPwError ?? 'Something went wrong. Please try again.'}
                  </p>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={closeResetPwModal}
                      className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
