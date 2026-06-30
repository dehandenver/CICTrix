import {
    Activity as ActivityIcon,
    ArrowLeft,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    CircleX,
    Eye,
    FileText,
    Lock,
    Mail,
    MessageSquare,
    Send,
    Star,
    User,
    Users,
    X
} from 'lucide-react';
import { AdminHeader } from '../../components/AdminHeader';
import { Sidebar } from '../../components/Sidebar';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getPreferredDataSourceMode } from '../../lib/dataSourceMode';
import { mockDatabase } from '../../lib/mockDatabase';
import { sendEmail } from '../../lib/email';
import { getApplicants, getAuthoritativeJobPostings, saveApplicants } from '../../lib/recruitmentData';
import { ATTACHMENTS_BUCKET, isMockModeEnabled, supabase } from '../../lib/supabase';
import type { Applicant, JobPosting } from '../../types/recruitment.types';

type ApplicantRecord = {
  id: string;
  item_number?: string;
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
};

type AttachmentRecord = {
  id: string;
  file_name: string;
  file_path: string;
  created_at?: string;
  document_type?: string;
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
};

type AppointmentType = 'original' | 'promotional';
type EducationAttainmentValue =
  | ''
  | 'elementary_level'
  | 'elementary_graduate'
  | 'high_school_level'
  | 'high_school_graduate'
  | 'college_level'
  | 'college_graduate'
  | 'masteral_units'
  | 'graduate_school';

type TabKey = 'overview' | 'qualifications' | 'documents' | 'interview' | 'activity';

type ScoreBreakdown = {
  total: number;
  education: number;
  experience: number;
  performance: number;
  written: number;
  pcpt: number;
  rawPcpt: number;
  oral: number;
  adjective: string;
};

const ATTACHMENT_PREVIEW_CACHE_KEY = 'cictrix_attachment_previews';
const SCORE_SETUP_STORAGE_KEY = 'cictrix_rsp_score_setup';
const SCORE_EDUCATION_STORAGE_KEY = 'cictrix_rsp_score_education';
const SCORE_EXPERIENCE_STORAGE_KEY = 'cictrix_rsp_score_experience';
const SCORE_WRITTEN_STORAGE_KEY = 'cictrix_rsp_score_written';
const SCORE_FINALIZED_STORAGE_KEY = 'cictrix_rsp_score_finalized';
const SCORE_DRAFT_STORAGE_KEY = 'cictrix_rsp_score_draft';
const INTERVIEWER_SCORE_SNAPSHOT_STORAGE_KEY = 'cictrix_interviewer_score_snapshot';

type StoredInterviewerScoreSnapshot = {
  pcptAverage?: number;
  oralAverage?: number;
  updatedAt?: string;
};

const EDUCATION_ATTAINMENT_OPTIONS: Array<{
  value: EducationAttainmentValue;
  label: string;
  points: number;
}> = [
  { value: '', label: 'Select Educational Attainment', points: 0 },
  { value: 'elementary_level', label: 'Elementary Level (10 pts)', points: 10 },
  { value: 'elementary_graduate', label: 'Elementary Graduate (11 pts)', points: 11 },
  { value: 'high_school_level', label: 'High School Level (12 pts)', points: 12 },
  { value: 'high_school_graduate', label: 'High School Graduate (13 pts)', points: 13 },
  { value: 'college_level', label: 'College Level (14 pts)', points: 14 },
  { value: 'college_graduate', label: 'College Graduate (16 pts)', points: 16 },
  { value: 'masteral_units', label: 'Masteral Units (18 pts)', points: 18 },
  { value: 'graduate_school', label: 'Graduate School (20 pts)', points: 20 },
];

const experienceYearsToPoints = (years: number): number => {
  if (years <= 0) return 0;
  if (years <= 5) return 12;
  if (years <= 10) return 14;
  if (years <= 15) return 16;
  if (years <= 20) return 18;
  return 20;
};

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

const adjectiveFromScore = (score: number) => {
  if (score >= 90) return 'Excellent';
  if (score >= 77) return 'Very Good';
  if (score >= 64) return 'Good';
  if (score >= 51) return 'Average';
  return 'Below Average';
};

const clamp20 = (value: number) => Math.max(0, Math.min(20, Math.round(value)));

const to20FromFivePoint = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return 0;
  return clamp20((value / 5) * 20);
};

const to20FromPcpt = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return 0;
  // Support both legacy average scale (1-5) and current raw sum scale (6-30).
  if (value <= 5) return clamp20((value / 5) * 20);
  return clamp20((value / 30) * 20);
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

const computeScoreBreakdown = (
  evaluation: EvaluationRecord | null,
  fallback?: StoredInterviewerScoreSnapshot | null,
): ScoreBreakdown => {
  if (!evaluation && !fallback) {
    return {
      total: 0,
      education: 0,
      experience: 0,
      performance: 0,
      written: 0,
      pcpt: 0,
      rawPcpt: 0,
      oral: 0,
      adjective: 'Below Average',
    };
  }

  const fallbackOralAverage =
    typeof fallback?.oralAverage === 'number' && fallback.oralAverage > 0
      ? fallback.oralAverage
      : 0;
  const fallbackPcptAverage =
    typeof fallback?.pcptAverage === 'number' && fallback.pcptAverage > 0
      ? fallback.pcptAverage
      : 0;

  if (!evaluation) {
    const oralFromFallback = to20FromFivePoint(fallbackOralAverage);
    const rawPcptFromFallback = fallbackPcptAverage || fallbackOralAverage;
    const pcptFromFallback = to20FromPcpt(rawPcptFromFallback);
    const totalFromFallback = Math.max(0, Math.min(100, oralFromFallback + pcptFromFallback));

    return {
      total: totalFromFallback,
      education: 0,
      experience: 0,
      performance: 0,
      written: 0,
      pcpt: pcptFromFallback,
      rawPcpt: rawPcptFromFallback,
      oral: oralFromFallback,
      adjective: adjectiveFromScore(totalFromFallback),
    };
  }

  const technicalScore = parseScore(evaluation.technical_score);
  const overallScore = parseScore(evaluation.overall_score) || parseScore(evaluation.score);
  const communicationSkillsScore = parseScore(evaluation.communication_skills_score) || parseScore(evaluation.communication_score);
  const confidenceScore = parseScore(evaluation.confidence_score);
  const comprehensionScore = parseScore(evaluation.comprehension_score);
  const personalityScore = parseScore(evaluation.personality_score);
  const jobKnowledgeScore = parseScore(evaluation.job_knowledge_score);
  const overallImpressionScore = parseScore(evaluation.overall_impression_score);

  const education = clamp20((technicalScore > 0 ? technicalScore : 0) / 1.5);
  const experience = to20FromFivePoint(jobKnowledgeScore);
  const performance = to20FromFivePoint(overallImpressionScore);
  const written = clamp20((technicalScore > 0 ? technicalScore : 0) / 1.5);

  const oralRaw = [
    communicationSkillsScore,
    confidenceScore,
    comprehensionScore,
  ].filter((v) => v > 0) as number[];
  const oralAverage = oralRaw.length > 0 ? oralRaw.reduce((sum, v) => sum + v, 0) / oralRaw.length : fallbackOralAverage;
  const oral = to20FromFivePoint(oralAverage);

  const pcptSource =
    (personalityScore > 0 ? personalityScore : undefined) ??
    (overallImpressionScore > 0 ? overallImpressionScore : undefined) ??
    (fallbackPcptAverage > 0 ? fallbackPcptAverage : undefined) ??
    (oralAverage > 0 ? oralAverage : 0);
  const pcpt = to20FromPcpt(pcptSource);

  let total = 0;
  if (overallScore > 0) {
    total = Math.max(0, Math.min(100, Math.round(overallScore)));
  } else {
    total = Math.max(0, Math.min(100, education + experience + performance + written + pcpt));
  }

  return {
    total,
    education,
    experience,
    performance,
    written,
    pcpt,
    rawPcpt: pcptSource,
    oral,
    adjective: adjectiveFromScore(total),
  };
};

const openDocument = async (filePath: string) => {
  if (!filePath) return;
  if (isMockModeEnabled) {
    window.open(filePath, '_blank', 'noopener,noreferrer');
    return;
  }

  const signed = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(filePath, 3600);
  const signedUrl = signed.data?.signedUrl;
  if (signedUrl) {
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  }
};

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
    merged.push({ ...row, file_name: labelize(row.file_name) });
  });

  return merged;
};

const mergeAttachmentRows = (primary: AttachmentRecord[], fallback: AttachmentRecord[]) => {
  const merged: AttachmentRecord[] = [];
  const seen = new Set<string>();

  [...primary, ...fallback].forEach((row, index) => {
    const dedupeKey = `${row.file_name}|${row.file_path}`;
    if ((!row.file_name && !row.file_path) || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    merged.push({
      ...row,
      id: row.id || `${dedupeKey}-${index}`,
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

const getStoredAppointmentType = (applicantId: string): AppointmentType => {
  try {
    const raw = localStorage.getItem(SCORE_SETUP_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, AppointmentType>) : {};
    return parsed[applicantId] === 'promotional' ? 'promotional' : 'original';
  } catch {
    return 'original';
  }
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

const getStoredEducationAttainment = (applicantId: string): EducationAttainmentValue => {
  try {
    const raw = localStorage.getItem(SCORE_EDUCATION_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, EducationAttainmentValue>) : {};
    return parsed[applicantId] ?? '';
  } catch {
    return '';
  }
};

const saveStoredEducationAttainment = (applicantId: string, educationAttainment: EducationAttainmentValue) => {
  try {
    const raw = localStorage.getItem(SCORE_EDUCATION_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, EducationAttainmentValue>) : {};
    parsed[applicantId] = educationAttainment;
    localStorage.setItem(SCORE_EDUCATION_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Best effort persistence only.
  }
};

const formValueToEducationAttainmentValue = (formValue: string): EducationAttainmentValue => {
  const map: Record<string, EducationAttainmentValue> = {
    'Elementary Level': 'elementary_level',
    'Elementary Graduate': 'elementary_graduate',
    'High School Level': 'high_school_level',
    'High School Graduate': 'high_school_graduate',
    'College Level': 'college_level',
    'College Graduate': 'college_graduate',
    'Masteral Units': 'masteral_units',
    'Graduate School': 'graduate_school',
  };
  return map[formValue] ?? '';
};

const getStoredExperienceYears = (applicantId: string): string => {
  try {
    const raw = localStorage.getItem(SCORE_EXPERIENCE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed[applicantId] ?? '';
  } catch {
    return '';
  }
};

const saveStoredExperienceYears = (applicantId: string, years: string) => {
  try {
    const raw = localStorage.getItem(SCORE_EXPERIENCE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[applicantId] = years;
    localStorage.setItem(SCORE_EXPERIENCE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {}
};

const isPromotionalSource = (
  recruitmentApplicant?: Applicant | null,
  applicantRow?: ApplicantRecord | null
) => {
  const recruitmentType = String(recruitmentApplicant?.applicationType ?? '').trim().toLowerCase();
  const dbType = String(applicantRow?.application_type ?? '').trim().toLowerCase();
  const hasInternalLink = Boolean(recruitmentApplicant?.internalApplication?.employeeId || applicantRow?.employee_id);

  return recruitmentType === 'promotion' || dbType === 'promotion' || hasInternalLink;
};

const getStoredWrittenScore = (applicantId: string): string => {
  try {
    const raw = localStorage.getItem(SCORE_WRITTEN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed[applicantId] ?? '';
  } catch {
    return '';
  }
};

const saveStoredWrittenScore = (applicantId: string, written: string) => {
  try {
    const raw = localStorage.getItem(SCORE_WRITTEN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[applicantId] = written;
    localStorage.setItem(SCORE_WRITTEN_STORAGE_KEY, JSON.stringify(parsed));
  } catch {}
};

const getStoredFinalizedState = (applicantId: string): boolean => {
  try {
    const raw = localStorage.getItem(SCORE_FINALIZED_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    return Boolean(parsed[applicantId]);
  } catch {
    return false;
  }
};

const saveStoredFinalizedState = (applicantId: string, finalized: boolean) => {
  try {
    const raw = localStorage.getItem(SCORE_FINALIZED_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    parsed[applicantId] = finalized;
    localStorage.setItem(SCORE_FINALIZED_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Best effort persistence only.
  }
};

const getStoredDraftState = (applicantId: string): boolean => {
  try {
    const raw = localStorage.getItem(SCORE_DRAFT_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    return Boolean(parsed[applicantId]);
  } catch {
    return false;
  }
};

const saveStoredDraftState = (applicantId: string, isDraft: boolean) => {
  try {
    const raw = localStorage.getItem(SCORE_DRAFT_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    parsed[applicantId] = isDraft;
    localStorage.setItem(SCORE_DRAFT_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Best effort persistence only.
  }
};

const getStoredInterviewerScoreSnapshot = (
  applicantId?: string,
  applicantEmail?: string,
): StoredInterviewerScoreSnapshot | null => {
  try {
    const raw = localStorage.getItem(INTERVIEWER_SCORE_SNAPSHOT_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, StoredInterviewerScoreSnapshot>) : {};

    const byId = applicantId ? parsed[`id:${String(applicantId).trim()}`] : undefined;
    const normalizedEmail = String(applicantEmail ?? '').trim().toLowerCase();
    const byEmail = normalizedEmail ? parsed[`email:${normalizedEmail}`] : undefined;

    const validValue = (value?: number) =>
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? Number(value) : undefined;

    const merged: StoredInterviewerScoreSnapshot = {
      pcptAverage: validValue(byId?.pcptAverage) ?? validValue(byEmail?.pcptAverage),
      oralAverage: validValue(byId?.oralAverage) ?? validValue(byEmail?.oralAverage),
      updatedAt: byId?.updatedAt ?? byEmail?.updatedAt,
    };

    if (!merged.pcptAverage && !merged.oralAverage) return null;
    return merged;
  } catch {
    return null;
  }
};

const DOCUMENT_SLOTS = [
  { type: 'application_letter',            label: 'Application Letter',                       required: true  },
  { type: 'pds_with_photo',               label: 'Personal Data Sheet',                      required: true  },
  { type: 'curriculum_vitae',             label: 'Curriculum Vitae',                         required: true  },
  { type: 'eligibility_proof',            label: 'Proof of Eligibility Rating/License',      required: true  },
  { type: 'training_certificate',         label: 'Certificate of Relevant Training/Seminars', required: true  },
  { type: 'transcript_of_records',        label: 'Transcript of Records',                    required: true  },
  { type: 'previous_employer_certificate',label: 'Certificate from Previous Employer',       required: false },
  { type: 'drug_test',                    label: 'Drug Test Result',                         required: true  },
  { type: 'other',                        label: 'Other Supporting Documents',               required: false },
] as const;

// Labelize'd file_name aliases → slot type (for attachments without document_type)
const FILE_NAME_TO_TYPE: Record<string, string> = {
  'Application Letter': 'application_letter',
  'Pds With Photo':     'pds_with_photo',
  'Curriculum Vitae':   'curriculum_vitae',
  'Eligibility Proof':  'eligibility_proof',
  'Training Certificate': 'training_certificate',
  'Transcript Of Records': 'transcript_of_records',
  'Previous Employer Certificate': 'previous_employer_certificate',
  'Drug Test':          'drug_test',
  'Other':              'other',
};

export function ApplicantDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const routeState = (location.state as ApplicantRouteState | null) ?? null;

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showScoresModal, setShowScoresModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('original');
  const [educationAttainment, setEducationAttainment] = useState<EducationAttainmentValue>('');
  const [experienceYears, setExperienceYears] = useState('');
  const [writtenScore, setWrittenScore] = useState('');
  const [potentialScore, setPotentialScore] = useState('');
  const [positionType, setPositionType] = useState<'rank-file' | 'executive'>('rank-file');
  const [isScoreFinalized, setIsScoreFinalized] = useState(false);
  const [isScoreDraft, setIsScoreDraft] = useState(false);

  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailTemplate, setEmailTemplate] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailNotes, setEmailNotes] = useState('');

  const [applicantStatus, setApplicantStatus] = useState<null | 'shortlist' | 'qualified' | 'disqualify'>(null);
  const [confirmAction, setConfirmAction] = useState<null | 'qualified' | 'disqualify'>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [disqualifyReason, setDisqualifyReason] = useState('');

  const [applicant, setApplicant] = useState<ApplicantRecord | null>(null);
  const [recruitmentApplicant, setRecruitmentApplicant] = useState<Applicant | null>(routeState?.applicant ?? null);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationRecord | null>(null);
  const [, setToast] = useState<string | null>(null);
  const [docReviews, setDocReviews] = useState<Record<string, DocReview>>(loadDocReviews);
  const [openedDocFilePaths, setOpenedDocFilePaths] = useState<Set<string>>(new Set());
  const [docsValidated, setDocsValidated] = useState(false);
  const [confirmApproveDoc, setConfirmApproveDoc] = useState<{ fileUrl: string; docType: string } | null>(null);
  const [showResubmitModal, setShowResubmitModal] = useState(false);
  const [resubmitSelectedSlot, setResubmitSelectedSlot] = useState('');
  const [resubmitReason, setResubmitReason] = useState('');
  const [resubmitNotes, setResubmitNotes] = useState('');
  const [resubmitSending, setResubmitSending] = useState(false);
  const [resubmitSuccess, setResubmitSuccess] = useState<string | null>(null);
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);

      const storedRecruitmentApplicant = routeState?.applicant ?? getApplicants().find((entry) => entry.id === id) ?? null;
      const storedJobPosting = storedRecruitmentApplicant
        ? getAuthoritativeJobPostings().find((entry) => entry.id === storedRecruitmentApplicant.jobPostingId) ?? null
        : null;

      setRecruitmentApplicant(storedRecruitmentApplicant);
      setNotes(storedRecruitmentApplicant?.notes?.[0]?.content ?? '');
      setAppointmentType(getStoredAppointmentType(id));
      setEducationAttainment(getStoredEducationAttainment(id));
      setExperienceYears(getStoredExperienceYears(id));
      setWrittenScore(getStoredWrittenScore(id));
      setIsScoreFinalized(getStoredFinalizedState(id));
      setIsScoreDraft(getStoredDraftState(id));
      setDocsValidated(localStorage.getItem(`cictrix_docs_validated_${id}`) === 'true');

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
  }, [id, routeState]);

  // Pre-fill the Experience scoring input with what the applicant submitted in
  // the application portal (work_experience_years). RSP can still overwrite it
  // — we only fill when no stored RSP value exists yet.
  useEffect(() => {
    if (!id || experienceYears.trim()) return;
    const submitted =
      (applicant as any)?.years_of_experience ??
      (applicant as any)?.work_experience_years ??
      (recruitmentApplicant as any)?.workExperienceYears;
    if (submitted == null || submitted === '') return;
    const numeric = Number(submitted);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    const rounded = Math.round(numeric * 100) / 100;
    setExperienceYears(String(rounded));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant, recruitmentApplicant, id]);

  // Pre-fill Education scoring from the applicant's form selection. Only fills
  // when the RSP has not yet manually scored this field.
  useEffect(() => {
    if (!id || educationAttainment) return;
    const stored = getStoredEducationAttainment(id);
    if (stored) return;
    const rawEd =
      String((applicant as any)?.education_attainment ?? '').trim() ||
      String((applicant as any)?.education_level ?? '').trim() ||
      String(recruitmentApplicant?.educationAttainment ?? '').trim();
    const mapped = formValueToEducationAttainmentValue(rawEd);
    if (mapped) setEducationAttainment(mapped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant, recruitmentApplicant, id]);

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

  const fullName = useMemo(() => (applicant ? getFullName(applicant) : ''), [applicant]);
  const resolvedStatus = recruitmentApplicant?.status || applicant?.status;
  const badge = statusBadge(resolvedStatus);
  const interviewerScoreSnapshot = useMemo(
    () => getStoredInterviewerScoreSnapshot(id, applicant?.email),
    [applicant?.email, id]
  );
  const score = useMemo(() => computeScoreBreakdown(evaluation, interviewerScoreSnapshot), [evaluation, interviewerScoreSnapshot]);
  const hasSavedEvaluation = Boolean(
    hasInterviewScores(evaluation) || interviewerScoreSnapshot?.pcptAverage || interviewerScoreSnapshot?.oralAverage
  );
  const isRspAdmin = location.pathname.startsWith('/admin/rsp/');
  const backTo = routeState?.from || (isRspAdmin ? '/admin/rsp/applications' : '/admin/rsp/qualified');
  const backLabel = backTo.includes('qualified') ? 'Qualified Applicants'
    : backTo.includes('applicant-score') ? 'Applicant Score'
    : backTo.includes('for-hiring') ? 'For Hiring'
    : 'Applications';
  const showViewScoresButton = false;
  const showJobPostActionButtons = true;
  const scoreActionLabel = isScoreFinalized ? 'View Score' : 'Update Score';
  const isForcedPromotionalAppointment = isPromotionalSource(recruitmentApplicant, applicant);
  const isApplicantDisqualified =
    normalizeText(resolvedStatus ?? '').includes('not qualified') ||
    normalizeText(resolvedStatus ?? '').includes('disqual');
  const isApplicantQualified =
    normalizeText(resolvedStatus ?? '').includes('recommend') ||
    normalizeText(resolvedStatus ?? '') === 'qualified';
  const isApplicantShortlisted = normalizeText(resolvedStatus ?? '').includes('shortlist');
  const primaryEducation = recruitmentApplicant?.education?.[0] ?? null;
  const primaryExperience = recruitmentApplicant?.experience?.[0] ?? null;

  // Sync the mutually-exclusive status toggle from the persisted resolvedStatus
  useEffect(() => {
    const norm = normalizeText(resolvedStatus ?? '');
    if (norm.includes('not qualified') || norm.includes('disqual')) {
      setApplicantStatus('disqualify');
    } else if (norm.includes('shortlist')) {
      setApplicantStatus('shortlist');
    } else if (norm.includes('qualified') || norm.includes('recommend') || norm.includes('hired')) {
      setApplicantStatus('qualified');
    } else {
      setApplicantStatus(null);
    }
  }, [resolvedStatus]);
  const selectedEducationOption = EDUCATION_ATTAINMENT_OPTIONS.find((option) => option.value === educationAttainment);
  const modalEducationScore = selectedEducationOption?.points ?? (isScoreFinalized ? score.education : 0);
  const isPromotionalAppointment = appointmentType === 'promotional';
  const thirdScoreLabel = isPromotionalAppointment ? 'III Performance Rating (20%)' : 'III Written Examination (20%)';
  const thirdScoreValue = isPromotionalAppointment ? score.performance : score.written;
  const thirdScorePlaceholder = isPromotionalAppointment ? 'Select Performance Rating' : 'Enter score (0-30)';
  const fourthScoreValue = score.oral;
  const experienceYearsNum = parseInt(experienceYears, 10);
  const modalExperienceScore = experienceYears !== '' && !Number.isNaN(experienceYearsNum)
    ? experienceYearsToPoints(experienceYearsNum)
    : (isScoreFinalized ? score.experience : 0);
  const writtenScoreNum = parseInt(writtenScore, 10);
  const modalWrittenScore = writtenScore !== '' && !Number.isNaN(writtenScoreNum)
    ? Math.max(0, Math.min(30, writtenScoreNum))
    : (isScoreFinalized ? thirdScoreValue : 0);
  const potentialRawNum = parseInt(potentialScore, 10);
  const potentialToPoints = (raw: number) => {
    if (Number.isNaN(raw) || raw < 51) return 0;
    if (raw <= 60) return 12;
    if (raw <= 70) return 14;
    if (raw <= 80) return 16;
    if (raw <= 90) return 18;
    return 20;
  };
  const modalPotentialScore = potentialScore !== '' && !Number.isNaN(potentialRawNum)
    ? potentialToPoints(potentialRawNum)
    : (isScoreFinalized ? fourthScoreValue : 0);
  const lastOriginalAppointmentScore = score.total > 0 ? score.total : 82;
  const modalTotalScore = Math.max(0, Math.min(100,
    score.total
    - score.education + modalEducationScore
    - score.experience + modalExperienceScore
    - thirdScoreValue + modalWrittenScore
    - fourthScoreValue + modalPotentialScore
  ));
  const modalAdjective = adjectiveFromScore(modalTotalScore);
  const scoringResponsibilityText = isPromotionalAppointment
    ? {
        rsp: 'Education, Experience, Performance Rating, Potential',
        interviewer: 'PCPT (Physical Characteristics & Personality Traits)',
      }
    : {
        rsp: 'Education, Experience, Written Examination',
        interviewer: 'PCPT, Oral Examination',
      };

  useEffect(() => {
    if (!id) return;
    if (!isForcedPromotionalAppointment) return;

    if (appointmentType !== 'promotional') {
      setAppointmentType('promotional');
    }
    saveStoredAppointmentType(id, 'promotional');
  }, [appointmentType, id, isForcedPromotionalAppointment]);

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

  const handleSendMessage = () => {
    setEmailTemplate('');
    setEmailSubject('');
    setEmailBody('');
    setEmailNotes('');
    setShowSendEmailModal(true);
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    if (!applicant?.email) {
      setEmailError('This applicant has no email on file.');
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
      const message = error instanceof Error ? error.message : String(error);
      setEmailError(message);
    } finally {
      setEmailSending(false);
    }
  };

  const handleUpdateStatus = (nextStatus: Applicant['status']) => {
    if (!recruitmentApplicant) return;

    const now = new Date().toISOString();
    const nextApplicants = getApplicants().map((entry) => {
      if (entry.id !== recruitmentApplicant.id) return entry;
      return {
        ...entry,
        status: nextStatus,
        timeline: [
          ...entry.timeline,
          { event: `Status updated to ${nextStatus}`, date: now, actor: 'RSP Staff' },
        ],
      };
    });

    saveApplicants(nextApplicants);

    const updated = nextApplicants.find((entry) => entry.id === recruitmentApplicant.id) ?? recruitmentApplicant;
    setRecruitmentApplicant(updated);
    setApplicant((current) => (current ? { ...current, status: nextStatus } : current));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
    }
  };

  const persistStatus = async (
    action: 'shortlist' | 'unshortlist' | 'qualified' | 'disqualify' | 'document_verified' | 'action_required' | 'under_review',
    reasonInput?: string,
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
      shortlist: 'Shortlisted',
      unshortlist: 'Under Review',
      qualified: 'Recommended for Hiring',
      disqualify: 'Not Qualified',
      document_verified: 'Document Verified',
      action_required: 'Action Required',
      under_review: 'Under Review',
    };
    const nextStatus = statusMap[action];
    const reason = action === 'disqualify' ? (reasonInput ?? '').trim() : null;

    const payload = {
      applicant_id: applicant.id,
      status: nextStatus,
      disqualification_reason: reason || null,
    };

    // Persist to backend (best-effort) with Supabase fallback. Uses relative /api/
    // so Vite's proxy handles routing. Verifies Supabase update actually affected
    // a row (RLS can cause a zero-row silent update with error:null).
    let persisted = false;
    try {
      const res = await fetch(`/api/applicants/${applicant.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        persisted = true;
        console.info('[ApplicantDetailsPage] backend PATCH ok');
      } else {
        console.warn('[ApplicantDetailsPage] backend PATCH failed', res.status);
      }
    } catch (err) {
      console.warn('[ApplicantDetailsPage] backend PATCH threw', err);
    }

    if (!persisted) {
      try {
        const dbUpdate: Record<string, unknown> = { status: nextStatus };
        if (reason) dbUpdate.disqualification_reason = reason;
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
        }
      } catch (err) {
        console.error('[ApplicantDetailsPage] supabase update threw', err);
      }
    }

    if (!persisted) {
      console.error(
        '[ApplicantDetailsPage] status NOT persisted to DB. Local UI updated only. Backend + Supabase both failed.',
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
    // If qualified, navigate away (remove from current list)
    if (action === 'qualified') {
      setTimeout(() => {
        navigate(-1); // Go back to previous page/list
      }, 500);
    }
  };

  const handleSubmitStatusEvaluation = async () => {
    if (!applicantStatus) return;
    await persistStatus(applicantStatus, applicantStatus === 'disqualify' ? disqualifyReason : undefined);
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
      return { ...prev, timeline: [...(prev.timeline ?? []), { event, date: now, actor: 'RSP Admin' }] };
    });
  };

  const handleApproveDoc = async (fileUrl: string, docType: string) => {
    const key = getDocReviewKey(fileUrl);
    const updatedAll = persistDocReview(key, { status: 'approved', remarks: '', reviewedAt: new Date().toISOString() });

    // Persist to Supabase so the applicant portal shows "Verified" for this doc.
    const rawDocType = attachments.find((a) => a.file_path === fileUrl)?.document_type ?? docType;
    void (supabase as any)
      .from('applicant_attachments')
      .insert({ applicant_id: id, file_name: rawDocType, file_path: fileUrl, document_type: 'doc_validated' })
      .then(({ error }: { error: any }) => { if (error) console.error('[handleApproveDoc] supabase insert:', error); });

    // Check if every REAL (non-meta) attachment is now approved.
    const realAttachments = attachments.filter(
      (a) => a.document_type !== 'resubmission_request' && a.document_type !== 'resubmission_resolved' && a.document_type !== 'doc_validated',
    );
    const allKeys = realAttachments.map((a) => getDocReviewKey(a.file_path)).filter(Boolean);
    const allApproved = allKeys.length > 0 && allKeys.every((k) => (updatedAll[k]?.status ?? 'pending') === 'approved');

    if (allApproved) {
      await persistStatus('document_verified');
      addDocTimeline('Document Verified: All documents reviewed and approved.');
      setToast('All documents approved. Status updated to Document Verified.');
    } else {
      addDocTimeline(`Document Approved: ${docType}.`);
      setToast(`${docType} approved.`);
    }
  };

  const handleRequestResubmission = async (fileUrl: string, docType: string, remarks: string) => {
    if (!remarks.trim()) return;
    const key = getDocReviewKey(fileUrl);
    persistDocReview(key, { status: 'resubmission_requested', remarks: remarks.trim(), reviewedAt: new Date().toISOString() });
    addDocTimeline(`Action Required: Resubmission requested for ${docType} — "${remarks.trim()}".`);
    setToast('Resubmission requested.');
    await persistStatus('action_required');
  };

  const handleOpenDocument = async (filePath: string) => {
    await openDocument(filePath);
    setOpenedDocFilePaths((prev) => new Set([...prev, filePath]));
  };

  const openResubmitModal = (slotLabel = '') => {
    setResubmitSelectedSlot(slotLabel);
    setResubmitReason('');
    setResubmitSuccess(null);
    setResubmitError(null);
    setShowResubmitModal(true);
  };

  const handleSubmitResubmission = async () => {
    if (!resubmitSelectedSlot || !resubmitReason.trim()) return;
    if (!applicant) return;
    setResubmitSending(true);
    setResubmitError(null);

    // Always update the tracker and doc review status first, regardless of email.
    const slot = DOCUMENT_SLOTS.find((s) => s.label === resubmitSelectedSlot);
    if (!slot) {
      setResubmitError('Invalid document selection.');
      setResubmitSending(false);
      return;
    }
    const matchedAtt = attachments.find((a) => {
      const resolvedType = a.document_type || FILE_NAME_TO_TYPE[a.file_name] || 'other';
      return resolvedType === slot.type;
    });
    if (matchedAtt) {
      await handleRequestResubmission(matchedAtt.file_path, resubmitSelectedSlot, resubmitReason.trim());
    } else {
      // No attachment matched — still record in timeline so tracker reflects it.
      addDocTimeline(`Action Required: Resubmission requested for ${resubmitSelectedSlot} — "${resubmitReason.trim()}".`);
      await persistStatus('action_required');
    }

    // Save to Supabase so the applicant tracker can show it in real-time.
    try {
      await (supabase as any).from('applicant_attachments').insert({
        applicant_id: applicant.id,
        file_name: `RESUBMIT::${resubmitSelectedSlot}::${resubmitReason.trim()}`,
        file_path: resubmitNotes.trim() || '—',
        document_type: 'resubmission_request',
        file_type: 'notice',
        file_size: 0,
      });
    } catch (supaErr) {
      console.warn('[handleSubmitResubmission] Supabase insert failed:', supaErr);
    }

    // Attempt to send email; failure is non-blocking.
    try {
      const notesSection = resubmitNotes.trim()
        ? `\n\nAdditional Notes from RSP:\n${resubmitNotes.trim()}`
        : '';
      await sendEmail({
        to: applicant.email,
        subject: `Notice of Resubmission — ${resubmitSelectedSlot}`,
        body: `Dear ${applicant.first_name},\n\nYour submitted document "${resubmitSelectedSlot}" requires resubmission.\n\nReason: ${resubmitReason.trim()}${notesSection}\n\nPlease log in to the Applicant Portal and re-upload the corrected document at your earliest convenience.\n\nThank you,\nRecruitment Office`,
        applicantId: applicant.id,
      });
      setResubmitSuccess(`Resubmission notice sent to ${applicant.email}. Tracker has been updated.`);
    } catch (err) {
      // Tracker is already updated; just warn about the email.
      const msg = err instanceof Error ? err.message : 'Email delivery failed.';
      setResubmitSuccess(`Tracker updated — resubmission recorded. Note: ${msg}`);
    } finally {
      setResubmitNotes('');
      setResubmitSending(false);
    }
  };

  const handleValidateDocs = () => {
    if (!id) return;
    localStorage.setItem(`cictrix_docs_validated_${id}`, 'true');
    setDocsValidated(true);
    addDocTimeline('Documents Validated: All submitted documents have been reviewed and accepted.');
    setToast('Documents validated. Qualify button is now available.');
  };

  const isDocLocked = () => {
    const s = normalizeText(resolvedStatus ?? '');
    return s.includes('disqualif') || s.includes('not qualified') || s.includes('failed');
  };

  const getDocReadiness = () => {
    if (attachments.length === 0) return { ready: false, reason: 'No documents uploaded yet' };
    const hasRejected = attachments.some((a) => (docReviews[getDocReviewKey(a.file_path)]?.status ?? 'pending') === 'resubmission_requested');
    if (hasRejected) return { ready: false, reason: 'Some documents require resubmission before proceeding' };
    return { ready: true, reason: '' };
  };

  const handleSaveScoreSetup = async () => {
    if (!applicant?.id) return;

    const normalizedStatus = String(resolvedStatus ?? '').toLowerCase();
    const nextStatus: Applicant['status'] =
      normalizedStatus.includes('recommend') ||
      normalizedStatus.includes('qualified') ||
      normalizedStatus.includes('hired')
        ? 'Recommended for Hiring'
        : 'Shortlisted';

    const effectiveAppointmentType: AppointmentType = isForcedPromotionalAppointment ? 'promotional' : appointmentType;
    saveStoredAppointmentType(applicant.id, effectiveAppointmentType);
    saveStoredEducationAttainment(applicant.id, educationAttainment);
    saveStoredExperienceYears(applicant.id, experienceYears);
    saveStoredWrittenScore(applicant.id, writtenScore);
    saveStoredFinalizedState(applicant.id, true);
    saveStoredDraftState(applicant.id, false);

    // Persist score + status so Reports > Application Ranking can include this applicant.
    const updatePayload = {
      total_score: modalTotalScore,
      status: nextStatus,
    };

    try {
      const primaryUpdate = await (supabase as any).from('applicants').update(updatePayload).eq('id', applicant.id);
      if ((primaryUpdate as any)?.error && !isMockModeEnabled) {
        await (mockDatabase as any).from('applicants').update(updatePayload).eq('id', applicant.id);
      }
    } catch {
      try {
        await (mockDatabase as any).from('applicants').update(updatePayload).eq('id', applicant.id);
      } catch {
        // Best effort persistence only.
      }
    }

    // Keep recruitment store score in sync so Reports can resolve totals even
    // when applicant IDs differ between sources.
    const recruitmentRows = getApplicants();
    const updatedRecruitmentRows = recruitmentRows.map((entry) => {
      const idMatch = recruitmentApplicant ? entry.id === recruitmentApplicant.id : entry.id === applicant.id;
      const emailMatch = Boolean(applicant.email) && entry.personalInfo.email === applicant.email;
      if (!idMatch && !emailMatch) return entry;
      return {
        ...entry,
        qualificationScore: modalTotalScore,
      };
    });
    saveApplicants(updatedRecruitmentRows);

    const updatedRecruitmentApplicant = updatedRecruitmentRows.find((entry) => {
      if (recruitmentApplicant && entry.id === recruitmentApplicant.id) return true;
      return Boolean(applicant.email) && entry.personalInfo.email === applicant.email;
    }) ?? recruitmentApplicant;

    if (updatedRecruitmentApplicant) {
      setRecruitmentApplicant(updatedRecruitmentApplicant);
    }

    handleUpdateStatus(nextStatus);
    setApplicant((current) => (current ? { ...current, status: nextStatus } : current));

    setIsScoreFinalized(true);
    setIsScoreDraft(false);
    setShowScoresModal(false);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
    }
  };

  const handleSaveScoreDraft = () => {
    if (!applicant?.id || isScoreFinalized) return;

    const effectiveAppointmentType: AppointmentType = isForcedPromotionalAppointment ? 'promotional' : appointmentType;
    saveStoredAppointmentType(applicant.id, effectiveAppointmentType);
    saveStoredEducationAttainment(applicant.id, educationAttainment);
    saveStoredExperienceYears(applicant.id, experienceYears);
    saveStoredWrittenScore(applicant.id, writtenScore);
    saveStoredFinalizedState(applicant.id, false);
    saveStoredDraftState(applicant.id, true);

    setIsScoreDraft(true);
    setToast('Score draft saved. You can continue later.');
  };

  if (loading) {
    return <div className="p-8 text-slate-600">Loading applicant details...</div>;
  }

  if (!applicant) {
    return <div className="p-8 text-red-600">Applicant not found.</div>;
  }

  return (
    <div className={isRspAdmin ? 'min-h-screen bg-[#f8f9fa]' : 'min-h-screen bg-slate-100'}>
      {isRspAdmin && <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />}
      <div className={isRspAdmin ? 'admin-layout' : ''}>
        {isRspAdmin && <Sidebar activeModule="RSP" userRole="rsp" />}
      <main className={isRspAdmin ? 'admin-content bg-white !p-0' : 'bg-slate-100 !p-0'}>
        <header className="border-b border-slate-200 bg-white px-6 py-4">
          {/* Breadcrumb */}
          <div className="mb-3 flex items-center gap-1.5 text-xs">
            <button type="button" onClick={() => navigate(backTo)} className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">
              <ChevronLeft size={12} /> {backLabel}
            </button>
            <ChevronRight size={12} className="text-slate-400" />
            <span className="text-slate-500">{fullName}</span>
          </div>

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
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {applicant.item_number || applicant.id}
                  </span>
                  {applicant.office && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">{applicant.office}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {showViewScoresButton && (
                <button
                  type="button"
                  onClick={() => setShowScoresModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
                >
                  <Eye size={14} /> {scoreActionLabel}
                </button>
              )}

              {showJobPostActionButtons && (() => {
                const submittedFilePaths = DOCUMENT_SLOTS
                  .map((s) => attachments.find((a) => (a.document_type || FILE_NAME_TO_TYPE[a.file_name] || 'other') === s.type))
                  .filter(Boolean)
                  .map((a) => a!.file_path);
                const allDocsOpened = submittedFilePaths.length > 0 && submittedFilePaths.every((fp) => openedDocFilePaths.has(fp));
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

                const qualifyLocked = !(docsValidated || autoDocsCleared) || hasResubmissionPending;
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
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm ${
                      isApplicantDisqualified
                        ? 'border-rose-500 bg-rose-500 text-white'
                        : 'border-rose-400 bg-white text-rose-600 hover:bg-rose-50'
                    }`}
                  >
                    <CircleX size={14} /> Disqualify
                  </button>
                  <button
                    type="button"
                    onClick={() => void persistStatus(isApplicantShortlisted ? 'unshortlist' : 'shortlist')}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm ${
                      isApplicantShortlisted
                        ? 'border-[#363EE8] bg-[#363EE8] text-white'
                        : 'border-[#363EE8] bg-white text-[#363EE8] hover:bg-blue-50'
                    }`}
                  >
                    <Star size={14} /> {isApplicantShortlisted ? 'Undo Shortlist' : 'Shortlist'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (!qualifyLocked) setConfirmAction('qualified'); }}
                    disabled={qualifyLocked}
                    title={qualifyTitle}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                      isApplicantQualified
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-emerald-500 bg-white text-emerald-600 hover:bg-emerald-50'
                    }`}
                  >
                    <CheckCircle2 size={14} /> Qualify
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
              { key: 'activity', label: 'Activity', icon: ActivityIcon },
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
                    <h3 className="border-b border-slate-200 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-slate-500">Personal Information</h3>
                    <div className="divide-y divide-slate-100 px-4">
                      <div className="flex items-start justify-between py-2.5"><span className="text-xs font-semibold text-slate-500 w-36 shrink-0">Full Name</span><span className="text-sm text-slate-800 text-right">{fullName}</span></div>
                      <div className="flex items-start justify-between py-2.5"><span className="text-xs font-semibold text-slate-500 w-36 shrink-0">Email Address</span><span className="text-sm text-slate-800 text-right">{applicant.email || '--'}</span></div>
                      <div className="flex items-start justify-between py-2.5"><span className="text-xs font-semibold text-slate-500 w-36 shrink-0">Phone Number</span><span className="text-sm text-slate-800 text-right">{applicant.contact_number || '--'}</span></div>
                      <div className="flex items-start justify-between py-2.5"><span className="text-xs font-semibold text-slate-500 w-36 shrink-0">Address</span><span className="text-sm text-slate-800 text-right">{applicant.address || '--'}</span></div>
                      <div className="flex items-start justify-between py-2.5"><span className="text-xs font-semibold text-slate-500 w-36 shrink-0">PWD Status</span><span className="text-sm text-slate-800 text-right">{applicant.is_pwd === true ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">PWD</span> : 'Not a PWD'}</span></div>
                    </div>
                  </article>

                  <article className="rounded-xl border border-slate-200">
                    <h3 className="border-b border-slate-200 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-slate-500">Qualifications</h3>
                    <div className="divide-y divide-slate-100 px-4">
                      <div className="flex items-start justify-between py-2.5">
                        <span className="text-xs font-semibold text-slate-500 w-36 shrink-0">Education</span>
                        <span className="text-sm text-slate-800 text-right">
                          {(() => {
                            const row = applicant as any;
                            const attainment = String(row?.education_attainment ?? '').trim();
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
                    const submittedFilePaths = DOCUMENT_SLOTS
                      .map((s) => attachments.find((a) => (a.document_type || FILE_NAME_TO_TYPE[a.file_name] || 'other') === s.type))
                      .filter(Boolean).map((a) => a!.file_path);
                    const realAttachments = attachments.filter(
                      (a) => a.document_type !== 'resubmission_request' && a.document_type !== 'resubmission_resolved' && a.document_type !== 'doc_validated',
                    );
                    const allSubmittedApproved = submittedFilePaths.length > 0 &&
                      submittedFilePaths.every((fp) => docReviews[getDocReviewKey(fp)]?.status === 'approved');
                    return (
                      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Submitted Documents</h3>
                        {!isDocLocked() && realAttachments.length > 0 && (
                          docsValidated ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 size={12} /> Validated
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={handleValidateDocs}
                              disabled={!allSubmittedApproved}
                              title={!allSubmittedApproved ? 'All documents must be individually approved first' : 'Validate all documents'}
                              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                              style={allSubmittedApproved ? { borderColor: '#059669', color: '#059669', backgroundColor: '#f0fdf4' } : { borderColor: '#d1d5db', color: '#9ca3af', backgroundColor: '#f9fafb' }}
                            >
                              <CheckCircle2 size={12} /> Validate Documents
                            </button>
                          )
                        )}
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

                      // Resubmission notice for this slot from Supabase
                      const slotNotice = attachments.find(a =>
                        a.document_type === 'resubmission_request' &&
                        a.file_name.split('::')[1] === slot.label
                      );

                      const isSubmitted = matched.length > 0;
                      const hasSupabaseResubmissionRequest = Boolean(slotNotice);
                      const locked = isDocLocked();
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

                              {/* Resubmission notice detail */}
                              {slotNotice && (() => {
                                const parts = slotNotice.file_name.split('::');
                                const reason = parts[2] ?? '';
                                const notes = slotNotice.file_path === '—' ? '' : slotNotice.file_path;
                                return (
                                  <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                                    {reason && <p className="text-amber-800"><span className="font-semibold">Reason:</span> {reason}</p>}
                                    {notes && <p className="mt-0.5 text-amber-700"><span className="font-semibold">RSP Note:</span> {notes}</p>}
                                    <p className="mt-0.5 text-amber-500">Sent: {formatDate(slotNotice.created_at)}</p>
                                  </div>
                                );
                              })()}

                              {!isSubmitted && (
                                <p className="mt-1 text-xs italic text-slate-400">Not yet submitted</p>
                              )}

                              {/* All versions of this document */}
                              {matched.map((doc, versionIdx) => {
                                const reviewKey = getDocReviewKey(doc.file_path);
                                const review = docReviews[reviewKey];
                                const localStatus: DocReviewStatus = review?.status ?? 'pending';
                                const isLatest = versionIdx === matched.length - 1;
                                const isResubmission = versionIdx > 0;

                                const versionLabel = isResubmission
                                  ? `Resubmission #${versionIdx}`
                                  : 'Original Submission';

                                return (
                                  <div key={doc.id} className={`mt-2 rounded-lg border px-3 py-2 ${isResubmission ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-100 bg-slate-50'}`}>
                                    <div className="flex items-start justify-between gap-4">
                                      <button className="flex-1 text-left" onClick={() => void handleOpenDocument(doc.file_path)}>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isResubmission ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {versionLabel}
                                          </span>
                                          {isLatest && (
                                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Current</span>
                                          )}
                                          {localStatus === 'approved' && (
                                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">✓ Approved</span>
                                          )}
                                          {localStatus === 'resubmission_requested' && (
                                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">⚠ Resubmission</span>
                                          )}
                                        </div>
                                        <p className="mt-1 truncate text-xs text-slate-500">{doc.file_name}</p>
                                        <p className="text-xs text-slate-400">Uploaded {formatDate(doc.created_at || applicant.created_at)}</p>
                                        {localStatus === 'resubmission_requested' && review?.remarks && (
                                          <p className="mt-0.5 text-xs text-amber-700 font-medium">Reason: {review.remarks}</p>
                                        )}
                                      </button>
                                      
                                      {!locked && (
                                        <div className="flex items-center gap-1.5 self-center">
                                          {localStatus !== 'approved' && (
                                            <button
                                              type="button"
                                              onClick={() => setConfirmApproveDoc({ fileUrl: doc.file_path, docType: slot.label })}
                                              className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition"
                                            >
                                              Approve
                                            </button>
                                          )}
                                          {localStatus !== 'approved' && (
                                            <button
                                              type="button"
                                              onClick={() => openResubmitModal(slot.label)}
                                              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                                                localStatus === 'resubmission_requested'
                                                  ? 'bg-amber-600 text-white cursor-default'
                                                  : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'
                                              }`}
                                              disabled={localStatus === 'resubmission_requested'}
                                            >
                                              Request Resubmission
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </article>
              )}

              {activeTab === 'activity' && (
                <article className="rounded-xl border border-slate-200">
                  <h3 className="border-b border-slate-200 px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-500">Activity Timeline</h3>
                  <div className="space-y-0 p-4">
                    {(() => {
                      // Build a chronological activity list from Supabase data.
                      type ActivityEntry = { event: string; detail?: string; actor: string; date: string; tone: 'blue' | 'amber' | 'emerald' | 'slate' };
                      const events: ActivityEntry[] = [];

                      // 1. Application submitted / received
                      if (applicant?.created_at) {
                        events.push({ event: 'Application Submitted', detail: 'Application form completed and submitted by the applicant.', actor: fullName || 'Applicant', date: applicant.created_at, tone: 'blue' });
                        events.push({ event: 'Application Received by RSP', detail: 'System automatically received and recorded the application.', actor: 'System', date: applicant.created_at, tone: 'slate' });
                      }

                      // 2. Process real attachments (non-notice)
                      const realAttachments = attachments.filter((a) => a.document_type !== 'resubmission_request' && a.document_type !== 'resubmission_resolved');
                      const noticeAttachments = attachments.filter((a) => a.document_type === 'resubmission_request');

                      // Group real attachments by document_type to detect re-uploads
                      const byType = new Map<string, AttachmentRecord[]>();
                      realAttachments.forEach((a) => {
                        const key = a.document_type || a.file_name || 'other';
                        const existing = byType.get(key) ?? [];
                        byType.set(key, [...existing, a]);
                      });

                      // Collect initial uploads (first version per type) into one batch event;
                      // re-uploads (version 2+) remain individual since they are intentional actions.
                      const initialBatch: { label: string; date: string }[] = [];
                      byType.forEach((docs) => {
                        const sorted = [...docs].sort((x, y) => new Date(x.created_at ?? '').getTime() - new Date(y.created_at ?? '').getTime());
                        sorted.forEach((doc, i) => {
                          const label = labelize(doc.document_type || doc.file_name || 'Document');
                          if (i === 0) {
                            initialBatch.push({ label, date: doc.created_at ?? applicant?.created_at ?? '' });
                          } else {
                            events.push({ event: `Document Re-uploaded — ${label}`, detail: `Applicant submitted a new version. File: ${doc.file_name}`, actor: fullName || 'Applicant', date: doc.created_at ?? '', tone: 'emerald' });
                          }
                        });
                      });
                      if (initialBatch.length > 0) {
                        const earliest = initialBatch.reduce((min, d) => d.date < min ? d.date : min, initialBatch[0].date);
                        const labels = initialBatch.map((d) => d.label).join(', ');
                        events.push({
                          event: `Documents Submitted — ${initialBatch.length} file${initialBatch.length > 1 ? 's' : ''}`,
                          detail: labels,
                          actor: fullName || 'Applicant',
                          date: earliest,
                          tone: 'blue',
                        });
                      }

                      // 3. Resubmission notices
                      noticeAttachments.forEach((notice) => {
                        const parts = notice.file_name.split('::');
                        const docLabel = parts[1] ?? notice.file_name;
                        const reason = parts[2] ?? '';
                        const notes = notice.file_path === '—' ? '' : notice.file_path;
                        events.push({
                          event: `Resubmission Requested — ${docLabel}`,
                          detail: [reason ? `Reason: ${reason}` : '', notes ? `RSP Note: ${notes}` : ''].filter(Boolean).join(' · '),
                          actor: 'RSP Admin',
                          date: notice.created_at ?? '',
                          tone: 'amber',
                        });
                      });

                      // 4. Status update (from applicant.status if not default)
                      const norm = normalizeText(applicant?.status ?? '');
                      if (norm && norm !== 'pending' && norm !== 'new application' && applicant?.status) {
                        const statusDate = (applicant as any).updated_at ?? applicant?.created_at ?? '';
                        events.push({ event: `Status Updated — ${applicant.status}`, detail: 'RSP Admin updated the applicant\'s status.', actor: 'RSP Admin', date: statusDate, tone: norm.includes('qualif') || norm.includes('recommend') ? 'emerald' : norm.includes('disqual') || norm.includes('not qual') ? 'amber' : 'slate' });
                      }

                      // Sort all events chronologically (oldest first)
                      events.sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());

                      const TONE_DOT: Record<string, string> = {
                        blue: 'bg-[#363EE8]',
                        amber: 'bg-amber-500',
                        emerald: 'bg-emerald-500',
                        slate: 'bg-slate-400',
                      };

                      if (events.length === 0) {
                        return <p className="text-sm text-slate-400">No activity yet.</p>;
                      }

                      return events.map((entry, idx) => (
                        <div key={`${entry.event}-${idx}`} className="relative flex gap-3 pb-5 last:pb-0">
                          {idx < events.length - 1 && (
                            <span className="absolute left-[4.5px] top-5 h-[calc(100%-1rem)] w-px bg-slate-200" aria-hidden="true" />
                          )}
                          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[entry.tone]}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900">{entry.event}</p>
                            {entry.detail && <p className="mt-0.5 text-xs text-slate-500">{entry.detail}</p>}
                            <p className="mt-0.5 text-xs text-slate-400">{formatDate(entry.date)} · {entry.actor}</p>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </article>
              )}
            </section>
          </div>
        </section>
      </main>

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
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {emailError}
                </p>
              )}
              {emailSuccess && (
                <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {emailSuccess}
                </p>
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
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send size={15} /> {emailSending ? 'Sending…' : 'Send Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approve document confirmation modal */}
      {confirmApproveDoc && (
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmApproveDoc(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 size={24} className="text-emerald-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Approve Document?</h3>
              <p className="mt-1 text-sm text-slate-500">
                You are about to approve <span className="font-semibold text-slate-800">{confirmApproveDoc.docType}</span>. This action marks the document as validated.
              </p>
            </div>
            <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setConfirmApproveDoc(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                onClick={() => {
                  void handleApproveDoc(confirmApproveDoc.fileUrl, confirmApproveDoc.docType);
                  setConfirmApproveDoc(null);
                }}
              >
                Yes, Approve
              </button>
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
              <div className="grid grid-cols-2 gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: '#EEF0FD' }}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#363EE8' }}>TO:</p>
                  <p className="mt-0.5 truncate text-sm font-semibold" style={{ color: '#040E6B' }}>{applicant?.email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#363EE8' }}>APPLICANT NAME:</p>
                  <p className="mt-0.5 text-sm font-semibold" style={{ color: '#040E6B' }}>{fullName || '—'}</p>
                </div>
              </div>

              {/* Document selector */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold" style={{ color: '#040E6B' }}>
                  Document for Resubmission <span className="text-rose-500">*</span>
                </label>
                <select
                  value={resubmitSelectedSlot}
                  onChange={(e) => setResubmitSelectedSlot(e.target.value)}
                  className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:ring-2"
                  style={{ borderColor: '#C8D1FF', color: '#040E6B' }}
                >
                  <option value="">Select document...</option>
                  {DOCUMENT_SLOTS.filter((s) => attachments.some((a) => (a.document_type || FILE_NAME_TO_TYPE[a.file_name] || 'other') === s.type)).map((s) => (
                    <option key={s.type} value={s.label}>{s.label}</option>
                  ))}
                </select>
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
                  <p className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: '#EEF0FD', color: '#363EE8' }}>
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
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{resubmitError}</p>
              )}
              {resubmitSuccess && (
                <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{resubmitSuccess}</p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowResubmitModal(false); setResubmitNotes(''); setResubmitReason(''); setResubmitSelectedSlot(''); setResubmitError(null); setResubmitSuccess(null); }}
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
                    disabled={!resubmitSelectedSlot || !resubmitReason.trim() || resubmitSending}
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ backgroundColor: '#363EE8' }}
                  >
                    <Send size={14} /> {resubmitSending ? 'Sending…' : 'Send Notice'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showScoresModal && (
        <div className="fixed inset-0 z-[260] bg-black/80 p-4" onClick={() => setShowScoresModal(false)}>
          <div className="mx-auto h-[96vh] w-full max-w-[1450px] overflow-y-auto rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-8 py-5 text-white" style={{ background: 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)', fontFamily: 'Poppins, sans-serif' }}>
              <div>
                <h2 className="text-3xl font-bold text-white">Applicant Evaluation & Scoring</h2>
                <p className="text-lg" style={{ color: '#C8D1FF' }}>{fullName} — {applicant.position || '--'}</p>
              </div>
              <button type="button" onClick={() => setShowScoresModal(false)} className="rounded-lg p-2 text-white/90 hover:bg-white/10">
                <X size={36} />
              </button>
            </div>

            <div className="space-y-6 p-8">
              {isScoreDraft && !isScoreFinalized && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
                  <p className="text-xl font-semibold text-amber-800">Draft Saved</p>
                  <p className="text-base text-amber-700">
                    This evaluation is saved as draft. You can continue editing and finalize later.
                  </p>
                </div>
              )}

              {isScoreFinalized && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
                  <p className="text-xl font-semibold text-emerald-800">Score Finalized - View Only Mode</p>
                  <p className="text-base text-emerald-700">
                    This applicant's evaluation has been finalized and submitted. All fields are read-only and cannot be edited.
                  </p>
                </div>
              )}

              <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <p className="mb-3 text-xl font-semibold text-slate-800">Select Appointment Type</p>
                {isForcedPromotionalAppointment && (
                  <p className="mb-3 rounded-xl border border-blue-300 bg-blue-100 px-4 py-3 text-sm font-semibold text-blue-800">
                    Promotional Appointment is auto-selected for internal promotional applicants.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => !isScoreFinalized && !isForcedPromotionalAppointment && setAppointmentType('original')}
                    disabled={isScoreFinalized || isForcedPromotionalAppointment}
                    className={`rounded-2xl border p-4 text-center transition ${
                      appointmentType === 'original'
                        ? 'border-2 border-blue-400 bg-white shadow-sm'
                        : 'border border-slate-300 bg-slate-100'
                    } ${(isScoreFinalized || isForcedPromotionalAppointment) ? 'cursor-not-allowed opacity-80' : ''}`}
                  >
                    <p className={`text-xl font-semibold ${appointmentType === 'original' ? 'text-blue-700' : 'text-slate-500'}`}>Original Appointment</p>
                    <p className="text-base text-slate-500">Education • Experience • Written Exam • Oral Exam* • PCPT*</p>
                    <p className="text-sm text-slate-500">*Interviewer-provided</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => !isScoreFinalized && setAppointmentType('promotional')}
                    disabled={isScoreFinalized || isForcedPromotionalAppointment}
                    className={`rounded-2xl border p-4 text-center transition ${
                      appointmentType === 'promotional'
                        ? 'border-2 border-blue-400 bg-white shadow-sm'
                        : 'border border-slate-300 bg-slate-100'
                    } ${(isScoreFinalized || isForcedPromotionalAppointment) ? 'cursor-not-allowed opacity-80' : ''}`}
                  >
                    <p className={`text-xl font-semibold ${appointmentType === 'promotional' ? 'text-blue-700' : 'text-slate-500'}`}>Promotional Appointment</p>
                    <p className="text-base text-slate-500">Education • Experience • Performance • PCPT* • Potential</p>
                    <p className="text-sm text-slate-500">*Interviewer-provided</p>
                  </button>
                </div>
              </section>

              {!isPromotionalAppointment && (
                <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                  <p className="mb-3 text-lg font-semibold text-slate-800">Position Type (for Written Exam scoring)</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => !isScoreFinalized && setPositionType('rank-file')}
                      disabled={isScoreFinalized}
                      className={`rounded-2xl border px-6 py-4 text-center text-base font-semibold transition ${
                        positionType === 'rank-file'
                          ? 'border-2 border-blue-500 bg-blue-600 text-white'
                          : 'border border-slate-300 bg-white text-slate-700'
                      } ${isScoreFinalized ? 'cursor-not-allowed opacity-70' : ''}`}
                    >
                      Rank and File
                    </button>
                    <button
                      type="button"
                      onClick={() => !isScoreFinalized && setPositionType('executive')}
                      disabled={isScoreFinalized}
                      className={`rounded-2xl border px-6 py-4 text-center text-base font-semibold transition ${
                        positionType === 'executive'
                          ? 'border-2 border-blue-500 bg-blue-600 text-white'
                          : 'border border-slate-300 bg-white text-slate-700'
                      } ${isScoreFinalized ? 'cursor-not-allowed opacity-70' : ''}`}
                    >
                      Executive / Managerial
                    </button>
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-lg text-slate-600">Final Numerical Score</p>
                    <p className="text-4xl font-bold text-slate-900">{modalTotalScore.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg text-slate-600">Adjectival Rating</p>
                    <p className="text-4xl font-bold text-emerald-700">{modalAdjective}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-base text-amber-900">
                <p className="font-semibold">Scoring Responsibility:</p>
                <p><strong>RSP enters:</strong> {scoringResponsibilityText.rsp}</p>
                <p><strong>Interviewer provides:</strong> {scoringResponsibilityText.interviewer}</p>
              </section>

              <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xl font-semibold text-slate-800">I Education (20%)</p>
                    {educationAttainment && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: '#EEF0FD', color: '#363EE8' }}>
                        Auto-filled · Editable
                      </span>
                    )}
                  </div>
                  <select
                    value={educationAttainment}
                    onChange={(event) => setEducationAttainment(event.target.value as EducationAttainmentValue)}
                    disabled={isScoreFinalized}
                    className="w-full rounded-xl border border-slate-300 p-3 text-base disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {EDUCATION_ATTAINMENT_OPTIONS.map((option) => (
                      <option key={option.value || 'placeholder'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-base text-slate-600">Score: <span className="font-semibold text-blue-700">{modalEducationScore}</span></p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xl font-semibold text-slate-800">II Experience (20%)</p>
                    {experienceYears && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: '#EEF0FD', color: '#363EE8' }}>
                        Auto-filled · Editable
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={experienceYears}
                    onChange={(event) => setExperienceYears(event.target.value)}
                    disabled={isScoreFinalized}
                    placeholder="Enter years of experience"
                    className="w-full rounded-xl border border-slate-300 p-3 text-base disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                  <p className="mt-1 text-sm text-slate-400">1-5 yrs = 12 pts | 6-10 yrs = 14 pts | 11-15 yrs = 16 pts</p>
                  <p className="text-sm text-slate-400">16-20 yrs = 18 pts | 21+ yrs = 18 pts</p>
                  <p className="mt-2 text-base text-slate-600">Score: <span className="font-semibold text-blue-700">{modalExperienceScore}</span></p>
                  {(() => {
                    const experienceDocs = attachments.filter((a) => {
                      const type = String(a.document_type ?? FILE_NAME_TO_TYPE[a.file_name] ?? '').toLowerCase();
                      const name = String(a.file_name ?? '').toLowerCase();
                      return (
                        type === 'curriculum_vitae' ||
                        name.includes('cv') ||
                        name.includes('resume') ||
                        name.includes('experience')
                      );
                    });
                    return (
                      <button
                        type="button"
                        onClick={() => experienceDocs.forEach((doc) => void openDocument(doc.file_path))}
                        disabled={experienceDocs.length === 0}
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        <FileText size={14} /> View Experience Documents ({experienceDocs.length} {experienceDocs.length === 1 ? 'file' : 'files'}) ↗
                      </button>
                    );
                  })()}
                </div>
                {isPromotionalAppointment ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="mb-2 text-xl font-semibold text-slate-800">III Performance Rating (20%)</p>
                    <select
                      value={writtenScore}
                      onChange={(event) => setWrittenScore(event.target.value)}
                      disabled={isScoreFinalized}
                      className="w-full rounded-xl border border-slate-300 p-3 text-base disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="">Select Performance Rating</option>
                      <option value="12">Needs Improvement (12)</option>
                      <option value="14">Fair (14)</option>
                      <option value="16">Good (16)</option>
                      <option value="18">Very Good (18)</option>
                      <option value="20">Excellent (20)</option>
                    </select>
                    <p className="mt-2 text-base text-slate-600">Score: <span className="font-semibold text-amber-700">{modalWrittenScore}</span></p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                    <p className="mb-2 text-xl font-semibold text-slate-800">III Written Examination (20%)</p>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={writtenScore}
                      onChange={(event) => setWrittenScore(event.target.value)}
                      disabled={isScoreFinalized}
                      placeholder="Enter score (0-30)"
                      className="w-full rounded-xl border border-slate-300 p-3 text-base disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                    <p className="mt-1 text-sm text-slate-400">10↓ = 12 pts | 11-15 = 14 pts | 16-20 = 16 pts | 21-25 = 18 pts | 26-30 = 20 pts</p>
                    <p className="mt-2 text-base text-slate-600">Score: <span className="font-semibold text-green-700">{modalWrittenScore}</span></p>
                  </div>
                )}
                {isPromotionalAppointment && (
                  <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                    <p className="mb-2 text-xl font-semibold text-slate-800">V Potential (20%)</p>
                    <div className="mb-3 rounded-xl border border-blue-300 bg-blue-50 p-3">
                      <p className="text-base font-semibold text-blue-700">Auto-Fill Available</p>
                      <p className="text-base text-blue-700">Last Original Appointment Score: <span className="font-bold">{lastOriginalAppointmentScore}</span></p>
                      <button
                        type="button"
                        onClick={() => setPotentialScore(String(lastOriginalAppointmentScore))}
                        className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                      >
                        Use This Score
                      </button>
                    </div>
                    <input
                      type="number"
                      min={51}
                      max={100}
                      value={potentialScore}
                      onChange={(event) => setPotentialScore(event.target.value)}
                      disabled={isScoreFinalized}
                      placeholder="Enter potential score (51-100)"
                      className="w-full rounded-xl border border-slate-300 p-3 text-base disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                    <p className="mt-1 text-sm text-slate-500">51-60 = 12 pts | 61-70 = 14 pts | 71-80 = 16 pts</p>
                    <p className="text-sm text-slate-500">81-90 = 18 pts | 91-100 = 20 pts</p>
                    <p className="mt-2 text-base text-slate-600">Score: <span className="font-semibold text-orange-700">{modalPotentialScore}</span></p>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-purple-300 bg-purple-50 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Users size={22} className="text-purple-600" />
                  <p className="text-xl font-semibold text-slate-800">Interviewer-Provided Scores (Auto-Generated by System)</p>
                </div>
                <div className="mb-3 rounded-2xl border border-purple-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <Lock size={16} className="text-purple-600" />
                    <p className="text-base font-semibold text-purple-700">RSP Cannot Edit These Scores</p>
                  </div>
                  <p className="mt-1 text-base text-slate-700">
                    The following scores are automatically provided by the interview panel and cannot be manually entered by RSP staff. These values are generated through the interview assessment module.
                  </p>
                </div>
                {isPromotionalAppointment ? (
                  <div className="rounded-2xl border border-purple-200 bg-white p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white">IV</span>
                      <p className="text-xl font-semibold text-slate-800">PCPT (20%)</p>
                    </div>
                    <div className="rounded-xl border border-purple-300 bg-purple-50 p-3">
                      <span className="text-base text-slate-600">Raw Score:</span>
                      <span className="float-right text-2xl font-bold text-purple-700">{score.rawPcpt > 0 ? score.rawPcpt : (hasSavedEvaluation ? 0 : 'Pending Interview')}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">20-25 = 10 pts | 23-25 = 12 pts | 26-28 = 14 pts</p>
                    <p className="text-sm text-slate-500">29-31 = 16 pts | 32-34 = 18 pts | 35 = 20 pts</p>
                    <p className="mt-2 text-base font-semibold text-purple-700">Converted Score: {score.pcpt} / 20</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-purple-200 bg-white p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white">V</span>
                        <p className="text-xl font-semibold text-slate-800">PCPT (20%)</p>
                      </div>
                      <div className="rounded-xl border border-purple-300 bg-purple-50 p-3">
                        <span className="text-base text-slate-600">Raw Score:</span>
                        <span className="float-right text-2xl font-bold text-purple-700">{score.rawPcpt > 0 ? score.rawPcpt : (hasSavedEvaluation ? 0 : 'Pending Interview')}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">20-25 = 10 pts | 23-25 = 12 pts | 26-28 = 14 pts</p>
                      <p className="text-sm text-slate-500">29-31 = 16 pts | 32-34 = 18 pts | 35 = 20 pts</p>
                      <p className="mt-2 text-base font-semibold text-purple-700">Converted Score: {score.pcpt} / 20</p>
                    </div>
                    <div className="rounded-2xl border border-blue-200 bg-white p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">IV</span>
                        <p className="text-xl font-semibold text-slate-800">Oral Examination (20%)</p>
                      </div>
                      <div className="rounded-xl border border-blue-300 bg-blue-50 p-3">
                        <span className="text-base text-slate-600">Raw Score:</span>
                        <span className="float-right text-2xl font-bold text-blue-700">{score.oral > 0 ? score.oral : (hasSavedEvaluation ? 0 : 'Pending Interview')}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">75↓ = 10 | 76-80 = 12 | 81-85 = 14 | 86-90 = 16</p>
                      <p className="text-sm text-slate-500">91-95 = 18 | 96-100 = 20</p>
                      <p className="mt-2 text-base font-semibold text-blue-700">Converted Score: {score.oral} / 20</p>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-xl font-semibold text-slate-800">Adjectival Rating Reference</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    ['90 - 100', 'Excellent', 'text-green-700'],
                    ['77 - 89', 'Very Good', 'text-blue-700'],
                    ['64 - 76', 'Good', 'text-amber-700'],
                    ['51 - 63', 'Average', 'text-orange-700'],
                  ].map(([range, label, color]) => (
                    <div key={range} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className={`text-base font-semibold ${color}`}>{range}</p>
                      <p className="text-base text-slate-600">{label}</p>
                    </div>
                  ))}
                </div>
              </section>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
                <button type="button" onClick={() => setShowScoresModal(false)} className="rounded-2xl border border-slate-300 bg-white px-8 py-3 text-base text-slate-700">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveScoreDraft}
                  disabled={isScoreFinalized}
                  className="rounded-2xl border border-blue-300 bg-white px-8 py-3 text-base font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={handleSaveScoreSetup}
                  disabled={isScoreFinalized}
                  className="rounded-2xl bg-blue-600 px-8 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isScoreFinalized ? 'View Only' : 'Save Evaluation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (() => {
        const isDisqualify = confirmAction === 'disqualify';
        const canConfirm = !confirmSubmitting && (!isDisqualify || confirmReason.trim().length > 0);
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
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                    isDisqualify ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                  }`}
                >
                  {isDisqualify ? <CircleX size={22} /> : <CheckCircle2 size={22} />}
                </div>
                <div className="flex-1">
                  <h3 className="!mb-1 text-lg font-bold text-slate-900">
                    {isDisqualify ? 'Disqualify this applicant?' : 'Qualify this applicant?'}
                  </h3>
                  <p className="!mb-0 text-sm text-slate-600">
                    {isDisqualify
                      ? `This will mark ${fullName} as not qualified. This action cannot be undone from this screen.`
                      : `This will recommend ${fullName} for hiring. This action cannot be undone from this screen.`}
                  </p>
                </div>
              </div>

              {isDisqualify && (
                <div className="px-6 pt-4">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Reason for disqualification <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={confirmReason}
                    onChange={(event) => setConfirmReason(event.target.value)}
                    placeholder="Please provide a clear reason…"
                    className="w-full resize-none rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 px-6 pb-6 pt-5">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
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
                    try {
                      await persistStatus(confirmAction, isDisqualify ? confirmReason : undefined);
                      setConfirmAction(null);
                      setConfirmReason('');
                    } finally {
                      setConfirmSubmitting(false);
                    }
                  }}
                  disabled={!canConfirm}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                    isDisqualify ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {confirmSubmitting ? 'Saving…' : 'OK'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      </div>{/* /admin-layout wrapper */}
    </div>
  );
}
