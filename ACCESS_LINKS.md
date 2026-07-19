# CICTrix HRIS Access Guide

Reference for local development access to frontend pages and backend API endpoints, as well as live production URLs.

## Live Production URLs (Vercel)

> Canonical production host is **cic-trix.vercel.app** — the Vercel project that
> auto-deploys from `main`. The separate `cictrix.vercel.app` and
> `cic-trix-jet.vercel.app` projects do not track `main` and serve stale builds;
> do not use them.

| Service / Portal | Live URL | Description / Access |
|---|---|---|
| **1. Applicant Portal (Home)** | [https://cic-trix.vercel.app/](https://cic-trix.vercel.app/) | Public — submit a new application |
| **2. Interviewer Portal** | [https://cic-trix.vercel.app/interviewer/login](https://cic-trix.vercel.app/interviewer/login) | Set up via Admin portal |
| **3. Employee Portal** | [https://cic-trix.vercel.app/employee/login](https://cic-trix.vercel.app/employee/login) | Employee credentials |
| **4. Admin Portal** | [https://cic-trix.vercel.app/admin/login](https://cic-trix.vercel.app/admin/login) | Super Admin, RSP, LND, PM |
| **5. Application Status Tracker** | [https://cic-trix.vercel.app/track](https://cic-trix.vercel.app/track) | Public — look up application status by applicant ID |
| **Backend API** | [https://cic-trix.vercel.app/api](https://cic-trix.vercel.app/api) | Production API endpoints |
| **API Docs (Swagger)** | [https://cic-trix.vercel.app/api/docs](https://cic-trix.vercel.app/api/docs) | Production API Documentation |

## Local Environment URLs

| Service | Primary URL | Fallback URL |
|---|---|---|
| Frontend (Vite) | [http://localhost:5173](http://localhost:5173) | [http://127.0.0.1:5173](http://127.0.0.1:5173) |
| Backend API | [http://localhost:8000](http://localhost:8000) | [http://127.0.0.1:8000](http://127.0.0.1:8000) |

## Public Access

### Applicant Portal (Module 1)
- URL: [http://localhost:5173/](http://localhost:5173/)
- Description: Applicant registration and assessment workflow
- Access: Public (no login required)

### Application Status Tracker (Module 5)
- URL: [http://localhost:5173/track](http://localhost:5173/track)
- Description: Look up an existing application's progress by applicant ID / item number
- Access: Public (no login required)

## Employee Access

### Login
- URL: [http://localhost:5173/employee/login](http://localhost:5173/employee/login)
- Description: Employee authentication
- Access: Registered employees

### Dashboard
- URL: [http://localhost:5173/employee/dashboard](http://localhost:5173/employee/dashboard)
- Description: Employee profile and assigned tasks
- Access: Requires employee login

### Office Account Console (Module 2)
- URL: [http://localhost:5173/office/dashboard](http://localhost:5173/office/dashboard)
- Description: Shared dashboard for Office Management (Supervisors & Dept. Heads)
- Access: Office Supervisors / Department Heads

## Interviewer / Rater Access

### Login
- URL: [http://localhost:5173/interviewer/login](http://localhost:5173/interviewer/login)
- Description: Interviewer/rater authentication
- Access: Registered interviewers/raters

### Dashboard
- URL: [http://localhost:5173/interviewer/dashboard](http://localhost:5173/interviewer/dashboard)
- Description: Assigned applicants and evaluations
- Access: Requires interviewer login

### Evaluation Form
- URL pattern: `http://localhost:5173/interviewer/evaluate/{applicantId}`
- Example: [http://localhost:5173/interviewer/evaluate/123](http://localhost:5173/interviewer/evaluate/123)
- Description: Evaluate a specific applicant record
- Access: Requires interviewer login

## Admin Access

### Login
- URL: [http://localhost:5173/admin/login](http://localhost:5173/admin/login)
- Description: Admin authentication
- Roles: `super-admin`, `rsp`, `lnd`, `pm`

### Admin Credentials

There are no default development passwords, and none are recorded here. All four
admin roles authenticate against Supabase Auth, with the role read from
`user_roles`:

- Super Admin (HR Head, read-only viewer): `cictrix23+superadmin@gmail.com`
- RSP (Recruitment): `cictrix23+rsp@gmail.com`
- L&D (Learning & Development): `cictrix23+lnd@gmail.com`
- PM (Performance Management): `cictrix23+pm@gmail.com`

All four are plus-addresses on the single real inbox `cictrix23@gmail.com`, so
Supabase's **Authentication → Users → Reset password** button delivers and
anyone with that inbox can reset a forgotten password without SQL.

Accounts are provisioned by `scripts/create-admin-accounts.mjs`, which generates
random passwords and prints them once. Ask whoever ran it, or re-run it to
rotate — it is idempotent and re-asserts the role rather than erroring.

Do not paste passwords back into this file. The previous version of this section
listed `admin123` / `rsp123` / `lnd123` / `pm123`, which matched a hardcoded
`MOCK_USERS` table in `src/modules/admin/LoginPage.tsx`. That file compiles into
the public JS bundle, so those were readable by anyone who opened devtools on the
deployed site. Both the table and the accounts it stood in for are gone.

### Dashboards and Management Pages
- Super Admin Dashboard: [http://localhost:5173/admin](http://localhost:5173/admin)
- RSP Dashboard: [http://localhost:5173/admin/rsp](http://localhost:5173/admin/rsp)
- Qualified Applicants: [http://localhost:5173/admin/rsp/qualified](http://localhost:5173/admin/rsp/qualified)
- Qualified Applicant Details (pattern): `http://localhost:5173/admin/rsp/applicant/{applicantId}`
- Qualified Applicant Details (example): [http://localhost:5173/admin/rsp/applicant/123](http://localhost:5173/admin/rsp/applicant/123)
- Newly Hired: [http://localhost:5173/admin/rsp/new-hired](http://localhost:5173/admin/rsp/new-hired)
- Rater Management: [http://localhost:5173/admin/raters](http://localhost:5173/admin/raters)
- LND Dashboard: [http://localhost:5173/admin/lnd](http://localhost:5173/admin/lnd)
- LND Management: [http://localhost:5173/admin/lnd/manage](http://localhost:5173/admin/lnd/manage)
- PM Dashboard: [http://localhost:5173/admin/pm](http://localhost:5173/admin/pm)
- PM Management: [http://localhost:5173/admin/pm/manage](http://localhost:5173/admin/pm/manage)

## Backend API

### Base and Health
- API Base URL: [http://localhost:8000](http://localhost:8000)
- Health Check: [http://localhost:8000/health](http://localhost:8000/health)

### Endpoint Roots
- Authentication: [http://localhost:8000/api/auth/](http://localhost:8000/api/auth/)
- Applicants: [http://localhost:8000/api/applicants/](http://localhost:8000/api/applicants/)
- Evaluations: [http://localhost:8000/api/evaluations/](http://localhost:8000/api/evaluations/)

## Quick Launch

1. One-click start (recommended on Windows):
   ```bash
   cd c:\CICTrix
   start-dev.bat
   ```
   This starts backend (if Docker is running), waits for the frontend to respond on port `5173`, then opens the app in your browser. The frontend runs in a separate `CICTrix Frontend` window.
2. Manual start backend:
   ```bash
   cd c:\CICTrix
   docker compose up
   ```
   If Docker is not installed, backend URLs on port `8000` will not open.
3. Manual start frontend:
   ```bash
   cd c:\CICTrix
   npm run dev
   ```
4. Open:
   - [http://127.0.0.1:5173/](http://127.0.0.1:5173/)

## Commands to Run Each Module

### Full System Startup (All Services)
**Option A: One-command start (recommended)**
```bash
start-dev.bat
```

**Option B: Manual full startup from separate terminals**

Terminal 1 - Start Backend:
```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

Terminal 2 - Start Frontend:
```bash
npm run dev
```

### Backend Only
```bash
cd backend
python -m uvicorn main:app --reload --port 8000
```

### Frontend Only
```bash
npm run dev
```

### Access Each Module (After Servers Are Running)

| Module | Startup Command | Then Open |
|---|---|---|
| **1. Applicant** | `npm run dev` | [http://localhost:5173/](http://localhost:5173/) |
| **2. Interviewer / Rater** | `npm run dev` | [http://localhost:5173/interviewer/login](http://localhost:5173/interviewer/login) |
| **3. Employee** | `npm run dev` | [http://localhost:5173/employee/login](http://localhost:5173/employee/login) |
| **4. Admin (All Roles)** | `npm run dev` | [http://localhost:5173/admin/login](http://localhost:5173/admin/login) |
| **5. Application Status Tracker** | `npm run dev` | [http://localhost:5173/track](http://localhost:5173/track) |
| **API Documentation** | `cd backend && python -m uvicorn main:app --reload --port 8000` | [http://localhost:8000/docs](http://localhost:8000/docs) |

### Quick Access Shortcuts (Copy & Paste Ready)

**Run everything from VS Code terminal:**
```bash
# Terminal 1
cd backend && python -m uvicorn main:app --reload --port 8000

# Terminal 2
npm run dev
```

**Then navigate to:**
- Applicant Module (1): `http://localhost:5173/`
- Interviewer Dashboard (2): `http://localhost:5173/interviewer/login`
- Employee Dashboard (3): `http://localhost:5173/employee/login`
- Admin Dashboard (4): `http://localhost:5173/admin/login`
- Application Status Tracker (5): `http://localhost:5173/track`

### Optional: Auto-start on Windows login

- Enable once:
   ```bash
   cd c:\CICTrix
   enable-autostart.bat
   ```
- Disable anytime:
   ```bash
   cd c:\CICTrix
   disable-autostart.bat
   ```

## Troubleshooting

- Why this happens after restart:
   - `localhost:5173` and `localhost:8000` are local development servers, not always-on websites.
   - After reboot or closing terminals/VS Code, both servers stop, so browser shows “This site can’t be reached.”
   - Solution: run `start-dev.bat` each time you start your PC/dev session.
- If a link shows “This site can’t be reached,” verify both frontend and backend processes are running.
- If `localhost` fails to resolve, use the `127.0.0.1` URLs as primary.
- Frontend is configured to use port `5173` with strict port mode; if port `5173` is occupied, the dev server will not auto-switch ports.
- On this workstation, backend is currently unreachable until one runtime is installed:
   - Docker Desktop (`docker compose up`), or
   - Python 3.11+ (`cd backend && python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`)

## Notes

- This guide is for development environment usage.
- Replace local URLs with your production domain in deployment documentation.
- Default credentials are for local testing only; rotate credentials before production use.

Last updated: July 11, 2026
