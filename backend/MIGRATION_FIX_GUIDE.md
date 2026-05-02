# Fix for Supabase Database Issues

## Issue 1: Missing `employee_documents` Table
**Error:** `Could not find the table 'public.employee_documents' in the schema cache`

**Cause:** Migration `004_employee_documents_uploads.sql` has not been applied to your Supabase database.

**Solution:**
1. Go to your Supabase project dashboard: https://app.supabase.com
2. Select your project
3. Navigate to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy the contents of `APPLY_MIGRATIONS.sql` from this folder
6. Paste it into the SQL editor
7. Click **Run** (or press Ctrl+Enter)

This will:
- Create the `employee_documents` table with proper constraints
- Create the `employee-documents` storage bucket
- Set up RLS policies for document access

---

## Issue 2: Missing Employee Record
**Error:** `No employee record found in Supabase for employee_number="EMP-2026-002"`

**Cause:** The employee record with number "EMP-2026-002" and email "rodrigodutae@gmail.com" doesn't exist in your employees table.

**Solution:**
The `APPLY_MIGRATIONS.sql` script (above) includes a command to automatically insert this employee record. Just run the full script and it will be created.

**Manual Alternative:**
If you want to add the employee manually instead:
1. Go to Supabase **SQL Editor**
2. Run this query:
```sql
INSERT INTO employees (
  employee_number,
  email,
  first_name,
  last_name,
  department,
  position,
  date_hired,
  employment_status,
  status,
  user_role,
  account_status,
  created_by
) VALUES (
  'EMP-2026-002',
  'rodrigodutae@gmail.com',
  'Rodrigo',
  'Dutae',
  'Human Resources',
  'HR Specialist',
  '2026-01-15'::date,
  'Active',
  'Active',
  'employee',
  'Active',
  '00000000-0000-0000-0000-000000000000'::uuid
);
```

Or use the **Table Editor**:
1. In Supabase dashboard, go to **Table Editor**
2. Select the **employees** table
3. Click **Insert row** (green + button)
4. Fill in the values:
   - employee_number: `EMP-2026-002`
   - email: `rodrigodutae@gmail.com`
   - first_name: `Rodrigo`
   - last_name: `Dutae`
   - department: `Human Resources`
   - position: `HR Specialist`
   - date_hired: `2026-01-15`
   - employment_status: `Active`
   - status: `Active`
   - user_role: `employee`
   - account_status: `Active`
5. Click **Save**

---

## After Applying Migrations

Once you've run the SQL script:

1. **Refresh Supabase cache** (if needed):
   - Sometimes Supabase caches schema info. If you still see errors, you may need to reload the page or wait a moment.

2. **Restart your development server**:
   ```bash
   # Kill the running backend
   # Then restart it:
   python -m uvicorn main:app --reload
   ```

3. **Clear browser cache** (if needed):
   - The frontend might have cached error states
   - Press Ctrl+Shift+Delete to clear cache, or open developer tools and disable cache

4. **Test the application**:
   - Navigate to the RSP/Reports page
   - Try uploading or accessing employee documents
   - The errors should be resolved

---

## Troubleshooting

**Still getting "schema cache" errors?**
- Supabase sometimes caches schema info for a few seconds
- Try refreshing your browser
- Or restart your backend service

**Employee not showing up?**
- Verify in Supabase **Table Editor** → **employees** → search for "EMP-2026-002"
- If not there, re-run the INSERT statement

**Permission errors?**
- Make sure you're using a Supabase account with admin access to the project
- The SQL script disables RLS on the employee_documents table so frontend clients can access it

---

## Notes

- These migrations are already defined in `backend/database/migrations/`
- In the future, consider setting up an automated migration runner (see `backend/run_migrations.py`)
- For production, you may want to set up more restrictive RLS policies instead of disabling them
