# CICTrix Backend Setup - Node.js Version

## One-Command Setup (Windows)

Open Command Prompt in the backend folder and run:

```bash
npm install && npm run dev
```

That's it! Server starts automatically.

## What You Need

- **Node.js 16+** (LTS)
- Get it here: https://nodejs.org/

## Step-by-Step

1. **Open terminal in `backend` folder**
   ```bash
   cd c:\CICTrix\backend
   ```

2. **Install packages**
   ```bash
   npm install
   ```

3. **Configure .env**
   - Open `backend/.env`
   - Check that SUPABASE_URL and SUPABASE_KEY are filled (they are!)
   - Update SUPABASE_SERVICE_ROLE_KEY (get from Supabase Settings > API)

4. **Start server**
   ```bash
   npm run dev
   ```

5. **Test it**
   - Open browser: http://localhost:8000/health
   - Should see: `{"status":"healthy"}`

## Common Issues

**Node.js not found?**
- Install from https://nodejs.org/
- Restart terminal after installing

**npm command not found?**
- It comes with Node.js
- Verify: `node --version`
- Reinstall Node.js if needed

**Port 8000 in use?**
- Change in `.env`: `PORT=8001`
- Restart server

## Next: Update Frontend

Your React app needs to call the backend API instead of Supabase directly.

In your React components, change:
```typescript
// ❌ Before (direct Supabase)
const { data } = await supabase.from('applicants').select('*')

// ✅ After (via backend API)
const response = await fetch('/api/applicants', {
  headers: { 'Authorization': `Bearer ${token}` }
})
const data = await response.json()
```

## Database Setup

Run this SQL in Supabase:
```sql
-- Copy contents of: supabase/schema_with_backend.sql
-- And paste into Supabase SQL Editor
```

## That's All!

Your backend is ready. Now:
1. ✅ Backend running on http://localhost:8000
2. 🔄 Update React frontend
3. 🔄 Run database migrations
4. 🔄 Get Service Role Key from Supabase

See [README-NODEJS.md](./README-NODEJS.md) for detailed docs.
