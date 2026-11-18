# Persistence review corrections

Follow-up corrections for Tasks 1–3 in `docs/plans/2026-11-17-persistence-integrity-repairs.md`.

## Changes

- Keep canonical family/background values when unrelated profile fields update.
- Reject fractional education years/units without silently truncating them.
- Ignore obsolete success/failure responses across employee identity changes and unmount; stale saves cannot clear the next employee's saving state.
- Supply required synthetic department/position fields in both database-test fixtures.
- Make no-visible employee permission tests independent of permissive policy inventory using a rolled-back restrictive policy.

DeepSeek Flash/max implemented; parent Sol/medium inspected the source/tests and runs independent verification. No visual redesign, product migration, production-policy/grant change or Task 4 work.

## Verification

Parent reran 53 focused PDS/API tests and the full 173-file/1,671-test frontend suite successfully. TypeScript, scoped lint, production build, migration checker (131 files), shell syntax and whitespace checks passed.

Docker's Linux engine pipe is unavailable again. Revised SQL/concurrency tests have not passed on PostgreSQL; full database acceptance remains open. No production writes, deployment or push.
