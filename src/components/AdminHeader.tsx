import { UserCircle2 } from 'lucide-react';
import abyanLogo from '../assets/abyan-logo.png';
import { LogoutConfirmPopover } from './LogoutConfirmPopover';

interface AdminHeaderProps {
  /** Display name shown next to the avatar (e.g. "Alex Gonzales") */
  userName?: string;
  /** Division/role label shown below the user name (e.g. "L&D Division") */
  divisionLabel?: string;
}

export const AdminHeader = ({
  userName = 'Admin',
  divisionLabel = 'HRIS Admin',
}: AdminHeaderProps) => {
  return (
    <header
      className="sticky top-0 z-40 shadow-md"
      style={{ backgroundColor: '#363EE8', fontFamily: "'Poppins', system-ui, -apple-system, sans-serif" }}
    >
      <div className="flex items-center justify-between px-6 py-3">

        {/* Left — Logo & Branding */}
        <div className="flex items-center gap-3">
          <img
            src={abyanLogo}
            alt="ABYAN HRIS"
            className="h-10 w-auto object-contain"
            style={{ mixBlendMode: 'screen' }}
          />
          <div className="flex flex-col leading-tight">
            <span className="text-lg font-bold tracking-tight" style={{ color: '#ffffff' }}>
              ABYAN
            </span>
            <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.80)' }}>
              Human Resource Information System
            </span>
          </div>
        </div>

        {/* Right — User info + Logout */}
        <div className="flex items-center gap-4">
          {/* User block */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
            >
              <UserCircle2 className="h-5 w-5" style={{ color: '#ffffff' }} />
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-sm font-semibold" style={{ color: '#ffffff' }}>{userName}</span>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>{divisionLabel}</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: '1px', height: '28px', backgroundColor: 'rgba(255,255,255,0.25)' }} />

          {/* Logout */}
          <LogoutConfirmPopover
            buttonClassName="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition hover:bg-white/20"
            buttonStyle={{
              borderColor: 'rgba(255,255,255,0.35)',
              backgroundColor: 'rgba(255,255,255,0.12)',
              color: '#ffffff',
            }}
          />
        </div>
      </div>
    </header>
  );
};
