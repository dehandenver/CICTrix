import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, BookOpen, TrendingUp, UserCog, FileText, Settings } from 'lucide-react';
import '../styles/sidebar.css';

interface SidebarProps {
  activeModule?: string;
}

export const Sidebar = ({ activeModule }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const sessionRaw = localStorage.getItem('cictrix_admin_session');
  const session = sessionRaw ? (JSON.parse(sessionRaw) as { email: string; role: string }) : null;
  
  const menuItems = [
    {
      path: '/admin',
      icon: LayoutDashboard,
      label: 'Dashboard',
      sublabel: 'Overview',
      isActive: location.pathname === '/admin',
      roles: ['super-admin']
    },
    {
      path: '/admin/rsp',
      icon: Users,
      label: 'RSP',
      sublabel: 'Recruitment, Selection & Placement',
      isActive: location.pathname === '/admin/rsp' || location.pathname === '/admin/jobs' || location.pathname === '/admin/raters',
      roles: ['super-admin', 'rsp']
    },
    {
      path: '/admin/lnd',
      icon: BookOpen,
      label: 'L&D',
      sublabel: 'Learning & Development',
      isActive: location.pathname === '/admin/lnd' || location.pathname === '/admin/lnd/manage',
      roles: ['super-admin', 'lnd']
    },
    {
      path: '/admin/pm',
      icon: TrendingUp,
      label: 'PM',
      sublabel: 'Performance Management',
      isActive: location.pathname === '/admin/pm' || location.pathname === '/admin/pm/manage',
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
      path: '/admin/settings',
      icon: Settings,
      label: 'Settings',
      sublabel: '',
      isActive: location.pathname === '/admin/settings',
      roles: ['super-admin']
    }
  ];

  const filteredMenuItems = menuItems.filter(item => 
    !item.roles || item.roles.includes(session?.role as string)
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
            <p className="sidebar-user-role">{session.role}</p>
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
