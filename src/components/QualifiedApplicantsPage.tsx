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
import { mockDatabase } from '../lib/mockDatabase';
import {
    ensureRecruitmentSeedData,
    formatPHDate,
    formatPHDateTime,
    getApplicants,
    getAuthoritativeJobPostings,
    saveApplicants,
} from '../lib/recruitmentData';
import { ATTACHMENTS_BUCKET, isMockModeEnabled, supabase } from '../lib/supabase';
import { Applicant, ApplicantStatus, JobPosting } from '../types/recruitment.types';
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

const getPreferredDataSourceMode = (): 'local' | 'supabase' => {
  try {
    const mode = localStorage.getItem('cictrix_data_source_mode');
    return mode === 'local' ? 'local' : 'supabase';
  } catch {
    return 'supabase';
  }
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
  return oralComplete || legacyComplete;
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
    normalized === 'hired' ||
    normalized === 'accepted'
  );
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

  const loadQualifiedApplicantsData = async () => {
    ensureRecruitmentSeedData();

    const canonicalJobs = getAuthoritativeJobPostings();
    const activeCanonicalJobs = canonicalJobs.filter(
      (job) => normalizeText(String(job?.status ?? '')) === 'active'
    );

    if (activeCanonicalJobs.length > 0) {
      setJobs(activeCanonicalJobs);
    }

    const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
    const primaryClient = preferredMode === 'local' ? (mockDatabase as any) : supabase;
    const secondaryClient = preferredMode === 'local' ? supabase : (mockDatabase as any);

    const fetchBundle = async (client: any) =>
      Promise.allSettled([
        client.from('applicants').select('*').order('created_at', { ascending: false }),
        client.from('evaluations').select('*'),
        client.from('applicant_attachments').select('*'),
        client.from('job_postings').select('*').order('created_at', { ascending: false }),
      ]);

    let [applicantsRes, evaluationsRes, attachmentsRes, jobPostingsRes] = await fetchBundle(primaryClient);

    const primaryApplicants =
      applicantsRes.status === 'fulfilled' && !applicantsRes.value.error && Array.isArray(applicantsRes.value.data)
        ? applicantsRes.value.data
        : [];

    if (primaryApplicants.length === 0 && !isMockModeEnabled) {
      [applicantsRes, evaluationsRes, attachmentsRes, jobPostingsRes] = await fetchBundle(secondaryClient);
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

    if (activeCanonicalJobs.length === 0 && dbJobPostings.length > 0) {
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
      const activeMappedJobs = mappedJobs.filter(
        (job) => normalizeText(String(job?.status ?? '')) === 'active'
      );
      setJobs(activeMappedJobs);
    }

    const evaluationMap = new Map<string, EvaluationSnapshot>();
    dbEvaluations.forEach((row: any) => {
      const applicantId = String(row?.applicant_id ?? '').trim();
      if (!applicantId) return;

      const snapshot: EvaluationSnapshot = {
        score: deriveEvaluationPercentage(row),
        completed: hasCompletedEvaluation(row),
        updatedAt: String(row?.created_at ?? row?.updated_at ?? new Date().toISOString()),
      };

      const current = evaluationMap.get(applicantId);
      if (!current || new Date(snapshot.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
        evaluationMap.set(applicantId, snapshot);
      }
    });

    const attachmentMap = new Map<string, any[]>();
    dbAttachments.forEach((row: any) => {
      const applicantId = String(row?.applicant_id ?? '').trim();
      if (!applicantId) return;
      const current = attachmentMap.get(applicantId) ?? [];
      current.push(row);
      attachmentMap.set(applicantId, current);
    });

    const jobsSource: JobPosting[] = activeCanonicalJobs.length > 0
      ? activeCanonicalJobs
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
          }))
          .filter((job: JobPosting) => normalizeText(String(job?.status ?? '')) === 'active');

    const activeTitleSet = new Set(
      jobsSource
        .map((job: JobPosting) => normalizeText(String(job?.title ?? '')))
        .filter(Boolean)
    );

    const mappedApplicants: Applicant[] = dbApplicants
      .filter((row: any) => {
        const position = normalizeText(String(row?.position ?? ''));
        return Boolean(position) && activeTitleSet.has(position);
      })
      .map((row: any) => {
      const applicantId = String(row?.id ?? crypto.randomUUID());
      const position = String(row?.position ?? '');
      const matchedJob = jobsSource.find((job: JobPosting) => normalizeText(job.title) === normalizeText(position));
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
        jobPostingId: matchedJob?.id ?? String(row?.job_posting_id ?? 'unposted'),
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

    const activeJobIdSet = new Set(jobsSource.map((job: JobPosting) => job.id));
    const storedApplicants = getApplicants().filter((row) => activeJobIdSet.has(row.jobPostingId));

    const mergedById = new Map<string, Applicant>();

    // Seed with DB snapshot first.
    mappedApplicants.forEach((row) => {
      mergedById.set(row.id, row);
    });

    // Overlay with recruitment store values so UI stays aligned with job card counts/source-of-truth.
    storedApplicants.forEach((row) => {
      mergedById.set(row.id, row);
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
    if (dedupedApplicants.length > 0) {
      saveApplicants(dedupedApplicants);
    }
  };

  useEffect(() => {
    const run = () => {
      loadQualifiedApplicantsData();
    };

    run();

    const onUpdated = () => run();
    window.addEventListener('focus', onUpdated);
    window.addEventListener('cictrix:applicants-updated', onUpdated as EventListener);
    window.addEventListener('cictrix:job-postings-updated', onUpdated as EventListener);

    if (jobId) setJobFilter(jobId);

    return () => {
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
      if (!jobId && !isJobPostsView) {
        const isQualified = isAdminQualifiedStatus(applicant.status);
        if (!isQualified) return false;
      }

      const matchesSearch =
        !search ||
        `${applicant.personalInfo.firstName} ${applicant.personalInfo.lastName} ${applicant.personalInfo.itemNumber ?? ''} ${applicant.personalInfo.email} ${applicant.id}`
          .toLowerCase()
          .includes(search.toLowerCase());
      const matchesJob = (jobId ? applicant.jobPostingId === jobId : jobFilter === 'all' || applicant.jobPostingId === jobFilter);
      const matchesStatus = isJobPostsView
        ? jobPostsStatusFilter === 'all' || toJobPostsStatusBucket(applicant.status) === jobPostsStatusFilter
        : statusFilter.length === 0 || statusFilter.includes(applicant.status);
      const matchesScore = isJobPostsView ? true : applicant.qualificationScore >= scoreMin;
      const applied = new Date(applicant.applicationDate).getTime();
      const fromOkay = isJobPostsView ? true : (!dateFrom || applied >= new Date(dateFrom).getTime());
      const toOkay = isJobPostsView ? true : (!dateTo || applied <= new Date(dateTo).getTime() + 86400000);
      return matchesSearch && matchesJob && matchesStatus && matchesScore && fromOkay && toOkay;
    });

    const sorted = [...rows];
    sorted.sort((left, right) => {
      if (isJobPostsView) {
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
  }, [applicants, search, jobId, jobFilter, statusFilter, jobPostsStatusFilter, scoreMin, dateFrom, dateTo, sortBy, isJobPostsView]);

  const getQualifiedStatus = (status: ApplicantStatus): 'Completed' | 'Pending' => {
    const normalized = normalizeText(status);
    if (
      normalized.includes('recommend') ||
      normalized.includes('qualified') ||
      normalized.includes('hired') ||
      normalized.includes('accepted') ||
      normalized.includes('completed')
    ) {
      return 'Completed';
    }
    return 'Pending';
  };

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
      const isQualified = isAdminQualifiedStatus(applicant.status) || getQualifiedStatus(applicant.status) === 'Completed';
      return isQualified;
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
      const status = getQualifiedStatus(applicant.status);
      const matchesTab = qualifiedTab === 'all' || status.toLowerCase() === qualifiedTab;
      return matchesSearch && matchesPosition && matchesOffice && matchesTab;
    });

    return rows.sort((a, b) => new Date(b.applicationDate).getTime() - new Date(a.applicationDate).getTime());
  }, [qualifiedBaseRows, jobMap, qualifiedOffice, qualifiedPosition, qualifiedTab, search]);

  const qualifiedTabCounts = useMemo(() => {
    let completed = 0;
    let pending = 0;

    qualifiedBaseRows.forEach((applicant) => {
      if (getQualifiedStatus(applicant.status) === 'Completed') completed += 1;
      else pending += 1;
    });

    return {
      all: qualifiedBaseRows.length,
      completed,
      pending,
    };
  }, [qualifiedBaseRows]);

  const updateApplicantStatus = (ids: string[], nextStatus: ApplicantStatus) => {
    const timestamp = new Date().toISOString();
    const nextApplicants = applicants.map((applicant) => {
      if (!ids.includes(applicant.id)) return applicant;
      return {
        ...applicant,
        status: nextStatus,
        timeline: [...applicant.timeline, { event: `Status Updated: ${nextStatus}`, date: timestamp, actor: 'HR Admin' }],
      };
    });
    setApplicants(nextApplicants);
    saveApplicants(nextApplicants);
    window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
    if (activeApplicant && ids.includes(activeApplicant.id)) {
      const updated = nextApplicants.find((item) => item.id === activeApplicant.id) ?? null;
      setActiveApplicant(updated);
    }
    setToast(`Status updated to ${nextStatus}.`);
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
            notes: [{ author: 'HR Admin', content: noteDraft.trim(), date: now, pinned: false }, ...applicant.notes],
            timeline: [...applicant.timeline, { event: 'Note Added', date: now, actor: 'HR Admin' }],
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
            <h1 className={`${isJobPostsView ? 'text-2xl' : 'text-3xl'} font-bold text-slate-900`}>{isJobPostsView ? 'Job Posts' : 'Qualified Applicants'}</h1>
          </div>
          {!isJobPostsView && (
            <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700" onClick={() => setShowGuide(true)}>
              How to Navigate
            </button>
          )}
        </header>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          {isJobPostsView ? (
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
            </>
          )}
        </section>

        {isJobPostsView && (
          <p className="mt-4 text-base text-slate-700">
            Showing <span className="font-semibold text-slate-900">{filteredRows.length}</span> applicants
          </p>
        )}

        <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {isJobPostsView && (
            <div className="border-b border-slate-200 px-5 py-3 text-base text-slate-700">
              Showing <span className="font-semibold text-slate-900">{filteredRows.length}</span> applicants
            </div>
          )}
          <div className="overflow-x-auto">
            <table className={`min-w-full text-left ${isJobPostsView ? 'text-sm' : 'text-sm'}`}>
              <thead className={isJobPostsView ? 'bg-slate-50 text-sm uppercase tracking-wide text-slate-700' : 'bg-slate-100 text-xs uppercase tracking-wide text-slate-500'}>
                <tr>
                  {isJobPostsView ? (
                    <>
                      <th className="px-5 py-4">Applicant Name</th>
                      <th className="px-5 py-4">Contact Info</th>
                      <th className="px-5 py-4">Date Submitted</th>
                      <th className="px-5 py-4">Status</th>
                    </>
                  ) : (
                    <>
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
                {(isJobPostsView ? filteredRows : qualifiedRows).map((applicant) => {
                  const fullName = `${applicant.personalInfo.firstName} ${applicant.personalInfo.lastName}`;
                  const job = jobMap.get(applicant.jobPostingId);
                  const totalScore = Math.round(applicant.qualificationScore || 0);
                  const adjectival = getAdjectivalRating(totalScore);
                  const qualifiedStatus = getQualifiedStatus(applicant.status);
                  return (
                    <tr
                      key={applicant.id}
                      className={isJobPostsView ? 'border-t border-slate-200 hover:bg-slate-50' : 'border-t border-slate-100 hover:bg-slate-50'}
                    >
                      {isJobPostsView ? (
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
                {!isJobPostsView && qualifiedRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-base text-slate-500">No qualified applicants found.</td>
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
                  <button className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-base font-medium text-slate-700" onClick={() => setShowMessageDialog(true)}>
                    <Plane className="h-4 w-4" /> Send Message
                  </button>
                  <button className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-base font-medium text-rose-600" onClick={() => updateApplicantStatus([activeApplicant.id], 'Not Qualified')}>
                    <AlertCircle className="h-4 w-4" /> Disqualify
                  </button>
                  <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-base font-semibold text-white" onClick={() => updateApplicantStatus([activeApplicant.id], 'Shortlisted')}>
                    <Star className="h-4 w-4" /> Shortlist
                  </button>
                  <button className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-base font-semibold text-white" onClick={() => updateApplicantStatus([activeApplicant.id], 'Recommended for Hiring')}>
                    <CheckCircle2 className="h-4 w-4" /> Qualify
                  </button>
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
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_COLORS[activeApplicant.status]}`}>{activeApplicant.status}</span>
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

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>
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
