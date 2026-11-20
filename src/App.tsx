import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Dialog } from './components/Dialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FeedbackProvider } from './components/action-feedback';
import { JobDetailsPage } from './components/JobDetailsPage';
import { JobPostingsPage } from './components/JobPostingsPage';
import { NewlyHiredPage } from './components/NewlyHiredPage';
import { ForHiringPage } from './components/ForHiringPage';
import { GenerateCredentialsPage } from './components/GenerateCredentialsPage';
import { ApplicationsListPage } from './components/ApplicationsListPage';
import { QualifiedApplicantsRSPPage } from './components/QualifiedApplicantsRSPPage';
import { RaterManagementPage } from './components/RaterManagementPage';
import SuccessionReadinessEngine from './components/SuccessionReadinessEngine';
import { SalaryGradesPage } from './components/SalaryGradesPage';
import {
  EmployeePortalLoginError,
  authenticateEmployeePortalAccount,
} from './lib/employeePortalData';
import { fetchPortalEmployeeByNumber } from './lib/api/employeePortal';
import { clearAdminSession, readAdminSession, writeAdminSession } from './lib/adminSession';
import { clearCachedDecryptionKey } from './lib/crypto';
import { clearEmployeeSession, readEmployeeSession, writeEmployeeSession } from './lib/employeeSession';
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
import { SessionExpiredPage } from './components/SessionExpiredPage';
import { EmployeeLoginPage, EmployeePage, SetInitialPasswordPage } from './modules/employee';
import { ApplicantDetailsPage } from './modules/interviewer/ApplicantDetailsPage.tsx';
import { EvaluationForm } from './modules/interviewer/EvaluationForm';
import { InterviewerApplicantsList } from './modules/interviewer/InterviewerApplicantsList';
import { InterviewerDashboard } from './modules/interviewer/InterviewerDashboard';
import { InterviewerLogin } from './modules/interviewer/InterviewerLogin';
import './styles/globals.css';
// After globals.css: remaps RSP-portal utilities onto the Design Identity tokens.
import './styles/abyan-tokens.css';
// Shared table styles (.abyan-table), loaded once for every portal.
import './components/data-table';
import './styles/rsp-design.css';
import type { Employee, EmployeeSession } from './types/employee.types';
import { scheduleTransientUiReset } from './utils/uiReset';

type Role = 'super-admin' | 'rsp' | 'lnd' | 'pm';
type InterviewerSession = { email: string; name: string };
type AdminModule = 'dashboard' | 'rsp' | 'lnd' | 'pm' | 'settings';
const RATER_ACCESS_STATE_KEY = 'cictrix_rater_access_state_map';
const INTERVIEWER_SESSION_KEY = 'cictrix_interviewer_session';

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
  const parsed = readAdminSession();
  if (!parsed) return null;

  const normalizedRole = normalizeAdminRole(parsed.role);
  if (parsed.email && normalizedRole) {
    return { email: parsed.email, role: normalizedRole };
  }

  clearAdminSession();
  return null;
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

// Per-tab, so two employees can be signed in side by side without one tab
// silently becoming the other. See src/lib/employeeSession.ts.
const loadEmployeeSession = (): EmployeeSession | null => readEmployeeSession();

/**
 * Admin pages require a live Supabase sign-in, not just the portal's own
 * stored session.
 *
 * Those are two different things and they expire independently. The portal
 * session lives in localStorage and never lapses on its own, so the header
 * kept reading "Super Admin" long after the Supabase token behind every
 * request had gone — the screen looked signed in while the database saw an
 * anonymous caller and refused every write. That surfaced as unexplainable
 * Postgres errors on whichever screen the admin happened to be using.
 *
 * Checked here, once, rather than in each feature's save path.
 *
 * Deliberately NOT applied to the employee or applicant portals: those
 * authenticate at the application layer and are anonymous to Postgres by
 * design, so requiring a Supabase session there would lock out every employee.
 */
type SupabaseAuthState = 'checking' | 'live' | 'expired';

const useSupabaseAuthState = (): SupabaseAuthState => {
  const [state, setState] = useState<SupabaseAuthState>('checking');

  useEffect(() => {
    let cancelled = false;

    const settle = (hasSession: boolean) => {
      if (cancelled) return;
      setState(hasSession ? 'live' : 'expired');
      // Drop the portal session too, so the header stops claiming a role the
      // database will not honour.
      if (!hasSession) clearAdminSession();
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => settle(Boolean(data?.session)))
      // If the check itself fails we cannot prove the session is gone. Treat it
      // as live rather than ejecting someone mid-task on a network blip; the
      // write will report the real error if it is genuinely expired.
      .catch(() => { if (!cancelled) setState('live'); });

    const { data: sub } = supabase.auth.onAuthStateChange((event, authSession) => {
      // A session arriving is always good news. A null one is only conclusive
      // on SIGNED_OUT: supabase-js also emits INITIAL_SESSION with null while
      // it is still reading storage, and acting on that would throw a working
      // admin back to the login screen a moment after the page loaded.
      if (authSession) settle(true);
      else if (event === 'SIGNED_OUT') settle(false);
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return state;
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
  const authState = useSupabaseAuthState();

  if (!session) {
    return <Navigate to="/admin/login" replace />;
  }

  // Render nothing for the moment the check takes, rather than flashing the
  // page and then redirecting.
  if (authState === 'checking') return null;

  if (authState === 'expired') {
    return <Navigate to="/admin/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    // Land them on their own module rather than an Access Denied dead-end they
    // can't act on. Each role's default route permits that role, so this can't
    // bounce in a loop.
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
        writeEmployeeSession(healed);
        setEmployeeSession(healed);
      });
    }
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
    writeAdminSession(session);
  };

  const handleInterviewerLogin = (email: string, name: string) => {
    const session = { email, name };
    setInterviewerSession(session);
    localStorage.setItem(INTERVIEWER_SESSION_KEY, JSON.stringify(session));
  };

  const handleEmployeeLogin = async (username: string, password: string) => {
    const trimmedUsername = username.trim();

    // Step 1: Verify credentials against the authoritative remote account table.
    // Browser localStorage is never consulted as a login fallback.
    const authResult = await authenticateEmployeePortalAccount(trimmedUsername, password);
    if (authResult.ok === false) {
      throw new EmployeePortalLoginError(authResult.kind);
    }

    const portalAccount = authResult.account;
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
    writeEmployeeSession(session);
    const empParams = new URLSearchParams(location.search);
    const empReturnTo = empParams.get('returnTo');
    const empDefault = session.mustChangePassword ? '/employee/set-password' : '/employee/dashboard';
    // replace: Back from the portal must not return to the login screen.
    navigate(empReturnTo && empReturnTo.startsWith('/') && !empReturnTo.startsWith('//')
      ? empReturnTo
      : empDefault,
      { replace: true },
    );
  };

  const handleInitialPasswordSet = () => {
    if (!employeeSession) return;
    const updated: EmployeeSession = { ...employeeSession, mustChangePassword: false };
    setEmployeeSession(updated);
    writeEmployeeSession(updated);
    navigate('/employee/dashboard', { replace: true });
  };

  const handleInterviewerLogout = () => {
    clearCachedDecryptionKey();
    setInterviewerSession(null);
    localStorage.removeItem(INTERVIEWER_SESSION_KEY);
    navigate('/interviewer/login', { replace: true });
  };

  const handleEmployeeLogout = () => {
    setEmployeeSession(null);
    setCurrentEmployee(null);
    clearEmployeeSession();
    navigate('/employee/login', { replace: true });
  };

  const handleRevokedInterviewerAcknowledge = async () => {
    setRevokedInterviewerDialogOpen(false);
    clearCachedDecryptionKey();
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

  const boundary = moduleBoundaryFor(location.pathname);

  return (
    <div className="app">
      {/* One boundary per portal, keyed by path: a crash stays in its module
          and clears when the user navigates away. */}
      <ErrorBoundary key={location.pathname} scope={boundary.scope} homeHref={boundary.home}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contacts" element={<Navigate to="/" replace />} />
          <Route path="/apply" element={<ApplicantWizard />} />
          <Route path="/track" element={<ApplicationStatusPage />} />
          <Route path="/job-portal" element={<JobPortalPage />} />
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
                <InterviewerApplicantsList session={interviewerSession} onLogout={handleInterviewerLogout} />
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
            path="/employee/idp"
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
            element={<Navigate to="/employee/profile" replace />}
          />
          <Route
            path="/employee/documents/submission"
            element={<Navigate to="/employee/profile" replace />}
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
            path="/employee/archive"
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
            path="/employee/trainings"
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
            path="/admin/salary-grades"
            element={
              <AdminRoute session={adminSession} allowedRoles={['super-admin']}>
                <SalaryGradesPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/ipcr"
            element={
              <AdminRoute session={adminSession} allowedRoles={['pm']}>
                <IPCRManagementPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/competency"
            element={
              <AdminRoute session={adminSession} allowedRoles={['pm']}>
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
                    {activeModule === 'lnd' && <LNDDashboard isDashboardView={true} viewOnly />}
                    {activeModule === 'pm' && <PMDashboard isDashboardView={true} viewOnly />}
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
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <RSPDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/jobs"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <JobPostingsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/applications"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <ApplicationsListPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/applicant-score"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
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
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <ForHiringPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/credentials"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <GenerateCredentialsPage />
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
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <JobDetailsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/qualified"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <QualifiedApplicantsRSPPage mode="pending" />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/applicant/:id"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <ApplicantDetailsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/qualified/:jobId"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <QualifiedApplicantsRSPPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/new-hired"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <NewlyHiredPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/raters"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <RaterManagementPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/accounts"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <RSPDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/succession"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <RSPDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/succession/*"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <RSPDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/reports"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
                <RSPDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/rsp/settings"
            element={
              <AdminRoute session={adminSession} allowedRoles={['rsp']}>
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
              <AdminRoute session={adminSession} allowedRoles={['lnd']}>
                <LNDDashboard isDashboardView={true} />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/lnd/manage"
            element={
              <AdminRoute session={adminSession} allowedRoles={['lnd']}>
                <LNDDashboard isDashboardView={false} />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/lnd/settings"
            element={
              <AdminRoute session={adminSession} allowedRoles={['lnd']}>
                <SettingsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/pm"
            element={
              <AdminRoute session={adminSession} allowedRoles={['pm']}>
                <PMDashboard isDashboardView={true} />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/pm/manage"
            element={
              <AdminRoute session={adminSession} allowedRoles={['pm']}>
                <PMDashboard isDashboardView={false} />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/pm/settings"
            element={
              <AdminRoute session={adminSession} allowedRoles={['pm']}>
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
      </ErrorBoundary>

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

/** The portal a path belongs to, for its error boundary's wording and home link. */
const moduleBoundaryFor = (pathname: string): { scope: string; home: string } => {
  if (pathname.startsWith('/admin/rsp')) return { scope: 'RSP portal', home: '/admin/rsp' };
  if (pathname.startsWith('/admin/lnd')) return { scope: 'L&D portal', home: '/admin/lnd' };
  if (pathname.startsWith('/admin/pm')) return { scope: 'Performance Management portal', home: '/admin/pm' };
  if (pathname.startsWith('/admin')) return { scope: 'admin portal', home: '/admin' };
  if (pathname.startsWith('/office')) return { scope: 'Department Head console', home: '/office/dashboard' };
  if (pathname.startsWith('/employee')) return { scope: 'Employee portal', home: '/employee/dashboard' };
  if (pathname.startsWith('/interviewer')) return { scope: 'Interviewer portal', home: '/interviewer/dashboard' };
  return { scope: 'page', home: '/' };
};

function App() {
  return (
    <ErrorBoundary>
      <FeedbackProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </FeedbackProvider>
    </ErrorBoundary>
  );
}

export default App;
