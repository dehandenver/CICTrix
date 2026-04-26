import {
    AlertCircle,
    ArrowLeft,
    CheckCircle2,
    Download,
    FileText,
    Plane,
    Search,
    Star,
    User,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import { getPreferredDataSourceMode } from '../../lib/dataSourceMode';
import { isPositionAssignedToInterviewer, resolveAssignedPositionsForInterviewer } from '../../lib/interviewerAccess';
import { mockDatabase } from '../../lib/mockDatabase';
import { ensureRecruitmentSeedData, getAuthoritativeJobPostings, getApplicants as getRecruitmentApplicants } from '../../lib/recruitmentData';
import { ATTACHMENTS_BUCKET, isMockModeEnabled, supabase } from '../../lib/supabase';
import '../../styles/interviewer.css';

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

type ApplicantDetailsTab = 'overview' | 'documents' | 'activity';
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

const isDemoApplicant = (applicant: any): boolean => {
  const applicantId = String(applicant?.id || '').toLowerCase();
  const applicantEmail = String(applicant?.email || '').toLowerCase();
  return applicantId.startsWith('mock-') || applicantEmail.endsWith('@example.com');
};

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

    const hasOralScores = [
      e.communication_skills_score,
      e.confidence_score,
      e.comprehension_score,
      e.personality_score,
      e.job_knowledge_score,
      e.overall_impression_score
    ].every((value) => typeof value === 'number' && value > 0);

    const hasLegacyScores = [
      e.technical_score,
      e.communication_score,
      e.overall_score
    ].every((value) => typeof value === 'number' && value > 0);

    const isComplete = hasSubmittedEvaluation || hasOralScores || hasLegacyScores;
    const current = evaluationMap.get(applicantId);

    if (isComplete || !current) {
      evaluationMap.set(applicantId, isComplete ? 'Completed' : 'In Progress');
    }
  });

  return evaluationMap;
};

const statusIndicatesEvaluated = (status: string): boolean => {
  const value = String(status || '').toLowerCase();
  return (
    value.includes('review') ||
    value.includes('interview completed') ||
    value.includes('recommend') ||
    value.includes('hired')
  );
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
  return rows.filter((row: any) => normalizeText(String(row?.position ?? '')) === normalizedTarget);
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
      evaluation_status: 'Not Yet Rated',
    }));
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const dedupeApplicants = (rows: Applicant[]): Applicant[] => {
  const unique = new Map<string, Applicant>();

  rows.forEach((row) => {
    const email = normalizeText(String(row.email || ''));
    const itemNumber = normalizeText(String(row.item_number || ''));
    const position = normalizeText(String(row.position || ''));
    const fullName = normalizeText(`${row.first_name || ''} ${row.middle_name || ''} ${row.last_name || ''}`);

    // Prefer explicit IDs/item numbers; otherwise fall back to email+position identity.
    const identityKey = itemNumber
      ? `item:${itemNumber}`
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

export function InterviewerApplicantsList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobTitle = searchParams.get('position') || 'N/A';
  
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reviewed' | 'shortlisted' | 'qualified'>('all');
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
  const [internalNotesByApplicant, setInternalNotesByApplicant] = useState<Record<string, string>>({});
  const [assignedPositions, setAssignedPositions] = useState<string[]>([]);

  useEffect(() => {
    const syncJobs = () => {
      if (jobTitle && jobTitle !== 'N/A') {
        void fetchApplicantsAndJob();
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
        syncJobs();
      }
    };

    syncJobs();
    window.addEventListener('focus', syncJobs);
    window.addEventListener('cictrix:job-postings-updated', syncJobs as EventListener);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('focus', syncJobs);
      window.removeEventListener('cictrix:job-postings-updated', syncJobs as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [jobTitle]);

  const fetchApplicantsAndJob = async () => {
    try {
      setLoading(true);
      setError(null);

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
      setJobDetails(resolvedJobDetails);

      if (!matchingPosting && applicantsWithStatus.length === 0) {
        setError('No applicants found for this job posting yet.');
      }
    } catch (err: any) {
      console.error('Error fetching applicants:', err);
      setError(err?.message || 'Failed to load applicants');
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
      } catch {
      }
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

    if (statusFilter === 'all') return true;
    const status = applicant.status.toLowerCase();
    if (statusFilter === 'pending') return status.includes('pending');
    if (statusFilter === 'reviewed') return status.includes('review');
    if (statusFilter === 'shortlisted') return status.includes('shortlist');
    return status.includes('qualif') || status.includes('recommend') || status.includes('hired');
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

  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="interviewer-applicants-list-page">
      {/* Header */}
      <div className="applicants-page-header">
        <button
          className="back-button"
          onClick={() => navigate('/interviewer/dashboard')}
          title="Back to Dashboard"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="header-content">
          <h1>{jobTitle || 'Job Position'}</h1>
          <div className="header-details">
            <span>{jobDetails?.office || 'N/A'}</span>
            <span className="divider">•</span>
            <span>{jobDetails?.department || 'N/A'}</span>
            <span className="divider">•</span>
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="applicants-page-container">
        <div className="applicants-toolbar">
          <div className="applicants-search-box">
            <Search className="search-icon" size={20} />
            <input
              className="search-input"
              placeholder="Search applicants by name or email..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | 'pending' | 'reviewed' | 'shortlisted' | 'qualified')}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="qualified">Qualified</option>
          </select>
        </div>

        <div className="applicants-page-title-section">
          <h2 className="applicants-page-title">Applicants List</h2>
          <p className="applicants-page-subtitle">Showing {filteredApplicants.length} applicants</p>
        </div>

        {loading ? (
          <div className="loading-state">
            <p>Loading applicants...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>❌ Error: {error}</p>
            <button onClick={() => void fetchApplicantsAndJob()}>Retry</button>
          </div>
        ) : filteredApplicants.length > 0 ? (
          <div className="applicants-table-container">
            <table className="applicants-table">
              <thead>
                <tr>
                  <th>APPLICANT NAME</th>
                  <th>CONTACT INFO</th>
                  <th>APPLICATION DATE</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredApplicants.map((applicant) => (
                  <tr key={applicant.id}>
                    <td>
                      <button
                        type="button"
                        className="applicant-name-link"
                        onClick={() => void openApplicantDetails(applicant)}
                      >
                        {getFullName(applicant)}
                      </button>
                    </td>
                    <td>
                      <div className="contact-info-cell">
                        <p>{applicant.email}</p>
                        <p>{applicant.contact_number || 'No contact number'}</p>
                      </div>
                    </td>
                    <td>{formatDate(applicant.created_at)}</td>
                    <td>
                      <span className={`applicant-status-pill ${getApplicantStatusBadgeClass(applicant.status)}`}>
                        {applicant.status}
                      </span>
                    </td>
                    <td>
                      {applicant.evaluation_status === 'Completed' ? (
                        <button className="action-btn evaluated" disabled>
                          Evaluated
                        </button>
                      ) : (
                        <button
                          className="action-btn evaluate"
                          type="button"
                          onClick={() => navigate(`/interviewer/evaluate/${applicant.id}`)}
                        >
                          Evaluate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <p>No applicants found for this position</p>
          </div>
        )}
      </div>

      {activeApplicant && (
        <div className="applicant-details-overlay" onClick={closeApplicantDetails}>
          <div className="applicant-details-modal" onClick={(event) => event.stopPropagation()}>
            <div className="applicant-details-header">
              <div>
                <p className="details-breadcrumb">Recruitment / Applicants / Details</p>
                <h3>{getFullName(activeApplicant)}</h3>
              </div>
              <div className="details-actions">
                <button type="button" className="details-btn details-btn-neutral" onClick={() => setShowMessageDialog(true)}>
                  <Plane size={16} /> Send Message
                </button>
                <button type="button" className="details-btn details-btn-danger" onClick={() => void updateApplicantStatus(activeApplicant.id, 'Not Qualified')}>
                  <AlertCircle size={16} /> Disqualify
                </button>
                <button type="button" className="details-btn details-btn-primary" onClick={() => void updateApplicantStatus(activeApplicant.id, 'Shortlisted')}>
                  <Star size={16} /> Shortlist
                </button>
                <button type="button" className="details-btn details-btn-success" onClick={() => void updateApplicantStatus(activeApplicant.id, 'Recommended for Hiring')}>
                  <CheckCircle2 size={16} /> Qualify
                </button>
                <button type="button" className="details-close-btn" onClick={closeApplicantDetails}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="details-tabs">
              {[
                { key: 'overview', label: 'Overview' },
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

            <div className="details-content-grid">
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

              <section className="applicant-details-main">
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

            <div className="message-dialog-footer">
              <button type="button" className="dialog-btn-cancel" onClick={() => setShowMessageDialog(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="dialog-btn-send"
                onClick={() => setShowMessageDialog(false)}
                disabled={!emailSubject.trim() || !emailMessage.trim()}
              >
                <Plane size={16} /> Send Message
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
