import { LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const ADMIN_SESSION_KEY = 'cictrix_admin_session';

interface LogoutConfirmPopoverProps {
  /** Extra classes applied to the outer wrapper */
  className?: string;
  /** Override button content (defaults to icon + "Logout") */
  children?: React.ReactNode;
  /** Override button styles — applied instead of defaults */
  buttonClassName?: string;
  /**
   * Where the popover appears relative to the button.
   * - `"below"` (default): drops down from the button (good for header bars)
   * - `"above"`: opens upward from the button (good for sidebar footers)
   */
  position?: 'below' | 'above';
}

/**
 * A small popover that appears near the logout button asking the user to
 * confirm they want to log out. Not a full-screen modal — just an anchored
 * dropdown near the trigger button.
 */
export const LogoutConfirmPopover = ({
  className = '',
  children,
  buttonClassName,
  position = 'below',
}: LogoutConfirmPopoverProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleConfirmLogout = async () => {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore sign-out errors
    }
    navigate('/admin/login', { replace: true });
  };

  const defaultButtonClass =
    'ml-2 inline-flex items-center gap-2 text-red-600 font-semibold text-sm hover:text-red-700 transition';

  const popoverPositionClass =
    position === 'above'
      ? 'bottom-full mb-2 left-0 right-0'
      : 'top-full mt-2 right-0';

  const animationName =
    position === 'above' ? 'popoverFadeInUp' : 'popoverFadeInDown';

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClassName ?? defaultButtonClass}
      >
        {children ?? (
          <>
            <LogOut className="h-4 w-4" /> Logout
          </>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          className={`absolute ${popoverPositionClass} z-50 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl`}
          style={{
            animation: `${animationName} 150ms ease-out`,
          }}
        >
          <p className="text-sm font-semibold text-slate-800 mb-1">Confirm Logout</p>
          <p className="text-xs text-slate-500 mb-4">
            Are you sure you want to log out of the system?
          </p>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmLogout}
              className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition"
            >
              Log Out
            </button>
          </div>
        </div>
      )}

      {/* Inline keyframes for the fade-in animations */}
      {open && (
        <style>{`
          @keyframes popoverFadeInDown {
            from { opacity: 0; transform: translateY(-4px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes popoverFadeInUp {
            from { opacity: 0; transform: translateY(4px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      )}
    </div>
  );
};
