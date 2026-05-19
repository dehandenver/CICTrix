import {
  BarChart3,
  BookOpen,
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronRight,
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

interface SubItem {
  label: string;
  path: string;
  icon: LucideIcon;
  fixed?: boolean;
  badge?: string;
}

interface NavSection {
  id: string;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  isSection: true;
  items: SubItem[];
  matchPaths: string[];
}

interface NavLink {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  isSection: false;
  matchPaths: string[];
}

type NavEntry = NavSection | NavLink;

const RSP_ITEMS: SubItem[] = [
  { label: 'RSP Dashboard',        path: '/admin?module=rsp',      icon: LayoutDashboard },
  { label: 'Job Posts',             path: '/admin/rsp/jobs',         icon: Briefcase },
  { label: 'Qualified Applicants',  path: '/admin/rsp/qualified',    icon: UserCheck },
  { label: 'Newly Hired',           path: '/admin/rsp/new-hired',    icon: UserPlus },
  { label: 'Rater Management',      path: '/admin/rsp/raters',       icon: UserCog },
  { label: 'Employee Accounts',     path: '/admin/rsp/accounts',     icon: Users },
  { label: 'Reports',               path: '/admin/rsp/reports',      icon: FileText,  fixed: true },
  { label: 'Settings',              path: '/admin/rsp/settings',     icon: Settings,  fixed: true },
];

const LND_ITEMS: SubItem[] = [
  { label: 'L&D Dashboard',      path: '/admin/lnd',                 icon: LayoutDashboard },
  { label: 'Training Courses',   path: '/admin/lnd/manage',          icon: BookOpen },
  { label: 'Seminar Enrollment', path: '/admin/lnd/manage',          icon: Calendar },
  { label: 'Employee Development', path: '/admin/lnd/manage',        icon: TrendingUp },
  { label: 'Reports',            path: '/admin/lnd/manage',          icon: FileText,  fixed: true },
  { label: 'Settings',           path: '/admin/lnd/settings',        icon: Settings,  fixed: true },
];

const PM_ITEMS: SubItem[] = [
  { label: 'PM Dashboard',                path: '/admin/pm',         icon: LayoutDashboard },
  { label: 'Employee Evaluation Status',  path: '/admin/pm',         icon: ClipboardList },
  { label: 'Performance Reviews',         path: '/admin/pm',         icon: FileCheck2 },
  { label: 'Goals & Objectives',          path: '/admin/pm',         icon: Target },
  { label: 'IPCR',                         path: '/admin/pm',         icon: FileText },
  { label: 'Analytics',                   path: '/admin/pm',         icon: BarChart3 },
  { label: 'Reports',                     path: '/admin/pm/manage',  icon: FileText,  fixed: true },
  { label: 'Settings',                    path: '/admin/pm/settings', icon: Settings, fixed: true },
];

const SUPER_ADMIN_NAV: NavEntry[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/admin?module=dashboard',
    isSection: false,
    matchPaths: ['/admin'],
  },
  {
    id: 'rsp',
    label: 'RSP',
    sublabel: 'Recruitment, Selection & Placement',
    icon: Users,
    isSection: true,
    items: RSP_ITEMS,
    matchPaths: ['/admin/rsp'],
  },
  {
    id: 'lnd',
    label: 'L&D Management',
    sublabel: 'Learning & Development',
    icon: BookOpen,
    isSection: true,
    items: LND_ITEMS,
    matchPaths: ['/admin/lnd'],
  },
  {
    id: 'pm',
    label: 'Performance Management',
    sublabel: 'Performance Management',
    icon: TrendingUp,
    isSection: true,
    items: PM_ITEMS,
    matchPaths: ['/admin/pm'],
  },
];

const RSP_ROLE_NAV: NavEntry[] = [
  { id: 'dashboard',   label: 'Dashboard',             icon: LayoutDashboard, path: '/admin/rsp',           isSection: false, matchPaths: ['/admin/rsp'] },
  { id: 'jobs',        label: 'Job Posts',              icon: Briefcase,       path: '/admin/rsp/jobs',      isSection: false, matchPaths: ['/admin/rsp/jobs'] },
  { id: 'qualified',   label: 'Qualified Applicants',  icon: UserCheck,       path: '/admin/rsp/qualified', isSection: false, matchPaths: ['/admin/rsp/qualified'] },
  { id: 'new-hired',   label: 'Newly Hired',            icon: UserPlus,        path: '/admin/rsp/new-hired', isSection: false, matchPaths: ['/admin/rsp/new-hired'] },
  { id: 'raters',      label: 'Rater Management',       icon: UserCog,         path: '/admin/rsp/raters',    isSection: false, matchPaths: ['/admin/rsp/raters'] },
  { id: 'accounts',    label: 'Employee Accounts',      icon: Users,           path: '/admin/rsp/accounts',  isSection: false, matchPaths: ['/admin/rsp/accounts'] },
  { id: 'reports',     label: 'Reports',                icon: FileText,        path: '/admin/rsp/reports',   isSection: false, matchPaths: ['/admin/rsp/reports'] },
  { id: 'settings',    label: 'Settings',               icon: Settings,        path: '/admin/rsp/settings',  isSection: false, matchPaths: ['/admin/rsp/settings'] },
];

const isSectionActive = (section: NavSection, pathname: string, search: string): boolean => {
  const module = new URLSearchParams(search).get('module');
  if (section.id === 'rsp' && (module === 'rsp' || pathname.startsWith('/admin/rsp'))) return true;
  if (section.id === 'lnd' && (module === 'lnd' || pathname.startsWith('/admin/lnd'))) return true;
  if (section.id === 'pm'  && (module === 'pm'  || pathname.startsWith('/admin/pm')))  return true;
  return false;
};

const isItemActive = (item: SubItem, pathname: string, search: string): boolean => {
  const module = new URLSearchParams(search).get('module');
  if (item.path.includes('?module=')) {
    const itemModule = new URLSearchParams(item.path.split('?')[1]).get('module');
    return module === itemModule && pathname === '/admin';
  }
  return pathname === item.path;
};

export const Sidebar = ({ activeModule, userRole }: SidebarProps) => {
  const location = useLocation();
  const [qualifiedCount, setQualifiedCount] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

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

  // Auto-expand active sections on navigation
  useEffect(() => {
    const active = new Set<string>();
    const module = new URLSearchParams(location.search).get('module');
    if (module === 'rsp' || location.pathname.startsWith('/admin/rsp')) active.add('rsp');
    if (module === 'lnd' || location.pathname.startsWith('/admin/lnd')) active.add('lnd');
    if (module === 'pm'  || location.pathname.startsWith('/admin/pm'))  active.add('pm');
    setExpandedSections((prev) => {
      const next = new Set(prev);
      active.forEach((id) => next.add(id));
      return next;
    });
  }, [location.pathname, location.search]);

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

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const nav = isSuperAdmin ? SUPER_ADMIN_NAV : isRspRole ? RSP_ROLE_NAV : SUPER_ADMIN_NAV;

  const renderSuperAdminNav = () => (
    <nav className="sidebar-nav">
      {/* Brand section label */}
      <div className="sidebar-section-group-label">NAVIGATION</div>

      {nav.map((entry) => {
        if (!entry.isSection) {
          // Direct link (Dashboard)
          const link = entry as NavLink;
          const module = new URLSearchParams(location.search).get('module');
          const isActive = location.pathname === '/admin' && (module === 'dashboard' || !module);
          const Icon = link.icon;
          return (
            <Link
              key={link.id}
              to={link.path}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} />
              <span className="sidebar-nav-title">{link.label}</span>
            </Link>
          );
        }

        // Section with sub-items
        const section = entry as NavSection;
        const isExpanded = expandedSections.has(section.id);
        const sectionActive = isSectionActive(section, location.pathname, location.search);
        const Icon = section.icon;

        const mainItems = section.items.filter((i) => !i.fixed);
        const fixedItems = section.items.filter((i) => i.fixed);

        return (
          <div key={section.id} className="sidebar-section-group">
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              className={`sidebar-section-header ${sectionActive ? 'active' : ''}`}
            >
              <div className="sidebar-section-header-left">
                <Icon size={16} />
                <div className="sidebar-section-header-text">
                  <span className="sidebar-nav-title">{section.label}</span>
                  {section.sublabel && (
                    <span className="sidebar-nav-subtitle">{section.sublabel}</span>
                  )}
                </div>
              </div>
              {isExpanded
                ? <ChevronDown size={14} className="sidebar-chevron" />
                : <ChevronRight size={14} className="sidebar-chevron" />
              }
            </button>

            {isExpanded && (
              <div className="sidebar-section-items">
                {mainItems.map((item) => {
                  const ItemIcon = item.icon;
                  const active = isItemActive(item, location.pathname, location.search);
                  return (
                    <Link
                      key={item.label}
                      to={item.path}
                      className={`sidebar-sub-item ${active ? 'active' : ''}`}
                    >
                      <ItemIcon size={14} />
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="sidebar-sub-badge">{item.badge}</span>
                      )}
                    </Link>
                  );
                })}

                {fixedItems.length > 0 && (
                  <>
                    <div className="sidebar-fixed-divider" />
                    {fixedItems.map((item) => {
                      const ItemIcon = item.icon;
                      const active = isItemActive(item, location.pathname, location.search);
                      return (
                        <Link
                          key={item.label}
                          to={item.path}
                          className={`sidebar-sub-item sidebar-sub-item--fixed ${active ? 'active' : ''}`}
                        >
                          <ItemIcon size={14} />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  const renderRspNav = () => (
    <nav className="sidebar-nav">
      <div className="sidebar-section-group-label">RSP PORTAL</div>
      {RSP_ROLE_NAV.map((rawEntry) => {
        if (rawEntry.isSection) return null;
        const entry = rawEntry as NavLink;
        const Icon = entry.icon;
        const isActive = location.pathname === entry.path;
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
  );

  return (
    <aside className="sidebar">
      {/* Sidebar brand header */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <LayoutDashboard size={16} />
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">ABYAN HRIS</span>
          <span className="sidebar-brand-sub">
            {isSuperAdmin ? 'Super Admin' : isRspRole ? 'RSP Portal' : 'Admin Portal'}
          </span>
        </div>
      </div>

      {isSuperAdmin ? renderSuperAdminNav() : renderRspNav()}

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
