import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, UserRole } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[]; // Optional: specify allowed roles
  requireAuth?: boolean; // Default true - require authentication
  redirectTo?: string; // Where to redirect if not authorized
}

/**
 * ProtectedRoute Component
 * Wrapper that protects routes from unauthorized access
 * 
 * Usage Examples:
 * 
 * 1. Require any authenticated user:
 *    <ProtectedRoute>
 *      <Dashboard />
 *    </ProtectedRoute>
 * 
 * 2. Require specific roles:
 *    <ProtectedRoute allowedRoles={['Admin', 'PM']}>
 *      <AdminPanel />
 *    </ProtectedRoute>
 * 
 * 3. Admin only:
 *    <ProtectedRoute allowedRoles={['Admin']}>
 *      <SuperAdminDashboard />
 *    </ProtectedRoute>
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  requireAuth = true,
  redirectTo = '/login',
}) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if authentication is required but user is not logged in
  if (requireAuth && !user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // If specific roles are required, check if user has permission
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = profile?.role;

    // No profile or role found
    if (!userRole) {
      return <Navigate to="/unauthorized" replace />;
    }

    // User doesn't have the required role
    if (!allowedRoles.includes(userRole)) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  // User is authenticated and authorized
  return <>{children}</>;
};

/**
 * Example Usage in App Router:
 * 
 * import { BrowserRouter, Routes, Route } from 'react-router-dom';
 * import { AuthProvider } from './contexts/AuthContext';
 * import { ProtectedRoute } from './components/ProtectedRoute';
 * 
 * function App() {
 *   return (
 *     <AuthProvider>
 *       <BrowserRouter>
 *         <Routes>
 *           <Route path="/login" element={<Login />} />
 *           
 *           // Any authenticated user
 *           <Route path="/dashboard" element={
 *             <ProtectedRoute>
 *               <Dashboard />
 *             </ProtectedRoute>
 *           } />
 *           
 *           // Admin only
 *           <Route path="/admin" element={
 *             <ProtectedRoute allowedRoles={['Admin']}>
 *               <SuperAdminDashboard />
 *             </ProtectedRoute>
 *           } />
 *           
 *           // RSP only
 *           <Route path="/recruitment" element={
 *             <ProtectedRoute allowedRoles={['RSP', 'Admin']}>
 *               <RSPDashboard />
 *             </ProtectedRoute>
 *           } />
 *           
 *           // PM only
 *           <Route path="/planning" element={
 *             <ProtectedRoute allowedRoles={['PM', 'Admin']}>
 *               <PMDashboard />
 *             </ProtectedRoute>
 *           } />
 *         </Routes>
 *       </BrowserRouter>
 *     </AuthProvider>
 *   );
 * }
 */
