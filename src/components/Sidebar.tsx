import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, BookOpen, TrendingUp, UserCog, FileText, Settings } from 'lucide-react';
import '../styles/sidebar.css';

type AdminRole = 'super-admin' | 'rsp' | 'lnd' | 'pm';

interface SidebarProps {
  activeModule?: string;
  userRole?: AdminRole;
}

export const Sidebar = ({ activeModule, userRole }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
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

  const getPath = (module: 'dashboard' | 'rsp' | 'lnd' | 'pm' | 'settings', defaultPath: string) =>
    isSuperAdmin ? `/admin?module=${module}` : defaultPath;
  
  const menuItems = [
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

  const filteredMenuItems = menuItems.filter(item => 
    !item.roles || item.roles.includes(resolvedRole as string)
  );

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
              <span className="sidebar-nav-text">
                <span className="sidebar-nav-title">{item.label}</span>
                {item.sublabel ? <span className="sidebar-nav-subtitle">{item.sublabel}</span> : null}
              </span>
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
        <button
          type="button"
          className="sidebar-logout"
          onClick={() => {
            localStorage.removeItem('cictrix_admin_session');
            navigate('/admin/login');
          }}
        >
          Log out
        </button>
      </div>
    </aside>
  );
};
