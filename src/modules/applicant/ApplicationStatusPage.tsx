import { CheckCircle2, Clock, FileSearch, Search, XCircle } from 'lucide-react';
import { useState } from 'react';
import hrisLogo from '../../assets/hris-logo.svg';
import { supabase } from '../../lib/supabase';

interface ApplicationRecord {
  item_number: string;
  first_name: string;
  last_name: string;
  position: string;
  office: string;
  status: string;
  created_at: string;
  application_type: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: JSX.Element; description: string }> = {
  'New Application': {
    label: 'New Application',
    color: '#2563eb',
    icon: <FileSearch size={28} />,
    description: 'Your application has been received and is queued for initial review.',
  },
  'Under Review': {
    label: 'Under Review',
    color: '#d97706',
    icon: <Clock size={28} />,
    description: 'Our HR team is currently reviewing your application and documents.',
  },
  'Shortlisted': {
    label: 'Shortlisted',
    color: '#7c3aed',
    icon: <CheckCircle2 size={28} />,
    description: 'Congratulations! You have been shortlisted for further evaluation.',
  },
  'For Interview': {
    label: 'For Interview',
    color: '#0891b2',
    icon: <CheckCircle2 size={28} />,
    description: 'You have been selected for an interview. Please wait for scheduling details.',
  },
  'Interview Scheduled': {
    label: 'Interview Scheduled',
    color: '#0891b2',
    icon: <CheckCircle2 size={28} />,
    description: 'Your interview has been scheduled. Check your email for details.',
  },
  'Interview Completed': {
    label: 'Interview Completed',
    color: '#059669',
    icon: <CheckCircle2 size={28} />,
    description: 'Your interview has been completed. Results are being processed.',
  },
  'Recommended for Hiring': {
    label: 'Recommended for Hiring',
    color: '#059669',
    icon: <CheckCircle2 size={28} />,
    description: 'You have been recommended for hiring. HR will contact you soon.',
  },
  'Not Qualified': {
    label: 'Not Qualified',
    color: '#dc2626',
    icon: <XCircle size={28} />,
    description: 'Unfortunately, your application did not meet the requirements for this position.',
  },
  'Rejected': {
    label: 'Rejected',
    color: '#dc2626',
    icon: <XCircle size={28} />,
    description: 'Your application was not selected for this position.',
  },
  'Pending': {
    label: 'Pending Review',
    color: '#6b7280',
    icon: <Clock size={28} />,
    description: 'Your application is pending initial review.',
  },
};

const getStatusConfig = (status: string) =>
  STATUS_CONFIG[status] ?? {
    label: status,
    color: '#6b7280',
    icon: <Clock size={28} />,
    description: 'Your application is being processed.',
  };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

export const ApplicationStatusPage = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ApplicationRecord[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Please enter your email address or item number.');
      return;
    }

    setError('');
    setLoading(true);
    setSearched(false);

    try {
      const isItemNumber = /^ITEM-/i.test(trimmed);

      const { data, error: dbError } = await (supabase as any)
        .from('applicants')
        .select('item_number, first_name, last_name, position, office, status, created_at, application_type')
        .eq(isItemNumber ? 'item_number' : 'email', isItemNumber ? trimmed.toUpperCase() : trimmed.toLowerCase())
        .order('created_at', { ascending: false });

      if (dbError) throw new Error(dbError.message);

      setResults(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to look up your application. Please try again.');
      setResults(null);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  return (
    <div className="applicant-shell">
      <header className="applicant-topbar">
        <div className="applicant-brand">
          <img src={hrisLogo} alt="HRIS logo" className="applicant-brand-logo" />
          <div>
            <h1>HRIS Applicant Portal</h1>
            <p>Human Resource Information System</p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '3rem auto', padding: '0 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '0.5rem' }}>
            Track Your Application
          </h2>
          <p style={{ color: '#6b7280' }}>
            Enter your email address or application item number to check your status.
          </p>
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setError(''); }}
            placeholder="Email address or ITEM-2026-XXXX"
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: '1.5px solid #d1d5db',
              borderRadius: 8,
              fontSize: '0.95rem',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.75rem 1.25rem',
              background: '#1e3a5f',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <Search size={18} />
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {searched && results !== null && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
            <FileSearch size={48} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
            <p style={{ fontWeight: 600 }}>No application found</p>
            <p style={{ fontSize: '0.9rem' }}>Double-check your email or item number and try again.</p>
          </div>
        )}

        {results && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {results.map((record) => {
              const cfg = getStatusConfig(record.status);
              return (
                <div
                  key={record.item_number}
                  style={{
                    background: '#fff',
                    border: '1.5px solid #e5e7eb',
                    borderLeft: `5px solid ${cfg.color}`,
                    borderRadius: 10,
                    padding: '1.25rem 1.5rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e3a5f', margin: 0 }}>
                        {record.first_name} {record.last_name}
                      </p>
                      <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.2rem 0 0' }}>
                        {record.position} &mdash; {record.office}
                      </p>
                    </div>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.25rem 0.625rem',
                      borderRadius: 999,
                      background: `${cfg.color}15`,
                      color: cfg.color,
                      whiteSpace: 'nowrap',
                    }}>
                      {record.application_type === 'promotion' ? 'Promotional' : 'Job Application'}
                    </span>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    background: `${cfg.color}0d`,
                    border: `1px solid ${cfg.color}30`,
                    borderRadius: 8,
                    padding: '0.75rem 1rem',
                    marginBottom: '0.75rem',
                  }}>
                    <span style={{ color: cfg.color, flexShrink: 0 }}>{cfg.icon}</span>
                    <div>
                      <p style={{ fontWeight: 700, color: cfg.color, margin: 0, fontSize: '0.95rem' }}>{cfg.label}</p>
                      <p style={{ color: '#374151', margin: '0.2rem 0 0', fontSize: '0.875rem' }}>{cfg.description}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#9ca3af' }}>
                    <span>Item No: <strong style={{ color: '#1e3a5f' }}>{record.item_number}</strong></span>
                    <span>Submitted: {formatDate(record.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
          <a href="/" style={{ color: '#1e3a5f', fontSize: '0.9rem', textDecoration: 'none', fontWeight: 600 }}>
            ← Back to Applicant Portal
          </a>
        </div>
      </main>
    </div>
  );
};
