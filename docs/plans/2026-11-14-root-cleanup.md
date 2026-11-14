---
title: Clean up stray files in the repo root
date: 2026-11-14
status: Done
summary: Delete or move about 50 tracked root files that nothing references (empty accidental files, one-off debug scripts, dumps, stale troubleshooting docs) and stop tracking scratch/. No application code changes.
---

## Goal

The repo root holds only the project's entry points: config files, `index.html`, `package.json`, `requirements.txt`, the agent and design docs (`README.md`, `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`, `DESIGN_IDENTITY.md`), and the root SQL files that `scripts/*.mjs` read. One-off debug scripts, dumps and accidental files are gone from the tree, and `scratch/` is no longer tracked. The app, the build, CI, Vercel and the npm scripts behave exactly as before.

Out of scope: the leaked service-role key in `VERCEL_DEPLOYMENT.md` and `scratch/` (finding F1 in `docs/plans/2026-10-16-security-remediation.md`). Untracking `scratch/` does not remove the key from git history, and rotation must happen first. The code-structure items (large files, pages in `src/components`, direct Supabase imports) are also out of scope.

## Approach

Every file below was checked on 2026-11-14: its size and last commit, and a `git grep` for its name across all tracked files (excluding itself, `node_modules`, `dist` and the generated `docs/plans/index.html`). None is referenced by `package.json` scripts, `vercel.json`, `.github/workflows/`, `src/`, `scripts/`, `backend/` or `api/`. A reference search cannot show whether someone runs a script by hand, so the user signs off on the delete list (step 1) before anything is removed. Deleted files stay recoverable from git history.

**Delete (nothing references them).**

- The 11 empty files created by shell redirects in pasted JSX: `{`, `{'))`, `n.email`, `a.name.localeCompare(b.name))`, `a.status.toLowerCase()`, `console.log(data))`, `l.includes('Selected`, `handlePortalAccess('admin')}`, `handlePortalAccess('employee')}`, `setBulkSelectedDepartment(e.target.value)}`, `setShowLoginDropdown(!showLoginDropdown)}`.
- One-off scripts from May to July 2026: `check.js`, `check2.js`, `check3.js`, `check4.js`, `check_anon.js`, `check_anon_all.js`, `check_jobs2.js`, `check_jobs3.js`, `check_jobs4.js`, `check_jobs_db.js`, `check_rls.js`, `cleanup_duplicates.js`, `fix.js`, `fix2.js`, `fix3.js`, `fixLNDui.js`, `fixRequest.js`, `fixRequestPM.js`, `fixSearch.js`, `fix_newly_hired.js`, `restore.js`, `restore2.js`, `restore3.js`, `restore4.js`, `lineCheck.js`, `lineCheck2.js`, `inspectModal.js`, `apply_jean_pierre.js`, `get_swagger.js`.
- Dumps and debug output: `accounts.txt` (a JSX fragment, no credentials), `pmdashboard_temp.txt`, `temp_empdir.txt`, `directoryEmployeesSource.txt`, `build_output.txt`, `debug_test.txt`.
- `purge-applicants-keep-oct21.sql`, a dated one-off purge.

**Move the April–May troubleshooting docs to `docs/archive/`.** `QUICK_FIX.md`, `FIX_DEPLOYED.md`, `STARTUP_TROUBLESHOOTING.md`, `AUTO_START_SETUP.md`, `EVALUATION_SCORES_DEBUG_PROMPT.md`, `APPLICANT_DATA_FLOW_ANALYSIS.md` and `QUALIFIED_APPLICANTS_ANALYSIS.md` move together with the PowerShell helpers they describe (`start_dev.ps1`, `health_check.ps1`, `diagnostic-startup.ps1`, `auto-open-browser.ps1`, `wait-for-ready.ps1`), which go to `scripts/windows/`. The docs link to each other and to those scripts, so they move as a group and their paths are updated in the same commit. Archiving was chosen over deleting because these docs record past deploy fixes and nothing in the tree replaces them.

**Leave in the root.**

- `requirements.txt`: used by the competency-assessment-queue workflow, `scripts/start-dev.bat` and the Vercel Python function.
- `seed-idp-submissions.sql`, `seed-ipcr-competencies.sql`, `seed-lnd-dashboard-data.sql`, `seed-training-attendance.sql` and `configure-competency-framework.sql`: `scripts/*.mjs` build or read them with `resolve(ROOT, '<name>.sql')`. Moving them needs those paths changed, and that is a separate change.
- `ACCESS_LINKS.md`, `SYSTEM_DUPLICATION_GUIDE.md`, `TECH_STACK.md`, `VERCEL_DEPLOYMENT.md`: still current or linked from active plans. `VERCEL_DEPLOYMENT.md` is handled by the security plan.

**Stop tracking `scratch/`.** It is already in `.gitignore` (line 61), but 40 files were committed before the rule existed. `git rm -r --cached scratch` removes them from the index and leaves them on disk. `scripts/import-gso-employees/generate.py` keeps writing there.

## Steps

1. User reviews the delete list above and removes anything they still run.
2. Commit this plan on `refactor/shared-combobox`, or carry it over, then branch `chore/root-cleanup` off `main`. The shared-combobox branch has uncommitted work, so the cleanup does not happen on it.
3. Delete the empty files, one-off scripts, dumps and the purge SQL with `git rm`. Commit: `chore: remove stray debug scripts and empty files from repo root`.
4. `git mv` the troubleshooting docs to `docs/archive/` and the `.ps1` helpers to `scripts/windows/`, and update the paths inside them. Commit: `chore: archive old troubleshooting docs and move PowerShell helpers`.
5. `git rm -r --cached scratch`. Commit: `chore: stop tracking scratch/`.
   *Superseded:* upstream `main` already untracked `scratch/` and scrubbed `VERCEL_DEPLOYMENT.md` (`docs/plans/2026-11-05-remove-leaked-key-files.md`). After rebasing onto it, this commit was empty and was dropped.
6. Run the checks below, write the session summary, regenerate the plans dashboard.

## Risks

- **A deleted script is still run by hand.** Step 1 covers it. If one is missed, `git show <commit>^:<file>` restores it.
- **Untracking `scratch/` looks like a key fix but isn't.** The service-role key stays in history and in other clones until F1 is done. The summary must say so.
- **Moved `.ps1` scripts resolve paths relative to their own folder.** Before moving them, check each for `$PSScriptRoot` or relative paths and adjust them, or leave the script in the root.
- **Teammates' local copies.** Deleted tracked files disappear from their checkouts on pull. This includes `scratch/`: `git rm --cached` keeps the files only in the checkout where it ran, and pulling the commit deletes them everywhere else. Copy `scratch/` aside before pulling if anything in it is still wanted.

## Checks to run

- `git grep` again for each deleted or moved name: no hits outside `docs/archive/`, `docs/plans/` and `docs/session-summaries/`.
- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run check:migrations`
- `node scripts/seed-lnd-dashboard-data.mjs --help`, or a dry read, to confirm the root SQL paths still resolve.
- `git status` after step 5 shows `scratch/` as ignored, with its files still on disk.
