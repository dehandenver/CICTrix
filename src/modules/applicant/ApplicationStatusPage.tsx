import { AlertCircle, CheckCircle2, CircleX, FileText, Mail, RefreshCw, Search, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ATTACHMENTS_BUCKET, supabase } from '../../lib/supabase';
import { getApplicants, saveApplicants } from '../../lib/recruitmentData';

interface ApplicationRecord {
  id: string;
  item_number: string;
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

type BadgeTone = 'approved' | 'in-review' | 'rejected' | 'new';

const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  'New Application': { label: 'New', tone: 'new' },
  'Pending': { label: 'New', tone: 'new' },
  'Under Review': { label: 'Under Review', tone: 'in-review' },
  'Shortlisted': { label: 'In Review', tone: 'in-review' },
  'For Interview': { label: 'In Review', tone: 'in-review' },
  'Interview Scheduled': { label: 'In Review', tone: 'in-review' },
  'Interview Completed': { label: 'In Review', tone: 'in-review' },
  'Recommended for Hiring': { label: 'Approved', tone: 'approved' },
  'Hired': { label: 'Approved', tone: 'approved' },
  'Accepted': { label: 'Approved', tone: 'approved' },
  'Not Qualified': { label: 'Not Qualified', tone: 'rejected' },
  'Rejected': { label: 'Rejected', tone: 'rejected' },
  'Disqualified': { label: 'Disqualified', tone: 'rejected' },
  'Document Verified': { label: 'Document Verified', tone: 'approved' },
  'Action Required': { label: 'Action Required', tone: 'new' },
};

const BADGE_CLASS: Record<BadgeTone, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'in-review': 'bg-blue-50 text-blue-700 border border-blue-200',
  rejected: 'bg-rose-50 text-rose-700 border border-rose-200',
  new: 'bg-amber-50 text-amber-700 border border-amber-200',
};

const NOTICE_CLASS: Record<BadgeTone, string> = {
  approved: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  'in-review': 'bg-blue-50 border-blue-200 text-blue-800',
  rejected: 'bg-rose-50 border-rose-200 text-rose-800',
  new: 'bg-amber-50 border-amber-200 text-amber-800',
};

const NOTICE_MESSAGE: Record<BadgeTone, string> = {
  approved: 'Congratulations! Your application has been approved. You will receive an official notice via email within 3–5 business days.',
  'in-review': 'Your application is currently being reviewed. We will notify you by email once a decision is reached.',
  rejected: 'We regret to inform you that your application was not selected for this position. Thank you for your interest.',
  new: 'Your application has been received. We will begin reviewing it shortly.',
};

const getNoticeMessage = (status: string, tone: BadgeTone): string => {
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
    return 'Your application has been disqualified and will no longer proceed in the selection process. Please refer to the notice above for details. For further inquiries, contact the Recruitment Office.';
  }
  return NOTICE_MESSAGE[tone];
};

const TIMELINE_STAGES = [
  { key: 'submitted', title: 'Application Submitted', subtitle: 'Your application has been received' },
  { key: 'verification', title: 'Uploaded Documents', subtitle: 'View your uploaded documents, status, and RSP remarks' },
  { key: 'qualifications', title: 'Qualifications Assessment', subtitle: 'Reviewing educational background and experience' },
  { key: 'exam_interview', title: 'Exam & Interview', subtitle: 'Written examination and panel interview' },
  { key: 'committee', title: 'Committee Review', subtitle: 'Application reviewed by admissions committee' },
  { key: 'final', title: 'Final Decision', subtitle: 'Final decision on application' },
] as const;

type StageState = 'done' | 'current' | 'pending' | 'rejected' | 'cancelled';

const stageStatesForStatus = (rawStatus: string, docsValidated: boolean, hasSchedule: boolean): StageState[] => {
  const status = rawStatus.toLowerCase();
  const v: StageState = docsValidated ? 'done' : 'current';

  if (status.includes('reject') || status.includes('not qualified') || status.includes('disqual') || status.includes('failed')) {
    if (hasSchedule) {
      // Applicant reached the exam/interview stage before disqualification
      return ['done', 'done', 'done', 'rejected', 'cancelled', 'cancelled'];
    }
    return ['done', v, 'rejected', 'cancelled', 'cancelled', 'cancelled'];
  }
  // Hired / Accepted / Recommended for Hiring → all stages done, final decision made
  if (status.includes('hired') || status.includes('accept') || status.includes('recommend')) {
    return ['done', 'done', 'done', 'done', 'done', 'done'];
  }
  // Scores submitted → exam & interview done, committee now reviewing
  if (status.includes('interview completed')) {
    return ['done', 'done', 'done', 'done', 'current', 'pending'];
  }
  // Scheduled → exam & interview stage is active
  if (status.includes('interview') || hasSchedule) {
    return ['done', 'done', 'done', 'current', 'pending', 'pending'];
  }
  if (status.includes('shortlist')) {
    return ['done', v, 'current', 'pending', 'pending', 'pending'];
  }
  if (status.includes('under review') || status.includes('reviewing')) {
    return ['done', v, 'pending', 'pending', 'pending', 'pending'];
  }
  return ['done', docsValidated ? 'done' : 'pending', 'pending', 'pending', 'pending', 'pending'];
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

const formatShortDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getBadge = (status: string) =>
  STATUS_BADGE[status] ?? { label: status || 'Pending', tone: 'new' as BadgeTone };

export const ApplicationStatusPage = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<ApplicationRecord | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [docReviews, setDocReviews] = useState<Record<string, DocReview>>({});
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const fetchAttachments = async (applicantId: string) => {
    try {
      const { data, error: err } = await (supabase as any)
        .from('applicant_attachments')
        .select('id, file_name, file_path, document_type, created_at')
        .eq('applicant_id', applicantId)
        .order('created_at', { ascending: false });
      if (!err && Array.isArray(data)) setAttachments(data as AttachmentRow[]);
    } catch { /* silently ignore */ }
  };

  const fetchRecord = async (applicantId: string) => {
    try {
      const { data, error: err } = await (supabase as any)
        .from('applicants')
        .select('*')
        .eq('id', applicantId)
        .single();
      // Full replacement — never merge with stale prev so status always reflects DB truth
      if (!err && data) setRecord(data as ApplicationRecord);
    } catch { /* silently ignore */ }
  };

  // Real-time: applicant_attachments — uses filtered subscription (works with REPLICA IDENTITY FULL).
  // Polling fallback below covers the case where the filter doesn't fire.
  useEffect(() => {
    if (!record?.id) return;
    const rid = record.id;
    const channel = (supabase as any)
      .channel(`tracker_attachments_${rid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applicant_attachments', filter: `applicant_id=eq.${rid}` }, () => {
        void fetchAttachments(rid);
      })
      .subscribe();
    return () => { void (supabase as any).removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  // Real-time: applicants status — UNFILTERED so it works without REPLICA IDENTITY FULL.
  // Server-side filtered subscriptions are silently dropped when REPLICA IDENTITY is not FULL;
  // listening to the whole table and filtering client-side on payload.new.id is reliable.
  useEffect(() => {
    if (!record?.id) return;
    const rid = record.id;
    const channel = (supabase as any)
      .channel(`tracker_applicants_${rid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'applicants' }, (payload: any) => {
        if ((payload.new as { id?: string })?.id === rid) {
          void fetchRecord(rid);
          void fetchAttachments(rid);
        }
      })
      .subscribe();
    return () => { void (supabase as any).removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  // Polling fallback — 2 s so status changes (disqualify, validate docs, etc.) feel instant.
  useEffect(() => {
    if (!record?.id) return;
    const rid = record.id;
    // Immediate first poll so we never show stale data after search
    void fetchRecord(rid);
    const interval = setInterval(() => {
      void fetchAttachments(rid);
      void fetchRecord(rid);
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);
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

  const getReviewKey = (applicantId: string, filePath: string) => `${applicantId}::${filePath}`;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Please enter your application number or email.');
      return;
    }

    setError('');
    setLoading(true);
    setSearched(false);
    setRecord(null);
    setAttachments([]);
    setDocReviews({});
    setUploadSuccess(null);
    setResolvedDocTypes(new Set());
    setSubmittedFileNames({});

    try {
      const looksLikeEmail = trimmed.includes('@');
      const lookupColumn = looksLikeEmail ? 'email' : 'item_number';
      const lookupValue = looksLikeEmail ? trimmed.toLowerCase() : trimmed.toUpperCase();

      const { data, error: dbError } = await (supabase as any)
        .from('applicants')
        .select('*')
        .eq(lookupColumn, lookupValue)
        .order('created_at', { ascending: false })
        .limit(1);

      if (dbError) throw new Error(dbError.message);
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;

      if (!row) {
        setSearched(true);
        return;
      }

      const mapped: ApplicationRecord = {
        id: String(row.id ?? ''),
        item_number: String(row.item_number ?? ''),
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
      };

      setRecord(mapped);
      await fetchAttachments(mapped.id);

      // Load doc reviews from localStorage
      const allReviews = loadDocReviews();
      setDocReviews(allReviews);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to look up your application. Please try again.');
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

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
      if (Array.isArray(refreshed)) setAttachments(refreshed as AttachmentRow[]);

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
            status: 'Under Review' as 'Under Review',
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

      setRecord((prev) => prev ? { ...prev, status: 'Under Review', updated_at: new Date().toISOString() } : null);

      // Optimistically mark this doc type as resolved and store the new file
      // name so the card header updates immediately without waiting for the
      // real-time Supabase refetch.
      if (doc.document_type) {
        setResolvedDocTypes((prev) => new Set([...prev, doc.document_type!]));
        setSubmittedFileNames((prev) => ({ ...prev, [doc.document_type!]: file.name }));
      }
      setUploadSuccess(key);
      setTimeout(() => setUploadSuccess(null), 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setUploadErrors((prev) => ({ ...prev, [key]: msg }));
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
  const statusImpliesVerified = (() => {
    const s = (record?.status ?? '').toLowerCase();
    return s.includes('document verified') || s.includes('shortlist') ||
           s.includes('interview') || s.includes('hired') ||
           s.includes('accept') || s.includes('recommend');
  })();

  const docsValidated = docValidatedRows.length > 0 || statusImpliesVerified;

  const badge = record ? getBadge(record.status) : null;
  const hasSchedule = !!(record?.exam_date || record?.interview_date);
  const stageStates = record ? stageStatesForStatus(record.status, docsValidated, hasSchedule) : [];
  const fullName = record ? `${record.first_name} ${record.last_name}`.trim() : '';
  const isHired = record ? (() => { const s = record.status.toLowerCase(); return s.includes('hired') || s.includes('accept') || s.includes('recommend'); })() : false;
  const programType =
    record?.application_type === 'promotion' ? 'Promotional Application' : 'Job Application';

  // Map from RSP document slot label → document_type key used in attachments
  const LABEL_TO_DOC_TYPE: Record<string, string> = {
    'Application Letter': 'application_letter',
    'Personal Data Sheet': 'pds_with_photo',
    'Curriculum Vitae': 'curriculum_vitae',
    'Proof of Eligibility Rating/License': 'eligibility_proof',
    'Certificate of Relevant Training/Seminars': 'training_certificate',
    'Transcript of Records': 'transcript_of_records',
    'Certificate from Previous Employer': 'previous_employer_certificate',
    'Drug Test Result': 'drug_test',
    'Other Supporting Documents': 'other',
  };

  const parseNotice = (notice: AttachmentRow) => {
    const parts = notice.file_name.split('::');
    return {
      document: parts[1] ?? notice.file_name,
      reason: parts[2] ?? '',
      notes: notice.file_path === '—' ? '' : notice.file_path,
      date: notice.created_at,
      docType: LABEL_TO_DOC_TYPE[parts[1] ?? ''] ?? '',
    };
  };

  // All RSP resubmission notice rows
  const allNotices = attachments.filter((a) => a.document_type === 'resubmission_request');

  // Keep only the latest notice per doc type, then check if a newer real upload
  // exists after it. If yes → the applicant already re-submitted → notice resolved.
  // This works purely from timestamps so no Supabase UPDATE is needed.
  const latestNoticeByDocType = new Map<string, AttachmentRow>();
  allNotices.forEach((notice) => {
    const { docType } = parseNotice(notice);
    if (!docType) return;
    const existing = latestNoticeByDocType.get(docType);
    if (!existing || new Date(notice.created_at).getTime() > new Date(existing.created_at).getTime()) {
      latestNoticeByDocType.set(docType, notice);
    }
  });

  // A notice is "pending" only when there is no real upload created after it.
  const pendingResubmissionTypes = new Set<string>();
  latestNoticeByDocType.forEach((notice, docType) => {
    const noticeTime = new Date(notice.created_at).getTime();
    const hasNewerUpload = attachments.some(
      (a) =>
        a.document_type === docType &&
        a.document_type !== 'resubmission_request' &&
        a.document_type !== 'resubmission_resolved' &&
        new Date(a.created_at ?? '').getTime() > noticeTime,
    );
    if (!hasNewerUpload) pendingResubmissionTypes.add(docType);
  });

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
  const isApplicationClosed = (() => {
    if (!record) return false;
    const s = String(record.status ?? '').toLowerCase();
    return s.includes('disqualif') || s.includes('not qualified') || s.includes('failed') || s.includes('rejected');
  })();

  const hasActionRequired = record && !isApplicationClosed && (
    resubmissionNotices.length > 0 ||
    deduplicatedAttachments.some((a) => {
      const key = getReviewKey(record.id, a.file_path);
      return (docReviews[key]?.status ?? 'pending') === 'resubmission_requested';
    })
  );

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
          <p className="mt-1 text-sm" style={{ color: '#363EE8' }}>Enter your application number to view detailed status</p>

          <form onSubmit={handleSearch} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setError(''); }}
              placeholder="e.g., ITEM-2026-0001 or your.email@example.com"
              className="flex-1 rounded-xl px-4 py-3 text-sm outline-none ring-1 ring-transparent focus:ring-2"
              style={{ backgroundColor: '#C8D1FF', color: '#040E6B' }}
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: '#363EE8' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#252AB5'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#363EE8'}
            >
              <Search size={16} />
              {loading ? 'Searching…' : 'Search'}
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
        </section>

        {/* Empty state */}
        {searched && !record && !error && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <FileText size={40} className="mx-auto mb-3" style={{ color: '#C8D1FF' }} />
            <p className="font-semibold" style={{ color: '#040E6B' }}>No application found</p>
            <p className="mt-1 text-sm" style={{ color: '#363EE8' }}>
              Double-check your application number or email address and try again.
            </p>
          </div>
        )}

        {/* Results */}
        {record && badge && (
          <>
            {/* Disqualified / Closed banner */}
            {isApplicationClosed && (
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
                  {record.disqualification_reason && (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-white/70 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Reason</p>
                      <p className="mt-1 text-sm text-rose-800">{record.disqualification_reason}</p>
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
                  <p className="mt-1 text-sm" style={{ color: '#363EE8' }}>{record.item_number || '—'}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${BADGE_CLASS[badge.tone]}`}>
                  {badge.tone === 'approved' && <CheckCircle2 size={14} />}
                  {badge.tone === 'rejected' && <CircleX size={14} />}
                  {badge.label}
                </span>
              </div>

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

            {/* Application Progress */}
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h3 className="text-xl font-bold" style={{ color: '#040E6B' }}>Application Progress</h3>
              <p className="mt-1 text-sm" style={{ color: '#363EE8' }}>Track your application through each stage</p>

              <ol className="mt-6">
                {TIMELINE_STAGES.map((stage, index) => {
                  const state = stageStates[index] ?? 'pending';
                  const isLast = index === TIMELINE_STAGES.length - 1;
                  const isVerification = stage.key === 'verification';
                  const isExamInterview = stage.key === 'exam_interview';
                  const isFinal = stage.key === 'final';

                  const iconWrap =
                    state === 'done' ? 'bg-emerald-100 text-emerald-600' :
                      state === 'current' ? 'text-white' :
                        state === 'rejected' ? 'bg-rose-100 text-rose-600' :
                          state === 'cancelled' ? 'bg-slate-100 text-slate-300' :
                            'text-slate-400';
                  const currentBg = state === 'current' ? { backgroundColor: '#363EE8' } : {};
                  const titleStyle =
                    state === 'pending' ? { color: '#C8D1FF' } :
                      state === 'cancelled' ? { color: '#CBD5E1', textDecoration: 'line-through' as const } :
                        state === 'rejected' ? { color: '#9F1239' } :
                          { color: '#040E6B' };
                  const subtitleStyle =
                    state === 'cancelled' ? { color: '#CBD5E1' } :
                      state === 'rejected' ? { color: '#BE123C' } :
                        { color: '#363EE8' };
                  const dateForStage =
                    state === 'done' || state === 'current' || state === 'rejected'
                      ? (index === 0 ? formatShortDate(record.created_at) : formatShortDate(record.updated_at))
                      : '';
                  const connectorClass =
                    state === 'done' ? 'bg-emerald-200' :
                      state === 'rejected' ? 'bg-rose-200' :
                        state === 'cancelled' ? 'border-l border-dashed border-slate-200 w-0' :
                          'bg-slate-200';

                  return (
                    <li key={stage.key} className={`relative flex gap-4 pb-6 last:pb-0 ${state === 'cancelled' ? 'opacity-50' : ''}`}>
                      {!isLast && (
                        <span
                          className={`absolute left-[18px] top-9 h-[calc(100%-2rem)] ${state === 'cancelled' ? 'border-l border-dashed border-slate-200' : `w-px ${connectorClass}`}`}
                          aria-hidden="true"
                        />
                      )}

                      <span className={`relative z-[1] flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${iconWrap}`} style={currentBg}>
                        {state === 'rejected'
                          ? <CircleX size={18} />
                          : state === 'cancelled'
                            ? <span className="text-sm font-bold text-slate-300">—</span>
                            : <CheckCircle2 size={18} />}
                      </span>

                      <div className="flex-1 pt-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h4 className="text-base font-semibold" style={titleStyle}>{stage.title}</h4>
                          {dateForStage && (
                            <span className="text-xs font-medium" style={{ color: '#363EE8' }}>{dateForStage}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm" style={subtitleStyle}>{stage.subtitle}</p>

                        {/* Verification stage: doc status */}
                        {isVerification && hasActionRequired && (
                          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                            <AlertCircle size={12} /> Document resubmission required
                          </div>
                        )}
                        {state === 'done' && stage.key === 'verification' && !hasActionRequired && (
                          <div className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: '#C8D1FF', color: '#040E6B' }}>
                            {docsValidated ? 'All documents verified by RSP Admin' : 'All required documents received'}
                          </div>
                        )}

                        {/* Exam & Interview — show schedule when active or done */}
                        {isExamInterview && (state === 'current' || state === 'done') && hasSchedule && (
                          <div className="mt-3 rounded-xl border overflow-hidden" style={{ borderColor: '#C8D1FF' }}>
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
                        {isExamInterview && state === 'done' && (
                          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 size={12} /> Examination and interview completed
                          </div>
                        )}

                        {/* Committee Review */}
                        {state === 'done' && stage.key === 'committee' && (
                          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                            Interview and exam scores evaluated by the committee
                          </div>
                        )}

                        {/* Final Decision — hired message */}
                        {isFinal && state === 'done' && isHired && (
                          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                            <p className="text-sm font-bold text-emerald-800">Congratulations!</p>
                            <p className="mt-0.5 text-sm text-emerald-700">
                              You have been selected for the position of <span className="font-semibold">{record.position}</span>.
                              The RSP Office will contact you with further instructions regarding your appointment.
                            </p>
                          </div>
                        )}

                        {/* Shortlist notice */}
                        {stage.key === 'qualifications' && state === 'current' && record && record.status.toLowerCase().includes('shortlist') && (
                          <div className="mt-3 rounded-lg border px-3 py-2 text-sm font-medium" style={{ backgroundColor: '#EEF0FD', borderColor: '#C8D1FF', color: '#040E6B' }}>
                            Your application has been shortlisted and is undergoing further committee evaluation.
                          </div>
                        )}
                        {/* Disqualification — shown on the stage where rejection occurred */}
                        {state === 'rejected' && (
                          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                            <p className="text-sm font-semibold text-rose-800">Application did not advance past this stage</p>
                            {record?.disqualification_reason && (
                              <p className="mt-1 text-sm text-rose-700">{record.disqualification_reason}</p>
                            )}
                          </div>
                        )}
                        {/* Cancelled — stages that will never be reached */}
                        {state === 'cancelled' && (
                          <p className="mt-1 text-xs italic text-slate-300">This stage was not reached</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            {/* Submitted Documents */}
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h3 className="text-xl font-bold" style={{ color: '#040E6B' }}>Submitted Documents</h3>
              <p className="mt-1 text-sm" style={{ color: '#363EE8' }}>Status of your submitted documents</p>

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
                      <div key={doc.id} className={`rounded-xl border bg-white overflow-hidden ${hasResubmissionRequest && !justUploaded ? 'border-amber-300' : 'border-slate-200'}`}>
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
                              <CheckCircle2 size={12} /> Verified
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
                              <p className="text-xs font-medium text-red-600">
                                Upload failed: {uploadError} — please try again.
                              </p>
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
                    {getNoticeMessage(record.status, badge.tone)}
                  </p>
                </div>
              </div>
            </section>
          </>
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
