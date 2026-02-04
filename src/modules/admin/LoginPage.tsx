import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import '../../styles/admin.css';

type Role = 'super-admin' | 'rsp' | 'lnd' | 'pm';

interface LoginPageProps {
  onLogin: (email: string, role: Role) => void;
}

// Mock credentials for development
const MOCK_USERS: Record<string, { password: string; role: Role }> = {
  'admin@cictrix.com': { password: 'Admin@123', role: 'super-admin' },
  'rsp@cictrix.com': { password: 'RSP@123', role: 'rsp' },
  'lnd@cictrix.com': { password: 'LND@123', role: 'lnd' },
  'pm@cictrix.com': { password: 'PM@123', role: 'pm' },
};

export const LoginPage = ({ onLogin }: LoginPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>('rsp');
  const [rememberMe, setRememberMe] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      alert('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      // Try mock auth first
      const mockUser = MOCK_USERS[email];
      if (mockUser && mockUser.password === password) {
        onLogin(email, mockUser.role);
        navigate('/admin');
        return;
      }

      // Fall back to Supabase auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user) {
        alert('Invalid email or password.');
        return;
      }

      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (roleError || !roleData?.role) {
        alert('No role assigned. Contact the admin.');
        return;
      }

      const role = roleData.role as Role;
      const resolvedEmail = authData.user.email ?? email;
      onLogin(resolvedEmail, role);
      navigate('/admin');
    } catch {
      alert('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-shell">
        <div className="admin-login-illustration">
          <span className="admin-login-orb orb-one" />
          <span className="admin-login-orb orb-two" />
          <span className="admin-login-orb orb-three" />
          <div className="admin-login-logo" aria-hidden="true" />
          <h2>HRIS Portal</h2>
          <p>Human Resource Information System</p>
          <ul>
            <li>Recruitment &amp; Selection</li>
            <li>Learning &amp; Development</li>
            <li>Performance Management</li>
          </ul>
        </div>

        <div className="admin-login-form-panel">
          <div className="admin-login-form-header">
            <h1>Welcome Back</h1>
            <p>Please sign in to your account</p>
          </div>

          <form onSubmit={handleLogin} className="admin-login-form">
            <div className="field">
              <label>Email Address</label>
              <div className="input-with-icon">
                <span className="input-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16v16H4z" opacity="0" />
                    <path d="M4 6h16" />
                    <path d="m4 6 8 6 8-6" />
                    <path d="M4 6v12h16V6" />
                  </svg>
                </span>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="field">
              <label>Password</label>
              <div className="input-with-icon">
                <span className="input-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="role-select">
              <p>Select Your Role</p>
              <div className="role-grid">
                {([
                  { key: 'rsp', label: 'RSP', sublabel: 'Recruitment' },
                  { key: 'lnd', label: 'L&D', sublabel: 'Learning' },
                  { key: 'pm', label: 'PM', sublabel: 'Performance' },
                  { key: 'super-admin', label: 'Admin', sublabel: 'HR Head' }
                ] as { key: Role; label: string; sublabel: string }[]).map((role) => (
                  <button
                    key={role.key}
                    type="button"
                    className={`role-card ${selectedRole === role.key ? 'active' : ''}`}
                    onClick={() => setSelectedRole(role.key)}
                  >
                    <span>{role.label}</span>
                    <small>{role.sublabel}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="login-actions">
              <label className="remember-me">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                />
                Remember me
              </label>
              <button type="button" className="forgot-link">Forgot Password?</button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="primary-login-button"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="login-footer">Protected by government security protocols</p>
        </div>
      </div>
    </div>
  );
};
