import { Bell, HelpCircle, UserCircle2 } from 'lucide-react';
import { LogoutConfirmPopover } from './LogoutConfirmPopover';

interface AdminHeaderProps {
  /** Display name shown next to the avatar (e.g. "Alex Gonzales") */
  userName?: string;
  /** Division/role label shown below the user name (e.g. "L&D Division") */
  divisionLabel?: string;
}

/**
 * Shared sticky header used across all admin modules.
 * Matches the PM Dashboard header design — logo, help, notifications,
 * user avatar, and logout confirmation popover.
 */
export const AdminHeader = ({
  userName = 'Admin',
  divisionLabel = 'HRIS Admin',
}: AdminHeaderProps) => {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left — Logo & Title */}
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-blue-600 text-white grid place-content-center text-lg font-bold">
            HR
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">Government HRIS</h1>
            <p className="text-xs text-slate-500">Human Resource Information System</p>
          </div>
        </div>

        {/* Right — Actions, User & Logout */}
        <div className="flex items-center gap-4 text-slate-500">
          <button className="rounded-full p-2 hover:bg-slate-100" type="button" aria-label="Help">
            <HelpCircle className="h-5 w-5" />
          </button>
          <button className="rounded-full p-2 hover:bg-slate-100 relative" type="button" aria-label="Notifications">
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-1 inline-block h-2 w-2 rounded-full bg-red-500" />
          </button>
          <div className="h-8 w-px bg-slate-200" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-600 text-white grid place-content-center">
              <UserCircle2 className="h-6 w-6" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-800">{userName}</p>
              <p className="text-xs text-slate-500">{divisionLabel}</p>
            </div>
          </div>
          <LogoutConfirmPopover />
        </div>
      </div>
    </header>
  );
};
