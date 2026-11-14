import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  FileText,
  Loader2,
  Lock,
  Mail,
  Pencil,
  MessageSquare,
  RotateCcw,
  Send,
  Star,
  User,
  X
} from 'lucide-react';
import { AdminHeader } from '../../components/AdminHeader';
import { Sidebar } from '../../components/Sidebar';
import { ActionFeedback, useFeedback } from '../../components/action-feedback';
import { describeActionFailure } from '../../lib/friendlyErrors';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useHistoryBack } from '../../hooks/useHistoryBack';
import { BackButton } from '../../components/BackButton';
import { EditApplicantDetailsModal } from './EditApplicantDetailsModal';
import { getPreferredDataSourceMode } from '../../lib/dataSourceMode';
import { mockDatabase } from '../../lib/mockDatabase';
import { sendEmail } from '../../lib/email';
import { getApplicants, getAuthoritativeJobPostings, saveApplicants } from '../../lib/recruitmentData';
import { ATTACHMENTS_BUCKET, isMockModeEnabled, supabase } from '../../lib/supabase';
import type { ViewerDocument } from '../../lib/documentViewing';
import { DocumentCollectionModal } from '../../components/DocumentCollectionModal';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { normalizeStatus } from '../../lib/api/applicantStatus';
import { getAdminEmail } from '../../lib/adminSession';
import { getApplicantType } from '../../lib/interviewerEvalNavigation';
import {
  buildDocumentHistory,
  listDocumentEvents,
  mergeResubmissionRequests,
  recordDocumentEvent,
  undoDocumentValidation,
  type DocumentEvent,
} from '../../lib/api/applicantDocumentEvents';
import {
  DISQUALIFICATION_REASON_OPTIONS,
  FAILURE_TO_ATTEND,
  MISSED_ACTIVITY_LABELS,
  buildDisqualificationActivityDescription,
  type MissedActivity,
  type MissedActivityType,
} from '../../lib/applicationActivity';
import {
  MAX_PROGRESS_DOTS,
  nextUndecidedIndex,
  reviewOutcome,
  type ReviewQueueEntry,
} from '../../lib/applicantReviewQueue';
import {
  cancelPendingDecision,
  flushPendingDecision,
  schedulePendingDecision,
  usePendingDecision,
} from '../../lib/pendingStatusDecision';
import type { Applicant, JobPosting } from '../../types/recruitment.types';

type ApplicantRecord = {
  id: string;
  item_number?: string;
  /** Tracking code issued by the database on submission (ABYAN-000-000). */
  reference_no?: string | null;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  email: string;
  position?: string;
  office?: string;
  contact_number?: string;
  address?: string;
  is_pwd?: boolean;
  status?: string;
  application_type?: 'job' | 'promotion' | string;
  employee_id?: string | null;
  created_at?: string;
  // Schedule columns, used to offer the activity a no-show applicant missed.
  exam_date?: string | null;
  exam_time?: string | null;
  oral_exam_date?: string | null;
  oral_exam_time?: string | null;
  interview_date?: string | null;
  interview_time?: string | null;
};

type AttachmentRecord = {
  id: string;
  /** Display label; see source_file_name for the uploaded name. */
  file_name: string;
  file_path: string;
  created_at?: string;
  document_type?: string;
  file_type?: string | null;
  /** The uploaded file's own name, kept for the viewer's title and Download. */
  source_file_name?: string;
};

type EvaluationRecord = {
  created_at?: string;
  updated_at?: string;
  technical_score?: number | string;
  overall_score?: number | string;
  score?: number | string;
  communication_score?: number | string;
  communication_skills_score?: number | string;
  confidence_score?: number | string;
  comprehension_score?: number | string;
  personality_score?: number | string;
  job_knowledge_score?: number | string;
  overall_impression_score?: number | string;
};

type CachedPreviewFile = {
  applicantId: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  createdAt: string;
};

type ApplicantRouteState = {
  from?: string;
  applicant?: Applicant;
  /** The list the reviewer came from, in its shown order; enables next/previous. */
  navQueue?: ReviewQueueEntry[];
};

type AppointmentType = 'original' | 'promotional';

type TabKey = 'overview' | 'qualifications' | 'documents' | 'interview';

const ATTACHMENT_PREVIEW_CACHE_KEY = 'cictrix_attachment_previews';
const SCORE_SETUP_STORAGE_KEY = 'cictrix_rsp_score_setup';

const formatDate = (value?: string) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatDateTime = (value?: string) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getFullName = (applicant: ApplicantRecord) => {
  const parts = [applicant.first_name, applicant.middle_name ?? '', applicant.last_name]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  return parts.join(' ');
};

const labelize = (value?: string) =>
  String(value ?? 'Document')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const normalizeText = (value: string) => String(value ?? '').trim().toLowerCase();

// ── Document Review (localStorage, shared with QualifiedApplicantsPage) ────────
type DocReviewStatus = 'pending' | 'approved' | 'resubmission_requested';
interface DocReview { status: DocReviewStatus; remarks: string; reviewedAt: string; }
const DOC_REVIEW_KEY = 'cictrix_doc_reviews';
const loadDocReviews = (): Record<string, DocReview> => {
  try { return JSON.parse(localStorage.getItem(DOC_REVIEW_KEY) ?? '{}'); } catch { return {}; }
};
const RESUBMISSION_REASONS = [
  'Blurred image', 'Missing page', 'Incomplete document', 'Invalid document',
  'Document expired', 'Wrong document submitted', 'Low resolution / unreadable',
];

const statusBadge = (status?: string) => {
  const normalized = normalizeText(status ?? '');
  if (normalized.includes('not qualified') || normalized.includes('disqual') || normalized.includes('reject')) {
    return { label: 'Disqualified', className: 'bg-rose-100 text-rose-700 border-rose-300' };
  }
  if (normalized.includes('qualified') || normalized.includes('recommend') || normalized.includes('hired')) {
    return { label: 'Score Finalized', className: 'bg-emerald-100 text-emerald-700 border-emerald-300' };
  }
  if (normalized.includes('shortlist')) {
    return { label: 'Shortlisted', className: 'bg-blue-100 text-blue-700 border-blue-300' };
  }
  return { label: 'Under Review', className: 'bg-amber-100 text-amber-700 border-amber-300' };
};

const parseScore = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const evaluationScoreSignal = (evaluation: EvaluationRecord | null | undefined) => {
  if (!evaluation) return 0;

  const numericSignals = [
    parseScore(evaluation.technical_score),
    parseScore(evaluation.overall_score),
    parseScore(evaluation.score),
    parseScore(evaluation.communication_skills_score) || parseScore(evaluation.communication_score),
    parseScore(evaluation.confidence_score),
    parseScore(evaluation.comprehension_score),
    parseScore(evaluation.personality_score),
    parseScore(evaluation.job_knowledge_score),
    parseScore(evaluation.overall_impression_score),
  ].filter((value) => value > 0).length;

  return numericSignals;
};

const evaluationTimestamp = (evaluation: EvaluationRecord | null | undefined) => {
  if (!evaluation) return 0;
  const primary = new Date(String(evaluation.updated_at ?? '')).getTime();
  if (Number.isFinite(primary) && primary > 0) return primary;
  const fallback = new Date(String(evaluation.created_at ?? '')).getTime();
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
};

const hasInterviewScores = (evaluation: EvaluationRecord | null | undefined): boolean => {
  if (!evaluation) return false;

  const pcpt = parseScore(evaluation.personality_score) || parseScore(evaluation.overall_impression_score);
  const oral = [
    evaluation.communication_skills_score,
    evaluation.confidence_score,
    evaluation.comprehension_score,
  ].some((value) => parseScore(value) > 0);

  return pcpt > 0 || oral;
};

const selectBestEvaluation = (rows: EvaluationRecord[] | null | undefined): EvaluationRecord | null => {
  const candidates = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (candidates.length === 0) return null;

  // Prefer the most recent evaluation that includes PCPT / oral scores (if available).
  const withInterviewScores = candidates.filter(hasInterviewScores);
  if (withInterviewScores.length > 0) {
    return withInterviewScores
      .sort((left, right) => evaluationTimestamp(right) - evaluationTimestamp(left))[0] ?? null;
  }

  // Otherwise, fall back to the previous heuristic (highest numeric signal + latest timestamp).
  const sorted = [...candidates].sort((left, right) => {
    const scoreDelta = evaluationScoreSignal(right) - evaluationScoreSignal(left);
    if (scoreDelta !== 0) return scoreDelta;

    return evaluationTimestamp(right) - evaluationTimestamp(left);
  });

  return sorted[0] ?? null;
};

/** An attachment for the in-site viewer, which signs, fetches and decrypts it without a new tab. */
const applicantViewerDocument = (row: Pick<AttachmentRecord, 'file_path' | 'file_name' | 'source_file_name' | 'file_type'>, label?: string): ViewerDocument => ({
  id: row.file_path,
  url: row.file_path,
  fileName: row.source_file_name || row.file_name,
  fileType: row.file_type,
  bucket: ATTACHMENTS_BUCKET,
  label,
});

const buildApplicantRecordFromRecruitment = (applicant: Applicant, job: JobPosting | null): ApplicantRecord => ({
  id: applicant.id,
  item_number: applicant.personalInfo.itemNumber,
  first_name: applicant.personalInfo.firstName,
  last_name: applicant.personalInfo.lastName,
  email: applicant.personalInfo.email,
  position: job?.title ?? applicant.experience?.[0]?.title ?? '',
  office: job?.department ?? '',
  contact_number: applicant.personalInfo.phone,
  address: applicant.personalInfo.address,
  is_pwd: false,
  status: applicant.status,
  created_at: applicant.applicationDate,
});

const buildAttachmentRowsFromRecruitment = (applicant: Applicant | null): AttachmentRecord[] => {
  if (!applicant) return [];

  const documentRows = (applicant.documents ?? []).map((document, index) => ({
    id: `${applicant.id}-document-${index}`,
    file_name: document.type || `Document ${index + 1}`,
    file_path: document.url,
    created_at: applicant.applicationDate,
  }));

  const cachedRows = (() => {
    try {
      const rows = JSON.parse(localStorage.getItem(ATTACHMENT_PREVIEW_CACHE_KEY) ?? '[]') as CachedPreviewFile[];
      return rows
        .filter((row) => row.applicantId === applicant.id)
        .map((row, index) => ({
          id: `${applicant.id}-cached-${index}`,
          file_name: row.fileName || labelize(row.documentType),
          file_path: row.dataUrl,
          file_type: row.mimeType,
          created_at: row.createdAt,
        }));
    } catch {
      return [] as AttachmentRecord[];
    }
  })();

  const merged: AttachmentRecord[] = [];
  const seen = new Set<string>();
  [...documentRows, ...cachedRows].forEach((row) => {
    const key = `${row.file_name}|${row.file_path}`;
    if (!row.file_path || seen.has(key)) return;
    seen.add(key);
    merged.push({ ...row, source_file_name: row.file_name, file_name: labelize(row.file_name) });
  });

  return merged;
};

const mergeAttachmentRows = (primary: AttachmentRecord[], fallback: AttachmentRecord[]) => {
  const merged: AttachmentRecord[] = [];
  const seenKeys = new Set<string>();

  primary.forEach((row, index) => {
    const rawType = (row.document_type as string | null) || FILE_NAME_TO_TYPE[row.file_name] || 'other';
    const dedupeKey = `${rawType}|${row.file_name}|${row.file_path}`;
    if ((!row.file_name && !row.file_path) || seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);
    merged.push({
      ...row,
      id: row.id || `primary-${index}`,
      source_file_name: row.source_file_name ?? row.file_name,
      file_name: labelize(row.file_name || row.file_path),
    });
  });

  fallback.forEach((row, index) => {
    const rawType = (row.document_type as string | null) || FILE_NAME_TO_TYPE[row.file_name] || 'other';
    const dedupeKey = `${rawType}|${row.file_name}|${row.file_path}`;

    const typeHasPrimary = primary.some((p) => {
      const pType = (p.document_type as string | null) || FILE_NAME_TO_TYPE[p.file_name] || 'other';
      return pType === rawType && p.document_type !== 'resubmission_request' && p.document_type !== 'resubmission_resolved' && p.document_type !== 'doc_validated';
    });

    if (seenKeys.has(dedupeKey) || (typeHasPrimary && !row.file_path.startsWith('data:'))) {
      return;
    }
    seenKeys.add(dedupeKey);
    merged.push({
      ...row,
      id: row.id || `fallback-${index}`,
      source_file_name: row.source_file_name ?? row.file_name,
      file_name: labelize(row.file_name || row.file_path),
    });
  });

  return merged;
};

const buildFallbackEvaluation = (applicant: Applicant | null): EvaluationRecord | null => {
  if (!applicant || !(applicant.qualificationScore > 0)) return null;
  const latestTimelineEntry = applicant.timeline?.[applicant.timeline.length - 1];
  return {
    overall_score: applicant.qualificationScore,
    updated_at: latestTimelineEntry?.date ?? applicant.applicationDate,
  };
};

const saveStoredAppointmentType = (applicantId: string, appointmentType: AppointmentType) => {
  try {
    const raw = localStorage.getItem(SCORE_SETUP_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, AppointmentType>) : {};
    parsed[applicantId] = appointmentType;
    localStorage.setItem(SCORE_SETUP_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Best effort persistence only.
  }
};

// The database row comes first; the local recruitment store fills gaps.
const isPromotionalSource = (
  recruitmentApplicant?: Applicant | null,
  applicantRow?: ApplicantRecord | null
) =>
  getApplicantType({
    application_type: applicantRow?.application_type || recruitmentApplicant?.applicationType,
    employee_id: applicantRow?.employee_id || recruitmentApplicant?.internalApplication?.employeeId,
  }) === 'Promotional';

const DOCUMENT_SLOTS = [
  { type: 'application_letter', label: 'Application Letter', required: true },
  { type: 'pds_with_photo', label: 'Personal Data Sheet', required: true },
  // No longer required; kept so CVs on older applications stay viewable.
  { type: 'curriculum_vitae', label: 'Curriculum Vitae', required: false },
  { type: 'eligibility_proof', label: 'Proof of Eligibility Rating/License', required: true },
  { type: 'training_certificate', label: 'Certificate of Relevant Training/Seminars', required: true },
  { type: 'transcript_of_records', label: 'Transcript of Records', required: true },
  { type: 'previous_employer_certificate', label: 'Certificate from Previous Employer', required: false },
  { type: 'drug_test', label: 'Drug Test Result', required: true },
  { type: 'other', label: 'Other Supporting Documents', required: false },
] as const;

// Labelize'd file_name aliases → slot type (for attachments without document_type)
const FILE_NAME_TO_TYPE: Record<string, string> = {
  'Application Letter': 'application_letter',
  'Pds With Photo': 'pds_with_photo',
  'Curriculum Vitae': 'curriculum_vitae',
  'Eligibility Proof': 'eligibility_proof',
  'Training Certificate': 'training_certificate',
  'Transcript Of Records': 'transcript_of_records',
  'Previous Employer Certificate': 'previous_employer_certificate',
  'Drug Test': 'drug_test',
  'Other': 'other',
};

export function ApplicantDetailsPage() {
  const { id } = useParams<{ id: string }>();
  // Leaving the details page writes any decision still inside its Undo window.
  useEffect(() => flushPendingDecision, []);
  // Keyed so stepping to the next applicant starts from fresh state.
  return <ApplicantDetailsPageView key={id} />;
}

function ApplicantDetailsPageView() {
  const navigate = useNavigate();
  const goBack = useHistoryBack('/admin/rsp');
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const routeState = (location.state as ApplicantRouteState | null) ?? null;

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [notes, setNotes] = useState('');
  const [showNoteEditor, setShowNoteEditor] = useState(false);

  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<{ message: string; nextStep: string } | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailTemplate, setEmailTemplate] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailNotes, setEmailNotes] = useState('');

  const [, setApplicantStatus] = useState<null | 'shortlist' | 'qualified' | 'disqualify'>(null);
  const [confirmAction, setConfirmAction] = useState<null | 'qualified' | 'disqualify'>(null);
  const [confirmReasonCategory, setConfirmReasonCategory] = useState('');
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmMessageVisible, setConfirmMessageVisible] = useState(false);
  // Which scheduled activity the applicant failed to attend (spec §8). Only
  // meaningful when the reason is failure_to_attend.
  const [missedActivityKey, setMissedActivityKey] = useState('');
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<{ message: string; nextStep: string } | null>(null);

  const [applicant, setApplicant] = useState<ApplicantRecord | null>(null);
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [recruitmentApplicant, setRecruitmentApplicant] = useState<Applicant | null>(routeState?.applicant ?? null);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [, setEvaluation] = useState<EvaluationRecord | null>(null);
  const { success: notifySuccess, error: notifyError } = useFeedback();
  const [navQueue, setNavQueue] = useState<ReviewQueueEntry[] | null>(routeState?.navQueue ?? null);
  const [reviewComplete, setReviewComplete] = useState(false);
  const pendingDecision = usePendingDecision();
  const [docReviews, setDocReviews] = useState<Record<string, DocReview>>(loadDocReviews);
  const [, setOpenedDocFilePaths] = useState<Set<string>>(new Set());
  const [previewDocument, setPreviewDocument] = useState<ViewerDocument | null>(null);
  const [documentCollection, setDocumentCollection] = useState<ViewerDocument[] | null>(null);
  const [docsValidated, setDocsValidated] = useState(false);
  const [docEvents, setDocEvents] = useState<DocumentEvent[]>([]);
  const [docEventsLoaded, setDocEventsLoaded] = useState(false);
  const [confirmValidateOpen, setConfirmValidateOpen] = useState(false);
  const [validationBusy, setValidationBusy] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showResubmitModal, setShowResubmitModal] = useState(false);
  const [resubmitSelectedSlots, setResubmitSelectedSlots] = useState<string[]>([]);
  const [resubmitReason, setResubmitReason] = useState('');
  const [resubmitNotes, setResubmitNotes] = useState('');
  const [resubmitSending, setResubmitSending] = useState(false);
  const [resubmitSuccess, setResubmitSuccess] = useState<string | null>(null);
  const [resubmitError, setResubmitError] = useState<string | null>(null);
  const syncedValidatedRef = useRef<Set<string>>(new Set());

  // Self-healing sync: if localStorage says a doc is approved but Supabase has no
  // doc_validated row for it (e.g., insert failed in a previous session), create it now.
  // Also pings applicants.updated_at so the tracker's realtime subscription fires.
  useEffect(() => {
    if (!applicant?.id || !attachments.length || !docEventsLoaded) return;
    const existingValidatedTypes = new Set(
      attachments.filter((a) => a.document_type === 'doc_validated').map((a) => a.file_name),
    );
    const realDocs = attachments.filter(
      (a) => a.document_type !== 'resubmission_request' && a.document_type !== 'resubmission_resolved' && a.document_type !== 'doc_validated',
    );
    // An approval older than the last saved undo was undone on purpose; don't
    // re-create its marker (possibly from another machine's stale storage).
    const lastUndoAt = Math.max(
      0,
      ...docEvents.filter((e) => e.event_type === 'validation_undone').map((e) => new Date(e.created_at).getTime()),
    );
    let synced = false;
    for (const att of realDocs) {
      const key = `${id}::${att.file_path}`;
      const rawDocType = (att.document_type as string | null) || FILE_NAME_TO_TYPE[att.file_name] || 'other';
      if (
        docReviews[key]?.status === 'approved' &&
        new Date(docReviews[key].reviewedAt).getTime() > lastUndoAt &&
        !existingValidatedTypes.has(rawDocType) &&
        !syncedValidatedRef.current.has(rawDocType)
      ) {
        syncedValidatedRef.current.add(rawDocType);
        synced = true;
        void (supabase as any).from('applicant_attachments').insert({
          applicant_id: applicant.id,
          file_name: rawDocType,
          file_path: `validated::${rawDocType}`,
          document_type: 'doc_validated',
          file_type: 'validation',
          file_size: 0,
        });
      }
    }
    // Ping the tracker via the applicants subscription after creating missing rows.
    if (synced) {
      void (supabase as any).from('applicants').update({ updated_at: new Date().toISOString() }).eq('id', applicant.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant?.id, attachments, docReviews, docEvents, docEventsLoaded]);

  // Validation state is derived from the durable doc_validated rows, not from
  // localStorage — otherwise an applicant validated on one RSP machine still
  // looks unvalidated on another. `docsValidated` remains as an optimistic
  // override so the UI flips immediately after handleValidateAllDocs runs,
  // before `attachments` refetches.
  const rawTypeOf = (att: AttachmentRecord) =>
    (att.document_type as string | null) || FILE_NAME_TO_TYPE[att.file_name] || 'other';

  const realDocs = attachments.filter(
    (a) => a.document_type !== 'resubmission_request' &&
      a.document_type !== 'resubmission_resolved' &&
      a.document_type !== 'doc_validated',
  );
  const validatedDocTypes = new Set(
    attachments.filter((a) => a.document_type === 'doc_validated').map((a) => a.file_name),
  );
  const docsAwaitingValidation = realDocs.filter((a) => !validatedDocTypes.has(rawTypeOf(a)));
  const docsValidatedDurable = realDocs.length > 0 && docsAwaitingValidation.length === 0;
  const docsValidatedEffective = docsValidated || docsValidatedDurable;

  // Viewers and modals add a Back marker to location.state, which makes a new state
  // object without changing the applicant. Reload on the applicant's identity only;
  // re-running on every state change remounted the page and looped any open viewer.
  const routeApplicant = useRef(routeState?.applicant ?? null);
  routeApplicant.current = routeState?.applicant ?? null;
  const routeApplicantId = routeState?.applicant?.id ?? null;

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);

      const storedRecruitmentApplicant = routeApplicant.current ?? getApplicants().find((entry) => entry.id === id) ?? null;
      const storedJobPosting = storedRecruitmentApplicant
        ? getAuthoritativeJobPostings().find((entry) => entry.id === storedRecruitmentApplicant.jobPostingId) ?? null
        : null;

      setRecruitmentApplicant(storedRecruitmentApplicant);
      setNotes(storedRecruitmentApplicant?.notes?.[0]?.content ?? '');
      // Do not seed from localStorage: docsValidatedDurable derives the real
      // answer from the doc_validated rows once attachments load.
      setDocsValidated(false);

      const loadFromClient = async (client: any) => {
        const applicantRes = await client.from('applicants').select('*').eq('id', id).single();
        if (applicantRes.error || !applicantRes.data) {
          throw applicantRes.error || new Error('Applicant not found');
        }

        const applicantRow = applicantRes.data as ApplicantRecord;

        const attachmentRes = await client
          .from('applicant_attachments')
          .select('*')
          .eq('applicant_id', id)
          .order('created_at', { ascending: false });

        const evaluationRes = await client
          .from('evaluations')
          .select('*')
          .eq('applicant_id', id)
          .order('created_at', { ascending: false })
          .limit(10);

        let resolvedEvaluation = selectBestEvaluation((evaluationRes.data || []) as EvaluationRecord[]);

        // Fallback: resolve evaluation by email-linked applicant IDs in case
        // interviewer/evaluator used a sibling applicant row ID.
        if (!resolvedEvaluation && applicantRow.email) {
          try {
            const linkedApplicantsRes = await client
              .from('applicants')
              .select('id')
              .eq('email', applicantRow.email);

            const linkedIds = Array.from(
              new Set(
                [
                  id,
                  ...((linkedApplicantsRes.data || []) as Array<{ id?: string }>).map((row) => String(row.id || '').trim()),
                ].filter(Boolean)
              )
            );

            if (linkedIds.length > 0) {
              const linkedEvaluationRes = await client
                .from('evaluations')
                .select('*')
                .in('applicant_id', linkedIds)
                .order('created_at', { ascending: false })
                .limit(10);

              resolvedEvaluation = selectBestEvaluation((linkedEvaluationRes.data || []) as EvaluationRecord[]);
            }
          } catch {
            // Best effort fallback only.
          }
        }

        return {
          applicant: applicantRow,
          attachments: (attachmentRes.data || []) as AttachmentRecord[],
          evaluation: resolvedEvaluation,
        };
      };

      const resolveEvaluationOnly = async (
        client: any,
        applicantId: string,
        applicantEmail?: string,
      ): Promise<EvaluationRecord | null> => {
        try {
          const directEval = await client
            .from('evaluations')
            .select('*')
            .eq('applicant_id', applicantId)
            .order('created_at', { ascending: false })
            .limit(10);

          const bestDirect = selectBestEvaluation((directEval?.data || []) as EvaluationRecord[]);
          if (bestDirect) {
            return bestDirect;
          }
        } catch {
          // Continue to linked-id fallback.
        }

        if (!applicantEmail) return null;

        try {
          const linkedApplicantsRes = await client
            .from('applicants')
            .select('id')
            .eq('email', applicantEmail);

          const linkedIds = Array.from(
            new Set(
              [
                applicantId,
                ...((linkedApplicantsRes.data || []) as Array<{ id?: string }>).map((row) => String(row.id || '').trim()),
              ].filter(Boolean)
            )
          );

          if (linkedIds.length === 0) return null;

          const linkedEval = await client
            .from('evaluations')
            .select('*')
            .in('applicant_id', linkedIds)
            .order('created_at', { ascending: false })
            .limit(10);

          return selectBestEvaluation((linkedEval.data || []) as EvaluationRecord[]);
        } catch {
          return null;
        }
      };

      const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
      const primaryClient = preferredMode === 'local' ? (mockDatabase as any) : supabase;
      const secondaryClient = preferredMode === 'local' ? supabase : (mockDatabase as any);

      try {
        const primary = await loadFromClient(primaryClient);
        let resolved = primary;

        // If the primary source has the applicant row but no evaluation yet,
        // try pulling only the evaluation from the secondary source.
        if (!primary.evaluation) {
          try {
            const crossSourceEvaluation = await resolveEvaluationOnly(
              secondaryClient,
              id,
              String(primary.applicant?.email ?? '').trim() || undefined,
            );

            const secondary = await loadFromClient(secondaryClient);
            resolved = {
              ...primary,
              evaluation: crossSourceEvaluation ?? secondary.evaluation ?? primary.evaluation,
              attachments:
                primary.attachments.length > 0
                  ? primary.attachments
                  : secondary.attachments,
            };
          } catch {
            const crossSourceEvaluation = await resolveEvaluationOnly(
              secondaryClient,
              id,
              String(primary.applicant?.email ?? '').trim() || undefined,
            );
            if (crossSourceEvaluation) {
              resolved = {
                ...primary,
                evaluation: crossSourceEvaluation,
              };
            }
          }
        }

        setApplicant(resolved.applicant);
        setAttachments(mergeAttachmentRows(resolved.attachments, buildAttachmentRowsFromRecruitment(storedRecruitmentApplicant)));
        setEvaluation(resolved.evaluation ?? buildFallbackEvaluation(storedRecruitmentApplicant));
      } catch {
        try {
          const fallback = await loadFromClient(secondaryClient);
          setApplicant(fallback.applicant);
          setAttachments(mergeAttachmentRows(fallback.attachments, buildAttachmentRowsFromRecruitment(storedRecruitmentApplicant)));
          setEvaluation(fallback.evaluation ?? buildFallbackEvaluation(storedRecruitmentApplicant));
        } catch {
          // If we couldn't load the applicant row from either source, try to recover
          // any evaluation by searching by email (useful when the ID used in the route
          // doesn't match the backend applicant record).
          let resolvedEvaluation: EvaluationRecord | null = null;
          const fallbackEmail = String(storedRecruitmentApplicant?.personalInfo?.email ?? '').trim() || undefined;

          if (fallbackEmail) {
            try {
              resolvedEvaluation = await resolveEvaluationOnly(primaryClient, id, fallbackEmail);
              if (!resolvedEvaluation) {
                resolvedEvaluation = await resolveEvaluationOnly(secondaryClient, id, fallbackEmail);
              }
            } catch {
              // Best-effort only.
            }
          }

          if (storedRecruitmentApplicant) {
            setApplicant(buildApplicantRecordFromRecruitment(storedRecruitmentApplicant, storedJobPosting));
            setAttachments(buildAttachmentRowsFromRecruitment(storedRecruitmentApplicant));
            setEvaluation(resolvedEvaluation ?? buildFallbackEvaluation(storedRecruitmentApplicant));
          } else {
            setApplicant(null);
            setAttachments([]);
            setEvaluation(resolvedEvaluation);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, routeApplicantId]);

  // Real-time subscription: refresh attachments when the applicant re-uploads a doc.
  useEffect(() => {
    if (!id) return;
    const channel = (supabase as any)
      .channel(`rsp_applicant_attachments_${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'applicant_attachments',
        filter: `applicant_id=eq.${id}`,
      }, async () => {
        try {
          const res = await (supabase as any)
            .from('applicant_attachments')
            .select('*')
            .eq('applicant_id', id)
            .order('created_at', { ascending: false });
          if (!res.error && Array.isArray(res.data)) {
            setAttachments(mergeAttachmentRows(res.data as AttachmentRecord[], buildAttachmentRowsFromRecruitment(recruitmentApplicant)));
          }
        } catch { /* best effort */ }
      })
      .subscribe();
    return () => { void (supabase as any).removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Saved document review history (resubmission requests, validate, undo).
  const reloadDocEvents = async () => {
    if (!applicant?.id) return;
    const result = await listDocumentEvents(applicant.id);
    if (result.ok) setDocEvents(result.events);
    setDocEventsLoaded(true);
  };

  useEffect(() => {
    void reloadDocEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant?.id, attachments]);

  const fullName = useMemo(() => (applicant ? getFullName(applicant) : ''), [applicant]);
  const resolvedStatus = recruitmentApplicant?.status || applicant?.status;
  const badge = statusBadge(resolvedStatus);
  const isRspAdmin = location.pathname.startsWith('/admin/rsp/');
  const showJobPostActionButtons = true;
  const isForcedPromotionalAppointment = isPromotionalSource(recruitmentApplicant, applicant);
  // Resolved through the workflow module rather than by matching substrings.
  // 'Shortlisted' now means the applicant passed document screening, so the
  // old `includes('shortlist')` test made a screened applicant read as pending
  // a resubmission — the two states are opposites.
  const workflowStatus = normalizeStatus(resolvedStatus ?? '');
  const isApplicantDisqualified = workflowStatus === 'Disqualified';
  const isApplicantQualified = workflowStatus === 'Qualified' || workflowStatus === 'Selected';
  const isApplicantPending = workflowStatus === 'Pending';
  const primaryEducation = recruitmentApplicant?.education?.[0] ?? null;
  const primaryExperience = recruitmentApplicant?.experience?.[0] ?? null;

  // Sync the mutually-exclusive status toggle from the persisted resolvedStatus
  useEffect(() => {
    const norm = normalizeStatus(resolvedStatus ?? '');
    if (norm === 'Disqualified' || norm === 'Not Selected') {
      setApplicantStatus('disqualify');
    } else if (norm === 'Pending') {
      setApplicantStatus('shortlist');
    } else if (norm === 'Qualified' || norm === 'Selected') {
      setApplicantStatus('qualified');
    } else {
      setApplicantStatus(null);
    }
  }, [resolvedStatus]);

  useEffect(() => {
    if (!id) return;
    if (!isForcedPromotionalAppointment) return;

    saveStoredAppointmentType(id, 'promotional');
  }, [id, isForcedPromotionalAppointment]);

  const handleSaveNotes = () => {
    if (!recruitmentApplicant || !notes.trim()) return;
    const now = new Date().toISOString();
    const nextApplicants = getApplicants().map((entry) => {
      if (entry.id !== recruitmentApplicant.id) return entry;
      return {
        ...entry,
        notes: [{ author: 'RSP Staff', content: notes.trim(), date: now, pinned: false }, ...entry.notes],
        timeline: [...entry.timeline, { event: 'Internal note added', date: now, actor: 'RSP Staff' }],
      };
    });
    saveApplicants(nextApplicants);
    setRecruitmentApplicant(nextApplicants.find((entry) => entry.id === recruitmentApplicant.id) ?? recruitmentApplicant);
    window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
  };

  const EMAIL_TEMPLATES: Record<string, { subject: string; body: string }> = {
    missing_documents: {
      subject: 'Incomplete Requirements for Your Application',
      body: `Dear ${fullName},\n\nWe have reviewed your application and noticed that some required documents are missing. Please submit the missing documents at your earliest convenience to continue with the recruitment process.\n\nThank you for your interest in joining our organization.\n\nBest regards,\nRecruitment Team`,
    },
    incorrect_format: {
      subject: 'Document Format Issue – Action Required',
      body: `Dear ${fullName},\n\nWe noticed that one or more of your submitted documents are in an incorrect file format. Please resubmit the affected documents in the accepted format (PDF or Word).\n\nThank you for your cooperation.\n\nBest regards,\nRecruitment Team`,
    },
    invalid_information: {
      subject: 'Clarification Needed on Your Application',
      body: `Dear ${fullName},\n\nWe have reviewed your application and found some information that requires clarification. Please contact us at your earliest convenience to address this matter.\n\nThank you.\n\nBest regards,\nRecruitment Team`,
    },
    schedule_interview: {
      subject: 'Interview Schedule for Your Application',
      body: `Dear ${fullName},\n\nCongratulations! We are pleased to inform you that you have been selected for an interview. Please expect a follow-up communication regarding the interview schedule.\n\nWe look forward to meeting you.\n\nBest regards,\nRecruitment Team`,
    },
    custom: {
      subject: '',
      body: '',
    },
  };

  const handleEmailTemplateChange = (value: string) => {
    setEmailTemplate(value);
    if (value && value !== 'custom' && EMAIL_TEMPLATES[value]) {
      setEmailSubject(EMAIL_TEMPLATES[value].subject);
      setEmailBody(EMAIL_TEMPLATES[value].body);
    } else if (value === 'custom') {
      setEmailSubject('');
      setEmailBody('');
    }
  };


  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    if (!applicant?.email) {
      setEmailError({
        message: 'This applicant has no email address on file.',
        nextStep: 'Ask RSP to add an email address, then try again.',
      });
      return;
    }

    setEmailSending(true);
    setEmailError(null);
    setEmailSuccess(null);

    try {
      const fullBody = emailNotes.trim()
        ? `${emailBody}\n\n---\nAdditional Notes from RSP Admin:\n${emailNotes.trim()}`
        : emailBody;
      const result = await sendEmail({
        to: applicant.email,
        subject: emailSubject.trim(),
        body: fullBody,
        applicantId: applicant.id,
        template: emailTemplate || undefined,
      });
      setEmailSuccess(`Email sent to ${result.deliveredTo.join(', ') || applicant.email}.`);
      // Auto-close after a short pause so the admin sees the confirmation.
      window.setTimeout(() => {
        setShowSendEmailModal(false);
        setEmailSuccess(null);
      }, 1200);
    } catch (error) {
      const described = describeActionFailure('send this email', error);
      setEmailError({ message: described.message, nextStep: described.nextStep });
    } finally {
      setEmailSending(false);
    }
  };

  const persistStatus = async (
    action: 'shortlist' | 'unshortlist' | 'qualified' | 'disqualify' | 'document_verified' | 'action_required' | 'under_review',
    disqualifyDetails?: {
      reasonCategory: string;
      message: string;
      messageVisible: boolean;
      missedActivity?: MissedActivity | null;
    },
  ) => {
    // Only `applicant` (the ApplicantRecord from DB) is required. The richer
    // `recruitmentApplicant` (Applicant with notes/timeline/etc) may be null for
    // Supabase-only rows that were never mirrored to the recruitment local store.
    if (!applicant) {
      console.warn('[ApplicantDetailsPage] persistStatus called before applicant loaded');
      return;
    }

    // Immediately update local status for instant UI feedback
    if (action === 'shortlist' || action === 'qualified' || action === 'disqualify') {
      setApplicantStatus(action);
    } else if (action === 'unshortlist') {
      setApplicantStatus(null);
    }

    const statusMap: Record<string, Applicant['status']> = {
      // Spec §7: the Shortlist action was renamed Pending. It means the
      // application cannot proceed until something is resubmitted or
      // corrected — the opposite of Shortlisted, which now means the applicant
      // cleared screening. Keeping it on 'Shortlisted' would have told a
      // resubmitting applicant they had passed.
      shortlist: 'Pending',
      unshortlist: 'Under Review',
      // The Qualify button here is gated on documents alone — qualifyLocked
      // only checks that every required document is uploaded, reviewed and
      // approved. That is the screening decision, so it stores Shortlisted:
      // passed initial screening, awaiting an interview/exam schedule. It used
      // to store 'Recommended for Hiring', the same value the post-ranking
      // action wrote, which made the two stages indistinguishable afterwards.
      qualified: 'Shortlisted',
      disqualify: 'Not Qualified',
      document_verified: 'Document Verified',
      // Same state, the name the specification uses.
      action_required: 'Pending',
      under_review: 'Under Review',
    };
    const nextStatus = statusMap[action];
    // The legacy free-text `disqualification_reason` field (and this same string
    // reused for the activity-log description) is read unconditionally by older
    // UI — it must never carry the admin's message unless messageVisible is on,
    // or the visibility toggle would be meaningless.
    const reason = action === 'disqualify' && disqualifyDetails
      ? buildDisqualificationActivityDescription(
        disqualifyDetails.reasonCategory,
        disqualifyDetails.messageVisible ? disqualifyDetails.message : '',
      )
      : null;

    // Go straight to Supabase — this is the single source of truth the public
    // tracker also reads from. (A backend-API PATCH path used to run first,
    // but it and this fallback always ended up writing the same values, so
    // it was removed as a redundant hop.)
    let persisted = false;
    let disqualifiedByUserId: string | null = null;

    try {
      const dbUpdate: Record<string, unknown> = {
        status: nextStatus,
        // Explicitly bump updated_at so the Supabase real-time subscription
        // always fires on the tracker side, even if status didn't change text.
        updated_at: new Date().toISOString(),
      };
      if (action === 'disqualify') {
        dbUpdate.disqualification_reason = reason || null;
        dbUpdate.disqualified_at = new Date().toISOString();
        dbUpdate.disqualification_reason_category = disqualifyDetails?.reasonCategory ?? null;
        dbUpdate.disqualification_message_visible = disqualifyDetails?.messageVisible ?? false;

        // Spec §8: the activity a no-show missed is frozen onto the applicant
        // now. Reading it back off exam_date/interview_date when it is shown
        // would let a later schedule edit rewrite the record of what happened.
        const missed = disqualifyDetails?.missedActivity ?? null;
        const isNoShowReason = disqualifyDetails?.reasonCategory === FAILURE_TO_ATTEND;
        dbUpdate.missed_activity_type = isNoShowReason && missed ? missed.type : null;
        dbUpdate.missed_activity_date = isNoShowReason && missed ? missed.date : null;
        dbUpdate.missed_activity_time = isNoShowReason && missed ? missed.time : null;

        // The admin's note stays the admin's note. Spec §9 Option A — telling
        // the applicant they were disqualified for not attending — is rendered
        // by the tracker from the reason category and the recorded activity,
        // which are always visible. Folding that sentence in here would have
        // hidden it whenever the admin left the visibility box unticked, which
        // is the one case where the applicant most needs the reason.
        dbUpdate.disqualification_message = disqualifyDetails?.message?.trim() || null;
        dbUpdate.is_final = true;
        try {
          const { data: userData } = await (supabase as any).auth.getUser();
          disqualifiedByUserId = userData?.user?.id ?? null;
        } catch { /* leave disqualified_by unset */ }
        dbUpdate.disqualified_by = disqualifiedByUserId;
      } else {
        // Clear any stale disqualification reason when moving out of that state.
        dbUpdate.disqualification_reason = null;
      }
      const { data: updatedRows, error } = await (supabase as any)
        .from('applicants')
        .update(dbUpdate)
        .eq('id', applicant.id)
        .select('id, status');
      if (error) {
        console.error('[ApplicantDetailsPage] supabase update error', error);
      } else if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
        console.error(
          '[ApplicantDetailsPage] supabase update returned 0 rows — likely RLS blocking UPDATE on applicants for this role',
        );
      } else {
        persisted = true;
        console.info('[ApplicantDetailsPage] supabase update ok', updatedRows[0]);

        if (action === 'disqualify') {
          try {
            await (supabase as any).from('application_activity_log').insert({
              application_id: applicant.id,
              event_type: 'disqualified',
              event_label: 'Application Disqualified',
              event_description: reason,
              created_by: disqualifiedByUserId,
              visible_to_applicant: true,
            });
          } catch (logErr) {
            console.warn('[ApplicantDetailsPage] activity log insert failed', logErr);
          }
        }
      }
    } catch (err) {
      console.error('[ApplicantDetailsPage] supabase update threw', err);
    }

    if (!persisted) {
      console.error(
        '[ApplicantDetailsPage] status NOT persisted to DB. Local UI updated only.',
      );
    }

    // Build an updated recruitment applicant (for the richer local store), using the
    // existing recruitmentApplicant as a base when available, or synthesizing a minimal
    // record from `applicant` fields otherwise.
    const now = new Date().toISOString();
    const baseNotes = recruitmentApplicant?.notes ?? [];
    const baseTimeline = recruitmentApplicant?.timeline ?? [];
    const nextNotes = reason
      ? [{ author: 'RSP Staff', content: `Disqualification reason: ${reason}`, date: now, pinned: false }, ...baseNotes]
      : baseNotes;
    const nextTimeline = [
      ...baseTimeline,
      { event: `Status updated to ${nextStatus}${reason ? ` — ${reason}` : ''}`, date: now, actor: 'RSP Staff' },
    ];

    const updated: Applicant = recruitmentApplicant
      ? { ...recruitmentApplicant, status: nextStatus, notes: nextNotes, timeline: nextTimeline }
      : {
        id: applicant.id,
        jobPostingId: '',
        personalInfo: {
          firstName: '',
          lastName: '',
          email: applicant.email ?? '',
          phone: applicant.contact_number ?? '',
          address: applicant.address ?? '',
          dateOfBirth: new Date('1995-01-01T00:00:00+08:00').toISOString(),
        },
        qualificationScore: 0,
        status: nextStatus,
        education: [],
        experience: [],
        skills: [],
        certifications: [],
        documents: [],
        applicationDate: applicant.created_at ?? now,
        notes: nextNotes,
        timeline: nextTimeline,
      };

    // Mirror to localStorage.
    const currentLocal = getApplicants();
    const localIndex = currentLocal.findIndex((entry) => entry.id === applicant.id);
    const nextApplicants = localIndex >= 0
      ? currentLocal.map((entry, i) => (i === localIndex ? updated : entry))
      : [...currentLocal, updated];
    saveApplicants(nextApplicants);

    setRecruitmentApplicant(updated);
    setApplicant((current) => (current ? { ...current, status: nextStatus } : current));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
    }
    // If qualified, navigate away (remove from current list). In a review queue
    // the page has already moved on to the next applicant.
    if (action === 'qualified' && !routeState?.navQueue) {
      setTimeout(() => {
        goBack(); // previous page/list, or the RSP home on a direct visit
      }, 500);
    }

    return persisted;
  };

  const navIndex = navQueue && applicant ? navQueue.findIndex((entry) => entry.id === applicant.id) : -1;
  const inReviewQueue = navQueue !== null && navIndex >= 0;
  const undecidedLeft = navQueue ? navQueue.filter((entry) => reviewOutcome(entry.status) === 'undecided').length : 0;

  const openQueueEntry = (entryId: string, queue: ReviewQueueEntry[]) => {
    navigate(`/admin/rsp/applicant/${entryId}`, { replace: true, state: { from: routeState?.from, navQueue: queue } });
  };

  // Holds the decision for the Undo window and moves on to the next undecided applicant.
  const decideAndAdvance = (
    action: 'qualified' | 'disqualify',
    disqualifyDetails?: Parameters<typeof persistStatus>[1],
  ) => {
    if (!navQueue || !applicant || navIndex < 0) return;
    const decidedStatus = action === 'disqualify' ? 'Not Qualified' : 'Shortlisted';
    const nextQueue = navQueue.map((entry, index) => (index === navIndex ? { ...entry, status: decidedStatus } : entry));
    schedulePendingDecision({
      applicantId: applicant.id,
      applicantName: fullName,
      label: action === 'disqualify' ? 'Disqualified' : 'Shortlisted',
      previousStatus: navQueue[navIndex].status,
      commit: async () => {
        const saved = await persistStatus(action, disqualifyDetails);
        if (saved === false) {
          notifyError(
            "We couldn't save that decision",
            `${fullName} was not updated. Open the applicant again and retry the decision.`,
          );
        }
      },
    });
    const nextIndex = nextUndecidedIndex(nextQueue, navIndex);
    if (nextIndex < 0) {
      setNavQueue(nextQueue);
      setReviewComplete(true);
      return;
    }
    openQueueEntry(nextQueue[nextIndex].id, nextQueue);
  };

  const handleUndoDecision = () => {
    const undone = cancelPendingDecision();
    if (!undone || !navQueue) return;
    const restoredQueue = navQueue.map((entry) =>
      entry.id === undone.applicantId ? { ...entry, status: undone.previousStatus } : entry,
    );
    setReviewComplete(false);
    if (undone.applicantId === applicant?.id) {
      setNavQueue(restoredQueue);
      return;
    }
    openQueueEntry(undone.applicantId, restoredQueue);
  };


  // ── Doc review helpers ────────────────────────────────────────────────────────
  const getDocReviewKey = (fileUrl: string) => `${id}::${fileUrl}`;

  const persistDocReview = (key: string, review: DocReview) => {
    const updated = { ...docReviews, [key]: review };
    setDocReviews(updated);
    localStorage.setItem(DOC_REVIEW_KEY, JSON.stringify(updated));
    return updated;
  };

  const addDocTimeline = (event: string) => {
    const now = new Date().toISOString();
    setRecruitmentApplicant((prev) => {
      if (!prev) return prev;
      return { ...prev, timeline: [...(prev.timeline ?? []), { event, date: now, actor: getAdminEmail('RSP') }] };
    });
  };

  const handleRequestResubmission = async (fileUrl: string, docType: string, remarks: string) => {
    if (!remarks.trim()) return;
    const key = getDocReviewKey(fileUrl);
    persistDocReview(key, { status: 'resubmission_requested', remarks: remarks.trim(), reviewedAt: new Date().toISOString() });
    addDocTimeline(`Action Required: Resubmission requested for ${docType} — "${remarks.trim()}".`);
    const statusSaved = await persistStatus('action_required');
    if (statusSaved === false) {
      throw new Error('The applicant status was not updated.');
    }
  };

  const handleOpenDocument = (filePath: string, fileName: string, label?: string) => {
    if (!filePath) return;
    const row = attachments.find((a) => a.file_path === filePath) ?? { file_path: filePath, file_name: fileName };
    setPreviewDocument(applicantViewerDocument(row, label));
    setOpenedDocFilePaths((prev) => new Set([...prev, filePath]));
  };

  const openResubmitModal = () => {
    setResubmitSelectedSlots([]);
    setResubmitReason('');
    setResubmitNotes('');
    setResubmitSuccess(null);
    setResubmitError(null);
    setShowResubmitModal(true);
  };

  // "Send Notice" is the modal's only action: a resubmission request always
  // names at least one document and a reason, and always emails the applicant.
  const handleSubmitResubmission = async () => {
    if (resubmitSelectedSlots.length === 0 || !resubmitReason.trim()) return;
    if (!applicant) return;
    setResubmitSending(true);
    setResubmitError(null);

    // No status write here. This used to set 'Shortlisted' first and then
    // 'Action Required' at the end, which — now that Shortlisted means the
    // applicant cleared screening — briefly told someone being asked to
    // resubmit that they had passed it. Realtime fires on every write, so the
    // applicant's tracker really did show it. The single write below is the
    // only one this flow needs.
    try {
      // Idempotency: a retry after a partial failure must not insert a second
      // notice for the same document and reason. Anything already recorded is
      // skipped; the status write and email still run.
      const { data: existingNotices } = await (supabase as any)
        .from('applicant_attachments')
        .select('file_name')
        .eq('applicant_id', applicant.id)
        .eq('document_type', 'resubmission_request');
      const existingNoticeNames = new Set<string>(
        (existingNotices ?? []).map((row: any) => String(row.file_name)),
      );

      // Insert a resubmission_request row in Supabase for each selected document.
      for (const slotLabel of resubmitSelectedSlots) {
        const slot = DOCUMENT_SLOTS.find((s) => s.label === slotLabel);
        if (!slot) continue;
        const matchedAtt = attachments.find((a) => {
          const resolvedType = a.document_type || FILE_NAME_TO_TYPE[a.file_name] || 'other';
          return resolvedType === slot.type && a.document_type !== 'resubmission_request' && a.document_type !== 'resubmission_resolved' && a.document_type !== 'doc_validated';
        });
        if (matchedAtt) {
          await handleRequestResubmission(matchedAtt.file_path, slotLabel, resubmitReason.trim());
        }
        const noticeName = `RESUBMIT::${slotLabel}::${resubmitReason.trim()}`;
        if (!existingNoticeNames.has(noticeName)) {
          const { error: insertError } = await (supabase as any).from('applicant_attachments').insert({
            applicant_id: applicant.id,
            file_name: noticeName,
            file_path: resubmitNotes.trim() || '—',
            document_type: 'resubmission_request',
            file_type: 'notice',
            file_size: 0,
          });
          if (insertError) throw insertError;
          existingNoticeNames.add(noticeName);
          const saved = await recordDocumentEvent({
            applicantId: applicant.id,
            eventType: 'resubmission_requested',
            documentType: slot.type,
            reason: resubmitNotes.trim() ? `${resubmitReason.trim()} — Note: ${resubmitNotes.trim()}` : resubmitReason.trim(),
            actorEmail: getAdminEmail('RSP'),
          });
          if (!saved.ok) console.warn('[handleSubmitResubmission] history event not saved for', slotLabel, saved.error);
        }
      }
      void reloadDocEvents();

      addDocTimeline(`Action Required: Resubmission requested for ${resubmitSelectedSlots.join(', ')} — "${resubmitReason.trim()}".`);
      await persistStatus('action_required');

      // Attempt email; failure is non-blocking.
      try {
        const docList = resubmitSelectedSlots.map((s) => `• ${s}`).join('\n');
        const notesSection = resubmitNotes.trim() ? `\n\nAdditional Notes from RSP:\n${resubmitNotes.trim()}` : '';
        await sendEmail({
          to: applicant.email,
          subject: `Notice of Resubmission — ${resubmitSelectedSlots.join(', ')}`,
          body: `Dear ${applicant.first_name},\n\nThe following submitted document(s) require resubmission:\n${docList}\n\nReason: ${resubmitReason.trim()}${notesSection}\n\nPlease log in to the Applicant Portal and re-upload the corrected document(s) at your earliest convenience.\n\nThank you,\nRecruitment Office`,
          applicantId: applicant.id,
        });
      } catch (err) {
        console.warn('[handleSubmitResubmission] Email failed:', err);
      }

      notifySuccess(
        'Resubmission notice sent',
        `${resubmitSelectedSlots.length} document${resubmitSelectedSlots.length === 1 ? '' : 's'} updated in the tracker.`,
      );
      // Auto-close modal and reset state.
      setShowResubmitModal(false);
      setResubmitSelectedSlots([]);
      setResubmitReason('');
      setResubmitNotes('');
    } catch (error) {
      console.error('[handleSubmitResubmission] failed', error);
      const described = describeActionFailure('send the resubmission notice', error);
      setResubmitError(
        'The notice did not finish sending. Some document requests may already be recorded — check the document history before trying again.',
      );
      notifyError(described.title, 'Some document requests may already be recorded. Check the history before retrying.');
    } finally {
      setResubmitSending(false);
    }
  };

  const handleValidateAllDocs = async () => {
    if (!id || !applicant?.id) return;
    setValidationError(null);
    try {
      const realDocs = attachments.filter(
        (a) => a.document_type !== 'resubmission_request' &&
          a.document_type !== 'resubmission_resolved' &&
          a.document_type !== 'doc_validated',
      );
      // Read the validated set from the database, not the last page render, so
      // a retry after a partial failure does not insert the same marker twice.
      const { data: validatedRows } = await (supabase as any)
        .from('applicant_attachments')
        .select('file_name')
        .eq('applicant_id', applicant.id)
        .eq('document_type', 'doc_validated');
      const existingValidatedTypes = new Set<string>(
        (validatedRows ?? []).map((row: any) => String(row.file_name)),
      );
      for (const att of realDocs) {
        const rawDocType = (att.document_type as string | null) || FILE_NAME_TO_TYPE[att.file_name] || 'other';
        if (!existingValidatedTypes.has(rawDocType)) {
          const { error: insertError } = await (supabase as any).from('applicant_attachments').insert({
            applicant_id: applicant.id,
            file_name: rawDocType,
            file_path: `validated::${rawDocType}`,
            document_type: 'doc_validated',
            file_type: 'validation',
            file_size: 0,
          });
          if (insertError) throw insertError;
          existingValidatedTypes.add(rawDocType);
        }
      }
      setDocsValidated(true);
      addDocTimeline('Documents Validated: All submitted documents have been reviewed and validated.');
      const saved = await recordDocumentEvent({ applicantId: applicant.id, eventType: 'validated', actorEmail: getAdminEmail('RSP') });
      if (!saved.ok) console.warn('[handleValidateAllDocs] history event not saved:', saved.error);
      void reloadDocEvents();
      void (supabase as any).from('applicants').update({ updated_at: new Date().toISOString() }).eq('id', applicant.id);
      notifySuccess('Documents validated', 'The applicant tracker now shows Verified.');
    } catch (error) {
      console.error('[handleValidateAllDocs] failed', error);
      const described = describeActionFailure('validate these documents', error);
      setValidationError('Some documents could not be validated. Refresh the page and check which ones still need review.');
      notifyError(described.title, 'Some documents may not be validated. Refresh before retrying.');
    }
  };

  const handleConfirmValidate = async () => {
    setValidationBusy(true);
    try {
      await handleValidateAllDocs();
    } finally {
      setValidationBusy(false);
      setConfirmValidateOpen(false);
    }
  };

  // Undo is allowed until an exam or interview is scheduled; the database
  // enforces the same lock.
  const isScheduledForAssessment = Boolean(
    applicant?.exam_date || applicant?.oral_exam_date || applicant?.interview_date,
  );

  const handleUndoValidation = async () => {
    if (!applicant?.id || isScheduledForAssessment) return;
    setValidationBusy(true);
    setValidationError(null);
    const result = await undoDocumentValidation(applicant.id, getAdminEmail('RSP'));
    setValidationBusy(false);
    if (!result.ok) {
      setValidationError(
        result.locked
          ? 'Validation can no longer be undone: an exam or interview is already scheduled.'
          : "We couldn't undo the validation. Check your connection and try again.",
      );
      return;
    }
    setDocsValidated(false);
    setAttachments((prev) => prev.filter((a) => a.document_type !== 'doc_validated'));
    const remainingReviews = Object.fromEntries(
      Object.entries(docReviews).filter(([key, review]) => !(key.startsWith(`${id}::`) && review.status === 'approved')),
    );
    setDocReviews(remainingReviews);
    localStorage.setItem(DOC_REVIEW_KEY, JSON.stringify(remainingReviews));
    addDocTimeline('Document Validation Undone.');
    void reloadDocEvents();
    notifySuccess('Validation undone', 'The applicant tracker is back to its previous state.');
  };

  const isDocLocked = () => {
    const s = normalizeText(resolvedStatus ?? '');
    return s.includes('disqualif') || s.includes('not qualified') || s.includes('failed');
  };


  if (loading) {
    return <div className="p-8 text-slate-600">Loading applicant details...</div>;
  }

  if (!applicant) {
    return <div className="p-8 text-red-600">Applicant not found.</div>;
  }

  return (
    <div className={isRspAdmin ? 'rsp-ds min-h-screen bg-[var(--bg-page)]' : 'ds-remap abyan-tokens min-h-screen bg-slate-100'}>
      {isRspAdmin && <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />}
      <div className={isRspAdmin ? 'admin-layout' : ''}>
        {isRspAdmin && <Sidebar activeModule="RSP" userRole="rsp" />}
        <main className={isRspAdmin ? 'admin-content bg-white !p-0' : 'bg-slate-100 !p-0'}>
          <header className="border-b border-slate-200 bg-white px-6 py-4">
            <BackButton className="mb-3" onBack={goBack} />
            {navQueue && inReviewQueue && (
              <div className="mb-3 flex items-center justify-end gap-3">
                {navQueue.length <= MAX_PROGRESS_DOTS && (
                  <div className="flex items-center gap-1" aria-hidden="true">
                    {navQueue.map((entry, index) => {
                      const outcome = reviewOutcome(entry.status);
                      return (
                        <span
                          key={entry.id}
                          title={entry.name}
                          className={`h-2 w-2 rounded-full ${index === navIndex
                              ? 'bg-white ring-2 ring-blue-600 ring-offset-1'
                              : outcome === 'shortlisted'
                                ? 'bg-emerald-500'
                                : outcome === 'disqualified'
                                  ? 'bg-rose-500'
                                  : 'bg-slate-200'
                            }`}
                        />
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous applicant"
                    disabled={navIndex === 0}
                    onClick={() => openQueueEntry(navQueue[navIndex - 1].id, navQueue)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="min-w-[3.5rem] text-center text-xs font-semibold tabular-nums text-slate-700">
                    {navIndex + 1} / {navQueue.length}
                  </span>
                  <button
                    type="button"
                    aria-label="Next applicant"
                    disabled={navIndex === navQueue.length - 1}
                    onClick={() => openQueueEntry(navQueue[navIndex + 1].id, navQueue)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-start justify-between gap-4">
              {/* Profile card inline */}
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                  <User size={28} />
                </div>
                <div>
                  <h1 className="!mb-0 text-xl font-bold text-slate-900">{fullName}</h1>
                  <p className="text-sm text-slate-500">{applicant.position || applicant.office || 'Applicant'}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${normalizeText(resolvedStatus ?? '').includes('pending') || !resolvedStatus ? 'border-amber-300 bg-amber-100 text-amber-700' : badge.className}`}>
                      {(normalizeText(resolvedStatus ?? '').includes('pending') || !resolvedStatus) ? 'Under Review' : badge.label}
                    </span>
                    {applicant.reference_no && (
                      <span
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                        title="Reference No."
                      >
                        {applicant.reference_no}
                      </span>
                    )}
                    {applicant.office && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">{applicant.office}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">

                {showJobPostActionButtons && (() => {
                  const hasResubmissionPending = attachments.some((a) => (docReviews[getDocReviewKey(a.file_path)]?.status ?? 'pending') === 'resubmission_requested');

                  // Spec (Qualification Verification Requirement → Document
                  // Completion Validation): the Qualify button must remain
                  // disabled until every required document has been uploaded,
                  // reviewed, AND approved. Auto-derive these so the lock is
                  // automatic, not dependent on the manual "Validate Documents"
                  // click.
                  const requiredSlotTypes = DOCUMENT_SLOTS.filter((s) => s.required).map((s) => s.type);
                  const requiredAttachments = requiredSlotTypes.map((type) =>
                    attachments.find((a) => (a.document_type || FILE_NAME_TO_TYPE[a.file_name] || 'other') === type)
                  );
                  const allRequiredUploaded = requiredAttachments.every(Boolean);
                  const allRequiredReviewed = requiredAttachments.every((a) => {
                    if (!a) return false;
                    const review = docReviews[getDocReviewKey(a.file_path)];
                    return review?.status === 'approved' || review?.status === 'resubmission_requested';
                  });
                  const allRequiredApproved = requiredAttachments.every((a) => {
                    if (!a) return false;
                    return docReviews[getDocReviewKey(a.file_path)]?.status === 'approved';
                  });
                  const autoDocsCleared = allRequiredUploaded && allRequiredReviewed && allRequiredApproved;

                  const qualifyLocked = !(docsValidatedEffective || autoDocsCleared) || hasResubmissionPending;
                  const qualifyTitle =
                    hasResubmissionPending
                      ? 'Some documents require resubmission'
                      : !allRequiredUploaded
                        ? 'All required documents must be uploaded before qualification.'
                        : !allRequiredReviewed
                          ? 'All required documents must be reviewed before qualification.'
                          : !allRequiredApproved
                            ? 'All required documents must be approved before qualification.'
                            : undefined;
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => { setConfirmAction('disqualify'); setConfirmReason(''); }}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm ${isApplicantDisqualified
                            ? 'border-rose-500 bg-rose-500 text-white'
                            : 'border-rose-400 bg-white text-rose-600 hover:bg-rose-50'
                          }`}
                      >
                        <CircleX size={14} /> Disqualify
                      </button>
                      <button
                        type="button"
                        // Once documents are validated the applicant has moved past the
                        // "needs more documents" step, so Pending no longer applies.
                        disabled={isApplicantDisqualified || (docsValidatedEffective && !isApplicantPending)}
                        title={
                          docsValidatedEffective && !isApplicantPending
                            ? 'Documents are already validated — nothing is outstanding for this applicant to resubmit'
                            : undefined
                        }
                        onClick={() => {
                          if (isApplicantPending) {
                            void persistStatus('unshortlist');
                          } else {
                            openResubmitModal();
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${isApplicantPending
                            ? 'border-[#363EE8] bg-[#363EE8] text-white'
                            : 'border-[#363EE8] bg-white text-[#363EE8] hover:bg-blue-50'
                          }`}
                      >
                        <Star size={14} /> {isApplicantPending ? 'Undo Pending' : 'Pending'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (!qualifyLocked) setConfirmAction('qualified'); }}
                        disabled={qualifyLocked}
                        title={qualifyTitle}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${isApplicantQualified
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-emerald-500 bg-white text-emerald-600 hover:bg-emerald-50'
                          }`}
                      >
                        <CheckCircle2 size={14} /> Shortlist
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          </header>

          <div className="border-b border-slate-200 bg-white px-4">
            <div className="flex items-center gap-4 text-sm">
              {[
                { key: 'overview', label: 'Overview', icon: User },
                { key: 'documents', label: 'Documents', icon: FileText },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    className={`inline-flex items-center gap-1.5 border-b-2 pb-2 pt-2.5 font-semibold ${activeTab === tab.key ? 'border-[#363EE8] text-[#363EE8]' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
                    onClick={() => setActiveTab(tab.key as TabKey)}
                  >
                    <Icon className="h-3.5 w-3.5" /> {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <section className="p-3">
            <div className="h-[calc(100vh-165px)] overflow-hidden">
              <section className="h-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
                {activeTab === 'overview' && (
                  <div className="space-y-3">
                    <article className="rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                        <h3 className="!mb-0 text-sm font-bold uppercase tracking-wide text-slate-500">Personal Information</h3>
                        {/* RSP corrects submitted details; the interviewer view stays read-only. */}
                        {isRspAdmin && (
                          <span className="abyan-ds">
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowEditDetails(true)}>
                              <Pencil size={16} /> Edit
                            </button>
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-slate-100 px-4">
                        <div className="flex items-start justify-between py-2.5"><span className="text-xs font-semibold text-slate-500 w-36 shrink-0">Full Name</span><span className="text-sm text-slate-800 text-right">{fullName}</span></div>
                        <div className="flex items-start justify-between py-2.5"><span className="text-xs font-semibold text-slate-500 w-36 shrink-0">Email Address</span><span className="text-sm text-slate-800 text-right">{applicant.email || '--'}</span></div>
                        <div className="flex items-start justify-between py-2.5"><span className="text-xs font-semibold text-slate-500 w-36 shrink-0">Phone Number</span><span className="text-sm text-slate-800 text-right">{applicant.contact_number || '--'}</span></div>
                        <div className="flex items-start justify-between py-2.5"><span className="text-xs font-semibold text-slate-500 w-36 shrink-0">Address</span><span className="text-sm text-slate-800 text-right">{applicant.address || '--'}</span></div>
                        <div className="flex items-start justify-between py-2.5"><span className="text-xs font-semibold text-slate-500 w-36 shrink-0">PWD Status</span><span className="text-sm text-slate-800 text-right">{applicant.is_pwd === true ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">PWD</span> : 'Not a PWD'}</span></div>
                      </div>
                    </article>

                    <article className="rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                        <h3 className="!mb-0 text-sm font-bold uppercase tracking-wide text-slate-500">Qualifications</h3>
                        {isRspAdmin && (
                          <span className="abyan-ds">
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowEditDetails(true)}>
                              <Pencil size={16} /> Edit
                            </button>
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-slate-100 px-4">
                        <div className="flex items-start justify-between py-2.5">
                          <span className="text-xs font-semibold text-slate-500 w-36 shrink-0">Education</span>
                          <span className="text-sm text-slate-800 text-right">
                            {(() => {
                              const row = applicant as any;
                              const attainment = String(row?.education_attainment ?? row?.education_level ?? '').trim();
                              const degree = String(row?.education_degree ?? '').trim();
                              const school = String(row?.education_school ?? '').trim();
                              const parts = [attainment, degree, school].filter(Boolean);
                              if (parts.length > 0) return parts.join(' · ');
                              if (primaryEducation) return [primaryEducation.degree, primaryEducation.school].filter(Boolean).join(', ') || '--';
                              return '--';
                            })()}
                          </span>
                        </div>
                        <div className="flex items-start justify-between py-2.5">
                          <span className="text-xs font-semibold text-slate-500 w-36 shrink-0">Work Experience</span>
                          <span className="text-sm text-slate-800 text-right">
                            {(() => {
                              const row = applicant as any;
                              const totalYearsRaw = row?.work_experience_years ?? row?.years_of_experience ?? primaryExperience?.years ?? null;
                              const monthsRaw = row?.work_experience_months;
                              const totalYears = totalYearsRaw == null ? null : Number(totalYearsRaw);
                              if (totalYears == null || !Number.isFinite(totalYears) || totalYears < 0) return '--';
                              const wholeYears = Math.floor(totalYears);
                              const derivedMonths = Math.round((totalYears - wholeYears) * 12);
                              const months = monthsRaw != null && Number.isFinite(Number(monthsRaw)) ? Number(monthsRaw) : derivedMonths;
                              const segments: string[] = [];
                              if (wholeYears > 0) segments.push(`${wholeYears} year${wholeYears === 1 ? '' : 's'}`);
                              if (months > 0) segments.push(`${months} month${months === 1 ? '' : 's'}`);
                              return segments.length > 0 ? segments.join(' ') : '0 months';
                            })()}
                          </span>
                        </div>
                        <div className="flex items-start justify-between py-2.5">
                          <span className="text-xs font-semibold text-slate-500 w-36 shrink-0">Application Date</span>
                          <span className="text-sm text-slate-800 text-right">{formatDate(applicant.created_at)}</span>
                        </div>
                      </div>
                    </article>

                    <article className="rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Internal Notes</h3>
                        <button type="button" className="text-xs font-semibold text-blue-600 hover:underline" onClick={() => setShowNoteEditor(true)}>Add Note</button>
                      </div>
                      {!notes.trim() && !showNoteEditor ? (
                        <div className="px-4 py-3 text-sm text-slate-400">
                          <p className="inline-flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> No notes yet.</p>
                        </div>
                      ) : (
                        <div className="px-4 py-3">
                          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add internal comments..." className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <div className="mt-2 flex gap-2">
                            <button type="button" onClick={handleSaveNotes} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Save Note</button>
                            <button type="button" onClick={() => setShowNoteEditor(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700">Cancel</button>
                          </div>
                        </div>
                      )}
                    </article>
                  </div>
                )}

                {activeTab === 'documents' && (
                  <article className="rounded-xl border border-slate-200">
                    {(() => {
                      const realAttachments = attachments.filter(
                        (a) => a.document_type !== 'resubmission_request' && a.document_type !== 'resubmission_resolved' && a.document_type !== 'doc_validated',
                      );
                      return (
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Submitted Documents</h3>
                          {!isDocLocked() && realAttachments.length > 0 && (
                            <div className="relative flex items-center gap-2">
                              {docsValidatedEffective ? (
                                <>
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                                    <CheckCircle2 size={12} /> Validated
                                  </span>
                                  <span className="abyan-ds">
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-secondary"
                                      onClick={() => void handleUndoValidation()}
                                      disabled={validationBusy || isScheduledForAssessment}
                                      title={
                                        isScheduledForAssessment
                                          ? 'Locked: an exam or interview is already scheduled'
                                          : 'Undo the document validation'
                                      }
                                    >
                                      {validationBusy
                                        ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                                        : isScheduledForAssessment ? <Lock size={16} /> : <RotateCcw size={16} />} Undo
                                    </button>
                                  </span>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmValidateOpen(true)}
                                  aria-haspopup="dialog"
                                  aria-expanded={confirmValidateOpen}
                                  disabled={docsAwaitingValidation.length === 0}
                                  title={
                                    docsAwaitingValidation.length === 0
                                      ? 'No submitted documents are awaiting validation'
                                      : `Validate all ${docsAwaitingValidation.length} submitted document(s)`
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                                  style={{ borderColor: '#059669', color: '#059669', backgroundColor: '#f0fdf4' }}
                                >
                                  <CheckCircle2 size={12} /> Validate Documents
                                </button>
                              )}
                              {confirmValidateOpen && !docsValidatedEffective && (
                                <div
                                  role="dialog"
                                  aria-label="Confirm document validation"
                                  className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
                                  onKeyDown={(e) => { if (e.key === 'Escape') setConfirmValidateOpen(false); }}
                                >
                                  <p className="!mb-0 text-sm font-semibold text-[#040E6B]">Are you sure?</p>
                                  <p className="!mb-0 mt-1 text-xs text-slate-600">
                                    This validates all {docsAwaitingValidation.length} submitted document(s). You can undo it until an exam or interview is scheduled.
                                  </p>
                                  <div className="abyan-ds mt-3 flex justify-end gap-2">
                                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setConfirmValidateOpen(false)} autoFocus>
                                      Cancel
                                    </button>
                                    <button type="button" className="btn btn-sm btn-primary" disabled={validationBusy} aria-busy={validationBusy || undefined} onClick={() => void handleConfirmValidate()}>
                                      {validationBusy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Validate
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {(() => {
                      const validationLog = docEvents.filter((e) => e.event_type !== 'resubmission_requested');
                      if (validationLog.length === 0 && !validationError) return null;
                      return (
                        <div className="border-b border-slate-200 px-4 py-2.5 text-xs">
                          {validationError && <p className="!mb-1 font-medium text-[#B42323]">{validationError}</p>}
                          {docsValidatedEffective && isScheduledForAssessment && (
                            <p className="!mb-1 inline-flex items-center gap-1 text-slate-500">
                              <Lock size={12} /> Validation is locked: an exam or interview is scheduled.
                            </p>
                          )}
                          <ul className="space-y-0.5">
                            {validationLog.map((e) => (
                              <li key={e.id} className="text-slate-600">
                                <span className="font-semibold text-[#040E6B]">{e.event_type === 'validated' ? 'Validated' : 'Validation undone'}</span>
                                {' · '}{formatDateTime(e.created_at)} · {e.actor_email || 'RSP'}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}

                    {isDocLocked() && (
                      <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                        <div>
                          <p className="text-sm font-semibold text-rose-700">Application Closed</p>
                          <p className="text-xs text-rose-600">This applicant has been disqualified or failed. Document review and resubmission are locked.</p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 p-4">
                      {DOCUMENT_SLOTS.map((slot, idx) => {
                        // All real submissions for this slot, oldest first
                        const matched = attachments
                          .filter(a => {
                            const resolvedType = a.document_type || FILE_NAME_TO_TYPE[a.file_name] || 'other';
                            return resolvedType === slot.type && a.document_type !== 'resubmission_request' && a.document_type !== 'resubmission_resolved';
                          })
                          .sort((x, y) => new Date(x.created_at ?? '').getTime() - new Date(y.created_at ?? '').getTime());
                        // CV is no longer a requirement: only list it when an older application has one.
                        if (slot.type === 'curriculum_vitae' && matched.length === 0) return null;

                        // Resubmission notice for this slot from Supabase
                        const slotNotice = attachments.find(a =>
                          a.document_type === 'resubmission_request' &&
                          a.file_name.split('::')[1] === slot.label
                        );

                        const isSubmitted = matched.length > 0;
                        const hasSupabaseResubmissionRequest = Boolean(slotNotice);
                        const latestDoc = matched[matched.length - 1];
                        const latestApproved = latestDoc ? docReviews[getDocReviewKey(latestDoc.file_path)]?.status === 'approved' : false;

                        return (
                          <article key={slot.type} className={`rounded-xl border ${hasSupabaseResubmissionRequest ? 'border-amber-300 bg-amber-50/30' : latestApproved ? 'border-emerald-300 bg-emerald-50/40' : isSubmitted ? 'border-blue-200 bg-blue-50/20' : 'border-dashed border-slate-200 bg-slate-50/50'}`}>
                            <div className="flex items-start gap-2.5 px-3 py-3">
                              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${hasSupabaseResubmissionRequest ? 'bg-amber-100 text-amber-700' : isSubmitted ? 'bg-[#363EE8]/10 text-[#363EE8]' : 'bg-slate-100 text-slate-400'}`}>
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <span className="text-sm font-semibold" style={{ color: '#040E6B' }}>{slot.label}</span>
                                  {hasSupabaseResubmissionRequest && (
                                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Resubmission Requested</span>
                                  )}
                                </div>

                                {!isSubmitted && (
                                  <p className="mt-1 text-xs italic text-slate-400">Not yet submitted</p>
                                )}

                                {/* History of this document, newest first: current
                                    version, re-uploads and resubmission requests,
                                    then the original upload. */}
                                {(() => {
                                  const eventRequests = docEvents
                                    .filter((e) => e.event_type === 'resubmission_requested' && e.document_type === slot.type)
                                    .map((e) => ({ id: e.id, reason: e.reason ?? '', created_at: e.created_at, actorEmail: e.actor_email }));
                                  // Requests saved before the history table existed: no RSP user recorded.
                                  const legacyRequests = attachments
                                    .filter((a) => a.document_type === 'resubmission_request' && a.file_name.split('::')[1] === slot.label)
                                    .map((a) => {
                                      const reason = a.file_name.split('::')[2] ?? '';
                                      const notes = a.file_path === '—' ? '' : a.file_path;
                                      return { id: a.id, reason: notes ? `${reason} — Note: ${notes}` : reason, created_at: a.created_at ?? '', actorEmail: null };
                                    });
                                  const history = buildDocumentHistory(matched, mergeResubmissionRequests(eventRequests, legacyRequests));

                                  return history.map((entry) => {
                                    if (entry.kind === 'resubmission_request') {
                                      return (
                                        <div key={`req-${entry.id}`} className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">Resubmission requested</span>
                                          {entry.reason && <p className="!mb-0 mt-1 text-amber-800"><span className="font-semibold">Reason:</span> {entry.reason}</p>}
                                          <p className="!mb-0 mt-0.5 text-slate-500">
                                            {formatDateTime(entry.date)} · {entry.actorEmail || 'RSP (user not recorded)'}
                                          </p>
                                        </div>
                                      );
                                    }
                                    const approved = docReviews[getDocReviewKey(entry.filePath)]?.status === 'approved';
                                    return (
                                      <div key={entry.id} className={`mt-2 rounded-lg border px-3 py-2 ${entry.isCurrent ? 'border-blue-200 bg-white' : 'border-slate-100 bg-slate-50'}`}>
                                        <button className="w-full text-left" onClick={() => handleOpenDocument(entry.filePath, entry.fileName, entry.label)}>
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${entry.isCurrent ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                              {entry.label}
                                            </span>
                                            {entry.isCurrent && approved && (
                                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">✓ Approved</span>
                                            )}
                                          </div>
                                          <p className="!mb-0 mt-1 truncate text-xs text-slate-500">{entry.fileName}</p>
                                          <p className="!mb-0 text-xs text-slate-400">Uploaded {formatDateTime(entry.date || applicant.created_at)}</p>
                                        </button>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </article>
                )}
              </section>
            </div>
          </section>
        </main>

        {showEditDetails && (
          <EditApplicantDetailsModal
            applicant={applicant}
            onClose={() => setShowEditDetails(false)}
            onSaved={(patch) => {
              // Mirror the saved columns, plus the aliases this page reads first.
              setApplicant((prev) => prev && ({
                ...prev,
                ...patch,
                education_attainment: patch.education_level,
                work_experience_years: patch.years_of_experience,
                work_experience_months: null,
              } as ApplicantRecord));
              setShowEditDetails(false);
            }}
          />
        )}

        {showSendEmailModal && (
          <div className="fixed inset-0 z-[270] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSendEmailModal(false)}>
            <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
              {/* Blue header */}
              <div className="flex items-center gap-4 bg-blue-600 px-6 py-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                  <Mail size={24} className="text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-white">Send Email to Applicant</h2>
                  <p className="text-sm text-blue-100">Notify applicant about their application</p>
                </div>
                <button type="button" onClick={() => setShowSendEmailModal(false)} className="rounded-lg p-2 text-white/80 hover:bg-white/10">
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Recipient row */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">TO:</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{applicant?.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">APPLICANT NAME:</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{fullName || '—'}</p>
                  </div>
                </div>

                {/* Template selector */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Message Template <span className="font-normal text-slate-400">(Optional)</span></label>
                  <select
                    value={emailTemplate}
                    onChange={(e) => handleEmailTemplateChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">Select a template...</option>
                    <option value="missing_documents">Missing Documents</option>
                    <option value="incorrect_format">Incorrect File Format</option>
                    <option value="invalid_information">Invalid Information</option>
                    <option value="schedule_interview">Schedule Interview</option>
                    <option value="custom">Custom Message</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-400">Choose a pre-written template or write a custom message</p>
                </div>

                {/* Subject line */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Subject Line <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="e.g., Incomplete Requirements for Your Application"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                {/* Message body */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Message <span className="text-rose-500">*</span></label>
                  <textarea
                    rows={7}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="Write your message here..."
                    className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <p className="mt-1 text-xs text-slate-400">Be clear and professional in your communication</p>
                </div>

                {/* Additional Notes from RSP Admin */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Additional Notes from RSP Admin <span className="font-normal text-slate-400">(Optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={emailNotes}
                    onChange={(e) => setEmailNotes(e.target.value)}
                    placeholder="Add any internal notes or specific instructions for the applicant..."
                    className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <p className="mt-1 text-xs text-slate-400">These notes will be appended to the email message</p>
                </div>

                {/* Applicant Documents Summary */}
                <div>
                  <p className="mb-3 text-sm font-bold text-slate-700">Applicant Documents Summary</p>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Submitted */}
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <FileText size={16} className="text-emerald-600" />
                        <span className="text-sm font-bold text-emerald-700">Submitted Documents</span>
                      </div>
                      {attachments.length > 0 ? (
                        <ul className="space-y-1">
                          {attachments.map((att) => (
                            <li key={att.id} className="flex items-center gap-1.5 text-xs text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {att.file_name}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-emerald-600">No documents submitted</p>
                      )}
                    </div>

                    {/* Missing */}
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <FileText size={16} className="text-rose-600" />
                        <span className="text-sm font-bold text-rose-700">Missing Documents</span>
                      </div>
                      {(() => {
                        const REQUIRED = ['Application Letter', 'Resume', 'Transcript of Records', 'Certifications', 'Personal Data Sheet'];
                        const submitted = attachments.map((a) => a.file_name.toLowerCase());
                        const missing = REQUIRED.filter((req) => !submitted.some((s) => s.includes(req.toLowerCase().split(' ')[0])));
                        return missing.length === 0 ? (
                          <p className="text-xs text-rose-600">All documents submitted</p>
                        ) : (
                          <ul className="space-y-1">
                            {missing.map((doc) => (
                              <li key={doc} className="flex items-center gap-1.5 text-xs text-rose-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                {doc}
                              </li>
                            ))}
                          </ul>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 bg-white px-6 py-4">
                {emailError && (
                  <ActionFeedback
                    className="mb-3"
                    title="We couldn't send this email."
                    message={emailError.message}
                    nextStep={emailError.nextStep}
                    onDismiss={() => setEmailError(null)}
                  />
                )}
                {emailSuccess && (
                  <ActionFeedback
                    className="mb-3"
                    tone="success"
                    title="Email sent"
                    message={emailSuccess}
                    focusOnMount={false}
                  />
                )}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowSendEmailModal(false); setEmailError(null); setEmailSuccess(null); setEmailNotes(''); }}
                    disabled={emailSending}
                    className="rounded-2xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    disabled={!emailSubject.trim() || !emailBody.trim() || emailSending}
                    aria-busy={emailSending || undefined}
                    className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {emailSending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} />} Send Email
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notice of Resubmission modal */}
        {showResubmitModal && (
          <div className="fixed inset-0 z-[270] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowResubmitModal(false)}>
            <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ fontFamily: 'Poppins, sans-serif', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>

              {/* Header — brand gradient */}
              <div className="flex items-center gap-3 px-6 py-4" style={{ background: 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)' }}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Mail size={20} className="text-white" />
                </div>
                <h2 className="flex-1 text-base font-bold text-white">Notice of Resubmission</h2>
                <button type="button" onClick={() => setShowResubmitModal(false)} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10">
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

                {/* Recipient row */}
                <div className="grid grid-cols-2 gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--color-primary-50)' }}>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#363EE8' }}>TO:</p>
                    <p className="mt-0.5 truncate text-sm font-semibold" style={{ color: '#040E6B' }}>{applicant?.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#363EE8' }}>APPLICANT NAME:</p>
                    <p className="mt-0.5 text-sm font-semibold" style={{ color: '#040E6B' }}>{fullName || '—'}</p>
                  </div>
                </div>

                {/* Document selector — multi-select pill buttons */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold" style={{ color: '#040E6B' }}>
                    Document for Resubmission <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DOCUMENT_SLOTS.filter((s) => attachments.some((a) => (a.document_type || FILE_NAME_TO_TYPE[a.file_name] || 'other') === s.type)).map((s) => {
                      const isSelected = resubmitSelectedSlots.includes(s.label);
                      return (
                        <button
                          key={s.type}
                          type="button"
                          onClick={() => setResubmitSelectedSlots((prev) =>
                            isSelected ? prev.filter((x) => x !== s.label) : [...prev, s.label]
                          )}
                          className="rounded-full border px-3 py-1 text-xs font-semibold transition-all"
                          style={isSelected
                            ? { backgroundColor: '#363EE8', borderColor: '#363EE8', color: '#ffffff' }
                            : { backgroundColor: '#ffffff', borderColor: '#C8D1FF', color: '#040E6B' }
                          }
                        >{s.label}</button>
                      );
                    })}
                  </div>
                  {resubmitSelectedSlots.length > 0 && (
                    <p className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: 'var(--color-primary-50)', color: '#363EE8' }}>
                      Selected: {resubmitSelectedSlots.join(', ')}
                    </p>
                  )}
                </div>

                {/* Reason chips */}
                <div>
                  <label className="mb-2 block text-sm font-semibold" style={{ color: '#040E6B' }}>
                    Reason for Resubmission <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {RESUBMISSION_REASONS.map((r) => {
                      const selected = resubmitReason === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setResubmitReason(r)}
                          className="rounded-full border px-3 py-1 text-xs font-semibold transition-all"
                          style={selected
                            ? { backgroundColor: '#363EE8', borderColor: '#363EE8', color: '#ffffff' }
                            : { backgroundColor: '#ffffff', borderColor: '#C8D1FF', color: '#040E6B' }
                          }
                        >{r}</button>
                      );
                    })}
                  </div>
                  {resubmitReason && (
                    <p className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: 'var(--color-primary-50)', color: '#363EE8' }}>
                      Selected: {resubmitReason}
                    </p>
                  )}
                </div>

                {/* Message / Additional Notes */}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold" style={{ color: '#040E6B' }}>
                    Message <span className="font-normal text-slate-400">(Optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={resubmitNotes}
                    onChange={(e) => setResubmitNotes(e.target.value)}
                    placeholder="Add specific instructions or details for the applicant regarding this resubmission..."
                    className="w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2"
                    style={{ borderColor: '#C8D1FF', color: '#040E6B' }}
                  />
                  <p className="mt-1 text-xs" style={{ color: '#363EE8' }}>This message will be included in the email and shown in the applicant's tracker.</p>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t px-6 py-4" style={{ borderColor: '#C8D1FF' }}>
                {resubmitError && (
                  <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{resubmitError}</p>
                )}
                {resubmitSuccess && (
                  <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{resubmitSuccess}</p>
                )}
                <div className="flex justify-end gap-3">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setShowResubmitModal(false); setResubmitNotes(''); setResubmitReason(''); setResubmitSelectedSlots([]); setResubmitError(null); setResubmitSuccess(null); }}
                      disabled={resubmitSending}
                      className="rounded-xl border px-5 py-2 text-sm font-semibold disabled:opacity-50"
                      style={{ borderColor: '#C8D1FF', color: '#040E6B' }}
                    >
                      Cancel
                    </button>
                    {!resubmitSuccess && (
                      <button
                        type="button"
                        onClick={() => void handleSubmitResubmission()}
                        disabled={resubmitSelectedSlots.length === 0 || !resubmitReason.trim() || resubmitSending}
                        className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ backgroundColor: '#363EE8' }}
                      >
                        {resubmitSending
                          ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                          : <Send size={14} />} Send Notice
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}


        {confirmAction && (() => {
          const isDisqualify = confirmAction === 'disqualify';
          const isNoShow = isDisqualify && confirmReasonCategory === FAILURE_TO_ATTEND;

          // The activities this applicant was actually scheduled for. Offering
          // only these means the recorded date is one the office really set,
          // not one retyped from memory at the moment of disqualification.
          const scheduledActivities: Array<{ key: string; activity: MissedActivity }> = (
            [
              ['interview', applicant?.interview_date, applicant?.interview_time],
              ['written_exam', applicant?.exam_date, applicant?.exam_time],
              ['oral_exam', applicant?.oral_exam_date, applicant?.oral_exam_time],
            ] as Array<[MissedActivityType, string | null | undefined, string | null | undefined]>
          )
            .filter(([, date]) => Boolean(date))
            .map(([type, date, time]) => ({
              key: type,
              activity: { type, date: String(date), time: time ? String(time) : null },
            }));

          const missedActivity =
            scheduledActivities.find((a) => a.key === missedActivityKey)?.activity ?? null;

          // A no-show needs the activity recorded, so it cannot be confirmed
          // without one. An applicant with nothing scheduled cannot have failed
          // to attend; the dialog says so rather than accepting a blank record.
          const canConfirm =
            !confirmSubmitting &&
            (!isDisqualify || confirmReasonCategory.trim().length > 0) &&
            (!isNoShow || missedActivity !== null);
          return (
            <div
              className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4"
              onClick={() => !confirmSubmitting && setConfirmAction(null)}
            >
              <div
                className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start gap-3 px-6 pt-6">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${isDisqualify ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                      }`}
                  >
                    {isDisqualify ? <CircleX size={22} /> : <CheckCircle2 size={22} />}
                  </div>
                  <div className="flex-1">
                    <h3 className="!mb-1 text-lg font-bold text-slate-900">
                      {isDisqualify ? 'Confirm Disqualification' : 'Qualify this applicant?'}
                    </h3>
                    <p className="!mb-0 text-sm text-slate-600">
                      {isDisqualify
                        ? `This action is final and cannot be undone. ${fullName} will be notified and cannot proceed further in this application.`
                        : `This will recommend ${fullName} for hiring. This action cannot be undone from this screen.`}
                    </p>
                  </div>
                </div>

                {isDisqualify && (
                  <div className="space-y-3 px-6 pt-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                        Reason for disqualification <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={confirmReasonCategory}
                        onChange={(event) => {
                          setConfirmReasonCategory(event.target.value);
                          // Drop any activity picked under a previous reason so
                          // it cannot be saved against an unrelated one.
                          setMissedActivityKey('');
                        }}
                        className="w-full rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      >
                        <option value="">Select a reason…</option>
                        {DISQUALIFICATION_REASON_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    {isNoShow && (
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                          Scheduled activity not attended <span className="text-rose-500">*</span>
                        </label>
                        {scheduledActivities.length === 0 ? (
                          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            No interview or examination is scheduled for this applicant, so there is nothing
                            they could have failed to attend. Set a schedule first, or choose a different reason.
                          </p>
                        ) : (
                          <select
                            value={missedActivityKey}
                            onChange={(event) => setMissedActivityKey(event.target.value)}
                            className="w-full rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
                          >
                            <option value="">Select the activity…</option>
                            {scheduledActivities.map(({ key, activity }) => (
                              <option key={key} value={key}>
                                {MISSED_ACTIVITY_LABELS[activity.type]} — {activity.date}
                                {activity.time ? ` at ${activity.time}` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                        <p className="mt-1.5 text-xs text-slate-500">
                          Recorded with the disqualification, so it still says what it said today even if the
                          schedule is changed later.
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                        Message to applicant <span className="text-slate-400 font-normal">(optional)</span>
                      </label>
                      <textarea
                        rows={3}
                        value={confirmReason}
                        onChange={(event) => setConfirmReason(event.target.value)}
                        placeholder="Add any additional detail…"
                        className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      />
                    </div>
                    <label className="flex items-start gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={confirmMessageVisible}
                        onChange={(event) => setConfirmMessageVisible(event.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        Show this message to the applicant on the public tracker. If left unchecked, only the reason
                        category is shown — the message stays internal to RSP.
                      </span>
                    </label>
                  </div>
                )}

                {confirmError && (
                  <div className="px-6 pt-4">
                    <ActionFeedback
                      title="We couldn't update this application."
                      message={confirmError.message}
                      nextStep={confirmError.nextStep}
                      onDismiss={() => setConfirmError(null)}
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 px-6 pb-6 pt-5">
                  <button
                    type="button"
                    onClick={() => { setConfirmAction(null); setConfirmError(null); }}
                    disabled={confirmSubmitting}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!canConfirm) return;
                      setConfirmSubmitting(true);
                      setConfirmError(null);
                      try {
                        const disqualifyDetails = isDisqualify
                          ? {
                              reasonCategory: confirmReasonCategory,
                              message: confirmReason,
                              messageVisible: confirmMessageVisible,
                              missedActivity,
                            }
                          : undefined;
                        if (inReviewQueue) {
                          decideAndAdvance(confirmAction, disqualifyDetails);
                        } else {
                          const saved = await persistStatus(confirmAction, disqualifyDetails);
                          if (saved === false) {
                            setConfirmError({
                              message: 'The status was not saved, so the applicant record is unchanged.',
                              nextStep: 'Check your connection, then try again. If it still fails, ask your administrator to check your RSP access.',
                            });
                            return;
                          }
                        }
                        setConfirmAction(null);
                        setConfirmReason('');
                        setConfirmReasonCategory('');
                        setConfirmMessageVisible(false);
                        setMissedActivityKey('');
                      } finally {
                        setConfirmSubmitting(false);
                      }
                    }}
                    disabled={!canConfirm || confirmSubmitting}
                    aria-busy={confirmSubmitting || undefined}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${isDisqualify ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                  >
                    {confirmSubmitting && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                    {isDisqualify ? 'Confirm Disqualification' : 'OK'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {reviewComplete && navQueue && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <CheckCircle2 size={28} className="mx-auto text-emerald-600" />
            <h3 className="!mb-1 mt-2 text-lg font-bold text-slate-900">All {navQueue.length} reviewed</h3>
            <p className="!mb-0 text-sm text-slate-600">
              {navQueue.filter((entry) => reviewOutcome(entry.status) === 'shortlisted').length} shortlisted
              {' · '}
              {navQueue.filter((entry) => reviewOutcome(entry.status) === 'disqualified').length} disqualified
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setReviewComplete(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Stay here
              </button>
              <button
                type="button"
                onClick={goBack}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Back to applicants
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDecision && (
        <div role="status" className="fixed bottom-6 right-6 z-[260] flex items-center gap-4 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          <span className="inline-flex items-center gap-2 text-white">
            <CheckCircle2 size={16} className="text-emerald-400" />
            {pendingDecision.applicantName} marked {pendingDecision.label}
            {navQueue && ` · ${undecidedLeft} pending left`}
          </span>
          <button type="button" onClick={handleUndoDecision} className="font-semibold text-blue-300 hover:text-blue-200">
            Undo
          </button>
        </div>
      )}
      </div>{/* /admin-layout wrapper */}
      {previewDocument && (
        <DocumentPreviewModal
          open
          viewFirst
          fileUrl={previewDocument.url}
          fileName={previewDocument.fileName}
          fileType={previewDocument.fileType}
          storageBucket={previewDocument.bucket}
          title={previewDocument.fileName}
          subtitle={previewDocument.label}
          onClose={() => setPreviewDocument(null)}
        />
      )}
      {documentCollection && (
        <DocumentCollectionModal
          title="Experience Documents"
          subtitle="Select a document to view, print, or download."
          files={documentCollection}
          onClose={() => setDocumentCollection(null)}
        />
      )}
    </div>
  );
}
