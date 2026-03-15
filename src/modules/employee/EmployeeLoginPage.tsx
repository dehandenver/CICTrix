import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen bg-slate-200 px-4 py-10">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white px-8 py-9 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-white">
            <Lock size={28} />
          </div>
          <h1 className="text-4xl font-bold text-slate-900">Employee Portal</h1>
          <p className="mt-1 text-lg text-slate-500">Human Resources Information System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="mb-2 block text-sm font-semibold text-slate-700">Username</label>
            <div className="relative">
              <User size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading || isLoading}
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-base text-slate-700 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
            <div className="relative">
              <Lock size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading || isLoading}
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-base text-slate-700 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={loading || isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:cursor-not-allowed"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || isLoading}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-lg font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading || isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-500">
          Login credentials are provided by HR upon hiring.
        </p>
        <p className="mt-2 text-center text-xs text-slate-400">
          Demo: username: <span className="font-semibold">employee01</span> | password: <span className="font-semibold">hr2024</span>
        </p>
      </div>

      <p className="mt-10 text-center text-sm text-slate-500">© 2026 CICTrix Resorts. All rights reserved.</p>
    </div>
  );
};
