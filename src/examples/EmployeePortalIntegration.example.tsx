/**
 * Example Integration of Employee Components
 * 
 * This example shows how to integrate the EmployeeLoginPage and EmployeePage
 * components into your App.tsx file.
 */

import { useState } from 'react';
import { EmployeeLoginPage, EmployeePage } from '../modules/employee';
import { Employee, EmployeeSession } from '../types/employee.types';

// Mock employee data for demonstration
const MOCK_EMPLOYEE_DATA: Record<string, Employee> = {
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

/**
 * Employee Portal Routes Hook
 * Manages employee login state and provides session management
 */
export const useEmployeePortal = () => {
  const [session, setSession] = useState<EmployeeSession | null>(null);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);

  const handleEmployeeLogin = (username: string, password: string) => {
    // In production, this would be an API call to your backend
    // For demo, we're using mock data
    const employee = MOCK_EMPLOYEE_DATA[username];
    
    if (employee && password === 'hr2024') {
      const newSession: EmployeeSession = {
        employeeId: employee.employeeId,
        email: employee.email,
        fullName: employee.fullName,
      };
      
      setSession(newSession);
      setCurrentEmployee(employee);
      localStorage.setItem(
        'cictrix_employee_session',
        JSON.stringify(newSession)
      );
      
      return true;
    }
    
    return false;
  };

  const handleEmployeeLogout = () => {
    setSession(null);
    setCurrentEmployee(null);
    localStorage.removeItem('cictrix_employee_session');
  };

  // Initialize session from localStorage
  const initializeSession = () => {
    const stored = localStorage.getItem('cictrix_employee_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as EmployeeSession;
        setSession(parsed);
        
        // Find the employee data based on employee ID
        const employee = Object.values(MOCK_EMPLOYEE_DATA).find(
          (emp) => emp.employeeId === parsed.employeeId
        );
        if (employee) {
          setCurrentEmployee(employee);
        }
      } catch (error) {
        localStorage.removeItem('cictrix_employee_session');
      }
    }
  };

  return {
    session,
    currentEmployee,
    handleEmployeeLogin,
    handleEmployeeLogout,
    initializeSession,
  };
};

/**
 * Example App Component Structure
 * 
 * Here's how to integrate the employee components into your App.tsx:
 * 
 * function App() {
 *   const { session, currentEmployee, handleEmployeeLogin, handleEmployeeLogout, initializeSession } = useEmployeePortal();
 * 
 *   useEffect(() => {
 *     initializeSession();
 *   }, []);
 * 
 *   return (
 *     <BrowserRouter>
 *       <Routes>
 *         {/* Employee Routes */}
 *         <Route path="/employee/login" element={<EmployeeLoginPage onLogin={handleEmployeeLogin} />} />
 *         <Route
 *           path="/employee/dashboard"
 *           element={
 *             session && currentEmployee ? (
 *               <EmployeePage currentUser={currentEmployee} onLogout={handleEmployeeLogout} />
 *             ) : (
 *               <Navigate to="/employee/login" replace />
 *             )
 *           }
 *         />
 *         
 *         {/* Other routes... */}
 *       </Routes>
 *     </BrowserRouter>
 *   );
 * }
 */
