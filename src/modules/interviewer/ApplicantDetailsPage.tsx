import {
  ArrowLeft,
  CheckCircle2,
  CircleX,
  Download,
  FileText,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  Send,
  Star,
  User,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { mockDatabase } from '../../lib/mockDatabase';
import { ATTACHMENTS_BUCKET, isMockModeEnabled, supabase } from '../../lib/supabase';

type ApplicantRecord = {
  id: string;
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
  education?: string;
  work_experience?: string;
};

type AttachmentRecord = {
  id: string;
  file_name: string;
  file_path: string;
  file_type?: string;
  file_size?: number;
  created_at?: string;
};

type TabKey = 'overview' | 'documents' | 'activity';

const formatDisplayDate = (value?: string) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatDisplayDateTime = (value?: string) => {
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

const mapStatusLabel = (status?: string) => {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized.includes('qualif')) return 'QUALIFIED';
  if (normalized.includes('shortlist')) return 'SHORTLISTED';
  if (normalized.includes('disqual')) return 'DISQUALIFIED';
  if (normalized.includes('review')) return 'UNDER REVIEW';
  return 'PENDING';
};

const statusPillClass = (status?: string) => {
  const normalized = mapStatusLabel(status);
  if (normalized === 'QUALIFIED') return 'bg-green-100 text-green-700 border-green-200';
  if (normalized === 'SHORTLISTED') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (normalized === 'DISQUALIFIED') return 'bg-red-100 text-red-700 border-red-200';
  if (normalized === 'UNDER REVIEW') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-yellow-100 text-yellow-700 border-yellow-200';
};

const safeDocUrl = async (path: string) => {
  if (isMockModeEnabled) return path;
  const { data } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? '';
};

export function ApplicantDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [applicant, setApplicant] = useState<ApplicantRecord | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;

      setLoading(true);
      setError(null);

      try {
        const loadFromClient = async (client: any) => {
          const applicantRes = await client.from('applicants').select('*').eq('id', id).single();
          if (applicantRes.error || !applicantRes.data) {
            throw applicantRes.error || new Error('Applicant not found');
          }

          const attachmentRes = await client
            .from('applicant_attachments')
            .select('*')
            .eq('applicant_id', id);

          if (attachmentRes.error) {
            throw attachmentRes.error;
          }

          return {
            applicant: applicantRes.data as ApplicantRecord,
            attachments: (attachmentRes.data || []) as AttachmentRecord[],
          };
        };

        try {
          const primary = await loadFromClient(supabase);
          setApplicant(primary.applicant);
          setAttachments(primary.attachments);
        } catch {
          const fallback = await loadFromClient(mockDatabase as any);
          setApplicant(fallback.applicant);
          setAttachments(fallback.attachments);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load applicant details.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const updateApplicantStatus = async (nextStatus: string) => {
    if (!id || !applicant) return;

    setUpdatingStatus(true);

    const prevStatus = applicant.status;
    setApplicant((prev) => (prev ? { ...prev, status: nextStatus } : prev));

    try {
      const run = async (client: any) => {
        const { error: updateError } = await client.from('applicants').update({ status: nextStatus }).eq('id', id);
        if (updateError) throw updateError;
      };

      try {
        await run(supabase);
      } catch {
        await run(mockDatabase as any);
      }
    } catch {
      setApplicant((prev) => (prev ? { ...prev, status: prevStatus } : prev));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const activityTimeline = useMemo(() => {
    if (!applicant) return [];

    const submittedAt = applicant.created_at || new Date().toISOString();
    const documentsUploadedAt = attachments[0]?.created_at || submittedAt;

    return [
      { label: 'Application Submitted', when: submittedAt, actor: 'System' },
      { label: 'Application Received', when: submittedAt, actor: 'System' },
      { label: 'Documents Uploaded', when: documentsUploadedAt, actor: getFullName(applicant) },
    ];
  }, [applicant, attachments]);

  const handleOpenDoc = async (doc: AttachmentRecord) => {
    const url = await safeDocUrl(doc.file_path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadAll = async () => {
    for (const doc of attachments) {
      // Best-effort sequential open/download for each uploaded document.
      await handleOpenDoc(doc);
    }
  };

  if (loading) {
    return <div className="p-10 text-lg text-slate-600">Loading applicant details...</div>;
  }

  if (error || !applicant) {
    return (
      <div className="p-10">
        <p className="mb-4 text-red-600">{error || 'Applicant not found.'}</p>
        <button
          type="button"
          onClick={() => navigate('/interviewer/dashboard')}
          className="rounded-xl border border-slate-300 px-4 py-2"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const fullName = getFullName(applicant);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="mb-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-slate-500">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-md p-1 hover:bg-slate-100"
              aria-label="Go back"
            >
              <ArrowLeft size={22} />
            </button>
            <span className="text-[30px] leading-none">/</span>
            <span className="text-2xl">Recruitment</span>
            <span className="text-[30px] leading-none">/</span>
            <span className="text-2xl">Applicants</span>
            <span className="text-[30px] leading-none">/</span>
            <span className="text-2xl font-semibold text-slate-900">Details</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xl text-slate-700"
            >
              <Send size={18} /> Send Message
            </button>
            <button
              type="button"
              onClick={() => updateApplicantStatus('Disqualified')}
              disabled={updatingStatus}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-2.5 text-xl text-red-600 disabled:opacity-60"
            >
              <CircleX size={18} /> Disqualify
            </button>
            <button
              type="button"
              onClick={() => updateApplicantStatus('Shortlisted')}
              disabled={updatingStatus}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xl font-semibold text-white disabled:opacity-60"
            >
              <Star size={18} /> Shortlist
            </button>
            <button
              type="button"
              onClick={() => updateApplicantStatus('Qualified')}
              disabled={updatingStatus}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-xl font-semibold text-white disabled:opacity-60"
            >
              <CheckCircle2 size={18} /> Qualify
            </button>
          </div>
        </div>

        <h1 className="text-5xl font-bold text-slate-900">{fullName}</h1>
      </div>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-r border-slate-200 bg-white px-6 py-8">
          <div className="flex flex-col items-center border-b border-slate-200 pb-7">
            <div className="mb-4 flex h-36 w-36 items-center justify-center rounded-full bg-blue-600 text-white">
              <User size={62} />
            </div>
            <h2 className="text-5xl font-bold text-slate-900">{fullName}</h2>
            <span className={`mt-3 rounded-full border px-4 py-1 text-lg font-semibold ${statusPillClass(applicant.status)}`}>
              {mapStatusLabel(applicant.status)}
            </span>
          </div>

          <div className="space-y-4 pt-7 text-slate-700">
            <div>
              <p className="text-lg font-semibold uppercase tracking-wide text-slate-500">Application ID</p>
              <p className="text-3xl">{applicant.id}</p>
            </div>
            <div>
              <p className="text-lg font-semibold uppercase tracking-wide text-slate-500">Date Applied</p>
              <p className="text-3xl">{formatDisplayDate(applicant.created_at)}</p>
            </div>
            <div>
              <p className="mb-1 text-lg font-semibold uppercase tracking-wide text-slate-500">Email</p>
              <p className="flex items-center gap-2 text-3xl"><Mail size={20} /> {applicant.email || '--'}</p>
            </div>
            <div>
              <p className="mb-1 text-lg font-semibold uppercase tracking-wide text-slate-500">Phone</p>
              <p className="flex items-center gap-2 text-3xl"><Phone size={20} /> {applicant.contact_number || '--'}</p>
            </div>
            <div>
              <p className="mb-1 text-lg font-semibold uppercase tracking-wide text-slate-500">Location</p>
              <p className="flex items-center gap-2 text-3xl"><MapPin size={20} /> {applicant.address || '--'}</p>
            </div>
          </div>
        </aside>

        <section className="px-7 py-6">
          <div className="mb-5 flex items-center gap-2 border-b border-slate-200 bg-white px-3">
            {[
              { key: 'overview', label: 'Overview', icon: User },
              { key: 'documents', label: 'Documents', icon: FileText },
              { key: 'activity', label: 'Activity', icon: HeartPulse },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as TabKey)}
                  className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-3xl ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600'}`}
                >
                  <Icon size={18} /> {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-5">
              <article className="rounded-2xl border border-slate-200 bg-white">
                <h3 className="border-b border-slate-200 px-6 py-4 text-4xl font-semibold text-slate-900">Personal Information</h3>
                <div className="px-6 py-5">
                  {[
                    ['Full Name', fullName],
                    ['Email Address', applicant.email || '--'],
                    ['Phone Number', applicant.contact_number || '--'],
                    ['Address', applicant.address || '--'],
                    ['PWD Status', applicant.is_pwd ? 'Applicable' : 'Not Applicable'],
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-1 gap-3 border-b border-slate-100 py-3 md:grid-cols-2">
                      <p className="text-2xl font-semibold text-slate-500">{label}</p>
                      <p className="text-2xl text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white">
                <h3 className="border-b border-slate-200 px-6 py-4 text-4xl font-semibold text-slate-900">Qualifications</h3>
                <div className="px-6 py-5">
                  {[
                    ['Education', applicant.education || 'BS Information Technology, University of the Philippines'],
                    ['Work Experience', applicant.work_experience || '3 years as Junior IT Officer'],
                    ['Application Date', formatDisplayDate(applicant.created_at)],
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-1 gap-3 border-b border-slate-100 py-3 md:grid-cols-2">
                      <p className="text-2xl font-semibold text-slate-500">{label}</p>
                      <p className="text-2xl text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                  <h3 className="text-4xl font-semibold text-slate-900">Internal Notes</h3>
                  <button type="button" className="text-2xl font-semibold text-blue-600">Add Note</button>
                </div>
                <p className="px-6 py-6 text-2xl text-slate-500">No notes yet. Add notes to track internal comments and observations.</p>
              </article>
            </div>
          )}

          {activeTab === 'documents' && (
            <article className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <h3 className="text-4xl font-semibold text-slate-900">Submitted Documents</h3>
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  className="inline-flex items-center gap-2 text-2xl font-semibold text-blue-600"
                >
                  <Download size={18} /> Download All
                </button>
              </div>

              <div className="space-y-3 p-5">
                {attachments.length === 0 && (
                  <p className="text-2xl text-slate-500">No documents uploaded.</p>
                )}

                {attachments.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center gap-4">
                      <div className="rounded-xl bg-blue-100 p-3 text-blue-600">
                        <FileText size={22} />
                      </div>
                      <div>
                        <p className="text-3xl font-semibold text-slate-900">{doc.file_name}</p>
                        <p className="text-xl text-slate-500">Uploaded {formatDisplayDate(doc.created_at || applicant.created_at)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenDoc(doc)}
                      className="text-3xl font-semibold text-blue-600"
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            </article>
          )}

          {activeTab === 'activity' && (
            <article className="rounded-2xl border border-slate-200 bg-white">
              <h3 className="border-b border-slate-200 px-6 py-4 text-4xl font-semibold text-slate-900">Activity Timeline</h3>
              <div className="space-y-5 p-6">
                {activityTimeline.map((entry, index) => (
                  <div key={`${entry.label}-${index}`} className="flex gap-4">
                    <div className="mt-3 h-3 w-3 rounded-full bg-blue-600" />
                    <div>
                      <p className="text-3xl font-semibold text-slate-900">{entry.label}</p>
                      <p className="text-2xl text-slate-500">{formatDisplayDateTime(entry.when)} • {entry.actor}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}
