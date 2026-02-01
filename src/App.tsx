import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ApplicantWizard } from './modules/applicant/ApplicantWizard';
import { InterviewerDashboard } from './modules/interviewer/InterviewerDashboard';
import { EvaluationForm } from './modules/interviewer/EvaluationForm';
import { SuperAdminDashboard } from './modules/admin/SuperAdminDashboard';
import { RSPDashboard } from './modules/admin/RSPDashboard';
import { RaterManagementPage } from './modules/admin/RaterManagementPage';
import { LNDDashboard } from './modules/admin/LNDDashboard';
import { PMDashboard } from './modules/admin/PMDashboard';
import { LoginPage } from './modules/admin/LoginPage';
import './styles/globals.css';

type Role = 'super-admin' | 'rsp' | 'lnd' | 'pm';

const AdminRoute = ({
  children,
  session,
  allowedRoles,
}: {
  children: JSX.Element;
  session: { email: string; role: Role } | null;
  allowedRoles?: Role[];
}) => {
  if (!session) {
    return <Navigate to="/admin/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
};

function App() {
  const [adminSession, setAdminSession] = useState<{ email: string; role: Role } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('cictrix_admin_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { email: string; role: Role };
        if (parsed?.email && parsed?.role) {
          setAdminSession(parsed);
        }
      } catch {
        localStorage.removeItem('cictrix_admin_session');
      }
    }
  }, []);

  const handleLogin = (email: string, role: Role) => {
    const session = { email, role };
    setAdminSession(session);
    localStorage.setItem('cictrix_admin_session', JSON.stringify(session));
  };

  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<ApplicantWizard />} />
          <Route path="/dashboard" element={<InterviewerDashboard />} />
          <Route path="/evaluate/:id" element={<EvaluationForm />} />
          <Route path="/admin/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route
            path="/admin"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin']}>
                <SuperAdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <RSPDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/raters"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <RaterManagementPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/lnd"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'lnd']}>
                <LNDDashboard isDashboardView={true} />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/lnd/manage"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'lnd']}>
                <LNDDashboard isDashboardView={false} />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/pm"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'pm']}>
                <PMDashboard isDashboardView={true} />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/pm/manage"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'pm']}>
                <PMDashboard isDashboardView={false} />
              </AdminRoute>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
