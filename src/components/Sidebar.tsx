import { BookOpen, FileText, LayoutDashboard, Settings, TrendingUp, UserCog, Users } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getApplicantsFromSupabase, getApplicants } from '../lib/recruitmentData';
import '../styles/sidebar.css';

type AdminRole = 'super-admin' | 'rsp' | 'lnd' | 'pm';

interface SidebarProps {
  activeModule?: string;
  userRole?: AdminRole;
}

interface MenuItem {
  path: string;
  icon: any;
  label: string;
  sublabel: string;
  isActive: boolean;
  roles: AdminRole[];
  badge?: string;
}

export const Sidebar = ({ activeModule, userRole }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [qualifiedCount, setQualifiedCount] = useState(0);

  // Function to update qualified applicant count
  const updateQualifiedCount = async () => {
    try {
      // Try Supabase first (source of truth)
      const applicants = await getApplicantsFromSupabase();
      const count = applicants.filter((a) => {
        const s = (a.status || '').toLowerCase();
        return s.includes('qualified') || s.includes('recommend') || s.includes('hired');
      }).length;
      setQualifiedCount(count);
    } catch (err) {
      // Fallback to localStorage
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
    // Initial load
    void updateQualifiedCount();

    // Listen for applicant updates
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
  const activeAdminModule = new URLSearchParams(location.search).get('module') ?? 'dashboard';
  const isSuperAdmin = resolvedRole === 'super-admin';
  const isRspRole = resolvedRole === 'rsp';

  const getPath = (module: 'dashboard' | 'rsp' | 'lnd' | 'pm' | 'settings', defaultPath: string) =>
    isSuperAdmin ? `/admin?module=${module}` : defaultPath;
  
  const menuItems: MenuItem[] = [
    {
      path: getPath('dashboard', '/admin'),
      icon: LayoutDashboard,
      label: 'Dashboard',
      sublabel: 'Overview',
      isActive: isSuperAdmin
        ? location.pathname === '/admin' && activeAdminModule === 'dashboard'
        : location.pathname === '/admin',
      roles: ['super-admin']
    },
    {
      path: getPath('rsp', '/admin/rsp'),
      icon: Users,
      label: 'RSP',
      sublabel: 'Recruitment, Selection & Placement',
      isActive: isSuperAdmin
        ? location.pathname === '/admin' && activeAdminModule === 'rsp'
        : location.pathname === '/admin/rsp' || location.pathname === '/admin/jobs' || location.pathname === '/admin/raters',
      roles: ['super-admin', 'rsp']
    },
    {
      path: getPath('lnd', '/admin/lnd'),
      icon: BookOpen,
      label: 'L&D Management',
      sublabel: 'Learning & Development',
      isActive: isSuperAdmin
        ? location.pathname === '/admin' && activeAdminModule === 'lnd'
        : location.pathname === '/admin/lnd' || location.pathname === '/admin/lnd/manage',
      roles: ['super-admin', 'lnd']
    },
    {
      path: getPath('pm', '/admin/pm'),
      icon: TrendingUp,
      label: 'Performance Management',
      sublabel: 'Performance Management',
      isActive: isSuperAdmin
        ? location.pathname === '/admin' && activeAdminModule === 'pm'
        : location.pathname === '/admin/pm' || location.pathname === '/admin/pm/manage',
      roles: ['super-admin', 'pm']
    },
    {
      path: '/admin/users',
      icon: UserCog,
      label: 'User Management',
      sublabel: '',
      isActive: location.pathname === '/admin/users',
      roles: ['super-admin']
    },
    {
      path: '/admin/reports',
      icon: FileText,
      label: 'Reports',
      sublabel: '',
      isActive: location.pathname === '/admin/reports',
      roles: ['super-admin']
    },
    {
      path: getPath('settings', '/admin/settings'),
      icon: Settings,
      label: 'Settings',
      sublabel: '',
      isActive: isSuperAdmin
        ? location.pathname === '/admin' && activeAdminModule === 'settings'
        : location.pathname === '/admin/settings',
      roles: ['super-admin']
    }
  ];

  const rspMenuItems: MenuItem[] = [
    {
      path: '/admin/rsp',
      icon: LayoutDashboard,
      label: 'Dashboard',
      sublabel: '',
      isActive: location.pathname === '/admin/rsp',
      roles: ['rsp'] as AdminRole[],
    },
    {
      path: '/admin/rsp/jobs',
      icon: FileText,
      label: 'Job Posts',
      sublabel: 'Manage positions',
      isActive: location.pathname === '/admin/rsp/jobs',
      roles: ['rsp'] as AdminRole[],
    },
    {
      path: '/admin/rsp/qualified',
      icon: Users,
      label: 'Qualified Applicants',
      sublabel: 'Ready for interview',
      isActive: location.pathname === '/admin/rsp/qualified',
      roles: ['rsp'] as AdminRole[],
      badge: qualifiedCount > 0 ? qualifiedCount.toString() : undefined,
    },
    {
      path: '/admin/rsp/new-hired',
      icon: Users,
      label: 'Newly Hired',
      sublabel: 'Generate credentials',
      isActive: location.pathname === '/admin/rsp/new-hired',
      roles: ['rsp'] as AdminRole[],
    },
    {
      path: '/admin/rsp/raters',
      icon: UserCog,
      label: 'Rater Management',
      sublabel: 'Access control',
      isActive: location.pathname === '/admin/rsp/raters',
      roles: ['rsp'] as AdminRole[],
    },
    {
      path: '/admin/rsp/accounts',
      icon: Users,
      label: 'Employee Accounts',
      sublabel: 'All employees',
      isActive: location.pathname === '/admin/rsp/accounts',
      roles: ['rsp'] as AdminRole[],
    },
    {
      path: '/admin/rsp/reports',
      icon: FileText,
      label: 'Reports',
      sublabel: '',
      isActive: location.pathname === '/admin/rsp/reports',
      roles: ['rsp'] as AdminRole[],
    },
    {
      path: '/admin/rsp/settings',
      icon: Settings,
      label: 'Settings',
      sublabel: '',
      isActive: location.pathname === '/admin/rsp/settings',
      roles: ['rsp'] as AdminRole[],
    },
  ];

  const sourceMenu = isRspRole ? rspMenuItems : menuItems;

  const filteredMenuItems = sourceMenu.filter(item => {
    // If no role defined for the item, don't show it
    if (!item.roles || item.roles.length === 0) return false;
    // If user has no role, don't show anything
    if (!resolvedRole) return false;
    // Check if user's role is in the allowed roles
    const allowed = item.roles.includes(resolvedRole);
    return allowed;
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>HRIS Admin</h2>
        {activeModule && <span className="sidebar-module">{activeModule}</span>}
      </div>
      
      <nav className="sidebar-nav">
        {filteredMenuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-nav-item ${item.isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <div className="sidebar-nav-text flex-1 flex items-center justify-between">
                <div>
                  <span className="sidebar-nav-title">{item.label}</span>
                  {item.sublabel ? <span className="sidebar-nav-subtitle flex">{item.sublabel}</span> : null}
                </div>
                {item.badge && (
                  <span className="ml-2 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>
      
      <div className="sidebar-footer">
        {session && (
          <div className="sidebar-user">
            <p className="sidebar-user-email">{session.email}</p>
            <p className="sidebar-user-role">{resolvedRole}</p>
          </div>
        )}
      </div>
    </aside>
  );
};
