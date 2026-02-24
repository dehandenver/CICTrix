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

1. Start backend:
   ```bash
   cd c:\CICTrix
   docker-compose up
   ```
2. Start frontend:
   ```bash
   cd c:\CICTrix
   npm run dev
   ```
3. Open:
   - [http://localhost:5173/](http://localhost:5173/)

## Troubleshooting

- If a link shows “This site can’t be reached,” verify both frontend and backend processes are running.
- If `localhost` fails to resolve, use the `127.0.0.1` fallback URLs.
- Frontend is configured to use port `5173` with strict port mode; if port `5173` is occupied, the dev server will not auto-switch ports.

## Notes

- This guide is for development environment usage.
- Replace local URLs with your production domain in deployment documentation.
- Default credentials are for local testing only; rotate credentials before production use.

Last updated: February 24, 2026
