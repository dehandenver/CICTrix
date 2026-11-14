# Root cleanup

Plan: `docs/plans/2026-11-14-root-cleanup.md`. Branch `chore/root-cleanup`, rebased onto `dehandenver/CICTrix` `main`.

## Shipped

- Deleted 47 unreferenced root files: 11 empty files created by shell redirects, 29 one-off `check`/`fix`/`restore`/`lineCheck` scripts, 6 dump files, and `purge-applicants-keep-oct21.sql`.
- Moved 7 April–May troubleshooting docs to `docs/archive/` and the 5 PowerShell helpers they describe to `scripts/windows/`. The run commands in `AUTO_START_SETUP.md`, `FIX_DEPLOYED.md` and `STARTUP_TROUBLESHOOTING.md` now use the new script paths. No other content changed.
- No files changed under `src/`, `supabase/`, `backend/` or `api/`, and none in `package.json` or the Vite, Vercel or TypeScript config. Against upstream `main`, the diff is only deletions, renames, the plan, this summary and the regenerated `docs/plans/index.html`.

## Deviations from the plan

- **Step 5 (untrack `scratch/`) was dropped.** The branch began from a local `main` that was 151 commits behind upstream. Upstream had already untracked `scratch/` and scrubbed the keys from `VERCEL_DEPLOYMENT.md` (`docs/plans/2026-11-05-remove-leaked-key-files.md`). After the rebase, this branch's `scratch/` commit was empty and was dropped. So this branch does not delete `scratch/` from anyone's checkout. Key rotation is still required (security remediation plan, Phase 1).
- **The PowerShell helpers depend on the current directory.** They read `.env`, `backend\venv` and `node_modules` relative to the current directory, not their own folder. Run them from the repo root as `scripts\windows\<name>.ps1`.

## Checks

- Ran on the branch before the rebase: `npx tsc --noEmit` and `npm run lint` passed, and `npm run check:migrations` passed (128 files).
- `npm test` before the rebase: 1189 of 1190 passed. The one failure, `scripts/seed-training-attendance.test.mjs`, fails with ENOENT because it reads `.env`, which is gitignored and absent from a fresh worktree.
- `npm run build` locally: failed with esbuild `remove …\Temp\esbuild-…: Access is denied`. A clean copy of the old `main` failed the same way, so the cause is the local environment. The Vercel build on the PR is the build check.
- After the rebase: re-ran `git grep` for every deleted or moved filename on the new tree, excluding the archive, the moved scripts and this plan. No references. Upstream's leaked-key plan mentions the root scripts only in prose, as `.env` readers with no hardcoded keys.
- An independent review of the pre-rebase branch found no critical or important issues.
