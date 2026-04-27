# CICTrix Auto-Start System - Setup Guide

## ✅ What's Been Done

Your VS Code workspace now has:
1. **Enhanced start_dev.ps1** - Port cleanup + validation + dependency checks
2. **New health_check.ps1** - Verifies both servers are running with green "SYSTEM READY" output
3. **Updated .vscode/tasks.json** - Includes "runOn": "folderOpen" for automatic startup

## 🔧 ONE-TIME Setup Required

### Step 1: Enable PowerShell Execution Policy

Run this command in PowerShell **as Administrator**:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```

**What this does:**
- Allows your scripts to run without security prompts
- Only applies to your user account (safe & isolated)
- RemoteSigned = runs local scripts without signature requirement

**Verify it worked:**
```powershell
Get-ExecutionPolicy
# Should output: RemoteSigned
```

### Step 2: Reload VS Code

After setting the execution policy:
1. Close VS Code completely
2. Reopen your CICTrix workspace
3. The "Start All" task will trigger automatically

## 📊 What Happens Next Time You Open VS Code

### Auto-Start Flow (takes ~20 seconds):
```
1. Pre-launch Cleanup
   ├─ Kill any existing processes on ports 8000, 5173, 3000
   ├─ Validate .env file has Supabase credentials
   ├─ Check node_modules exists
   └─ Check Python venv exists

2. Run Python Backend (Port 8000)
   ├─ Activate Python virtual environment
   └─ Start uvicorn server

3. Run React Frontend (Port 5173)
   └─ Start npm dev server

4. Health Check
   ├─ Ping http://127.0.0.1:8000/health (retries 15x)
   ├─ Ping http://localhost:5173 (retries 15x)
   └─ Print green "✓ SYSTEM READY" message
```

### Success Output
You'll see in your terminal:
```
========================================
✓ SYSTEM READY
========================================

🎉 Your HRIS system is running:
   Frontend:  http://localhost:5173
   Backend:   http://127.0.0.1:8000
   Health:    http://127.0.0.1:8000/health
```

### If Something Goes Wrong
The health check will tell you which component failed:
- **Backend fail**: Check "2. Run Python Backend" terminal
- **Frontend fail**: Check "3. Run React Frontend" terminal
- **Port conflict**: Another app is using port 8000 or 5173

## 🚀 Manual Override

If auto-start ever fails, you can manually run:

**In VS Code Command Palette (Ctrl+Shift+P):**
```
Tasks: Run Task → Start All
```

Or run each task individually:
```
Tasks: Run Task → 2. Run Python Backend
Tasks: Run Task → 3. Run React Frontend
Tasks: Run Task → 4. Health Check
```

## 📝 File Locations

- **Startup script**: `./start_dev.ps1`
- **Health check**: `./health_check.ps1`
- **Task config**: `./.vscode/tasks.json`

## ✨ Zero-Touch Benefits

✓ No manual server startup needed
✓ Automatic port cleanup (no "Address already in use" errors)
✓ Automatic dependency validation
✓ Visual confirmation when system is ready
✓ Works every time you open the workspace

---

**You're all set!** Close and reopen VS Code to see the magic happen. 🎉
