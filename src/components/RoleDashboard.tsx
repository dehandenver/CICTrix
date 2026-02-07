import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultPathForRole } from '../utils/navigation';

/**
 * RoleDashboard Component
 * Automatically redirects users to their role-specific dashboard
 * 
 * This is useful as a landing page after login that routes users
 * to the appropriate interface based on their role
 */
export const RoleDashboard: React.FC = () => {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && role) {
      // Get the default path for user's role and redirect
      const defaultPath = getDefaultPathForRole(role);
      navigate(defaultPath, { replace: true });
    }
  }, [role, loading, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return null;
};

/**
 * Example Conditional Dashboard Component
 * Shows different content based on user role
 */
export const ConditionalDashboard: React.FC = () => {
  const { role, isAdmin, hasRole } = useAuth();

  // Admin sees everything
  if (isAdmin()) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <DashboardCard title="Total Users" value="1,234" icon="👥" />
          <DashboardCard title="Active Applicants" value="89" icon="📋" />
          <DashboardCard title="Open Positions" value="12" icon="💼" />
          <DashboardCard title="Pending Evaluations" value="45" icon="⭐" />
        </div>
        
        {/* Admin-only sections */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4">System Overview</h2>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600">
              Full system access granted. You can view and manage all modules.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // RSP Dashboard (Recruitment)
  if (hasRole('RSP')) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Recruitment Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <DashboardCard title="Active Applicants" value="89" icon="📋" />
          <DashboardCard title="Scheduled Interviews" value="15" icon="🗓️" />
          <DashboardCard title="Pending Reviews" value="23" icon="📝" />
        </div>
        
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4">Recent Applicants</h2>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600">
              Your recruitment-specific content goes here...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // PM Dashboard (Planning)
  if (hasRole('PM')) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Project Management Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <DashboardCard title="Active Projects" value="8" icon="📅" />
          <DashboardCard title="Team Members" value="45" icon="👥" />
          <DashboardCard title="Upcoming Deadlines" value="12" icon="⏰" />
        </div>
        
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4">Project Overview</h2>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600">
              Your project management content goes here...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // LND Dashboard (Learning & Development)
  if (hasRole('LND')) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">L&D Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <DashboardCard title="Training Programs" value="24" icon="📚" />
          <DashboardCard title="Enrolled Employees" value="156" icon="🎓" />
          <DashboardCard title="Completion Rate" value="87%" icon="✅" />
        </div>
        
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4">Training Overview</h2>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600">
              Your learning & development content goes here...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Default fallback
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">
          Welcome! Your role: <strong>{role}</strong>
        </p>
      </div>
    </div>
  );
};

/**
 * Reusable Dashboard Card Component
 */
const DashboardCard: React.FC<{
  title: string;
  value: string | number;
  icon: string;
}> = ({ title, value, icon }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
        </div>
        <div className="text-4xl">{icon}</div>
      </div>
    </div>
  );
};
