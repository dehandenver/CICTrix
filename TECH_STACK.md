# CICTrix HRIS — Technology Stack

Last verified: 2026-05-11 (against package.json, backend/requirements.txt, backend/Dockerfile, docker-compose.yml, api/index.py).

## Frontend

- **HTML, CSS, TypeScript** 5.2
- **React** 18.2 — UI framework
- **Vite** 5 — build tool, dev server, HMR
- **Tailwind CSS** 3.4 (with PostCSS 8 + Autoprefixer 10)
- **React Router** 7 — client-side routing
- **@supabase/supabase-js** 2.93 — Supabase client (auth, queries, storage)
- **lucide-react** — icon library
- **recharts** — data visualization / charts
- **ESLint** + **@typescript-eslint** — linting

## Backend

- **Python** 3.11
- **FastAPI** — web framework
- **Uvicorn** — ASGI server
- **Pydantic** 2 + **pydantic-settings** — request validation, settings management
- **python-dotenv** — environment variable loading
- **supabase** (Python client) — server-side Supabase access
- **python-jose[cryptography]** — JWT token signing / verification
- **passlib[bcrypt]** — password hashing
- **python-multipart** — multipart/form-data parsing (file uploads)
- **httpx** — async HTTP client

## Database & Storage

- **Supabase** — PostgreSQL database + Storage buckets. Source of truth.
- **LocalStorage** — being phased out. As of commit `bf170bd`, job postings are Supabase-only. Applicants, employees, raters, evaluations, and session state still use localStorage; migration is in progress per the project's "Supabase-only" rule.

## Hosting & Deployment

- **Vercel** — hosts both frontend and backend as a single deployment:
  - Frontend SPA served from the Vite-built `dist/` directory.
  - Backend FastAPI exposed via `api/index.py` as a Python serverless function.
- **GitHub** — source control. Pushing to `main` triggers an auto-deploy on Vercel.

## Dev & Runtime Tooling

- **Node.js** + **npm** — frontend dependency management and scripts
- **TypeScript compiler** (`tsc`) — type checking during build
- **Vite** — dev server (HMR) and production bundler
- **PostCSS** — CSS transformations (used by Tailwind)
- **Docker** + **Docker Compose** — optional local backend dev environment (FastAPI also runs natively via Uvicorn)
- **ESLint** — code style and quality enforcement
- **Git** + **GitHub CLI** (`gh`) — version control and PR workflow

## Scripts (from `package.json`)

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server on port 5173 |
| `npm run build` | Type-check (`tsc`) + production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across the project |
| `npm run docker:start` | Start backend via Docker Compose |
| `npm run docker:stop` | Stop the Docker stack |
| `npm run docker:setup` | One-time backend container setup |

## Local Run

```bash
# Backend (option A: Docker)
docker compose up

# Backend (option B: native)
cd backend && python -m uvicorn main:app --reload --port 8000

# Frontend
npm run dev
```

Then open http://localhost:5173/.
