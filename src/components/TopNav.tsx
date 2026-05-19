import React, { useState } from 'react';
import abyanLogo from '../assets/abyan-logo.png';
import { 
  UserCircle2, 
  ChevronDown, 
  LogOut, 
  Bell, 
  Info, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Clock 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  time: string;
  type: 'info' | 'success' | 'warning' | 'error';
  unread: boolean;
};

export const TopNav = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('cictrix_admin_session');
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

  // Helper to load role-specific mock notifications
  const getInitialNotifications = (role: string): NotificationItem[] => {
    if (role === 'lnd') {
      return [
        {
          id: 'l1',
          title: 'New Seminar Registration',
          description: 'A-jay Buenjemia registered for Advanced Excel & Data Analysis',
          time: 'Just now',
          type: 'success',
          unread: true,
        },
        {
          id: 'l2',
          title: 'Course Capacity Alert',
          description: 'Communication Skills Workshop has reached 90% slot capacity',
          time: '2 hours ago',
          type: 'warning',
          unread: true,
        },
        {
          id: 'l3',
          title: 'Evaluation Summary Ready',
          description: 'Angelika Ocana submitted feedback for Leadership Development Program',
          time: '1 day ago',
          type: 'info',
          unread: true,
        },
      ];
    }
    if (role === 'rsp') {
      return [
        {
          id: 'r1',
          title: 'New Job Application',
          description: 'Jane Doe submitted an application for the Senior Accountant position',
          time: 'Just now',
          type: 'success',
          unread: true,
        },
        {
          id: 'r2',
          title: 'Evaluation Complete',
          description: 'Mark Johnson scored 94/100 on the Applicant Evaluation & Scoring',
          time: '3 hours ago',
          type: 'info',
          unread: true,
        },
        {
          id: 'r3',
          title: 'Job Posting Published',
          description: 'Human Resource Management Specialist posting is now live',
          time: '1 day ago',
          type: 'success',
          unread: true,
        },
      ];
    }
    if (role === 'pm') {
      return [
        {
          id: 'p1',
          title: 'Appraisal Submitted',
          description: 'Michael Chang submitted Q1 Self-Appraisal ratings',
          time: 'Just now',
          type: 'success',
          unread: true,
        },
        {
          id: 'p2',
          title: 'Performance Target Met',
          description: 'Finance Division completed 100% of Q1 targets',
          time: '4 hours ago',
          type: 'info',
          unread: true,
        },
        {
          id: 'p3',
          title: 'Pending Manager Reviews',
          description: '24 performance evaluations are awaiting supervisor sign-off',
          time: '2 days ago',
          type: 'warning',
          unread: true,
        },
      ];
    }
    // Default super-admin
    return [
      {
        id: 's1',
        title: 'HRIS Backup Completed',
        description: 'Weekly automated database snapshot completed successfully',
        time: '10 minutes ago',
        type: 'success',
        unread: true,
      },
      {
        id: 's2',
        title: 'Security Alert',
        description: 'New administrator login detected from Iloilo City IP 192.168.1.45',
        time: '1 hour ago',
        type: 'error',
        unread: true,
      },
      {
        id: 's3',
        title: 'Database Synchronized',
        description: 'Supabase server synchronization completed: 1,424 records synced',
        time: '5 hours ago',
        type: 'info',
        unread: true,
      },
    ];
  };

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => 
    getInitialNotifications(session.role)
  );

  const unreadCount = notifications.filter(n => n.unread).length;

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  };

  const handleToggleRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, unread: !n.unread } : n));
  };

  const getNotificationIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'success':
        return (
          <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 grid place-content-center flex-shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        );
      case 'warning':
        return (
          <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-600 grid place-content-center flex-shrink-0">
            <AlertTriangle className="h-4 w-4" />
          </div>
        );
      case 'error':
        return (
          <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-600 grid place-content-center flex-shrink-0">
            <ShieldAlert className="h-4 w-4" />
          </div>
        );
      default:
        return (
          <div className="h-8 w-8 rounded-xl bg-blue-50 text-[#363EE8] grid place-content-center flex-shrink-0">
            <Info className="h-4 w-4" />
          </div>
        );
    }
  };

  const displayRoleName = (role: string) => {
    if (role === 'lnd') return 'Learning & Dev';
    if (role === 'rsp') return 'Recruitment (RSP)';
    if (role === 'pm') return 'Performance (PM)';
    return 'Super Admin';
  };

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

      {/* Right side: Notifications & Profile Dropdown */}
      <div className="flex items-center gap-4">
        
        {/* Notification Bell Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              setDropdownOpen(false);
            }}
            className={[
              'relative p-2 rounded-xl transition cursor-pointer focus:outline-none flex items-center justify-center',
              notificationsOpen ? 'bg-white/20' : 'hover:bg-white/10'
            ].join(' ')}
            type="button"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5 text-white" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-[#363EE8]">
                {unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <>
              {/* Click-outside backdrop */}
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setNotificationsOpen(false)}
              />
              {/* Notifications Dropdown Card */}
              <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl py-3 z-50 border border-slate-100 text-slate-700 animate-in fade-in slide-in-from-top-2 duration-150">
                
                {/* Dropdown Header */}
                <div className="px-4 pb-2.5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#040E6B]">Notifications</h3>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                      {displayRoleName(session.role)} Portal
                    </p>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-xs text-[#363EE8] hover:text-[#363EE8]/80 font-bold hover:underline cursor-pointer transition"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                {/* Dropdown Body */}
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-400">
                      No notifications
                    </div>
                  ) : (
                    notifications.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleToggleRead(item.id)}
                        className={[
                          'px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition cursor-pointer select-none',
                          item.unread ? 'bg-slate-50/50' : ''
                        ].join(' ')}
                      >
                        {getNotificationIcon(item.type)}
                        
                        <div className="flex-1 min-w-0 leading-tight">
                          <p className={`text-xs font-bold ${item.unread ? 'text-slate-900' : 'text-slate-600'}`}>
                            {item.title}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            {item.description}
                          </p>
                          <div className="text-[10px] text-slate-400 font-semibold mt-1.5 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {item.time}
                          </div>
                        </div>

                        {item.unread && (
                          <span className="h-2 w-2 rounded-full bg-[#363EE8] mt-1 flex-shrink-0 shadow-sm shadow-[#363EE8]/50" />
                        )}
                      </div>
                    ))
                  )}
                </div>

              </div>
            </>
          )}
        </div>

        {/* Profile Dropdown */}
        <div className="relative">
          <button 
            onClick={() => {
              setDropdownOpen(!dropdownOpen);
              setNotificationsOpen(false);
            }}
            className={[
              'flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition cursor-pointer select-none focus:outline-none',
              dropdownOpen ? 'bg-white/20' : 'hover:bg-white/10'
            ].join(' ')}
            type="button"
          >
            <div className="h-8 w-8 rounded-full bg-white/20 text-white grid place-content-center border border-white/30">
              <UserCircle2 className="h-5 w-5" />
            </div>
            <div className="text-left hidden lg:block leading-tight">
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
                {displayRoleName(session.role)}
              </p>
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
              <div className="absolute right-0 mt-3 w-52 bg-white rounded-2xl shadow-xl py-2 z-50 border border-slate-100 text-slate-700 animate-in fade-in slide-in-from-top-2 duration-100">
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

      </div>
    </header>
  );
};
