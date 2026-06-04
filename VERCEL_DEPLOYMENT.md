# Vercel Deployment Guide for CICTrix HRIS

## Deployment Architecture

- **Frontend**: React app deployed on Vercel
- **Backend API**: Python FastAPI running as Vercel Serverless Function (`/api/index.py`)
- **Database**: Supabase (cloud)

## Required Environment Variables in Vercel Dashboard

### Step 1: Go to Vercel Project Settings

1. Visit https://vercel.com/dashboard
2. Select your CICTrix project
3. Go to **Settings** → **Environment Variables**

### Step 2: Add These Variables for Production & Preview

Add all of these as **Environment Variables** (apply to both Production and Preview):

#### Frontend Variables (VITE_* prefix)
```
VITE_SUPABASE_URL = https://fyzdfgxaaowjzbjpwrii.supabase.co
VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5emRmZ3hhYW93anpianB3cmlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTU3MDcsImV4cCI6MjA4NTI3MTcwN30.icGGfTLcjZjm_Gowkb0zD-E-axXhZR-uNLW3MXAhfIU
```

#### Backend Variables (for `/api/index.py`)
```
SUPABASE_URL = https://fyzdfgxaaowjzbjpwrii.supabase.co
SUPABASE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5emRmZ3hhYW93anpianB3cmlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTU3MDcsImV4cCI6MjA4NTI3MTcwN30.icGGfTLcjZjm_Gowkb0zD-E-axXhZR-uNLW3MXAhfIU
SUPABASE_SERVICE_ROLE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5emRmZ3hhYW93anpianB3cmlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5NTcwNywiZXhwIjoyMDg1MjcxNzA3fQ.ZK7i_oUHgJj2cEmDy5UDhLp50BaD_4xo6TJlLJ_iX60
```

#### JWT Configuration
```
JWT_SECRET_KEY = cictrix-production-secret-key-change-this-to-random-value-min-32-chars
```

#### Email Configuration (Optional but Recommended)
```
SMTP_HOST = smtp.gmail.com
SMTP_PORT = 587
SMTP_USE_TLS = true
SMTP_USER = your-email@gmail.com
SMTP_PASSWORD = your-app-specific-password
SMTP_FROM = your-email@gmail.com
SMTP_FROM_NAME = CICTrix HRIS
```

### Step 3: Redeploy

1. After setting environment variables, go to **Deployments**
2. Click on the latest failed deployment (or any deployment)
3. Click **Redeploy** (or **Redeploy with existing Build Cache**)
4. Wait for build to complete (~2-3 minutes)

### Step 4: Verify Deployment

1. Visit your Vercel app URL (e.g., https://cictrix-hris.vercel.app)
2. Check browser console for errors (F12 → Console)
3. Test the email feature to verify backend connectivity

## How It Works

### Frontend (/pages and /api calls)
1. React app is built and deployed to Vercel
2. API calls to `/api/*` are rewritten by `vercel.json` to `/api/index.py`
3. `/api/index.py` is a Vercel Serverless Function that imports FastAPI

### Backend (/api/index.py)
1. Python file imports FastAPI app from `backend/main.py`
2. FastAPI loads environment variables from Vercel Dashboard
3. Routes request to appropriate handler (applicants, email, employees, etc.)
4. Returns JSON response to frontend

### Database (Supabase)
1. Both frontend and backend use the same Supabase project
2. Frontend uses `VITE_SUPABASE_*` (public/anon key)
3. Backend uses `SUPABASE_*` (anon + service role key for admin operations)

## Troubleshooting

### "Build failed"
- Check if all required environment variables are set in Vercel Dashboard
- Look at build logs in Vercel Dashboard → Deployments → Details

### "API returns 500"
- Check Vercel Function logs: Settings → Functions → View Logs
- Verify environment variables are correct (copy-paste from this doc)
- Ensure Supabase project is accessible from Vercel

### "Frontend shows blank or 'Cannot find module'"
- Hard refresh browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Check browser Console for specific errors (F12)
- Verify `VITE_SUPABASE_*` variables are set

### "Email feature returns 500"
- Verify `SMTP_*` variables are correctly set
- Check that Gmail app-specific password is correct (NOT your regular password)
- Ensure the Gmail account has 2FA enabled for app passwords to work

## Local Development

For local development, use `npm run dev` and `python -m uvicorn backend/main:app --reload`:
- Frontend runs on `http://localhost:5173`
- Backend runs on `http://localhost:8000`
- Vite proxy automatically routes `/api` calls to backend

## Security Notes

⚠️ **Important for Production**:
1. Change `JWT_SECRET_KEY` to a random 32+ character string
2. Use separate Supabase keys for production (not shared with staging)
3. Set SMTP credentials securely (use Gmail app-specific password, not main password)
4. Never commit `.env` file to GitHub (already in `.gitignore`)
5. Review Vercel Security settings if using private data

## See Also

- [Vercel Environment Variables Docs](https://vercel.com/docs/projects/environment-variables)
- [Supabase API Keys Docs](https://supabase.com/docs/guides/api/api-keys)
- [FastAPI Deployment Docs](https://fastapi.tiangolo.com/deployment/)
