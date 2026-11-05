---
title: Remove leaked Supabase keys from tracked files
date: 2026-11-05
status: Done
summary: Merged in PR 98 and deployed to production. No tracked file holds a Supabase JWT any more. The key is not revoked and stays in Git history until rotated.
---

# Remove leaked Supabase keys from tracked files

## What shipped vs. planned

Followed [the plan](../plans/2026-11-05-remove-leaked-key-files.md) on `fix/untrack-leaked-key-files`, branched from upstream `main` at `d0fdf8c`.

- Untracked all 40 `scratch/` files. They stay on disk: 3,774 files in the folder before and after.
- Untracked `.claude/settings.local.json` and added it to `.gitignore`. Redacted 56 key occurrences in the local copy, which is still valid JSON.
- Replaced the 3 key values and the sample `JWT_SECRET_KEY` in `VERCEL_DEPLOYMENT.md` with placeholders.

Merged to `dehandenver/CICTrix` `main` as `cd71e17` through [PR 98](https://github.com/dehandenver/CICTrix/pull/98) on 2026-11-05. Vercel deployed that commit to production, and the commit status reports success.

## Checks run

- Scan of the staged tree: 1,219 text files, 0 Supabase JWTs. `dist` also contains none.
- Filename reference search for the removed `scratch/` files: 0 references.
- `git ls-files scratch .claude/settings.local.json`: 0 files.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npx vitest run` excluding `.worktrees` and `.claude/worktrees`: 168 files, 1,577 tests passed.
- `npm run build`: passed with `TEMP` and `TMP` set to `scratch/.build-tmp`.

## Deviations and limits

- Plain `npm test` also collects tests from local `.claude/worktrees` copies: 1 failure out of 8,728, in `.claude/worktrees/supabase-db-optimization-c48f13/scripts/seed-training-attendance.test.mjs`, because that worktree has no `.env`. It isn't this branch's code.
- Plain `npm run build` failed with `Access is denied` when esbuild removed its file from the Windows temp folder. This is the environmental failure recorded on 2026-10-26, and the build passed with the workaround above.
- The leaked key still works until rotated, and it remains in Git history, forks and clones. Rotation is blocked until the backend's `supabase==2.4.2` is upgraded: see Phase 1.2 of the [security remediation plan](../plans/2026-10-16-security-remediation.md), which now records this work in its November 5 update.
- The plan's branch base was "up-to-date `main`". Upstream was the newest and is the PR target, so it was used over `origin/main`, which was 2 commits behind.
- The PR's Vercel preview never ran: its check stayed at "Authorization required to deploy" through the merge, so the plan's preview check was replaced by the production deployment of `cd71e17`, which succeeded. `Supabase Preview` also passed on that commit.
- Copilot did not review the PR because the requester had no remaining quota.
