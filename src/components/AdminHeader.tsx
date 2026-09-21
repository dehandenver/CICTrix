import { LogOut, UserCircle2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import abyanLogo from '../assets/abyan-logo.png';
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

  return (
    <header
      className="sticky top-0 z-40 shadow-md"
      style={{ backgroundColor: '#363EE8', fontFamily: "'Poppins', system-ui, -apple-system, sans-serif" }}
    >
      {/* `min-w-0` on every flex child so a long name/label truncates instead of
          pushing its siblings off the right edge of the viewport. */}
      <div className="flex w-full items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3">

        {/* Left — Logo & Branding (click to go to portal home) */}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 cursor-pointer sm:gap-3"
          onClick={() => navigate(homeUrl)}
        >
          <img
            src={abyanLogo}
            alt="ABYAN HRIS"
            className="h-8 w-auto shrink-0 object-contain sm:h-10"
            style={{ mixBlendMode: 'screen' }}
          />
          <div className="flex min-w-0 flex-col items-start text-left leading-tight">
            <span className="truncate text-base font-bold tracking-tight sm:text-lg" style={{ color: '#ffffff' }}>
              ABYAN
            </span>
            {/* Full system name only where there is room for it */}
            <span className="hidden truncate text-xs font-medium md:block" style={{ color: 'rgba(255,255,255,0.80)' }}>
              Human Resource Information System
            </span>
          </div>
        </button>

        {/* Right — User info + Logout. Never shrinks below its content, and its
            own children truncate, so it always stays inside the viewport. */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
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
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Logout</span>
          </LogoutConfirmPopover>
        </div>
      </div>
    </header>
  );
};
