# Employee Portal - Architecture & Flow Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HRMO SYSTEM                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                        App.tsx (Router)                       │  │
│  │  ┌─────────────────────────────────────────────────────────┐ │  │
│  │  │ Routes:                                                 │ │  │
│  │  │ /admin/login          → AdminLogin                      │ │  │
│  │  │ /admin/dashboard      → AdminDashboards               │ │  │
│  │  │ /interviewer/login    → InterviewerLogin              │ │  │
│  │  │ /employee/login       → EmployeeLoginPage (NEW!) ✨   │ │  │
│  │  │ /employee/dashboard   → EmployeePage (NEW!) ✨         │ │  │
│  │  └─────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Employee Portal Flow                       │  │
│  │                                                               │  │
│  │  ┌──────────────────────────────────────────────────────┐    │  │
│  │  │  1. User visits /employee/login                      │    │  │
│  │  │     ↓↓↓                                              │    │  │
│  │  │  2. EmployeeLoginPage Component Rendered            │    │  │
│  │  │     - Centered login card displayed                │    │  │
│  │  │     - Demo credentials available                   │    │  │
│  │  │     ↓↓↓                                              │    │  │
│  │  │  3. User enters credentials & clicks Sign In        │    │  │
│  │  │     ↓↓↓                                              │    │  │
│  │  │  4. onLogin() callback triggered                    │    │  │
│  │  │     - Username & password validated                │    │  │
│  │  │     - Backend authentication API called             │    │  │
│  │  │     ↓↓↓                                              │    │  │
│  │  │  5. Session stored in localStorage                  │    │  │
│  │  │     ↓↓↓                                              │    │  │
│  │  │  6. Navigate to /employee/dashboard                 │    │  │
│  │  │     ↓↓↓                                              │    │  │
│  │  │  7. EmployeePage Component Rendered                 │    │  │
│  │  │     - Sidebar navigation displayed                   │    │  │
│  │  │     - Profile header shown                          │    │  │
│  │  │     - Employee data cards populated                 │    │  │
│  │  │     ↓↓↓                                              │    │  │
│  │  │  8. User can:                                        │    │  │
│  │  │     - View personal information                      │    │  │
│  │  │     - Collapse/expand sidebar                        │    │  │
│  │  │     - Switch between Profile/Documents tabs         │    │  │
│  │  │     - Click Logout button                            │    │  │
│  │  │     ↓↓↓                                              │    │  │
│  │  │  9. User clicks Logout                               │    │  │
│  │  │     - Session cleared from localStorage              │    │  │
│  │  │     - Redirect to /employee/login                    │    │  │
│  │  │     ↓↓↓                                              │    │  │
│  │  │  10. Back to step 1 (Login page)                     │    │  │
│  │  └──────────────────────────────────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy

```
App.tsx
│
├─ BrowserRouter
│  │
│  └─ Routes
│     │
│     ├─ Route /employee/login
│     │  └─ EmployeeLoginPage
│     │     ├─ Button (Sign In)
│     │     ├─ Input (Username, Password)
│     │     └─ Card (Info Box)
│     │
│     └─ Route /employee/dashboard
│        └─ EmployeePage
│           ├─ Sidebar
│           │  ├─ NavLink (Profile)
│           │  ├─ NavLink (Documents)
│           │  └─ Button (Logout)
│           │
│           ├─ Header
│           │  ├─ Logo
│           │  └─ User Info
│           │
│           └─ Content Grid
│              ├─ Card (Personal Information)
│              │  ├─ DataGridItem (DOB)
│              │  ├─ DataGridItem (Age)
│              │  ├─ DataGridItem (Gender)
│              │  ├─ DataGridItem (Civil Status)
│              │  └─ DataGridItem (Nationality)
│              │
│              ├─ Card (Contact & Address)
│              │  ├─ DataGridItem (Mobile)
│              │  ├─ DataGridItem (Email)
│              │  └─ DataGridItem (Address)
│              │
│              ├─ Card (Emergency Contact)
│              │  ├─ DataGridItem (Name)
│              │  ├─ DataGridItem (Relationship)
│              │  └─ DataGridItem (Phone)
│              │
│              └─ Card (Government Identifiers)
│                 ├─ IDGrid (SSS)
│                 ├─ IDGrid (PhilHealth)
│                 ├─ IDGrid (PAG-IBIG)
│                 └─ IDGrid (TIN)
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  User Input                                                          │
│     ↓                                                                │
│  EmployeeLoginPage Component                                        │
│     ├─ onLogin(username, password)                                  │
│     ↓                                                                │
│  App.tsx (handleEmployeeLogin)                                      │
│     ├─ Validate credentials                                         │
│     ├─ Call Auth API / Firebase / Supabase                          │
│     ├─ Fetch Employee data                                          │
│     ├─ Store session in localStorage                                │
│     ├─ Update state (employeeSession, currentEmployee)             │
│     ↓                                                                │
│  EmployeePage Component                                             │
│     ├─ Receives: currentUser (Employee object)                      │
│     ├─ Receives: onLogout (callback function)                       │
│     ├─ Display: All employee fields                                 │
│     ├─ Renders: Profile, Personal Info, Contact, IDs               │
│     ↓                                                                │
│  User interacts with EmployeePage                                   │
│     ├─ View profile information                                     │
│     ├─ Navigate tabs (Profile/Documents)                            │
│     ├─ Toggle sidebar                                               │
│     ├─ Click Logout                                                 │
│     ↓                                                                │
│  onLogout() callback                                                │
│     ├─ Clear session from localStorage                              │
│     ├─ Reset state                                                  │
│     ├─ Redirect to /employee/login                                  │
│     ↓                                                                │
│  Back to EmployeeLoginPage                                          │
│     ↓                                                                │
│  Cycle repeats...                                                   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## State Management Flow

```
┌──────────────────────────────────────────────────┐
│           App.tsx State                          │
│                                                   │
│  employeeSession (EmployeeSession | null)        │
│  ├─ employeeId: string                           │
│  ├─ email: string                                │
│  └─ fullName: string                             │
│                                                   │
│  currentEmployee (Employee | null)               │
│  ├─ Profile: employeeId, fullName, email        │
│  ├─ Personal: DOB, age, gender, etc.            │
│  ├─ Contact: mobile, address                     │
│  ├─ Emergency: contact name, phone, etc.        │
│  └─ IDs: SSS, PhilHealth, PAG-IBIG, TIN         │
└──────────────────────────────────────────────────┘
         ↓                        ↓
┌──────────────────────┐  ┌──────────────────────┐
│ EmployeeLoginPage    │  │  EmployeePage       │
├──────────────────────┤  ├──────────────────────┤
│ Reading State: None  │  │ Reading State:       │
│                      │  │ - currentEmployee   │
│ Writing State via:   │  │ - employeeSession   │
│ - onLogin callback   │  │                      │
│   triggers           │  │ Writing State via:   │
│   handleEmployeeLogin│  │ - onLogout callback  │
│                      │  │   triggers          │
│                      │  │   handleLogout      │
└──────────────────────┘  └──────────────────────┘
```

---

## Component Props & Callbacks

```
┌─────────────────────────────────────────────────┐
│  EmployeeLoginPage Component                    │
├─────────────────────────────────────────────────┤
│                                                  │
│  Props (Input):                                 │
│  ├─ onLogin: Function                           │
│  │  └─ Parameters: (username, password)         │
│  │     └─ Return: void                          │
│  │     └─ Action: Authenticate user            │
│  │                                              │
│  └─ isLoading?: boolean (optional)              │
│     └─ Shows loading state on button            │
│                                                  │
│  State (Internal):                              │
│  ├─ username: string                            │
│  ├─ password: string                            │
│  ├─ error: string                               │
│  └─ showCredentials: boolean                    │
│                                                  │
│  Handlers:                                      │
│  ├─ handleSubmit: Form validation, onLogin call│
│  └─ handleDemoLogin: Pre-fill demo credentials │
│                                                  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  EmployeePage Component                         │
├─────────────────────────────────────────────────┤
│                                                  │
│  Props (Input):                                 │
│  ├─ currentUser: Employee (Required)            │
│  │  └─ All employee data fields                 │
│  │                                              │
│  └─ onLogout: Function                          │
│     └─ Parameters: none                         │
│     └─ Return: void                             │
│     └─ Action: Clear session, redirect          │
│                                                  │
│  State (Internal):                              │
│  ├─ activeTab: 'profile' | 'documents'          │
│  └─ sidebarOpen: boolean                        │
│                                                  │
│  Handlers:                                      │
│  ├─ setActiveTab: Switch between tabs           │
│  ├─ setOpenSidebar: Toggle sidebar              │
│  ├─ formatDate: Format date to locale           │
│  └─ Navigation helpers                          │
│                                                  │
│  Subcomponents:                                 │
│  ├─ Sidebar: Navigation & logout                │
│  ├─ Header: User info & title                   │
│  ├─ ProfileHeader: Blue gradient section        │
│  ├─ DataGridItem: Individual data display       │
│  ├─ Card: Container for data groups             │
│  └─ NavLink: Sidebar navigation items           │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## URL Routing Map

```
Application URLs:

/admin/login
  ↓
  AdminLogin Component
  ↓
  /admin/* (Protected admin routes)

/interviewer/login
  ↓
  InterviewerLogin Component
  ↓
  /interviewer/* (Protected interviewer routes)

/employee/login                    (NEW! ✨)
  ↓
  EmployeeLoginPage Component
  └─ Demo: employee01 / hr2024
  ↓
  /employee/dashboard              (NEW! ✨)
    ↓
    EmployeePage Component
    ├─ Profile Tab (Default)
    │  └─ /employee/dashboard?tab=profile
    └─ Documents Tab
       └─ /employee/dashboard?tab=documents
       ↓
       /employee/login (on logout)
```

---

## Integration Entry Points

```
┌────────────────────────────────────────────────────┐
│  Required Integration Points                       │
├────────────────────────────────────────────────────┤
│                                                     │
│  1. Authentication Handler                         │
│     Location: App.tsx                              │
│     Function: handleEmployeeLogin                  │
│     Input: username, password                      │
│     Output: Sets session & employee state          │
│     API Call: POST /api/auth/login                 │
│                                                     │
│  2. Employee Data Handler                          │
│     Location: App.tsx                              │
│     Dependency: After authentication               │
│     Function: fetchEmployeeData                    │
│     Input: employeeId                              │
│     Output: Employee object                        │
│     API Call: GET /api/employees/{id}              │
│                                                     │
│  3. Logout Handler                                 │
│     Location: App.tsx                              │
│     Function: handleEmployeeLogout                 │
│     Action: Clear session                          │
│     Storage: localStorage.removeItem()             │
│     Navigation: Redirect to /employee/login        │
│                                                     │
│  4. Session Persistence                            │
│     Location: App.tsx useEffect                    │
│     Storage: localStorage                          │
│     Key: cictrix_employee_session                  │
│     Format: JSON serialized EmployeeSession        │
│                                                     │
│  5. Protected Routes                               │
│     Pattern: Check if session exists               │
│     Redirect: /employee/login if no session        │
│     Implementation: Guard in App.tsx routes        │
│                                                     │
└────────────────────────────────────────────────────┘
```

---

## File Dependency Graph

```
Entry Point: App.tsx
       ↓
   ├─→ EmployeeLoginPage.tsx
   │   ├─→ Input.tsx (with icon support)
   │   ├─→ Button.tsx
   │   ├─→ Lucide Icons
   │   └─→ admin.css
   │
   └─→ EmployeePage.tsx
       ├─→ Card.tsx
       ├─→ Button.tsx
       ├─→ Lucide Icons
       ├─→ admin.css
       └─→ types/employee.types.ts

Shared Dependencies:
   ├─→ Lucide React (Icons)
   ├─→ Tailwind CSS (Styling)
   ├─→ Globals.css (Variables)
   ├─→ Components.css (Component styles)
   └─→ TypeScript (Type safety)
```

---

## Responsive Layout Breakpoints

```
Mobile (< 768px)
┌────────────────────┐
│ EmployeeLoginPage  │
│  - Card full width │
│  - Single column   │
└────────────────────┘

EmployeePage
┌──────────────────────────┐
│ Sidebar (w-20 - icon)    │
├──────────────────────────┤
│ Header                   │
├──────────────────────────┤
│ 1-column Grid Layout     │
│ ┌────────────────────┐   │
│ │ Personal Info      │   │
│ ├────────────────────┤   │
│ │ Contact & Address  │   │
│ ├────────────────────┤   │
│ │ Emergency Contact  │   │
│ ├────────────────────┤   │
│ │ Gov Identifiers    │   │
│ └────────────────────┘   │
└──────────────────────────┘

Tablet (768px - 1024px)
┌──────────────────────────────────────┐
│ w-56 Sidebar │ Header               │
├──────────────┼──────────────────────┤
│              │ 2-column Grid        │
│              │ ┌─────────┬─────────┐ │
│              │ │ Personal│ Contact │ │
│              │ └─────────┴─────────┘ │
│              │ ┌─────────┬─────────┐ │
│              │ │ Emerg.  │ Gov IDs │ │
│              │ └─────────┴─────────┘ │
└──────────────┴──────────────────────┘

Desktop (1024px+)
┌────────────────────────────────────────────┐
│ w-56 Sidebar │ Header                      │
├──────────────┼─────────────────────────────┤
│              │ 3-column Grid               │
│              │ ┌────────┬────────┬────────┐ │
│              │ │Personal│Contact │Emerg.  │ │
│              │ └────────┴────────┴────────┘ │
│              │ ┌─────────────────────────┐ │
│              │ │  Gov Identifiers (Full) │ │
│              │ └─────────────────────────┘ │
└──────────────┴─────────────────────────────┘
```

---

## Session Lifecycle

```
┌────────────────────────────────────────────────────┐
│           SESSION LIFECYCLE                         │
├────────────────────────────────────────────────────┤
│                                                     │
│ 1. INITIAL STATE                                   │
│    employeeSession = null                          │
│    currentEmployee = null                          │
│    localStorage empty                              │
│    ↓                                               │
│                                                     │
│ 2. APP LOAD                                        │
│    useEffect checks localStorage                   │
│    Session exists? ✗                               │
│    ↓ Redirect to /employee/login                   │
│                                                     │
│ 3. LOGIN PAGE SHOWN                                │
│    EmployeeLoginPage rendered                      │
│    User enters credentials                         │
│    ↓                                               │
│                                                     │
│ 4. AUTHENTICATION                                  │
│    onLogin triggered                               │
│    Backend validation                              │
│    Session created ✓                               │
│    ↓                                               │
│                                                     │
│ 5. SESSION STORED                                  │
│    employeeSession = { id, email, name }          │
│    currentEmployee = { ...full data }              │
│    localStorage set                                │
│    ↓                                               │
│                                                     │
│ 6. DASHBOARD SHOWN                                 │
│    EmployeePage rendered with userData             │
│    User views profile information                  │
│    ↓                                               │
│                                                     │
│ 7. PAGE REFRESH                                    │
│    App reloads                                     │
│    useEffect checks localStorage ✓                 │
│    Session exists → Skip login                     │
│    Dashboard shown immediately                     │
│    ↓                                               │
│                                                     │
│ 8. LOGOUT                                          │
│    onLogout triggered                              │
│    employeeSession = null                          │
│    currentEmployee = null                          │
│    localStorage cleared                            │
│    Redirect to /employee/login                     │
│    ↓ Back to step 1                                │
│                                                     │
└────────────────────────────────────────────────────┘
```

---

## Error Handling Flow

```
User inputs credentials
       ↓
Input validation
       ├─ Empty username? ✗ → Error: "Employee ID required"
       ├─ Empty password? ✗ → Error: "Password required"
       └─ Valid? ✓ → Continue
       ↓
API call to backend
       ├─ Network error? ✗ → Error: "Connection failed"
       ├─ Invalid credentials? ✗ → Error: "Invalid credentials"
       ├─ Account disabled? ✗ → Error: "Account disabled"
       └─ Success? ✓ → Continue
       ↓
Store session
       ├─ localStorage error? ✗ → Error: "Storage failed"
       └─ Success? ✓ → Continue
       ↓
Fetch employee data
       ├─ Not found? ✗ → Error: "Employee data not found"
       └─ Success? ✓ → Continue
       ↓
Redirect to dashboard
       ✓ Login complete
```

---

**For detailed information about each component, see:**
- `EMPLOYEE_PORTAL_DOCUMENTATION.md` - Full documentation
- `EMPLOYEE_PORTAL_SETUP.md` - Implementation guide
- Component source files in `src/modules/employee/`
