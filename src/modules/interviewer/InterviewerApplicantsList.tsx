import {
    AlertCircle,
    ArrowLeft,
    CheckCircle2,
    CircleAlert,
    Download,
    FileText,
    Loader2,
    Plane,
    User,
    Users,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBackClosesView, useHistoryBack } from '../../hooks/useHistoryBack';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { ActionFeedback, useFeedback } from '../../components/action-feedback';
import { POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import { getPreferredDataSourceMode } from '../../lib/dataSourceMode';
import { isPositionAssignedToInterviewer, resolveAssignedPositionsForInterviewer } from '../../lib/interviewerAccess';
import { getApplicantType, storeApplicantTypeForEval } from '../../lib/interviewerEvalNavigation';
import { sendEmail } from '../../lib/email';
import { describeActionFailure } from '../../lib/friendlyErrors';
import { mockDatabase } from '../../lib/mockDatabase';
import { ensureRecruitmentSeedData, getAuthoritativeJobPostings, getApplicants as getRecruitmentApplicants } from '../../lib/recruitmentData';
import { ATTACHMENTS_BUCKET, isMockModeEnabled, supabase } from '../../lib/supabase';
import { fetchAndDecryptApplicantAttachment, downloadApplicantAttachment } from '../../lib/applicantDocuments';
import '../../styles/interviewer.css';
import '../../styles/abyan-tokens.css';
import '../../styles/interviewer-dashboard.css';
import { EvalStatusBadge, Pager, SearchField, SelectField } from './InterviewerDashboardParts';
import { InterviewerNavBar, type InterviewerNavSession } from './InterviewerNavBar';
import { formatDate as formatDateDI, paginate, toLocalKey } from './interviewerDashboardModel';
import { getLocalSchedule, isScheduledForInterview } from '../../lib/applicantSchedule';

const APPLICANTS_PAGE_SIZE = 8;
const TYPE_OPTIONS = [
  { value: 'all', label: 'Type: All' },
  { value: 'original', label: 'Original' },
  { value: 'promotional', label: 'Promotional' },
];
const APPLICANT_STATUS_OPTIONS = [
  { value: 'all', label: 'Status: All' },
  { value: 'to-evaluate', label: 'To evaluate' },
  { value: 'evaluated', label: 'Completed' },
];

interface Applicant {
  id: string;
  item_number: string;
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
  application_type?: string | null;
  employee_id?: string | null;
}


interface ApplicantAttachment {
  id: string;
  file_name: string;
  file_path: string;
  document_type?: string;
  created_at?: string;
}

interface JobPosting {
  title: string;
  office: string;
  department: string;
}

type ApplicantDetailsTab = 'overview' | 'scores' | 'documents' | 'activity';

interface InterviewerEvaluationFields {
  personality_score?: number | null;
  job_knowledge_score?: number | null;
  overall_impression_score?: number | null;
  communication_skills_score?: number | null;
  confidence_score?: number | null;
  comprehension_score?: number | null;
  personality_remarks?: string | null;
  job_knowledge_remarks?: string | null;
  overall_impression_remarks?: string | null;
  communication_skills_remarks?: string | null;
  confidence_remarks?: string | null;
  comprehension_remarks?: string | null;
  interview_notes?: string | null;
  recommendation?: string | null;
  interviewer_name?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}
type EmailTemplate = 'none' | 'missing_documents' | 'incorrect_format' | 'invalid_information' | 'schedule_interview' | 'custom';
const INTERVIEWER_SCORE_SNAPSHOT_STORAGE_KEY = 'cictrix_interviewer_score_snapshot';

const REQUIRED_DOCUMENTS = ['Resume', 'Application Letter', 'Transcript of Records', 'Certifications'];

const EMAIL_TEMPLATES: Array<{
  value: EmailTemplate;
  label: string;
  subject: string;
  message: string;
}> = [
  {
    value: 'none',
    label: 'Select a template...',
    subject: '',
    message: '',
  },
  {
    value: 'missing_documents',
    label: 'Missing Documents',
    subject: 'Incomplete Requirements for Your Application',
    message:
      'Dear Applicant,\n\nThank you for your submission. We noticed that one or more required documents are missing from your application. Please submit the missing files at your earliest convenience so we can proceed with your evaluation.\n\nRegards,\nRecruitment Team',
  },
  {
    value: 'incorrect_format',
    label: 'Incorrect File Format',
    subject: 'Please Re-upload Your Documents in the Correct Format',
    message:
      'Dear Applicant,\n\nSome of your uploaded files are in an unsupported format. Kindly re-upload the required documents using PDF format to avoid delays in processing.\n\nRegards,\nRecruitment Team',
  },
  {
    value: 'invalid_information',
    label: 'Invalid Information',
    subject: 'Clarification Needed for Submitted Information',
    message:
      'Dear Applicant,\n\nWe found information in your application that requires clarification. Please reply to this email with the corrected details so we can continue your application process.\n\nRegards,\nRecruitment Team',
  },
  {
    value: 'schedule_interview',
    label: 'Schedule Interview',
    subject: 'Interview Schedule for Your Application',
    message:
      'Dear Applicant,\n\nYou are invited for an interview as part of our hiring process. Please confirm your availability by replying to this email.\n\nRegards,\nRecruitment Team',
  },
  {
    value: 'custom',
    label: 'Custom Message',
    subject: '',
    message: '',
  },
];

// Demo rows are recognised by their mock- id. An email domain says nothing:
// real, scheduled applicants can use @example.com addresses.
const isDemoApplicant = (applicant: any): boolean =>
  String(applicant?.id || '').toLowerCase().startsWith('mock-');

const buildEvaluationStatusMap = (evaluations: any[] = []) => {
  const evaluationMap = new Map<string, 'Completed' | 'In Progress'>();

  evaluations.forEach((e: any) => {
    const applicantId = String(e?.applicant_id ?? '').trim();
    if (!applicantId) return;

    const hasSubmittedEvaluation =
      String(e?.interview_notes ?? '').trim().length > 0 ||
      String(e?.recommendation ?? '').trim().length > 0 ||
      typeof e?.overall_impression_score === 'number' ||
      typeof e?.overall_score === 'number' ||
      typeof e?.technical_score === 'number' ||
      typeof e?.communication_score === 'number';

    // Check for oral scores: at least ONE must be > 0 (not ALL)
    // This handles both complete oral evals AND partial PCPT-only evals
    const hasAnyOralScore = [
      e.communication_skills_score,
      e.confidence_score,
      e.comprehension_score,
      e.personality_score,
      e.job_knowledge_score,
      e.overall_impression_score
    ].some((value) => typeof value === 'number' && value > 0);

    const hasLegacyScores = [
      e.technical_score,
      e.communication_score,
      e.overall_score
    ].every((value) => typeof value === 'number' && value > 0);

    // Evaluation is complete if: has ANY scores OR has notes/recommendation
    const isComplete = hasSubmittedEvaluation || hasAnyOralScore || hasLegacyScores;
    const current = evaluationMap.get(applicantId);

    if (isComplete || !current) {
      evaluationMap.set(applicantId, isComplete ? 'Completed' : 'In Progress');
    }
  });

  return evaluationMap;
};


const getFullName = (applicant: Applicant): string => {
  const parts = [applicant.first_name];
  if (applicant.middle_name) {
    parts.push(applicant.middle_name);
  }
  parts.push(applicant.last_name);
  return parts.join(' ');
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getApplicantStatusBadgeClass = (status: string): string => {
  const value = status.toLowerCase();
  if (value.includes('qualif') || value.includes('recommend') || value.includes('hired')) return 'status-qualified';
  if (value.includes('shortlist')) return 'status-shortlisted';
  if (value.includes('review')) return 'status-reviewed';
  return 'status-pending';
};

const normalizeDocumentName = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const inferDocumentType = (attachment: ApplicantAttachment): string => {
  const source = normalizeDocumentName(`${attachment.document_type || ''} ${attachment.file_name || ''}`);
  if (source.includes('resume') || source.includes('cv')) return 'Resume';
  if (source.includes('application') && source.includes('letter')) return 'Application Letter';
  if (source.includes('transcript')) return 'Transcript of Records';
  if (source.includes('cert')) return 'Certifications';
  return attachment.document_type || attachment.file_name || 'Document';
};

const getSubmittedDocumentTypes = (attachments: ApplicantAttachment[]): string[] => {
  return Array.from(new Set(attachments.map(inferDocumentType)));
};

const toDocumentUrl = async (filePath: string): Promise<string | null> => {
  if (!filePath) return null;
  try {
    const { objectUrl, cleanup } = await fetchAndDecryptApplicantAttachment(filePath);
    setTimeout(() => cleanup(), 60000);
    return objectUrl;
  } catch (err) {
    console.error('Failed to decrypt attachment:', err);
  }
  if (filePath.startsWith('http') || filePath.startsWith('data:') || filePath.startsWith('blob:')) return filePath;
  if (isMockModeEnabled) return filePath;

  const signed = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(filePath, 300);
  return signed.data?.signedUrl ?? null;
};

const fetchApplicantsByPosition = async (client: any, position: string): Promise<any[]> => {
  const normalizedTarget = normalizeText(position);

  const { data } = await client
    .from('applicants')
    .select('*')
    .order('created_at', { ascending: false });

  const rows = Array.isArray(data) ? data : [];
  // Everyone who applied is not everyone the interviewer evaluates: only the
  // scheduled ones belong here, and the dashboard counts the same set.
  return rows.filter(
    (row: any) =>
      normalizeText(String(row?.position ?? '')) === normalizedTarget && isScheduledForInterview(row),
  );
};

const fetchEvaluations = async (client: any): Promise<any[]> => {
  const { data } = await client.from('evaluations').select('*');
  return data || [];
};

const mergeEvaluations = (sources: any[][]): any[] => {
  const byKey = new Map<string, any>();

  sources.forEach((rows) => {
    rows.forEach((row: any) => {
      const key = String(row?.id ?? row?.applicant_id ?? '').trim();
      if (!key) return;

      const current = byKey.get(key);
      if (!current) {
        byKey.set(key, row);
        return;
      }

      const currentUpdated = new Date(current?.updated_at ?? current?.created_at ?? 0).getTime();
      const incomingUpdated = new Date(row?.updated_at ?? row?.created_at ?? 0).getTime();
      if (Number.isNaN(currentUpdated) || incomingUpdated >= currentUpdated) {
        byKey.set(key, row);
      }
    });
  });

  return Array.from(byKey.values());
};

const readInterviewerScoreSnapshot = () => {
  try {
    const raw = localStorage.getItem(INTERVIEWER_SCORE_SNAPSHOT_STORAGE_KEY);
    if (!raw) return {} as Record<string, { pcptAverage?: number; oralAverage?: number }>;
    const parsed = JSON.parse(raw) as Record<string, { pcptAverage?: number; oralAverage?: number }>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {} as Record<string, { pcptAverage?: number; oralAverage?: number }>;
  }
};

const hasSnapshotEvaluation = (snapshotMap: Record<string, { pcptAverage?: number; oralAverage?: number }>, applicant: any) => {
  const idKey = `id:${String(applicant?.id ?? '').trim()}`;
  const emailKey = `email:${String(applicant?.email ?? '').trim().toLowerCase()}`;
  const scoreSnapshot = snapshotMap[idKey] || snapshotMap[emailKey];
  if (!scoreSnapshot) return false;

  const hasPcpt = typeof scoreSnapshot.pcptAverage === 'number' && scoreSnapshot.pcptAverage > 0;
  const hasOral = typeof scoreSnapshot.oralAverage === 'number' && scoreSnapshot.oralAverage > 0;
  return hasPcpt || hasOral;
};

const buildFallbackApplicantsFromRecruitmentStore = (jobTitle: string): any[] => {
  const postingById = new Map(
    getAuthoritativeJobPostings().map((posting) => [String(posting.id), String(posting.title || '')])
  );

  const normalizedTarget = normalizeText(jobTitle);
  const fallbackRows = getRecruitmentApplicants();

  return fallbackRows
    .filter((row: any) => {
      const mappedTitle = postingById.get(String(row?.jobPostingId ?? '')) || '';
      return normalizeText(mappedTitle) === normalizedTarget;
    })
    .map((row: any) => ({
      id: String(row?.id ?? crypto.randomUUID()),
      item_number: String(row?.personalInfo?.itemNumber ?? ''),
      first_name: String(row?.personalInfo?.firstName ?? ''),
      middle_name: null,
      last_name: String(row?.personalInfo?.lastName ?? ''),
      email: String(row?.personalInfo?.email ?? ''),
      position: jobTitle,
      office: String(postingById.get(String(row?.jobPostingId ?? '')) ? POSITION_TO_DEPARTMENT_MAP[jobTitle] || '' : ''),
      contact_number: String(row?.personalInfo?.phone ?? ''),
      status: String(row?.status ?? 'Pending'),
      created_at: String(row?.applicationDate ?? new Date().toISOString()),
      // The local store has no schedule of its own; getLocalSchedule holds
      // what RSP set while offline. Without this the fallback would hand back
      // unscheduled applicants and undo the filter above it.
      interview_date:
        row?.interview_date ?? getLocalSchedule(String(row?.id ?? ''))?.interview_date ?? null,
      evaluation_status: 'Not Yet Rated',
    }))
    .filter(isScheduledForInterview);
};

const normalizeText = (value: string) => value.trim().toLowerCase();

/**
 * Merge the same applicant arriving from two sources, without merging two
 * people.
 *
 * `item_number` used to be the first identity key, but it names the plantilla
 * the applicant is competing for, not the applicant — `EvaluationForm` reads
 * it as `plantillaNameFor(applicant.item_number)`. Six candidates for one
 * plantilla therefore collapsed into a single row, which is why a posting
 * counting 6 opened onto a list of 1.
 */
export const dedupeApplicants = (rows: Applicant[]): Applicant[] => {
  const unique = new Map<string, Applicant>();

  rows.forEach((row) => {
    const id = String(row.id || '').trim();
    const email = normalizeText(String(row.email || ''));
    const position = normalizeText(String(row.position || ''));
    const fullName = normalizeText(`${row.first_name || ''} ${row.middle_name || ''} ${row.last_name || ''}`);

    // The row's own id first; then the person, never the plantilla.
    const identityKey = id
      ? `id:${id}`
      : email
        ? `email:${email}|pos:${position}`
        : `name:${fullName}|pos:${position}`;

    const existing = unique.get(identityKey);
    if (!existing) {
      unique.set(identityKey, row);
      return;
    }

    const existingTime = new Date(existing.created_at).getTime();
    const incomingTime = new Date(row.created_at).getTime();
    if (incomingTime >= existingTime) {
      unique.set(identityKey, row);
    }
  });

  return Array.from(unique.values());
};

export function InterviewerApplicantsList({
  session,
  onLogout,
}: {
  session?: InterviewerNavSession | null;
  onLogout?: () => void;
} = {}) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchParams] = useSearchParams();
  const jobTitle = searchParams.get('position') || 'N/A';
  
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'to-evaluate' | 'evaluated'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'original' | 'promotional'>('all');
  const [jobDetails, setJobDetails] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeApplicant, setActiveApplicant] = useState<Applicant | null>(null);
  const [activeTab, setActiveTab] = useState<ApplicantDetailsTab>('overview');
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [attachmentsByApplicant, setAttachmentsByApplicant] = useState<Record<string, ApplicantAttachment[]>>({});
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate>('none');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<{ message: string; nextStep: string } | null>(null);
  const { success: notifySuccess } = useFeedback();

  const handleSendApplicantEmail = async () => {
    if (!activeApplicant) {
      setEmailError({ message: 'No applicant is selected.', nextStep: 'Close this dialog and choose an applicant.' });
      return;
    }
    const recipient = String(activeApplicant.email ?? '').trim();
    if (!recipient) {
      setEmailError({
        message: 'This applicant has no email address on file.',
        nextStep: 'Ask RSP to add an email address, then try again.',
      });
      return;
    }

    setEmailSending(true);
    setEmailError(null);

    try {
      await sendEmail({
        to: recipient,
        subject: emailSubject.trim(),
        body: emailMessage,
        applicantId: activeApplicant.id,
      });
      setShowMessageDialog(false);
      setEmailSubject('');
      setEmailMessage('');
      notifySuccess('Message sent', `The email is on its way to ${recipient}.`);
    } catch (error) {
      const described = describeActionFailure('send this message', error);
      setEmailError({ message: described.message, nextStep: described.nextStep });
    } finally {
      setEmailSending(false);
    }
  };
  const [internalNotesByApplicant, setInternalNotesByApplicant] = useState<Record<string, string>>({});
  const [, setAssignedPositions] = useState<string[]>([]);
  const [evaluationsByApplicant, setEvaluationsByApplicant] = useState<Record<string, InterviewerEvaluationFields[]>>({});

  useEffect(() => {
    const syncJobs = (silent = false) => {
      if (jobTitle && jobTitle !== 'N/A') {
        void fetchApplicantsAndJob(silent);
      } else {
        setLoading(false);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === 'cictrix_rater_assigned_positions' ||
        event.key === 'cictrix_job_postings' ||
        event.key === 'cictrix_authoritative_job_postings'
      ) {
        syncJobs(true);
      }
    };

    syncJobs(false);
    
    const handleFocus = () => syncJobs(true);

    window.addEventListener('focus', handleFocus);
    window.addEventListener('cictrix:job-postings-updated', handleFocus as EventListener);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('cictrix:job-postings-updated', handleFocus as EventListener);
      window.removeEventListener('storage', onStorage);
    };
    // Loader is re-created each render and is not an input; refetch only when the job changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobTitle]);

  useRealtimeRefresh({
    channel: `interviewer-applicants-${jobTitle}`,
    tables: ['applicants', 'evaluations'],
    // The realtime hook keeps the latest callback in a ref; the loader is not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    onChange: useCallback(() => { void fetchApplicantsAndJob(true); }, [jobTitle]),
  });

  const fetchApplicantsAndJob = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const { positions } = await resolveAssignedPositionsForInterviewer();
      setAssignedPositions(positions);

      if (!isPositionAssignedToInterviewer(jobTitle, positions)) {
        setApplicants([]);
        setJobDetails(null);
        setError(
          positions.length === 0
            ? 'No job positions are assigned to your interviewer account yet.'
            : 'You do not have access to this job position.'
        );
        return;
      }

      ensureRecruitmentSeedData();
      const matchingPosting = getAuthoritativeJobPostings().find((row) =>
        normalizeText(String(row?.title ?? '')) === normalizeText(jobTitle)
      );

      let resolvedJobDetails: JobPosting = {
        title: String(matchingPosting?.title || jobTitle),
        office: String(matchingPosting?.department || POSITION_TO_DEPARTMENT_MAP[jobTitle] || 'N/A'),
        department: String(matchingPosting?.department || POSITION_TO_DEPARTMENT_MAP[jobTitle] || 'N/A')
      };

      const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
      const primaryClient = preferredMode === 'local' ? (mockDatabase as any) : supabase;
      const secondaryClient = preferredMode === 'local' ? supabase : (mockDatabase as any);

      let applicantsByPosition: any[] = [];
      let allEvaluations: any[] = [];

      try {
        applicantsByPosition = await fetchApplicantsByPosition(primaryClient, jobTitle);
      } catch (primaryErr) {
        console.warn('Primary applicants source failed:', primaryErr);
      }

      const [primaryEvaluationsResult, secondaryEvaluationsResult] = await Promise.allSettled([
        fetchEvaluations(primaryClient),
        fetchEvaluations(secondaryClient),
      ]);

      allEvaluations = mergeEvaluations([
        primaryEvaluationsResult.status === 'fulfilled' ? primaryEvaluationsResult.value : [],
        secondaryEvaluationsResult.status === 'fulfilled' ? secondaryEvaluationsResult.value : [],
      ]);

      if ((!applicantsByPosition || applicantsByPosition.length === 0) && !isMockModeEnabled) {
        try {
          applicantsByPosition = await fetchApplicantsByPosition(secondaryClient, jobTitle);
        } catch (secondaryErr) {
          console.warn('Secondary applicants source failed:', secondaryErr);
        }
      }

      if (!applicantsByPosition || applicantsByPosition.length === 0) {
        applicantsByPosition = buildFallbackApplicantsFromRecruitmentStore(jobTitle);
      }

      const evaluationMap = buildEvaluationStatusMap(allEvaluations);
      const interviewerScoreSnapshot = readInterviewerScoreSnapshot();
      
      // Store evaluations by applicant for scores tab
      const evalByApplicant: Record<string, InterviewerEvaluationFields[]> = {};
      allEvaluations.forEach((evaluation: any) => {
        if (evaluation.applicant_id) {
          if (!evalByApplicant[evaluation.applicant_id]) {
            evalByApplicant[evaluation.applicant_id] = [];
          }
          evalByApplicant[evaluation.applicant_id].push(evaluation);
        }
      });
      setEvaluationsByApplicant(evalByApplicant);
      const applicantsWithStatus = dedupeApplicants(
        Array.from(applicantsByPosition || [])
        .filter((applicant: any) => !isDemoApplicant(applicant))
        .map((applicant: any) => ({
          ...applicant,
          evaluation_status:
            evaluationMap.get(applicant.id) ||
            (hasSnapshotEvaluation(interviewerScoreSnapshot, applicant)
              ? 'Completed'
              : 'Not Yet Rated')
        }))
      )
        .sort(
          (a: Applicant, b: Applicant) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

      if (applicantsWithStatus.length > 0) {
        const office = applicantsWithStatus[0].office || POSITION_TO_DEPARTMENT_MAP[jobTitle] || 'N/A';
        resolvedJobDetails = {
          title: jobTitle,
          office,
          department: office
        };
      }

      setApplicants(applicantsWithStatus);
      setActiveApplicant((prev) => prev ? applicantsWithStatus.find((a) => a.id === prev.id) ?? prev : prev);
      setJobDetails(resolvedJobDetails);
    } catch (err) {
      const described = describeActionFailure('load the applicants', err);
      setError(described.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttachments = async (applicantId: string): Promise<ApplicantAttachment[]> => {
    const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
    const primaryClient = preferredMode === 'local' ? (mockDatabase as any) : supabase;
    const secondaryClient = preferredMode === 'local' ? supabase : (mockDatabase as any);

    const runFetch = async (client: any) => {
      const res = await client
        .from('applicant_attachments')
        .select('*')
        .eq('applicant_id', applicantId)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      return (res.data || []) as ApplicantAttachment[];
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
    setActiveTab('overview');
    setShowMessageDialog(false);
    setEmailTemplate('none');
    setEmailSubject('');
    setEmailMessage('');

    if (attachmentsByApplicant[applicant.id]) return;

    setIsLoadingAttachments(true);
    const rows = await fetchAttachments(applicant.id);
    setAttachmentsByApplicant((prev) => ({ ...prev, [applicant.id]: rows }));
    setIsLoadingAttachments(false);
  };

  const closeApplicantDetails = () => {
    setShowMessageDialog(false);
    setActiveApplicant(null);
    setActiveTab('overview');
  };

  const updateApplicantStatus = async (applicantId: string, status: string) => {
    setApplicants((prev) => prev.map((row) => (row.id === applicantId ? { ...row, status } : row)));
    setActiveApplicant((prev) => (prev && prev.id === applicantId ? { ...prev, status } : prev));
    window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));

    const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
    const primaryClient = preferredMode === 'local' ? (mockDatabase as any) : supabase;
    const secondaryClient = preferredMode === 'local' ? supabase : (mockDatabase as any);

    const persist = async (client: any) => {
      await client.from('applicants').update({ status }).eq('id', applicantId);
    };

    try {
      await persist(primaryClient);
    } catch {
      try {
        await persist(secondaryClient);
      } catch { /* Both data sources failed; the status change stays local and is not surfaced. */ }
    }
  };

  const handleTemplateChange = (value: EmailTemplate) => {
    setEmailTemplate(value);
    const selected = EMAIL_TEMPLATES.find((item) => item.value === value);
    if (!selected) return;
    setEmailSubject(selected.subject);
    setEmailMessage(selected.message);
  };

  const handlePreviewDocument = async (attachment: ApplicantAttachment) => {
    const url = await toDocumentUrl(attachment.file_path);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadAllDocuments = async (attachments: ApplicantAttachment[]) => {
    for (const attachment of attachments) {
      try {
        await downloadApplicantAttachment(attachment.file_path, attachment.file_name || 'document');
        continue;
      } catch {
        // Fall back to direct link download below
      }
      const url = await toDocumentUrl(attachment.file_path);
      if (!url) continue;
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.file_name || 'document';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    }
  };

  const filteredApplicants = applicants.filter((applicant) => {
    const term = searchTerm.trim().toLowerCase();
    const fullName = getFullName(applicant).toLowerCase();
    const matchesSearch =
      !term ||
      fullName.includes(term) ||
      applicant.email.toLowerCase().includes(term) ||
      (applicant.contact_number || '').toLowerCase().includes(term);

    if (!matchesSearch) return false;

    if (typeFilter !== 'all') {
      const applicantType = getApplicantType(applicant).toLowerCase();
      if (typeFilter === 'original' && applicantType !== 'original') return false;
      if (typeFilter === 'promotional' && applicantType !== 'promotional') return false;
    }

    if (statusFilter === 'all') return true;
    const isEvaluated = applicant.evaluation_status === 'Completed';
    if (statusFilter === 'evaluated') return isEvaluated;
    return !isEvaluated; // 'to-evaluate'
  });

  const activeAttachments = activeApplicant ? attachmentsByApplicant[activeApplicant.id] || [] : [];
  const submittedDocumentTypes = getSubmittedDocumentTypes(activeAttachments);
  const missingDocumentTypes = REQUIRED_DOCUMENTS.filter((item) => !submittedDocumentTypes.includes(item));

  const activityEntries = activeApplicant
    ? [
        {
          title: 'Application Submitted',
          subtitle: `${formatDateTime(activeApplicant.created_at)} • ${getFullName(activeApplicant)}`,
        },
        {
          title: 'Application Received',
          subtitle: `${formatDateTime(activeApplicant.created_at)} • System`,
        },
        {
          title: 'Documents Uploaded',
          subtitle: `${activeAttachments.length} file(s) submitted`,
        },
      ]
    : [];

  // Back returns to the page the user came from (dashboard, history modal…),
  // and the browser's Back closes the details / message pop-ups first.
  const goBack = useHistoryBack('/interviewer/dashboard');
  useBackClosesView(Boolean(activeApplicant), () => closeApplicantDetails(), 'applicant');
  useBackClosesView(showMessageDialog, () => setShowMessageDialog(false), 'applicant-message');

  useEffect(() => { setPage(1); }, [searchTerm, typeFilter, statusFilter]);
  const { current: currentPage, pageItems } = paginate(filteredApplicants, page, APPLICANTS_PAGE_SIZE);

  const office = jobDetails?.office || '';
  const department = jobDetails?.department || '';
  const hasActiveFilters = searchTerm.trim() !== '' || typeFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setStatusFilter('all');
  };

  const today = new Date();
  const formattedDate = formatDateDI(toLocalKey(today));

  return (
    <>
      <div className="abyan-ds ivd">
        <InterviewerNavBar session={session} onLogout={onLogout} />

        {/* ── Compact hero: back, breadcrumb, position title ── */}
        <header className="ivd-hero ivd-hero--compact">
          <div className="ivd-container">
            <div className="ivd-page-head">
              <button type="button" className="ivd-back" onClick={goBack} aria-label="Back" title="Back">
                <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <div className="ivd-page-head-text">
                <nav aria-label="Breadcrumb" className="ivd-breadcrumb text-caption">
                  <button type="button" onClick={() => navigate('/interviewer/dashboard')}>Dashboard</button>
                  {office && (<><span aria-hidden="true">/</span><span>{office}</span></>)}
                  <span aria-hidden="true">/</span>
                  <span aria-current="page">{jobTitle}</span>
                </nav>
                <h1 className="text-title-l">{jobTitle || 'Job Position'}</h1>
                <p className="text-body-l">
                  {[office, department && department !== office ? department : '', formattedDate].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="ivd-container ivd-main ivd-main--compact">
          {/* ── Filters & search (§9.4) ── */}
          <section className="ivd-card ivd-filters" aria-labelledby="ial-filters-label">
            <p id="ial-filters-label" className="ivd-filters-label text-caps">Filters &amp; search</p>
            <div className="ivd-toolbar">
              <SearchField
                value={searchTerm}
                onChange={setSearchTerm}
                label="Search applicants by name, email, or contact number"
                placeholder="Search applicants by name, email, or contact number…"
              />
              <SelectField
                value={typeFilter}
                onChange={(value) => setTypeFilter(value as 'all' | 'original' | 'promotional')}
                label="Applicant type"
                options={TYPE_OPTIONS}
              />
              <SelectField
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as 'all' | 'to-evaluate' | 'evaluated')}
                label="Status"
                options={APPLICANT_STATUS_OPTIONS}
              />
            </div>

            {hasActiveFilters && (
              <div className="ivd-chips" aria-live="polite">
                {searchTerm.trim() && (
                  <span className="ivd-chip">
                    Search: <strong>“{searchTerm.trim()}”</strong>
                    <button type="button" onClick={() => setSearchTerm('')} aria-label="Remove search filter">
                      <X size={14} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </span>
                )}
                {typeFilter !== 'all' && (
                  <span className="ivd-chip">
                    Type: <strong>{typeFilter === 'original' ? 'Original' : 'Promotional'}</strong>
                    <button type="button" onClick={() => setTypeFilter('all')} aria-label="Remove type filter">
                      <X size={14} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </span>
                )}
                {statusFilter !== 'all' && (
                  <span className="ivd-chip">
                    Status: <strong>{statusFilter === 'evaluated' ? 'Completed' : 'To evaluate'}</strong>
                    <button type="button" onClick={() => setStatusFilter('all')} aria-label="Remove status filter">
                      <X size={14} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </span>
                )}
                <button type="button" className="ivd-link" onClick={clearFilters}>Clear all</button>
              </div>
            )}
          </section>

          {/* ── Applicants (§9.5) ── */}
          <section className="ivd-card" aria-labelledby="ial-title">
            <div className="ivd-section-head">
              <h2 id="ial-title" className="text-title-m">Applicants</h2>
              <p className="text-body-l">
                {loading
                  ? 'Loading applicants…'
                  : `Showing ${filteredApplicants.length} of ${applicants.length} applicant${applicants.length === 1 ? '' : 's'}`}
              </p>
            </div>

            {error ? (
              <div className="ivd-alert" role="alert">
                <CircleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
                <div>
                  <h3 className="text-headline-m">We couldn't load the applicants</h3>
                  <p className="text-body-m">{error.replace(/[.\s]+$/, '')}. Try again, or contact RSP if this keeps happening.</p>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => void fetchApplicantsAndJob(false)}>
                    Try Again
                  </button>
                </div>
              </div>
            ) : (
              <div className="abyan-table-wrap">
                <table className="abyan-table" aria-busy={loading}>
                  <thead>
                    <tr>
                      <th scope="col">Applicant</th>
                      <th scope="col">Type</th>
                      <th scope="col">Contact info</th>
                      <th scope="col">Application date</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="is-action"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 3 }, (_, i) => (
                        <tr key={`skeleton-${i}`} aria-hidden="true">
                          <td className="ivd-cell-primary"><span className="ivd-skel" style={{ width: '60%', height: 14 }} /></td>
                          <td><span className="ivd-skel" style={{ width: 80, height: 24 }} /></td>
                          <td><span className="ivd-skel" style={{ width: '80%', height: 14 }} /></td>
                          <td><span className="ivd-skel" style={{ width: 100, height: 14 }} /></td>
                          <td><span className="ivd-skel" style={{ width: 96, height: 24 }} /></td>
                          <td className="is-action"><span className="ivd-skel" style={{ width: 96, height: 36, marginLeft: 'auto', borderRadius: 'var(--radius-pill)' }} /></td>
                        </tr>
                      ))
                    ) : pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="ivd-cell-empty">
                          <div className="ivd-empty">
                            <div className="ivd-empty-icon" aria-hidden="true"><Users size={24} strokeWidth={1.75} /></div>
                            {hasActiveFilters ? (
                              <>
                                <h3 className="text-title-s">No applicants match these filters</h3>
                                <p className="text-body-m">Try another type or status, or clear the filters.</p>
                                <button type="button" className="btn btn-sm btn-secondary" onClick={clearFilters}>Clear Filters</button>
                              </>
                            ) : (
                              <>
                                <h3 className="text-title-s">No applicants for this position yet</h3>
                                <p className="text-body-m">Applicants RSP assigns to this posting will appear here.</p>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      pageItems.map((applicant) => {
                        const appType = getApplicantType(applicant);
                        const evaluated = applicant.evaluation_status === 'Completed';
                        const fullName = getFullName(applicant);
                        return (
                          <tr key={applicant.id}>
                            <td className="ivd-cell-primary">
                              <button
                                type="button"
                                className="ivd-name-link"
                                onClick={() => void openApplicantDetails(applicant)}
                                title={`View ${fullName}'s details`}
                              >
                                {fullName}
                              </button>
                            </td>
                            <td data-label="Type">
                              {/* §10: application type is a category, not a status */}
                              <span className={`badge ${appType === 'Promotional' ? 'badge-tint' : 'badge-neutral'}`}>{appType}</span>
                            </td>
                            <td data-label="Contact info">
                              <span className="ivd-contact">{applicant.email || '—'}</span>
                              <span className="ivd-job-meta text-body-s">{applicant.contact_number || 'No contact number'}</span>
                            </td>
                            <td data-label="Application date">{formatDateDI(applicant.created_at)}</td>
                            <td data-label="Status"><EvalStatusBadge evaluated={evaluated} /></td>
                            <td className="is-action">
                              {evaluated ? (
                                <button type="button" className="btn btn-sm btn-secondary" disabled>Evaluated</button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  aria-label={`Evaluate ${fullName}`}
                                  onClick={() => {
                                    storeApplicantTypeForEval(applicant.id, appType);
                                    navigate(`/interviewer/evaluate/${applicant.id}`);
                                  }}
                                >
                                  Evaluate
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && !error && (
              <Pager total={filteredApplicants.length} page={currentPage} pageSize={APPLICANTS_PAGE_SIZE} onPage={setPage} label="Applicants pages" />
            )}
          </section>
        </main>
      </div>

      {activeApplicant && (
        <div className="applicant-details-overlay" onClick={closeApplicantDetails}>
          <div className="applicant-details-modal" onClick={(event) => event.stopPropagation()}>
            <div className="applicant-details-header">
              <div>
                {activeTab !== 'scores' && <p className="details-breadcrumb">Recruitment / Applicants / Details</p>}
                <h3>{getFullName(activeApplicant)}</h3>
              </div>
              <div className="details-actions">
                {activeTab !== 'scores' && (
                  <>
                    <button type="button" className="details-btn details-btn-neutral" onClick={() => setShowMessageDialog(true)}>
                      <Plane size={16} /> Send Message
                    </button>
                    <button type="button" className="details-btn details-btn-danger" onClick={() => void updateApplicantStatus(activeApplicant.id, 'Not Qualified')}>
                      <AlertCircle size={16} /> Disqualify
                    </button>
                    {/* Shortlisting must name the documents and reason requiring
                        resubmission, which happens in the RSP "Notice of Resubmission"
                        modal on /admin/rsp/applicant/:id. That route is admin-only,
                        so there is no standalone shortlist action here. */}
                    <button type="button" className="details-btn details-btn-success" onClick={() => void updateApplicantStatus(activeApplicant.id, 'Qualified')}>
                      <CheckCircle2 size={16} /> Qualify
                    </button>
                  </>
                )}
                <button type="button" className="details-close-btn" onClick={closeApplicantDetails}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {activeTab !== 'scores' && (
            <div className="details-tabs">
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'scores', label: 'Interviewer Scores' },
                { key: 'documents', label: 'Documents' },
                { key: 'activity', label: 'Activity' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`details-tab ${activeTab === tab.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.key as ApplicantDetailsTab)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            )}

            <div className={`details-content-grid ${activeTab === 'scores' ? 'scores-fullwidth' : ''}`}>
              {activeTab !== 'scores' && (
              <aside className="applicant-summary-card">
                <div className="applicant-avatar-lg">
                  <User size={42} />
                </div>
                <h4>{getFullName(activeApplicant)}</h4>
                <span className={`applicant-status-pill ${getApplicantStatusBadgeClass(activeApplicant.status)}`}>{activeApplicant.status}</span>
                <div className="summary-metadata">
                  <div>
                    <p>APPLICATION ID</p>
                    <strong>{activeApplicant.id}</strong>
                  </div>
                  <div>
                    <p>DATE APPLIED</p>
                    <strong>{formatDate(activeApplicant.created_at)}</strong>
                  </div>
                  <div>
                    <p>EMAIL</p>
                    <strong>{activeApplicant.email}</strong>
                  </div>
                  <div>
                    <p>PHONE</p>
                    <strong>{activeApplicant.contact_number || '--'}</strong>
                  </div>
                  <div>
                    <p>LOCATION</p>
                    <strong>{activeApplicant.office || jobDetails?.office || '--'}</strong>
                  </div>
                </div>
              </aside>
              )}

              <section className="applicant-details-main">
                {activeTab === 'scores' && (
                  <article className="details-panel">
                    <h5>Interviewer Evaluation Scores</h5>
                    {!evaluationsByApplicant[activeApplicant.id] || evaluationsByApplicant[activeApplicant.id].length === 0 ? (
                      <p className="empty-docs-text">No interviewer evaluations found for this applicant.</p>
                    ) : (
                      <div className="evaluations-container">
                        {evaluationsByApplicant[activeApplicant.id].map((evaluation, idx) => (
                          <div key={idx} className="evaluation-card">
                            <div className="evaluation-header">
                              <h6>Evaluation #{idx + 1}</h6>
                              <span className="evaluation-date">{formatDate(evaluation.status || 'N/A')}</span>
                            </div>
                            <div className="evaluation-grid">
                              <div className="score-row">
                                <span className="score-label">Personality:</span>
                                <strong className="score-value">{evaluation.personality_score !== null && evaluation.personality_score !== undefined ? evaluation.personality_score : '--'}</strong>
                              </div>
                              <div className="score-row">
                                <span className="score-label">Job Knowledge:</span>
                                <strong className="score-value">{evaluation.job_knowledge_score !== null && evaluation.job_knowledge_score !== undefined ? evaluation.job_knowledge_score : '--'}</strong>
                              </div>
                              <div className="score-row">
                                <span className="score-label">Overall Impression:</span>
                                <strong className="score-value">{evaluation.overall_impression_score !== null && evaluation.overall_impression_score !== undefined ? evaluation.overall_impression_score : '--'}</strong>
                              </div>
                              <div className="score-row">
                                <span className="score-label">Communication Skills:</span>
                                <strong className="score-value">{evaluation.communication_skills_score !== null && evaluation.communication_skills_score !== undefined ? evaluation.communication_skills_score : '--'}</strong>
                              </div>
                              <div className="score-row">
                                <span className="score-label">Confidence:</span>
                                <strong className="score-value">{evaluation.confidence_score !== null && evaluation.confidence_score !== undefined ? evaluation.confidence_score : '--'}</strong>
                              </div>
                              <div className="score-row">
                                <span className="score-label">Comprehension:</span>
                                <strong className="score-value">{evaluation.comprehension_score !== null && evaluation.comprehension_score !== undefined ? evaluation.comprehension_score : '--'}</strong>
                              </div>
                            </div>
                            {evaluation.interview_notes && (
                              <div className="evaluation-remarks">
                                <p><strong>Interview Notes:</strong></p>
                                <p>{evaluation.interview_notes}</p>
                              </div>
                            )}
                            {evaluation.recommendation && (
                              <div className="evaluation-remarks">
                                <p><strong>Recommendation:</strong></p>
                                <p>{evaluation.recommendation}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                )}

                {activeTab === 'overview' && (
                  <div className="details-stack">
                    <article className="details-panel">
                      <h5>Personal Information</h5>
                      <div className="detail-rows">
                        <div><span>Full Name</span><strong>{getFullName(activeApplicant)}</strong></div>
                        <div><span>Email Address</span><strong>{activeApplicant.email}</strong></div>
                        <div><span>Phone Number</span><strong>{activeApplicant.contact_number || '--'}</strong></div>
                        <div><span>Address</span><strong>{activeApplicant.office || '--'}</strong></div>
                        <div><span>PWD Status</span><strong>Not Applicable</strong></div>
                      </div>
                    </article>

                    <article className="details-panel">
                      <h5>Qualifications</h5>
                      <div className="detail-rows">
                        <div><span>Education</span><strong>BS Information Technology, University of the Philippines</strong></div>
                        <div><span>Work Experience</span><strong>3 years as Junior IT Officer</strong></div>
                        <div><span>Application Date</span><strong>{formatDate(activeApplicant.created_at)}</strong></div>
                      </div>
                    </article>

                    <article className="details-panel">
                      <div className="panel-title-inline">
                        <h5>Internal Notes</h5>
                      </div>
                      <textarea
                        className="details-notes-input"
                        placeholder="Add notes to track internal comments and observations."
                        value={internalNotesByApplicant[activeApplicant.id] || ''}
                        onChange={(event) =>
                          setInternalNotesByApplicant((prev) => ({
                            ...prev,
                            [activeApplicant.id]: event.target.value,
                          }))
                        }
                      />
                    </article>
                  </div>
                )}

                {activeTab === 'documents' && (
                  <article className="details-panel">
                    <div className="panel-title-inline">
                      <h5>Submitted Documents</h5>
                      <button
                        type="button"
                        className="download-link-btn"
                        onClick={() => void handleDownloadAllDocuments(activeAttachments)}
                        disabled={activeAttachments.length === 0}
                      >
                        <Download size={16} /> Download All
                      </button>
                    </div>

                    {isLoadingAttachments ? (
                      <p className="empty-docs-text">Loading documents...</p>
                    ) : activeAttachments.length === 0 ? (
                      <p className="empty-docs-text">No documents uploaded yet.</p>
                    ) : (
                      <div className="document-list">
                        {activeAttachments.map((attachment) => (
                          <div key={attachment.id} className="document-row">
                            <div>
                              <p>{attachment.file_name || 'Document'}</p>
                              <span>Uploaded {formatDate(attachment.created_at || activeApplicant.created_at)}</span>
                            </div>
                            <button type="button" className="view-doc-btn" onClick={() => void handlePreviewDocument(attachment)}>
                              View
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                )}

                {activeTab === 'activity' && (
                  <article className="details-panel">
                    <h5>Activity Timeline</h5>
                    <div className="timeline-list">
                      {activityEntries.map((entry) => (
                        <div key={entry.title} className="timeline-row">
                          <span className="timeline-dot" />
                          <div>
                            <p>{entry.title}</p>
                            <span>{entry.subtitle}</span>
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
        <div className="message-dialog-overlay" onClick={() => setShowMessageDialog(false)}>
          <div className="message-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="message-dialog-header">
              <div className="header-icon-box" />
              <div>
                <h4>Send Message to Applicant</h4>
                <p>Notify applicant about their application</p>
              </div>
              <button type="button" onClick={() => setShowMessageDialog(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="message-dialog-body">
              <div className="recipient-grid">
                <div>
                  <label>TO:</label>
                  <strong>{activeApplicant.email}</strong>
                </div>
                <div>
                  <label>APPLICANT NAME:</label>
                  <strong>{getFullName(activeApplicant)}</strong>
                </div>
              </div>

              <label>Message Template (Optional)</label>
              <select value={emailTemplate} onChange={(event) => handleTemplateChange(event.target.value as EmailTemplate)}>
                {EMAIL_TEMPLATES.map((template) => (
                  <option key={template.value} value={template.value}>{template.label}</option>
                ))}
              </select>

              <label>Subject Line *</label>
              <input
                value={emailSubject}
                onChange={(event) => setEmailSubject(event.target.value)}
                placeholder="e.g., Incomplete Requirements for Your Application"
              />

              <label>Message *</label>
              <textarea
                value={emailMessage}
                onChange={(event) => setEmailMessage(event.target.value)}
                placeholder="Write your message here..."
              />

              <p className="dialog-helper-text">Be clear and professional in your communication</p>

              <section className="documents-summary-grid">
                <article className="summary-box submitted-box">
                  <h5><FileText size={16} /> Submitted Documents</h5>
                  {submittedDocumentTypes.length > 0 ? (
                    <ul>
                      {submittedDocumentTypes.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : (
                    <p>No submitted files found</p>
                  )}
                </article>

                <article className="summary-box missing-box">
                  <h5><AlertCircle size={16} /> Missing Documents</h5>
                  {missingDocumentTypes.length > 0 ? (
                    <ul>
                      {missingDocumentTypes.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : (
                    <p>All documents submitted</p>
                  )}
                </article>
              </section>
            </div>

            <div className="message-dialog-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
              {emailError && (
                <ActionFeedback
                  title="We couldn't send this message."
                  message={emailError.message}
                  nextStep={emailError.nextStep}
                  onDismiss={() => setEmailError(null)}
                />
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  className="dialog-btn-cancel"
                  onClick={() => { setShowMessageDialog(false); setEmailError(null); }}
                  disabled={emailSending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="dialog-btn-send"
                  onClick={handleSendApplicantEmail}
                  disabled={!emailSubject.trim() || !emailMessage.trim() || emailSending}
                  aria-busy={emailSending || undefined}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  {emailSending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Plane size={16} />} Send Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
