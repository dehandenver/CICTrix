# CICTrix HRIS — System Duplication, HR Demo Setup & Backup/Recovery Guide

This guide provides step-by-step instructions for:
1. **Duplicating the Database & System** to create an isolated **HR Demo Instance**.
2. **Deploying the HR Demo App** publicly on Vercel so HR staff can explore and test all features freely without affecting production data.
3. **Operating the Backup & Recovery System** to safely snapshot and restore data when needed.

---

## 🏗️ Architecture Overview

The CICTrix system consists of three main parts:
- **Frontend & Serverless Backend API**: Deployed on **Vercel** (React SPA + FastAPI Python `/api/index.py`).
- **Database & Storage**: Powered by **Supabase** (PostgreSQL Database + Storage Buckets).
- **Tooling & Automation**: Local Node.js scripts in `scripts/` for backup, restore, schema build, and storage cloning.

```
┌────────────────────────────┐               ┌────────────────────────────┐
│     Production System      │               │       HR Demo System       │
│                            │               │                            │
│    cic-trix.vercel.app     │               │ cictrix-hr-demo.vercel.app │
│             │              │               │             │              │
│             ▼              │               │             ▼              │
│  Supabase Project (Prod)   │               │  Supabase Project (Demo)   │
└────────────────────────────┘               └────────────────────────────┘
              │                                            ▲
              └─────────── [ Automated Clone ] ────────────┘
```

---

## 1️⃣ Step 1: Duplicate the Supabase Database & Storage

To create a dedicated database for the HR Demo:

### A. Create a New Supabase Project
1. Log in to [supabase.com](https://supabase.com).
2. Click **New Project** (e.g. `CICTrix-HR-Demo`).
3. Select your preferred database password and region.
4. Once initialized, navigate to **Project Settings → API** and copy:
   - `Project URL`
   - `anon / public key`
   - `service_role key` (keep this secret!)

---

### B. Apply the Database Schema
You can apply the full database schema to the new project in one step:

1. Generate/verify the consolidated SQL schema file:
   ```bash
   npm run db:build-schema
   ```
   *This merges all 72 migration files into `supabase/full_schema.sql`.*

2. In your new Supabase project dashboard:
   - Go to **SQL Editor**.
   - Open `supabase/full_schema.sql` (or copy-paste its contents).
   - Click **Run**.

---

### C. Clone Production Data into Demo Database

To copy all production tables (applicants, employees, IPCR targets, evaluation data, etc.) into your new demo database:

1. Configure temporary environment variables or update `.env`:
   ```env
   RESTORE_SUPABASE_URL=https://your-demo-project.supabase.co
   RESTORE_SUPABASE_SERVICE_ROLE_KEY=your-demo-service-role-key
   ```
2. Run a full backup of production (or use an existing snapshot in `backups/`):
   ```bash
   npm run db:backup
   ```
3. Restore the production snapshot into the HR Demo database:
   ```bash
   npm run db:restore -- --force
   ```
   *(Or specify a folder: `npm run db:restore -- --from 2026-09-01T15-20-15 --force`)*

---

### D. Copy Storage Files (Attachments & Documents)

To copy applicant attachments and document files to the HR Demo project:

1. Set target variables in `.env`:
   ```env
   TARGET_SUPABASE_URL=https://your-demo-project.supabase.co
   TARGET_SUPABASE_SERVICE_ROLE_KEY=your-demo-service-role-key
   ```
2. Execute the storage clone script:
   ```bash
   npm run storage:clone
   ```

---

## 2️⃣ Step 2: Deploy the Public HR Demo System on Vercel

To give HR access to the duplicated system on a live public URL:

### A. Create a New Vercel Project
1. Log in to [vercel.com](https://vercel.com).
2. Click **Add New... → Project**.
3. Select the `CICTrix` GitHub repository.
4. Set the **Project Name** (e.g. `cictrix-hr-demo`).

### B. Set Environment Variables in Vercel
In the Vercel project configuration screen under **Environment Variables**, add the following variables using your **HR Demo Supabase credentials**:

| Key | Description | Example / Value |
|---|---|---|
| `VITE_SUPABASE_URL` | HR Demo Supabase URL | `https://your-demo-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | HR Demo Public Anon Key | `eyJhbGci...` |
| `SUPABASE_URL` | HR Demo Supabase URL | `https://your-demo-project.supabase.co` |
| `SUPABASE_KEY` | HR Demo Public Anon Key | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | HR Demo Service Role Key | `eyJhbGci...` |
| `JWT_SECRET_KEY` | Secret key for auth tokens | `demo-jwt-secret-key-cictrix-2026` |

### C. Deploy
1. Click **Deploy**.
2. Vercel will build and deploy the app.
3. Access your new HR Demo system at: **https://cictrix-hr-demo.vercel.app**

> The HR Demo is already deployed and live at the URL above. Its landing page is
> the Applicant Portal at `/`. See `ACCESS_LINKS.md` for the full route list.

---

## 3️⃣ Step 3: Backup & Recovery System

The repository includes tools for database backup and recovery.

### A. Create a Backup Snapshot
To take a snapshot of all database tables:
```bash
npm run db:backup
```
- Snapshots are saved to `backups/YYYY-MM-DDTHH-mm-ss/`.
- Each snapshot includes JSON exports for all tables and a `manifest.json` file.

### B. Pre-Demo Snapshot Workflow
Before HR performs testing, bulk operations, or demos:
1. Run `npm run db:backup` to freeze a clean state.
2. Allow HR to test and modify data freely on the HR Demo system.

### C. Restore from a Snapshot (Recovery)
If data needs to be restored to a previous state:
1. List available snapshots in the `backups/` directory.
2. Run the restore command pointing to your target database:
   ```bash
   # Dry-run test (verifies compatibility without changing data)
   npm run db:restore -- --from 2026-09-01T15-20-15 --dry-run

   # Perform actual restore
   npm run db:restore -- --from 2026-09-01T15-20-15 --force
   ```

---

## 🛠️ Summary of NPM Commands

| NPM Command | Description |
|---|---|
| `npm run db:backup` | Dumps all database tables to `backups/<timestamp>/` |
| `npm run db:restore` | Restores snapshot data into Supabase target database |
| `npm run db:build-schema` | Merges all SQL migrations into `supabase/full_schema.sql` |
| `npm run storage:clone` | Copies storage bucket files between Supabase instances |

---

## 🔒 Security Best Practices
- Never commit `.env` files containing `SUPABASE_SERVICE_ROLE_KEY` to GitHub.
- Keep production credentials distinct from HR demo credentials.
- Periodically prune old snapshot folders in `backups/` if repository size grows.
