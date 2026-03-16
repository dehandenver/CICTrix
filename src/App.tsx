import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Dialog } from './components/Dialog';
import { JobPostingsPage } from './components/JobPostingsPage';
import { NewlyHiredPage } from './components/NewlyHiredPage';
import { QualifiedApplicantsPage } from './components/QualifiedApplicantsPage';
import { RaterManagementPage } from './components/RaterManagementPage';
import SuccessionReadinessEngine from './components/SuccessionReadinessEngine';
import {
  findEmployeeByEmployeeId,
  findEmployeePortalAccount,
} from './lib/employeePortalData';
import { mockDatabase } from './lib/mockDatabase';
import { isMockModeEnabled, supabase } from './lib/supabase';
import { LNDDashboard } from './modules/admin/LNDDashboard';
import { LoginPage } from './modules/admin/LoginPage';
import { PMDashboard } from './modules/admin/PMDashboard';
import { RSPDashboard } from './modules/admin/RSPDashboard.tsx';
import { SettingsPage } from './modules/admin/SettingsPage';
import { SuperAdminDashboard } from './modules/admin/SuperAdminDashboard';
import { ApplicantWizard } from './modules/applicant/ApplicantWizard';
import { EmployeeLoginPage, EmployeePage } from './modules/employee';
import { ApplicantDetailsPage } from './modules/interviewer/ApplicantDetailsPage.tsx';
import { EvaluationForm } from './modules/interviewer/EvaluationForm';
import { InterviewerApplicantsList } from './modules/interviewer/InterviewerApplicantsList';
import { InterviewerDashboard } from './modules/interviewer/InterviewerDashboard';
import { InterviewerLogin } from './modules/interviewer/InterviewerLogin';
import './styles/globals.css';
import type { Employee, EmployeeSession } from './types/employee.types';
import { scheduleTransientUiReset } from './utils/uiReset';

type Role = 'super-admin' | 'rsp' | 'lnd' | 'pm';
type InterviewerSession = { email: string; name: string };
type AdminModule = 'dashboard' | 'rsp' | 'lnd' | 'pm' | 'settings';
const RATER_ACCESS_STATE_KEY = 'cictrix_rater_access_state_map';
const ADMIN_SESSION_KEY = 'cictrix_admin_session';
const INTERVIEWER_SESSION_KEY = 'cictrix_interviewer_session';
const EMPLOYEE_SESSION_KEY = 'cictrix_employee_session';

const getAccessClient = () => {
  // Access enforcement should track the authoritative rater source.
  return isMockModeEnabled ? (mockDatabase as any) : supabase;
};

const loadRaterAccessState = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(RATER_ACCESS_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const selectRaterAccessRows = async (client: any) => {
  const query = client
    .from('raters')
    .select('email, is_active') as any;

  if (typeof query?.limit === 'function') {
    return query.limit(1000);
  }

  return query;
};

const normalizeAdminRole = (role: string | null | undefined): Role | null => {
  if (!role) return null;
  const normalized = role.toLowerCase().replace(/_/g, '-');
  if (normalized === 'super-admin' || normalized === 'superadmin' || normalized === 'admin') {
    return 'super-admin';
  }
  if (normalized === 'rsp') return 'rsp';
  if (normalized === 'lnd') return 'lnd';
  if (normalized === 'pm') return 'pm';
  return null;
};

const getRoleDefaultRoute = (role: Role): string => {
  if (role === 'super-admin') return '/admin?module=dashboard';
  if (role === 'rsp') return '/admin/rsp';
  if (role === 'lnd') return '/admin/lnd';
  return '/admin/pm';
};

const loadAdminSession = (): { email: string; role: Role } | null => {
  try {
    const stored = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as { email: string; role: string };
    const normalizedRole = normalizeAdminRole(parsed?.role);
    if (parsed?.email && normalizedRole) {
      return { email: parsed.email, role: normalizedRole };
    }

    localStorage.removeItem(ADMIN_SESSION_KEY);
    return null;
  } catch {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return null;
  }
};

const loadInterviewerSession = (): InterviewerSession | null => {
  try {
    const stored = localStorage.getItem(INTERVIEWER_SESSION_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as InterviewerSession;
    if (parsed?.email) {
      return parsed;
    }

    localStorage.removeItem(INTERVIEWER_SESSION_KEY);
    return null;
  } catch {
    localStorage.removeItem(INTERVIEWER_SESSION_KEY);
    return null;
  }
};

const loadEmployeeSession = (): EmployeeSession | null => {
  try {
    const stored = localStorage.getItem(EMPLOYEE_SESSION_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as EmployeeSession;
    if (!parsed?.employeeId) {
      localStorage.removeItem(EMPLOYEE_SESSION_KEY);
      return null;
    }

    const account =
      (parsed.loginUsername ? findEmployeePortalAccount(parsed.loginUsername) : null) ??
      findEmployeeByEmployeeId(parsed.employeeId);

    if (account) {
      return parsed;
    }

    localStorage.removeItem(EMPLOYEE_SESSION_KEY);
    return null;
  } catch {
    localStorage.removeItem(EMPLOYEE_SESSION_KEY);
    return null;
  }
};

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
    return <Navigate to={getRoleDefaultRoute(session.role)} replace />;
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

const EmployeeRoute = ({
  children,
  session,
}: {
  children: JSX.Element;
  session: EmployeeSession | null;
}) => {
  if (!session) {
    return <Navigate to="/employee/login" replace />;
  }
  return children;
};

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const isInterviewerRoute = location.pathname.startsWith('/interviewer');
  const [adminSession, setAdminSession] = useState<{ email: string; role: Role } | null>(() => loadAdminSession());
  const [interviewerSession, setInterviewerSession] = useState<InterviewerSession | null>(() => loadInterviewerSession());
  const [employeeSession, setEmployeeSession] = useState<EmployeeSession | null>(() => loadEmployeeSession());
  const [activeModule, setActiveModule] = useState<AdminModule>('dashboard');
  const [revokedInterviewerDialogOpen, setRevokedInterviewerDialogOpen] = useState(false);

  const resolveAdminModule = (moduleParam: string | null): AdminModule => {
    if (moduleParam === 'rsp') return 'rsp';
    if (moduleParam === 'lnd') return 'lnd';
    if (moduleParam === 'pm') return 'pm';
    if (moduleParam === 'settings') return 'settings';
    return 'dashboard';
  };

  const resolveEmployeeFromSession = (session: EmployeeSession | null) => {
    if (!session) return null;

    if (session.loginUsername) {
      const byUsername = findEmployeePortalAccount(session.loginUsername);
      if (byUsername) {
        return byUsername.employee;
      }
    }

    return findEmployeeByEmployeeId(session.employeeId)?.employee ?? null;
  };

  useEffect(() => {
    if (adminSession?.role !== 'super-admin' || !location.pathname.startsWith('/admin')) {
      return;
    }

    const moduleParam = new URLSearchParams(location.search).get('module');
    setActiveModule(resolveAdminModule(moduleParam));
  }, [adminSession?.role, location.pathname, location.search]);

  useEffect(() => {
    if (!isInterviewerRoute) {
      if (revokedInterviewerDialogOpen) {
        setRevokedInterviewerDialogOpen(false);
      }
      return;
    }

    if (!interviewerSession || revokedInterviewerDialogOpen) {
      return;
    }

    let cancelled = false;

    const checkInterviewerAccess = async () => {
      const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
      const normalizedEmail = normalize(interviewerSession.email);

      if (!normalizedEmail) {
        return;
      }

      // Immediate same-browser enforcement after admin toggles.
      const accessStateMap = loadRaterAccessState();
      if (Object.prototype.hasOwnProperty.call(accessStateMap, normalizedEmail) && !accessStateMap[normalizedEmail]) {
        if (!cancelled) {
          setRevokedInterviewerDialogOpen(true);
        }
        return;
      }

      try {
        const client = getAccessClient();
        const { data, error } = await selectRaterAccessRows(client);

        if (error || cancelled) {
          return;
        }

        const matchedRows = (data ?? []).filter((row: any) => normalize(row?.email) === normalizedEmail);
        const validMatchedRows = matchedRows.filter((row: any) => normalize(row?.email).length > 0);
        const hasActiveAccess = validMatchedRows.some((row: any) => Boolean(row?.is_active));
        const hasMatchingRows = validMatchedRows.length > 0;

        // Revoke only when we have explicit matching rater rows and all are inactive.
        if (hasMatchingRows && !hasActiveAccess && !cancelled) {
          setRevokedInterviewerDialogOpen(true);
        }
      } catch {
        // Ignore transient checks and keep current session state.
      }
    };

    void checkInterviewerAccess();
    const intervalId = window.setInterval(() => {
      void checkInterviewerAccess();
    }, 3000);

    const handleFocus = () => {
      void checkInterviewerAccess();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isInterviewerRoute, interviewerSession, revokedInterviewerDialogOpen]);

  useEffect(() => {
    // Notify data-driven pages that a route has been activated so they can refresh
    // without requiring a full browser reload.
    window.dispatchEvent(new CustomEvent('cictrix:route-activated'));
    const routeActivationTimer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('cictrix:route-activated'));
    }, 120);

    const cleanupUiReset = scheduleTransientUiReset({ dispatchOverlayClose: true });

    return () => {
      window.clearTimeout(routeActivationTimer);
      cleanupUiReset();
    };
  }, [location.pathname, location.search]);

  const handleLogin = (email: string, role: Role) => {
    const session = { email, role };
    setAdminSession(session);
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  };

  const handleInterviewerLogin = (email: string, name: string) => {
    const session = { email, name };
    setInterviewerSession(session);
    localStorage.setItem(INTERVIEWER_SESSION_KEY, JSON.stringify(session));
  };

  const handleEmployeeLogin = (username: string, password: string) => {
    const account = findEmployeePortalAccount(username, password);
    if (account) {
      const session: EmployeeSession = {
        employeeId: account.employee.employeeId,
        email: account.employee.email,
        fullName: account.employee.fullName,
        loginUsername: account.username,
      };

      setEmployeeSession(session);
      localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(session));
      navigate('/employee/dashboard');
    }
  };

  const handleEmployeeLogout = () => {
    setEmployeeSession(null);
    localStorage.removeItem(EMPLOYEE_SESSION_KEY);
    navigate('/employee/login');
  };

  const handleRevokedInterviewerAcknowledge = async () => {
    setRevokedInterviewerDialogOpen(false);
    setInterviewerSession(null);
    localStorage.removeItem(INTERVIEWER_SESSION_KEY);

    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore sign-out errors and force route reset.
    }

    if (isInterviewerRoute) {
      navigate('/interviewer/login', { replace: true });
    }
  };

  return (
    <div className="app">
      <Routes>
          <Route path="/" element={<ApplicantWizard />} />
          <Route path="/succession" element={<SuccessionReadinessEngine />} />
          
          {/* Interviewer Routes */}
          <Route path="/interviewer/login" element={<InterviewerLogin onLogin={handleInterviewerLogin} />} />
          <Route
            path="/interviewer/dashboard"
            element={
              <InterviewerRoute session={interviewerSession}>
                <InterviewerDashboard session={interviewerSession} />
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
          
          {/* Employee Portal Routes */}
          <Route
            path="/employee"
            element={<Navigate to={employeeSession ? '/employee/dashboard' : '/employee/login'} replace />}
          />
          <Route path="/employee/login" element={<EmployeeLoginPage onLogin={handleEmployeeLogin} />} />
          <Route
            path="/employee/dashboard"
            element={
              <EmployeeRoute session={employeeSession}>
                {resolveEmployeeFromSession(employeeSession) ? (
                  <EmployeePage
                    currentUser={resolveEmployeeFromSession(employeeSession) as Employee}
                    onLogout={handleEmployeeLogout}
                  />
                ) : (
                  <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-600">
                    Loading employee profile...
                  </div>
                )}
              </EmployeeRoute>
            }
          />
          <Route
            path="/employee/profile"
            element={
              <EmployeeRoute session={employeeSession}>
                {resolveEmployeeFromSession(employeeSession) ? (
                  <EmployeePage
                    currentUser={resolveEmployeeFromSession(employeeSession) as Employee}
                    onLogout={handleEmployeeLogout}
                  />
                ) : (
                  <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-600">
                    Loading employee profile...
                  </div>
                )}
              </EmployeeRoute>
            }
          />
          <Route
            path="/employee/documents/requirements"
            element={
              <EmployeeRoute session={employeeSession}>
                {resolveEmployeeFromSession(employeeSession) ? (
                  <EmployeePage
                    currentUser={resolveEmployeeFromSession(employeeSession) as Employee}
                    onLogout={handleEmployeeLogout}
                  />
                ) : (
                  <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-600">
                    Loading employee profile...
                  </div>
                )}
              </EmployeeRoute>
            }
          />
          <Route
            path="/employee/documents/submission"
            element={
              <EmployeeRoute session={employeeSession}>
                {resolveEmployeeFromSession(employeeSession) ? (
                  <EmployeePage
                    currentUser={resolveEmployeeFromSession(employeeSession) as Employee}
                    onLogout={handleEmployeeLogout}
                  />
                ) : (
                  <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-600">
                    Loading employee profile...
                  </div>
                )}
              </EmployeeRoute>
            }
          />
          <Route
            path="/employee/*"
            element={<Navigate to={employeeSession ? '/employee/dashboard' : '/employee/login'} replace />}
          />
          
          {/* Admin Routes */}
          <Route path="/admin/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route
            path="/admin"
            element={
              <AdminRoute session={adminSession}>
                {adminSession?.role === 'super-admin' ? (
                  <>
                    {activeModule === 'dashboard' && <SuperAdminDashboard />}
                    {activeModule === 'rsp' && <RSPDashboard />}
                    {activeModule === 'lnd' && <LNDDashboard isDashboardView={true} />}
                    {activeModule === 'pm' && <PMDashboard isDashboardView={true} />}
                    {activeModule === 'settings' && <SettingsPage />}
                  </>
                ) : (
                  <Navigate to={adminSession ? getRoleDefaultRoute(adminSession.role) : '/admin/login'} replace />
                )}
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
            path="/admin/rsp/jobs"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <JobPostingsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/qualified"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <QualifiedApplicantsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/applicant/:id"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <ApplicantDetailsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/qualified/:jobId"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <QualifiedApplicantsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/new-hired"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <NewlyHiredPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/raters"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <RaterManagementPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/accounts"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <RSPDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/reports"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <RSPDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/settings"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <RSPDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/raters"
            element={
              <Navigate to="/admin/rsp/raters" replace />
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

        <Dialog open={isInterviewerRoute && revokedInterviewerDialogOpen} onClose={handleRevokedInterviewerAcknowledge}>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ marginBottom: '10px', color: '#dc2626' }}>Access Revoked</h3>
            <p style={{ marginBottom: '16px', color: '#374151' }}>
              Your interviewer access has been revoked by an admin.
            </p>
            <button
              type="button"
              onClick={handleRevokedInterviewerAcknowledge}
              style={{
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                backgroundColor: '#1f2937',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Okay
            </button>
          </div>
        </Dialog>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
