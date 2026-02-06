import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ApplicantWizard } from './modules/applicant/ApplicantWizard';
import { InterviewerDashboard } from './modules/interviewer/InterviewerDashboard';
import { InterviewerApplicantsList } from './modules/interviewer/InterviewerApplicantsList';
import { InterviewerLogin } from './modules/interviewer/InterviewerLogin';
import { EvaluationForm } from './modules/interviewer/EvaluationForm';
import { SuperAdminDashboard } from './modules/admin/SuperAdminDashboard';
import { RSPDashboard } from './modules/admin/RSPDashboard';
import { RaterManagementPage } from './modules/admin/RaterManagementPage';
import { LNDDashboard } from './modules/admin/LNDDashboard';
import { PMDashboard } from './modules/admin/PMDashboard';
import { LoginPage } from './modules/admin/LoginPage';
import './styles/globals.css';

type Role = 'super-admin' | 'rsp' | 'lnd' | 'pm';
type InterviewerSession = { email: string; name: string };

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

const InterviewerRoute = ({
  children,
  session,
}: {
  children: JSX.Element;
  session: InterviewerSession | null;
}) => {
  if (!session) {
    return <Navigate to="/interviewer/login" replace />;
  }
  return children;
};

function App() {
  const [adminSession, setAdminSession] = useState<{ email: string; role: Role } | null>(null);
  const [interviewerSession, setInterviewerSession] = useState<InterviewerSession | null>(null);

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

    const interviewerStored = localStorage.getItem('cictrix_interviewer_session');
    if (interviewerStored) {
      try {
        const parsed = JSON.parse(interviewerStored) as InterviewerSession;
        if (parsed?.email) {
          setInterviewerSession(parsed);
        }
      } catch {
        localStorage.removeItem('cictrix_interviewer_session');
      }
    }
  }, []);

  const handleLogin = (email: string, role: Role) => {
    const session = { email, role };
    setAdminSession(session);
    localStorage.setItem('cictrix_admin_session', JSON.stringify(session));
  };

  const handleInterviewerLogin = (email: string, name: string) => {
    const session = { email, name };
    setInterviewerSession(session);
    localStorage.setItem('cictrix_interviewer_session', JSON.stringify(session));
  };

  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<ApplicantWizard />} />
          
          {/* Interviewer Routes */}
          <Route path="/interviewer/login" element={<InterviewerLogin onLogin={handleInterviewerLogin} />} />
          <Route
            path="/interviewer/dashboard"
            element={
              <InterviewerRoute session={interviewerSession}>
                <InterviewerDashboard />
              </InterviewerRoute>
            }
          />
          <Route
            path="/interviewer/applicants"
            element={
              <InterviewerRoute session={interviewerSession}>
                <InterviewerApplicantsList />
              </InterviewerRoute>
            }
          />
          <Route
            path="/interviewer/evaluate/:id"
            element={
              <InterviewerRoute session={interviewerSession}>
                <EvaluationForm />
              </InterviewerRoute>
            }
          />
          
          {/* Legacy Routes (redirect to new interviewer routes) */}
          <Route path="/dashboard" element={<Navigate to="/interviewer/dashboard" replace />} />
          <Route path="/evaluate/:id" element={<Navigate to="/interviewer/evaluate/:id" replace />} />
          
          {/* Admin Routes */}
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
