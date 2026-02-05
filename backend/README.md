# CICTrix HRIS Backend

FastAPI backend for CICTrix Human Resources Information System.

## Setup

1. **Install Python 3.11+** (if not already installed)

2. **Create virtual environment:**
```bash
python -m venv venv
venv\Scripts\activate  # On Windows
source venv/bin/activate  # On Mac/Linux
```

3. **Install dependencies:**
```bash
pip install -r requirements.txt
```

4. **Configure environment:**
```bash
cp .env.example .env
```
Edit `.env` and add your Supabase credentials:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY`: Your service role key
- `JWT_SECRET_KEY`: Generate a secure random key (e.g., `python -c "import secrets; print(secrets.token_urlsafe(32))"`)

5. **Run development server:**
```bash
python -m uvicorn main:app --reload
```

Server runs at `http://localhost:8000`
API docs available at `http://localhost:8000/docs`

## Project Structure

```
backend/
├── app/
│   ├── routes/          # API route handlers
│   │   ├── auth.py      # Authentication endpoints
│   │   ├── applicants.py # Applicant management
│   │   └── evaluations.py # Evaluation management
│   ├── models/          # Pydantic models for request/response
│   ├── core/            # Core functionality
│   │   ├── config.py    # Environment configuration
│   │   ├── security.py  # JWT token handling
│   │   └── supabase_client.py # Supabase connection
│   └── utils/           # Utility functions
│       └── dependencies.py # FastAPI dependencies
├── main.py              # FastAPI application entry point
├── requirements.txt     # Python dependencies
└── .env.example        # Environment variables template
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user info

### Applicants
- `GET /api/applicants` - List applicants (role-based)
- `GET /api/applicants/{id}` - Get applicant details
- `PUT /api/applicants/{id}` - Update applicant (Admin only)

### Evaluations
- `GET /api/evaluations` - List evaluations (role-based)
- `POST /api/evaluations` - Create evaluation (Rater/Interviewer only)

## Role-Based Access Control (RBAC)

The backend enforces access control based on user roles:

- **ADMIN**: Full access to all resources
- **PM** (Project Manager): Can manage applicants and evaluations
- **RSP** (Resource Planning): Can view evaluations and applicants
- **LND** (Learning & Development): Can view applicants and evaluations
- **RATER**: Can create evaluations for assigned applicants
- **INTERVIEWER**: Can view and evaluate assigned applicants
- **APPLICANT**: Can only view their own profile

## Next Steps

1. **Implement Supabase Auth**: Replace the placeholder login endpoint with actual Supabase Auth
2. **Create database tables**: Add `user_roles`, `assignments` tables for managing role-based access
3. **Update RLS policies**: Remove the overly permissive policies from `FIX_SUPABASE_RLS.sql`
4. **Add file upload handling**: Implement applicant attachment management
5. **Update frontend**: Configure React app to use backend API instead of direct Supabase queries

## Integration with Frontend

Update your React app to call backend endpoints instead of Supabase:

```typescript
// Before (direct Supabase)
const { data } = await supabase.from('applicants').select('*')

// After (via API)
const response = await fetch('/api/applicants', {
  headers: { 'Authorization': `Bearer ${token}` }
})
```
