import { CheckCircle2, FileText, Mail, Search } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

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
}

interface AttachmentRow {
  id: string;
  file_name: string;
  document_type: string | null;
  created_at: string;
}

type BadgeTone = 'approved' | 'in-review' | 'rejected' | 'new';

const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  'New Application':         { label: 'New',         tone: 'new' },
  'Pending':                 { label: 'New',         tone: 'new' },
  'Under Review':            { label: 'In Review',   tone: 'in-review' },
  'Shortlisted':             { label: 'In Review',   tone: 'in-review' },
  'For Interview':           { label: 'In Review',   tone: 'in-review' },
  'Interview Scheduled':     { label: 'In Review',   tone: 'in-review' },
  'Interview Completed':     { label: 'In Review',   tone: 'in-review' },
  'Recommended for Hiring':  { label: 'Approved',    tone: 'approved' },
  'Hired':                   { label: 'Approved',    tone: 'approved' },
  'Accepted':                { label: 'Approved',    tone: 'approved' },
  'Not Qualified':           { label: 'Rejected',    tone: 'rejected' },
  'Rejected':                { label: 'Rejected',    tone: 'rejected' },
  'Disqualified':            { label: 'Rejected',    tone: 'rejected' },
};

const BADGE_CLASS: Record<BadgeTone, string> = {
  approved:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'in-review': 'bg-blue-50 text-blue-700 border border-blue-200',
  rejected:    'bg-rose-50 text-rose-700 border border-rose-200',
  new:         'bg-amber-50 text-amber-700 border border-amber-200',
};

const NOTICE_CLASS: Record<BadgeTone, string> = {
  approved:    'bg-emerald-50 border-emerald-200 text-emerald-800',
  'in-review': 'bg-blue-50 border-blue-200 text-blue-800',
  rejected:    'bg-rose-50 border-rose-200 text-rose-800',
  new:         'bg-amber-50 border-amber-200 text-amber-800',
};

const NOTICE_MESSAGE: Record<BadgeTone, string> = {
  approved:    'Congratulations! Your application has been approved. You will receive an official notice via email within 3–5 business days.',
  'in-review': 'Your application is currently being reviewed. We will notify you by email once a decision is reached.',
  rejected:    'We regret to inform you that your application was not selected for this position. Thank you for your interest.',
  new:         'Your application has been received. We will begin reviewing it shortly.',
};

const TIMELINE_STAGES = [
  { key: 'submitted',     title: 'Application Submitted',  subtitle: 'Your application has been received' },
  { key: 'verification',  title: 'Document Verification',  subtitle: 'Verifying submitted documents and credentials' },
  { key: 'qualifications', title: 'Qualifications Assessment', subtitle: 'Reviewing educational background and experience' },
  { key: 'committee',     title: 'Committee Review',       subtitle: 'Application reviewed by admissions committee' },
  { key: 'final',         title: 'Final Decision',         subtitle: 'Final decision on application' },
] as const;

type StageState = 'done' | 'current' | 'pending' | 'rejected';

const stageStatesForStatus = (rawStatus: string): StageState[] => {
  const status = rawStatus.toLowerCase();

  if (status.includes('reject') || status.includes('not qualified') || status.includes('disqual')) {
    return ['done', 'done', 'done', 'done', 'rejected'];
  }
  if (status.includes('hired') || status.includes('accept')) {
    return ['done', 'done', 'done', 'done', 'done'];
  }
  if (status.includes('recommend')) {
    return ['done', 'done', 'done', 'done', 'current'];
  }
  if (status.includes('interview completed')) {
    return ['done', 'done', 'done', 'current', 'pending'];
  }
  if (status.includes('interview')) {
    return ['done', 'done', 'done', 'current', 'pending'];
  }
  if (status.includes('shortlist')) {
    return ['done', 'done', 'current', 'pending', 'pending'];
  }
  if (status.includes('under review') || status.includes('reviewing')) {
    return ['done', 'current', 'pending', 'pending', 'pending'];
  }
  return ['done', 'pending', 'pending', 'pending', 'pending'];
};

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatShortDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getBadge = (status: string) =>
  STATUS_BADGE[status] ?? { label: status || 'Pending', tone: 'new' as BadgeTone };

export const ApplicationStatusPage = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<ApplicationRecord | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

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
      };

      setRecord(mapped);

      // Pull submitted documents — table may not exist on every install, so
      // a failure here shouldn't break the page.
      try {
        const { data: attachData, error: attachErr } = await (supabase as any)
          .from('applicant_attachments')
          .select('id, file_name, document_type, created_at')
          .eq('applicant_id', mapped.id)
          .order('created_at', { ascending: false });

        if (!attachErr && Array.isArray(attachData)) {
          setAttachments(attachData as AttachmentRow[]);
        }
      } catch {
        // Silently ignore — documents section will just render empty.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to look up your application. Please try again.');
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  const badge = record ? getBadge(record.status) : null;
  const stageStates = record ? stageStatesForStatus(record.status) : [];
  const fullName = record ? `${record.first_name} ${record.last_name}`.trim() : '';
  const programType =
    record?.application_type === 'promotion' ? 'Promotional Application' : 'Job Application';

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
              style={{
                backgroundColor: '#C8D1FF',
                color: '#040E6B',
              }}
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: '#363EE8'
              }}
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
            {/* Application Details */}
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold" style={{ color: '#040E6B' }}>Application Details</h3>
                  <p className="mt-1 text-sm" style={{ color: '#363EE8' }}>{record.item_number || '—'}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${BADGE_CLASS[badge.tone]}`}>
                  {badge.tone === 'approved' && <CheckCircle2 size={14} />}
                  {badge.label}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
                {/* Applicant Information */}
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

                {/* Application Information */}
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

            {/* Application Progress */}
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h3 className="text-xl font-bold" style={{ color: '#040E6B' }}>Application Progress</h3>
              <p className="mt-1 text-sm" style={{ color: '#363EE8' }}>Track your application through each stage</p>

              <ol className="mt-6">
                {TIMELINE_STAGES.map((stage, index) => {
                  const state = stageStates[index] ?? 'pending';
                  const isLast = index === TIMELINE_STAGES.length - 1;

                  const iconWrap =
                    state === 'done'      ? 'bg-emerald-100 text-emerald-600' :
                    state === 'current'   ? 'text-white' :
                    state === 'rejected'  ? 'bg-rose-100 text-rose-600' :
                                            'text-slate-400';

                  const currentBg = state === 'current' ? { backgroundColor: '#363EE8' } : {};

                  const titleClass =
                    state === 'pending' ? 'text-slate-400' : '';

                  const titleStyle = state === 'pending' ? { color: '#C8D1FF' } : { color: '#040E6B' };

                  const dateForStage =
                    state === 'done' || state === 'current' || state === 'rejected'
                      ? (index === 0 ? formatShortDate(record.created_at) : formatShortDate(record.updated_at))
                      : '';

                  return (
                    <li key={stage.key} className="relative flex gap-4 pb-6 last:pb-0">
                      {/* Connector */}
                      {!isLast && (
                        <span
                          className={`absolute left-[18px] top-9 h-[calc(100%-2rem)] w-px ${
                            state === 'done' ? 'bg-emerald-200' : 'bg-slate-200'
                          }`}
                          aria-hidden="true"
                        />
                      )}

                      {/* Icon */}
                      <span className={`relative z-[1] flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${iconWrap}`} style={currentBg}>
                        {state === 'rejected'
                          ? <span className="text-base font-bold">×</span>
                          : <CheckCircle2 size={18} />}
                      </span>

                      {/* Content */}
                      <div className="flex-1 pt-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h4 className={`text-base font-semibold ${titleClass}`} style={titleStyle}>{stage.title}</h4>
                          {dateForStage && (
                            <span className="text-xs font-medium" style={{ color: '#363EE8' }}>{dateForStage}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm" style={{ color: '#363EE8' }}>{stage.subtitle}</p>

                        {/* Inline detail boxes for done stages */}
                        {state === 'done' && stage.key === 'verification' && (
                          <div className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: '#C8D1FF', color: '#040E6B' }}>
                            All required documents received
                          </div>
                        )}
                        {state === 'done' && stage.key === 'committee' && badge.tone === 'approved' && (
                          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                            Recommended for admission
                          </div>
                        )}
                        {state === 'rejected' && (
                          <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            Application not selected
                          </div>
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
                {attachments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm" style={{ backgroundColor: '#C8D1FF', color: '#040E6B' }}>
                    No documents on file for this application.
                  </div>
                ) : (
                  attachments.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: '#363EE8' }}>
                          <FileText size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" style={{ color: '#040E6B' }}>
                            {doc.document_type || doc.file_name || 'Document'}
                          </p>
                          {doc.document_type && doc.file_name && (
                            <p className="truncate text-xs" style={{ color: '#363EE8' }}>{doc.file_name}</p>
                          )}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={12} />
                        Verified
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Important Notice */}
            <section className={`mt-6 rounded-2xl border px-6 py-5 ${NOTICE_CLASS[badge.tone]}`}>
              <div className="flex items-start gap-3">
                <Mail size={20} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold" style={{ color: '#040E6B' }}>Important Notice</p>
                  <p className="mt-1 text-sm" style={{ color: '#040E6B' }}>{NOTICE_MESSAGE[badge.tone]}</p>
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
              // Open Gmail's compose window directly (works in any browser
              // even when no native mail client is configured). Falls back
              // gracefully on right-click → "Copy email address".
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
