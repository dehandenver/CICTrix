# Employee Portal Implementation Checklist

A quick reference guide for integrating the employee portal components into your HRMO system.

## Prerequisites
- ✅ React 18+
- ✅ TypeScript 5+
- ✅ Tailwind CSS configured
- ✅ Lucide React installed (`npm install lucide-react`)
- ✅ React Router installed

## Files Created

### 1. Type Definitions
- [x] `src/types/employee.types.ts` - Employee, EmployeeSession, and AuthError interfaces

### 2. Components
- [x] `src/modules/employee/EmployeeLoginPage.tsx` - Authentication interface
- [x] `src/modules/employee/EmployeePage.tsx` - Employee dashboard and profile
- [x] `src/modules/employee/index.ts` - Module exports

### 3. Examples & Documentation
- [x] `src/examples/EmployeePortalIntegration.example.tsx` - Integration example with hooks
- [x] `EMPLOYEE_PORTAL_DOCUMENTATION.md` - Complete documentation

### 4. Updated Components
- [x] `src/components/Input.tsx` - Added icon support

## Integration Steps

### Step 1: Import Components
Add the following imports to your `src/App.tsx`:

```tsx
import { EmployeeLoginPage, EmployeePage } from './modules/employee';
import { Employee, EmployeeSession } from './types/employee.types';
```

### Step 2: Add State Management
Add state management for employee sessions in your App component:

```tsx
const [employeeSession, setEmployeeSession] = useState<EmployeeSession | null>(null);
const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
```

### Step 3: Implement Authentication Handler
Create a login handler function:

```tsx
const handleEmployeeLogin = (username: string, password: string) => {
  // TODO: Implement actual authentication
  // This should call your backend API or Supabase auth
  
  // Example with mock data:
  if (validateCredentials(username, password)) {
    const employee = await fetchEmployeeData(username);
    const session: EmployeeSession = {
      employeeId: employee.employeeId,
      email: employee.email,
      fullName: employee.fullName,
    };
    
    setEmployeeSession(session);
    setCurrentEmployee(employee);
    localStorage.setItem('cictrix_employee_session', JSON.stringify(session));
  }
};
```

### Step 4: Implement Logout Handler
Create a logout handler:

```tsx
const handleEmployeeLogout = () => {
  setEmployeeSession(null);
  setCurrentEmployee(null);
  localStorage.removeItem('cictrix_employee_session');
  navigate('/employee/login');
};
```

### Step 5: Add Routes
Add these routes to your `<Routes>` element:

```tsx
{/* Employee Portal Routes */}
<Route 
  path="/employee/login" 
  element={
    employeeSession ? (
      <Navigate to="/employee/dashboard" replace />
    ) : (
      <EmployeeLoginPage onLogin={handleEmployeeLogin} />
    )
  } 
/>
<Route
  path="/employee/dashboard"
  element={
    employeeSession && currentEmployee ? (
      <EmployeePage 
        currentUser={currentEmployee} 
        onLogout={handleEmployeeLogout} 
      />
    ) : (
      <Navigate to="/employee/login" replace />
    )
  }
/>
```

### Step 6: Initialize Session on App Load
Add session initialization in the useEffect:

```tsx
useEffect(() => {
  const stored = localStorage.getItem('cictrix_employee_session');
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as EmployeeSession;
      setEmployeeSession(parsed);
      
      // TODO: Fetch fresh employee data from backend
      // For now, you could store a cached version
    } catch {
      localStorage.removeItem('cictrix_employee_session');
    }
  }
}, []);
```

## Testing

### Test the LoginPage Component
```tsx
// In a test file or storybook
import { EmployeeLoginPage } from '@/modules/employee';

const MyTest = () => {
  const handleLogin = (username: string, password: string) => {
    console.log('Login attempt:', username, password);
  };

  return <EmployeeLoginPage onLogin={handleLogin} />;
};
```

### Test the EmployeePage Component
```tsx
import { EmployeePage } from '@/modules/employee';
import { Employee } from '@/types/employee.types';

const mockEmployee: Employee = {
  employeeId: 'EMP-001',
  fullName: 'John Doe',
  email: 'john@example.com',
  dateOfBirth: '1990-01-01',
  age: 34,
  gender: 'Male',
  civilStatus: 'Single',
  nationality: 'Filipino',
  mobileNumber: '+63-900-123-4567',
  homeAddress: '123 Street, City',
  emergencyContactName: 'Jane Doe',
  emergencyRelationship: 'Sister',
  emergencyContactNumber: '+63-900-765-4321',
  sssNumber: '01-1234567-0',
  philhealthNumber: 'PH-01-1234567-8',
  pagibigNumber: '111234567890',
  tinNumber: '111-222-333-000',
};

const MyPageTest = () => {
  return (
    <EmployeePage 
      currentUser={mockEmployee} 
      onLogout={() => console.log('Logged out')} 
    />
  );
};
```

## Feature Checklist

### EmployeeLoginPage
- [ ] Form validation (username and password required)
- [ ] Password strength validation
- [ ] Demo credentials display
- [ ] Error message display
- [ ] Loading state during login
- [ ] Responsive design on mobile/tablet
- [ ] Accessibility (WCAG AA)
- [ ] Focus management

### EmployeePage
- [ ] Profile header with employee info
- [ ] Sidebar navigation (collapsible)
- [ ] Top header bar with logout
- [ ] Personal Information card
- [ ] Contact & Address card
- [ ] Emergency Contact card
- [ ] Government Identifiers card
- [ ] Date formatting
- [ ] Missing data handling (shows "—")
- [ ] Responsive grid layout
- [ ] Tab navigation (Profile/Documents)
- [ ] Documents placeholder section

## Component Props Reference

### EmployeeLoginPage

```typescript
interface EmployeeLoginPageProps {
  onLogin: (username: string, password: string) => void;
  isLoading?: boolean;
}
```

**Example:**
```tsx
<EmployeeLoginPage 
  onLogin={handleLogin}
  isLoading={isAuthenticating}
/>
```

### EmployeePage

```typescript
interface EmployeePageProps {
  currentUser: Employee;
  onLogout: () => void;
}
```

**Example:**
```tsx
<EmployeePage 
  currentUser={employeeData}
  onLogout={handleLogout}
/>
```

## Styling Customization

### Change Primary Color
In `src/styles/globals.css`, update:
```css
:root {
  --color-primary: #0b3d91; /* Change this hex value */
  --color-primary-dark: #0a2f6e;
  --color-primary-hover: #0a2f6e;
  /* ... rest of colors ... */
}
```

### Adjust Card Spacing
Card padding can be adjusted in `EmployeePage.tsx`:
```tsx
<Card title="Personal Information" className="lg:col-span-1 p-6">
  {/* Adjust p-6 to p-4, p-8, etc. */}
</Card>
```

### Modify Sidebar Width
In `EmployeePage.tsx`, sidebar width classes:
```tsx
{sidebarOpen ? 'w-56' : 'w-20'}  {/* Change w-56 (224px) to desired width */}
```

## API Integration Points

### Authentication Endpoint
The `onLogin` callback in EmployeeLoginPage should:
1. Accept username and password
2. Call your backend authentication API
3. On success: Store session and employee data
4. On failure: Show error message via setError

### Employee Data Endpoint
Implement fetching of full employee profile:
```tsx
const fetchEmployeeData = async (employeeId: string): Promise<Employee> => {
  const response = await fetch(`/api/employees/${employeeId}`);
  return response.json();
};
```

## Production Checklist

Before going live:
- [ ] Remove demo credentials or disable them in production
- [ ] Implement real authentication backend
- [ ] Add password reset functionality
- [ ] Enable HTTPS only
- [ ] Implement session timeout
- [ ] Add audit logging for access
- [ ] Implement rate limiting on login attempts
- [ ] Add CSRF protection
- [ ] Test on target browsers
- [ ] Test with real employee data
- [ ] Implement error handling and logging
- [ ] Add user feedback/notifications
- [ ] Test performance with large datasets
- [ ] Security review of authentication flow
- [ ] Accessibility audit (WCAG 2.1 AA)

## Common Issues & Solutions

### Issue: Icons not showing
**Solution**: Install Lucide React
```bash
npm install lucide-react
```

### Issue: Tailwind classes not applying
**Solution**: Ensure Tailwind CSS configuration includes component files:
```js
content: [
  "./src/**/*.{js,ts,jsx,tsx}",
]
```

### Issue: Layout broken on mobile
**Solution**: Ensure viewport meta tag in HTML:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

### Issue: Logo not found
**Solution**: Verify logo path in `hrisLogo` import:
```tsx
import hrisLogo from '../../assets/hris-logo.svg';
```

## Performance Tips

1. **Memoize components** if they receive frequently changing props:
   ```tsx
   export const EmployeePage = React.memo(({ currentUser, onLogout }) => {
     // component code
   });
   ```

2. **Lazy load the Documents tab** content for faster initial render

3. **Cache employee data** to reduce API calls

4. **Use React DevTools Profiler** to identify performance bottlenecks

## Deployment Instructions

### Build for Production
```bash
npm run build
```

### Environment Variables
Create `.env` file:
```env
VITE_API_URL=https://your-api-domain.com
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Deploy
```bash
# Vercel
vercel

# Netlify
netlify deploy

# Docker
docker build -t hrmo-employee .
```

## Support Resources

- 📚 [Lucide React Icons](https://lucide.dev)
- 🎨 [Tailwind CSS Docs](https://tailwindcss.com)
- ⚛️ [React Documentation](https://react.dev)
- 🛣️ [React Router Docs](https://reactrouter.com)
- 🗄️ [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

For issues or questions, refer to the complete documentation in `EMPLOYEE_PORTAL_DOCUMENTATION.md`.
