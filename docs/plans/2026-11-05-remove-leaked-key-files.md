---
title: Remove leaked Supabase keys from tracked files
date: 2026-11-05
status: In Progress
summary: Untrack scratch/ and .claude/settings.local.json and scrub VERCEL_DEPLOYMENT.md so no tracked file holds a Supabase JWT. Does not stop the key working; rotation is Phase 1.2 of the security remediation plan.
---

## Goal

The live `service_role` key sits in 25 tracked files in public GitHub repos, and the same key is still in use today. This plan removes it from the current tree after confirming nothing depends on those files. It does not stop the key working: only rotation does that (`docs/plans/2026-10-16-security-remediation.md`, Phase 1.2). The history rewrite stays in that plan's Phase 2.

After the PR merges, no tracked file contains a Supabase JWT, and the app, build and CI behave exactly as before.

## Approach

Untrack rather than delete, so the scripts stay on disk and in history. Scrub only the secret values from the one doc worth keeping.

### Dependency check (read-only, done 2026-11-05, repeated on upstream main d0fdf8c)

Nothing in the app depends on the finding 1 files.

| Possible link | Result |
|---|---|
| Each of the 40 `scratch/` filenames searched across the repo | 0 references outside `scratch/` (other than permission entries in `.claude/settings.local.json`) |
| Imports into `scratch/` from app code | None. `tsconfig.json` includes only `src`; ESLint covers `src` and `vite.config.ts` |
| Imports from `scratch/` into the app | None that work. `scratch/test_create_doc.ts` has a broken relative import |
| Dynamic loading (`import.meta.glob`, `require.context`, file reads) in `src` and `vite.config.ts` | None. The only path fetches are three `/api/...` calls, which go to the backend |
| Served to the web | Not in `public/`. `vercel.json` sends `/api/*` to `api/index.py` and everything else to `index.html` |
| npm scripts, both GitHub workflows, `.claude/launch.json` | No references |
| `scripts/import-gso-employees/generate.py` | Writes to `scratch/import-gso-employees/` and creates the folder itself (`mkdir(parents=True, exist_ok=True)`) |
| `VERCEL_DEPLOYMENT.md` | Referenced only by the security plan and a comment in `scratch/test_service_role.js` |
| `.claude/settings.local.json` | Read only by Claude Code. Not referenced by the app |

What the `scratch/` files are: 40 one-off scripts, last committed between May and July 2026. Most are read-only diagnostics. A handful (such as `restore_and_reallocate.js`, `cleanup_duplicates.js`, `update_employees.js` and `update_db_offices.js`) changed live data once. They aren't part of the running system, but this plan keeps them on disk and in history rather than destroying them. The folder itself stays too: it also holds about 3,700 ignored local files, including build temp files and a browser test harness noted in session summaries.

Not checkable from here: Vercel dashboard settings, and whether a person still runs one of these scripts by hand.

### Other connections that use these keys

These matter for rotation, not for this file removal.

| Connection | Key used | Reads it from | Rotation action |
|---|---|---|---|
| Frontend (`src/lib/supabase.ts`) | anon | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` at build time | Update Vercel, rebuild |
| Backend on Vercel (`api/index.py`, `backend/app/core/supabase_client.py`) | anon + service role | Vercel env: `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Update Vercel. **Blocked:** `supabase==2.4.2` rejects `sb_secret_` keys, so upgrade it first (Phase 1.2 step 0) |
| GitHub Action, every 30 minutes (`competency-assessment-queue.yml`) | anon + service role | Fork repo secrets `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (both exist). Upstream's secrets are unchecked | Update secrets in each repo that runs it |
| Local queue listener (`run-queue.bat`, `backend/run_competency_queue.py`) | service role | `backend/.env` | Update `backend/.env` |
| About 17 tracked `scripts/*.mjs` | service role | Env or `.env` / `.env.seed` | Update `.env` files |
| Root one-off scripts (`check*.js`, `restore*.js`, `get_swagger.js`, others) | anon or service role | `.env` / `backend/.env`; no hardcoded keys | Update `.env` files |
| Local env files, and each collaborator's copies | both | `.env`, `.env.local`, `backend/.env` | Each person updates theirs |
| Supabase Edge Functions | none | 0 deployed | Nothing |

Gemini and SMTP credentials are separate and backend-only, so this rotation doesn't touch them. The Vercel env var list couldn't be read from here.

## Steps

1. Create a branch from up-to-date `main`, named `fix/untrack-leaked-key-files`. The current branch is an unrelated docs branch.
2. Save this plan as `docs/plans/2026-11-05-remove-leaked-key-files.md` from `docs/plans/_template.md`, then regenerate the dashboard.
3. Untrack `scratch/` with `git rm -r --cached scratch`. All 40 files come out of Git and stay on disk. The folder is already in `.gitignore`, and it should not have been tracked.
4. Add `.claude/settings.local.json` to `.gitignore`, then untrack it with `git rm --cached`.
5. Edit `VERCEL_DEPLOYMENT.md`: replace the 3 key values (lines 24, 30, 31) and the sample `JWT_SECRET_KEY` value (line 36) with placeholders, and keep the deployment steps. If that sample value was ever pasted into Vercel, the production JWT secret is public and must be replaced (F25).
6. Remove the embedded keys from the 28 entries in the local `.claude/settings.local.json`. This is a local-only edit, because the file is no longer tracked.
7. Run the checks below. Commit as `fix(security): remove leaked Supabase keys from tracked files`.
8. Write the session summary and regenerate the dashboard. Ask before pushing. Push to `origin` only and open the PR to `dehandenver/CICTrix` with an explicit `--repo`. Never push to `Trsha11102004/CICTrix`.

## Risks

- **Collaborators lose local copies:** when others pull this commit, Git deletes their tracked `scratch/` files and `.claude/settings.local.json`. Tell them to back up anything they need first.
- **False sense of safety:** the key stays in Git history, forks and clones, and it works until rotated. Don't treat this PR as the fix.
- **Scripts stay on disk with the key:** the local `scratch/` files still contain it. They're harmless once the key is rotated, and they can then be deleted if unwanted.

## Out of scope

- Rotating keys and the backend `supabase` upgrade (Phase 1.2).
- Rewriting Git history (Phase 2).
- The document private key in `src/lib/crypto/_internal/keys.ts` and `supabase/migrations/20261026102622_document_encryption_keys.sql` (F11). It needs a separate re-wrap plan.
- RLS, plaintext passwords and backend auth (Phases 1 to 4).
- Merging `docs/security-remediation-phase1`. That branch holds the corrected November 2 plan, and it isn't in the current branch.

## Checks to run

- Scan all tracked files for Supabase JWTs: expect 0, decoding claims only and printing no values.
- Repeat the filename reference search: expect 0 references outside ignored files.
- Run `git ls-files scratch .claude/settings.local.json`: expect empty output.
- Confirm files remain on disk: `scratch/` and `.claude/settings.local.json`.
- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Confirm the Vercel preview build passes on the PR. There's no browser check, because no app code changes.
