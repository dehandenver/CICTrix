# Root cleanup

Plan: `docs/plans/2026-11-14-root-cleanup.md`. Branch `chore/root-cleanup`, off `main` at `cb63526`. Not pushed.

## Shipped

- Deleted 47 unreferenced root files: 11 empty files created by shell redirects, 29 one-off `check`/`fix`/`restore`/`lineCheck` scripts, 6 dump files, and `purge-applicants-keep-oct21.sql`.
- Moved 7 April–May troubleshooting docs to `docs/archive/`, and the 5 PowerShell helpers they describe to `scripts/windows/`. The run commands in `AUTO_START_SETUP.md`, `FIX_DEPLOYED.md` and `STARTUP_TROUBLESHOOTING.md` now use the new script paths. No other content changed.
- Untracked the 40 files under `scratch/`. The folder was already in `.gitignore`.
- No files changed under `src/`, `supabase/`, `backend/` or `api/`, and none in `package.json` or the Vite, Vercel or TypeScript config. `git diff --name-status -M main` shows only deletions, renames, the plan and this summary.

## Deviations from the plan

- **`scratch/` files will be deleted on pull.** The plan said they would stay on teammates' disks. That only holds in the checkout where `git rm --cached` ran. Pulling or merging this branch deletes those 40 files from every other working copy, including the main checkout. If any of them are still wanted, copy `scratch/` aside before pulling. The leaked service-role key in some of those files stays in git history either way. Plan F1 in `docs/plans/2026-10-16-security-remediation.md` still needs the key rotated.
- **The PowerShell helpers depend on the current directory.** They read `.env`, `backend\venv` and `node_modules` relative to the current directory, not their own folder. Run them from the repo root as `scripts\windows\<name>.ps1`.

## Checks

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run check:migrations`: passed (128 files).
- `npm test`: 1189 of 1190 passed. The one failure, `scripts/seed-training-attendance.test.mjs`, fails with ENOENT because it reads `.env`, which is gitignored and absent from a fresh worktree. It does not touch any file this branch changed.
- `npm run build`: failed with esbuild `remove …\Temp\esbuild-…: Access is denied`. A clean worktree of untouched `main` failed the same way, so the cause is the local environment (likely a file lock on temp files), not this change. The Vercel build on the PR is the build check.
- Re-ran `git grep` for the deleted and moved names outside `docs/archive`, `docs/plans`, `docs/session-summaries` and `scripts/windows`: no hits.
