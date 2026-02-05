# CICTrix Node.js/Express Backend

A fast, secure Express.js backend for the CICTrix HRIS system with role-based access control (RBAC).

## Quick Start

### 1. Install Node.js
If you don't have Node.js installed:
- Download from: https://nodejs.org/
- Install the LTS version
- Verify: Open terminal and run `node --version`

### 2. Install Dependencies
```bash
cd backend
npm install
```

### 3. Configure Environment
```bash
# Copy the example file
copy .env.example .env

# Edit .env and add your Supabase credentials:
# - SUPABASE_URL: https://your-project.supabase.co
# - SUPABASE_KEY: your anon key (already populated)
# - SUPABASE_SERVICE_ROLE_KEY: get from Supabase > Settings > API
```

### 4. Start the Server
```bash
# Development (with hot-reload)
npm run dev

# Production
npm run build
npm start
```

Server runs at: **http://localhost:8000**

## Development

### Available Commands
```bash
npm run dev     # Start development server with auto-reload
npm run build   # Compile TypeScript to JavaScript
npm start       # Run compiled server
npm run lint    # Check code quality
```

### File Structure
```
backend/
├── src/
│   ├── index.ts           # Main application
│   ├── config.ts          # Environment configuration
│   ├── routes/            # API endpoints
│   │   ├── auth.ts        # Authentication routes
│   │   ├── applicants.ts  # Applicant management
│   │   └── evaluations.ts # Evaluation endpoints
│   ├── middleware/        # Express middleware
│   │   └── auth.ts        # JWT & role validation
│   ├── utils/             # Utility functions
│   │   ├── supabase.ts    # Supabase client
│   │   └── jwt.ts         # JWT token handling
│   └── types/             # TypeScript types
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
└── .env                   # Environment variables
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login (placeholder, needs Supabase Auth)
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user (requires JWT token)

### Applicants
- `GET /api/applicants` - List applicants (role-based filtering)
- `GET /api/applicants/:id` - Get applicant details
- `PUT /api/applicants/:id` - Update applicant (Admin only)

### Evaluations
- `GET /api/evaluations` - List evaluations
- `POST /api/evaluations` - Create evaluation (Rater/Interviewer only)

## Role-Based Access Control

**Roles:**
- `ADMIN` - Full access
- `PM` - Project Manager, manage applicants
- `RSP` - Resource Planning, view evaluations
- `LND` - Learning & Development, view applicants
- `RATER` - Create evaluations for assigned applicants
- `INTERVIEWER` - View and evaluate assigned applicants
- `APPLICANT` - View own profile only

**Implementation:**
- `requireRole('ADMIN', 'PM')` - Require specific roles
- `authMiddleware` - Validate JWT token
- Automatic filtering based on user role

## Database Setup

Before using the backend, create tables in Supabase:

1. Open Supabase SQL Editor
2. Run: [supabase/schema_with_backend.sql](../supabase/schema_with_backend.sql)

Creates:
- `user_roles` - User accounts and roles
- `evaluations` - Evaluation records
- `assignments` - Applicant-Rater assignments
- RLS policies for security

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://xyz.supabase.co` |
| `SUPABASE_KEY` | Anon key for client operations | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin ops | `eyJ...` |
| `JWT_SECRET_KEY` | Secret for JWT tokens | `your-secret-key` |
| `JWT_EXPIRATION_HOURS` | Token expiration time | `24` |
| `PORT` | Server port | `8000` |
| `NODE_ENV` | Environment | `development` or `production` |

## Frontend Integration

Update your React app to use the backend API:

```typescript
// src/api/client.ts
const API_BASE = 'http://localhost:8000/api'

export async function fetchApplicants(token: string) {
  const response = await fetch(`${API_BASE}/applicants`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  return response.json()
}
```

Usage in components:
```typescript
useEffect(() => {
  const token = localStorage.getItem('auth_token')
  fetchApplicants(token).then(setApplicants)
}, [])
```

## Troubleshooting

### "Port 8000 already in use"
Change PORT in `.env`:
```
PORT=8001
```

### "Cannot find module"
Reinstall dependencies:
```bash
rm -r node_modules package-lock.json
npm install
```

### "Supabase connection error"
- Check SUPABASE_URL and SUPABASE_KEY in `.env`
- Verify credentials from: https://supabase.com/dashboard

### "JWT validation failed"
- Update JWT_SECRET_KEY in `.env`
- Restart server
- Regenerate tokens

## Production Deployment

### Azure App Service
```bash
# Build
npm run build

# Package
npm install --production

# Deploy to Azure
az webapp up --name my-app --resource-group my-rg
```

### Environment Variables on Azure
Set in App Service Configuration:
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET_KEY` (use strong random key!)
- `NODE_ENV=production`

## Performance Tips

1. **Use indexes** in Supabase for frequently queried columns
2. **Implement caching** for read-heavy operations
3. **Use connection pooling** for database connections
4. **Monitor logs** for slow queries

## Security Checklist

- ✅ JWT tokens with expiration
- ✅ Role-based access control on all endpoints
- ✅ Environment variables for secrets
- ✅ CORS configured for frontend domain
- ⏳ Implement rate limiting (production)
- ⏳ Add request validation (production)
- ⏳ Enable HTTPS (production)
- ⏳ Use strong JWT_SECRET_KEY (production)

## Next Steps

1. ✅ Install Node.js
2. ✅ Install dependencies: `npm install`
3. 🔄 Get Service Role Key from Supabase
4. 🔄 Run database migrations
5. 🔄 Implement Supabase Auth
6. 🔄 Update React frontend
7. 🔄 Deploy to production

## Support

For issues, check:
1. [Troubleshooting Guide](#troubleshooting)
2. Logs: `npm run dev` shows all errors
3. [Backend README](./README.md)
4. Supabase documentation: https://supabase.com/docs
