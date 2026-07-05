import { Clock } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import abyanLogo from '../assets/abyan-logo.png';

const PORTAL_LOGIN: Record<string, string> = {
  admin: '/admin/login',
  interviewer: '/interviewer/login',
  employee: '/employee/login',
};

function isSafeReturnPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

export function SessionExpiredPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const portal   = searchParams.get('portal') ?? 'admin';
  const returnTo = searchParams.get('returnTo') ?? '';
  const loginBase = PORTAL_LOGIN[portal] ?? '/admin/login';
  const loginPath = returnTo && isSafeReturnPath(returnTo)
    ? `${loginBase}?returnTo=${encodeURIComponent(returnTo)}`
    : loginBase;

  return (
    <div
      className="min-h-screen bg-[#F8FAFC] text-[#050D65] flex flex-col justify-between"
      style={{ fontFamily: "'Poppins', system-ui, -apple-system, sans-serif" }}
    >
      {/* Navbar */}
      <header className="bg-[#363EE8] shadow-md py-4">
        <div className="mx-auto flex max-w-6xl items-center px-6">
          <div className="flex items-center gap-3">
            <img
              src={abyanLogo}
              alt="Abyan Logo"
              className="h-11 w-auto object-contain"
              style={{ mixBlendMode: 'screen' }}
            />
            <span className="text-xl font-bold tracking-tight text-white">ABYAN</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center px-6 py-20">
        <div className="max-w-md w-full bg-white shadow-xl rounded-2xl p-10 text-center border border-slate-100">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
              <Clock className="w-10 h-10 text-amber-500" strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-[#050D65] tracking-tight mb-3">
            Session Expired
          </h1>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            Your session expired due to inactivity. Sign in again to continue
            where you left off.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate(loginPath, { replace: true })}
              className="w-full inline-flex justify-center items-center rounded-xl bg-[#363EE8] py-3 text-sm font-semibold text-white transition hover:bg-[#2e35d4] shadow-md shadow-[#363EE8]/10"
            >
              Sign In Again
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full inline-flex justify-center items-center rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Go to Home Page
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-slate-400 bg-white border-t border-slate-100">
        &copy; {new Date().getFullYear()} ABYAN Human Resource Information System. All rights reserved.
      </footer>
    </div>
  );
}
