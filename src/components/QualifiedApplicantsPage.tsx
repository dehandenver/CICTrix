import {
    Calendar,
    CalendarDays,
    CheckCircle2,
    Clock3,
    Download,
    Eye,
    FileSpreadsheet,
    Mail,
    MessageSquare,
    MoreVertical,
    Search,
    UserCheck,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    downloadTextFile,
    ensureRecruitmentSeedData,
    formatPHDate,
    formatPHDateTime,
    getApplicants,
    getJobPostings,
    getNewlyHired,
    saveApplicants,
    saveNewlyHired,
    toCsv,
} from '../lib/recruitmentData';
import { ATTACHMENTS_BUCKET, supabase } from '../lib/supabase';
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

const STATUS_OPTIONS: ApplicantStatus[] = [
  'New Application',
  'Under Review',
  'Shortlisted',
  'For Interview',
  'Interview Scheduled',
  'Interview Completed',
  'Recommended for Hiring',
  'Not Qualified',
  'Rejected',
];

const toNewHireRecord = (applicant: Applicant, jobMap: Map<string, JobPosting>): NewlyHired => {
  const job = jobMap.get(applicant.jobPostingId);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    applicantId: applicant.id,
    employeeInfo: {
      firstName: applicant.personalInfo.firstName,
      lastName: applicant.personalInfo.lastName,
      email: applicant.personalInfo.email,
      phone: applicant.personalInfo.phone,
      emergencyContact: {
        name: 'Not Provided',
        relationship: 'Not Provided',
        phone: 'Not Provided',
      },
      governmentIds: {},
    },
    position: job?.title ?? 'Pending Position',
    department: job?.department ?? 'Unassigned',
    division: job?.division,
    employmentType: job?.employmentStatus ?? 'Contractual',
    salaryGrade: job?.salaryGrade,
    dateHired: now,
    expectedStartDate: new Date(Date.now() + 14 * 86400000).toISOString(),
    status: 'Pending Onboarding',
    onboardingProgress: 0,
    onboardingChecklist: [
      { category: 'Pre-Boarding', item: 'Employment contract signed', completed: false },
      { category: 'Pre-Boarding', item: 'Government IDs verified', completed: false },
      { category: 'Day 1', item: 'Welcome orientation completed', completed: false },
      { category: 'Week 1', item: 'HRIS system training', completed: false },
      { category: 'First Month', item: 'Benefits enrollment completed', completed: false },
    ],
    documents: applicant.documents,
    notes: [{ author: 'HR Admin', content: 'Imported from qualified applicant.', date: now }],
    timeline: [{ event: 'Moved to Newly Hired', date: now, actor: 'HR Admin' }],
  };
};

export const QualifiedApplicantsPage = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();

  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<ApplicantStatus[]>([]);
  const [scoreMin, setScoreMin] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'Application Date' | 'Qualification Score' | 'Last Updated'>('Application Date');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeApplicant, setActiveApplicant] = useState<Applicant | null>(null);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Documents' | 'Timeline' | 'Notes' | 'Interview'>('Overview');
  const [showGuide, setShowGuide] = useState(false);
  const [toast, setToast] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [documentActionBusy, setDocumentActionBusy] = useState<string | null>(null);

  useEffect(() => {
    ensureRecruitmentSeedData();
    const loadedJobs = getJobPostings();
    setJobs(loadedJobs);
    setApplicants(getApplicants());
    if (jobId) setJobFilter(jobId);
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
      const matchesSearch =
        !search ||
        `${applicant.personalInfo.firstName} ${applicant.personalInfo.lastName} ${applicant.personalInfo.email} ${applicant.id}`
          .toLowerCase()
          .includes(search.toLowerCase());
      const matchesJob = (jobId ? applicant.jobPostingId === jobId : jobFilter === 'all' || applicant.jobPostingId === jobFilter);
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(applicant.status);
      const matchesScore = applicant.qualificationScore >= scoreMin;
      const applied = new Date(applicant.applicationDate).getTime();
      const fromOkay = !dateFrom || applied >= new Date(dateFrom).getTime();
      const toOkay = !dateTo || applied <= new Date(dateTo).getTime() + 86400000;
      return matchesSearch && matchesJob && matchesStatus && matchesScore && fromOkay && toOkay;
    });

    const sorted = [...rows];
    sorted.sort((left, right) => {
      if (sortBy === 'Qualification Score') return right.qualificationScore - left.qualificationScore;
      if (sortBy === 'Last Updated') {
        const leftTime = new Date(left.timeline[left.timeline.length - 1]?.date ?? left.applicationDate).getTime();
        const rightTime = new Date(right.timeline[right.timeline.length - 1]?.date ?? right.applicationDate).getTime();
        return rightTime - leftTime;
      }
      return new Date(right.applicationDate).getTime() - new Date(left.applicationDate).getTime();
    });
    return sorted;
  }, [applicants, search, jobId, jobFilter, statusFilter, scoreMin, dateFrom, dateTo, sortBy]);

  const counts = useMemo(() => {
    const total = filteredRows.length;
    return {
      total,
      shortlisted: filteredRows.filter((item) => item.status === 'Shortlisted').length,
      forInterview: filteredRows.filter((item) => item.status === 'For Interview' || item.status === 'Interview Scheduled').length,
      recommended: filteredRows.filter((item) => item.status === 'Recommended for Hiring').length,
    };
  }, [filteredRows]);

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
    setSelectedIds([]);
    setToast(`Status updated to ${nextStatus}.`);
  };

  const exportSelected = () => {
    const target = selectedIds.length ? filteredRows.filter((item) => selectedIds.includes(item.id)) : filteredRows;
    const csv = toCsv(
      ['Application ID', 'Name', 'Email', 'Position', 'Department', 'Score', 'Status', 'Date Applied'],
      target.map((item) => {
        const job = jobMap.get(item.jobPostingId);
        return [
          item.id,
          `${item.personalInfo.firstName} ${item.personalInfo.lastName}`,
          item.personalInfo.email,
          job?.title ?? 'Unknown',
          job?.department ?? 'Unknown',
          item.qualificationScore,
          item.status,
          formatPHDate(item.applicationDate),
        ];
      })
    );
    downloadTextFile('qualified-applicants.csv', csv, 'text/csv;charset=utf-8');
    setToast('Export completed (CSV).');
  };

  const moveToNewlyHired = (applicant: Applicant) => {
    const current = getNewlyHired();
    if (current.some((row) => row.applicantId === applicant.id)) {
      setToast('Applicant is already in Newly Hired list.');
      return;
    }

    const nextRows = [toNewHireRecord(applicant, jobMap), ...current];
    saveNewlyHired(nextRows);
    updateApplicantStatus([applicant.id], 'Recommended for Hiring');
    setToast('Applicant moved to Newly Hired module.');
  };

  const allSelected = filteredRows.length > 0 && selectedIds.length === filteredRows.length;

  const setInterviewSchedule = (applicant: Applicant) => {
    const scheduleDate = new Date(Date.now() + 2 * 86400000).toISOString();
    const nextApplicants = applicants.map((row) => {
      if (row.id !== applicant.id) return row;
      return {
        ...row,
        status: 'Interview Scheduled' as ApplicantStatus,
        interview: {
          scheduledDate: scheduleDate,
          type: 'Online' as const,
          meetingLink: 'https://zoom.us/j/hris-interview-room',
          interviewers: ['HR Panel'],
          results: row.interview?.results,
        },
        timeline: [...row.timeline, { event: 'Interview Scheduled', date: new Date().toISOString(), actor: 'HR Admin' }],
      };
    });
    setApplicants(nextApplicants);
    saveApplicants(nextApplicants);
    setToast('Interview scheduled and notification sent.');
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

    const target = normalizeDocKey(docType);
    return attachments.filter((entry) => {
      if (entry.applicant_id !== applicantId) return false;
      const byDocumentType = normalizeDocKey(entry.document_type ?? '') === target;
      const byName = normalizeDocKey(entry.file_name).includes(target);
      return byDocumentType || byName;
    });
  };

  const getPreviewCacheMatch = (applicantId: string, docType: string): CachedPreviewFile | null => {
    const entries = (() => {
      try {
        return JSON.parse(localStorage.getItem(ATTACHMENT_PREVIEW_CACHE_KEY) ?? '[]') as CachedPreviewFile[];
      } catch {
        return [];
      }
    })();

    const target = normalizeDocKey(docType);
    return (
      entries.find(
        (entry) =>
          entry.applicantId === applicantId &&
          (normalizeDocKey(entry.documentType) === target || normalizeDocKey(entry.fileName).includes(target))
      ) ?? null
    );
  };

  const resolveDocumentForApplicant = async (applicantId: string, docType: string): Promise<ResolvedDocument | null> => {
    const previewCacheMatch = getPreviewCacheMatch(applicantId, docType);
    if (previewCacheMatch) {
      return {
        fileName: previewCacheMatch.fileName,
        url: previewCacheMatch.dataUrl,
      };
    }

    const localMatches = getLocalAttachmentMatches(applicantId, docType);
    for (const match of localMatches) {
      if (match.file_path?.startsWith('http') || match.file_path?.startsWith('data:') || match.file_path?.startsWith('blob:')) {
        return {
          fileName: match.file_name,
          url: match.file_path,
        };
      }

      if (match.file_path && !match.file_path.startsWith('mock://')) {
        const signedResult = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(match.file_path, 120);
        const signedUrl = (signedResult as any)?.data?.signedUrl as string | undefined;
        if (signedUrl) {
          return {
            fileName: match.file_name,
            url: signedUrl,
          };
        }
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

    const target = normalizeDocKey(docType);
    const remoteMatch = remoteRows.find((entry) => {
      const byDocumentType = normalizeDocKey(entry.document_type ?? '') === target;
      const byName = normalizeDocKey(entry.file_name ?? '').includes(target);
      return byDocumentType || byName;
    });

    if (!remoteMatch || !remoteMatch.file_path) return null;

    if (remoteMatch.file_path.startsWith('http') || remoteMatch.file_path.startsWith('data:') || remoteMatch.file_path.startsWith('blob:')) {
      return {
        fileName: remoteMatch.file_name,
        url: remoteMatch.file_path,
      };
    }

    const signedResult = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(remoteMatch.file_path, 120);
    const signedUrl = (signedResult as any)?.data?.signedUrl as string | undefined;
    if (!signedUrl) return null;

    return {
      fileName: remoteMatch.file_name,
      url: signedUrl,
    };
  };

  const handlePreviewDocument = async (docType: string) => {
    if (!activeApplicant) return;

    const actionKey = `${activeApplicant.id}-${docType}-preview`;
    setDocumentActionBusy(actionKey);
    try {
      const resolved = await resolveDocumentForApplicant(activeApplicant.id, docType);
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

  const handleDownloadDocument = async (docType: string) => {
    if (!activeApplicant) return;

    const actionKey = `${activeApplicant.id}-${docType}-download`;
    setDocumentActionBusy(actionKey);
    try {
      const resolved = await resolveDocumentForApplicant(activeApplicant.id, docType);
      if (!resolved) {
        setToast('No downloadable file found for this document yet.');
        return;
      }

      const anchor = document.createElement('a');
      anchor.href = resolved.url;
      anchor.download = resolved.fileName;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.click();
    } catch {
      setToast('Unable to download this document right now.');
    } finally {
      setDocumentActionBusy(null);
    }
  };

  const handleBulkDownload = async () => {
    if (!activeApplicant) return;

    let downloaded = 0;
    for (const doc of activeApplicant.documents) {
      const resolved = await resolveDocumentForApplicant(activeApplicant.id, doc.type);
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

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />
      <main className="admin-content bg-slate-50">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            {jobId && selectedJobTitle ? (
              <p className="mb-2 text-sm text-slate-500">Job Postings &gt; {selectedJobTitle} &gt; Applicants</p>
            ) : null}
            <h1 className="text-3xl font-bold text-slate-900">Qualified Applicants</h1>
          </div>
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700" onClick={() => setShowGuide(true)}>
            How to Navigate
          </button>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[{ label: 'Total Apps', value: counts.total }, { label: 'Shortlisted', value: counts.shortlisted }, { label: 'For Interview', value: counts.forInterview }, { label: 'Recommended', value: counts.recommended }].map((card) => (
            <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
            </article>
          ))}
        </section>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-6">
            {!jobId ? (
              <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm" value={jobFilter} onChange={(event) => setJobFilter(event.target.value)}>
                <option value="all">All Job Postings</option>
                {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
              </select>
            ) : (
              <div className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 flex items-center">Filtered to selected job posting</div>
            )}

            <div className="rounded-lg border border-slate-300 px-3 py-2 text-xs">
              <p className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Status</p>
              <div className="max-h-20 space-y-1 overflow-y-auto">
                {STATUS_OPTIONS.map((status) => (
                  <label key={status} className="inline-flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      checked={statusFilter.includes(status)}
                      onChange={() =>
                        setStatusFilter((current) =>
                          current.includes(status)
                            ? current.filter((entry) => entry !== status)
                            : [...current, status]
                        )
                      }
                    />
                    <span>{status}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Qualification Score {scoreMin}%+</label>
              <input type="range" min={0} max={100} value={scoreMin} onChange={(event) => setScoreMin(Number(event.target.value))} className="mt-2 w-full" />
            </div>

            <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm" placeholder="Search name, email, ID" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <select className="h-10 rounded-lg border border-slate-300 px-3 text-sm" value={sortBy} onChange={(event) => setSortBy(event.target.value as 'Application Date' | 'Qualification Score' | 'Last Updated')}>
              <option>Application Date</option>
              <option>Qualification Score</option>
              <option>Last Updated</option>
            </select>

            <div className="flex flex-wrap gap-2">
              <button className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" onClick={() => updateApplicantStatus(selectedIds.length ? selectedIds : filteredRows.map((item) => item.id), 'Under Review')}>
                Update Status
              </button>
              <button className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" onClick={exportSelected}>
                <FileSpreadsheet className="mr-1 inline h-4 w-4" />Export
              </button>
            </div>
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) =>
                        setSelectedIds(event.target.checked ? filteredRows.map((item) => item.id) : [])
                      }
                    />
                  </th>
                  <th className="px-3 py-3">Applicant</th>
                  <th className="px-3 py-3">Contact</th>
                  <th className="px-3 py-3">Position Applied</th>
                  <th className="px-3 py-3">Date Applied</th>
                  <th className="px-3 py-3">Qualification Score</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((applicant) => {
                  const fullName = `${applicant.personalInfo.firstName} ${applicant.personalInfo.lastName}`;
                  const job = jobMap.get(applicant.jobPostingId);
                  return (
                    <tr key={applicant.id} className="border-t border-slate-100">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(applicant.id)}
                          onChange={() =>
                            setSelectedIds((current) =>
                              current.includes(applicant.id)
                                ? current.filter((entry) => entry !== applicant.id)
                                : [...current, applicant.id]
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">{fullName}</td>
                      <td className="px-3 py-3 text-slate-600">
                        <p>{applicant.personalInfo.email}</p>
                        <p className="text-xs text-slate-500">{applicant.personalInfo.phone}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <p>{job?.title ?? 'Unknown'}</p>
                        <p className="text-xs text-slate-500">{job?.department ?? 'N/A'}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{formatPHDate(applicant.applicationDate)}</td>
                      <td className="px-3 py-3">
                        <div className="w-32">
                          <div className="mb-1 h-2 rounded-full bg-slate-200">
                            <div className="h-2 rounded-full bg-blue-600" style={{ width: `${applicant.qualificationScore}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-700">{applicant.qualificationScore}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[applicant.status]}`}>{applicant.status}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="relative">
                          <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setOpenMenuId(openMenuId === applicant.id ? null : applicant.id)}>
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openMenuId === applicant.id ? (
                            <div className="absolute right-0 z-10 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                              <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => { setActiveApplicant(applicant); setOpenMenuId(null); }}>View Application Details</button>
                              <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => { setToast('Documents download started.'); setOpenMenuId(null); }}>Download Resume/Documents</button>
                              <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => { setInterviewSchedule(applicant); setOpenMenuId(null); }}>Schedule Interview</button>
                              <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => { updateApplicantStatus([applicant.id], 'Shortlisted'); setOpenMenuId(null); }}>Add To Shortlist</button>
                              {applicant.status === 'Recommended for Hiring' ? (
                                <button className="block w-full rounded px-2 py-1 text-left text-green-700 hover:bg-green-50" onClick={() => { moveToNewlyHired(applicant); setOpenMenuId(null); }}>
                                  Move To Newly Hired
                                </button>
                              ) : (
                                <button className="block w-full rounded px-2 py-1 text-left text-green-700 hover:bg-green-50" onClick={() => { updateApplicantStatus([applicant.id], 'Recommended for Hiring'); setOpenMenuId(null); }}>
                                  Recommend For Hiring
                                </button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
        <div className="fixed inset-0 z-[120] bg-slate-900/70 p-4" onClick={() => setActiveApplicant(null)}>
          <div className="mx-auto h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Applicant Details</h2>
                <p className="text-sm text-slate-500">{activeApplicant.id}</p>
              </div>
              <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setActiveApplicant(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-5 border-b border-slate-200 text-sm">
              {['Overview', 'Documents', 'Timeline', 'Notes', 'Interview'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`px-3 py-2 text-left ${activeTab === tab ? 'border-b-2 border-blue-600 font-semibold text-blue-700' : 'text-slate-500'}`}
                  onClick={() => setActiveTab(tab as 'Overview' | 'Documents' | 'Timeline' | 'Notes' | 'Interview')}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="px-6 py-5">
              {activeTab === 'Overview' && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Applicant Information</p>
                    <h3 className="mt-1 text-xl font-bold text-slate-900">{activeApplicant.personalInfo.firstName} {activeApplicant.personalInfo.lastName}</h3>
                    <p className="mt-2 text-sm text-slate-600">{activeApplicant.personalInfo.email} • {activeApplicant.personalInfo.phone}</p>
                    <p className="mt-1 text-sm text-slate-600">Qualification Score: <span className="font-semibold">{activeApplicant.qualificationScore}%</span></p>
                    <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[activeApplicant.status]}`}>{activeApplicant.status}</span>
                    <div className="mt-4 flex gap-2">
                      <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => updateApplicantStatus([activeApplicant.id], 'Under Review')}>Update Status</button>
                      <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white" onClick={() => setInterviewSchedule(activeApplicant)}>Schedule Interview</button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Qualification Match</p>
                    <div className="mt-3 space-y-3 text-sm text-slate-700">
                      <div>
                        <p className="mb-1">Education Match: 95%</p>
                        <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-emerald-600" style={{ width: '95%' }} /></div>
                      </div>
                      <div>
                        <p className="mb-1">Experience Match: 80%</p>
                        <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-blue-600" style={{ width: '80%' }} /></div>
                      </div>
                      <div>
                        <p className="mb-1">Skills Match: 90%</p>
                        <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-violet-600" style={{ width: '90%' }} /></div>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-emerald-700">Strengths: Matches most required competency tags.</p>
                    <p className="mt-1 text-sm text-amber-700">Gaps: Additional certification validation needed.</p>
                  </div>
                </div>
              )}

              {activeTab === 'Documents' && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {activeApplicant.documents.map((doc) => (
                    <article key={`${doc.type}-${doc.url}`} className="rounded-xl border border-slate-200 p-4">
                      <p className="font-semibold text-slate-900">{doc.type}</p>
                      <p className="mt-1 text-xs text-slate-500">Status: {doc.verified ? 'Verified' : 'Submitted'}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
                          onClick={() => handlePreviewDocument(doc.type)}
                          disabled={documentActionBusy !== null}
                        >
                          <Eye className="inline h-4 w-4" /> Preview
                        </button>
                        <button
                          className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
                          onClick={() => handleDownloadDocument(doc.type)}
                          disabled={documentActionBusy !== null}
                        >
                          <Download className="inline h-4 w-4" /> Download
                        </button>
                      </div>
                    </article>
                  ))}
                  <button className="col-span-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium" onClick={handleBulkDownload}>Bulk Download All</button>
                </div>
              )}

              {activeTab === 'Timeline' && (
                <div className="space-y-4">
                  {activeApplicant.timeline.map((entry, index) => (
                    <div key={`${entry.event}-${index}`} className="relative rounded-lg border border-slate-200 px-4 py-3">
                      <div className="absolute left-3 top-5 h-2 w-2 rounded-full bg-blue-600" />
                      <p className="pl-4 font-semibold text-slate-900">{entry.event}</p>
                      <p className="pl-4 text-sm text-slate-600">{formatPHDateTime(entry.date)} by {entry.actor}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'Notes' && (
                <div>
                  <textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Add internal note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} />
                  <button className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white" onClick={addNote}>Save Note</button>
                  <div className="mt-4 space-y-2">
                    {activeApplicant.notes.map((note, index) => (
                      <div key={`${note.date}-${index}`} className="rounded-lg border border-slate-200 p-3">
                        <p className="text-sm text-slate-800">{note.content}</p>
                        <p className="mt-1 text-xs text-slate-500">{note.author} • {formatPHDateTime(note.date)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'Interview' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-900">Interview Scheduling</h3>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p><Calendar className="mr-1 inline h-4 w-4" /> Date & Time: {activeApplicant.interview?.scheduledDate ? formatPHDateTime(activeApplicant.interview.scheduledDate) : 'Not scheduled'}</p>
                      <p><CalendarDays className="mr-1 inline h-4 w-4" /> Type: {activeApplicant.interview?.type ?? 'N/A'}</p>
                      <p><Clock3 className="mr-1 inline h-4 w-4" /> Meeting Link: {activeApplicant.interview?.meetingLink ?? 'N/A'}</p>
                      <button className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white" onClick={() => setInterviewSchedule(activeApplicant)}>Schedule Interview</button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-900">Interview Results</h3>
                    {activeApplicant.interview?.results ? (
                      <div className="mt-3 space-y-1 text-sm text-slate-700">
                        <p>Technical Score: {activeApplicant.interview.results.technicalScore}</p>
                        <p>Cultural Fit Score: {activeApplicant.interview.results.culturalFitScore}</p>
                        <p>Recommendation: {activeApplicant.interview.results.recommendation}</p>
                        <p>Comments: {activeApplicant.interview.results.comments}</p>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">No interview result submitted yet.</p>
                    )}
                  </div>
                </div>
              )}
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
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" onClick={() => navigate('/admin/rsp/new-hired')}>
          <CheckCircle2 className="mr-1 inline h-4 w-4" /> Go To Newly Hired
        </button>
      </div>
    </div>
  );
};
