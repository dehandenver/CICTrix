import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getNavigationForRole, getGroupedNavigation } from '../utils/navigation';

/**
 * RoleBasedSidebar Component
 * Displays navigation links filtered by user role
 * Admins see all links, other roles see only their authorized sections
 */
export const RoleBasedSidebar: React.FC = () => {
  const { role, profile, signOut } = useAuth();
  const location = useLocation();

  // Get navigation items for current user's role
  const navItems = getNavigationForRole(role);
  const groupedNav = getGroupedNavigation(role);

  /**
   * Check if a path is currently active
   */
  const isActive = (path: string): boolean => {
    return location.pathname === path;
  };

  return (
    <aside className="w-64 bg-gray-800 text-white min-h-screen flex flex-col">
      {/* User Info Section */}
      <div className="p-4 bg-gray-900">
        <h2 className="text-xl font-bold mb-1">CICTrix HRIS</h2>
        <div className="text-sm text-gray-400">
          <p className="font-medium text-white">{profile?.name || profile?.email}</p>
          <p className="text-xs">
            <span className="inline-block px-2 py-1 bg-blue-600 rounded mt-1">
              {role}
            </span>
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto py-4">
        {/* Main Section */}
        {groupedNav.main.length > 0 && (
          <div className="mb-6">
            <h3 className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Main
            </h3>
            {groupedNav.main.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-2 hover:bg-gray-700 transition ${
                  isActive(item.path) ? 'bg-gray-700 border-l-4 border-blue-500' : ''
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Recruitment Section (RSP, Admin) */}
        {groupedNav.recruitment.length > 0 && (
          <div className="mb-6">
            <h3 className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Recruitment
            </h3>
            {groupedNav.recruitment.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-2 hover:bg-gray-700 transition ${
                  isActive(item.path) ? 'bg-gray-700 border-l-4 border-blue-500' : ''
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Planning Section (PM, Admin) */}
        {groupedNav.planning.length > 0 && (
          <div className="mb-6">
            <h3 className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Planning
            </h3>
            {groupedNav.planning.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-2 hover:bg-gray-700 transition ${
                  isActive(item.path) ? 'bg-gray-700 border-l-4 border-blue-500' : ''
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Learning & Development Section (LND, Admin) */}
        {groupedNav.learning.length > 0 && (
          <div className="mb-6">
            <h3 className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Learning & Development
            </h3>
            {groupedNav.learning.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-2 hover:bg-gray-700 transition ${
                  isActive(item.path) ? 'bg-gray-700 border-l-4 border-blue-500' : ''
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Evaluation Section */}
        {groupedNav.evaluation.length > 0 && (
          <div className="mb-6">
            <h3 className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Evaluations
            </h3>
            {groupedNav.evaluation.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-2 hover:bg-gray-700 transition ${
                  isActive(item.path) ? 'bg-gray-700 border-l-4 border-blue-500' : ''
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )}

        {/* Admin Section (Admin only) */}
        {groupedNav.admin.length > 0 && (
          <div className="mb-6">
            <h3 className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Administration
            </h3>
            {groupedNav.admin.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-2 hover:bg-gray-700 transition ${
                  isActive(item.path) ? 'bg-gray-700 border-l-4 border-blue-500' : ''
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Sign Out Button */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={signOut}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded transition"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
};

/**
 * Example Usage:
 * 
 * function DashboardLayout() {
 *   return (
 *     <div className="flex">
 *       <RoleBasedSidebar />
 *       <main className="flex-1 p-6">
 *         <Outlet /> // Your dashboard content
 *       </main>
 *     </div>
 *   );
 * }
 */
