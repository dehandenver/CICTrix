import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { useRef, useState } from 'react';
import { ActionFeedback } from '../../components/action-feedback';
import { Button } from '../../components/Button';
import { describeActionFailure } from '../../lib/friendlyErrors';
import abyanLogo from '../../assets/abyan-logo.png';
import iloiloCitySeal from '../../assets/iloilo-city-seal.png';
import { readEmployeeSession } from '../../lib/employeeSession';

interface EmployeeLoginPageProps {
  onLogin: (username: string, password: string) => Promise<void> | void;
  isLoading?: boolean;
}

type LoginFailure = { message: string; nextStep: string };

export const EmployeeLoginPage: React.FC<EmployeeLoginPageProps> = ({
  onLogin,
  isLoading = false,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || isLoading) return;
    setFailure(null);

    if (!username.trim()) {
      setFailure({
        message: 'Enter your employee ID or username.',
        nextStep: 'It is on your onboarding email. Enter it and try again.',
      });
      return;
    }

    if (!password) {
      setFailure({
        message: 'Enter your password.',
        nextStep: 'Use the temporary password from your onboarding email, then try again.',
      });
      return;
    }

    submitting.current = true;
    setLoading(true);
    try {
      await onLogin(username, password);
      const session = readEmployeeSession();
      if (!session) {
        submitting.current = false;
        setLoading(false);
      }
    } catch (err) {
      const kind = (err as { kind?: unknown } | null)?.kind;
      const raw = err instanceof Error ? err.message : String(err ?? '');
      if (
        kind === 'invalid_credentials' ||
        kind === 'not_found' ||
        /invalid username or password/i.test(raw)
      ) {
        console.error('Login error:', err);
        setFailure({
          message: "That username and password don't match an account.",
          nextStep: "Check them and try again. If you were just onboarded, use the temporary password from your welcome email.",
        });
      } else if (kind === 'ambiguous_account') {
        setFailure({
          message: "We couldn't sign you in because this username isn't uniquely linked.",
          nextStep: 'Contact HR so they can verify your employee portal account.',
        });
      } else if (kind === 'lookup_unavailable') {
        setFailure({
          message: "We couldn't reach the employee sign-in service right now.",
          nextStep: 'Check your connection and try again in a moment.',
        });
      } else {
        const described = describeActionFailure('sign you in', err);
        setFailure({ message: described.message, nextStep: described.nextStep });
      }
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <div
      className="abyan-ds employee-login min-h-screen w-full"
      style={{ background: 'var(--bg-page)', color: 'var(--neutral-800)' }}
    >
      <style>{`
        /* Keep legacy global input rules from overriding this page's tokens. */
        .abyan-ds.employee-login .employee-login-input[type] {
          height: var(--control-h);
          border: 1px solid var(--neutral-200);
          border-radius: var(--radius-md);
          background: var(--bg-surface);
          color: var(--neutral-800);
          caret-color: var(--color-primary);
          font: 500 14px/18px var(--font-sans);
          transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
        }
        .abyan-ds.employee-login .employee-login-input::placeholder {
          color: var(--neutral-600);
          opacity: 1;
        }
        .abyan-ds.employee-login .employee-login-input:hover:not(:disabled):not(:focus) {
          border-color: var(--color-primary-200);
        }
        .abyan-ds.employee-login .employee-login-input:focus {
          outline: none;
          border: 2px solid var(--color-primary);
          box-shadow: var(--ring-input);
        }
        .abyan-ds.employee-login .employee-login-input:disabled {
          background: var(--bg-page);
          color: var(--neutral-400);
          cursor: not-allowed;
        }
        .abyan-ds.employee-login .employee-login-toggle {
          border-radius: var(--radius-pill);
          color: var(--neutral-600);
        }
        .abyan-ds.employee-login .employee-login-toggle:hover:not(:disabled) {
          background: var(--bg-page);
          color: var(--color-primary);
        }
        .abyan-ds.employee-login .employee-login-toggle:focus-visible {
          outline: 2px solid var(--color-primary);
          outline-offset: 2px;
          box-shadow: var(--ring-input);
        }
        .abyan-ds.employee-login .btn-primary:hover:not(:disabled) {
          background: var(--color-primary-700);
        }
        .abyan-ds.employee-login .btn-primary.is-loading {
          background: var(--gradient-button);
          color: var(--color-white);
        }
      `}</style>
      <div className="flex min-h-screen w-full">
        {/* LEFT — brand panel */}
        <aside
          className="relative hidden w-1/2 overflow-hidden lg:flex"
          style={{ background: 'var(--gradient-hero)', color: 'var(--color-white)' }}
        >
          {/* Decorative orbs */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full blur-3xl"
            style={{ backgroundColor: 'var(--color-primary-200)', opacity: 0.18 }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
            style={{ backgroundColor: 'var(--color-white)', opacity: 0.06 }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, var(--on-blue-active) 1px, transparent 0)',
              backgroundSize: '24px 24px',
              opacity: 0.35,
            }}
          />

          <div className="relative z-10 flex w-full flex-col p-12">
            {/* Top wordmark with logo */}
            <a href="/" className="flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-white)]">
              <img
                src={abyanLogo}
                alt="Abyan Logo"
                className="h-10 w-auto object-contain"
                style={{ mixBlendMode: 'screen' }}
              />
              <div className="flex flex-col leading-tight">
                <span className="text-title-s" style={{ color: 'var(--color-white)' }}>ABYAN HRIS</span>
                <span className="text-body-s" style={{ color: 'var(--on-blue-muted)' }}>
                  abyan-hris.vercel.app
                </span>
              </div>
            </a>

            {/* Center hero */}
            <div className="m-auto w-full max-w-md text-center">
              <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-full"
                style={{
                  backgroundColor: 'var(--on-blue-hover)',
                  boxShadow: 'inset 0 0 0 2px var(--on-blue-active)',
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
                className="text-title-l"
                style={{ color: 'var(--color-white)' }}
              >
                Employee Portal
              </h1>
              <p
                className="text-body-l mt-3"
                style={{ color: 'var(--on-blue-text)' }}
              >
                Human Resource Information System
              </p>
              <ul className="text-body-l mt-10 space-y-3 text-center" style={{ color: 'var(--on-blue-muted)' }}>
                {['Access Your Employee Records', 'View Payslips & Benefits', 'Submit Leave Requests'].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <p className="text-body-s" style={{ color: 'var(--on-blue-muted)' }}>
              &copy; {new Date().getFullYear()} Abyan HRIS. All rights reserved.
            </p>
          </div>
        </aside>

        {/* RIGHT — form panel */}
        <main className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2 lg:px-16">
          <div className="w-full max-w-md">
            {/* Mobile-only brand */}
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              <img src={abyanLogo} alt="Abyan" className="h-8 w-8 shrink-0 rounded-[var(--radius-md)] bg-[var(--color-primary)] object-contain p-1" />
              <span className="text-headline-m" style={{ color: 'var(--color-primary-900)' }}>Abyan HRIS</span>
            </div>

            <div className="mb-8">
              <h1
                className="text-title-l"
                style={{ color: 'var(--color-primary-900)' }}
              >
                Welcome back
              </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {failure && (
                <div id="emp-login-failure">
                  <ActionFeedback
                    title="We couldn't sign you in."
                    message={failure.message}
                    nextStep={failure.nextStep}
                    onDismiss={() => setFailure(null)}
                  />
                </div>
              )}

              {/* Username */}
              <div>
                <label htmlFor="emp-username" className="text-body-m mb-2 block">
                  Username
                </label>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2"
                    style={{ color: 'var(--neutral-400)' }}
                    strokeWidth={1.75}
                  />
                  <input
                    id="emp-username"
                    type="text"
                    autoComplete="username"
                    aria-describedby={failure ? 'emp-login-failure' : undefined}
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setFailure(null); }}
                    disabled={loading || isLoading}
                    className="employee-login-input w-full pl-10 pr-3"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="emp-password" className="text-body-m mb-2 block">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2"
                    style={{ color: 'var(--neutral-400)' }}
                    strokeWidth={1.75}
                  />
                  <input
                    id="emp-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setFailure(null); }}
                    disabled={loading || isLoading}
                    autoComplete="current-password"
                    aria-describedby={failure ? 'emp-login-failure' : undefined}
                    className="employee-login-input w-full pl-10 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    disabled={loading || isLoading}
                    className="employee-login-toggle absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center disabled:cursor-not-allowed"
                  >
                    {showPassword ? <EyeOff size={20} strokeWidth={1.75} /> : <Eye size={20} strokeWidth={1.75} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                size="lg"
                variant="primary"
                loading={loading || isLoading}
                className="w-full"
              >
                Sign in
              </Button>
            </form>

          </div>
        </main>
      </div>
    </div>
  );
};
