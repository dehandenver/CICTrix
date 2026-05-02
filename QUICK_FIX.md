# Quick Fix Checklist

## ✅ To Fix Both Errors:

### Step 1: Apply Database Migration & Seed Employee
**Time: 2 minutes**

1. **Open Supabase Dashboard**
   - Go to https://app.supabase.com
   - Select your CICTrix project

2. **Run the SQL Migration Script**
   - Click **SQL Editor** (left sidebar)
   - Click **New Query** (top right)
   - Open file: `backend/APPLY_MIGRATIONS.sql`
   - Copy all content
   - Paste into the Supabase SQL editor
   - Click **Run** button

3. **Verify Success**
   - Look for successful output with no errors
   - You should see:
     - ✅ Migration applied
     - ✅ Employee record created
     - ✅ Storage bucket configured

### Step 2: Restart Your Application
**Time: 30 seconds**

```bash
# Kill any running Python/Node processes:
# Option 1: Use the VS Code Task
# - Press Ctrl+Shift+B
# - Select "Pre-launch Cleanup"

# Option 2: Manual restart
# Kill Python backend
# Kill React frontend
# Then restart via: npm run dev (from root)
```

### Step 3: Clear Caches
**Time: 30 seconds**

- **Browser Cache**
  - Press Ctrl+Shift+Delete
  - Clear browsing data

- **Supabase Cache**
  - Refresh browser page (Ctrl+R or Cmd+R)

---

## 🧪 Test It Works

1. **Open the application** at http://localhost:5173
2. **Navigate to RSP/Reports → NBI Clearance** (or any document section)
3. **Verify no errors appear** in the UI or browser console
4. **Try uploading a document** to confirm employee_documents table works

---

## 📋 What Got Fixed

| Issue | Cause | Fix |
|-------|-------|-----|
| "Could not find table 'public.employee_documents'" | Migration 004 not applied | SQL migration script applied |
| "No employee record found for EMP-2026-002" | Employee doesn't exist | INSERT statement added employee record |

---

## 🚨 If Issues Persist

**Still seeing errors?**

1. **Check Supabase status**
   - Verify migrations ran without errors in SQL Editor
   - Check **Table Editor** → **employees** → search for "EMP-2026-002"

2. **Clear everything**
   - Close browser completely
   - Close VS Code
   - Kill any node/python processes
   - Restart fresh

3. **Check backend logs**
   - Look at terminal output where Python is running
   - Look at browser console (F12 → Console tab)
   - Check for any new error messages

---

## 📁 Files Created/Modified

- ✅ `backend/APPLY_MIGRATIONS.sql` - The SQL script to run
- ✅ `backend/MIGRATION_FIX_GUIDE.md` - Detailed step-by-step guide
- ✅ `backend/run_migrations.py` - Python migration runner (for future use)
