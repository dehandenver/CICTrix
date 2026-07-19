import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { scheduleTransientUiReset } from '../../utils/uiReset';
import iloiloCitySeal from '../../assets/iloilo-city-seal.png';
import abyanLogo from '../../assets/abyan-logo.png';

type Role = 'super-admin' | 'rsp' | 'lnd' | 'pm';

const normalizeAdminRole = (role: string | null | undefined): Role | null => {
  if (!role) return null;
  const normalized = role.toLowerCase().replace(/_/g, '-');
  if (normalized === 'super-admin' || normalized === 'superadmin' || normalized === 'admin') {
    return 'super-admin';
  }
  if (normalized === 'rsp') return 'rsp';
  if (normalized === 'lnd') return 'lnd';
  if (normalized === 'pm') return 'pm';
  return null;
};

const getRoleDefaultRoute = (role: Role): string => {
  if (role === 'super-admin') return '/admin?module=dashboard';
  if (role === 'rsp') return '/admin/rsp';
  if (role === 'lnd') return '/admin/lnd';
  return '/admin/pm';
};

interface LoginPageProps {
  onLogin: (email: string, role: Role) => void;
}

/**
 * There is deliberately no hardcoded credential table here.
 *
 * All four admin roles authenticate against Supabase Auth, with the role read
 * from `user_roles` (accounts provisioned by scripts/create-admin-accounts.mjs).
 *
 * Anything hardcoded in this file compiles into the public JS bundle and is
 * readable by anyone who opens devtools on the deployed site — a published
 * password, not a secret. The previous MOCK_USERS table put working super-admin,
 * RSP, PM and L&D passwords in production, and would defeat the RBAC on
 * backend-gated routes like the IPCR weighting config. Do not reintroduce it.
 */

const ROLES: { key: Role; label: string; sublabel: string }[] = [
  { key: 'rsp', label: 'RSP', sublabel: 'Recruitment' },
  { key: 'lnd', label: 'L&D', sublabel: 'Learning' },
  { key: 'pm', label: 'PM', sublabel: 'Performance' },
  { key: 'super-admin', label: 'Admin', sublabel: 'HR Head' },
];

const INTER_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const LoginPage = ({ onLogin }: LoginPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>('rsp');
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const navigateAfterLogin = (role: Role) => {
    const returnTo = searchParams.get('returnTo');
    if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
      navigate(returnTo);
    } else {
      navigate(getRoleDefaultRoute(role));
    }
  };

  useEffect(() => {
    const cleanupUiReset = scheduleTransientUiReset({ dispatchOverlayClose: true });
    return () => {
      cleanupUiReset();
    };
  }, []);

  const discardSession = () => supabase.auth.signOut({ scope: 'local' }).catch(() => {});

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user) {
        setErrorMsg("You don't have permission to login to this account");
        return;
      }

      const { data: roleData, error: roleError } = await (supabase as any)
        .from('user_roles')
        .select('role')
        .eq('user_id', authData.user.id)
        .single();

      if (roleError || !(roleData as any)?.role) {
        await discardSession();
        setErrorMsg('No role assigned. Contact the admin.');
        return;
      }

      const role = normalizeAdminRole((roleData as any).role);
      if (!role) {
        await discardSession();
        setErrorMsg('Invalid role assignment. Contact the admin.');
        return;
      }

      if (role !== selectedRole) {
        await discardSession();
        setErrorMsg("You don't have permission to login to this account");
        return;
      }

      const resolvedEmail = authData.user.email ?? email;
      onLogin(resolvedEmail, role);
      navigateAfterLogin(role);
    } catch {
      setErrorMsg('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-slate-50 text-slate-900"
      style={{ fontFamily: INTER_STACK }}
    >
      <div className="flex min-h-screen w-full">
        {/* LEFT — solid indigo brand panel */}
        <aside
          className="relative hidden w-1/2 overflow-hidden lg:flex"
          style={{ backgroundColor: '#363EE8', color: '#FFFFFF' }}
        >
          {/* Subtle decorative orbs (very low contrast — premium, not loud). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full blur-3xl"
            style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 0)',
              backgroundSize: '24px 24px',
              opacity: 0.4,
            }}
          />

          {/* Top-left wordmark */}
          <div className="relative z-10 flex w-full flex-col p-12">
            <a href="/" className="flex items-center gap-3">
              <img
                src={abyanLogo}
                alt="Abyan Logo"
                className="h-10 w-auto object-contain"
                style={{ mixBlendMode: 'screen' }}
              />
              <div className="flex flex-col leading-tight">
                <span className="text-base font-bold tracking-wide text-white">ABYAN HRIS</span>
                <span className="text-xs font-medium" style={{ color: 'rgba(200,209,255,0.85)' }}>
                  Human Resource Information System
                </span>
              </div>
            </a>

            {/* Centered hero block */}
            <div className="m-auto w-full max-w-md text-center">
              <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-full"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.25)',
                  padding: '12px',
                }}
              >
                <img
                  src={iloiloCitySeal}
                  alt="OCHRMO Seal"
                  className="h-full w-full object-contain"
                />
              </div>
              <h1
                className="text-4xl font-bold tracking-tight"
                style={{ lineHeight: 1.1, color: '#FFFFFF' }}
              >
                HRIS Portal
              </h1>
              <p
                className="mt-3 text-base font-medium"
                style={{ color: 'rgba(255,255,255,0.82)' }}
              >
                Human Resource Information System
              </p>
            </div>

            <p
              className="text-xs font-medium"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              &copy; {new Date().getFullYear()} Abyan. All rights reserved.
            </p>
          </div>
        </aside>

        {/* RIGHT — form panel */}
        <main className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2 lg:px-16">
          <div className="w-full max-w-md">
            {/* Mobile-only mini brand */}
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#363EE8]">
                <Lock className="h-4 w-4 text-white" strokeWidth={2} />
              </div>
              <span className="text-sm font-semibold text-slate-900">Abyan HRIS</span>
            </div>

            <div className="mb-8">
              <h1
                className="text-3xl font-bold tracking-tight text-slate-900"
                style={{ lineHeight: 1.15 }}
              >
                Welcome back
              </h1>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email */}
              <div>
                <label
                  htmlFor="admin-login-email"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <input
                    id="admin-login-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMsg(null);
                    }}
                    autoComplete="email"
                    className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition-shadow focus:border-[#363EE8] focus:outline-none focus:ring-4 focus:ring-[#EEF2FF]"
                  />
                </div>
              </div>

              {/* Error Message Card */}
              {errorMsg && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600 font-medium">
                  {errorMsg}
                </div>
              )}

              {/* Password */}
              <div>
                <label
                  htmlFor="admin-login-password"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <input
                    id="admin-login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrorMsg(null);
                    }}
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400 transition-shadow focus:border-[#4F46E5] focus:outline-none focus:ring-4 focus:ring-[#EEF2FF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                  </button>
                </div>
              </div>

              {/* Role selection */}
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Select Your Role</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {ROLES.map((role) => {
                    const isActive = selectedRole === role.key;
                    return (
                      <button
                        key={role.key}
                        type="button"
                        onClick={() => {
                          setSelectedRole(role.key);
                          setErrorMsg(null);
                        }}
                        className={[
                          'group flex flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left transition',
                          isActive
                            ? 'border-[#4F46E5] bg-[#EEF2FF] ring-1 ring-[#4F46E5]/30'
                            : 'border-gray-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'text-sm font-semibold transition',
                            isActive ? 'text-[#4338CA]' : 'text-slate-900',
                          ].join(' ')}
                        >
                          {role.label}
                        </span>
                        <span
                          className={[
                            'text-xs transition',
                            isActive ? 'text-[#4F46E5]/80' : 'text-slate-500',
                          ].join(' ')}
                        >
                          {role.sublabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Remember + forgot */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 text-[#4F46E5] focus:ring-2 focus:ring-[#EEF2FF]"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-sm font-medium text-[#4F46E5] transition hover:text-[#4338CA]"
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-[#4F46E5] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 transition hover:bg-[#4338CA] focus:outline-none focus:ring-4 focus:ring-[#EEF2FF] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

          </div>
        </main>
      </div>
    </div>
  );
};
