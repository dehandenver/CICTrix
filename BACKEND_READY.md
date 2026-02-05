# ✅ Node.js/Express Backend - Setup Complete!

Your Node.js Express backend is **ready to go** and **already running**!

## What's Been Created

### Backend Application
- **Express.js** REST API server
- **TypeScript** for type-safe code
- **JWT authentication** with role-based access control
- **Supabase integration** for database operations
- **CORS** configured for your React frontend

### File Structure
```
backend/
├── src/
│   ├── index.ts           ← Main server (now running!)
│   ├── config.ts          ← Environment configuration
│   ├── routes/
│   │   ├── auth.ts        ← Login/logout/me endpoints
│   │   ├── applicants.ts  ← Applicant CRUD with RBAC
│   │   └── evaluations.ts ← Evaluation management
│   ├── middleware/
│   │   └── auth.ts        ← JWT & role validation
│   ├── utils/
│   │   ├── supabase.ts    ← Supabase client
│   │   └── jwt.ts         ← Token creation & verification
│   └── types/
│       └── index.ts       ← TypeScript interfaces
├── dist/                  ← Compiled JavaScript
├── package.json
├── tsconfig.json
├── .env                   ← Supabase credentials (ready!)
└── README-NODEJS.md       ← Detailed documentation
```

## Server Status

✅ **Running on:** http://localhost:8000
✅ **Health check:** http://localhost:8000/health
✅ **Credentials:** Pre-configured with your Supabase URL and keys

## API Endpoints

```
Authentication
├── POST   /api/auth/login     - Login endpoint (needs implementation)
├── POST   /api/auth/logout    - Logout
└── GET    /api/auth/me        - Get current user (requires JWT)

Applicants (Role-based)
├── GET    /api/applicants     - List applicants
├── GET    /api/applicants/:id - Get applicant details
└── PUT    /api/applicants/:id - Update applicant (Admin only)

Evaluations (Role-based)
├── GET    /api/evaluations    - List evaluations
└── POST   /api/evaluations    - Create evaluation (Rater/Interviewer only)
```

## Role-Based Access Control (RBAC)

Automatically enforced on all endpoints:

- **ADMIN** - Full access to everything
- **PM** - Manage applicants and evaluations
- **RSP** - View evaluations and applicants
- **LND** - View applicants and evaluations  
- **RATER** - Create evaluations for assigned applicants
- **INTERVIEWER** - View and evaluate assigned applicants
- **APPLICANT** - View their own profile only

## How to Use It

### Start the Server
```bash
cd c:\CICTrix\backend
npx tsx src/index.ts
```

### Call from React Frontend
```typescript
// Example: Get applicants
const response = await fetch('/api/applicants', {
  headers: {
    'Authorization': `Bearer ${token}`  // JWT token from auth
  }
})
const applicants = await response.json()
```

### Terminal Commands
```bash
# Development (auto-reload on file changes)
npm run dev

# Build TypeScript
npm run build

# Run compiled server
npm start

# Check code quality
npm run lint
```

## Environment Variables

Your `.env` is pre-configured with:
- ✅ `SUPABASE_URL` - Your Supabase project
- ✅ `SUPABASE_KEY` - Anon key (already set)
- ⏳ `SUPABASE_SERVICE_ROLE_KEY` - Get from Supabase Settings > API > service_role
- ✅ `JWT_SECRET_KEY` - For signing tokens

## Next Steps

1. ✅ Backend created and running
2. 🔄 **Get Service Role Key from Supabase**
   - Go to: https://supabase.com/dashboard
   - Project Settings > API > Copy `service_role` key
   - Paste in `backend/.env`: `SUPABASE_SERVICE_ROLE_KEY=your_key_here`
3. 🔄 Run database migrations
   - Execute SQL from: `supabase/schema_with_backend.sql` in Supabase SQL Editor
4. 🔄 Update React frontend to use backend API
5. 🔄 Implement Supabase Auth (currently placeholder in `/api/auth/login`)
6. 🔄 Test role-based access control
7. 🔄 Deploy to production (Azure, Vercel, etc.)

## Frontend Integration Example

```typescript
// src/services/api.ts
const API_BASE = 'http://localhost:8000/api'

export async function getApplicants(token: string) {
  const response = await fetch(`${API_BASE}/applicants`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!response.ok) throw new Error('Failed to fetch')
  return response.json()
}

export async function createEvaluation(token: string, data: any) {
  const response = await fetch(`${API_BASE}/evaluations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  return response.json()
}
```

## Database Setup Required

**Important:** Run this in Supabase SQL Editor before using the backend:

Copy all SQL from: `supabase/schema_with_backend.sql`

This creates:
- `user_roles` table (user accounts and roles)
- `evaluations` table (evaluation records)
- `assignments` table (rater assignments)
- RLS policies (row-level security)

## Troubleshooting

**Port 8000 in use?**
```bash
# Kill process on port 8000 (Windows)
netstat -ano | find "8000"
taskkill /PID [PID] /F
```

**Module not found errors?**
```bash
npm install
npm run build
npx tsx src/index.ts
```

**Supabase connection failed?**
- Verify `SUPABASE_URL` and `SUPABASE_KEY` in `.env`
- Check credentials at: https://supabase.com/dashboard

## Production Deployment

### Azure App Service
```bash
npm run build
az webapp up --name my-app --resource-group my-rg
```

### Environment Variables (Production)
Set these in your hosting platform:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET_KEY` (strong random key!)
- `NODE_ENV=production`

## Documentation

- [Detailed README](./README-NODEJS.md) - Full documentation
- [Quick Start](./QUICK_START.md) - Quick setup guide
- [API Endpoints](#api-endpoints) - Above in this file
- Supabase Docs: https://supabase.com/docs
- Express Docs: https://expressjs.com
- TypeScript Docs: https://www.typescriptlang.org

---

**You're all set!** Your backend is running and ready for frontend integration.

See [README-NODEJS.md](./backend/README-NODEJS.md) for detailed information.
