# CICTrix HRIS Access Guide

Reference for local development access to frontend pages and backend API endpoints.

## Environment URLs

| Service | Primary URL | Fallback URL |
|---|---|---|
| Frontend (Vite) | [http://localhost:5173](http://localhost:5173) | [http://127.0.0.1:5173](http://127.0.0.1:5173) |
| Backend API | [http://localhost:8000](http://localhost:8000) | [http://127.0.0.1:8000](http://127.0.0.1:8000) |

## Public Access

### Applicant Portal
- URL: [http://localhost:5173/](http://localhost:5173/)
- Description: Applicant registration and assessment workflow
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

### Default Development Credentials
- Super Admin: `admin@cictrix.gov.ph / admin123`
- RSP: `rsp@cictrix.gov.ph / rsp123`
- LND: `lnd@cictrix.gov.ph / lnd123`
- PM: `pm@cictrix.gov.ph / pm123`

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
| **Applicant** | `npm run dev` | [http://localhost:5173/applicant/login](http://localhost:5173/applicant/login) |
| **Employee** | `npm run dev` | [http://localhost:5173/employee/login](http://localhost:5173/employee/login) |
| **Interviewer / Rater** | `npm run dev` | [http://localhost:5173/interviewer/login](http://localhost:5173/interviewer/login) |
| **Admin (All Roles)** | `npm run dev` | [http://localhost:5173/admin/login](http://localhost:5173/admin/login) |
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
- Applicant Module: `http://localhost:5173/applicant/login`
- Employee Dashboard: `http://localhost:5173/employee/login`
- Interviewer Dashboard: `http://localhost:5173/interviewer/login`
- Admin Dashboard: `http://localhost:5173/admin/login`

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

Last updated: March 9, 2026
