---
title: Security re-verification and Phase 1 containment plan
date: 2026-11-02
status: Done
summary: Re-verified the security remediation plan against upstream main e110977 and the live project; every Critical/High finding is still open. Added F22 (default queue-drain secret) and F23 (vulnerable dependencies) and planned Phase 1 step by step. Remediation remains Draft.
---

# Security re-verification and Phase 1 containment plan

## What shipped vs. planned

Updated [the remediation plan](../plans/2026-10-16-security-remediation.md) as requested: a dated header note, a November 2 re-verification table, two new findings (F22, F23), and a detailed Phase 1 replacing the earlier seven-line outline. Phase 1 now names who runs each step (project owner in a dashboard, or a PR), the exact function signatures and grants to revoke, which portals depend on each grant, a stopgap for the plaintext password column, backend containment, exit checks, and what is deliberately deferred to Phases 2–4 and why. The plan status stays Draft; nothing was executed.

## Evidence and checks run

- `gh repo view dehandenver/CICTrix`: public, last push 2026-10-30, main at `e110977`.
- Redacted JWT scan of upstream main: 26 files, 24 decoding to `service_role`.
- Live read-only queries (counts and privilege booleans only): 81 RLS-off tables, 123 anon-writable relations, 56 allow-all policies, 10 `user_metadata` policies, anon SELECT on `employee_portal_accounts.password` and `employees`, 0 of 211 passwords bcrypt-shaped, per-function `PUBLIC`/`anon`/`authenticated` EXECUTE for the demo and mutation RPCs.
- Source tracing of which portal calls each RPC and backend route, and how each portal signs in.
- `npm audit --omit=dev` on the upstream lockfile.
- Regenerated `docs/plans/index.html` with `build-plans-index.ps1`.

## Follow-up: critique of the earlier analysis (same day)

Checked the October 15–27 claims against upstream `e110977` and the live project, and recorded the results as K1–K10 in the plan's "November 2 critique" section.
- **Corrections:** F6's demo RPCs only touch an empty, demo-only `accounts` table. F7's metadata policies are inert on 3 tables and need an Auth session on the other 7.
- **Logic gaps found:** sign-up is never disabled, although F7, F12 and F13 all depend on attackers getting an Auth account. Key rotation would break the backend: `supabase==2.4.2` rejects `sb_secret_` keys, which I reproduced locally. Column revokes would break `select('*')` queries.
- **New findings:** F24, a built-in demo employee login accepted in connected mode. F25, a backend that accepts tokens signed with a default secret published in the repo.
- **Phase 1:** updated to cover all of the above.

Extra checks run: live policy, grant and function-body queries; advisor counts (80 RLS-off, 45 mutable search path, 24 anon definer functions, 7 tables with policies but RLS disabled); an aggregate count showing no employee holds the demo account's employee number; a local `create_client` test against supabase-py 2.4.2. Not checked: the Auth sign-up setting, whether Vercel sets `JWT_SECRET_KEY`, and frontend behavior with the new keys.

## Deviations and limits

No production change, key use or row read. Whether the legacy service-role key is still enabled and whether production sets `QUEUE_DRAIN_SECRET` were not tested. F5, F10, F12–F14 and F16–F21 were not re-tested individually.
