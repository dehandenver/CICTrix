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

Docker later became available. Parent independently reran the exact migration and both revised suites against the owned `integrity_repairs` database with NOT NULL department/position and both permissive employee policies reproduced:

- Migration compiled/applied locally.
- SQL suite: `ALL PDS SECTION TESTS PASSED`, ending in rollback.
- Concurrency suite: `ALL PDS SECTION CONCURRENCY TESTS PASSED`; loser observed blocked on a lock, then rejected as stale; winner ID, scalar values and revision preserved.
- Both RPCs verified SECURITY INVOKER; temporary test policies rolled back.

This is a limited production-condition reproduction, not a full production-schema clone. The schema-only restore still reports seven unrelated ACL/policy errors. Its missing employee/child cascade left one synthetic child after the concurrency harness deleted its employee; parent removed that exact synthetic orphan and verified both tables empty. Production/security sign-off, real PostgREST and rendered-browser acceptance remain outside these checks. No production writes, deployment or push.
