import { useEffect, useState } from 'react';
import { AlertCircle, Check, Copy, KeyRound, ShieldCheck, Users } from 'lucide-react';
import { AdminHeader } from '../../components/AdminHeader';
import { Dialog } from '../../components/Dialog';
import { Sidebar } from '../../components/Sidebar';
import {
  type ResetMode,
  type Supervisor,
  getSupervisors,
  resetSupervisorPassword,
} from '../../lib/api/supervisors';
import '../../styles/admin.css';

const ADMIN_SESSION_KEY = 'cictrix_admin_session';

const getCurrentAdminEmail = (): string => {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return 'super-admin';
    const parsed = JSON.parse(raw) as { email?: string };
    return parsed?.email || 'super-admin';
  } catch {
    return 'super-admin';
  }
};

export const SupervisorAccessPage = () => {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [banner, setBanner] = useState('');

  // Reset flow state.
  const [target, setTarget] = useState<Supervisor | null>(null);
  const [resetMode, setResetMode] = useState<ResetMode>('temporary');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadSupervisors = async () => {
    setLoading(true);
    setLoadError('');
    const result = await getSupervisors();
    if (result.ok) {
      setSupervisors(result.data);
    } else if ('error' in result) {
      setLoadError(result.error);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadSupervisors();
  }, []);

  const openResetDialog = (supervisor: Supervisor) => {
    setTarget(supervisor);
    setResetMode('temporary');
    setResetResult(null);
    setCopied(false);
  };

  const closeDialog = () => {
    setTarget(null);
    setResetResult(null);
    setResetting(false);
    setCopied(false);
  };

  const handleConfirmReset = async () => {
    if (!target) return;
    setResetting(true);
    const result = await resetSupervisorPassword({
      supervisor: { id: target.id, username: target.username },
      mode: resetMode,
      resetBy: getCurrentAdminEmail(),
    });
    setResetting(false);

    if (!result.ok) {
      setBanner('');
      setLoadError('error' in result ? result.error : 'Failed to reset the password.');
      setTarget(null);
      return;
    }

    setResetResult({ username: target.username, password: result.password });
    setBanner(`✓ Password reset for ${target.full_name}. They must change it on next login.`);
    setTimeout(() => setBanner(''), 6000);
    // Refresh so the "temporary password" badge appears.
    void loadSupervisors();
  };

  const handleCopy = async () => {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(resetResult.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="Super Admin" divisionLabel="System Administrator" />
      <div className="admin-layout">
        <Sidebar activeModule="Super" userRole="super-admin" />
        <main className="admin-content">
          <div className="admin-header">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={26} />
              Supervisor Access Management
            </h1>
            <p className="admin-subtitle">
              All supervisors with system access. Reset a password to issue a temporary credential the
              supervisor must change on next login.
            </p>
          </div>

          {banner && (
            <div
              style={{
                margin: '16px 0',
                padding: '12px 16px',
                background: 'rgba(40, 167, 69, 0.1)',
                border: '1px solid rgba(40, 167, 69, 0.3)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Check size={18} />
              {banner}
            </div>
          )}

          {loadError && (
            <div
              style={{
                margin: '16px 0',
                padding: '12px 16px',
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={18} />
              {loadError}
            </div>
          )}

          <div
            style={{
              marginTop: '20px',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontWeight: 600,
                color: '#1f2937',
              }}
            >
              <Users size={18} />
              Supervisor List
              <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>
                {loading ? '' : `${supervisors.length} account${supervisors.length === 1 ? '' : 's'}`}
              </span>
            </div>

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                Loading supervisors…
              </div>
            ) : supervisors.length === 0 && !loadError ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                No supervisors found. Run migration{' '}
                <code>010_create_supervisors.sql</code> to create and seed the table.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                      <th style={th}>Full Name</th>
                      <th style={th}>Department</th>
                      <th style={th}>Position</th>
                      <th style={th}>Username</th>
                      <th style={th}>Account Status</th>
                      <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supervisors.map((s) => (
                      <tr key={s.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                        <td style={td}>
                          <span style={{ fontWeight: 600, color: '#1f2937' }}>{s.full_name}</span>
                        </td>
                        <td style={td}>{s.department || '—'}</td>
                        <td style={td}>{s.position || '—'}</td>
                        <td style={td}>
                          <code style={{ color: '#374151' }}>{s.username}</code>
                        </td>
                        <td style={td}>
                          <StatusBadge supervisor={s} />
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => openResetDialog(s)}
                            style={resetButton}
                          >
                            <KeyRound size={15} />
                            Reset Password
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Reset password confirmation + result dialog */}
      <Dialog
        open={Boolean(target)}
        onClose={closeDialog}
        title={resetResult ? 'Password Reset Complete' : 'Reset Supervisor Password'}
      >
        {target && !resetResult && (
          <div style={{ color: 'var(--text-primary)' }}>
            <p style={{ marginBottom: '16px', lineHeight: 1.5 }}>
              Reset the password for <strong>{target.full_name}</strong> (
              <code>{target.username}</code>)? The supervisor will be required to change it on next
              login, and this action will be logged for auditing.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="reset-mode"
                  checked={resetMode === 'temporary'}
                  onChange={() => setResetMode('temporary')}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <strong>Generate temporary password</strong>
                  <br />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    A random secure password is created and shown once.
                  </span>
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="reset-mode"
                  checked={resetMode === 'default'}
                  onChange={() => setResetMode('default')}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <strong>Reset to default password</strong>
                  <br />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Sets the shared default credential.
                  </span>
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={closeDialog} disabled={resetting} style={secondaryButton}>
                Cancel
              </button>
              <button type="button" onClick={handleConfirmReset} disabled={resetting} style={dangerButton}>
                {resetting ? 'Resetting…' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        )}

        {resetResult && (
          <div style={{ color: 'var(--text-primary)' }}>
            <p style={{ marginBottom: '12px', lineHeight: 1.5 }}>
              The password for <code>{resetResult.username}</code> has been reset. Share this
              temporary password securely — it will not be shown again:
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px',
              }}
            >
              <code style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '0.5px', flex: 1 }}>
                {resetResult.password}
              </code>
              <button type="button" onClick={handleCopy} style={secondaryButton}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? 'Copied' : 'Copy'}
                </span>
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={closeDialog} style={dangerButton}>
                Done
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};

const StatusBadge = ({ supervisor }: { supervisor: Supervisor }) => {
  const isActive = supervisor.account_status === 'Active';
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
      <span
        style={{
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: '999px',
          fontSize: '12px',
          fontWeight: 600,
          background: isActive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(107, 114, 128, 0.15)',
          color: isActive ? '#047857' : '#4b5563',
        }}
      >
        {supervisor.account_status}
      </span>
      {(supervisor.must_change_password || supervisor.is_default_password) && (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 600,
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#b45309',
          }}
        >
          Temporary password
        </span>
      )}
    </span>
  );
};

const th: React.CSSProperties = {
  padding: '12px 16px',
  fontWeight: 600,
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '14px 16px',
  color: '#374151',
  verticalAlign: 'top',
};

const resetButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '7px 14px',
  background: '#363EE8',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const secondaryButton: React.CSSProperties = {
  padding: '8px 16px',
  background: '#fff',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const dangerButton: React.CSSProperties = {
  padding: '8px 16px',
  background: '#363EE8',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};
