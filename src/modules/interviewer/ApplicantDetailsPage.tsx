import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Download,
  Eye,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  User,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sidebar } from '../../components/Sidebar';
import { mockDatabase } from '../../lib/mockDatabase';
import { ATTACHMENTS_BUCKET, isMockModeEnabled, supabase } from '../../lib/supabase';

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

const normalizeText = (value: string) => String(value ?? '').trim().toLowerCase();

const statusBadge = (status?: string) => {
  const normalized = normalizeText(status ?? '');
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

export function ApplicantDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showScoresModal, setShowScoresModal] = useState(false);
  const [notes, setNotes] = useState('');

  const [applicant, setApplicant] = useState<ApplicantRecord | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationRecord | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);

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
        setAttachments(primary.attachments);
        setEvaluation(primary.evaluation);
      } catch {
        const fallback = await loadFromClient(mockDatabase as any);
        setApplicant(fallback.applicant);
        setAttachments(fallback.attachments);
        setEvaluation(fallback.evaluation);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const fullName = useMemo(() => (applicant ? getFullName(applicant) : ''), [applicant]);
  const badge = statusBadge(applicant?.status);
  const score = useMemo(() => computeScoreBreakdown(evaluation), [evaluation]);

  if (loading) {
    return <div className="p-8 text-slate-600">Loading applicant details...</div>;
  }

  if (!applicant) {
    return <div className="p-8 text-red-600">Applicant not found.</div>;
  }

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />

      <main className="admin-content bg-slate-100 !p-0">
        <header className="border-b border-slate-200 bg-white px-8 py-5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="text-sm text-slate-500">
              <span className="text-blue-700">RSP</span> / <span className="text-blue-700 font-semibold">Qualified Applicants</span> /{' '}
              <span className="text-slate-800">{fullName}</span>
            </div>

            <button
              type="button"
              onClick={() => setShowScoresModal(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-6 py-2.5 text-base font-semibold text-slate-700 shadow-sm"
            >
              <Eye size={20} /> View Scores
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/admin/rsp/qualified')}
              className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-4xl font-bold text-slate-900">{fullName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xl text-slate-600">
                <span>{applicant.position || 'Position Unassigned'}</span>
                <span className="text-slate-400">•</span>
                <span>{applicant.office || 'Department Unassigned'}</span>
                <span className="text-slate-400">•</span>
                <span>{applicant.item_number || 'Item N/A'}</span>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">{score.adjective}</span>
              </div>
            </div>
            <span className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${badge.className}`}>{badge.label}</span>
          </div>
        </header>

        <section className="px-8 py-6">
          <article className="mb-6 rounded-2xl bg-blue-700 px-6 py-5 text-white shadow">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
              <div>
                <p className="text-sm text-blue-100">Total Score</p>
                <p className="text-4xl font-bold">{score.total}</p>
                <p className="text-sm text-blue-100">out of 100</p>
              </div>
              <div>
                <p className="text-sm text-blue-100">Education</p>
                <p className="text-4xl font-bold">{score.education}</p>
                <p className="text-sm text-blue-100">/ 20</p>
              </div>
              <div>
                <p className="text-sm text-blue-100">Experience</p>
                <p className="text-4xl font-bold">{score.experience}</p>
                <p className="text-sm text-blue-100">/ 20</p>
              </div>
              <div>
                <p className="text-sm text-blue-100">Performance</p>
                <p className="text-4xl font-bold">{score.performance}</p>
                <p className="text-sm text-blue-100">/ 20</p>
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="grid grid-cols-2 border-b border-slate-200 md:grid-cols-4">
              {[
                { key: 'overview', label: 'Overview', icon: User },
                { key: 'qualifications', label: 'Qualifications', icon: BookOpen },
                { key: 'documents', label: 'Documents', icon: FileText },
                { key: 'interview', label: 'Interview Process', icon: MessageSquare },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as TabKey)}
                    className={`inline-flex items-center justify-center gap-2 px-4 py-4 text-lg font-semibold ${active ? 'border-b-4 border-blue-600 bg-slate-100 text-blue-700' : 'text-slate-600'}`}
                  >
                    <Icon size={20} /> {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="p-6">
              {activeTab === 'overview' && (
                <section>
                  <h2 className="mb-5 text-3xl font-semibold text-slate-900">Personal Information</h2>
                  <div className="grid grid-cols-1 gap-y-6 md:grid-cols-2 md:gap-x-10">
                    <div>
                      <p className="text-sm font-semibold uppercase text-slate-500">Full Name</p>
                      <p className="text-2xl text-slate-900">{fullName}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase text-slate-500">Position Applied For</p>
                      <p className="text-2xl text-slate-900">{applicant.position || '--'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase text-slate-500">Email Address</p>
                      <p className="inline-flex items-center gap-2 text-2xl text-slate-900"><Mail size={18} /> {applicant.email || '--'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase text-slate-500">Contact Number</p>
                      <p className="inline-flex items-center gap-2 text-2xl text-slate-900"><Phone size={18} /> {applicant.contact_number || '--'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase text-slate-500">Item Number</p>
                      <p className="text-2xl text-slate-900">{applicant.item_number || '--'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase text-slate-500">Address</p>
                      <p className="text-2xl text-slate-900">{applicant.address || '--'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase text-slate-500">Date Submitted</p>
                      <p className="inline-flex items-center gap-2 text-2xl text-slate-900"><Calendar size={18} /> {formatDate(applicant.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase text-slate-500">PWD Status</p>
                      <p className="text-2xl text-slate-900">{applicant.is_pwd ? 'PWD' : 'Not PWD'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase text-slate-500">Date Qualified</p>
                      <p className="inline-flex items-center gap-2 text-2xl text-slate-900"><Calendar size={18} /> {formatDate(evaluation?.updated_at || evaluation?.created_at)}</p>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'qualifications' && (
                <section>
                  <h2 className="mb-5 text-3xl font-semibold text-slate-900">Educational & Professional Background</h2>

                  <div className="mb-6 space-y-5 border-b border-slate-200 pb-6">
                    <div className="border-l-4 border-blue-600 pl-4">
                      <p className="text-lg font-semibold uppercase text-slate-600">Education</p>
                      <p className="text-2xl text-slate-900">BS Information Technology, University of the Philippines</p>
                    </div>
                    <div className="border-l-4 border-green-600 pl-4">
                      <p className="text-lg font-semibold uppercase text-slate-600">Work Experience</p>
                      <p className="text-2xl text-slate-900">3 years as Junior IT Officer</p>
                    </div>
                  </div>

                  <h3 className="mb-4 text-2xl font-semibold text-slate-700">Evaluation Scores</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {[
                      { label: 'Education', value: score.education, color: 'bg-blue-50 border-blue-200 text-blue-700' },
                      { label: 'Experience', value: score.experience, color: 'bg-green-50 border-green-200 text-green-700' },
                      { label: 'Performance', value: score.performance, color: 'bg-purple-50 border-purple-200 text-purple-700' },
                      { label: 'PCPT Score', value: score.pcpt, color: 'bg-orange-50 border-orange-200 text-orange-700' },
                    ].map((item) => (
                      <div key={item.label} className={`rounded-2xl border p-4 ${item.color}`}>
                        <div className="mb-3 flex items-center justify-between text-xl font-semibold">
                          <p>{item.label}</p>
                          <p>{item.value}/20</p>
                        </div>
                        <div className="h-3 rounded-full bg-white/70">
                          <div className="h-3 rounded-full bg-current" style={{ width: `${(item.value / 20) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === 'documents' && (
                <section>
                  <h2 className="mb-5 text-3xl font-semibold text-slate-900">Submitted Documents</h2>
                  <div className="space-y-3">
                    {attachments.length === 0 && <p className="text-base text-slate-500">No uploaded documents found.</p>}
                    {attachments.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                        <div>
                          <p className="text-xl font-semibold text-slate-900">{doc.file_name}</p>
                          <p className="text-sm text-slate-500">Uploaded on {formatDate(doc.created_at || applicant.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <button type="button" onClick={() => openDocument(doc.file_path)} className="text-base font-semibold text-blue-700">View</button>
                          <button type="button" onClick={() => openDocument(doc.file_path)} className="text-slate-500"><Download size={20} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === 'interview' && (
                <section>
                  <h2 className="mb-5 text-3xl font-semibold text-slate-900">Interview Scheduling & Communication</h2>

                  <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xl font-semibold text-emerald-800">Qualified for Interview</p>
                    <p className="mt-1 text-base text-emerald-700">
                      This applicant is qualified and ready for interview. You can schedule and send interview invitations directly.
                    </p>
                  </div>

                  <h3 className="mb-3 text-2xl font-semibold text-slate-800">Send Interview Invitation</h3>
                  <ul className="mb-4 list-disc space-y-2 pl-7 text-lg text-slate-700">
                    <li>Interview date, time, and venue</li>
                    <li>Required documents to bring</li>
                    <li>Interview panel details and format</li>
                    <li>Missing document requests</li>
                    <li>Application status updates</li>
                  </ul>

                  <button type="button" className="mb-6 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white">
                    <Mail size={22} /> Send Message to Applicant
                  </button>

                  <div className="border-t border-slate-200 pt-6">
                    <h3 className="mb-2 text-2xl font-semibold text-slate-800">Internal Notes & Remarks</h3>
                    <p className="mb-3 text-base text-slate-600">
                      Add private notes about this applicant. These notes are only visible to RSP staff and will not be shared with the applicant.
                    </p>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Add internal notes, observations, or interview feedback here..."
                      className="min-h-40 w-full rounded-2xl border border-slate-300 p-4 text-base"
                    />
                    <button type="button" className="mt-4 rounded-2xl bg-slate-900 px-6 py-3 text-base font-semibold text-white">
                      Save Internal Notes
                    </button>
                  </div>
                </section>
              )}
            </div>
          </article>
        </section>
      </main>

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
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
                <p className="text-xl font-semibold text-emerald-800">Score Finalized - View Only Mode</p>
                <p className="text-base text-emerald-700">
                  This applicant's evaluation has been finalized and submitted. All fields are read-only and cannot be edited.
                </p>
              </div>

              <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <p className="mb-3 text-xl font-semibold text-slate-800">Select Appointment Type</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border-2 border-blue-400 bg-white p-4 text-center">
                    <p className="text-xl font-semibold text-blue-700">Original Appointment</p>
                    <p className="text-base text-slate-500">Education • Experience • Written Exam* • PCPT*</p>
                    <p className="text-sm text-slate-500">*Interviewer-provided</p>
                  </div>
                  <div className="rounded-2xl border border-slate-300 bg-slate-100 p-4 text-center">
                    <p className="text-xl font-semibold text-slate-500">Promotional Appointment</p>
                    <p className="text-base text-slate-500">Education • Experience • Performance • PCPT* • Potential</p>
                    <p className="text-sm text-slate-500">*Interviewer-provided</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-lg text-slate-600">Final Numerical Score</p>
                    <p className="text-4xl font-bold text-slate-900">{score.total.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg text-slate-600">Adjectival Rating</p>
                    <p className="text-4xl font-bold text-emerald-700">{score.adjective}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-base text-amber-900">
                <p className="font-semibold">Scoring Responsibility:</p>
                <p><strong>RSP enters:</strong> Education, Experience, Written Examination</p>
                <p><strong>Interviewer provides:</strong> PCPT, Oral Examination</p>
              </section>

              <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xl font-semibold text-slate-800">I Education (20%)</p>
                  <input readOnly value={score.education > 0 ? 'Bachelor Degree' : 'Select Educational Attainment'} className="w-full rounded-xl border border-slate-300 p-3 text-base" />
                  <p className="mt-2 text-base text-slate-600">Score: <span className="font-semibold text-blue-700">{score.education}</span></p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xl font-semibold text-slate-800">II Experience (20%)</p>
                  <input readOnly value={score.experience > 0 ? '3' : ''} placeholder="Enter years of experience" className="w-full rounded-xl border border-slate-300 p-3 text-base" />
                  <p className="mt-2 text-base text-slate-600">Score: <span className="font-semibold text-blue-700">{score.experience}</span></p>
                </div>
                <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                  <p className="mb-2 text-xl font-semibold text-slate-800">III Written Examination (20%)</p>
                  <input readOnly value={score.written > 0 ? `${score.written}` : ''} placeholder="Enter score (0-30)" className="w-full rounded-xl border border-slate-300 p-3 text-base" />
                  <p className="mt-2 text-base text-slate-600">Score: <span className="font-semibold text-green-700">{score.written}</span></p>
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
                    <p className="mb-2 text-xl font-semibold text-slate-800">IV Oral Examination (20%)</p>
                    <div className="rounded-xl border border-blue-300 bg-blue-50 p-3 text-base text-slate-700">
                      <span className="font-semibold">Raw Score:</span>{' '}
                      <span className="float-right text-blue-700">{score.oral > 0 ? `${score.oral}/20` : 'Pending Interview'}</span>
                    </div>
                    <p className="mt-2 text-base font-semibold text-blue-700">Converted Score: {score.oral} / 20</p>
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
                <button type="button" className="rounded-2xl bg-blue-600 px-8 py-3 text-base font-semibold text-white">
                  Save Evaluation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
