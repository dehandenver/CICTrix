import { Lock, LogIn, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockDatabase } from '../../lib/mockDatabase';
import { isMockModeEnabled, supabase } from '../../lib/supabase';
import '../../styles/interviewer.css';

interface InterviewerLoginProps {
  onLogin: (email: string, name: string) => void;
}
const RATER_ACCESS_STATE_KEY = 'cictrix_rater_access_state_map';

const getAccessClient = () => {
  // Interviewer access should always check the real rater DB when available.
  return isMockModeEnabled ? (mockDatabase as any) : supabase;
};

const runEmailUpdate = async (client: any, updates: Record<string, unknown>, email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const updateQuery = client.from('raters').update(updates) as any;

  if (typeof updateQuery?.ilike === 'function') {
    return updateQuery.ilike('email', normalizedEmail);
  }

  return updateQuery.eq('email', normalizedEmail);
};

const selectRatersForAccess = async (client: any) => {
  const query = client.from('raters').select('id, name, email, is_active') as any;
  if (typeof query?.limit === 'function') {
    return query.limit(1000);
  }
  return query;
};

const loadRaterAccessState = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(RATER_ACCESS_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export function InterviewerLogin({ onLogin }: InterviewerLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();

      const accessStateMap = loadRaterAccessState();
      if (Object.prototype.hasOwnProperty.call(accessStateMap, normalizedEmail) && !accessStateMap[normalizedEmail]) {
        setError('Your interviewer access has been revoked. Please contact HR.');
        return;
      }

      // Access is controlled by Rater Management: account must exist and be active.
      // Fetch rows then match client-side to avoid case/whitespace mismatches.
      const client = getAccessClient();
      const { data: raterRows, error: raterError } = await selectRatersForAccess(client);

      if (raterError) {
        setError('Unable to verify interviewer access. Please try again.');
        return;
      }

      const matchedRaters = (raterRows ?? []).filter((row: any) => normalize(row?.email) === normalizedEmail);
      const raterRecord = matchedRaters[0];
      const hasActiveRaterAccess = matchedRaters.some((row: any) => Boolean(row?.is_active));

      if (!raterRecord) {
        setError('No interviewer access is assigned to this account in the rater database.');
        return;
      }

      if (!hasActiveRaterAccess && !Boolean(raterRecord.is_active)) {
        setError('Your interviewer access has been revoked. Please contact HR.');
        return;
      }

      // In local demo mode, granted active rater access is enough to allow login.
      if (isMockModeEnabled) {
        try {
          await runEmailUpdate(client, { last_login: new Date().toISOString() }, normalizedEmail);
        } catch {
          // Do not block login when last_login write fails.
        }
        onLogin(raterRecord.email || normalizedEmail, raterRecord.name || 'Interviewer');
        navigate('/interviewer/dashboard');
        return;
      }

      // In connected mode, authenticate against Supabase Auth.
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError || !authData.user) {
        setError('Invalid email or password. If access was just granted, ensure this email also exists in Supabase Authentication.');
        return;
      }

      try {
        await runEmailUpdate(client, { last_login: new Date().toISOString() }, normalizedEmail);
      } catch {
        // Do not block login when last_login write fails.
      }

      const resolvedEmail = authData.user.email ?? normalizedEmail;
      const userName = raterRecord.name || 'Interviewer';
      onLogin(resolvedEmail, userName);
      navigate('/interviewer/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="interviewer-login-page">
      <div className="login-container">
        <div className="login-illustration">
          <div className="illustration-bg">
            <span className="floating-orb orb-1"></span>
            <span className="floating-orb orb-2"></span>
            <span className="floating-orb orb-3"></span>
          </div>
          <div className="illustration-content">
            <div className="logo-badge">
              <User size={48} />
            </div>
            <h2>Interviewer Portal</h2>
            <p className="subtitle">CICTrix HRIS - Evaluation & Assessment</p>
            <ul className="feature-list">
              <li className="feature-item">View Assigned Applicants</li>
              <li className="feature-item">Conduct Evaluations</li>
              <li className="feature-item">Submit Recommendations</li>
            </ul>
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-header">
            <h1>Welcome Back</h1>
            <p>Sign in to access your interviewer dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            {error && (
              <div className="error-banner">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div className="form-field">
              <label htmlFor="email">Email Address</label>
              <div className="input-wrapper">
                <User size={20} className="input-icon" />
                <input
                  id="email"
                  type="email"
                  placeholder="interviewer@cictrix.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <Lock size={20} className="input-icon" />
                <input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-options">
              <label className="checkbox-label">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <a href="#" className="forgot-link">Forgot password?</a>
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? (
                <>
                  <div className="spinner-small"></div>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  <span>Sign In</span>
                </>
              )}
            </button>

            <div className="login-footer">
              <p>
                Need help? Contact <a href="mailto:hr@cictrix.com">hr@cictrix.com</a>
              </p>
              {isMockModeEnabled && (
                <div className="demo-credentials">
                  <p className="demo-title">Demo Mode:</p>
                  <code>Use any active rater email with any non-empty password</code>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
