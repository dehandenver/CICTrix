import {
  BarChart3,
  BookOpen,
  Briefcase,
  Calendar,
  ClipboardList,
  FileCheck2,
  FileText,
  LayoutDashboard,
  Settings,
  Target,
  TrendingUp,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getApplicantsFromSupabase, getApplicants } from '../lib/recruitmentData';
import '../styles/sidebar.css';

type AdminRole = 'super-admin' | 'rsp' | 'lnd' | 'pm';

interface SidebarProps {
  activeModule?: string;
  userRole?: AdminRole;
}

interface NavLink {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
}

// Super Admin: global viewer only — read-only overview, NO CRUD access to portals
const SUPER_ADMIN_NAV: NavLink[] = [
  { id: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard, path: '/admin?module=dashboard' },
  { id: 'rsp-reports', label: 'RSP Reports', icon: Users,           path: '/admin?module=rsp'       },
  { id: 'lnd-reports', label: 'L&D Reports', icon: BookOpen,        path: '/admin?module=lnd'       },
  { id: 'pm-reports',  label: 'PM Reports',  icon: TrendingUp,      path: '/admin?module=pm'        },
  { id: 'settings',    label: 'Settings',    icon: Settings,        path: '/admin?module=settings'  },
];

// RSP Admin: isolated CRUD portal — not accessible by other roles
const RSP_ROLE_NAV: NavLink[] = [
  { id: 'dashboard',  label: 'Dashboard',            icon: LayoutDashboard, path: '/admin/rsp'           },
  { id: 'jobs',       label: 'Job Posts',             icon: Briefcase,       path: '/admin/rsp/jobs'      },
  { id: 'qualified',  label: 'Qualified Applicants', icon: UserCheck,       path: '/admin/rsp/qualified' },
  { id: 'new-hired',  label: 'Newly Hired',           icon: UserPlus,        path: '/admin/rsp/new-hired' },
  { id: 'raters',     label: 'Rater Management',      icon: UserCog,         path: '/admin/rsp/raters'    },
  { id: 'accounts',   label: 'Employee Accounts',     icon: Users,           path: '/admin/rsp/accounts'  },
  { id: 'reports',    label: 'Reports',               icon: FileText,        path: '/admin/rsp/reports'   },
  { id: 'settings',   label: 'Settings',              icon: Settings,        path: '/admin/rsp/settings'  },
];

// L&D Admin: isolated CRUD portal — not accessible by other roles
const LND_ROLE_NAV: NavLink[] = [
  { id: 'dashboard',       label: 'L&D Dashboard',       icon: LayoutDashboard, path: '/admin/lnd'          },
  { id: 'courses',         label: 'Training Courses',     icon: BookOpen,        path: '/admin/lnd/manage'   },
  { id: 'seminars',        label: 'Seminar Enrollment',   icon: Calendar,        path: '/admin/lnd/manage'   },
  { id: 'development',     label: 'Employee Development', icon: TrendingUp,      path: '/admin/lnd/manage'   },
  { id: 'employee-directory', label: 'Employee Directory', icon: Users,           path: '/admin/lnd/employees' },
  { id: 'reports',         label: 'Reports',              icon: FileText,        path: '/admin/lnd/manage'   },
  { id: 'settings',        label: 'Settings',             icon: Settings,        path: '/admin/lnd/settings' },
];

// PM Admin: isolated CRUD portal — not accessible by other roles
const PM_ROLE_NAV: NavLink[] = [
  { id: 'dashboard',   label: 'PM Dashboard',        icon: LayoutDashboard, path: '/admin/pm'           },
  { id: 'evaluation',  label: 'Employee Evaluation', icon: ClipboardList,   path: '/admin/pm'           },
  { id: 'reviews',     label: 'Performance Reviews', icon: FileCheck2,      path: '/admin/pm'           },
  { id: 'goals',       label: 'Goals & Objectives',  icon: Target,          path: '/admin/pm'           },
  { id: 'ipcr',        label: 'IPCR',                icon: FileText,        path: '/admin/pm'           },
  { id: 'analytics',   label: 'Analytics',           icon: BarChart3,       path: '/admin/pm'           },
  { id: 'reports',     label: 'Reports',             icon: FileText,        path: '/admin/pm/manage'    },
  { id: 'settings',    label: 'Settings',            icon: Settings,        path: '/admin/pm/settings'  },
];

export const Sidebar = ({ userRole }: SidebarProps) => {
  const location = useLocation();
  const [qualifiedCount, setQualifiedCount] = useState(0);

  const updateQualifiedCount = async () => {
    try {
      const applicants = await getApplicantsFromSupabase();
      const count = applicants.filter((a) => {
        const s = (a.status || '').toLowerCase();
        return s.includes('qualified') || s.includes('recommend') || s.includes('hired');
      }).length;
      setQualifiedCount(count);
    } catch {
      try {
        const applicants = getApplicants();
        const count = applicants.filter((a) => {
          const s = (a.status || '').toLowerCase();
          return s.includes('qualified') || s.includes('recommend') || s.includes('hired');
        }).length;
        setQualifiedCount(count);
      } catch (fallbackErr) {
        console.error('Failed to get applicants for sidebar badge:', fallbackErr);
      }
    }
  };

  useEffect(() => {
    void updateQualifiedCount();
    window.addEventListener('cictrix:applicants-updated', updateQualifiedCount);
    return () => window.removeEventListener('cictrix:applicants-updated', updateQualifiedCount);
  }, []);

  const sessionRaw = localStorage.getItem('cictrix_admin_session');
  let session: { email: string; role: AdminRole } | null = null;
  try {
    session = sessionRaw ? (JSON.parse(sessionRaw) as { email: string; role: AdminRole }) : null;
  } catch {
    session = null;
  }

  const resolvedRole = userRole ?? session?.role;
  const isSuperAdmin = resolvedRole === 'super-admin';
  const isRspRole   = resolvedRole === 'rsp';
  const isLndRole   = resolvedRole === 'lnd';
  const isPmRole    = resolvedRole === 'pm';

  const nav = isSuperAdmin ? SUPER_ADMIN_NAV
    : isRspRole ? RSP_ROLE_NAV
    : isLndRole ? LND_ROLE_NAV
    : isPmRole  ? PM_ROLE_NAV
    : SUPER_ADMIN_NAV;

  const portalLabel = isSuperAdmin ? 'NAVIGATION'
    : isRspRole ? 'RSP PORTAL'
    : isLndRole ? 'L&D PORTAL'
    : isPmRole  ? 'PM PORTAL'
    : 'NAVIGATION';

  const getIsActive = (entry: NavLink): boolean => {
    if (isSuperAdmin) {
      const module = new URLSearchParams(location.search).get('module');
      if (entry.id === 'dashboard')   return location.pathname === '/admin' && (!module || module === 'dashboard');
      if (entry.id === 'rsp-reports') return location.pathname === '/admin' && module === 'rsp';
      if (entry.id === 'lnd-reports') return location.pathname === '/admin' && module === 'lnd';
      if (entry.id === 'pm-reports')  return location.pathname === '/admin' && module === 'pm';
      if (entry.id === 'settings')    return location.pathname === '/admin' && module === 'settings';
      return false;
    }
    return location.pathname === entry.path;
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <LayoutDashboard size={16} />
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">ABYAN HRIS</span>
          <span className="sidebar-brand-sub">
            {isSuperAdmin ? 'Super Admin'
              : isRspRole ? 'RSP Portal'
              : isLndRole ? 'L&D Portal'
              : isPmRole  ? 'PM Portal'
              : 'Admin Portal'}
          </span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-group-label">{portalLabel}</div>
        {nav.map((entry) => {
          const Icon = entry.icon;
          const isActive = getIsActive(entry);
          return (
            <Link
              key={entry.id}
              to={entry.path}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} />
              <div className="sidebar-nav-text">
                <span className="sidebar-nav-title">{entry.label}</span>
              </div>
              {entry.id === 'qualified' && qualifiedCount > 0 && (
                <span className="sidebar-sub-badge">{qualifiedCount}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {session && (
          <div className="sidebar-user">
            <p className="sidebar-user-email">{session.email}</p>
            <p className="sidebar-user-role">{resolvedRole?.replace('-', ' ')}</p>
          </div>
        )}
      </div>
    </aside>
  );
};
