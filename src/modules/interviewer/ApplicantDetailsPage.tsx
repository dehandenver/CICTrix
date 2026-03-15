import {
    Activity as ActivityIcon,
    ArrowLeft,
    CheckCircle2,
    CircleX,
    Eye,
    FileText,
    Mail,
    MessageSquare,
    Send,
    Star,
    User,
    X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { mockDatabase } from '../../lib/mockDatabase';
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
  created_at?: string;
};

type AttachmentRecord = {
  id: string;
  file_name: string;
  file_path: string;
  created_at?: string;
};

type EvaluationRecord = {
  created_at?: string;
  updated_at?: string;
  technical_score?: number;
  overall_score?: number;
  communication_skills_score?: number;
  confidence_score?: number;
  comprehension_score?: number;
  personality_score?: number;
  job_knowledge_score?: number;
  overall_impression_score?: number;
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

type TabKey = 'overview' | 'qualifications' | 'documents' | 'interview';

type ScoreBreakdown = {
  total: number;
  education: number;
  experience: number;
  performance: number;
  written: number;
  pcpt: number;
  oral: number;
  adjective: string;
};

const ATTACHMENT_PREVIEW_CACHE_KEY = 'cictrix_attachment_previews';
const SCORE_SETUP_STORAGE_KEY = 'cictrix_rsp_score_setup';
const SCORE_EDUCATION_STORAGE_KEY = 'cictrix_rsp_score_education';
const SCORE_EXPERIENCE_STORAGE_KEY = 'cictrix_rsp_score_experience';
const SCORE_WRITTEN_STORAGE_KEY = 'cictrix_rsp_score_written';
const SCORE_FINALIZED_STORAGE_KEY = 'cictrix_rsp_score_finalized';

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

const computeScoreBreakdown = (evaluation: EvaluationRecord | null): ScoreBreakdown => {
  if (!evaluation) {
    return {
      total: 0,
      education: 0,
      experience: 0,
      performance: 0,
      written: 0,
      pcpt: 0,
      oral: 0,
      adjective: 'Below Average',
    };
  }

  const education = clamp20((typeof evaluation.technical_score === 'number' ? evaluation.technical_score : 0) / 1.5);
  const experience = to20FromFivePoint(evaluation.job_knowledge_score);
  const performance = to20FromFivePoint(evaluation.overall_impression_score);
  const written = clamp20((typeof evaluation.technical_score === 'number' ? evaluation.technical_score : 0) / 1.5);
  const pcpt = to20FromFivePoint(evaluation.personality_score);

  const oralRaw = [
    evaluation.communication_skills_score,
    evaluation.confidence_score,
    evaluation.comprehension_score,
  ].filter((v) => typeof v === 'number') as number[];
  const oralAverage = oralRaw.length > 0 ? oralRaw.reduce((sum, v) => sum + v, 0) / oralRaw.length : 0;
  const oral = to20FromFivePoint(oralAverage);

  let total = 0;
  if (typeof evaluation.overall_score === 'number' && evaluation.overall_score > 0) {
    total = Math.max(0, Math.min(100, Math.round(evaluation.overall_score)));
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
  const [isScoreFinalized, setIsScoreFinalized] = useState(false);

  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  const [applicant, setApplicant] = useState<ApplicantRecord | null>(null);
  const [recruitmentApplicant, setRecruitmentApplicant] = useState<Applicant | null>(routeState?.applicant ?? null);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationRecord | null>(null);

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

      const loadFromClient = async (client: any) => {
        const applicantRes = await client.from('applicants').select('*').eq('id', id).single();
        if (applicantRes.error || !applicantRes.data) {
          throw applicantRes.error || new Error('Applicant not found');
        }

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
          .limit(1)
          .maybeSingle();

        return {
          applicant: applicantRes.data as ApplicantRecord,
          attachments: (attachmentRes.data || []) as AttachmentRecord[],
          evaluation: (evaluationRes.data || null) as EvaluationRecord | null,
        };
      };

      try {
        const primary = await loadFromClient(supabase);
        setApplicant(primary.applicant);
        setAttachments(mergeAttachmentRows(primary.attachments, buildAttachmentRowsFromRecruitment(storedRecruitmentApplicant)));
        setEvaluation(primary.evaluation ?? buildFallbackEvaluation(storedRecruitmentApplicant));
      } catch {
        try {
          const fallback = await loadFromClient(mockDatabase as any);
          setApplicant(fallback.applicant);
          setAttachments(mergeAttachmentRows(fallback.attachments, buildAttachmentRowsFromRecruitment(storedRecruitmentApplicant)));
          setEvaluation(fallback.evaluation ?? buildFallbackEvaluation(storedRecruitmentApplicant));
        } catch {
          if (storedRecruitmentApplicant) {
            setApplicant(buildApplicantRecordFromRecruitment(storedRecruitmentApplicant, storedJobPosting));
            setAttachments(buildAttachmentRowsFromRecruitment(storedRecruitmentApplicant));
            setEvaluation(buildFallbackEvaluation(storedRecruitmentApplicant));
          } else {
            setApplicant(null);
            setAttachments([]);
            setEvaluation(null);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, routeState]);

  const fullName = useMemo(() => (applicant ? getFullName(applicant) : ''), [applicant]);
  const resolvedStatus = recruitmentApplicant?.status || applicant?.status;
  const badge = statusBadge(resolvedStatus);
  const score = useMemo(() => computeScoreBreakdown(evaluation), [evaluation]);
  const backTo = routeState?.from || '/admin/rsp/qualified';
  const sourcePath = routeState?.from || '';
  const isJobScopedQualifiedRoute = /^\/admin\/rsp\/qualified\/[^/?#]+/.test(sourcePath);
  const isFromJobPosts = sourcePath.startsWith('/admin/rsp/jobs') || isJobScopedQualifiedRoute;
  const showViewScoresButton = !isFromJobPosts;
  const showJobPostActionButtons = isFromJobPosts;
  const primaryEducation = recruitmentApplicant?.education?.[0] ?? null;
  const primaryExperience = recruitmentApplicant?.experience?.[0] ?? null;
  const selectedEducationOption = EDUCATION_ATTAINMENT_OPTIONS.find((option) => option.value === educationAttainment);
  const modalEducationScore = selectedEducationOption?.points ?? (isScoreFinalized ? score.education : 0);
  const isPromotionalAppointment = appointmentType === 'promotional';
  const thirdScoreLabel = isPromotionalAppointment ? 'III Performance (20%)' : 'III Written Examination (20%)';
  const thirdScoreValue = isPromotionalAppointment ? score.performance : score.written;
  const thirdScorePlaceholder = isPromotionalAppointment ? 'Enter performance score (0-20)' : 'Enter score (0-30)';
  const fourthScoreLabel = isPromotionalAppointment ? 'IV Potential (20%)' : 'IV Oral Examination (20%)';
  const fourthScoreValue = score.oral;
  const experienceYearsNum = parseInt(experienceYears, 10);
  const modalExperienceScore = experienceYears !== '' && !Number.isNaN(experienceYearsNum)
    ? experienceYearsToPoints(experienceYearsNum)
    : (isScoreFinalized ? score.experience : 0);
  const writtenScoreNum = parseInt(writtenScore, 10);
  const modalWrittenScore = writtenScore !== '' && !Number.isNaN(writtenScoreNum)
    ? Math.max(0, Math.min(30, writtenScoreNum))
    : (isScoreFinalized ? thirdScoreValue : 0);
  const modalTotalScore = Math.max(0, Math.min(100,
    score.total
    - score.education + modalEducationScore
    - score.experience + modalExperienceScore
    - thirdScoreValue + modalWrittenScore
  ));
  const modalAdjective = adjectiveFromScore(modalTotalScore);
  const scoringResponsibilityText = isPromotionalAppointment
    ? {
        rsp: 'Education, Experience, Performance',
        interviewer: 'PCPT, Potential',
      }
    : {
        rsp: 'Education, Experience, Written Examination',
        interviewer: 'PCPT, Oral Examination',
      };

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
    setShowSendEmailModal(true);
  };

  const handleSendEmail = () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    if (applicant?.email) {
      const mailto = `mailto:${applicant.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
      window.location.href = mailto;
    }
    setShowSendEmailModal(false);
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

  const handleDisqualify = () => {
    const confirmed = window.confirm(`Mark ${fullName || 'this applicant'} as Disqualified?`);
    if (!confirmed) return;
    handleUpdateStatus('Not Qualified');
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

    saveStoredAppointmentType(applicant.id, appointmentType);
    saveStoredEducationAttainment(applicant.id, educationAttainment);
    saveStoredExperienceYears(applicant.id, experienceYears);
    saveStoredWrittenScore(applicant.id, writtenScore);
    saveStoredFinalizedState(applicant.id, true);

    // Persist score + status so Reports > Application Ranking can include this applicant.
    const updatePayload = {
      total_score: modalTotalScore,
      status: nextStatus,
    };

    try {
      const primaryUpdate = await supabase.from('applicants').update(updatePayload).eq('id', applicant.id);
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
    setShowScoresModal(false);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-600">Loading applicant details...</div>;
  }

  if (!applicant) {
    return <div className="p-8 text-red-600">Applicant not found.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="bg-slate-100 !p-0">
        <header className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => navigate(backTo)}
                className="mt-0.5 rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <p className="text-xs text-slate-500">Recruitment <span className="px-1">/</span> Applicants <span className="px-1">/</span> <span className="font-semibold text-slate-700">Details</span></p>
                <h1 className="text-[27px] leading-tight font-semibold text-slate-900">{fullName}</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {showViewScoresButton && (
                <button
                  type="button"
                  onClick={() => setShowScoresModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
                >
                  <Eye size={14} /> View Scores
                </button>
              )}

              {showJobPostActionButtons && (
                <>
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
                  >
                    <Send size={14} /> Send Message
                  </button>
                  <button
                    type="button"
                    onClick={handleDisqualify}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm"
                  >
                    <CircleX size={14} /> Disqualify
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('Shortlisted')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                  >
                    <Star size={14} /> Shortlist
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('Recommended for Hiring')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                  >
                    <CheckCircle2 size={14} /> Qualify
                  </button>
                </>
              )}
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
                  className={`inline-flex items-center gap-1.5 border-b-2 pb-2 pt-2.5 font-semibold ${activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600'}`}
                  onClick={() => setActiveTab(tab.key as TabKey)}
                >
                  <Icon className="h-3.5 w-3.5" /> {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <section className="p-3">
          <div className="grid h-[calc(100vh-150px)] grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[260px_1fr]">
            <aside className="overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
              <div className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-blue-600 text-white">
                <User className="h-11 w-11" />
              </div>

              <h2 className="text-center text-3xl font-semibold text-slate-900">{fullName}</h2>
              <div className="mt-2 text-center">
                <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${normalizeText(resolvedStatus).includes('pending') || !resolvedStatus ? 'border-amber-300 bg-amber-100 text-amber-700' : badge.className}`}>
                  {(normalizeText(resolvedStatus).includes('pending') || !resolvedStatus) ? 'PENDING' : badge.label.toUpperCase()}
                </span>
              </div>

              <div className="mt-4 space-y-3 border-t border-slate-200 pt-3 text-sm">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application ID</p><p className="font-semibold text-slate-800">{applicant.id}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date Applied</p><p className="font-semibold text-slate-800">{formatDate(applicant.created_at)}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p><p className="font-semibold text-slate-800">{applicant.email || '--'}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</p><p className="font-semibold text-slate-800">{applicant.contact_number || '--'}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p><p className="font-semibold text-slate-800">{applicant.address || applicant.office || '--'}</p></div>
              </div>
            </aside>

            <section className="overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
              {activeTab === 'overview' && (
                <div className="space-y-3">
                  <article className="rounded-xl border border-slate-200">
                    <h3 className="border-b border-slate-200 px-3 py-2 text-2xl font-semibold text-slate-900">Personal Information</h3>
                    <div className="grid grid-cols-1 gap-0 px-3 py-1 md:grid-cols-2">
                      <div className="border-b border-slate-100 py-2.5"><p className="font-semibold text-slate-500">Full Name</p><p className="text-sm text-slate-900">{fullName}</p></div>
                      <div className="border-b border-slate-100 py-2.5"><p className="font-semibold text-slate-500">Email Address</p><p className="text-sm text-slate-900">{applicant.email || '--'}</p></div>
                      <div className="border-b border-slate-100 py-2.5"><p className="font-semibold text-slate-500">Phone Number</p><p className="text-sm text-slate-900">{applicant.contact_number || '--'}</p></div>
                      <div className="border-b border-slate-100 py-2.5"><p className="font-semibold text-slate-500">Address</p><p className="text-sm text-slate-900">{applicant.address || '--'}</p></div>
                      <div className="py-2.5"><p className="font-semibold text-slate-500">PWD Status</p><p className="text-sm text-slate-900">{applicant.is_pwd ? 'PWD' : 'Not Applicable'}</p></div>
                    </div>
                  </article>

                  <article className="rounded-xl border border-slate-200">
                    <h3 className="border-b border-slate-200 px-3 py-2 text-2xl font-semibold text-slate-900">Qualifications</h3>
                    <div className="grid grid-cols-1 gap-0 px-3 py-1 md:grid-cols-2">
                      <div className="border-b border-slate-100 py-2.5"><p className="font-semibold text-slate-500">Education</p><p className="text-sm text-slate-900">{primaryEducation ? `${primaryEducation.degree}, ${primaryEducation.school}` : 'BS Information Technology, University of the Philippines'}</p></div>
                      <div className="border-b border-slate-100 py-2.5"><p className="font-semibold text-slate-500">Work Experience</p><p className="text-sm text-slate-900">{primaryExperience ? `${primaryExperience.years} year${primaryExperience.years === 1 ? '' : 's'} as ${primaryExperience.title}` : '3 years as Junior IT Officer'}</p></div>
                      <div className="py-2.5"><p className="font-semibold text-slate-500">Application Date</p><p className="text-sm text-slate-900">{formatDate(applicant.created_at)}</p></div>
                    </div>
                  </article>

                  <article className="rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                      <h3 className="text-2xl font-semibold text-slate-900">Internal Notes</h3>
                      <button
                        type="button"
                        className="text-sm font-medium text-blue-600"
                        onClick={() => setShowNoteEditor(true)}
                      >
                        Add Note
                      </button>
                    </div>

                    {!notes.trim() && !showNoteEditor ? (
                      <div className="px-3 py-4 text-sm text-slate-500">
                        <p className="inline-flex items-center gap-2"><MessageSquare className="h-4 w-4" /> No notes yet. Add notes to track internal comments and observations.</p>
                      </div>
                    ) : (
                      <div className="px-3 py-3">
                        <textarea
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          placeholder="Add internal comments and observations..."
                          className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
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
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    <h3 className="text-xl font-semibold text-slate-900">Submitted Documents</h3>
                    <button className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600" onClick={handleSendMessage}>
                      <Mail className="h-4 w-4" /> Send Message
                    </button>
                  </div>
                  <div className="space-y-2 p-3">
                    {attachments.length > 0 ? attachments.map((doc) => (
                      <article key={doc.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
                        <div>
                          <p className="text-base font-semibold text-slate-900">{doc.file_name}</p>
                          <p className="text-sm text-slate-500">Uploaded {formatDate(doc.created_at || applicant.created_at)}</p>
                        </div>
                        <button className="text-sm font-semibold text-blue-600" onClick={() => openDocument(doc.file_path)}>View</button>
                      </article>
                    )) : <p className="text-slate-500">No uploaded documents found for this applicant yet.</p>}
                  </div>
                </article>
              )}

              {activeTab === 'activity' && (
                <article className="rounded-xl border border-slate-200">
                  <h3 className="border-b border-slate-200 px-3 py-2 text-xl font-semibold text-slate-900">Activity Timeline</h3>
                  <div className="space-y-3 p-3">
                    {(recruitmentApplicant?.timeline || []).map((entry, index) => (
                      <div key={`${entry.event}-${index}`} className="flex gap-3">
                        <span className="mt-2 h-3 w-3 rounded-full bg-blue-600" />
                        <div>
                          <p className="text-base font-semibold text-slate-900">{entry.event}</p>
                          <p className="text-sm text-slate-500">{formatDate(entry.date)} • {entry.actor}</p>
                        </div>
                      </div>
                    ))}
                    {(!recruitmentApplicant?.timeline || recruitmentApplicant.timeline.length === 0) && (
                      <p className="text-slate-500">No activity yet.</p>
                    )}
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
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
              <button type="button" onClick={() => setShowSendEmailModal(false)} className="rounded-2xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={!emailSubject.trim() || !emailBody.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={15} /> Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {showScoresModal && (
        <div className="fixed inset-0 z-[260] bg-black/80 p-4" onClick={() => setShowScoresModal(false)}>
          <div className="mx-auto h-[96vh] w-full max-w-[1450px] overflow-y-auto rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-blue-700 px-8 py-5 text-white">
              <div>
                <h2 className="text-3xl font-bold">Applicant Evaluation & Scoring</h2>
                <p className="text-lg text-blue-100">{fullName} - {applicant.position || '--'}</p>
              </div>
              <button type="button" onClick={() => setShowScoresModal(false)} className="rounded-lg p-2 text-white/90 hover:bg-white/10">
                <X size={36} />
              </button>
            </div>

            <div className="space-y-6 p-8">
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => !isScoreFinalized && setAppointmentType('original')}
                    disabled={isScoreFinalized}
                    className={`rounded-2xl border p-4 text-center transition ${
                      appointmentType === 'original'
                        ? 'border-2 border-blue-400 bg-white shadow-sm'
                        : 'border border-slate-300 bg-slate-100'
                    } ${isScoreFinalized ? 'cursor-not-allowed opacity-80' : ''}`}
                  >
                    <p className={`text-xl font-semibold ${appointmentType === 'original' ? 'text-blue-700' : 'text-slate-500'}`}>Original Appointment</p>
                    <p className="text-base text-slate-500">Education • Experience • Written Exam* • PCPT*</p>
                    <p className="text-sm text-slate-500">*Interviewer-provided</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => !isScoreFinalized && setAppointmentType('promotional')}
                    disabled={isScoreFinalized}
                    className={`rounded-2xl border p-4 text-center transition ${
                      appointmentType === 'promotional'
                        ? 'border-2 border-blue-400 bg-white shadow-sm'
                        : 'border border-slate-300 bg-slate-100'
                    } ${isScoreFinalized ? 'cursor-not-allowed opacity-80' : ''}`}
                  >
                    <p className={`text-xl font-semibold ${appointmentType === 'promotional' ? 'text-blue-700' : 'text-slate-500'}`}>Promotional Appointment</p>
                    <p className="text-base text-slate-500">Education • Experience • Performance • PCPT* • Potential</p>
                    <p className="text-sm text-slate-500">*Interviewer-provided</p>
                  </button>
                </div>
              </section>

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
                  <p className="mb-2 text-xl font-semibold text-slate-800">I Education (20%)</p>
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
                  <p className="mb-2 text-xl font-semibold text-slate-800">II Experience (20%)</p>
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
                  <p className="mt-1 text-sm text-slate-400">1-5 yrs: 12 pts &nbsp;|&nbsp; 6-10: 14 pts &nbsp;|&nbsp; 11-15: 16 pts &nbsp;|&nbsp; 16-20: 18 pts &nbsp;|&nbsp; 21+: 20 pts</p>
                  <p className="mt-2 text-base text-slate-600">Score: <span className="font-semibold text-blue-700">{modalExperienceScore}</span></p>
                </div>
                <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                  <p className="mb-2 text-xl font-semibold text-slate-800">{thirdScoreLabel}</p>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={writtenScore}
                    onChange={(event) => setWrittenScore(event.target.value)}
                    disabled={isScoreFinalized}
                    placeholder={thirdScorePlaceholder}
                    className="w-full rounded-xl border border-slate-300 p-3 text-base disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                  <p className="mt-2 text-base text-slate-600">Score: <span className="font-semibold text-green-700">{modalWrittenScore}</span></p>
                </div>
              </section>

              <section className="rounded-2xl border border-purple-300 bg-purple-50 p-5">
                <p className="mb-3 text-xl font-semibold text-slate-800">Interviewer-Provided Scores (Auto-Generated by System)</p>
                <div className="mb-3 rounded-2xl border border-purple-200 bg-white p-4">
                  <p className="text-base font-semibold text-purple-700">RSP Cannot Edit These Scores</p>
                  <p className="text-base text-slate-700">
                    The following scores are automatically provided by the interview panel and cannot be manually entered by RSP staff.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-purple-200 bg-white p-4">
                    <p className="mb-2 text-xl font-semibold text-slate-800">V PCPT (20%)</p>
                    <div className="rounded-xl border border-purple-300 bg-purple-50 p-3 text-base text-slate-700">
                      <span className="font-semibold">Raw Score:</span>{' '}
                      <span className="float-right text-purple-700">{score.pcpt > 0 ? `${score.pcpt}/20` : 'Pending Interview'}</span>
                    </div>
                    <p className="mt-2 text-base font-semibold text-purple-700">Converted Score: {score.pcpt} / 20</p>
                  </div>

                  <div className="rounded-2xl border border-blue-200 bg-white p-4">
                    <p className="mb-2 text-xl font-semibold text-slate-800">{fourthScoreLabel}</p>
                    <div className="rounded-xl border border-blue-300 bg-blue-50 p-3 text-base text-slate-700">
                      <span className="font-semibold">Raw Score:</span>{' '}
                      <span className="float-right text-blue-700">{fourthScoreValue > 0 ? `${fourthScoreValue}/20` : 'Pending Interview'}</span>
                    </div>
                    <p className="mt-2 text-base font-semibold text-blue-700">Converted Score: {fourthScoreValue} / 20</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-xl font-semibold text-slate-800">Adjectival Rating Reference</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {[
                    ['90 - 100', 'Excellent', 'text-green-700'],
                    ['77 - 89', 'Very Good', 'text-blue-700'],
                    ['64 - 76', 'Good', 'text-amber-700'],
                    ['51 - 63', 'Average', 'text-orange-700'],
                    ['Below 50', 'Below Average', 'text-rose-700'],
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
                <button type="button" onClick={handleSaveScoreSetup} className="rounded-2xl bg-blue-600 px-8 py-3 text-base font-semibold text-white">
                  {isScoreFinalized ? 'Saved Evaluation' : 'Save Evaluation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
