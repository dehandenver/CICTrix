import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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
import { EmployeeLoginPage, EmployeePage } from './modules/employee';
import { Employee, EmployeeSession } from './types/employee.types';
import './styles/globals.css';

type Role = 'super-admin' | 'rsp' | 'lnd' | 'pm';
type InterviewerSession = { email: string; name: string };

// Mock employee data for demo
const MOCK_EMPLOYEES: Record<string, Employee> = {
  employee01: {
    employeeId: 'EMP-2024-001',
    fullName: 'Maria Santos',
    email: 'maria.santos@ilongcity.gov.ph',
    dateOfBirth: '1990-05-15',
    age: 34,
    gender: 'Female',
    civilStatus: 'Married',
    nationality: 'Filipino',
    mobileNumber: '+63-908-123-4567',
    homeAddress: '123 Rizal Street, Iloilo City, Iloilo 5000',
    emergencyContactName: 'Juan Santos',
    emergencyRelationship: 'Spouse',
    emergencyContactNumber: '+63-908-765-4321',
    sssNumber: '01-2345678-0',
    philhealthNumber: 'PH-01-2345678-9',
    pagibigNumber: '121234567890',
    tinNumber: '123-456-789-000',
  },
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
  const [adminSession, setAdminSession] = useState<{ email: string; role: Role } | null>(null);
  const [interviewerSession, setInterviewerSession] = useState<InterviewerSession | null>(null);
  const [employeeSession, setEmployeeSession] = useState<EmployeeSession | null>(null);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);

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

    const employeeStored = localStorage.getItem('cictrix_employee_session');
    if (employeeStored) {
      try {
        const parsed = JSON.parse(employeeStored) as EmployeeSession;
        if (parsed?.employeeId) {
          setEmployeeSession(parsed);
          // Look up employee using loginUsername if available, otherwise by employeeId
          let employee: Employee | undefined;
          if (parsed.loginUsername && MOCK_EMPLOYEES[parsed.loginUsername]) {
            employee = MOCK_EMPLOYEES[parsed.loginUsername];
          } else {
            // Fallback: search through MOCK_EMPLOYEES by employeeId
            employee = Object.values(MOCK_EMPLOYEES).find(
              (emp) => emp.employeeId === parsed.employeeId
            );
          }
          if (employee) {
            setCurrentEmployee(employee);
          }
        }
      } catch {
        localStorage.removeItem('cictrix_employee_session');
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

  const handleEmployeeLogin = (username: string, password: string) => {
    // Demo: simple validation
    if (username === 'employee01' && password === 'hr2024') {
      const employee = MOCK_EMPLOYEES['employee01'];
      if (employee) {
        const session: EmployeeSession = {
          employeeId: employee.employeeId,
          email: employee.email,
          fullName: employee.fullName,
          loginUsername: username, // Store username for lookup
        };
        setEmployeeSession(session);
        setCurrentEmployee(employee);
        localStorage.setItem('cictrix_employee_session', JSON.stringify(session));
        // Navigate to dashboard after successful login
        navigate('/employee/dashboard');
      }
    }
  };

  const handleEmployeeLogout = () => {
    setEmployeeSession(null);
    setCurrentEmployee(null);
    localStorage.removeItem('cictrix_employee_session');
    navigate('/employee/login');
  };

  return (
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
          
          {/* Employee Portal Routes */}
          <Route path="/employee/login" element={<EmployeeLoginPage onLogin={handleEmployeeLogin} />} />
          <Route
            path="/employee/dashboard"
            element={
              <EmployeeRoute session={employeeSession}>
                {currentEmployee && <EmployeePage currentUser={currentEmployee} onLogout={handleEmployeeLogout} />}
              </EmployeeRoute>
            }
          />
          
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
