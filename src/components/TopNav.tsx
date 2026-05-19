import React, { useState } from 'react';
import abyanLogo from '../assets/abyan-logo.png';
import { UserCircle2, ChevronDown, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const TopNav = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('cictrix_admin_session');
    // Also dispatch route-activated event to clean up states
    window.dispatchEvent(new CustomEvent('cictrix:admin-logout'));
    navigate('/admin/login');
  };

  const sessionRaw = localStorage.getItem('cictrix_admin_session');
  let session = { email: 'superadmin@cictrix.gov.ph', role: 'super-admin' };
  try {
    if (sessionRaw) {
      session = JSON.parse(sessionRaw);
    }
  } catch {}

  return (
    <header className="sticky top-0 z-40 bg-[#363EE8] shadow-md px-6 py-3 font-sans flex items-center justify-between text-white h-16 select-none">
      {/* Left side: Logo & Branding */}
      <div className="flex items-center gap-3">
        <img 
          src={abyanLogo} 
          alt="ABYAN Logo" 
          className="h-10 w-auto object-contain bg-white/10 rounded-lg p-1"
        />
        <div className="flex items-baseline gap-2 sm:gap-3">
          <span className="text-xl sm:text-2xl font-bold tracking-tight text-white">ABYAN</span>
          <span className="text-white/60 text-lg hidden sm:inline">|</span>
          <span className="text-[20px] font-semibold text-white/95 hidden md:inline leading-none">
            Human Resource Information System
          </span>
        </div>
      </div>

      {/* Right side: Profile with click-to-logout */}
      <div className="relative">
        <button 
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2.5 hover:bg-white/10 px-3 py-1.5 rounded-xl transition cursor-pointer select-none focus:outline-none"
          type="button"
        >
          <div className="h-8 w-8 rounded-full bg-white/20 text-white grid place-content-center border border-white/30">
            <UserCircle2 className="h-5 w-5" />
          </div>
          <div className="text-left hidden lg:block leading-tight">
            <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Super Admin</p>
            <p className="text-xs font-bold text-white truncate max-w-[150px]">{session.email}</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-white/70 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && (
          <>
            {/* Click-outside backdrop */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setDropdownOpen(false)}
            />
            {/* Dropdown Menu */}
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl py-2 z-50 border border-slate-100 text-slate-700 animate-in fade-in slide-in-from-top-2 duration-100">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">User Account</p>
                <p className="text-sm font-bold text-[#040E6B] truncate mt-0.5">{session.email}</p>
                <p className="text-[10px] text-[#363EE8] font-bold uppercase tracking-wider mt-0.5">
                  {session.role.replace('-', ' ')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition flex items-center gap-2.5"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
};
