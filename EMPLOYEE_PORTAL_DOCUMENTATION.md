# Employee Portal Components Documentation

## Overview

This documentation covers the two main components for the employee-facing side of the HRMO (Human Resource Management Office) system:

1. **EmployeeLoginPage.tsx** - Authentication interface for employees
2. **EmployeePage.tsx** - Employee profile and self-service dashboard

Both components are built with React, TypeScript, Tailwind CSS, and follow the design patterns established in your existing admin modules.

---

## Component 1: EmployeeLoginPage

### Purpose
Provides a secure, professional login interface for employees to access their self-service portal.

### Features
- ✅ Responsive, centered login card design
- ✅ Username/Employee ID and password authentication
- ✅ Input validation with error messaging
- ✅ Demo credentials toggle (for testing)
- ✅ Lucide React icons for visual clarity
- ✅ Loading state management
- ✅ Mobile-optimized layout

### Props

```typescript
interface EmployeeLoginPageProps {
  onLogin: (username: string, password: string) => void;
  isLoading?: boolean;
}
```

### Usage Example

```tsx
import { EmployeeLoginPage } from '@/modules/employee';

export const MyApp = () => {
  const handleLogin = (username: string, password: string) => {
    // Call your authentication API
    console.log(`Logging in: ${username}`);
  };

  return (
    <EmployeeLoginPage 
      onLogin={handleLogin}
      isLoading={false}
    />
  );
};
```

### Demo Credentials
- **Username**: `employee01`
- **Password**: `hr2024`

### Design Highlights
- **Color Scheme**: Uses primary blue (#0b3d91) from your HRMO system
- **Layout**: Centered card with logo, header, form, and security notice
- **Icons**: Lock and User icons from Lucide React
- **Info Box**: Collapsible demo credentials section for testing
- **Accessibility**: Proper labels, error states, and keyboard navigation support

---

## Component 2: EmployeePage

### Purpose
Displays comprehensive employee profile information in an organized, professional dashboard with sidebar navigation.

### Features
- ✅ Collapsible sidebar navigation
- ✅ Employee profile header with avatar
- ✅ Tabbed navigation (My Profile / Documents)
- ✅ Responsive 3-column grid layout
- ✅ Multiple information cards organized by category
- ✅ Government identifiers section
- ✅ Emergency contact information
- ✅ Sticky header with quick access info
- ✅ Mobile-responsive design

### Props

```typescript
interface EmployeePageProps {
  currentUser: Employee;
  onLogout: () => void;
}
```

### Data Fields Displayed

#### Profile Header
- Full Name
- Employee ID
- Email

#### Personal Information Card
- Date of Birth (formatted)
- Age
- Gender
- Civil Status
- Nationality

#### Contact & Address Card
- Mobile Number
- Email
- Home Address

#### Emergency Contact Card
- Contact Name
- Relationship
- Contact Number

#### Government Identifiers Card
- SSS Number
- PhilHealth Number
- PAG-IBIG Number
- TIN Number

### Usage Example

```tsx
import { EmployeePage } from '@/modules/employee';
import { Employee } from '@/types/employee.types';

const employeeData: Employee = {
  employeeId: 'EMP-2024-001',
  fullName: 'Maria Santos',
  email: 'maria.santos@ilongcity.gov.ph',
  dateOfBirth: '1990-05-15',
  age: 34,
  gender: 'Female',
  civilStatus: 'Married',
  nationality: 'Filipino',
  mobileNumber: '+63-908-123-4567',
  homeAddress: '123 Rizal Street, Iloilo City',
  emergencyContactName: 'Juan Santos',
  emergencyRelationship: 'Spouse',
  emergencyContactNumber: '+63-908-765-4321',
  sssNumber: '01-2345678-0',
  philhealthNumber: 'PH-01-2345678-9',
  pagibigNumber: '121234567890',
  tinNumber: '123-456-789-000',
};

export const MyDashboard = () => {
  const handleLogout = () => {
    // Clear session and redirect to login
    console.log('User logged out');
  };

  return (
    <EmployeePage 
      currentUser={employeeData}
      onLogout={handleLogout}
    />
  );
};
```

### Design Features

#### Sidebar Navigation
- **Collapsible**: Toggle between expanded and icon-only modes
- **Dark Theme**: Slate-900 background for visual separation
- **Active States**: Highlighted navigation items
- **Fixed Position**: Sticky navigation on screen

#### Profile Header
- **Gradient Background**: Blue gradient (from your color scheme)
- **Avatar Circle**: White background with user icon
- **Information Display**: Name, employee ID, and email
- **Shadow**: Professional elevation effect

#### Content Grid
- **Responsive**: 1 column (mobile), 2 columns (tablet), 3 columns (desktop)
- **Cards**: White background with subtle shadows
- **Typography**: Hierarchical font sizes and weights
- **Icons**: Lucide React icons for visual context

#### Data Presentation
- **Clean Layout**: Organized with borders and proper spacing
- **Icon Integration**: Each data item includes relevant icon
- **Missing Data Handling**: Shows "—" for empty fields
- **Date Formatting**: Automatic date formatting to user locale

### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  Sidebar  │  Header (User Info & Logout)               │
├───────────┼───────────────────────────────────────────────┤
│           │  Profile Header (Blue gradient)              │
│  Nav      ├───────────────────────────────────────────────┤
│  Items    │  Grid Layout (Responsive)                    │
│           ├─────────────┬─────────────┬─────────────┤
│  Profile  │ Personal    │ Contact &   │ Emergency   │
│  Docs     │ Info Card   │ Address     │ Contact     │
│           │             │ Card        │ Card        │
│  Logout   ├─────────────┴─────────────┴─────────────┤
│           │ Government Identifiers (Full Width)     │
│           ├─────────────┬─────────────┬─────────────┤
│           │ SSS         │ PhilHealth  │ PAG-IBIG    │
│           ├─────────────┼─────────────┼─────────────┤
│           │ TIN         │             │             │
└───────────┴─────────────┴─────────────┴─────────────┘
```

---

## Employee Type Definition

```typescript
export interface Employee {
  // Profile Information
  employeeId: string;
  fullName: string;
  email: string;

  // Personal Information
  dateOfBirth: string; // ISO format: YYYY-MM-DD
  age: number;
  gender: 'Male' | 'Female' | 'Other' | 'Prefer not to say';
  civilStatus: 'Single' | 'Married' | 'Widowed' | 'Divorced' | 'Separated';
  nationality: string;

  // Contact & Address
  mobileNumber: string;
  homeAddress: string;

  // Emergency Contact
  emergencyContactName: string;
  emergencyRelationship: string;
  emergencyContactNumber: string;

  // Government Identifiers
  sssNumber: string;
  philhealthNumber: string;
  pagibigNumber: string;
  tinNumber: string;

  // Metadata
  createdAt?: string;
  updatedAt?: string;
}
```

---

## Integration Guide

### 1. Add Routes to App.tsx

```tsx
import { EmployeeLoginPage, EmployeePage } from '@/modules/employee';
import { Employee, EmployeeSession } from '@/types/employee.types';

function App() {
  const [employeeSession, setEmployeeSession] = useState<EmployeeSession | null>(null);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);

  const handleEmployeeLogin = (username: string, password: string) => {
    // Your login logic here
    // Fetch employee data and set session
  };

  const handleEmployeeLogout = () => {
    setEmployeeSession(null);
    setCurrentEmployee(null);
    localStorage.removeItem('cictrix_employee_session');
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* Employee Routes */}
        <Route 
          path="/employee/login" 
          element={<EmployeeLoginPage onLogin={handleEmployeeLogin} />} 
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
      </Routes>
    </BrowserRouter>
  );
}
```

### 2. Update Input Component (Already Done ✅)

The Input component now supports icons:

```tsx
<Input
  type="email"
  label="Email"
  placeholder="Enter email"
  icon={<Mail size={18} />}
/>
```

### 3. Import Components

```tsx
import { EmployeeLoginPage, EmployeePage } from '@/modules/employee';
import { Employee } from '@/types/employee.types';
```

---

## Styling & Theming

### Color Palette
- **Primary Blue**: `#0b3d91` - Main accent color from HRMO system
- **Blue Gradient**: `from-blue-600 to-blue-800` - Header background
- **Sidebar**: `bg-slate-900` - Dark navigation background
- **Backgrounds**: `bg-gray-50` - Light page background
- **Cards**: `bg-white` - Card backgrounds
- **Text**: Gray scale for hierarchy

### CSS Classes Used
- **Tailwind CSS**: All styling uses utility classes
- **Custom CSS**: References to existing `admin.css` for consistency
- **Responsive Breakpoints**: 
  - Mobile: 1-column layout
  - Tablet (md): 2-column layout
  - Desktop (lg): 3-column layout

### Icons
All UI icons use **Lucide React**:
- `User`, `Lock`, `Menu`, `X` - Navigation & UI
- `Phone`, `MapPin`, `Calendar`, `Heart` - Data fields
- `Home`, `IdCard`, `Mail`, `FileText` - Contact & docs
- `LogOut`, `AlertCircle` - Actions & alerts

---

## Accessibility Features

✅ **Semantic HTML**: Proper heading hierarchy and element usage
✅ **ARIA Labels**: Form labels and buttons properly labeled
✅ **Keyboard Navigation**: All interactive elements keyboard accessible
✅ **Color Contrast**: WCAG AA compliant contrast ratios
✅ **Focus States**: Clear focus indicators for keyboard users
✅ **Error Handling**: Clear error messages with error icons
✅ **Mobile Touch**: Adequate touch target sizes (44x44px minimum)

---

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari 14+, Chrome Mobile)

---

## Performance Considerations

- **Component Splitting**: Sidebar and header are memoizable
- **Conditional Rendering**: Tab content only renders when active
- **Image Optimization**: Logo images are optimized SVGs
- **CSS-in-JS**: Uses Tailwind for minimal runtime overhead
- **No External API Calls**: Component is presentational (calls props handlers)

---

## Future Enhancements

- [ ] Document download functionality
- [ ] Profile photo upload
- [ ] Leave balance display
- [ ] Pay slip access
- [ ] Import API integration
- [ ] Dark mode toggle
- [ ] Print profile option
- [ ] Two-factor authentication
- [ ] Change password dialog
- [ ] Notification system

---

## Support & Troubleshooting

### Login not working?
- Check that `onLogin` callback is properly implemented
- Verify username and password validation logic
- Check browser console for errors

### Page layout broken?
- Ensure Tailwind CSS is properly compiled
- Check that custom CSS files are imported
- Verify Lucide React is installed (`npm install lucide-react`)

### Icons not showing?
- Install Lucide React: `npm install lucide-react`
- Check that imports are correct
- Verify icon names match Lucide documentation

### Mobile view issues?
- Check viewport meta tag in HTML
- Ensure mobile breakpoints are correct
- Test with browser dev tools device emulation

---

## Contact

For questions or issues with these components, contact your development team or HRMO technical support.
