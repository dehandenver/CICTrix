import {
  Activity as ActivityIcon,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Mail,
  MessageSquare,
  Plane,
  Search,
  Star,
  User,
  UserCheck,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getPreferredDataSourceMode } from '../lib/dataSourceMode';
import {
  getEmployeePortalAccounts,
  updateEmployeePortalEmployee,
} from '../lib/employeePortalData';
import { mockDatabase } from '../lib/mockDatabase';
import {
  ensureRecruitmentSeedData,
  formatPHDate,
  formatPHDateTime,
  generateEmployeeId,
  getApplicants,
  getAuthoritativeJobPostings,
  getEmployeeRecords,
  getNewlyHired,
  saveApplicants,
  saveEmployeeRecords,
  saveNewlyHired,
} from '../lib/recruitmentData';
import { runSingleFlight } from '../lib/singleFlight';
import { ATTACHMENTS_BUCKET, isMockModeEnabled, supabase } from '../lib/supabase';
import { Applicant, ApplicantStatus, JobPosting, NewlyHired } from '../types/recruitment.types';
import { RecruitmentNavigationGuide } from './RecruitmentNavigationGuide';
import { Sidebar } from './Sidebar';

type StoredAttachment = {
  applicant_id: string;
  file_name: string;
  file_path: string;
  file_type?: string;
  document_type?: string;
};

type ResolvedDocument = {
  fileName: string;
  url: string;
};

type ApplicantDocumentRef = {
  type: string;
  url: string;
};

type ApplicantAttachmentRow = {
  id: string;
  file_name: string;
  file_path: string;
  document_type?: string;
  created_at?: string;
};

type EmailTemplateKey = 'none' | 'missing_documents' | 'incorrect_file_format' | 'invalid_information' | 'schedule_interview' | 'custom_message';
type JobPostsStatusFilter = 'all' | 'pending' | 'reviewed' | 'shortlisted' | 'qualified';

const REQUIRED_DOCUMENTS = ['Resume', 'Application Letter', 'Transcript of Records', 'Certifications'];

const normalizeDocCompareKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const toDocumentLabel = (value: string) =>
  String(value || 'document')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

const matchesRequiredDocument = (rawDoc: string, required: string) => {
  const doc = normalizeDocCompareKey(rawDoc);
  const req = normalizeDocCompareKey(required);
  if (doc.includes(req) || req.includes(doc)) return true;

  if (req === 'applicationletter') return doc.includes('applicationletter');
  if (req === 'transcriptofrecords') return doc.includes('transcript');
  if (req === 'certifications') return doc.includes('certification') || doc.includes('training') || doc.includes('eligibility');
  if (req === 'resume') return doc.includes('resume') || doc === 'cv';
  return false;
};

const EMAIL_TEMPLATES: Array<{ key: EmailTemplateKey; label: string; subject: string; message: string }> = [
  { key: 'none', label: 'Select a template...', subject: '', message: '' },
  {
    key: 'missing_documents',
    label: 'Missing Documents',
    subject: 'Incomplete Requirements for Your Application',
    message:
      'Dear Applicant,\n\nWe noticed that some required documents are missing from your application. Please upload the missing files so we can continue your evaluation.\n\nRegards,\nRecruitment Team',
  },
  {
    key: 'incorrect_file_format',
    label: 'Incorrect File Format',
    subject: 'Please Re-upload Documents in Correct Format',
    message:
      'Dear Applicant,\n\nSome of your uploaded files are in an unsupported format. Kindly re-upload the required documents in PDF format.\n\nRegards,\nRecruitment Team',
  },
  {
    key: 'invalid_information',
    label: 'Invalid Information',
    subject: 'Clarification Needed for Your Application',
    message:
      'Dear Applicant,\n\nWe found information in your application that needs clarification. Please reply with corrected details at your earliest convenience.\n\nRegards,\nRecruitment Team',
  },
  {
    key: 'schedule_interview',
    label: 'Schedule Interview',
    subject: 'Interview Schedule for Your Application',
    message:
      'Dear Applicant,\n\nYou are invited for an interview. Please confirm your preferred schedule and availability.\n\nRegards,\nRecruitment Team',
  },
  { key: 'custom_message', label: 'Custom Message', subject: '', message: '' },
];

const ATTACHMENTS_STORAGE_KEY = 'cictrix_attachments';
const ATTACHMENT_PREVIEW_CACHE_KEY = 'cictrix_attachment_previews';
const AUDIT_LOG_STORAGE_KEY = 'cictrix_recruitment_audit_log';

type RecruitmentAuditLog = {
  id: string;
  timestamp: string;
  action: string;
  applicantId?: string;
  applicantName?: string;
  details?: string;
  actor: string;
};

type CachedPreviewFile = {
  applicantId: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  createdAt: string;
};

const normalizeDocKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '_');
const looseDocKey = (value: string) => normalizeDocKey(value).replace(/[_-]/g, '');

const appendRecruitmentAuditLog = (entry: Omit<RecruitmentAuditLog, 'id' | 'timestamp'>) => {
  try {
    const nowIso = new Date().toISOString();
    const raw = localStorage.getItem(AUDIT_LOG_STORAGE_KEY);
    const current = raw ? (JSON.parse(raw) as RecruitmentAuditLog[]) : [];
    const next: RecruitmentAuditLog[] = [
      {
        id: crypto.randomUUID(),
        timestamp: nowIso,
        ...entry,
      },
      ...current,
    ].slice(0, 500);
    localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort local audit logging only.
  }
};

const resolveStorageOrDirectUrl = async (filePathOrUrl: string): Promise<string | null> => {
  if (!filePathOrUrl) return null;
  if (filePathOrUrl === '#') return null;
  if (filePathOrUrl.startsWith('http') || filePathOrUrl.startsWith('data:') || filePathOrUrl.startsWith('blob:')) {
    return filePathOrUrl;
  }
  if (filePathOrUrl.startsWith('mock://')) {
    return null;
  }

  try {
    const signedResult = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(filePathOrUrl, 120);
    const signedUrl = (signedResult as any)?.data?.signedUrl as string | undefined;
    if (signedUrl) return signedUrl;
  } catch {
    // Continue to public URL fallback.
  }

  try {
    const publicResult = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(filePathOrUrl);
    const publicUrl = (publicResult as any)?.data?.publicUrl as string | undefined;
    if (publicUrl) return publicUrl;
  } catch {
    // Final fallback below.
  }

  return null;
};

const STATUS_COLORS: Record<ApplicantStatus, string> = {
  'New Application': 'bg-amber-100 text-amber-800',
  'Under Review': 'bg-blue-100 text-blue-800',
  Shortlisted: 'bg-emerald-100 text-emerald-800',
  'For Interview': 'bg-violet-100 text-violet-800',
  'Interview Scheduled': 'bg-purple-100 text-purple-800',
  'Interview Completed': 'bg-teal-100 text-teal-800',
  'Recommended for Hiring': 'bg-green-100 text-green-800',
  'Not Qualified': 'bg-rose-100 text-rose-800',
  Rejected: 'bg-slate-200 text-slate-800',
};

const normalizeText = (value: string) => String(value ?? '').trim().toLowerCase();

const normalizeUsername = (value: string) => String(value ?? '').trim().toLowerCase();

const createUniqueUsername = (
  applicant: Applicant,
  occupiedUsernames: Set<string>
) => {
  const emailBase = String(applicant.personalInfo.email ?? '').split('@')[0]?.trim();
  const nameBase = `${normalizeText(applicant.personalInfo.firstName)}.${normalizeText(applicant.personalInfo.lastName)}`.replace(/\.+/g, '.');
  const sanitizedBase = (emailBase || nameBase || 'employee').replace(/[^a-z0-9.]/g, '');

  let candidate = sanitizeUsername(`${sanitizedBase}.emp`);
  let counter = 1;

  while (occupiedUsernames.has(candidate)) {
    counter += 1;
    candidate = sanitizeUsername(`${sanitizedBase}.emp${counter}`);
  }

  occupiedUsernames.add(candidate);
  return candidate;
};

const sanitizeUsername = (value: string) => normalizeUsername(value).replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');

const toStatusDisplayLabel = (status: ApplicantStatus | string) => {
  const normalized = normalizeText(String(status ?? ''));
  if (normalized === 'recommended for hiring' || normalized === 'qualified') {
    return 'Qualified Applicants';
  }
  return String(status ?? '');
};

type EvaluationSnapshot = {
  score: number;
  completed: boolean;
  updatedAt: string;
};

const hasCompletedEvaluation = (row: any) => {
  const oralScores = [
    row?.communication_skills_score,
    row?.confidence_score,
    row?.comprehension_score,
    row?.personality_score,
    row?.job_knowledge_score,
    row?.overall_impression_score,
  ];

  const oralComplete = oralScores.every((value) => typeof value === 'number' && value > 0);
  const legacyComplete = typeof row?.overall_score === 'number' && row.overall_score > 0;
  const scoredByComponent = oralScores.some((value) => typeof value === 'number' && value > 0);
  const hasOverallImpression = typeof row?.overall_impression_score === 'number' && row.overall_impression_score > 0;
  const hasPersonality = typeof row?.personality_score === 'number' && row.personality_score > 0;
  return oralComplete || legacyComplete || scoredByComponent || hasOverallImpression || hasPersonality;
};

const deriveEvaluationPercentage = (row: any): number => {
  if (typeof row?.overall_score === 'number' && row.overall_score > 0) {
    return Math.min(100, Math.max(0, row.overall_score));
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
  return Math.min(100, Math.max(0, Math.round((total / 30) * 100)));
};

const toApplicantStatus = (rawStatus: string, hasCompletedEval: boolean): ApplicantStatus => {
  const normalized = normalizeText(rawStatus);

  if (normalized.includes('reject') || normalized.includes('disqual') || normalized === 'not qualified') {
    return normalized.includes('reject') ? 'Rejected' : 'Not Qualified';
  }
  if (normalized.includes('recommend') || normalized.includes('qualified') || normalized.includes('accepted') || normalized.includes('hired')) {
    return 'Recommended for Hiring';
  }
  if (normalized.includes('shortlist')) return 'Shortlisted';
  if (normalized.includes('interview scheduled')) return 'Interview Scheduled';
  if (normalized.includes('for interview')) return 'For Interview';
  if (normalized.includes('review') || normalized === 'reviewed' || normalized === 'pending') {
    return hasCompletedEval ? 'Interview Completed' : 'Under Review';
  }
  if (normalized.includes('new')) return 'New Application';

  return hasCompletedEval ? 'Interview Completed' : 'Under Review';
};

const isAdminQualifiedStatus = (status: string) => {
  const normalized = normalizeText(status);
  return (
    normalized === 'recommended for hiring' ||
    normalized === 'qualified' ||
    normalized === 'accepted'
  );
};

const hasInterviewStarted = (applicant: Applicant) => {
  const normalizedStatus = normalizeText(applicant.status);
  const statusSignalsInterview =
    normalizedStatus.includes('interview') ||
    normalizedStatus.includes('review') ||
    normalizedStatus.includes('completed') ||
    normalizedStatus.includes('recommend') ||
    normalizedStatus.includes('qualified');

  const scoreSignal = Number(applicant.qualificationScore ?? 0) > 0;
  const timelineSignal = (applicant.timeline || []).some((entry) => {
    const label = normalizeText(entry.event || '');
    return label.includes('interview') || label.includes('evaluation');
  });

  return statusSignalsInterview || scoreSignal || timelineSignal;
};

const hasCompletedInterview = (applicant: Applicant) => {
  const normalizedStatus = normalizeText(applicant.status);
  if (
    normalizedStatus.includes('interview completed') ||
    normalizedStatus.includes('recommend') ||
    normalizedStatus.includes('qualified') ||
    normalizedStatus.includes('hired')
  ) {
    return true;
  }

  return (applicant.timeline || []).some((entry) => {
    const label = normalizeText(entry.event || '');
    return label.includes('interview completed') || label.includes('evaluation completed');
  });
};

const toJobPostsStatusBucket = (status: ApplicantStatus): Exclude<JobPostsStatusFilter, 'all'> => {
  const normalized = normalizeText(status);
  if (normalized.includes('recommend') || normalized.includes('qualified') || normalized.includes('hired') || normalized.includes('accepted')) {
    return 'qualified';
  }
  if (normalized.includes('shortlist')) {
    return 'shortlisted';
  }
  if (normalized.includes('review') || normalized.includes('interview')) {
    return 'reviewed';
  }
  return 'pending';
};

const toJobPostsStatusLabel = (status: ApplicantStatus) => {
  const bucket = toJobPostsStatusBucket(status);
  if (bucket === 'qualified') return 'qualified';
  if (bucket === 'shortlisted') return 'shortlisted';
  if (bucket === 'reviewed') return 'reviewed';
  return 'pending';
};

export const QualifiedApplicantsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { jobId } = useParams();
  const isJobPostsView = location.pathname === '/admin/rsp/jobs';
  const isApplicantListView = isJobPostsView || Boolean(jobId);

  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [search, setSearch] = useState('');
  const [qualifiedTab, setQualifiedTab] = useState<'all' | 'completed' | 'pending'>('all');
  const [qualifiedPosition, setQualifiedPosition] = useState('all');
  const [qualifiedOffice, setQualifiedOffice] = useState('all');
  const [jobFilter, setJobFilter] = useState('all');
  const [statusFilter] = useState<ApplicantStatus[]>([]);
  const [jobPostsStatusFilter, setJobPostsStatusFilter] = useState<JobPostsStatusFilter>('all');
  const [scoreMin] = useState(0);
  const [dateFrom] = useState('');
  const [dateTo] = useState('');
  const [sortBy] = useState<'Application Date' | 'Qualification Score' | 'Last Updated'>('Application Date');
  const [activeApplicant, setActiveApplicant] = useState<Applicant | null>(null);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Documents' | 'Activity'>('Overview');
  const [attachmentsByApplicant, setAttachmentsByApplicant] = useState<Record<string, ApplicantAttachmentRow[]>>({});
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplateKey>('none');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [toast, setToast] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [documentActionBusy, setDocumentActionBusy] = useState<string | null>(null);
  const [statusDecisionLocked, setStatusDecisionLocked] = useState(false);
  const [disqualifyReasonDraft, setDisqualifyReasonDraft] = useState('');
  const [pendingStatusAction, setPendingStatusAction] = useState<null | {
    applicantId: string;
    action: 'qualify' | 'disqualify';
    nextStatus: ApplicantStatus;
  }>(null);
  const [selectedHireApplicantIds, setSelectedHireApplicantIds] = useState<string[]>([]);
  const [showHireConfirmModal, setShowHireConfirmModal] = useState(false);

  const loadQualifiedApplicantsData = async () => {
    ensureRecruitmentSeedData();

    const canonicalJobs = getAuthoritativeJobPostings();

    if (canonicalJobs.length > 0) {
      setJobs(canonicalJobs);
    }

    // CRITICAL: Always fetch applicants from Supabase (as per user requirement: "all datas must be stored in supabase")
    // Do NOT use mockDatabase or localStorage as primary source for applicants
    const primaryClient = supabase; // Always use Supabase for applicants
    const secondaryClient = (mockDatabase as any); // Fallback only if Supabase fails

    const fetchBundle = async (client: any, cacheKey: string) =>
      runSingleFlight(
        cacheKey,
        () =>
          Promise.allSettled([
            client.from('applicants').select('*').order('created_at', { ascending: false }),
            client.from('evaluations').select('*'),
            client.from('applicant_attachments').select('*'),
            client.from('job_postings').select('*').order('created_at', { ascending: false }),
          ]),
        1200,
      );

    let [applicantsRes, evaluationsRes, attachmentsRes, jobPostingsRes] = await fetchBundle(
      primaryClient,
      `qualified-bundle:supabase:primary` // Always use supabase cache key
    );

    const primaryApplicantsFetchSucceeded =
      applicantsRes.status === 'fulfilled' && !applicantsRes.value.error && Array.isArray(applicantsRes.value.data);

    // Fallback only on fetch failure, not on empty result sets.
    // Empty DB result is valid and must be reflected in the UI (e.g., deleted applicants).
    if (!primaryApplicantsFetchSucceeded) {
      [applicantsRes, evaluationsRes, attachmentsRes, jobPostingsRes] = await fetchBundle(
        secondaryClient,
        `qualified-bundle:supabase:secondary`
      );
    }

    const dbApplicants =
      applicantsRes.status === 'fulfilled' && !applicantsRes.value.error && Array.isArray(applicantsRes.value.data)
        ? applicantsRes.value.data
        : [];

    const dbEvaluations =
      evaluationsRes.status === 'fulfilled' && !evaluationsRes.value.error && Array.isArray(evaluationsRes.value.data)
        ? evaluationsRes.value.data
        : [];

    const dbAttachments =
      attachmentsRes.status === 'fulfilled' && !attachmentsRes.value.error && Array.isArray(attachmentsRes.value.data)
        ? attachmentsRes.value.data
        : [];

    const dbJobPostings =
      jobPostingsRes.status === 'fulfilled' && !jobPostingsRes.value.error && Array.isArray(jobPostingsRes.value.data)
        ? jobPostingsRes.value.data
        : [];

    if (canonicalJobs.length === 0 && dbJobPostings.length > 0) {
      const mappedJobs: JobPosting[] = dbJobPostings.map((row: any, index: number) => ({
        id: String(row?.id ?? `db-job-${index + 1}`),
        jobCode: String(row?.job_code ?? row?.item_number ?? `DB-${index + 1}`),
        title: String(row?.title ?? ''),
        department: String(row?.department ?? row?.office ?? 'Unassigned'),
        division: String(row?.division ?? ''),
        positionType: 'Civil Service',
        salaryGrade: String(row?.salary_grade ?? ''),
        salaryRange: { min: 0, max: 0 },
        numberOfPositions: 1,
        employmentStatus: 'Permanent',
        summary: String(row?.description ?? ''),
        responsibilities: [],
        qualifications: {
          education: "Bachelor's Degree",
          experience: { years: 0, field: 'General' },
          skills: [],
          certifications: [],
        },
        requiredDocuments: [],
        applicationDeadline: new Date().toISOString(),
        status: normalizeText(String(row?.status ?? '')) === 'closed' ? 'Closed' : 'Active',
        postedDate: String(row?.created_at ?? new Date().toISOString()),
        postedBy: 'System',
        applicantCount: Number(row?.applicant_count ?? 0),
        qualifiedCount: Number(row?.qualified_count ?? 0),
      }));
      setJobs(mappedJobs);
    }

    const applicantEmailById = new Map<string, string>();
    const applicantIdsByEmail = new Map<string, string[]>();
    dbApplicants.forEach((row: any) => {
      const applicantId = String(row?.id ?? '').trim();
      const emailKey = normalizeText(String(row?.email ?? ''));
      if (!applicantId || !emailKey) return;
      applicantEmailById.set(applicantId, emailKey);
      const current = applicantIdsByEmail.get(emailKey) ?? [];
      if (!current.includes(applicantId)) {
        applicantIdsByEmail.set(emailKey, [...current, applicantId]);
      }
    });

    const evaluationMap = new Map<string, EvaluationSnapshot>();
    dbEvaluations.forEach((row: any) => {
      const applicantId = String(row?.applicant_id ?? '').trim();
      if (!applicantId) return;

      const snapshot: EvaluationSnapshot = {
        score: deriveEvaluationPercentage(row),
        completed: hasCompletedEvaluation(row),
        updatedAt: String(row?.created_at ?? row?.updated_at ?? new Date().toISOString()),
      };

      const linkedEmail = applicantEmailById.get(applicantId);
      const linkedIds = linkedEmail ? applicantIdsByEmail.get(linkedEmail) ?? [] : [];
      const targetIds = Array.from(new Set([applicantId, ...linkedIds]));

      targetIds.forEach((targetId) => {
        const current = evaluationMap.get(targetId);
        if (!current || new Date(snapshot.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
          evaluationMap.set(targetId, snapshot);
        }
      });
    });

    const attachmentMap = new Map<string, any[]>();
    dbAttachments.forEach((row: any) => {
      const applicantId = String(row?.applicant_id ?? '').trim();
      if (!applicantId) return;
      const current = attachmentMap.get(applicantId) ?? [];
      current.push(row);
      attachmentMap.set(applicantId, current);
    });

    const jobsSource: JobPosting[] = canonicalJobs.length > 0
      ? canonicalJobs
      : dbJobPostings
          .map((row: any, index: number) => ({
            id: String(row?.id ?? `db-job-${index + 1}`),
            jobCode: String(row?.job_code ?? row?.item_number ?? `DB-${index + 1}`),
            title: String(row?.title ?? ''),
            department: String(row?.department ?? row?.office ?? 'Unassigned'),
            division: String(row?.division ?? ''),
            positionType: 'Civil Service' as const,
            salaryGrade: String(row?.salary_grade ?? ''),
            salaryRange: { min: 0, max: 0 },
            numberOfPositions: 1,
            employmentStatus: 'Permanent' as const,
            summary: String(row?.description ?? ''),
            responsibilities: [],
            qualifications: {
              education: "Bachelor's Degree",
              experience: { years: 0, field: 'General' },
              skills: [],
              certifications: [],
            },
            requiredDocuments: [],
            applicationDeadline: new Date().toISOString(),
            status: normalizeText(String(row?.status ?? '')) === 'closed' ? 'Closed' : 'Active',
            postedDate: String(row?.created_at ?? new Date().toISOString()),
            postedBy: 'System',
            applicantCount: Number(row?.applicant_count ?? 0),
            qualifiedCount: Number(row?.qualified_count ?? 0),
          }));

    const knownTitleSet = new Set(
      jobsSource
        .map((job: JobPosting) => normalizeText(String(job?.title ?? '')))
        .filter(Boolean)
    );

    const mappedApplicants: Applicant[] = dbApplicants
      .map((row: any) => {
      const applicantId = String(row?.id ?? crypto.randomUUID());
      const position = String(row?.position ?? '');
      const rowJobId = String(row?.job_posting_id ?? '').trim();
      const matchedJob =
        jobsSource.find((job: JobPosting) => normalizeText(job.title) === normalizeText(position)) ||
        jobsSource.find((job: JobPosting) => String(job.id) === rowJobId);
      const resolvedJobPostingId =
        matchedJob?.id ??
        (rowJobId || (knownTitleSet.has(normalizeText(position)) ? normalizeText(position) : 'unposted'));
      const evalSnapshot = evaluationMap.get(applicantId);
      const persistedScore = typeof row?.total_score === 'number' ? row.total_score : 0;
      const qualificationScore = evalSnapshot ? Math.max(persistedScore, evalSnapshot.score) : persistedScore;
      const mappedStatus = toApplicantStatus(String(row?.status ?? 'New Application'), Boolean(evalSnapshot?.completed));
      const docs = (attachmentMap.get(applicantId) ?? []).map((doc: any) => ({
        type: String(doc?.document_type ?? doc?.file_name ?? 'Document'),
        url: String(doc?.file_path ?? '#'),
        verified: Boolean(doc?.verified ?? false),
      }));

      return {
        id: applicantId,
        jobPostingId: resolvedJobPostingId,
        personalInfo: {
          firstName: String(row?.first_name ?? ''),
          lastName: String(row?.last_name ?? ''),
          itemNumber: String(row?.item_number ?? ''),
          email: String(row?.email ?? ''),
          phone: String(row?.contact_number ?? ''),
          address: String(row?.address ?? ''),
          dateOfBirth: String(row?.date_of_birth ?? new Date('1995-01-01').toISOString()),
        },
        qualificationScore,
        status: mappedStatus,
        education: [],
        experience: [],
        skills: [],
        certifications: [],
        documents: docs,
        applicationDate: String(row?.created_at ?? new Date().toISOString()),
        notes: [],
        timeline: [
          {
            event: evalSnapshot?.completed ? 'Evaluation Completed' : 'Application Received',
            date: evalSnapshot?.updatedAt ?? String(row?.created_at ?? new Date().toISOString()),
            actor: evalSnapshot?.completed ? 'Interviewer' : 'System',
          },
        ],
      };
    });

    const storedApplicants = getApplicants();

    const mergedById = new Map<string, Applicant>();

    // Seed with DB snapshot first.
    mappedApplicants.forEach((row) => {
      mergedById.set(row.id, row);
    });

    // Overlay only matching local rows when DB fetch is authoritative.
    // This preserves local enrichments but prevents re-inserting deleted DB rows.
    const allowLocalOnlyRows = !primaryApplicantsFetchSucceeded;
    const mappedIds = new Set(mappedApplicants.map((row) => row.id));
    storedApplicants.forEach((row) => {
      if (allowLocalOnlyRows || mappedIds.has(row.id)) {
        const current = mergedById.get(row.id);
        if (!current) {
          mergedById.set(row.id, row);
          return;
        }

        mergedById.set(row.id, {
          ...current,
          ...row,
          personalInfo: {
            ...current.personalInfo,
            ...row.personalInfo,
          },
          // Never regress visible score due to stale local cache rows.
          qualificationScore: Math.max(
            Number(current.qualificationScore ?? 0),
            Number(row.qualificationScore ?? 0)
          ),
          // Keep timeline and notes additive when possible.
          timeline: [
            ...(Array.isArray(current.timeline) ? current.timeline : []),
            ...(Array.isArray(row.timeline) ? row.timeline : []),
          ],
          notes: [
            ...(Array.isArray(current.notes) ? current.notes : []),
            ...(Array.isArray(row.notes) ? row.notes : []),
          ],
        });
      }
    });

    const mergedApplicants = Array.from(mergedById.values());
    // Deduplicate by email+jobPostingId to guard against cases where the same
    // person submitted more than once or was synced from two different sources.
    const seenEmailJob = new Map<string, Applicant>();
    mergedApplicants.forEach((row) => {
      const email = row.personalInfo?.email?.trim().toLowerCase() ?? '';
      const key = email ? `${email}::${row.jobPostingId}` : row.id;
      const existing = seenEmailJob.get(key);
      if (!existing) {
        seenEmailJob.set(key, row);
      } else {
        // Prefer the entry with a real status over "New Application", or
        // whichever has the more recent applicationDate.
        const existingIsGeneric = existing.status === 'New Application';
        const rowIsGeneric = row.status === 'New Application';
        if (existingIsGeneric && !rowIsGeneric) {
          seenEmailJob.set(key, row);
        } else if (!existingIsGeneric && rowIsGeneric) {
          // keep existing
        } else {
          // Both same priority – keep the later one.
          if (new Date(row.applicationDate) > new Date(existing.applicationDate)) {
            seenEmailJob.set(key, row);
          }
        }
      }
    });
    const dedupedApplicants = Array.from(seenEmailJob.values());
    setApplicants(dedupedApplicants);

    // Keep local cache aligned to authoritative source to avoid stale rows reappearing.
    if (primaryApplicantsFetchSucceeded) {
      saveApplicants(dedupedApplicants, { broadcast: false });
    }
  };

  useEffect(() => {
    let inFlight = false;
    let pending = false;
    let disposed = false;

    const run = async () => {
      if (disposed) return;

      if (inFlight) {
        pending = true;
        return;
      }

      inFlight = true;
      try {
        await loadQualifiedApplicantsData();
      } finally {
        inFlight = false;
        if (pending && !disposed) {
          pending = false;
          void run();
        }
      }
    };

    void run();

    const onUpdated = () => run();

    window.addEventListener('focus', onUpdated);
    window.addEventListener('cictrix:applicants-updated', onUpdated as EventListener);
    window.addEventListener('cictrix:job-postings-updated', onUpdated as EventListener);

    if (jobId) setJobFilter(jobId);

    return () => {
      disposed = true;
      window.removeEventListener('focus', onUpdated);
      window.removeEventListener('cictrix:applicants-updated', onUpdated as EventListener);
      window.removeEventListener('cictrix:job-postings-updated', onUpdated as EventListener);
    };
  }, [jobId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const jobMap = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const selectedJobTitle = jobId ? jobMap.get(jobId)?.title : undefined;

  const filteredRows = useMemo(() => {
    const rows = applicants.filter((applicant) => {
      // Keep the main Qualified Applicants page strict, but allow job-specific and Job Posts views to show all rows.
      if (!isApplicantListView) {
        const normalizedStatus = normalizeText(applicant.status);
        const isQualified = isAdminQualifiedStatus(applicant.status);
        const isReviewedOrCompleted =
          normalizedStatus.includes('review') ||
          normalizedStatus.includes('interview') ||
          normalizedStatus.includes('completed');
        if (!isQualified && !isReviewedOrCompleted) return false;
      }

      const matchesSearch =
        !search ||
        `${applicant.personalInfo.firstName} ${applicant.personalInfo.lastName} ${applicant.personalInfo.itemNumber ?? ''} ${applicant.personalInfo.email} ${applicant.id}`
          .toLowerCase()
          .includes(search.toLowerCase());
      const matchesJob = (jobId ? applicant.jobPostingId === jobId : jobFilter === 'all' || applicant.jobPostingId === jobFilter);
      const matchesStatus = isApplicantListView
        ? jobPostsStatusFilter === 'all' || toJobPostsStatusBucket(applicant.status) === jobPostsStatusFilter
        : statusFilter.length === 0 || statusFilter.includes(applicant.status);
      const matchesScore = isApplicantListView ? true : applicant.qualificationScore >= scoreMin;
      const applied = new Date(applicant.applicationDate).getTime();
      const fromOkay = isApplicantListView ? true : (!dateFrom || applied >= new Date(dateFrom).getTime());
      const toOkay = isApplicantListView ? true : (!dateTo || applied <= new Date(dateTo).getTime() + 86400000);
      return matchesSearch && matchesJob && matchesStatus && matchesScore && fromOkay && toOkay;
    });

    const sorted = [...rows];
    sorted.sort((left, right) => {
      if (isApplicantListView) {
        return new Date(right.applicationDate).getTime() - new Date(left.applicationDate).getTime();
      }
      if (sortBy === 'Qualification Score') return right.qualificationScore - left.qualificationScore;
      if (sortBy === 'Last Updated') {
        const leftTime = new Date(left.timeline[left.timeline.length - 1]?.date ?? left.applicationDate).getTime();
        const rightTime = new Date(right.timeline[right.timeline.length - 1]?.date ?? right.applicationDate).getTime();
        return rightTime - leftTime;
      }
      return new Date(right.applicationDate).getTime() - new Date(left.applicationDate).getTime();
    });
    return sorted;
  }, [applicants, search, jobId, jobFilter, statusFilter, jobPostsStatusFilter, scoreMin, dateFrom, dateTo, sortBy, isApplicantListView]);

  const getQualifiedStatus = (applicant: Applicant): 'Completed' | 'Pending' =>
    hasCompletedInterview(applicant) ? 'Completed' : 'Pending';

  const getAdjectivalRating = (score: number): 'Excellent' | 'Very Good' | 'Good' | 'Fair' | 'Needs Improvement' => {
    if (score >= 90) return 'Excellent';
    if (score >= 85) return 'Very Good';
    if (score >= 80) return 'Good';
    if (score >= 75) return 'Fair';
    return 'Needs Improvement';
  };

  const qualifiedBaseRows = useMemo(() => {
    return applicants.filter((applicant) => {
      const matchesJob = jobId ? applicant.jobPostingId === jobId : true;
      if (!matchesJob) return false;

      // Qualified tab pool: only qualified/recommended applicants with started interview workflow.
      const isQualified = isAdminQualifiedStatus(applicant.status);
      if (!isQualified) return false;

      return hasInterviewStarted(applicant);
    });
  }, [applicants, jobId]);

  const qualifiedPositionOptions = useMemo(() => {
    const set = new Set<string>();
    qualifiedBaseRows.forEach((applicant) => {
      const job = jobMap.get(applicant.jobPostingId);
      const value = String(job?.title ?? '').trim();
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [qualifiedBaseRows, jobMap]);

  const qualifiedOfficeOptions = useMemo(() => {
    const set = new Set<string>();
    qualifiedBaseRows.forEach((applicant) => {
      const job = jobMap.get(applicant.jobPostingId);
      const value = String(job?.department ?? '').trim();
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [qualifiedBaseRows, jobMap]);

  const qualifiedRows = useMemo(() => {
    const rows = qualifiedBaseRows.filter((applicant) => {
      const fullName = `${applicant.personalInfo.firstName} ${applicant.personalInfo.lastName}`.trim();
      const job = jobMap.get(applicant.jobPostingId);
      const position = String(job?.title ?? '').trim();
      const office = String(job?.department ?? '').trim();
      const matchesSearch =
        !search ||
        `${fullName} ${position} ${office}`.toLowerCase().includes(search.toLowerCase());
      const matchesPosition = qualifiedPosition === 'all' || position === qualifiedPosition;
      const matchesOffice = qualifiedOffice === 'all' || office === qualifiedOffice;
      const status = getQualifiedStatus(applicant);
      const matchesTab = qualifiedTab === 'all' || status.toLowerCase() === qualifiedTab;
      return matchesSearch && matchesPosition && matchesOffice && matchesTab;
    });

    return rows.sort((a, b) => new Date(b.applicationDate).getTime() - new Date(a.applicationDate).getTime());
  }, [qualifiedBaseRows, jobMap, qualifiedOffice, qualifiedPosition, qualifiedTab, search]);

  const canManageHiring = location.pathname.startsWith('/admin/rsp');
  const isCompletedHireMode = !isApplicantListView && qualifiedTab === 'completed';

  const selectedRowsForHiring = useMemo(
    () => qualifiedRows.filter((row) => selectedHireApplicantIds.includes(row.id)),
    [qualifiedRows, selectedHireApplicantIds]
  );

  const selectedHiringMeta = useMemo(() => {
    const existingAccounts = getEmployeePortalAccounts();
    const existingAccountsByEmailMap = new Map(
      existingAccounts
        .map((account) => [normalizeText(account.employee.email || ''), account] as const)
        .filter(([email]) => Boolean(email))
    );

    const isInternal = (row: Applicant) =>
      row.applicationType === 'promotion' ||
      Boolean(row.internalApplication?.employeeId) ||
      existingAccountsByEmailMap.has(normalizeText(row.personalInfo.email || ''));

    const promotions = selectedRowsForHiring.filter(isInternal);
    const externals = selectedRowsForHiring.filter((row) => !isInternal(row));

    return {
      promotions,
      externals,
    };
  }, [selectedRowsForHiring]);

  useEffect(() => {
    // Keep selection valid for the currently visible completed rows only.
    if (!isCompletedHireMode) {
      setSelectedHireApplicantIds([]);
      return;
    }
    const visibleIds = new Set(qualifiedRows.map((row) => row.id));
    setSelectedHireApplicantIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [isCompletedHireMode, qualifiedRows]);

  const toggleHireSelection = (applicantId: string) => {
    setSelectedHireApplicantIds((prev) =>
      prev.includes(applicantId)
        ? prev.filter((id) => id !== applicantId)
        : [...prev, applicantId]
    );
  };

  const handleConfirmHireApplicants = async () => {
    if (!canManageHiring || selectedHireApplicantIds.length === 0) return;

    const selectedRows = qualifiedRows.filter((row) => selectedHireApplicantIds.includes(row.id));
    if (selectedRows.length === 0) {
      setShowHireConfirmModal(false);
      return;
    }

    const existingNewlyHired = getNewlyHired();
    const existingApplicantIds = new Set(existingNewlyHired.map((item) => item.applicantId));
    const employeeRecords = getEmployeeRecords();
    const existingAccounts = getEmployeePortalAccounts();
    const existingAccountsByEmail = new Map(
      existingAccounts
        .map((account) => [normalizeText(account.employee.email || ''), account] as const)
        .filter(([email]) => Boolean(email))
    );
    const occupiedUsernames = new Set(existingAccounts.map((account) => normalizeUsername(account.username)));
    let sequence = employeeRecords.length + 1;
    const nowIso = new Date().toISOString();

    const hiredIdSet = new Set<string>();
    const toAddNewlyHired: NewlyHired[] = [];
    const skippedRows: string[] = [];

    selectedRows.forEach((row) => {
      const fullName = `${row.personalInfo.firstName} ${row.personalInfo.lastName}`.trim();
      const targetPosition = jobMap.get(row.jobPostingId)?.title ?? 'Unassigned Position';
      const targetDepartment = jobMap.get(row.jobPostingId)?.department ?? 'Unassigned Department';
      const targetDivision = jobMap.get(row.jobPostingId)?.division;
      const employeeIdFromApplication = String(row.internalApplication?.employeeId ?? '').trim();
      const existingAccountById = existingAccounts.find(
        (account) => String(account.employee.employeeId ?? '').trim() === employeeIdFromApplication
      );
      const existingAccountByEmail = existingAccountsByEmail.get(normalizeText(row.personalInfo.email || ''));
      const isInternalPromotion =
        row.applicationType === 'promotion' ||
        Boolean(row.internalApplication?.employeeId) ||
        Boolean(existingAccountByEmail);
      const existingAccount = existingAccountById ?? existingAccountByEmail;

      if (isInternalPromotion && !existingAccount && !employeeIdFromApplication) {
        skippedRows.push(fullName);
        return;
      }

      const employeeNumber = isInternalPromotion
        ? String(existingAccount?.employee.employeeId ?? employeeIdFromApplication)
        : generateEmployeeId(sequence++);
      const username = existingAccount?.username ?? createUniqueUsername(row, occupiedUsernames);
      const positionHistoryEntry = {
        position: targetPosition,
        department: targetDepartment,
        division: targetDivision,
        effectiveDate: nowIso,
        changeType: isInternalPromotion ? 'promotion' as const : 'hire' as const,
        sourceApplicantId: row.id,
        notes: isInternalPromotion
          ? `Promoted from ${row.internalApplication?.currentPosition || 'current assignment'}`
          : 'Initial hiring record created from recruitment conversion.',
      };

      if (isInternalPromotion && existingAccount) {
        updateEmployeePortalEmployee(employeeNumber, {
          fullName,
          email: row.personalInfo.email || existingAccount.employee.email,
          mobileNumber: row.personalInfo.phone || existingAccount.employee.mobileNumber,
          homeAddress: row.personalInfo.address || existingAccount.employee.homeAddress,
          currentPosition: targetPosition,
          currentDepartment: targetDepartment,
          currentDivision: targetDivision,
          positionHistory: [
            ...(existingAccount.employee.positionHistory ?? []),
            positionHistoryEntry,
          ],
        });

        appendRecruitmentAuditLog({
          action: 'PROMOTION_EXECUTED',
          applicantId: row.id,
          applicantName: fullName,
          details: `Position updated to ${targetPosition} (${targetDepartment}).`,
          actor: 'RSP Admin',
        });
      } else if (isInternalPromotion) {
        // Internal promotion can proceed using the linked employee ID even if
        // no employee portal account exists yet.
        appendRecruitmentAuditLog({
          action: 'PROMOTION_EXECUTED',
          applicantId: row.id,
          applicantName: fullName,
          details: `Position updated to ${targetPosition} (${targetDepartment}) via employee record fallback (${employeeNumber}).`,
          actor: 'RSP Admin',
        });
      } else {
        appendRecruitmentAuditLog({
          action: 'HIRED_EXTERNAL_PENDING_CREDENTIALS',
          applicantId: row.id,
          applicantName: fullName,
          details: `Employee ID ${employeeNumber} reserved. Credentials to be generated in Newly Hired stage.`,
          actor: 'RSP Admin',
        });
      }

      const employeeRecordIndex = employeeRecords.findIndex((record) => record.employeeId === employeeNumber);
      if (employeeRecordIndex >= 0) {
        const currentRecord = employeeRecords[employeeRecordIndex];
        employeeRecords[employeeRecordIndex] = {
          ...currentRecord,
          name: fullName,
          position: targetPosition,
          department: targetDepartment,
          division: targetDivision,
          positionHistory: [...(currentRecord.positionHistory ?? []), positionHistoryEntry],
        };
      } else {
        employeeRecords.push({
          id: crypto.randomUUID(),
          employeeId: employeeNumber,
          name: fullName,
          position: targetPosition,
          department: targetDepartment,
          division: targetDivision,
          startDate: nowIso,
          positionHistory: [positionHistoryEntry],
        });
      }

      // Always upsert newly hired record into Supabase
      toAddNewlyHired.push({
        id: `hire-${row.id}-${Date.now()}`,
        applicantId: row.id,
        employeeInfo: {
          firstName: row.personalInfo.firstName,
          lastName: row.personalInfo.lastName,
          email: row.personalInfo.email,
          phone: row.personalInfo.phone,
          emergencyContact: {
            name: '',
            relationship: '',
            phone: '',
          },
          governmentIds: {},
        },
        applicationType: row.applicationType,
        internalApplication: row.internalApplication
          ? {
              employeeId: employeeNumber,
              previousPosition: row.internalApplication.currentPosition,
              previousDepartment: row.internalApplication.currentDepartment,
              previousDivision: row.internalApplication.currentDivision,
              employeeUsername: username,
            }
          : undefined,
        position: targetPosition,
        department: targetDepartment,
        division: targetDivision,
        employmentType: 'Permanent',
        dateHired: nowIso,
        expectedStartDate: nowIso,
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
            content: isInternalPromotion
              ? `Promoted into ${targetPosition}. Existing employee portal account retained (${username}).`
              : 'Hired. Credentials pending generation in Newly Hired stage.',
            date: nowIso,
          },
        ],
        timeline: [
          {
            event: isInternalPromotion
              ? 'Applicant marked as Hired and linked to existing employee account'
              : 'Applicant marked as Hired and queued for onboarding credentials',
            date: nowIso,
            actor: 'RSP Admin',
          },
        ],
        employeeId: employeeNumber,
      });

      hiredIdSet.add(row.id);

      appendRecruitmentAuditLog({
        action: 'HIRING_DECISION_CONFIRMED',
        applicantId: row.id,
        applicantName: fullName,
        details: isInternalPromotion
          ? `Internal promotion to ${targetPosition}.`
          : `External hire for ${targetPosition}.`,
        actor: 'RSP Admin',
      });
    });

    saveEmployeeRecords(employeeRecords);
    if (toAddNewlyHired.length > 0) {
      await saveNewlyHired([...existingNewlyHired, ...toAddNewlyHired]);
    }


    // Always update status in Supabase for hired applicants
    if (hiredIdSet.size > 0) {
      try {
        await supabase.from('applicants').update({ status: 'Hired' }).in('id', Array.from(hiredIdSet));
      } catch {
        // Log error, but do not block
      }
    }

    const nowIsoForLocalUpdate = new Date().toISOString();
    const nextApplicants = applicants.map((row) => {
      if (!hiredIdSet.has(row.id)) return row;

      return {
        ...row,
        status: 'Hired' as unknown as ApplicantStatus,
        timeline: [
          ...(Array.isArray(row.timeline) ? row.timeline : []),
          {
            event: 'Status updated to Hired',
            date: nowIsoForLocalUpdate,
            actor: 'RSP Admin',
          },
        ],
      };
    });

    setApplicants(nextApplicants);
    saveApplicants(nextApplicants);

    setSelectedHireApplicantIds([]);
    setShowHireConfirmModal(false);
    if (skippedRows.length > 0) {
      setToast(
        `Processed ${hiredIdSet.size} applicant(s). Skipped ${skippedRows.length} internal applicant(s) with no existing employee account.`
      );
    } else {
      setToast(
        hiredIdSet.size === 1
          ? 'Applicant successfully processed for hiring.'
          : `${hiredIdSet.size} applicants successfully processed for hiring.`
      );
    }

    if (hiredIdSet.size > 0) {
      // Dispatch event to notify other pages (NewlyHiredPage) to refresh their data
      window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
      navigate('/admin/rsp/new-hired');
    }
  };

  const qualifiedTabCounts = useMemo(() => {
    let completed = 0;
    let pending = 0;

    qualifiedBaseRows.forEach((applicant) => {
      if (getQualifiedStatus(applicant) === 'Completed') completed += 1;
      else pending += 1;
    });

    return {
      all: qualifiedBaseRows.length,
      completed,
      pending,
    };
  }, [qualifiedBaseRows]);

  const updateApplicantStatus = (ids: string[], nextStatus: ApplicantStatus, reason?: string) => {
    const timestamp = new Date().toISOString();
    const trimmedReason = (reason ?? '').trim();
    const nextStatusLabel = toStatusDisplayLabel(nextStatus);
    const nextApplicants = applicants.map((applicant) => {
      if (!ids.includes(applicant.id)) return applicant;
      const currentNotes = Array.isArray(applicant.notes) ? applicant.notes : [];
      const currentTimeline = Array.isArray(applicant.timeline) ? applicant.timeline : [];
      const eventLabel = trimmedReason
        ? `Status Updated: ${nextStatusLabel} (Reason: ${trimmedReason})`
        : `Status Updated: ${nextStatusLabel}`;
      return {
        ...applicant,
        status: nextStatus,
        notes: trimmedReason
          ? [{ author: 'HR Admin', content: `Disqualification reason: ${trimmedReason}`, date: timestamp, pinned: false }, ...currentNotes]
          : currentNotes,
        timeline: [...currentTimeline, { event: eventLabel, date: timestamp, actor: 'HR Admin' }],
      };
    });
    setApplicants(nextApplicants);
    saveApplicants(nextApplicants);
    ids.forEach((applicantId) => {
      const target = nextApplicants.find((entry) => entry.id === applicantId);
      appendRecruitmentAuditLog({
        action: 'QUALIFICATION_STATUS_UPDATED',
        applicantId,
        applicantName: target ? `${target.personalInfo.firstName} ${target.personalInfo.lastName}`.trim() : undefined,
        details: trimmedReason ? `${nextStatusLabel} (${trimmedReason})` : nextStatusLabel,
        actor: 'HR Admin',
      });
    });
    if (activeApplicant && ids.includes(activeApplicant.id)) {
      const updated = nextApplicants.find((item) => item.id === activeApplicant.id) ?? null;
      setActiveApplicant(updated);
    }
    setToast(`Status updated to ${nextStatusLabel}.`);
  };

  useEffect(() => {
    if (!activeApplicant) {
      setStatusDecisionLocked(false);
      return;
    }

    const normalizedStatus = activeApplicant.status.toLowerCase();
    const shouldLock =
      normalizedStatus.includes('not qualified') ||
      normalizedStatus.includes('disqual') ||
      normalizedStatus.includes('recommended for hiring') ||
      normalizedStatus.includes('qualified') ||
      normalizedStatus.includes('hired');

    setStatusDecisionLocked(shouldLock);
  }, [activeApplicant?.status]);

  const handleDisqualifyAction = (applicantId: string) => {
    setDisqualifyReasonDraft('');
    setPendingStatusAction({
      applicantId,
      action: 'disqualify',
      nextStatus: 'Not Qualified',
    });
  };

  const handleQualifyAction = (applicantId: string) => {
    setDisqualifyReasonDraft('');
    setPendingStatusAction({
      applicantId,
      action: 'qualify',
      nextStatus: 'Recommended for Hiring',
    });
  };

  const handleShortlistAction = (applicantId: string) => {
    // Shortlist should not lock decision buttons.
    setStatusDecisionLocked(false);
    updateApplicantStatus([applicantId], 'Shortlisted');
  };

  const confirmPendingStatusAction = () => {
    if (!pendingStatusAction) return;
    const isDisqualifyAction = pendingStatusAction.action === 'disqualify';
    const trimmedReason = disqualifyReasonDraft.trim();
    if (isDisqualifyAction && trimmedReason.length === 0) return;

    setStatusDecisionLocked(true);
    updateApplicantStatus([pendingStatusAction.applicantId], pendingStatusAction.nextStatus, isDisqualifyAction ? trimmedReason : undefined);
    setDisqualifyReasonDraft('');
    setPendingStatusAction(null);
  };

  const cancelPendingStatusAction = () => {
    setDisqualifyReasonDraft('');
    setPendingStatusAction(null);
  };

  const fetchApplicantAttachments = async (applicantId: string): Promise<ApplicantAttachmentRow[]> => {
    const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
    const primaryClient = preferredMode === 'local' ? (mockDatabase as any) : supabase;
    const secondaryClient = preferredMode === 'local' ? supabase : (mockDatabase as any);

    const runFetch = async (client: any) => {
      const result = await client
        .from('applicant_attachments')
        .select('id,file_name,file_path,document_type,created_at')
        .eq('applicant_id', applicantId)
        .order('created_at', { ascending: false });
      if (result.error) throw result.error;
      return ((result.data || []) as ApplicantAttachmentRow[]).filter((row) => row.file_path || row.file_name);
    };

    try {
      return await runFetch(primaryClient);
    } catch {
      try {
        return await runFetch(secondaryClient);
      } catch {
        return [];
      }
    }
  };

  const openApplicantDetails = async (applicant: Applicant) => {
    setActiveApplicant(applicant);
    setActiveTab('Overview');
    setShowMessageDialog(false);
    setEmailTemplate('none');
    setEmailSubject('');
    setEmailMessage('');
    setNoteDraft('');

    if (attachmentsByApplicant[applicant.id]) return;
    setAttachmentsLoading(true);
    const rows = await fetchApplicantAttachments(applicant.id);
    setAttachmentsByApplicant((prev) => ({ ...prev, [applicant.id]: rows }));
    setAttachmentsLoading(false);
  };

  const closeApplicantDetails = () => {
    setShowMessageDialog(false);
    setActiveApplicant(null);
    setActiveTab('Overview');
  };

  const onTemplateChange = (templateKey: EmailTemplateKey) => {
    setEmailTemplate(templateKey);
    const selected = EMAIL_TEMPLATES.find((item) => item.key === templateKey);
    if (!selected) return;
    setEmailSubject(selected.subject);
    setEmailMessage(selected.message);
  };

  const addNote = () => {
    if (!activeApplicant || !noteDraft.trim()) return;
    const now = new Date().toISOString();
    const nextApplicants = applicants.map((applicant) =>
      applicant.id === activeApplicant.id
        ? {
            ...applicant,
            notes: [
              { author: 'HR Admin', content: noteDraft.trim(), date: now, pinned: false },
              ...(Array.isArray(applicant.notes) ? applicant.notes : []),
            ],
            timeline: [
              ...(Array.isArray(applicant.timeline) ? applicant.timeline : []),
              { event: 'Note Added', date: now, actor: 'HR Admin' },
            ],
          }
        : applicant
    );
    setApplicants(nextApplicants);
    saveApplicants(nextApplicants);
    const updated = nextApplicants.find((item) => item.id === activeApplicant.id) ?? null;
    setActiveApplicant(updated);
    setNoteDraft('');
    setToast('Note saved.');
  };

  const getLocalAttachmentMatches = (applicantId: string, docType: string): StoredAttachment[] => {
    const attachments = (() => {
      try {
        return JSON.parse(localStorage.getItem(ATTACHMENTS_STORAGE_KEY) ?? '[]') as StoredAttachment[];
      } catch {
        return [];
      }
    })();

    const target = looseDocKey(docType);
    return attachments.filter((entry) => {
      if (entry.applicant_id !== applicantId) return false;
      const byDocumentType = looseDocKey(entry.document_type ?? '') === target;
      const byName = looseDocKey(entry.file_name).includes(target);
      return byDocumentType || byName;
    });
  };

  const getAnyLocalAttachment = (applicantId: string): StoredAttachment | null => {
    const attachments = (() => {
      try {
        return JSON.parse(localStorage.getItem(ATTACHMENTS_STORAGE_KEY) ?? '[]') as StoredAttachment[];
      } catch {
        return [];
      }
    })();

    const rows = attachments.filter((entry) => entry.applicant_id === applicantId);
    return rows[rows.length - 1] ?? null;
  };

  const getPreviewCacheMatch = (applicantId: string, docType: string): CachedPreviewFile | null => {
    const entries = (() => {
      try {
        return JSON.parse(localStorage.getItem(ATTACHMENT_PREVIEW_CACHE_KEY) ?? '[]') as CachedPreviewFile[];
      } catch {
        return [];
      }
    })();

    const target = looseDocKey(docType);
    return (
      entries.find(
        (entry) =>
          entry.applicantId === applicantId &&
          (looseDocKey(entry.documentType) === target || looseDocKey(entry.fileName).includes(target))
      ) ?? null
    );
  };

  const getAnyPreviewCacheMatch = (applicantId: string): CachedPreviewFile | null => {
    const entries = (() => {
      try {
        return JSON.parse(localStorage.getItem(ATTACHMENT_PREVIEW_CACHE_KEY) ?? '[]') as CachedPreviewFile[];
      } catch {
        return [];
      }
    })();

    const rows = entries.filter((entry) => entry.applicantId === applicantId);
    return rows[rows.length - 1] ?? null;
  };

  const resolveDocumentForApplicant = async (
    applicantId: string,
    docType: string,
    fallbackDoc?: ApplicantDocumentRef
  ): Promise<ResolvedDocument | null> => {
    const previewCacheMatch = getPreviewCacheMatch(applicantId, docType);
    if (previewCacheMatch) {
      return {
        fileName: previewCacheMatch.fileName,
        url: previewCacheMatch.dataUrl,
      };
    }

    const anyPreview = getAnyPreviewCacheMatch(applicantId);
    if (anyPreview) {
      return {
        fileName: anyPreview.fileName,
        url: anyPreview.dataUrl,
      };
    }

    const localMatches = getLocalAttachmentMatches(applicantId, docType);
    for (const match of localMatches) {
      const resolvedUrl = await resolveStorageOrDirectUrl(match.file_path ?? '');
      if (resolvedUrl) {
        return {
          fileName: match.file_name,
          url: resolvedUrl,
        };
      }
    }

    const anyLocal = getAnyLocalAttachment(applicantId);
    if (anyLocal?.file_path) {
      const resolvedUrl = await resolveStorageOrDirectUrl(anyLocal.file_path);
      if (resolvedUrl) {
        return {
          fileName: anyLocal.file_name,
          url: resolvedUrl,
        };
      }
    }

    const remote = await supabase
      .from('applicant_attachments')
      .select('file_name,file_path,document_type')
      .eq('applicant_id', applicantId);

    const remoteRows = ((remote as any)?.data ?? []) as Array<{
      file_name: string;
      file_path: string;
      document_type?: string;
    }>;

    const target = looseDocKey(docType);
    const remoteMatch = remoteRows.find((entry) => {
      const byDocumentType = looseDocKey(entry.document_type ?? '') === target;
      const byName = looseDocKey(entry.file_name ?? '').includes(target);
      return byDocumentType || byName;
    });

    if (remoteMatch?.file_path) {
      const resolvedUrl = await resolveStorageOrDirectUrl(remoteMatch.file_path);
      if (resolvedUrl) {
        return {
          fileName: remoteMatch.file_name,
          url: resolvedUrl,
        };
      }
    }

    for (const entry of remoteRows) {
      const resolvedUrl = await resolveStorageOrDirectUrl(entry.file_path ?? '');
      if (resolvedUrl) {
        return {
          fileName: entry.file_name,
          url: resolvedUrl,
        };
      }
    }

    // Final fallback: use the document URL saved on applicant record itself.
    if (fallbackDoc?.url) {
      const fallbackUrl = await resolveStorageOrDirectUrl(fallbackDoc.url);
      if (fallbackUrl) {
        return {
          fileName: fallbackDoc.type,
          url: fallbackUrl,
        };
      }
    }

    return null;
  };

  const handlePreviewDocument = async (doc: ApplicantDocumentRef) => {
    if (!activeApplicant) return;

    const actionKey = `${activeApplicant.id}-${doc.type}-preview`;
    setDocumentActionBusy(actionKey);
    try {
      const resolved = await resolveDocumentForApplicant(activeApplicant.id, doc.type, doc);
      if (!resolved) {
        setToast('No previewable file found for this document yet.');
        return;
      }

      window.open(resolved.url, '_blank', 'noopener,noreferrer');
    } catch {
      setToast('Unable to preview this document right now.');
    } finally {
      setDocumentActionBusy(null);
    }
  };

  const handleBulkDownload = async () => {
    if (!activeApplicant) return;

    let downloaded = 0;
    for (const doc of activeApplicant.documents) {
      const resolved = await resolveDocumentForApplicant(activeApplicant.id, doc.type, {
        type: doc.type,
        url: doc.url,
      });
      if (!resolved) continue;
      const anchor = document.createElement('a');
      anchor.href = resolved.url;
      anchor.download = resolved.fileName;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.click();
      downloaded += 1;
    }

    if (downloaded === 0) {
      setToast('No downloadable files were found for this applicant.');
      return;
    }

    setToast(`Started ${downloaded} document download${downloaded > 1 ? 's' : ''}.`);
  };

  const getModalDocuments = () => {
    if (!activeApplicant) return [] as Array<{ type: string; url: string; verified: boolean; uploadedAt?: string }>;

    const liveRows = attachmentsByApplicant[activeApplicant.id] || [];
    if (liveRows.length > 0) {
      return liveRows.map((row) => ({
        type: toDocumentLabel(row.document_type || row.file_name || 'document'),
        url: row.file_path || '#',
        verified: false,
        uploadedAt: row.created_at,
      }));
    }

    return [];
  };

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />
      <main className="admin-content bg-slate-50">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            {jobId && selectedJobTitle ? (
              <p className="mb-2 text-sm text-slate-500">Job Postings &gt; {selectedJobTitle} &gt; Applicants</p>
            ) : null}
            <h1 className={`${isApplicantListView ? 'text-2xl' : 'text-3xl'} font-bold text-slate-900`}>{isApplicantListView ? 'Applicants' : 'Qualified Applicants'}</h1>
          </div>
          {!isApplicantListView && (
            <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700" onClick={() => setShowGuide(true)}>
              How to Navigate
            </button>
          )}
        </header>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          {isApplicantListView ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="relative lg:col-span-2">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-12 w-full rounded-xl border border-slate-300 pl-12 pr-4 text-base text-slate-700"
                  placeholder="Search applicants by name or email..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <select
                className="h-12 rounded-xl border border-slate-300 px-4 text-base text-slate-800"
                value={jobPostsStatusFilter}
                onChange={(event) => setJobPostsStatusFilter(event.target.value as JobPostsStatusFilter)}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="reviewed">Reviewed</option>
                <option value="shortlisted">Shortlisted</option>
                <option value="qualified">Qualified</option>
              </select>
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap gap-3 border-b border-slate-200 pb-4">
                {[
                  { key: 'all', label: 'All Applicants', count: qualifiedTabCounts.all },
                  { key: 'completed', label: 'Completed', count: qualifiedTabCounts.completed },
                  { key: 'pending', label: 'Pending', count: qualifiedTabCounts.pending },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setQualifiedTab(tab.key as 'all' | 'completed' | 'pending')}
                    className={`rounded-xl px-5 py-2 text-base font-semibold ${qualifiedTab === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}
                  >
                    {tab.label}{' '}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-sm ${qualifiedTab === tab.key ? 'bg-white/90 text-slate-800' : 'bg-slate-200 text-slate-700'}`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="relative xl:col-span-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by name, position, or office..."
                    className="w-full rounded-xl border border-slate-300 py-3 pl-12 pr-4 text-base"
                  />
                </div>

                <select
                  value={qualifiedPosition}
                  onChange={(event) => setQualifiedPosition(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                >
                  <option value="all">All Positions</option>
                  {qualifiedPositionOptions.map((position) => (
                    <option key={position} value={position}>{position}</option>
                  ))}
                </select>

                <select
                  value={qualifiedOffice}
                  onChange={(event) => setQualifiedOffice(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                >
                  <option value="all">All Offices</option>
                  {qualifiedOfficeOptions.map((office) => (
                    <option key={office} value={office}>{office}</option>
                  ))}
                </select>
              </div>

              {isCompletedHireMode && (
                <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-medium text-slate-700">
                    Selected applicants: <span className="font-bold text-slate-900">{selectedHireApplicantIds.length}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowHireConfirmModal(true)}
                    disabled={!canManageHiring || selectedHireApplicantIds.length === 0}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Hire Applicant
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {isApplicantListView && (
          <p className="mt-4 text-base text-slate-700">
            Showing <span className="font-semibold text-slate-900">{filteredRows.length}</span> applicants
          </p>
        )}

        <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {isApplicantListView && (
            <div className="border-b border-slate-200 px-5 py-3 text-base text-slate-700">
              Showing <span className="font-semibold text-slate-900">{filteredRows.length}</span> applicants
            </div>
          )}
          <div className="overflow-x-auto">
            <table className={`min-w-full text-left ${isApplicantListView ? 'text-sm' : 'text-sm'}`}>
              <thead className={isApplicantListView ? 'bg-slate-50 text-sm uppercase tracking-wide text-slate-700' : 'bg-slate-100 text-xs uppercase tracking-wide text-slate-500'}>
                <tr>
                  {isApplicantListView ? (
                    <>
                      <th className="px-5 py-4">Applicant Name</th>
                      <th className="px-5 py-4">Contact Info</th>
                      <th className="px-5 py-4">Date Submitted</th>
                      <th className="px-5 py-4">Status</th>
                    </>
                  ) : (
                    <>
                      {isCompletedHireMode && <th className="px-5 py-4">SELECT</th>}
                      <th className="px-5 py-4">APPLICANT NAME</th>
                      <th className="px-5 py-4">POSITION APPLIED FOR</th>
                      <th className="px-5 py-4">OFFICE / DEPARTMENT</th>
                      <th className="px-5 py-4">TOTAL SCORE</th>
                      <th className="px-5 py-4">ADJECTIVAL RATING</th>
                      <th className="px-5 py-4">STATUS</th>
                      <th className="px-5 py-4">DATE QUALIFIED</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(isApplicantListView ? filteredRows : qualifiedRows).map((applicant) => {
                  const fullName = `${applicant.personalInfo.firstName} ${applicant.personalInfo.lastName}`;
                  const job = jobMap.get(applicant.jobPostingId);
                  const totalScore = Math.round(applicant.qualificationScore || 0);
                  const adjectival = getAdjectivalRating(totalScore);
                  const qualifiedStatus = getQualifiedStatus(applicant);
                  return (
                    <tr
                      key={applicant.id}
                      className={isApplicantListView ? 'border-t border-slate-200 hover:bg-slate-50' : 'border-t border-slate-100 hover:bg-slate-50'}
                    >
                      {isApplicantListView ? (
                        <>
                          <td className="px-5 py-4 font-medium text-slate-900">
                            <button type="button" className="text-left hover:text-blue-700" onClick={() => void openApplicantDetails(applicant)}>
                              {fullName}
                            </button>
                          </td>
                          <td className="px-5 py-4 text-slate-700">
                            <p>{applicant.personalInfo.email}</p>
                            <p className="mt-1 text-slate-600">{applicant.personalInfo.phone || '--'}</p>
                          </td>
                          <td className="px-5 py-4 text-slate-800">{formatPHDate(applicant.applicationDate)}</td>
                          <td className="px-5 py-4">
                            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_COLORS[applicant.status]}`}>{toJobPostsStatusLabel(applicant.status)}</span>
                          </td>
                        </>
                      ) : (
                        <>
                          {isCompletedHireMode && (
                            <td className="px-5 py-4">
                              <input
                                type="checkbox"
                                checked={selectedHireApplicantIds.includes(applicant.id)}
                                onChange={() => toggleHireSelection(applicant.id)}
                                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                aria-label={`Select ${fullName} for hiring`}
                              />
                            </td>
                          )}
                          <td className="px-5 py-4 font-semibold text-blue-600 underline decoration-blue-200 underline-offset-2">
                            <button
                              type="button"
                              className="text-left hover:text-blue-800"
                              onClick={() =>
                                navigate(`/admin/rsp/applicant/${applicant.id}`, {
                                  state: {
                                    from: `${location.pathname}${location.search}`,
                                    applicant,
                                  },
                                })
                              }
                            >
                              {fullName}
                            </button>
                          </td>
                          <td className="px-5 py-4 text-slate-700">{job?.title ?? '--'}</td>
                          <td className="px-5 py-4 text-slate-700">{job?.department ?? '--'}</td>
                          <td className="px-5 py-4 font-semibold text-emerald-600">{totalScore} / 100</td>
                          <td className={`px-5 py-4 font-semibold ${adjectival === 'Excellent' ? 'text-emerald-600' : adjectival === 'Very Good' ? 'text-blue-600' : 'text-slate-700'}`}>
                            {adjectival}
                          </td>
                          <td className={`px-5 py-4 font-semibold ${qualifiedStatus === 'Completed' ? 'text-emerald-600' : 'text-amber-500'}`}>
                            {qualifiedStatus}
                          </td>
                          <td className="px-5 py-4 text-slate-700">{formatPHDate(applicant.applicationDate)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {!isApplicantListView && qualifiedRows.length === 0 && (
                  <tr>
                    <td colSpan={isCompletedHireMode ? 8 : 7} className="px-5 py-8 text-center text-base text-slate-500">No qualified applicants found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredRows.length === 0 && (
            <div className="p-10 text-center text-slate-500">
              <UserCheck className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-2 font-medium">No applicants found with the selected filters.</p>
            </div>
          )}
        </section>
      </main>

      <RecruitmentNavigationGuide open={showGuide} onClose={() => setShowGuide(false)} />

      {activeApplicant && (
        <div className="fixed inset-0 z-[120] bg-slate-900/70 p-4" onClick={closeApplicantDetails}>
          <div className="mx-auto h-[94vh] w-full max-w-[1400px] overflow-hidden rounded-2xl bg-slate-100 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200 bg-slate-100 px-6 py-4">
              <div className="mb-2 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <button className="mt-1 rounded-full p-2 text-slate-500 hover:bg-slate-200" onClick={closeApplicantDetails} aria-label="Back to applicants">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div>
                    <p className="text-sm text-slate-500">Recruitment <span className="px-1">/</span> Applicants <span className="px-1">/</span> <span className="font-semibold text-slate-700">Details</span></p>
                    <h2 className="text-[38px] leading-tight font-semibold text-slate-900">{activeApplicant.personalInfo.firstName} {activeApplicant.personalInfo.lastName}</h2>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const lockDecisionButtons = statusDecisionLocked;
                    return (
                      <>
                  <button className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-base font-medium text-slate-700" onClick={() => setShowMessageDialog(true)}>
                    <Plane className="h-4 w-4" /> Send Message
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-base font-medium text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => handleDisqualifyAction(activeApplicant.id)}
                    disabled={lockDecisionButtons}
                  >
                    <AlertCircle className="h-4 w-4" /> Disqualify
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => handleShortlistAction(activeApplicant.id)}
                    disabled={lockDecisionButtons}
                  >
                    <Star className="h-4 w-4" /> Shortlist
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => handleQualifyAction(activeApplicant.id)}
                    disabled={lockDecisionButtons}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Qualify
                  </button>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="flex items-center gap-6 border-t border-slate-200 pt-3 text-base">
                {[
                  { key: 'Overview', icon: User },
                  { key: 'Documents', icon: FileText },
                  { key: 'Activity', icon: ActivityIcon },
                ].map((tab) => {
                  const TabIcon = tab.icon;
                  return (
                  <button
                    key={tab.key}
                    type="button"
                    className={`border-b-2 pb-2 font-semibold ${activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600'}`}
                    onClick={() => setActiveTab(tab.key as 'Overview' | 'Documents' | 'Activity')}
                  >
                    <span className="inline-flex items-center gap-2"><TabIcon className="h-4 w-4" /> {tab.key}</span>
                  </button>
                  );
                })}
              </div>
            </div>

            <div className="grid h-[calc(94vh-150px)] grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[320px_1fr]">
              <aside className="overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
                <div className="mx-auto mb-4 flex h-32 w-32 items-center justify-center rounded-full bg-blue-600 text-white">
                  <UserCheck className="h-12 w-12" />
                </div>
                <h3 className="text-center text-2xl font-bold text-slate-900">{activeApplicant.personalInfo.firstName} {activeApplicant.personalInfo.lastName}</h3>
                <div className="my-3 text-center">
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_COLORS[activeApplicant.status]}`}>{toStatusDisplayLabel(activeApplicant.status)}</span>
                </div>

                <div className="mt-5 space-y-4 border-t border-slate-200 pt-4 text-base">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application ID</p><p className="font-semibold text-slate-800">{activeApplicant.id}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date Applied</p><p className="font-semibold text-slate-800">{formatPHDate(activeApplicant.applicationDate)}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p><p className="font-semibold text-slate-800">{activeApplicant.personalInfo.email}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</p><p className="font-semibold text-slate-800">{activeApplicant.personalInfo.phone}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p><p className="font-semibold text-slate-800">{activeApplicant.personalInfo.address || jobMap.get(activeApplicant.jobPostingId)?.department || 'N/A'}</p></div>
                </div>
              </aside>

              <section className="overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
                {activeTab === 'Overview' && (
                  <div className="space-y-4">
                    <article className="rounded-xl border border-slate-200">
                      <h4 className="border-b border-slate-200 px-4 py-3 text-lg font-semibold text-slate-900">Personal Information</h4>
                      <div className="grid grid-cols-1 gap-0 px-4 py-1 md:grid-cols-2">
                        <div className="border-b border-slate-100 py-3"><p className="font-semibold text-slate-500">Full Name</p><p className="text-base text-slate-900">{activeApplicant.personalInfo.firstName} {activeApplicant.personalInfo.lastName}</p></div>
                        <div className="border-b border-slate-100 py-3"><p className="font-semibold text-slate-500">Email Address</p><p className="text-base text-slate-900">{activeApplicant.personalInfo.email}</p></div>
                        <div className="border-b border-slate-100 py-3"><p className="font-semibold text-slate-500">Phone Number</p><p className="text-base text-slate-900">{activeApplicant.personalInfo.phone || '--'}</p></div>
                        <div className="border-b border-slate-100 py-3"><p className="font-semibold text-slate-500">Address</p><p className="text-base text-slate-900">{activeApplicant.personalInfo.address || '--'}</p></div>
                        <div className="py-3"><p className="font-semibold text-slate-500">PWD Status</p><p className="text-base text-slate-900">Not Applicable</p></div>
                      </div>
                    </article>

                    <article className="rounded-xl border border-slate-200">
                      <h4 className="border-b border-slate-200 px-4 py-3 text-lg font-semibold text-slate-900">Qualifications</h4>
                      <div className="grid grid-cols-1 gap-0 px-4 py-1 md:grid-cols-2">
                        <div className="border-b border-slate-100 py-3"><p className="font-semibold text-slate-500">Education</p><p className="text-base text-slate-900">BS Information Technology, University of the Philippines</p></div>
                        <div className="border-b border-slate-100 py-3"><p className="font-semibold text-slate-500">Work Experience</p><p className="text-base text-slate-900">3 years as Junior IT Officer</p></div>
                        <div className="py-3"><p className="font-semibold text-slate-500">Application Date</p><p className="text-base text-slate-900">{formatPHDate(activeApplicant.applicationDate)}</p></div>
                      </div>
                    </article>

                    <article className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-lg font-semibold text-slate-900">Internal Notes</h4>
                      </div>
                      <textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Add notes to track internal comments and observations." value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} />
                      <button className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white" onClick={addNote}>Save Note</button>
                    </article>
                  </div>
                )}

                {activeTab === 'Documents' && (
                  <article className="rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <h4 className="text-lg font-semibold text-slate-900">Submitted Documents</h4>
                      <button className="inline-flex items-center gap-2 text-base font-medium text-blue-600" onClick={handleBulkDownload}>
                        <Download className="h-5 w-5" /> Download All
                      </button>
                    </div>
                    <div className="space-y-3 p-4">
                      {attachmentsLoading ? (
                        <p className="text-slate-500">Loading uploaded documents...</p>
                      ) : getModalDocuments().length > 0 ? getModalDocuments().map((doc) => (
                        <article key={`${doc.type}-${doc.url}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                          <div>
                            <p className="text-lg font-semibold text-slate-900">{doc.type}</p>
                            <p className="text-base text-slate-500">Uploaded {formatPHDate((doc as any).uploadedAt || activeApplicant.applicationDate)}</p>
                          </div>
                          <button className="text-base font-semibold text-blue-600" onClick={() => handlePreviewDocument({ type: doc.type, url: doc.url })} disabled={documentActionBusy !== null}>View</button>
                        </article>
                      )) : <p className="text-slate-500">No uploaded documents found for this applicant yet.</p>}
                    </div>
                  </article>
                )}

                {activeTab === 'Activity' && (
                  <article className="rounded-xl border border-slate-200">
                    <h4 className="border-b border-slate-200 px-4 py-3 text-lg font-semibold text-slate-900">Activity Timeline</h4>
                    <div className="space-y-4 p-4">
                      {activeApplicant.timeline.map((entry, index) => (
                        <div key={`${entry.event}-${index}`} className="flex gap-3">
                          <span className="mt-2 h-3 w-3 rounded-full bg-blue-600" />
                          <div>
                            <p className="text-lg font-semibold text-slate-900">{entry.event}</p>
                            <p className="text-base text-slate-500">{formatPHDateTime(entry.date)} • {entry.actor}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {activeApplicant && showMessageDialog && (
        <div className="fixed inset-0 z-[130] bg-slate-900/75 p-4" onClick={() => setShowMessageDialog(false)}>
          <div className="mx-auto flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between bg-blue-600 px-6 py-4 text-white">
              <div>
                <h3 className="text-2xl font-semibold">Send Message to Applicant</h3>
                <p className="text-sm text-blue-100">Notify applicant about their application</p>
              </div>
              <button className="rounded-md p-2 text-blue-100 hover:bg-blue-500" onClick={() => setShowMessageDialog(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-6 py-5">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
                <div><p className="text-xs font-semibold text-slate-500">TO:</p><p className="text-lg font-semibold text-slate-800">{activeApplicant.personalInfo.email}</p></div>
                <div><p className="text-xs font-semibold text-slate-500">APPLICANT NAME:</p><p className="text-lg font-semibold text-slate-800">{activeApplicant.personalInfo.firstName} {activeApplicant.personalInfo.lastName}</p></div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Message Template (Optional)</label>
                <select className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base" value={emailTemplate} onChange={(event) => onTemplateChange(event.target.value as EmailTemplateKey)}>
                  {EMAIL_TEMPLATES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Subject Line *</label>
                <input className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base" placeholder="e.g., Incomplete Requirements for Your Application" value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">Message *</label>
                <textarea className="min-h-40 w-full rounded-lg border border-slate-300 px-3 py-3 text-base" placeholder="Write your message here..." value={emailMessage} onChange={(event) => setEmailMessage(event.target.value)} />
                <p className="mt-1 text-base text-slate-500">Be clear and professional in your communication</p>
              </div>

              <div>
                <h4 className="mb-2 text-lg font-semibold text-slate-800">Applicant Documents Summary</h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <article className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <h5 className="text-lg font-semibold text-green-800">Submitted Documents</h5>
                    {getModalDocuments().length > 0 ? (
                      <ul className="mt-2 list-disc pl-5 text-base text-green-700">
                        {Array.from(new Set(getModalDocuments().map((doc) => doc.type))).map((type) => <li key={type}>{type}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-2 text-base text-slate-600">No uploaded files found</p>
                    )}
                  </article>

                  <article className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <h5 className="text-lg font-semibold text-rose-800">Missing Documents</h5>
                    {REQUIRED_DOCUMENTS.filter((doc) => !getModalDocuments().some((item) => matchesRequiredDocument(item.type, doc))).length === 0 ? (
                      <p className="mt-2 text-base text-green-700">All documents submitted</p>
                    ) : (
                      <ul className="mt-2 list-disc pl-5 text-base text-rose-700">
                        {REQUIRED_DOCUMENTS.filter((doc) => !getModalDocuments().some((item) => matchesRequiredDocument(item.type, doc))).map((doc) => <li key={doc}>{doc}</li>)}
                      </ul>
                    )}
                  </article>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
              <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" onClick={() => setShowMessageDialog(false)}>Cancel</button>
              <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!emailSubject.trim() || !emailMessage.trim()} onClick={() => { setShowMessageDialog(false); setToast('Message sent to applicant'); }}>
                <Plane className="h-5 w-5" /> Send Message
              </button>
            </div>
          </div>
        </div>
      )}

      {activeApplicant && pendingStatusAction && (
        <div className="fixed inset-0 z-[140] bg-slate-900/70 p-4" onClick={cancelPendingStatusAction}>
          <div
            className="mx-auto mt-24 w-full max-w-lg rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`rounded-t-2xl px-6 py-4 text-white ${pendingStatusAction.action === 'qualify' ? 'bg-green-600' : 'bg-rose-600'}`}>
              <h3 className="text-xl font-semibold">Confirm Status Change</h3>
            </div>
            <div className="space-y-3 px-6 py-5 text-slate-700">
              <p className="text-base">
                {pendingStatusAction.action === 'qualify'
                  ? 'Are you sure you want to qualify this applicant?'
                  : 'Are you sure you want to disqualify this applicant?'}
              </p>
              <p className="text-sm text-slate-500">
                This action will update the applicant status and lock the decision buttons.
              </p>
              {pendingStatusAction.action === 'disqualify' && (
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Reason for Disqualification <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={disqualifyReasonDraft}
                    onChange={(event) => setDisqualifyReasonDraft(event.target.value)}
                    placeholder="Enter the reason for disqualifying this applicant..."
                    className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  />
                  {disqualifyReasonDraft.trim().length === 0 && (
                    <p className="mt-1 text-xs text-rose-600">Disqualification reason is required.</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                onClick={cancelPendingStatusAction}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${pendingStatusAction.action === 'qualify' ? 'bg-green-600 hover:bg-green-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                onClick={confirmPendingStatusAction}
                disabled={pendingStatusAction.action === 'disqualify' && disqualifyReasonDraft.trim().length === 0}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>
      )}

      {showHireConfirmModal && (
        <div className="fixed inset-0 z-[145] bg-slate-900/70 p-4" onClick={() => setShowHireConfirmModal(false)}>
          <div
            className="mx-auto mt-24 w-full max-w-lg rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rounded-t-2xl bg-emerald-600 px-6 py-4 text-white">
              <h3 className="text-xl font-semibold">Confirm Hiring</h3>
            </div>
            <div className="space-y-3 px-6 py-5 text-slate-700">
              <p className="text-base">Are you sure you want to hire the selected applicant(s)?</p>
              <p className="text-sm text-slate-500">
                This will mark them as hired and move them to employee onboarding records.
                External applicants will proceed to Newly Hired for credential generation.
              </p>
              {selectedHiringMeta.promotions.length > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  <p className="font-semibold">Promotion Confirmation</p>
                  <p>
                    {selectedHiringMeta.promotions.length} selected applicant(s) match existing employee records.
                    Their current employee profiles will be updated instead of creating new accounts.
                  </p>
                  {selectedHiringMeta.promotions.slice(0, 2).map((entry) => {
                    const oldPosition = entry.internalApplication?.currentPosition || 'Current Position';
                    const newPosition = jobMap.get(entry.jobPostingId)?.title || 'New Position';
                    const fullName = `${entry.personalInfo.firstName} ${entry.personalInfo.lastName}`.trim();
                    return (
                      <p key={entry.id} className="mt-1">
                        {fullName}: {oldPosition} {'->'} {newPosition}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                onClick={() => setShowHireConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void handleConfirmHireApplicants()}
                disabled={selectedHireApplicantIds.length === 0 || !canManageHiring}
              >
                Confirm and Hire
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-6 left-6 flex gap-2">
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" onClick={() => setToast('Email sent to applicant')}>
          <Mail className="mr-1 inline h-4 w-4" /> Send Email
        </button>
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" onClick={() => setToast('Interview schedule reminder sent')}>
          <MessageSquare className="mr-1 inline h-4 w-4" /> Notify
        </button>
      </div>
    </div>
  );
};
