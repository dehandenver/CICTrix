import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Dialog } from './components/Dialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { JobDetailsPage } from './components/JobDetailsPage';
import { JobPostingsPage } from './components/JobPostingsPage';
import { NewlyHiredPage } from './components/NewlyHiredPage';
import { QualifiedApplicantsPage } from './components/QualifiedApplicantsPage';
import { ForHiringPage } from './components/ForHiringPage';
import { ApplicationsListPage } from './components/ApplicationsListPage';
import { QualifiedApplicantsRSPPage } from './components/QualifiedApplicantsRSPPage';
import { RaterManagementPage } from './components/RaterManagementPage';
import SuccessionReadinessEngine from './components/SuccessionReadinessEngine';
import { findEmployeePortalAccount, findEmployeePortalAccountFromSupabase } from './lib/employeePortalData';
import { fetchPortalEmployeeByNumber } from './lib/api/employeePortal';
import { supabase } from './lib/supabase';
import { syncThemeWithRoute } from './lib/theme';
import { LNDDashboard } from './modules/admin/LNDDashboard';
import { LoginPage } from './modules/admin/LoginPage';
import { PMDashboard } from './modules/admin/PMDashboard';
import { RSPDashboard } from './modules/admin/RSPDashboard.tsx';
import { SettingsPage } from './modules/admin/SettingsPage';
import { SuperAdminDashboard } from './modules/admin/SuperAdminDashboard';
import { OfficeAccountConsole } from './modules/admin/pm/OfficeAccountConsole';
import { DemoRoot } from './modules/admin/pm/demo/DemoRoot';
import { TrainingCoursesPrototype } from './modules/admin/prototypes/TrainingCoursesPrototype';
import { SupervisorAccessPage } from './modules/admin/SupervisorAccessPage';
import { SystemAdministrationPage } from './modules/admin/SystemAdministrationPage';
import { IPCRManagementPage } from './modules/admin/IPCRManagementPage';
import { CompetencyFrameworkPage } from './modules/admin/CompetencyFrameworkPageView';
import { ApplicantWizard } from './modules/applicant/ApplicantWizard';
import { ApplicationStatusPage } from './modules/applicant/ApplicationStatusPage';
import { LandingPage } from './components/LandingPage';
import { AboutPage } from './components/AboutPage';
import { JobPortalPage } from './components/JobPortalPage';
import { UnauthorizedPage } from './components/UnauthorizedPage';
import { SessionExpiredPage } from './components/SessionExpiredPage';
import { EmployeeLoginPage, EmployeePage, SetInitialPasswordPage } from './modules/employee';
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
  // All data access is exclusively through Supabase
  return supabase;
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

    // Since we rely on online checks, we will permit parsed for now
    // and rely on guarded routes or deeper fetches to validate it further.
    return parsed;
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
    return <Navigate to="/unauthorized" replace />;
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
  if (session.mustChangePassword) {
    return <Navigate to="/employee/set-password" replace />;
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
  // Full Employee object passed to EmployeePage — hydrated from Supabase at login.
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [activeModule, setActiveModule] = useState<AdminModule>('dashboard');
  const [revokedInterviewerDialogOpen, setRevokedInterviewerDialogOpen] = useState(false);

  const resolveAdminModule = (moduleParam: string | null): AdminModule => {
    if (moduleParam === 'rsp') return 'rsp';
    if (moduleParam === 'lnd') return 'lnd';
    if (moduleParam === 'pm') return 'pm';
    if (moduleParam === 'settings') return 'settings';
    return 'dashboard';
  };

  // Restore currentEmployee from session on page reload.
  useEffect(() => {
    const session = loadEmployeeSession();
    if (!session) return;
    // Always build a stub from the stored session so the routes render
    // immediately. EmployeePage re-fetches the full live record on mount.
    setCurrentEmployee({
      employeeId: session.employeeId,
      fullName: session.fullName,
      email: session.email,
      supabaseId: session.supabaseId,
      dateOfBirth: '',
      age: 0,
      gender: 'Prefer not to say',
      civilStatus: 'Single',
      nationality: 'Filipino',
      mobileNumber: '',
      homeAddress: '',
      emergencyContactName: '',
      emergencyRelationship: '',
      emergencyContactNumber: '',
      sssNumber: '',
      philhealthNumber: '',
      pagibigNumber: '',
      tinNumber: '',
    });

    // Self-heal a session that was created before the employee had a Supabase
    // `employees` row (so supabaseId is missing). Without this, a plain refresh
    // keeps showing "account isn't linked" and an empty IPCR even after the row
    // is created — the user would otherwise have to log out and back in. Re-resolve
    // the row by employee number and patch both the live state and the stored session.
    if (!session.supabaseId && session.employeeId) {
      void fetchPortalEmployeeByNumber(session.employeeId).then((res) => {
        if (!res.ok || !res.data.supabaseId) return;
        setCurrentEmployee(res.data);
        const healed: EmployeeSession = { ...session, supabaseId: res.data.supabaseId };
        localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(healed));
        setEmployeeSession(healed);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (typeof window === 'undefined') {
      return () => {
        cancelled = true;
      };
    }

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
    // Apply RSP-scoped theme only when in the RSP module; force light elsewhere.
    syncThemeWithRoute();
  }, [location.pathname, location.search]);

  useEffect(() => {
    // Notify data-driven pages that a route has been activated so they can refresh
    // without requiring a full browser reload.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cictrix:route-activated'));
      const routeActivationTimer = window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('cictrix:route-activated'));
      }, 120);

      const cleanupUiReset = scheduleTransientUiReset({ dispatchOverlayClose: true });

      return () => {
        window.clearTimeout(routeActivationTimer);
        cleanupUiReset();
      };
    }
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

  const handleEmployeeLogin = async (username: string, password: string) => {
    const trimmedUsername = username.trim();

    // Step 1: Verify credentials. Try Supabase first (employee_portal_accounts
    // — the durable source written by RSP) so credentials work across
    // browsers; fall back to localStorage for environments where the
    // migration hasn't run yet.
    let portalAccount = await findEmployeePortalAccountFromSupabase(trimmedUsername, password);
    if (!portalAccount) {
      portalAccount = findEmployeePortalAccount(trimmedUsername, password);
    }
    if (!portalAccount) {
      throw new Error('Invalid username or password.');
    }

    const employeeNumber = portalAccount.employee.employeeId;

    // Step 2: Fetch the live Supabase employees row for richer profile data.
    const dbResult = await fetchPortalEmployeeByNumber(employeeNumber);

    let resolvedEmployee: Employee;
    let supabaseId: string | undefined;

    if (dbResult.ok) {
      resolvedEmployee = dbResult.data;
      supabaseId = resolvedEmployee.supabaseId;
    } else {
      // Demo or newly-onboarded employee — no employees row yet.
      console.warn('[App] No Supabase employees row found for', employeeNumber, '— using portal account data.');
      resolvedEmployee = {
        ...portalAccount.employee,
        dateOfBirth: portalAccount.employee.dateOfBirth ?? '',
        age: portalAccount.employee.age ?? 0,
        gender: portalAccount.employee.gender ?? 'Prefer not to say',
        civilStatus: portalAccount.employee.civilStatus ?? 'Single',
        nationality: portalAccount.employee.nationality ?? 'Filipino',
        mobileNumber: portalAccount.employee.mobileNumber ?? '',
        homeAddress: portalAccount.employee.homeAddress ?? '',
        emergencyContactName: portalAccount.employee.emergencyContactName ?? '',
        emergencyRelationship: portalAccount.employee.emergencyRelationship ?? '',
        emergencyContactNumber: portalAccount.employee.emergencyContactNumber ?? '',
        sssNumber: portalAccount.employee.sssNumber ?? '',
        philhealthNumber: portalAccount.employee.philhealthNumber ?? '',
        pagibigNumber: portalAccount.employee.pagibigNumber ?? '',
        tinNumber: portalAccount.employee.tinNumber ?? '',
      };
    }

    const session: EmployeeSession = {
      employeeId: resolvedEmployee.employeeId,
      email: resolvedEmployee.email,
      fullName: resolvedEmployee.fullName,
      loginUsername: trimmedUsername,
      supabaseId,
      mustChangePassword: Boolean(portalAccount.mustChangePassword),
    };

    setCurrentEmployee(resolvedEmployee);
    setEmployeeSession(session);
    localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(session));
    const empParams = new URLSearchParams(location.search);
    const empReturnTo = empParams.get('returnTo');
    const empDefault = session.mustChangePassword ? '/employee/set-password' : '/employee/dashboard';
    navigate(empReturnTo && empReturnTo.startsWith('/') && !empReturnTo.startsWith('//')
      ? empReturnTo
      : empDefault
    );
  };

  const handleInitialPasswordSet = () => {
    if (!employeeSession) return;
    const updated: EmployeeSession = { ...employeeSession, mustChangePassword: false };
    setEmployeeSession(updated);
    localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(updated));
    navigate('/employee/dashboard');
  };

  const handleInterviewerLogout = () => {
    setInterviewerSession(null);
    localStorage.removeItem(INTERVIEWER_SESSION_KEY);
    navigate('/interviewer/login');
  };

  const handleEmployeeLogout = () => {
    setEmployeeSession(null);
    setCurrentEmployee(null);
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
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contacts" element={<Navigate to="/" replace />} />
          <Route path="/apply" element={<ApplicantWizard />} />
          <Route path="/track" element={<ApplicationStatusPage />} />
          <Route path="/job-portal" element={<JobPortalPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/session-expired" element={<SessionExpiredPage />} />
          <Route path="/succession" element={<SuccessionReadinessEngine />} />
          
          {/* Interviewer Routes */}
          <Route path="/interviewer/login" element={<InterviewerLogin onLogin={handleInterviewerLogin} />} />
          <Route
            path="/interviewer/dashboard"
            element={
              <InterviewerRoute session={interviewerSession}>
                <InterviewerDashboard session={interviewerSession} onLogout={handleInterviewerLogout} />
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
          
          {/* IPCR Demo (self-contained: own login against accounts table) */}
          <Route path="/pm-demo" element={<DemoRoot />} />

          {/* Employee Portal Routes */}
          <Route
            path="/employee"
            element={<Navigate to={employeeSession ? '/employee/dashboard' : '/employee/login'} replace />}
          />
          <Route path="/employee/login" element={<EmployeeLoginPage onLogin={handleEmployeeLogin} />} />
          <Route
            path="/employee/set-password"
            element={
              employeeSession ? (
                employeeSession.mustChangePassword ? (
                  <SetInitialPasswordPage
                    username={employeeSession.loginUsername ?? employeeSession.employeeId}
                    fullName={employeeSession.fullName}
                    onDone={handleInitialPasswordSet}
                  />
                ) : (
                  <Navigate to="/employee/dashboard" replace />
                )
              ) : (
                <Navigate to="/employee/login" replace />
              )
            }
          />
          <Route
            path="/employee/dashboard"
            element={
              <EmployeeRoute session={employeeSession}>
                {currentEmployee ? (
                  <EmployeePage
                    currentUser={currentEmployee}
                    loginUsername={employeeSession?.loginUsername}
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
                {currentEmployee ? (
                  <EmployeePage
                    currentUser={currentEmployee}
                    loginUsername={employeeSession?.loginUsername}
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
                {currentEmployee ? (
                  <EmployeePage
                    currentUser={currentEmployee}
                    loginUsername={employeeSession?.loginUsername}
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
                {currentEmployee ? (
                  <EmployeePage
                    currentUser={currentEmployee}
                    loginUsername={employeeSession?.loginUsername}
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
            path="/employee/account"
            element={
              <EmployeeRoute session={employeeSession}>
                {currentEmployee ? (
                  <EmployeePage
                    currentUser={currentEmployee}
                    loginUsername={employeeSession?.loginUsername}
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
            path="/employee/ipcr-workspace"
            element={
              <EmployeeRoute session={employeeSession}>
                {currentEmployee ? (
                  <EmployeePage
                    currentUser={currentEmployee}
                    loginUsername={employeeSession?.loginUsername}
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
            path="/employee/new-entrants"
            element={
              <EmployeeRoute session={employeeSession}>
                {currentEmployee ? (
                  <EmployeePage
                    currentUser={currentEmployee}
                    loginUsername={employeeSession?.loginUsername}
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
            path="/admin/supervisors"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin']}>
                <SupervisorAccessPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/system-admin"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin']}>
                <SystemAdministrationPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/ipcr"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'pm']}>
                <IPCRManagementPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/competency"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'pm']}>
                <CompetencyFrameworkPage />
              </AdminRoute>
            }
          />
          <Route path="/admin/users" element={<Navigate to="/admin/supervisors" replace />} />
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
            path="/admin/rsp/applications"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <ApplicationsListPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/applicant-score"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <QualifiedApplicantsRSPPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/applicant-ranking"
            element={<Navigate to="/admin/rsp/for-hiring" replace />}
          />
          <Route
            path="/admin/rsp/for-hiring"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <ForHiringPage />
              </AdminRoute>
            }
          />
          <Route
            path="/job-details/:jobId"
            element={<JobDetailsPage />}
          />
          <Route
            path="/admin/rsp/job/:jobId"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <JobDetailsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/qualified"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <QualifiedApplicantsRSPPage mode="pending" />
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
                <QualifiedApplicantsRSPPage />
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
            path="/admin/rsp/succession"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'rsp']}>
                <RSPDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/succession/*"
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
                <SettingsPage />
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
            path="/admin/lnd/settings"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'lnd']}>
                <SettingsPage />
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
          <Route
            path="/admin/pm/settings"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin', 'pm']}>
                <SettingsPage />
              </AdminRoute>
            }
          />
          {/* Requires an employee session; OfficeAccountConsole then denies anyone
              without an Active office_role_assignments grant. */}
          <Route
            path="/office/dashboard"
            element={
              <EmployeeRoute session={employeeSession}>
                <OfficeAccountConsole />
              </EmployeeRoute>
            }
          />
          {/* Prototype — sample data, no auth, not part of the L&D portal. */}
          <Route path="/prototype/training-courses" element={<TrainingCoursesPrototype />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <Dialog open={isInterviewerRoute && revokedInterviewerDialogOpen} onClose={handleRevokedInterviewerAcknowledge}>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ marginBottom: '10px', color: 'var(--status-error)' }}>Access Revoked</h3>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
              Your interviewer access has been revoked by an admin.
            </p>
            <button
              type="button"
              onClick={handleRevokedInterviewerAcknowledge}
              style={{
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--text-primary)',
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
    <ErrorBoundary>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
