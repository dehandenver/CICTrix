import { AlertCircle, CheckCircle2, ChevronRight, CircleX, FileText, Loader2, Lock, Mail, RefreshCw, Search, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ActionFeedback, useFeedback } from '../../components/action-feedback';
import { describeActionFailure } from '../../lib/friendlyErrors';
import { ATTACHMENTS_BUCKET, supabase } from '../../lib/supabase';
import { getApplicants, saveApplicants } from '../../lib/recruitmentData';
import {
  FAILURE_TO_ATTEND,
  failureToAttendMessage,
  getDisqualificationReasonLabel,
  parseDisqualificationReason,
  type MissedActivityType,
} from '../../lib/applicationActivity';
import { APPLICANT_MESSAGES, normalizeStatus, regretLetter, signingForfeitWarning } from '../../lib/api/applicantStatus';
import { formatDisplayDate } from '../../lib/scheduleSelection';
import { fetchApplicantSlotLinks, fetchSlotsByJobPosting } from '../../lib/plantillaSlots';
import { plantillaLabel } from '../../lib/plantillaRules';
import {
  fetchPendingResubmissionIds,
  fetchTrackerApplications,
  isClosedApplicationStatus,
  latestNoticesByDocType,
  parseNotice,
  pendingResubmissionTypes as pendingResubmissionTypesOf,
  pickDefaultApplicationId,
  refetchTrackerApplications,
  type TrackerLookup,
} from '../../lib/applicantTracker';
import type { ApplicationSlotStatus, PlantillaSlot } from '../../types/recruitment.types';

interface ApplicationRecord {
  id: string;
  /** The Plantilla Item No. applied for — a position code. */
  item_number: string;
  /** This application's system-issued tracking code, ABYAN-000-000. */
  reference_no: string;
  first_name: string;
  last_name: string;
  email: string;
  contact_number: string;
  position: string;
  office: string;
  status: string;
  created_at: string;
  updated_at: string | null;
  application_type: string | null;
  disqualification_reason: string | null;
  exam_date: string | null;
  exam_time: string | null;
  oral_exam_date: string | null;
  oral_exam_time: string | null;
  interview_date: string | null;
  interview_time: string | null;
  venue: string | null;
  schedule_instructions: string | null;
  disqualified_at: string | null;
  disqualification_reason_category: string | null;
  disqualification_message: string | null;
  disqualification_message_visible: boolean;
  // Spec §8: the activity a no-show applicant missed, frozen at the moment of
  // disqualification.
  missed_activity_type: string | null;
  missed_activity_date: string | null;
  missed_activity_time: string | null;
  // Migration 20261021200100: the contract-signing notice, and the flag set
  // when the plantilla went to someone else.
  signing_deadline?: string | null;
  signing_instructions?: string | null;
  archived_at?: string | null;
  // Migration 20261021200000: the plantilla applied for, and for a withdrawn
  // application, the plantilla the person was hired on instead.
  plantilla_label: string | null;
  hired_elsewhere_plantilla_label: string | null;
}

interface AttachmentRow {
  id: string;
  file_name: string;
  file_path: string;
  document_type: string | null;
  created_at: string;
}

type DocReviewStatus = 'pending' | 'approved' | 'resubmission_requested';
interface DocReview { status: DocReviewStatus; remarks: string; reviewedAt: string; }
const DOC_REVIEW_KEY = 'cictrix_doc_reviews';

const loadDocReviews = (): Record<string, DocReview> => {
  try { return JSON.parse(localStorage.getItem(DOC_REVIEW_KEY) ?? '{}') as Record<string, DocReview>; } catch { return {}; }
};

const clearDocReview = (key: string) => {
  try {
    const all = loadDocReviews();
    delete all[key];
    localStorage.setItem(DOC_REVIEW_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
};

// 'received' is a fresh submission (Info, DESIGN_IDENTITY §10); 'new' stays
// the orange tone for statuses that wait on the applicant.
type BadgeTone = 'approved' | 'in-review' | 'rejected' | 'new' | 'received' | 'withdrawn';

const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  'New Application': { label: 'New', tone: 'received' },
  // Spec §7: Pending means the office is waiting on the applicant, not that
  // the application is new. Labelling it 'New' told someone who needed to
  // resubmit a document that there was nothing for them to do.
  'Pending': { label: 'Action Required', tone: 'new' },
  'Under Review': { label: 'Under Evaluation', tone: 'in-review' },
  'Reviewed': { label: 'Under Evaluation', tone: 'in-review' },
  // Passing the screening, not a request for documents — that is 'Action
  // Required'. This badge said "Additional Documents Requested", which told a
  // shortlisted applicant to act when there was nothing for them to do.
  'Shortlisted': { label: 'Shortlisted', tone: 'in-review' },
  'Interview/Exam Scheduled': { label: 'In Review', tone: 'in-review' },
  'For Evaluation': { label: 'In Review', tone: 'in-review' },
  'Qualified': { label: 'Qualified', tone: 'in-review' },
  'Selected': { label: 'Selected', tone: 'approved' },
  'Not Selected': { label: 'Not Selected', tone: 'rejected' },
  'Submitted': { label: 'New', tone: 'received' },
  'Withdrawn - Hired Elsewhere': { label: 'Withdrawn', tone: 'withdrawn' },
  'Under Initial Screening': { label: 'Under Evaluation', tone: 'in-review' },
  'For Interview': { label: 'In Review', tone: 'in-review' },
  'Interview Scheduled': { label: 'In Review', tone: 'in-review' },
  'Interview Completed': { label: 'In Review', tone: 'in-review' },
  // Documents validated, awaiting scheduling — mid-process, never "Approved".
  'Recommended for Hiring': { label: 'Documents Validated', tone: 'in-review' },
  'Hired': { label: 'Approved', tone: 'approved' },
  'Accepted': { label: 'Approved', tone: 'approved' },
  'Not Qualified': { label: 'Not Qualified', tone: 'rejected' },
  'Rejected': { label: 'Rejected', tone: 'rejected' },
  'Disqualified': { label: 'Disqualified', tone: 'rejected' },
  'Failed Qualification Assessment': { label: 'Failed Qualification Assessment', tone: 'rejected' },
  'Document Verified': { label: 'Document Verified', tone: 'approved' },
  'Action Required': { label: 'Action Required', tone: 'new' },
};

const BADGE_CLASS: Record<BadgeTone, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'in-review': 'bg-blue-50 text-blue-700 border border-blue-200',
  rejected: 'bg-rose-50 text-rose-700 border border-rose-200',
  new: 'bg-amber-50 text-amber-700 border border-amber-200',
  received: 'bg-[var(--info-100)] text-[var(--info-700)] border border-[var(--info-300)]',
  withdrawn: 'bg-[var(--neutral-100)] text-[var(--neutral-800)] border border-[var(--neutral-200)]',
};

const NOTICE_CLASS: Record<BadgeTone, string> = {
  approved: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  'in-review': 'bg-blue-50 border-blue-200 text-blue-800',
  rejected: 'bg-rose-50 border-rose-200 text-rose-800',
  new: 'bg-amber-50 border-amber-200 text-amber-800',
  received: 'bg-[var(--info-100)] border-[var(--info-300)] text-[var(--info-700)]',
  withdrawn: 'bg-[var(--neutral-100)] border-[var(--neutral-200)] text-[var(--neutral-800)]',
};

const NOTICE_MESSAGE: Record<BadgeTone, string> = {
  approved: 'Congratulations! Your application has been approved. You will receive an official notice via email within 3–5 business days.',
  'in-review': 'Your application is currently being reviewed. We will notify you by email once a decision is reached.',
  rejected: 'We regret to inform you that your application was not selected for this position. Thank you for your interest.',
  new: 'Your application has been received. We will begin reviewing it shortly.',
  received: 'Your application has been received. We will begin reviewing it shortly.',
  withdrawn: APPLICANT_MESSAGES['Withdrawn - Hired Elsewhere'],
};

const getNoticeMessage = (status: string, tone: BadgeTone, reason?: string | null): string => {
  if (status === 'Document Verified') {
    return 'Your submitted documents have been successfully reviewed and verified by RSP personnel. Your application is proceeding to the next evaluation stage.';
  }
  if (status === 'Action Required') {
    return 'Action is required on your application: one or more documents require resubmission. Please check the notices below for details.';
  }
  if (status === 'Under Review') {
    return 'Your application and uploaded documents are currently under review by our recruitment team.';
  }
  if (tone === 'rejected') {
    const base = 'Your application has been disqualified and will no longer proceed in the selection process.';
    const suffix = 'For further inquiries, please contact the Recruitment Office.';
    return reason ? `${base} ${suffix}` : `${base} ${suffix}`;
  }
  return NOTICE_MESSAGE[tone];
};

type PhaseTone = 'new' | 'in-review' | 'action' | 'approved' | 'rejected';

interface ApplicantPhase {
  headline: string;
  detail: string;
  tone: PhaseTone;
  showSchedule: boolean;
  showCongrats: boolean;
}

// The single thing the applicant is told about their application.
//
// Driven by the workflow module so the applicant and the RSP dashboard agree on
// what a status means; the wording comes from APPLICANT_MESSAGES, which is
// written for the applicant rather than the office.
//
// 'Recommended for Hiring' is handled before normalisation. Nothing writes it
// any more — document screening now stores Shortlisted and the post-evaluation
// decision stores Qualified — but rows written before that split are still
// there until migration 20260926 resolves them against the evaluations table.
// Until then they keep the wording that is true either way: documents
// validated, scheduling may follow.
const PENDING_PHASE: ApplicantPhase = {
  headline: 'Pending Review',
  detail: 'Your application has been received. We will begin reviewing it shortly.',
  tone: 'new', showSchedule: false, showCongrats: false,
};

const resolvePhase = (rawStatus: string, hasSchedule: boolean): ApplicantPhase => {
  const raw = String(rawStatus ?? '').trim().toLowerCase();

  if (raw === 'recommended for hiring' || raw === 'document verified') {
    return hasSchedule
      ? {
          headline: 'Scheduled for Exam & Interview',
          detail: 'Your documents have been validated. Your schedule is shown below.',
          tone: 'in-review', showSchedule: true, showCongrats: false,
        }
      : {
          headline: 'Documents Validated — Awaiting Exam & Interview Schedule',
          detail: 'Your documents have been validated by the RSP Office. You will be notified once your exam and interview are scheduled.',
          tone: 'in-review', showSchedule: false, showCongrats: false,
        };
  }

  const status = normalizeStatus(rawStatus);
  // An unrecognised value is shown as awaiting review rather than guessed at.
  if (status === null) return PENDING_PHASE;

  switch (status) {
    case 'Submitted':
      return PENDING_PHASE;

    case 'Under Initial Screening':
      return {
        headline: 'Under Evaluation',
        detail: APPLICANT_MESSAGES[status],
        tone: 'in-review', showSchedule: false, showCongrats: false,
      };

    case 'Pending':
      return {
        headline: 'Additional Documents Requested',
        detail: APPLICANT_MESSAGES[status],
        tone: 'action', showSchedule: false, showCongrats: false,
      };

    // Passing the screening is not a request for documents. This previously
    // read "Additional Documents Requested", which told a shortlisted
    // applicant to act when there was nothing for them to do.
    case 'Shortlisted':
      return {
        headline: 'Shortlisted — Awaiting Exam & Interview Schedule',
        detail: APPLICANT_MESSAGES[status],
        tone: 'in-review', showSchedule: hasSchedule, showCongrats: false,
      };

    case 'Interview/Exam Scheduled':
      return {
        headline: 'Scheduled for Exam & Interview',
        detail: 'Your schedule is shown below. Please arrive at the venue on time.',
        tone: 'in-review', showSchedule: true, showCongrats: false,
      };

    case 'For Evaluation':
      return {
        headline: 'Application Under Final Review',
        detail: APPLICANT_MESSAGES[status],
        tone: 'in-review', showSchedule: false, showCongrats: false,
      };

    // Qualified is not an appointment, so no congratulations block here — only
    // Selected gets that.
    case 'Qualified':
      return {
        headline: 'Qualified',
        detail: APPLICANT_MESSAGES[status],
        tone: 'in-review', showSchedule: false, showCongrats: false,
      };

    // Selected and reserved, but the post is theirs only once they sign.
    case 'For Contract Signing':
      return {
        headline: 'Selected — Report for Contract Signing',
        detail: APPLICANT_MESSAGES[status],
        tone: 'approved', showSchedule: false, showCongrats: false,
      };

    case 'Selected':
      return {
        headline: 'Selected',
        detail: APPLICANT_MESSAGES[status],
        tone: 'approved', showSchedule: false, showCongrats: true,
      };

    case 'Disqualified':
      return {
        headline: 'Disqualified',
        detail: 'Your application will no longer proceed in the selection process. For further inquiries, please contact the Recruitment Office.',
        tone: 'rejected', showSchedule: false, showCongrats: false,
      };

    case 'Not Selected':
      return {
        headline: 'Not Selected',
        detail: APPLICANT_MESSAGES[status],
        tone: 'rejected', showSchedule: false, showCongrats: false,
      };

    // Closed because the person was hired on another application. Now that
    // every application is listed, this row is reachable from the tracker.
    case 'Withdrawn - Hired Elsewhere':
      return {
        headline: 'Withdrawn — Hired Elsewhere',
        detail: APPLICANT_MESSAGES[status],
        tone: 'new', showSchedule: false, showCongrats: false,
      };
  }
};

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatTime12h = (time: string | null | undefined): string => {
  if (!time) return '';
  try {
    const [hStr, mStr] = time.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return time;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch {
    return time;
  }
};

/** Dates in a list row read `MMM DD, YYYY` (DESIGN_IDENTITY §9.5). */
const formatRowDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatFileSize =(bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getBadge = (status: string) =>
  STATUS_BADGE[status] ?? { label: status || 'Pending', tone: 'new' as BadgeTone };

export const ApplicationStatusPage = () => {
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  // Every application the search found, newest first. One of them is open at
  // a time; `record` is that one, so every section below reads it unchanged.
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const record = applications.find((a) => a.id === openId) ?? null;
  // Applications with a resubmission notice still waiting on the applicant,
  // for the per-row "Action required" flag.
  const [actionIds, setActionIds] = useState<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [docReviews, setDocReviews] = useState<Record<string, DocReview>>({});
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<{ message: string; nextStep: string } | null>(null);
  const { success: notifySuccess } = useFeedback();
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  /**
   * Per-plantilla outcome. One application can be in the running for several
   * plantilla items, and they settle independently — "Shortlisted for
   * Plantilla 1, Not selected for Plantilla 3" is a valid state.
   */
  const [slotOutcomes, setSlotOutcomes] = useState<Array<{ slot: PlantillaSlot; status: ApplicationSlotStatus }>>([]);

  // Stores the lookup params from the last successful search so polling reuses
  // the SAME query path that handleSearch already uses (which we know works).
  // Querying by UUID (.eq('id',...)) can silently fail on some Supabase RLS configs;
  // querying by item_number / email always works because handleSearch proved it.
  const searchParamsRef = useRef<TrackerLookup | null>(null);
  // Read by async callbacks, so a response for a row the applicant has since
  // closed never lands under the row they opened instead.
  const openIdRef = useRef<string | null>(null);
  openIdRef.current = openId;
  const applicationIds = applications.map((a) => a.id);
  const applicationIdsKey = applicationIds.join(',');

  const mapRow = (row: Record<string, unknown>): ApplicationRecord => ({
    id: String(row.id ?? ''),
    item_number: String(row.item_number ?? ''),
    reference_no: String(row.reference_no ?? ''),
    first_name: String(row.first_name ?? ''),
    last_name: String(row.last_name ?? ''),
    email: String(row.email ?? ''),
    contact_number: String(row.contact_number ?? ''),
    position: String(row.position ?? ''),
    office: String(row.office ?? ''),
    status: String(row.status ?? 'New Application'),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: row.updated_at ? String(row.updated_at) : null,
    application_type: row.application_type ? String(row.application_type) : null,
    disqualification_reason: row.disqualification_reason ? String(row.disqualification_reason) : null,
    exam_date: row.exam_date ? String(row.exam_date) : null,
    exam_time: row.exam_time ? String(row.exam_time) : null,
    oral_exam_date: row.oral_exam_date ? String(row.oral_exam_date) : null,
    oral_exam_time: row.oral_exam_time ? String(row.oral_exam_time) : null,
    interview_date: row.interview_date ? String(row.interview_date) : null,
    interview_time: row.interview_time ? String(row.interview_time) : null,
    venue: row.venue ? String(row.venue) : null,
    schedule_instructions: row.schedule_instructions ? String(row.schedule_instructions) : null,
    disqualified_at: row.disqualified_at ? String(row.disqualified_at) : null,
    disqualification_reason_category: row.disqualification_reason_category ? String(row.disqualification_reason_category) : null,
    disqualification_message: row.disqualification_message ? String(row.disqualification_message) : null,
    disqualification_message_visible: Boolean(row.disqualification_message_visible),
    missed_activity_type: row.missed_activity_type ? String(row.missed_activity_type) : null,
    missed_activity_date: row.missed_activity_date ? String(row.missed_activity_date) : null,
    missed_activity_time: row.missed_activity_time ? String(row.missed_activity_time) : null,
    plantilla_label: row.plantilla_label ? String(row.plantilla_label) : null,
    hired_elsewhere_plantilla_label: row.hired_elsewhere_plantilla_label ? String(row.hired_elsewhere_plantilla_label) : null,
  });

  const fetchAttachments = async (applicantId: string) => {
    try {
      const { data, error: err } = await (supabase as any)
        .from('applicant_attachments')
        .select('id, file_name, file_path, document_type, created_at')
        .eq('applicant_id', applicantId)
        .order('created_at', { ascending: false });
      if (applicantId !== openIdRef.current) return;
      if (!err && Array.isArray(data)) setAttachments(data as AttachmentRow[]);
    } catch { /* silently ignore */ }
  };

  // Re-reads every application. Reuses the same query column/value as the
  // search so we are guaranteed to get fresh data even if UUID-based lookups
  // are restricted by RLS. The open row stays open unless it has gone.
  const fetchApplications = async () => {
    if (!searchParamsRef.current) return;
    try {
      const rows = await refetchTrackerApplications(searchParamsRef.current);
      if (!rows || rows.length === 0) return;
      const mapped = rows.map(mapRow);
      const flagged = await fetchPendingResubmissionIds(mapped.map((a) => a.id));
      setApplications(mapped);
      setActionIds(flagged);
      const current = openIdRef.current;
      if (mapped.length === 1) setOpenId(mapped[0].id);
      else if (current && !mapped.some((a) => a.id === current)) setOpenId(pickDefaultApplicationId(mapped, flagged));
    } catch { /* silently ignore */ }
  };

  // Which plantilla items this application is riding on, and where each stands.
  // Re-reads whenever the record is refreshed by polling, so a hire on one
  // plantilla shows up without the applicant searching again.
  useEffect(() => {
    const applicantId = record?.id;
    if (!applicantId) {
      setSlotOutcomes([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [linksByApplicant, slotsByJob] = await Promise.all([
        fetchApplicantSlotLinks([applicantId]),
        fetchSlotsByJobPosting(),
      ]);
      if (cancelled) return;

      const slotById = new Map<string, PlantillaSlot>();
      slotsByJob.forEach((slots) => slots.forEach((slot) => slotById.set(slot.id, slot)));

      const outcomes = (linksByApplicant.get(applicantId) ?? [])
        .map((link) => {
          const slot = slotById.get(link.slotId);
          return slot ? { slot, status: link.status } : null;
        })
        .filter(Boolean) as Array<{ slot: PlantillaSlot; status: ApplicationSlotStatus }>;

      outcomes.sort((a, b) => a.slot.slotNumber - b.slot.slotNumber);
      setSlotOutcomes(outcomes);
    })();
    return () => { cancelled = true; };
  }, [record?.id, record?.updated_at, record?.status]);

  // Real-time: applicant_attachments — uses filtered subscription (works with REPLICA IDENTITY FULL).
  // Polling fallback below covers the case where the filter doesn't fire.
  // Only the open row's documents are shown, so only it is subscribed.
  useEffect(() => {
    if (!openId) return;
    const rid = openId;
    const channel = (supabase as any)
      .channel(`tracker_attachments_${rid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applicant_attachments', filter: `applicant_id=eq.${rid}` }, () => {
        void fetchAttachments(rid);
      })
      .subscribe();
    return () => { void (supabase as any).removeChannel(channel); };
  }, [openId]);

  // Real-time: applicants status — UNFILTERED so it works without REPLICA IDENTITY FULL.
  // Server-side filtered subscriptions are silently dropped when REPLICA IDENTITY is not FULL;
  // listening to the whole table and filtering client-side on payload.new.id is reliable.
  // Any of the person's applications changing refreshes the whole list, so a
  // collapsed row's badge stays as current as the open one's.
  useEffect(() => {
    if (!applicationIdsKey) return;
    const ids = new Set(applicationIdsKey.split(','));
    const channel = (supabase as any)
      .channel(`tracker_applicants_${applicationIdsKey}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applicants' }, (payload: any) => {
        const changedId = (payload.new as { id?: string })?.id;
        if (!changedId || !ids.has(changedId)) return;
        void fetchApplications();
        if (changedId === openIdRef.current) void fetchAttachments(changedId);
      })
      .subscribe();
    return () => { void (supabase as any).removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationIdsKey]);

  // Polling fallback — 2 s so status changes (disqualify, validate docs, etc.) feel instant.
  // Covers every application, plus the open row's documents.
  useEffect(() => {
    if (!applicationIdsKey) return;
    const interval = setInterval(() => {
      if (openIdRef.current) void fetchAttachments(openIdRef.current);
      void fetchApplications();
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationIdsKey]);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});
  // Tracks doc types the applicant has successfully re-uploaded this session,
  // so the amber panel disappears immediately even if the Supabase notice update
  // hasn't propagated back through the real-time subscription yet.
  const [resolvedDocTypes, setResolvedDocTypes] = useState<Set<string>>(new Set());
  // Stores the newly uploaded file name per doc type so the header updates
  // immediately after re-upload, without waiting for the real-time refetch.
  const [submittedFileNames, setSubmittedFileNames] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Opening another row starts it clean: nothing the applicant saw or picked
  // under the previous application carries over to this one.
  useEffect(() => {
    setAttachments([]);
    setSlotOutcomes([]);
    setUploadSuccess(null);
    setUploadErrors({});
    setPendingFiles({});
    setResolvedDocTypes(new Set());
    setSubmittedFileNames({});
    if (openId) void fetchAttachments(openId);
  }, [openId]);

  const getReviewKey = (applicantId: string, filePath: string) => `${applicantId}::${filePath}`;

  /**
   * Look an application up by Reference No. or email.
   *
   * Split out from the form handler so the page can also run itself — an
   * applicant arriving straight from the submission dialog, or following a
   * /track?ref=ABYAN-123-456 link, should not have to retype the number they
   * were just given.
   */
  const runSearch = async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      setError({
        message: 'Enter your Reference No. or email.',
        nextStep: 'Type the code from your submission, or the email address you applied with.',
      });
      return;
    }

    setError(null);
    setLoading(true);
    setSearched(false);
    searchParamsRef.current = null;
    setApplications([]);
    setOpenId(null);
    setActionIds(new Set());
    setDocReviews({});

    try {
      // Reference numbers are matched on their normalised form, so
      // "abyan 123 456", "ABYAN-123-456" and "abyan123456" all find the same
      // person, and an old alias finds them too.
      const { rows, lookup } = await fetchTrackerApplications(trimmed);

      if (!lookup || rows.length === 0) {
        setSearched(true);
        return;
      }

      const mapped = rows.map(mapRow);
      const flagged = await fetchPendingResubmissionIds(mapped.map((a) => a.id));

      // Store search params so polling can reuse the same query (not UUID lookup)
      searchParamsRef.current = lookup;
      setApplications(mapped);
      setActionIds(flagged);
      // Opening the row fetches its documents (the openId effect above).
      setOpenId(pickDefaultApplicationId(mapped, flagged));

      // Load doc reviews from localStorage
      const allReviews = loadDocReviews();
      setDocReviews(allReviews);
    } catch (err) {
      const described = describeActionFailure('look up your application', err);
      setError({ message: described.message, nextStep: described.nextStep });
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch(query);
  };

  // Arriving with a Reference No. already in hand — straight from the
  // submission dialog, or via a /track?ref=... link — looks it up immediately.
  // Runs once: re-running on every render would fight the applicant's typing.
  const autoSearchedRef = useRef(false);
  useEffect(() => {
    if (autoSearchedRef.current) return;

    const fromState = (location.state as { referenceNo?: string } | null)?.referenceNo;
    const fromQuery = new URLSearchParams(location.search).get('ref');
    const incoming = String(fromState ?? fromQuery ?? '').trim();
    if (!incoming) return;

    autoSearchedRef.current = true;
    setQuery(incoming);
    void runSearch(incoming);
    // Guarded by autoSearchedRef; runSearch is a local loader, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.state]);

  const handleReupload = async (doc: AttachmentRow, file: File) => {
    if (!record) return;
    const key = getReviewKey(record.id, doc.file_path);
    setUploadingKey(key);
    // Clear any prior inline error for this card
    setUploadErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    try {
      const newPath = `${record.id}/${Date.now()}-${file.name}`;

      const uploadResult = await (supabase as any).storage
        .from(ATTACHMENTS_BUCKET)
        .upload(newPath, file);
      const uploadError = uploadResult?.error ?? null;
      if (uploadError) throw new Error(String(uploadError.message ?? uploadError));

      const { error: insErr } = await (supabase as any)
        .from('applicant_attachments')
        .insert({
          applicant_id: record.id,
          file_name: file.name,
          file_path: newPath,
          file_type: file.type,
          file_size: file.size,
          document_type: doc.document_type,
        });
      if (insErr) throw new Error(insErr.message);

      // Clear localStorage resubmission review for this doc
      clearDocReview(key);
      setDocReviews((prev) => { const n = { ...prev }; delete n[key]; return n; });

      // Refresh attachments list — the new row's created_at will be after the
      // notice's created_at, so pendingResubmissionTypes auto-resolves on refetch.
      const { data: refreshed } = await (supabase as any)
        .from('applicant_attachments')
        .select('id, file_name, file_path, document_type, created_at')
        .eq('applicant_id', record.id)
        .order('created_at', { ascending: false });
      if (Array.isArray(refreshed) && record.id === openIdRef.current) setAttachments(refreshed as AttachmentRow[]);

      // Update overall applicant status to "Under Review" (Status Synchronization)
      try {
        await (supabase as any)
          .from('applicants')
          .update({ status: 'Under Review', updated_at: new Date().toISOString() })
          .eq('id', record.id);
      } catch (dbErr) {
        console.warn('Failed to update status in Supabase:', dbErr);
      }

      try {
        const recruitmentRows = getApplicants();
        const updatedRecruitmentRows = recruitmentRows.map((entry) => {
          if (entry.id !== record.id) return entry;
          return {
            ...entry,
            status: 'Under Review' as const,
            timeline: [
              ...(entry.timeline ?? []),
              { event: 'Document Re-uploaded: Status set to Under Review', date: new Date().toISOString(), actor: 'Applicant' }
            ]
          };
        });
        saveApplicants(updatedRecruitmentRows);
      } catch (lsErr) {
        console.warn('Failed to update status in localStorage:', lsErr);
      }

      setApplications((prev) => prev.map((a) => (
        a.id === record.id ? { ...a, status: 'Under Review', updated_at: new Date().toISOString() } : a
      )));

      // Optimistically mark this doc type as resolved and store the new file
      // name so the card header updates immediately without waiting for the
      // real-time Supabase refetch.
      if (doc.document_type) {
        setResolvedDocTypes((prev) => new Set([...prev, doc.document_type!]));
        setSubmittedFileNames((prev) => ({ ...prev, [doc.document_type!]: file.name }));
      }
      setUploadSuccess(key);
      notifySuccess('Document uploaded', 'RSP will review the new file.');
      setTimeout(() => setUploadSuccess(null), 5000);
    } catch (err) {
      const described = describeActionFailure('upload this document', err);
      setUploadErrors((prev) => ({ ...prev, [key]: described.message }));
    } finally {
      setUploadingKey(null);
    }
  };

  // doc_validated rows: file_name holds the snake_case doc type (e.g. 'drug_test').
  // file_path is a sentinel ('validated::<type>') not a real storage path.
  const docValidatedRows = attachments.filter(a => a.document_type === 'doc_validated');
  const validatedDocTypes  = new Set(docValidatedRows.map(a => a.file_name));

  // If the applicant status is at or beyond "Document Verified", all documents
  // are considered verified even if doc_validated rows haven't synced yet.

  const badge = record ? getBadge(record.status) : null;
  const hasSchedule = !!(record?.exam_date || record?.interview_date);
  const fullName = record ? `${record.first_name} ${record.last_name}`.trim() : '';
  // 'Recommended for Hiring' means documents validated, not selected — it must
  // not count as hired. Only the terminal 'Hired'/'Accepted' statuses do.
  const programType =
    record?.application_type === 'promotion' ? 'Promotional Application' : 'Job Application';

  // Keep only the latest notice per doc type, then check if a newer real upload
  // exists after it. If yes → the applicant already re-submitted → notice resolved.
  // The same rule drives the per-row "Action required" flag.
  const latestNoticeByDocType = latestNoticesByDocType(attachments);
  const pendingResubmissionTypes = pendingResubmissionTypesOf(attachments, latestNoticeByDocType);

  // Only the still-pending notices (for display in the amber notice section)
  const resubmissionNotices = [...latestNoticeByDocType.values()].filter((n) =>
    pendingResubmissionTypes.has(parseNotice(n).docType),
  );

  // Doc types where the applicant already resubmitted (newer upload exists after the notice)
  // but RSP has not yet approved — should show "Resubmitted" badge, not "Submitted".
  const resubmittedDocTypes = new Set<string>();
  latestNoticeByDocType.forEach((_notice, docType) => {
    if (!pendingResubmissionTypes.has(docType)) resubmittedDocTypes.add(docType);
  });

  // Deduplicate non-notice attachments by document_type (keep most recent per type)
  const deduplicatedAttachments = (() => {
    const seen = new Set<string>();
    return attachments
      .filter((a) => a.document_type !== 'resubmission_request' && a.document_type !== 'resubmission_resolved' && a.document_type !== 'doc_validated')
      .filter((a) => {
        const key = a.document_type ?? a.file_name;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      // Sort: docs with pending resubmission (Supabase OR localStorage) come first
      .sort((x, y) => {
        const xLocalKey = record ? getReviewKey(record.id, x.file_path) : '';
        const yLocalKey = record ? getReviewKey(record.id, y.file_path) : '';
        const xPending = (pendingResubmissionTypes.has(x.document_type ?? '') || docReviews[xLocalKey]?.status === 'resubmission_requested') ? 0 : 1;
        const yPending = (pendingResubmissionTypes.has(y.document_type ?? '') || docReviews[yLocalKey]?.status === 'resubmission_requested') ? 0 : 1;
        return xPending - yPending;
      });
  })();

  // Spec (Qualification Assessment Restriction): when the applicant is
  // disqualified / failed assessment, disable resubmission, lock upload, and
  // show a closed-application banner.
  const isApplicationClosed = record ? isClosedApplicationStatus(record.status) : false;

  const hasActionRequired = record && !isApplicationClosed && (
    resubmissionNotices.length > 0 ||
    deduplicatedAttachments.some((a) => {
      const key = getReviewKey(record.id, a.file_path);
      return (docReviews[key]?.status ?? 'pending') === 'resubmission_requested';
    })
  );

  const disqualificationInfo = record ? parseDisqualificationReason(record.disqualification_reason) : null;
  const disqualificationSummary = disqualificationInfo?.note
    ? `${disqualificationInfo.label}: ${disqualificationInfo.note}`
    : record?.disqualification_reason ?? '';

  // The sections for the open application, exactly as the page has always
  // shown them. With several applications they render under the open row.
  const details = record && badge ? (
    <>
      {/* Disqualified / Closed banner */}
      {isApplicationClosed && record.disqualified_at && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start gap-3 border-l-4 border-rose-500 bg-rose-50 px-5 py-5">
            <CircleX size={22} className="mt-0.5 flex-shrink-0 text-rose-600" />
            <div className="flex-1 space-y-1">
              <p className="text-base font-bold text-rose-800">Application Disqualified</p>
              <p className="text-sm text-rose-700">
                <span className="font-semibold">Date:</span> {formatDate(record.disqualified_at)}
              </p>
              <p className="text-sm text-rose-700">
                <span className="font-semibold">Reason:</span> {getDisqualificationReasonLabel(record.disqualification_reason_category)}
              </p>
              {/* Spec §9 Option A. Shown from the reason and the recorded
                  activity, not from the admin's note — the note can be
                  kept internal, and this is the one thing the applicant
                  must be told either way. */}
              {record.disqualification_reason_category === FAILURE_TO_ATTEND && (
                <p className="text-sm text-rose-700">
                  {failureToAttendMessage(
                    record.missed_activity_type
                      ? {
                          type: record.missed_activity_type as MissedActivityType,
                          date: formatDate(record.missed_activity_date),
                          time: formatTime12h(record.missed_activity_time) || null,
                        }
                      : null,
                  )}
                </p>
              )}
              {record.disqualification_message_visible && record.disqualification_message && (
                <p className="text-sm text-rose-700">
                  <span className="font-semibold">Note:</span> {record.disqualification_message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Closed for a reason other than a structured disqualification (legacy statuses) */}
      {isApplicationClosed && !record.disqualified_at && (
        <div className="mt-8 flex items-start gap-4 rounded-2xl border border-rose-300 bg-rose-50 px-5 py-5 shadow-sm">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-rose-100">
            <CircleX size={22} className="text-rose-600" />
          </div>
          <div className="flex-1">
            <p className="text-base font-bold text-rose-800">
              {record.status === 'Disqualified' || record.status === 'Not Qualified'
                ? 'Application Disqualified'
                : 'Application Closed'}
            </p>
            <p className="mt-1 text-sm text-rose-700">
              {record.status === 'Disqualified' || record.status === 'Not Qualified'
                ? 'We regret to inform you that your application did not advance further in the selection process. This application will no longer be considered for this position. For inquiries, please contact the Recruitment Office.'
                : 'This application is no longer active. Document resubmission and re-upload have been disabled. For questions, please contact the Recruitment Office.'}
            </p>
            {disqualificationSummary && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-white/70 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Reason from RSP Admin</p>
                <p className="mt-1 text-sm text-rose-800">{disqualificationSummary}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Required Banner */}
      {hasActionRequired && (
        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="font-bold text-amber-800">Action Required — Document Resubmission</p>
            <p className="mt-0.5 text-sm text-amber-700">
              One or more of your documents requires resubmission. Please review the details below and re-upload the corrected files.
            </p>
          </div>
        </div>
      )}

      {/* Application Details */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold" style={{ color: '#040E6B' }}>Application Details</h3>
            <p className="mt-1 text-sm" style={{ color: '#363EE8' }}>
              Reference No. {record.reference_no || '—'}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${BADGE_CLASS[badge.tone]}`}>
            {badge.tone === 'approved' && <CheckCircle2 size={14} />}
            {badge.tone === 'rejected' && <CircleX size={14} />}
            {badge.label}
          </span>
        </div>

        {/* Per-plantilla outcome. Only worth showing when this single
            application covers more than one plantilla item — otherwise
            the badge above already says everything. */}
        {slotOutcomes.length > 1 && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold" style={{ color: '#363EE8' }}>
              Plantilla Items You Applied For
            </p>
            <ul className="mt-3 space-y-2">
              {slotOutcomes.map(({ slot, status }) => {
                const tone =
                  status === 'hired' ? 'bg-emerald-100 text-emerald-700'
                  : status === 'shortlisted' ? 'bg-blue-100 text-blue-700'
                  : status === 'not_selected' ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-200 text-slate-600';
                // 'applied' has no verdict of its own yet, so it defers
                // to the application's overall status.
                const label =
                  status === 'hired' ? 'Hired'
                  : status === 'shortlisted' ? 'Shortlisted'
                  : status === 'not_selected' ? 'Not selected'
                  : badge.label;
                return (
                  <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm" style={{ color: '#040E6B' }}>
                      <span className="font-semibold">{plantillaLabel(slot)}</span>
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
                      {label} for {plantillaLabel(slot)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold" style={{ color: '#363EE8' }}>Applicant Information</p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: '#363EE8' }}>Name</p>
                <p className="mt-0.5 text-base font-semibold" style={{ color: '#040E6B' }}>{fullName || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: '#363EE8' }}>Email</p>
                <p className="mt-0.5 text-base font-medium break-words" style={{ color: '#040E6B' }}>{record.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: '#363EE8' }}>Phone</p>
                <p className="mt-0.5 text-base font-medium" style={{ color: '#040E6B' }}>{record.contact_number || '—'}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold" style={{ color: '#363EE8' }}>Application Information</p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: '#363EE8' }}>Program Type</p>
                <p className="mt-0.5 text-base font-semibold" style={{ color: '#040E6B' }}>{programType}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: '#363EE8' }}>Position</p>
                <p className="mt-0.5 text-base font-medium" style={{ color: '#040E6B' }}>
                  {record.position || '—'}
                  {record.office && <span style={{ color: '#363EE8' }}> · {record.office}</span>}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: '#363EE8' }}>Submitted</p>
                <p className="mt-0.5 text-base font-medium" style={{ color: '#040E6B' }}>{formatDate(record.created_at)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: '#363EE8' }}>Last Updated</p>
                <p className="mt-0.5 text-base font-medium" style={{ color: '#040E6B' }}>{formatDate(record.updated_at)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RSP Resubmission Notices — real-time from Supabase (hidden once application is closed/disqualified) */}
      {resubmissionNotices.length > 0 && !isApplicationClosed && (
        <section className="mt-6 rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#C8D1FF' }}>
          <div className="flex items-center gap-3 px-6 py-4" style={{ background: 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)', fontFamily: 'Poppins, sans-serif' }}>
            <AlertCircle size={20} className="text-white" />
            <div>
              <h3 className="font-bold text-white">Notices from RSP Admin</h3>
              <p className="text-xs" style={{ color: '#C8D1FF' }}>Action may be required — review each notice below</p>
            </div>
          </div>
          <div className="divide-y bg-white" style={{ borderColor: '#EEF0FD' }}>
            {resubmissionNotices.map((notice) => {
              const n = parseNotice(notice);
              return (
                <div key={notice.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FileText size={16} style={{ color: '#363EE8' }} />
                      <p className="text-sm font-semibold" style={{ color: '#040E6B' }}>{n.document}</p>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border" style={{ borderColor: '#F59E0B', backgroundColor: '#FFFBEB', color: '#92400E' }}>
                      <AlertCircle size={11} /> Action Required
                    </span>
                  </div>
                  {n.reason && (
                    <p className="mt-2 text-xs" style={{ color: '#040E6B' }}>
                      <span className="font-semibold">Reason:</span> {n.reason}
                    </p>
                  )}
                  {n.notes && (
                    <p className="mt-1.5 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: '#EEF0FD', color: '#363EE8' }}>
                      <span className="font-semibold">RSP Note:</span> {n.notes}
                    </p>
                  )}
                  {n.date && (
                    <p className="mt-2 text-xs" style={{ color: '#6B7280' }}>Issued: {new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Current Status — single card. Replaces the former multi-step timeline. */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h3 className="text-xl font-bold" style={{ color: '#040E6B' }}>Current Status</h3>
        <p className="mt-1 text-sm" style={{ color: '#363EE8' }}>Where your application stands right now</p>

        {(() => {
          const phase = resolvePhase(record.status, hasSchedule);
          const toneStyles: Record<string, { wrap: string; title: string }> = {
            'new': { wrap: 'border-slate-200 bg-slate-50', title: 'text-slate-700' },
            'in-review': { wrap: 'border-blue-200 bg-blue-50', title: 'text-blue-800' },
            'action': { wrap: 'border-amber-200 bg-amber-50', title: 'text-amber-800' },
            'approved': { wrap: 'border-emerald-200 bg-emerald-50', title: 'text-emerald-800' },
            'rejected': { wrap: 'border-rose-200 bg-rose-50', title: 'text-rose-800' },
          };
          const t = toneStyles[phase.tone] ?? toneStyles['new'];
          const pendingDocs = resubmissionNotices.map((n) => parseNotice(n).document).filter(Boolean);

          return (
            <div className={`mt-5 rounded-xl border px-5 py-4 ${t.wrap}`}>
              <p className={`text-lg font-bold ${t.title}`}>{phase.headline}</p>
              <p className="mt-1 text-sm" style={{ color: '#040E6B' }}>{phase.detail}</p>
              <p className="mt-2 text-xs" style={{ color: '#363EE8' }}>Last updated {formatDate(record.updated_at)}</p>

              {phase.tone === 'action' && pendingDocs.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Documents needed</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-amber-800">
                    {pendingDocs.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {phase.showCongrats && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-white px-4 py-3">
                  <p className="text-sm font-bold text-emerald-800">Congratulations!</p>
                  <p className="mt-0.5 text-sm text-emerald-700">
                    You have been selected for the position of <span className="font-semibold">{record.position}</span>.
                    The RSP Office will contact you with further instructions regarding your appointment.
                  </p>
                </div>
              )}

              {normalizeStatus(record.status) === 'For Contract Signing' && (
                <div className="abyan-ds mt-3 rounded-xl border border-[var(--success-300)] bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-[var(--success-700)]">Congratulations, {record.first_name}!</p>
                  <p className="mt-1 text-sm text-[var(--neutral-800)]">
                    You have been selected for the position of <span className="font-semibold">{record.position}</span>.
                  </p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.4px] text-[var(--neutral-600)]">Report on or before</p>
                  <p className="text-base font-semibold text-[var(--color-primary-900)]">{formatDisplayDate(record.signing_deadline)}</p>
                  {record.signing_instructions && (
                    <>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.4px] text-[var(--neutral-600)]">Instructions</p>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-[var(--neutral-800)]">{record.signing_instructions}</p>
                    </>
                  )}
                  <p className="mt-3 rounded-lg bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
                    {signingForfeitWarning(formatDisplayDate(record.signing_deadline))}
                  </p>
                </div>
              )}

              {record.archived_at && normalizeStatus(record.status) === 'Not Selected' && (
                <div className="abyan-ds mt-3 space-y-2 rounded-xl border border-[var(--neutral-200)] bg-white px-4 py-4 text-sm text-[var(--neutral-800)]">
                  {regretLetter(`${record.first_name} ${record.last_name}`.trim(), record.position).map((line, i, all) => (
                    // The last two lines are the signature block: no gap between them.
                    <p key={i} className={i === all.length - 1 ? '!mt-0' : undefined}>{line}</p>
                  ))}
                </div>
              )}

              {phase.tone === 'rejected' && disqualificationSummary && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-rose-800">Reason</p>
                  <p className="mt-1 text-sm text-rose-700">{disqualificationSummary}</p>
                </div>
              )}

              {phase.showSchedule && hasSchedule && (
                <div className="mt-4 rounded-xl border overflow-hidden" style={{ borderColor: '#C8D1FF' }}>
                  <div className="px-3 py-2" style={{ background: 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)' }}>
                    <p className="text-xs font-bold text-white tracking-wide uppercase">Your Schedule</p>
                  </div>
                  <div className="divide-y bg-white" style={{ borderColor: '#EEF0FD' }}>
                    {(record.exam_date || record.exam_time) && (
                      <div className="px-3 py-2 flex items-start gap-2">
                        <span className="mt-0.5 text-xs font-bold uppercase tracking-wide w-28 shrink-0" style={{ color: '#363EE8' }}>Written Exam</span>
                        <span className="text-sm font-medium" style={{ color: '#040E6B' }}>
                          {[record.exam_date && formatDate(record.exam_date), record.exam_time && formatTime12h(record.exam_time)].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    )}
                    {(record.oral_exam_date || record.oral_exam_time) && (
                      <div className="px-3 py-2 flex items-start gap-2">
                        <span className="mt-0.5 text-xs font-bold uppercase tracking-wide w-28 shrink-0" style={{ color: '#363EE8' }}>Oral Exam</span>
                        <span className="text-sm font-medium" style={{ color: '#040E6B' }}>
                          {[record.oral_exam_date && formatDate(record.oral_exam_date), record.oral_exam_time && formatTime12h(record.oral_exam_time)].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    )}
                    {(record.interview_date || record.interview_time) && (
                      <div className="px-3 py-2 flex items-start gap-2">
                        <span className="mt-0.5 text-xs font-bold uppercase tracking-wide w-28 shrink-0" style={{ color: '#363EE8' }}>Interview</span>
                        <span className="text-sm font-medium" style={{ color: '#040E6B' }}>
                          {[record.interview_date && formatDate(record.interview_date), record.interview_time && formatTime12h(record.interview_time)].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    )}
                    {record.venue && (
                      <div className="px-3 py-2 flex items-start gap-2">
                        <span className="mt-0.5 text-xs font-bold uppercase tracking-wide w-28 shrink-0" style={{ color: '#363EE8' }}>Venue</span>
                        <span className="text-sm font-medium" style={{ color: '#040E6B' }}>{record.venue}</span>
                      </div>
                    )}
                    {record.schedule_instructions && (
                      <div className="px-3 py-2">
                        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#363EE8' }}>Instructions</p>
                        <p className="text-sm" style={{ color: '#040E6B' }}>{record.schedule_instructions}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </section>

      {/* Submitted Documents */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold" style={{ color: '#040E6B' }}>Submitted Documents</h3>
            <p className="mt-1 text-sm" style={{ color: '#363EE8' }}>Status of your submitted documents</p>
          </div>
          {isApplicationClosed && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 shrink-0">
              <Lock size={11} /> Locked
            </span>
          )}
        </div>

        {/* Closed-application notice — upload & resubmission disabled */}
        {isApplicationClosed && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <Lock size={16} className="mt-0.5 shrink-0 text-rose-500" />
            <div>
              <p className="text-sm font-semibold text-rose-700">Document Upload Disabled</p>
              <p className="mt-0.5 text-xs text-rose-600">
                Your application has been closed. Document re-upload and resubmission are no longer available for this application.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {deduplicatedAttachments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm" style={{ backgroundColor: '#C8D1FF', color: '#040E6B' }}>
              No documents on file for this application.
            </div>
          ) : (
            deduplicatedAttachments.map((doc) => {
              const reviewKey = getReviewKey(record.id, doc.file_path);
              const review = docReviews[reviewKey];
              const localStatus: DocReviewStatus = review?.status ?? 'pending';
              // Applicant already re-uploaded this doc in the current session
              const alreadyResolved = resolvedDocTypes.has(doc.document_type ?? '');
              const hasResubmissionRequest =
                !isApplicationClosed &&
                !alreadyResolved &&
                (pendingResubmissionTypes.has(doc.document_type ?? '') || localStatus === 'resubmission_requested');
              const matchedNotice = resubmissionNotices.find((n) => parseNotice(n).docType === doc.document_type);
              const parsedNotice = matchedNotice ? parseNotice(matchedNotice) : null;

              const isUploading = uploadingKey === reviewKey;
              const justUploaded = uploadSuccess === reviewKey;
              const uploadError = uploadErrors[reviewKey];
              const selectedFile = pendingFiles[reviewKey];

              const clearPending = () =>
                setPendingFiles((prev) => { const n = { ...prev }; delete n[reviewKey]; return n; });

              return (
                <div key={doc.id} className={`rounded-xl border bg-white overflow-hidden ${
                  isApplicationClosed ? 'border-rose-100 bg-rose-50/30 opacity-75' :
                  hasResubmissionRequest && !justUploaded ? 'border-amber-300' : 'border-slate-200'
                }`}>
                  {/* Document header row */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: '#363EE8' }}>
                        <FileText size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" style={{ color: '#040E6B' }}>
                          {doc.document_type || doc.file_name || 'Document'}
                        </p>
                        {doc.document_type && (
                          <p className="truncate text-xs" style={{ color: '#363EE8' }}>
                            {alreadyResolved && submittedFileNames[doc.document_type]
                              ? submittedFileNames[doc.document_type]
                              : doc.file_name}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Status badge — priority: Action Required > Verified > Resubmitted > Submitted */}
                    {hasResubmissionRequest ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                        <AlertCircle size={12} /> Action Required
                      </span>
                    ) : validatedDocTypes.has(doc.document_type ?? '') ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={12} /> Validated
                      </span>
                    ) : resubmittedDocTypes.has(doc.document_type ?? '') || alreadyResolved ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
                        <RefreshCw size={12} /> Resubmitted
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border" style={{ backgroundColor: '#EEF0FD', color: '#363EE8', borderColor: '#C8D1FF' }}>
                        <CheckCircle2 size={12} /> Submitted
                      </span>
                    )}
                  </div>

                  {/* Optional RSP Remarks for Approved/Other states */}
                  {review?.remarks && localStatus === 'approved' && (
                    <div className="px-4 pb-3 pt-0">
                      <p className="text-xs text-emerald-700">
                        <span className="font-semibold">RSP Note:</span> {review.remarks}
                      </p>
                    </div>
                  )}

                  {/* Resubmission action panel */}
                  {hasResubmissionRequest && !justUploaded && (
                    <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 space-y-2">
                      {/* Reason / RSP note */}
                      {(parsedNotice?.reason || review?.remarks) && (
                        <p className="text-xs text-amber-800">
                          <span className="font-semibold">Reason:</span> {parsedNotice?.reason || review?.remarks}
                        </p>
                      )}
                      {parsedNotice?.notes && (
                        <p className="text-xs text-amber-700">
                          <span className="font-semibold">RSP Note:</span> {parsedNotice.notes}
                        </p>
                      )}

                      {/* Hidden file input */}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        className="hidden"
                        ref={(el) => { fileInputRefs.current[reviewKey] = el; }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setPendingFiles((prev) => ({ ...prev, [reviewKey]: file }));
                          e.target.value = '';
                        }}
                      />

                      {/* Step 1 — no file chosen yet */}
                      {!selectedFile && !isUploading && (
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[reviewKey]?.click()}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                          style={{ backgroundColor: '#363EE8' }}
                        >
                          <Upload size={12} />
                          Choose File to Re-upload
                        </button>
                      )}

                      {/* Step 2 — file chosen, waiting for confirmation */}
                      {selectedFile && !isUploading && (
                        <div className="rounded-lg border border-amber-200 bg-white px-3 py-2.5 space-y-2">
                          <button
                            type="button"
                            title="Click to preview the selected file"
                            onClick={() => {
                              const url = URL.createObjectURL(selectedFile);
                              window.open(url, '_blank', 'noopener,noreferrer');
                              setTimeout(() => URL.revokeObjectURL(url), 10000);
                            }}
                            className="flex items-start gap-2 w-full text-left rounded-md px-1 py-0.5 transition hover:bg-amber-50 group"
                          >
                            <FileText size={14} className="mt-0.5 shrink-0 text-slate-400 group-hover:text-blue-600 transition" />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-blue-600 underline underline-offset-2 group-hover:text-blue-800">{selectedFile.name}</p>
                              <p className="text-xs text-slate-500">{formatFileSize(selectedFile.size)} · {selectedFile.type || 'document'} · <span className="text-blue-500">Click to preview</span></p>
                            </div>
                          </button>
                          <p className="text-xs text-slate-600">Please confirm this is the correct file before submitting.</p>
                          <div className="flex items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => { void handleReupload(doc, selectedFile); clearPending(); }}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                              style={{ backgroundColor: '#363EE8' }}
                            >
                              <CheckCircle2 size={12} /> Confirm &amp; Submit
                            </button>
                            <button
                              type="button"
                              onClick={() => { clearPending(); fileInputRefs.current[reviewKey]?.click(); }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                            >
                              Change File
                            </button>
                            <button
                              type="button"
                              onClick={clearPending}
                              className="ml-auto text-xs text-slate-400 hover:text-slate-600 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Step 3 — uploading in progress */}
                      {isUploading && (
                        <div className="flex items-center gap-2 text-xs text-amber-800 font-medium">
                          <RefreshCw size={12} className="animate-spin" />
                          Uploading your document, please wait…
                        </div>
                      )}

                      {uploadError && (
                        <ActionFeedback
                          className="mt-2"
                          title="We couldn't upload this document."
                          message={uploadError}
                          nextStep="Choose the file again, then confirm the upload."
                          focusOnMount={false}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Important Notice */}
      <section className={`mt-6 rounded-2xl border px-6 py-5 ${badge.tone === 'rejected' ? 'bg-rose-100 border-rose-400' : NOTICE_CLASS[badge.tone]}`}>
        <div className="flex items-start gap-3">
          {badge.tone === 'rejected'
            ? <CircleX size={22} className="mt-0.5 flex-shrink-0 text-rose-600" />
            : <Mail size={20} className="mt-0.5 flex-shrink-0" />}
          <div>
            <p className="font-bold text-base" style={{ color: badge.tone === 'rejected' ? '#9F1239' : '#040E6B' }}>
              {badge.tone === 'rejected' ? 'Application Disqualified' : 'Important Notice'}
            </p>
            <p className="mt-1 text-sm" style={{ color: badge.tone === 'rejected' ? '#BE123C' : '#040E6B' }}>
              {getNoticeMessage(record.status, badge.tone, record.disqualification_reason)}
            </p>
            {badge.tone === 'rejected' && !record.disqualified_at && disqualificationSummary && (
              <div className="mt-3 rounded-xl border border-rose-300 bg-white/60 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Reason from RSP Admin</p>
                <p className="mt-1 text-sm text-rose-800">{disqualificationSummary}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  ) : null;

  return (
    <div className="min-h-screen bg-white py-12 px-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
      <div className="mx-auto w-full max-w-5xl">
        {/* Header */}
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold sm:text-5xl" style={{ color: '#040E6B' }}>Application Status Tracker</h1>
          <p className="mt-2 text-base" style={{ color: '#363EE8' }}>Track your application progress in real-time</p>
        </header>

        {/* Search card */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-bold" style={{ color: '#040E6B' }}>Search Application</h2>
          <p className="mt-1 text-sm" style={{ color: '#363EE8' }}>Enter your Reference No. to view detailed status</p>

          <form onSubmit={handleSearch} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setError(null); }}
              placeholder="e.g., ABYAN-123-456 or your.email@example.com"
              className="flex-1 rounded-xl px-4 py-3 text-sm outline-none ring-1 ring-transparent focus:ring-2"
              style={{ backgroundColor: '#C8D1FF', color: '#040E6B' }}
            />
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading || undefined}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: '#363EE8' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#252AB5'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#363EE8'}
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Search</>
                : <><Search size={16} /> Search</>}
            </button>
          </form>

          {error && (
            <ActionFeedback
              className="mt-4"
              title="We couldn't look up your application."
              message={error.message}
              nextStep={error.nextStep}
              onDismiss={() => setError(null)}
            />
          )}
        </section>

        {/* Empty state */}
        {searched && applications.length === 0 && !error && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <FileText size={40} className="mx-auto mb-3" style={{ color: '#C8D1FF' }} />
            <p className="font-semibold" style={{ color: '#040E6B' }}>No application found</p>
            <p className="mt-1 text-sm" style={{ color: '#363EE8' }}>
              Double-check your Reference No. or email address and try again.
            </p>
          </div>
        )}

        {/* Results */}
        {applications.length === 1 && details}
        {/* Several applications under one Reference No.: one row each, the
            open row expands in place to the sections above. */}
        {applications.length > 1 && (
          <section className="abyan-tokens mt-8" aria-labelledby="tracker-applications-title">
            <div className="abyan-ds">
              <h2 id="tracker-applications-title" className="text-xl font-bold text-[var(--color-primary-900)]">
                Your applications
              </h2>
              <p className="mt-1 text-sm text-[var(--neutral-600)]">
                {`${applications[0].first_name} ${applications[0].last_name}`.trim()} · {applications.length} applications under
                Reference No. {applications[0].reference_no || '—'}. Select one to see its status.
              </p>
            </div>

            <ul className="mt-4 space-y-3">
              {applications.map((app) => {
                const isOpen = app.id === openId;
                const rowBadge = getBadge(app.status);
                const closed = isClosedApplicationStatus(app.status);
                const withdrawn = normalizeStatus(app.status) === 'Withdrawn - Hired Elsewhere';
                const needsAction = actionIds.has(app.id) && !closed && !withdrawn;
                const panelId = `tracker-application-${app.id}`;
                const meta = [app.office, app.plantilla_label, `Submitted ${formatRowDate(app.created_at)}`]
                  .filter(Boolean)
                  .join(' · ');

                return (
                  <li
                    key={app.id}
                    className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors ${
                      isOpen ? 'border-[var(--color-primary-200)]' : 'border-[var(--neutral-200)]'
                    }`}
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpenId(isOpen ? null : app.id)}
                      className={`abyan-ds flex w-full items-start gap-3 px-5 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-primary)] sm:items-center ${
                        isOpen ? 'bg-[var(--color-primary-50)]' : 'hover:bg-[var(--neutral-100)]'
                      }`}
                    >
                      <ChevronRight
                        size={20}
                        aria-hidden="true"
                        className={`mt-0.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none sm:mt-0 ${
                          isOpen ? 'rotate-90 text-[var(--color-primary)]' : 'text-[var(--neutral-400)]'
                        }`}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block font-semibold ${withdrawn ? 'text-[var(--neutral-600)]' : 'text-[var(--color-primary-900)]'}`}
                          >
                            {app.position || '—'}
                          </span>
                          <span className="mt-0.5 block text-xs text-[var(--neutral-600)]">
                            {withdrawn && app.hired_elsewhere_plantilla_label
                              ? `Withdrawn: hired on ${app.hired_elsewhere_plantilla_label}`
                              : meta}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-wrap items-center gap-3">
                          {needsAction && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--warning-700)]">
                              <AlertCircle size={14} aria-hidden="true" /> Action required
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${BADGE_CLASS[rowBadge.tone]}`}>
                            {rowBadge.tone === 'approved' && <CheckCircle2 size={12} aria-hidden="true" />}
                            {rowBadge.tone === 'rejected' && <CircleX size={12} aria-hidden="true" />}
                            {rowBadge.label}
                          </span>
                        </span>
                      </span>
                    </button>

                    {isOpen && (
                      <div
                        id={panelId}
                        className="border-t border-[var(--neutral-200)] bg-[var(--bg-page)] px-3 pb-5 pt-5 sm:px-5 [&>*:first-child]:!mt-0"
                      >
                        {details}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-10 text-center text-sm" style={{ color: '#363EE8' }}>
          <p>
            Need assistance? Contact our admissions office at{' '}
            <a
              className="font-medium underline-offset-2 hover:underline"
              href="https://mail.google.com/mail/?view=cm&fs=1&to=cictrix23@gmail.com&su=Application%20Status%20Inquiry"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#040E6B' }}
            >
              cictrix23@gmail.com
            </a>
          </p>
          <p className="mt-2">
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition"
              style={{ backgroundColor: '#363EE8' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#252AB5')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#363EE8')}
            >
              ← Back to Applicant Portal
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
};
