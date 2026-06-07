import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockDatabase } from '../../lib/mockDatabase';
import { isMockModeEnabled, supabase } from '../../lib/supabase';
import abyanLogo from '../../assets/abyan-logo.png';
import iloiloCitySeal from '../../assets/iloilo-city-seal.png';

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
  const [showPassword, setShowPassword] = useState(false);
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
    <div
      className="min-h-screen w-full bg-slate-50 text-slate-900"
      style={{ fontFamily: "'Poppins', system-ui, -apple-system, sans-serif" }}
    >
      <div className="flex min-h-screen w-full">
        {/* LEFT — brand panel */}
        <aside
          className="relative hidden w-1/2 overflow-hidden lg:flex"
          style={{ background: 'linear-gradient(135deg, #363EE8 0%, #050D65 100%)', color: '#FFFFFF' }}
        >
          {/* Decorative orbs */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full blur-3xl"
            style={{ backgroundColor: 'rgba(200,209,255,0.18)' }}
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
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)',
              backgroundSize: '24px 24px',
              opacity: 0.35,
            }}
          />

          <div className="relative z-10 flex w-full flex-col p-12">
            {/* Top wordmark with logo */}
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

            {/* Center hero — OCHRMO seal */}
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
                className="text-4xl font-bold tracking-tight text-white"
                style={{ lineHeight: 1.1 }}
              >
                Interviewer Portal
              </h1>
              <p
                className="mt-3 text-base font-medium"
                style={{ color: 'rgba(200,209,255,0.90)' }}
              >
                Evaluation &amp; Assessment
              </p>
              <ul className="mt-10 space-y-3 text-center text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {['View Assigned Applicants', 'Conduct Evaluations', 'Submit Recommendations'].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>
              &copy; {new Date().getFullYear()} Abyan HRIS. All rights reserved.
            </p>
          </div>
        </aside>

        {/* RIGHT — form panel */}
        <main className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2 lg:px-16">
          <div className="w-full max-w-md">
            {/* Mobile-only brand */}
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              <img src={abyanLogo} alt="Abyan" className="h-8 w-auto object-contain" />
              <span className="text-sm font-semibold text-slate-900">Abyan HRIS</span>
            </div>

            <div className="mb-8">
              <h1
                className="text-3xl font-bold tracking-tight"
                style={{ color: '#040E6B', lineHeight: 1.15 }}
              >
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-slate-500">Sign in to access your interviewer dashboard</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="int-email" className="mb-2 block text-sm font-semibold" style={{ color: '#040E6B' }}>
                  Email Address
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    strokeWidth={1.8}
                  />
                  <input
                    id="int-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={loading}
                    className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition-shadow focus:border-[#363EE8] focus:outline-none focus:ring-4 focus:ring-[#EEF2FF]"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="int-password" className="mb-2 block text-sm font-semibold" style={{ color: '#040E6B' }}>
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    strokeWidth={1.8}
                  />
                  <input
                    id="int-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={loading}
                    className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400 transition-shadow focus:border-[#363EE8] focus:outline-none focus:ring-4 focus:ring-[#EEF2FF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    disabled={loading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed"
                  >
                    {showPassword ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                  </button>
                </div>
              </div>

              {/* Remember + forgot */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 focus:ring-2 focus:ring-[#EEF2FF]"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-sm font-medium transition"
                  style={{ color: '#363EE8' }}
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-4 focus:ring-[#EEF2FF] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: '#363EE8' }}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#2830c5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#363EE8'; }}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            {isMockModeEnabled && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <span className="font-semibold">Demo Mode:</span> Use any active rater email with any non-empty password.
              </div>
            )}

            <p className="mt-10 text-center text-xs font-medium text-slate-400">
              Protected by government security protocols
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
