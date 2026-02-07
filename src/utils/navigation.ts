import { UserRole } from '../contexts/AuthContext';

/**
 * Navigation item interface
 */
export interface NavItem {
  label: string;
  path: string;
  icon?: string;
  roles: UserRole[]; // Roles that can see this nav item
  description?: string;
}

/**
 * Complete navigation structure for the HR Management System
 * Each item specifies which roles can access it
 */
export const navigationItems: NavItem[] = [
  // Dashboard - All authenticated users
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: '📊',
    roles: ['Admin', 'RSP', 'PM', 'LND', 'RATER', 'INTERVIEWER'],
    description: 'Main dashboard overview',
  },

  // Recruitment Section - RSP and Admin
  {
    label: 'Applicants',
    path: '/applicants',
    icon: '👥',
    roles: ['Admin', 'RSP', 'INTERVIEWER'],
    description: 'Manage job applicants',
  },
  {
    label: 'Recruitment',
    path: '/recruitment',
    icon: '📋',
    roles: ['Admin', 'RSP'],
    description: 'Recruitment management',
  },

  // Planning Section - PM and Admin
  {
    label: 'Project Planning',
    path: '/planning',
    icon: '📅',
    roles: ['Admin', 'PM'],
    description: 'Project management and planning',
  },
  {
    label: 'Resource Allocation',
    path: '/resources',
    icon: '🎯',
    roles: ['Admin', 'PM'],
    description: 'Allocate resources to projects',
  },

  // Learning & Development - LND and Admin
  {
    label: 'Training Programs',
    path: '/training',
    icon: '📚',
    roles: ['Admin', 'LND'],
    description: 'Manage training programs',
  },
  {
    label: 'Employee Development',
    path: '/development',
    icon: '🎓',
    roles: ['Admin', 'LND'],
    description: 'Track employee development',
  },

  // Evaluations - Raters, Interviewers, Admin
  {
    label: 'Evaluations',
    path: '/evaluations',
    icon: '⭐',
    roles: ['Admin', 'RATER', 'INTERVIEWER'],
    description: 'Evaluate applicants and employees',
  },
  {
    label: 'Interview Schedule',
    path: '/interviews',
    icon: '🗓️',
    roles: ['Admin', 'INTERVIEWER', 'RSP'],
    description: 'Manage interview schedules',
  },

  // Admin Only
  {
    label: 'User Management',
    path: '/admin/users',
    icon: '👤',
    roles: ['Admin'],
    description: 'Manage system users',
  },
  {
    label: 'Reports',
    path: '/reports',
    icon: '📈',
    roles: ['Admin'],
    description: 'Generate system reports',
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: '⚙️',
    roles: ['Admin'],
    description: 'System settings',
  },
];

/**
 * Filter navigation items based on user role
 * Admins see everything, other roles see only their authorized items
 * 
 * @param userRole - Current user's role
 * @returns Filtered array of navigation items
 * 
 * Example:
 * const { role } = useAuth();
 * const visibleNav = getNavigationForRole(role);
 */
export const getNavigationForRole = (userRole: UserRole | null): NavItem[] => {
  if (!userRole) return [];

  // Admin sees everything
  if (userRole === 'Admin') {
    return navigationItems;
  }

  // Filter items based on user's role
  return navigationItems.filter((item) => item.roles.includes(userRole));
};

/**
 * Check if a user can access a specific path
 * 
 * @param path - Route path to check
 * @param userRole - User's role
 * @returns boolean indicating if user can access the path
 * 
 * Example:
 * const canAccess = canAccessPath('/admin/users', 'RSP'); // false
 * const canAccess = canAccessPath('/recruitment', 'RSP'); // true
 */
export const canAccessPath = (path: string, userRole: UserRole | null): boolean => {
  if (!userRole) return false;
  if (userRole === 'Admin') return true;

  const navItem = navigationItems.find((item) => item.path === path);
  if (!navItem) return false;

  return navItem.roles.includes(userRole);
};

/**
 * Get the default redirect path based on user role
 * Used after login to redirect users to their appropriate dashboard
 * 
 * @param userRole - User's role
 * @returns Default path for the role
 */
export const getDefaultPathForRole = (userRole: UserRole): string => {
  switch (userRole) {
    case 'Admin':
      return '/admin/dashboard';
    case 'RSP':
      return '/recruitment';
    case 'PM':
      return '/planning';
    case 'LND':
      return '/training';
    case 'RATER':
    case 'INTERVIEWER':
      return '/evaluations';
    case 'APPLICANT':
      return '/applicant/dashboard';
    default:
      return '/dashboard';
  }
};

/**
 * Group navigation items by category for sidebar display
 * 
 * @param userRole - Current user's role
 * @returns Object with categorized navigation items
 */
export const getGroupedNavigation = (userRole: UserRole | null) => {
  const items = getNavigationForRole(userRole);

  return {
    main: items.filter((item) => ['Dashboard'].includes(item.label)),
    recruitment: items.filter((item) =>
      ['Applicants', 'Recruitment', 'Interview Schedule'].includes(item.label)
    ),
    planning: items.filter((item) =>
      ['Project Planning', 'Resource Allocation'].includes(item.label)
    ),
    learning: items.filter((item) =>
      ['Training Programs', 'Employee Development'].includes(item.label)
    ),
    evaluation: items.filter((item) => ['Evaluations'].includes(item.label)),
    admin: items.filter((item) =>
      ['User Management', 'Reports', 'Settings'].includes(item.label)
    ),
  };
};
