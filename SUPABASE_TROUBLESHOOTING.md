# Supabase Database Setup & Troubleshooting Guide

## Quick Fix (Do This First!)

1. **Go to your Supabase Dashboard**: https://supabase.com/dashboard
2. **Open SQL Editor** (left sidebar)
3. **Run `FIX_CONTACT_NUMBER.sql`** - This adds all missing columns
4. **Refresh your browser** to clear the schema cache
5. **Test the application**

---

## Common Issues & Solutions

### Issue: "Could not find the 'X' column in schema cache"

**Cause**: The `applicants` table is missing required columns.

**Solution**: Run `FIX_CONTACT_NUMBER.sql` in Supabase SQL Editor. This script adds ALL required columns:
- `name` (VARCHAR 255)
- `address` (TEXT)
- `contact_number` (VARCHAR 50)
- `email` (VARCHAR 255)
- `position` (VARCHAR 255)
- `item_number` (VARCHAR 100)
- `office` (VARCHAR 255)
- `is_pwd` (BOOLEAN)
- `status` (VARCHAR 50)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**After running the script**: 
- Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
- This clears Supabase's cached schema

---

### Issue: "Policy already exists" error

**Cause**: Running the setup script multiple times creates duplicate policies.

**Solution**: The `COMPLETE_SUPABASE_SETUP.sql` now includes DROP statements. Just re-run it.

---

### Issue: File upload fails

**Possible causes**:
1. Storage bucket doesn't exist
2. Storage policies are wrong
3. File size exceeds limits

**Solution**: 
1. Run `COMPLETE_SUPABASE_SETUP.sql` - creates bucket and policies
2. Check Storage > Buckets in Supabase dashboard
3. Verify `applicant-attachments` bucket exists
4. Check Storage > Policies to ensure upload/read policies exist

---

### Issue: Data not showing in dashboard

**Possible causes**:
1. RLS (Row Level Security) blocking reads
2. Wrong policies
3. Not authenticated

**Solution**:
1. Verify policies allow public read: Run `COMPLETE_SUPABASE_SETUP.sql`
2. Check if data exists: Run in SQL Editor:
   ```sql
   SELECT * FROM applicants ORDER BY created_at DESC LIMIT 10;
   ```
3. If no data, submit a test application

---

## Required Database Tables

### 1. `applicants` table
```sql
- id (BIGSERIAL PRIMARY KEY)
- name (VARCHAR 255)
- address (TEXT)
- contact_number (VARCHAR 50)
- email (VARCHAR 255)
- position (VARCHAR 255)
- item_number (VARCHAR 100)
- office (VARCHAR 255)
- is_pwd (BOOLEAN)
- status (VARCHAR 50) - 'Pending', 'Reviewed', 'Accepted', 'Rejected'
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### 2. `applicant_attachments` table
```sql
- id (BIGSERIAL PRIMARY KEY)
- applicant_id (BIGINT, FK to applicants)
- file_name (VARCHAR 255)
- file_path (TEXT)
- file_type (VARCHAR 100)
- file_size (INTEGER)
- created_at (TIMESTAMP)
```

### 3. `evaluations` table
```sql
- id (BIGSERIAL PRIMARY KEY)
- applicant_id (BIGINT, FK to applicants)
- interviewer_name (VARCHAR 255)
- technical_score (INTEGER 1-5)
- communication_score (INTEGER 1-5)
- overall_score (INTEGER 1-5)
- comments (TEXT)
- recommendation (VARCHAR 50)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### 4. `jobs` table
```sql
- id (BIGSERIAL PRIMARY KEY)
- title (VARCHAR 255)
- item_number (VARCHAR 100)
- salary_grade (VARCHAR 50)
- department (VARCHAR 255)
- description (TEXT)
- status (VARCHAR 50) - 'Open', 'Closed', 'On Hold'
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### 5. `raters` table
```sql
- id (BIGSERIAL PRIMARY KEY)
- name (VARCHAR 255)
- email (VARCHAR 255 UNIQUE)
- department (VARCHAR 255)
- is_active (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### 6. `user_roles` table
```sql
- id (UUID, FK to auth.users)
- role (TEXT) - 'super-admin', 'rsp', 'lnd', 'pm'
- created_at (TIMESTAMP)
```

---

## Storage Bucket

**Name**: `applicant-attachments`  
**Public**: No (requires authentication)

**Required Policies**:
- Allow public upload attachments
- Allow public read attachments

---

## Row Level Security (RLS) Policies

All tables have RLS enabled with public access for this application.

### Applicants Policies:
- Allow public INSERT
- Allow public SELECT
- Allow public UPDATE

### Similar policies for:
- applicant_attachments
- evaluations
- jobs
- raters

---

## Verification Checklist

Run these queries in Supabase SQL Editor to verify setup:

```sql
-- 1. Check if all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 2. Verify applicants table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'applicants' 
ORDER BY ordinal_position;

-- 3. Check storage bucket
SELECT * FROM storage.buckets WHERE id = 'applicant-attachments';

-- 4. View RLS policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('applicants', 'applicant_attachments', 'evaluations')
ORDER BY tablename, policyname;

-- 5. Count existing applicants
SELECT COUNT(*) as total_applicants FROM applicants;
```

---

## Environment Variables

Ensure your `.env` file has correct Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**Get these from**: Supabase Dashboard > Settings > API

---

## Complete Reset (Nuclear Option)

If everything is broken, start fresh:

```sql
-- WARNING: This deletes ALL data!

-- Drop all tables
DROP TABLE IF EXISTS evaluations CASCADE;
DROP TABLE IF EXISTS applicant_attachments CASCADE;
DROP TABLE IF EXISTS applicants CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS raters CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;

-- Delete storage bucket
DELETE FROM storage.buckets WHERE id = 'applicant-attachments';
```

Then run `COMPLETE_SUPABASE_SETUP.sql` to recreate everything.

---

## Need More Help?

1. Check Supabase logs: Dashboard > Logs
2. Check browser console for JavaScript errors (F12)
3. Check Network tab for failed API requests
4. Verify your Supabase project is not paused (free tier projects pause after inactivity)
