# Role-Based Authentication System - Implementation Guide

## 📋 Overview

This authentication system provides complete role-based access control for your HR Management System using React Context, Supabase, and TypeScript.

## 🎯 Features Created

✅ **AuthContext Provider** - Global authentication state management  
✅ **Protected Routes** - Prevent unauthorized access to specific pages  
✅ **Role-Based Navigation** - Dynamic sidebar filtering by user role  
✅ **Conditional Dashboards** - Different content for different roles  
✅ **Auto-Redirect Logic** - Users land on appropriate dashboard after login  

## 📁 Files Created

```
src/
├── contexts/
│   └── AuthContext.tsx           # Auth provider and useAuth hook
├── components/
│   ├── ProtectedRoute.tsx        # Route protection wrapper
│   ├── RoleBasedSidebar.tsx      # Dynamic navigation sidebar
│   └── RoleDashboard.tsx         # Role-specific dashboards
├── utils/
│   └── navigation.ts             # Navigation filtering utilities
└── examples/
    └── AppWithAuth.example.tsx   # Complete integration example
```

## 🚀 Quick Start

### 1. Wrap Your App with AuthProvider

Update your `src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
```

### 2. Update Your App.tsx with Protected Routes

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RoleBasedSidebar } from './components/RoleBasedSidebar';
import LoginPage from './modules/admin/LoginPage';
import SuperAdminDashboard from './modules/admin/SuperAdminDashboard';
import RSPDashboard from './modules/admin/RSPDashboard';
import PMDashboard from './modules/admin/PMDashboard';
import LNDDashboard from './modules/admin/LNDDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Protected routes */}
        <Route path="/" element={
          <ProtectedRoute>
            <Navigate to="/dashboard" replace />
          </ProtectedRoute>
        } />
        
        {/* Admin only */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['Admin']}>
            <DashboardLayout>
              <SuperAdminDashboard />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        
        {/* RSP only */}
        <Route path="/recruitment" element={
          <ProtectedRoute allowedRoles={['RSP', 'Admin']}>
            <DashboardLayout>
              <RSPDashboard />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        
        {/* PM only */}
        <Route path="/planning" element={
          <ProtectedRoute allowedRoles={['PM', 'Admin']}>
            <DashboardLayout>
              <PMDashboard />
            </DashboardLayout>
          </ProtectedRoute>
        } />
        
        {/* LND only */}
        <Route path="/training" element={
          <ProtectedRoute allowedRoles={['LND', 'Admin']}>
            <DashboardLayout>
              <LNDDashboard />
            </DashboardLayout>
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

// Layout with sidebar
const DashboardLayout = ({ children }) => (
  <div className="flex min-h-screen">
    <RoleBasedSidebar />
    <main className="flex-1 p-6 bg-gray-100">
      {children}
    </main>
  </div>
);

export default App;
```

### 3. Update Your Login Page

Replace the content of `src/modules/admin/LoginPage.tsx` with auth integration:

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      navigate('/dashboard'); // Auto-redirects to role-specific dashboard
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
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
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

## 🎨 Use Cases & Examples

### Using the Auth Hook in Any Component

```tsx
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { user, profile, role, isAdmin, hasRole, signOut } = useAuth();
  
  return (
    <div>
      <p>Welcome, {profile?.name || user?.email}</p>
      <p>Your role: {role}</p>
      
      {isAdmin() && <button>Admin Action</button>}
      
      {hasRole('RSP', 'Admin') && <button>Recruitment Action</button>}
      
      <button onClick={signOut}>Logout</button>
    </div>
  );
}
```

### Conditional Rendering Based on Role

```tsx
import { useAuth } from '../contexts/AuthContext';

function Dashboard() {
  const { isAdmin, hasRole } = useAuth();
  
  return (
    <div>
      <h1>Dashboard</h1>
      
      {/* Show to everyone */}
      <section>Welcome Message</section>
      
      {/* Admin only */}
      {isAdmin() && (
        <section>
          <h2>Admin Controls</h2>
          <button>Manage Users</button>
        </section>
      )}
      
      {/* RSP workers only */}
      {hasRole('RSP') && (
        <section>
          <h2>Recruitment Tools</h2>
          <button>View Applicants</button>
        </section>
      )}
      
      {/* PM or Admin */}
      {hasRole('PM', 'Admin') && (
        <section>
          <h2>Project Planning</h2>
          <button>View Projects</button>
        </section>
      )}
    </div>
  );
}
```

### Custom Navigation Filtering

```tsx
import { useAuth } from '../contexts/AuthContext';
import { getNavigationForRole, canAccessPath } from '../utils/navigation';

function CustomNav() {
  const { role } = useAuth();
  const navItems = getNavigationForRole(role);
  
  // Check if user can access a specific path
  const canViewReports = canAccessPath('/reports', role);
  
  return (
    <nav>
      {navItems.map(item => (
        <a key={item.path} href={item.path}>
          {item.icon} {item.label}
        </a>
      ))}
    </nav>
  );
}
```

## 🔐 Role Definitions

| Role | Access Level | Typical Use Case |
|------|-------------|------------------|
| **Admin** | Full access to all routes | System administrators |
| **RSP** | Recruitment & Staffing | Recruitment team, view applicants |
| **PM** | Project Management | Project managers, resource planning |
| **LND** | Learning & Development | Training coordinators |
| **RATER** | Evaluations | Assessment of applicants/employees |
| **INTERVIEWER** | Interviews & Evaluations | Conduct interviews |
| **APPLICANT** | Application forms | Job applicants |

## 📝 Important Notes

### Supabase Setup Required

Your `profiles` table must exist in Supabase with this structure:

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT CHECK (role IN ('Admin', 'RSP', 'PM', 'LND', 'RATER', 'INTERVIEWER', 'APPLICANT')),
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'Admin'
    )
  );
```

### Auto-Create Profile on User Signup

Create a database trigger to automatically create a profile when a user signs up:

```sql
-- Function to create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, role)
  VALUES (NEW.id, NEW.email, 'APPLICANT'); -- Default role
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## 🎯 Common Patterns

### Redirect After Login

The `RoleDashboard` component automatically handles this:

```tsx
// In your routes
<Route path="/dashboard" element={
  <ProtectedRoute>
    <RoleDashboard />
  </ProtectedRoute>
} />
```

It will redirect:
- Admin → `/admin/dashboard`
- RSP → `/recruitment`
- PM → `/planning`
- LND → `/training`
- Etc.

### Prevent URL Hacking

The `ProtectedRoute` component prevents users from accessing URLs they shouldn't:

```tsx
// RSP user tries to access /admin/users
<Route path="/admin/users" element={
  <ProtectedRoute allowedRoles={['Admin']}>
    <UserManagement />
  </ProtectedRoute>
} />
// Result: Shows "Access Denied" message
```

### Loading States

All components handle loading states automatically:

```tsx
const { loading } = useAuth();

if (loading) {
  return <div>Loading...</div>;
}
```

## 🔄 Testing

### Test Different Roles

1. Create test users in Supabase Auth
2. Set their roles in the `profiles` table
3. Login and verify navigation/access

```sql
-- Set a user as Admin
UPDATE profiles SET role = 'Admin' WHERE email = 'admin@example.com';

-- Set a user as RSP
UPDATE profiles SET role = 'RSP' WHERE email = 'recruiter@example.com';
```

## 🐛 Troubleshooting

### "useAuth must be used within AuthProvider"

**Solution:** Make sure `<AuthProvider>` wraps your entire app in `main.tsx`

### User role is null

**Solution:** Check that:
1. `profiles` table exists
2. User has a profile record with a role
3. RLS policies allow reading the profile

### Navigation not filtering

**Solution:** Verify the role names in `navigation.ts` match your `profiles.role` exactly (case-sensitive)

## 📚 Next Steps

1. ✅ Integrate with your existing dashboard components
2. ✅ Update your sidebar to use `<RoleBasedSidebar />`
3. ✅ Add role checks to sensitive actions
4. ✅ Test with multiple user roles
5. ✅ Implement role management for admins

## 🤝 Support

- Review the example file: `src/examples/AppWithAuth.example.tsx`
- Check component comments for inline documentation
- All functions are fully typed with TypeScript

---

**Your authentication system is now ready! 🎉**
