import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { User, Lock, LogIn } from 'lucide-react';
import '../../styles/interviewer.css';

interface InterviewerLoginProps {
  onLogin: (email: string, name: string) => void;
}

// Mock credentials for development
const MOCK_INTERVIEWERS: Record<string, { password: string; name: string }> = {
  'interviewer@cictrix.com': { password: 'Interviewer@123', name: 'John Smith' },
  'interviewer1@cictrix.com': { password: 'Interview@123', name: 'Maria Garcia' },
  'interviewer2@cictrix.com': { password: 'Interview@123', name: 'Carlos Santos' },
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
      // Try mock auth first
      const mockInterviewer = MOCK_INTERVIEWERS[email];
      if (mockInterviewer && mockInterviewer.password === password) {
        onLogin(email, mockInterviewer.name);
        navigate('/interviewer/dashboard');
        return;
      }

      // Fall back to Supabase auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user) {
        setError('Invalid email or password.');
        return;
      }

      // Check if user has interviewer role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role, name')
        .eq('user_id', authData.user.id)
        .eq('role', 'INTERVIEWER')
        .single();

      if (roleError || !roleData) {
        setError('You do not have interviewer access. Please contact HR.');
        await supabase.auth.signOut();
        return;
      }

      const resolvedEmail = authData.user.email ?? email;
      const userName = roleData.name || 'Interviewer';
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
              <div className="demo-credentials">
                <p className="demo-title">Demo Credentials:</p>
                <code>interviewer@cictrix.com / Interviewer@123</code>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
