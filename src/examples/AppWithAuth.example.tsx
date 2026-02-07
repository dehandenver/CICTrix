/**
 * COMPLETE EXAMPLE: How to integrate Auth Context with your React App
 * 
 * This shows the full setup with routing, protected routes, and role-based navigation
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { RoleBasedSidebar } from '../components/RoleBasedSidebar';
import { RoleDashboard, ConditionalDashboard } from '../components/RoleDashboard';

// Import your existing components
// import LoginPage from '../modules/admin/LoginPage';
// import SuperAdminDashboard from '../modules/admin/SuperAdminDashboard';
// etc.

/**
 * Main App Component with Authentication
 */
function AppWithAuth() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Protected Routes - Require Authentication */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Navigate to="/dashboard" replace />
              </ProtectedRoute>
            }
          />

          {/* Main Dashboard - Redirects based on role */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <RoleDashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Conditional Dashboard - Shows different content by role */}
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <ConditionalDashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Admin Only Routes */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <DashboardLayout>
                  {/* <SuperAdminDashboard /> */}
                  <div>Super Admin Dashboard</div>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <DashboardLayout>
                  <div>User Management</div>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* RSP Routes (Recruitment) */}
          <Route
            path="/recruitment"
            element={
              <ProtectedRoute allowedRoles={['RSP', 'Admin']}>
                <DashboardLayout>
                  {/* <RSPDashboard /> */}
                  <div>RSP Dashboard</div>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/applicants"
            element={
              <ProtectedRoute allowedRoles={['RSP', 'Admin', 'INTERVIEWER']}>
                <DashboardLayout>
                  <div>Applicants List</div>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* PM Routes (Planning) */}
          <Route
            path="/planning"
            element={
              <ProtectedRoute allowedRoles={['PM', 'Admin']}>
                <DashboardLayout>
                  {/* <PMDashboard /> */}
                  <div>PM Dashboard</div>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/resources"
            element={
              <ProtectedRoute allowedRoles={['PM', 'Admin']}>
                <DashboardLayout>
                  <div>Resource Allocation</div>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* LND Routes (Learning & Development) */}
          <Route
            path="/training"
            element={
              <ProtectedRoute allowedRoles={['LND', 'Admin']}>
                <DashboardLayout>
                  {/* <LNDDashboard /> */}
                  <div>Training Programs</div>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Interviewer/Rater Routes */}
          <Route
            path="/evaluations"
            element={
              <ProtectedRoute allowedRoles={['RATER', 'INTERVIEWER', 'Admin']}>
                <DashboardLayout>
                  <div>Evaluations</div>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

/**
 * Dashboard Layout with Sidebar
 * Wraps content with role-based navigation
 */
const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-gray-100">
      <RoleBasedSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
};

/**
 * Login Page Component
 */
const LoginPage: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-3xl font-bold text-center mb-6">Sign In</h2>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
};

/**
 * Unauthorized Page
 */
const UnauthorizedPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-red-500 mb-4">403</h1>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Access Denied</h2>
        <p className="text-gray-600 mb-6">
          You don't have permission to access this resource.
        </p>
        <a
          href="/dashboard"
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
};

export default AppWithAuth;
