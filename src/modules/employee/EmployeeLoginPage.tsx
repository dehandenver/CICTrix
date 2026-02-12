/**
 * Employee Login Page Component
 * Provides authentication interface for employees to access self-service portal
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, LogIn } from 'lucide-react';
import '../../styles/interviewer.css';

interface EmployeeLoginPageProps {
  onLogin: (username: string, password: string) => void;
  isLoading?: boolean;
}

export const EmployeeLoginPage: React.FC<EmployeeLoginPageProps> = ({
  onLogin,
  isLoading = false,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Employee ID or username is required');
      return;
    }

    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      // Call parent onLogin to set session
      onLogin(username, password);
      
      // Give the parent component time to update state
      // Then check if we have a valid session by attempting to navigate
      setTimeout(() => {
        const session = localStorage.getItem('cictrix_employee_session');
        if (session) {
          try {
            const parsedSession = JSON.parse(session);
            if (parsedSession?.employeeId) {
              navigate('/employee/dashboard');
            } else {
              setError('Invalid credentials. Please try again.');
              setLoading(false);
            }
          } catch {
            setError('An error occurred. Please try again.');
            setLoading(false);
          }
        } else {
          setError('Invalid credentials. Please use employee01 / hr2024 for demo.');
          setLoading(false);
        }
      }, 100);
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
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
            <h2>Employee Portal</h2>
            <p className="subtitle">CICTrix HRIS - Self-Service Portal</p>
            <ul className="feature-list">
              <li className="feature-item">View Your Profile</li>
              <li className="feature-item">Access Documents</li>
              <li className="feature-item">Manage Information</li>
            </ul>
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-header">
            <h1>Welcome Back</h1>
            <p>Sign in to access your employee self-service dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="error-banner">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div className="form-field">
              <label htmlFor="username">Employee ID or Username</label>
              <div className="input-wrapper">
                <User size={20} className="input-icon" />
                <input
                  id="username"
                  type="text"
                  placeholder="e.g., employee01 or your email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading || isLoading}
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
                  disabled={loading || isLoading}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="form-options">
              <label className="checkbox-label">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <a href="#" className="forgot-link" onClick={(e) => e.preventDefault()}>Forgot password?</a>
            </div>

            <button type="submit" className="login-button" disabled={loading || isLoading}>
              {loading || isLoading ? (
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
                Need help? Contact <a href="mailto:hrmo@ilongcity.gov.ph">HRMO</a> at ext. 5000
              </p>
              <div className="demo-credentials">
                <p className="demo-title">Demo Credentials:</p>
                <code>employee01 / hr2024</code>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
