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

## Deviations and limits

No production change, key use or row read. Whether the legacy service-role key is still enabled and whether production sets `QUEUE_DRAIN_SECRET` were not tested. F5, F10, F12–F14 and F16–F21 were not re-tested individually.
