import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import '../../styles/admin.css';

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

// Mock credentials for development
const MOCK_USERS: Record<string, { password: string; role: Role }> = {
  // Documented credentials (ACCESS_LINKS.md)
  'admin@cictrix.gov.ph': { password: 'admin123', role: 'super-admin' },
  'rsp@cictrix.gov.ph': { password: 'rsp123', role: 'rsp' },
  'lnd@cictrix.gov.ph': { password: 'lnd123', role: 'lnd' },
  'pm@cictrix.gov.ph': { password: 'pm123', role: 'pm' },

  // Backward-compatible legacy credentials
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

  useEffect(() => {
    const clearLeakedBackdrops = () => {
      window.dispatchEvent(new Event('cictrix:force-close-overlays'));

      const loginRoot = document.querySelector('.admin-login-page');
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('body *'));
      nodes.forEach((node) => {
        if (loginRoot && loginRoot.contains(node)) return;

        const classes = typeof node.className === 'string' ? node.className : '';
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        const coversViewport =
          rect.width >= window.innerWidth - 2 &&
          rect.height >= window.innerHeight - 2;
        const isFullscreenFixed =
          style.position === 'fixed' &&
          coversViewport;
        const isFullscreenAbsolute =
          style.position === 'absolute' &&
          coversViewport;
        const isKnownBackdropClass =
          classes.includes('bg-black/') ||
          classes.includes('bg-slate-900/') ||
          classes.includes('dialog-overlay') ||
          classes.includes('assessment-print-overlay');

        if (isFullscreenFixed || isFullscreenAbsolute || isKnownBackdropClass) {
          // Remove leaked overlays entirely so they cannot keep tinting the viewport.
          if (node.parentElement && node !== loginRoot) {
            node.parentElement.removeChild(node);
            return;
          }

          node.style.display = 'none';
          node.style.pointerEvents = 'none';
          node.style.opacity = '0';
        }
      });

      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.pointerEvents = '';
    };

    const peelTopBlockingLayers = () => {
      const loginRoot = document.querySelector('.admin-login-page') as HTMLElement | null;
      if (!loginRoot) return;

      const points: Array<[number, number]> = [
        [Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2)],
        [Math.floor(window.innerWidth * 0.75), Math.floor(window.innerHeight * 0.55)],
        [Math.floor(window.innerWidth * 0.25), Math.floor(window.innerHeight * 0.55)],
      ];

      points.forEach(([x, y]) => {
        for (let i = 0; i < 8; i += 1) {
          const top = document.elementFromPoint(x, y) as HTMLElement | null;
          if (!top) break;

          if (loginRoot.contains(top)) {
            break;
          }

          if (top === document.documentElement || top === document.body) {
            break;
          }

          const style = window.getComputedStyle(top);
          const isOverlayLike =
            style.position === 'fixed' ||
            style.position === 'absolute' ||
            Number(style.zIndex || '0') >= 40;

          if (isOverlayLike) {
            top.style.pointerEvents = 'none';
            if (style.position === 'fixed') {
              top.style.display = 'none';
            }
          } else {
            break;
          }
        }
      });
    };

    clearLeakedBackdrops();
    peelTopBlockingLayers();
    const raf = window.requestAnimationFrame(clearLeakedBackdrops);
    const timer = window.setTimeout(clearLeakedBackdrops, 120);
    const interval = window.setInterval(() => {
      clearLeakedBackdrops();
      peelTopBlockingLayers();
    }, 250);

    const observer = new MutationObserver(() => {
      clearLeakedBackdrops();
      peelTopBlockingLayers();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) {
      alert('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      // Try mock auth first
      const normalizedEmail = email.trim().toLowerCase();
      const mockUser = MOCK_USERS[normalizedEmail];
      if (mockUser && mockUser.password === password) {
        if (mockUser.role !== selectedRole) {
          alert(`This account is assigned to ${mockUser.role.toUpperCase()}. Please select the correct role.`);
          return;
        }
        onLogin(normalizedEmail, mockUser.role);
        navigate(getRoleDefaultRoute(mockUser.role));
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

      const role = normalizeAdminRole(roleData.role);
      if (!role) {
        alert('Invalid role assignment. Contact the admin.');
        return;
      }

      if (role !== selectedRole) {
        alert(`Your account role is ${role.toUpperCase()}. Please select the matching role to continue.`);
        return;
      }

      const resolvedEmail = authData.user.email ?? email;
      onLogin(resolvedEmail, role);
      navigate(getRoleDefaultRoute(role));
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
