# CICTrix Startup Troubleshooting Guide

## Quick Diagnosis

If you see **"This site can't be reached"**, follow these steps in order:

### Step 1: Run Diagnostics (60 seconds)
```powershell
powershell -ExecutionPolicy Bypass -File diagnostic-startup.ps1
```
This will tell you exactly what's wrong.

---

## Common Issues & Fixes

### Issue 1: "Port 5173 In Use" or Port Conflicts
**Symptom**: Frontend doesn't start, or "Address already in use" error

**Fix**:
1. Run the "Pre-launch Cleanup" task in VS Code
2. OR manually kill processes:
   ```powershell
   # Kill port 5173 (Vite)
   FOR /F "tokens=5" %P IN ('netstat -a -n -o ^| findstr :5173') DO @TaskKill.exe /PID %P /F
   
   # Kill port 8000 (Python)
   FOR /F "tokens=5" %P IN ('netstat -a -n -o ^| findstr :8000') DO @TaskKill.exe /PID %P /F
   ```
3. Close VS Code and reopen

---

### Issue 2: Frontend Loads But Says "Cannot Reach Backend"
**Symptom**: Frontend loads but features fail, network errors in console

**Cause**: Python backend not running or Supabase connection failed

**Fix**:
1. Check the "Run Python Backend" terminal:
   - Look for: `"Application startup complete"`
   - If not there, backend crashed
2. Activate venv and run backend manually:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   cd backend
   python -m uvicorn main:app --reload --port 8000
   ```
3. Check for dependency issues:
   ```powershell
   pip install -r requirements.txt
   ```

---

### Issue 3: Frontend Shows Blank Page / "No routes matched"
**Symptom**: React loads but shows error or blank page

**Fix**:
1. Hard refresh browser: `Ctrl+Shift+R`
2. Check browser DevTools → Console for errors
3. Rebuild frontend:
   ```powershell
   npm run build
   npm run dev
   ```

---

### Issue 4: "npm ERR! code ENOENT" on Frontend Start
**Symptom**: `npm run dev` fails with file not found errors

**Fix**:
1. Reinstall dependencies:
   ```powershell
   rm -r node_modules package-lock.json
   npm install
   ```
2. Clear npm cache:
   ```powershell
   npm cache clean --force
   ```

---

### Issue 5: Python Backend Crashes on Startup
**Symptom**: "Run Python Backend" terminal shows errors and exits

**Possible Errors & Fixes**:

#### Error: `TypeError: Client.__init__() got an unexpected keyword argument 'proxy'`
```
pip install httpx==0.27.2
```

#### Error: `ImportError: cannot import name 'HTTPAuthCredentials'`
Use `HTTPAuthorizationCredentials` from `fastapi.security`

#### Error: `.env file not found` or `SUPABASE_URL missing`
1. Verify `.env` file exists in root with:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
2. Copy from `.env.example` if needed

---

### Issue 6: Browser Opens But Page Won't Load (Endless Loading)
**Symptom**: Page spinner keeps spinning, never finishes loading

**Fix**:
1. Check "Run React Frontend" terminal for errors
2. Look for JavaScript bundle errors: `[vite] ... failed`
3. Hard refresh: `Ctrl+Shift+R`
4. If still fails:
   ```powershell
   npm run build
   # Check for build errors
   npm run dev
   ```

---

## Advanced Troubleshooting

### Manual Server Startup (No Auto-Start)
If auto-start fails repeatedly:

1. **Terminal 1 - Backend:**
   ```powershell
   .\.venv\Scripts\Activate.ps1
   cd backend
   python -m uvicorn main:app --reload --port 8000
   ```

2. **Terminal 2 - Frontend:**
   ```powershell
   npm run dev
   # Wait for: "VITE v... ready in ... ms"
   ```

3. **Open Browser Manually:**
   ```
   http://localhost:5173/admin/login
   ```

---

### Check Network Connectivity
```powershell
# Test backend is responding
curl -v http://127.0.0.1:8000/health

# Test frontend is responding
curl -v http://127.0.0.1:5173

# Check ports are listening
netstat -an | findstr :5173
netstat -an | findstr :8000
```

---

### Enable Debug Logging
1. Open `.env` and add:
   ```
   DEBUG=true
   LOG_LEVEL=DEBUG
   ```

2. Check startup logs:
   ```powershell
   # Frontend logs (in "Run React Frontend" terminal)
   # Backend logs (in "Run Python Backend" terminal)
   ```

---

### Reset Everything (Nuclear Option)
If nothing works:

```powershell
# Kill all processes
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Stop-Process -Name python -Force -ErrorAction SilentlyContinue

# Clear caches
rm -r node_modules .venv build dist
npm cache clean --force

# Reinstall
npm install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt

# Restart VS Code
```

---

## Prevention Tips

✓ **Always use "Pre-launch Cleanup" before restarting**  
✓ **Keep browser DevTools open (F12) to catch errors early**  
✓ **Check "Run React Frontend" and "Run Python Backend" terminals regularly**  
✓ **If port conflicts happen, restart VS Code completely**  
✓ **Run diagnostic-startup.ps1 after any restart**  

---

## Getting Help

When reporting issues, provide:
1. **Diagnostic output**: `powershell -ExecutionPolicy Bypass -File diagnostic-startup.ps1`
2. **Terminal logs**: Screenshot of all 3 terminal panels
3. **Browser console**: Press F12, take screenshot of Console tab
4. **Error messages**: Full text, not paraphrased

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Browser (5173)                       │
│              React App + Vite Dev Server                      │
└────────────────┬──────────────────────────────────────────────┘
                 │
                 │ HTTP + Proxy (/api)
                 │
┌────────────────▼──────────────────────────────────────────────┐
│                   Backend (port 8000)                         │
│      Python FastAPI + Uvicorn + Supabase Client              │
└────────────────┬──────────────────────────────────────────────┘
                 │
                 │ HTTP
                 │
┌────────────────▼──────────────────────────────────────────────┐
│              Supabase (Cloud PostgreSQL)                      │
│     (Must have internet connection to work)                  │
└─────────────────────────────────────────────────────────────────┘
```

Each service must start in order for the whole system to work.
