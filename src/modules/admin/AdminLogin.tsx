import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import hrisLogo from '../../assets/hris-logo.svg';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import '../../styles/admin.css';

export const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    localStorage.setItem('cictrix_admin_auth', 'true');
    navigate('/admin');
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-header">
          <img className="admin-login-header-logo" src={hrisLogo} alt="HRIS logo" />
          <div className="admin-login-badge">Admin</div>
          <h1>HRIS Admin Portal</h1>
          <p>Sign in to manage jobs, raters, and applicant flow.</p>
        </div>

        <form className="admin-login-form" onSubmit={handleSubmit}>
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@company.com"
          />
          <div className="input-wrapper">
            <label className="input-label">Password</label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <p className="admin-login-error">{error}</p>}

          <Button type="submit" size="lg">
            Sign In
          </Button>
        </form>

        <p className="admin-login-note">
          This is a demo login. Connect to Supabase Auth when ready.
        </p>
      </div>
    </div>
  );
};
