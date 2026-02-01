import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

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
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl border border-slate-200 p-8">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-blue-900/10 flex items-center justify-center">
            <span className="text-blue-900 font-bold">HR</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">HRIS Admin Portal</h1>
          <p className="text-sm text-slate-500 mt-1">Secure staff access</p>
        </div>

        {/* Demo Credentials Notice */}
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-semibold text-amber-900 mb-2">Demo Credentials:</p>
          <div className="space-y-1 text-xs text-amber-800">
            <p><strong>Admin:</strong> admin@cictrix.com / Admin@123</p>
            <p><strong>RSP:</strong> rsp@cictrix.com / RSP@123</p>
            <p><strong>LND:</strong> lnd@cictrix.com / LND@123</p>
            <p><strong>PM:</strong> pm@cictrix.com / PM@123</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900/30 focus:border-blue-900"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-900/30 focus:border-blue-900"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-900 text-white py-2.5 font-semibold hover:bg-blue-800 transition disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-slate-500 text-center mt-6">
          Authorized personnel only.
        </p>
      </div>
    </div>
  );
};
