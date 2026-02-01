import { Link, useLocation } from 'react-router-dom';
import { Users, Briefcase, UserCheck, LayoutDashboard } from 'lucide-react';
import '../styles/sidebar.css';

interface SidebarProps {
  activeModule?: string;
}

export const Sidebar = ({ activeModule }: SidebarProps) => {
  const location = useLocation();
  
  const menuItems = [
    { 
      path: '/admin', 
      icon: LayoutDashboard, 
      label: 'Dashboard',
      isActive: location.pathname === '/admin'
    },
    { 
      path: '/admin/jobs', 
      icon: Briefcase, 
      label: 'Job Management',
      isActive: location.pathname === '/admin/jobs'
    },
    { 
      path: '/admin/raters', 
      icon: UserCheck, 
      label: 'Rater Management',
      isActive: location.pathname === '/admin/raters'
    },
    { 
      path: '/dashboard', 
      icon: Users, 
      label: 'Applicants',
      isActive: location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/evaluate')
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>HRIS Admin</h2>
        {activeModule && <span className="sidebar-module">{activeModule}</span>}
      </div>
      
      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-nav-item ${item.isActive ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      
      <div className="sidebar-footer">
        <p>v1.0.0</p>
      </div>
    </aside>
  );
};
