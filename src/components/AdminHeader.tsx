import { AlertTriangle, LogOut, UserCircle2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import abyanLogo from '../assets/abyan-logo.png';
import { getPreferredDataSourceMode } from '../lib/dataSourceMode';
import { LogoutConfirmPopover } from './LogoutConfirmPopover';

interface AdminHeaderProps {
  /** Display name shown next to the avatar (e.g. "Alex Gonzales") */
  userName?: string;
  /** Division/role label shown below the user name (e.g. "L&D Division") */
  divisionLabel?: string;
}

const getPortalHome = (pathname: string): string => {
  if (pathname.startsWith('/admin/rsp')) return '/admin/rsp';
  if (pathname.startsWith('/admin/lnd')) return '/admin/lnd';
  if (pathname.startsWith('/admin/pm'))  return '/admin/pm';
  if (pathname.startsWith('/interviewer')) return '/interviewer/dashboard';
  return '/admin?module=dashboard';
};

export const AdminHeader = ({
  userName = 'Admin',
  divisionLabel = 'HRIS Admin',
}: AdminHeaderProps) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const homeUrl = getPortalHome(pathname);
  const isMockData = getPreferredDataSourceMode() === 'local';

  return (
    <header
      className="sticky top-0 z-40 shadow-md"
      style={{ backgroundColor: '#363EE8', fontFamily: "'Poppins', system-ui, -apple-system, sans-serif" }}
    >
      {/* `min-w-0` on every flex child so a long name/label truncates instead of
          pushing its siblings off the right edge of the viewport. */}
      {/* 64px bar (56px mobile), 24px side padding (16px mobile) — §8.2 */}
      <div className="flex h-14 w-full items-center justify-between gap-2 px-4 sm:h-16 sm:gap-4 sm:px-6">

        {/* Left — single-line lockup: [Mark] ABYAN  Human Resource Information
            System, 12px apart (§8.2). Click goes to the portal home. */}
        <button
          type="button"
          aria-label="ABYAN HRIS — go to portal home"
          className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          // Inline, so it beats globals.css `button:hover`, which painted this
          // whole lockup white (white logo and text on white) on hover.
          style={{ backgroundColor: 'transparent' }}
          onClick={() => navigate(homeUrl)}
        >
          <img
            src={abyanLogo}
            alt=""
            className="h-8 w-auto shrink-0 object-contain sm:h-10"
            style={{ mixBlendMode: 'screen' }}
          />
          <span className="shrink-0 text-xl font-bold leading-none sm:text-[22px]" style={{ color: '#ffffff' }}>
            ABYAN
          </span>
          {/* System name only where there is room for it (≥1024px) */}
          <span className="hidden truncate text-base font-normal leading-none lg:block" style={{ color: '#ffffff' }}>
            Human Resource Information System
          </span>
        </button>

        {/* Right — User info + Logout. Never shrinks below its content, and its
            own children truncate, so it always stays inside the viewport. */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {/* Mock-data warning — solid warning badge (§9.8), only rendered
              when this browser is off the live database. */}
          {isMockData && (
            <div
              className="hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1 sm:flex"
              style={{ backgroundColor: '#E8821A' }}
              title="This browser is showing locally stored mock data, not the live database."
            >
              <AlertTriangle className="h-3.5 w-3.5" style={{ color: '#ffffff' }} />
              <span className="text-xs font-medium" style={{ color: '#ffffff' }}>Mock data mode</span>
            </div>
          )}

          {/* User block */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
            >
              <UserCircle2 className="h-5 w-5" style={{ color: '#ffffff' }} />
            </div>
            <div className="hidden min-w-0 max-w-[10rem] flex-col leading-tight sm:flex lg:max-w-[16rem]">
              <span className="truncate text-sm font-semibold" style={{ color: '#ffffff' }} title={userName}>
                {userName}
              </span>
              <span className="truncate text-xs" style={{ color: 'rgba(255,255,255,0.75)' }} title={divisionLabel}>
                {divisionLabel}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden sm:block" style={{ width: '1px', height: '28px', backgroundColor: 'rgba(255,255,255,0.25)' }} />

          {/* Logout — label collapses to the icon under 640px, but the tap
              target stays at least 44×44. */}
          <LogoutConfirmPopover
            buttonClassName="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition hover:bg-white/20 sm:px-4"
            buttonStyle={{
              borderColor: 'rgba(255,255,255,0.35)',
              backgroundColor: 'rgba(255,255,255,0.12)',
              color: '#ffffff',
            }}
          >
            <LogOut className="h-4 w-4 shrink-0" style={{ color: '#ffffff' }} />
            {/* Colour set on the span itself: globals.css colours every <span>
                directly, so it would not inherit the button's white. */}
            <span className="hidden sm:inline" style={{ color: '#ffffff' }}>Logout</span>
          </LogoutConfirmPopover>
        </div>
      </div>
    </header>
  );
};
