# CICTrix HRIS - System Access Links

Quick reference guide for accessing all parts of the system.

---

## 🌐 Base URL
**Development:** http://localhost:5173

---

## 👥 Public Access

### Applicant Portal
**Main Application Form**
- **URL:** http://localhost:5173/
- **Description:** Complete applicant registration and assessment
- **Access:** Public (no login required)

---

## 💼 Interviewer/Rater Access

### Login
- **URL:** http://localhost:5173/interviewer/login
- **Description:** Interviewer/rater authentication page
- **Credentials:** Use registered interviewer email and name

### Dashboard
- **URL:** http://localhost:5173/interviewer/dashboard
- **Description:** View assigned applicants and evaluations
- **Access:** Requires interviewer login

### Evaluation Form
- **URL:** http://localhost:5173/interviewer/evaluate/:id
- **Description:** Evaluate specific applicant (replace `:id` with applicant ID)
- **Example:** http://localhost:5173/interviewer/evaluate/123
- **Access:** Requires interviewer login

---

## 🔐 Admin Access

### Login
- **URL:** http://localhost:5173/admin/login
- **Description:** Admin authentication page
- **Roles:** super-admin, rsp, lnd, pm
- **Default Credentials:**
  - **Super Admin:** admin@cictrix.gov.ph / admin123
  - **RSP:** rsp@cictrix.gov.ph / rsp123
  - **LND:** lnd@cictrix.gov.ph / lnd123
  - **PM:** pm@cictrix.gov.ph / pm123

### Super Admin Dashboard
- **URL:** http://localhost:5173/admin
- **Description:** Main administrative dashboard with full system access
- **Access:** Super Admin only

### RSP (Recruitment, Selection & Placement) Dashboard
- **URL:** http://localhost:5173/admin/rsp
- **Description:** Manage recruitment and selection processes
- **Access:** Super Admin, RSP

### Rater Management
- **URL:** http://localhost:5173/admin/raters
- **Description:** Manage interviewers/raters and assignments
- **Access:** Super Admin, RSP

### LND (Learning & Development) Dashboard
- **URL:** http://localhost:5173/admin/lnd
- **Description:** View LND statistics and reports
- **Access:** Super Admin, LND

### LND Management
- **URL:** http://localhost:5173/admin/lnd/manage
- **Description:** Manage learning and development activities
- **Access:** Super Admin, LND

### PM (Personnel Management) Dashboard
- **URL:** http://localhost:5173/admin/pm
- **Description:** View personnel management overview
- **Access:** Super Admin, PM

### PM Management
- **URL:** http://localhost:5173/admin/pm/manage
- **Description:** Manage personnel records and assignments
- **Access:** Super Admin, PM

---

## 🔧 Backend API

### API Base URL
**Development:** http://localhost:8000

### Health Check
- **URL:** http://localhost:8000/health
- **Description:** Check if backend is running

### API Endpoints
- **Authentication:** http://localhost:8000/api/auth/
- **Applicants:** http://localhost:8000/api/applicants/
- **Evaluations:** http://localhost:8000/api/evaluations/

---

## 📋 Quick Access Links (Copy & Paste)

```
Applicant Form:          http://localhost:5173/
Interviewer Login:       http://localhost:5173/interviewer/login
Interviewer Dashboard:   http://localhost:5173/interviewer/dashboard
Admin Login:             http://localhost:5173/admin/login
Super Admin Dashboard:   http://localhost:5173/admin
RSP Dashboard:           http://localhost:5173/admin/rsp
LND Dashboard:           http://localhost:5173/admin/lnd
PM Dashboard:            http://localhost:5173/admin/pm
Backend API:             http://localhost:8000
```

---

## 🚀 Getting Started

1. **Start the Backend:**
   ```bash
   cd c:\CICTrix
   docker-compose up
   ```

2. **Start the Frontend:**
   ```bash
   cd c:\CICTrix
   npm run dev
   ```

3. **Access the System:**
   - Open your browser
   - Navigate to http://localhost:5173/
   - Choose your role and login accordingly

---

## 📝 Notes

- All URLs are for development environment
- For production, replace `localhost:5173` with your production domain
- Default admin credentials are for testing only - change them in production
- Backend must be running on port 8000 for full functionality
- Frontend dev server runs on port 5173 (Vite default)

---

**Last Updated:** February 7, 2026
