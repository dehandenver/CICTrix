# Persistence integrity: Task 2 implementation checkpoint

Task 2 of `docs/plans/2026-11-17-persistence-integrity-repairs.md` is implemented locally, with database acceptance blocked. Tasks 3–10 remain.

## Changes

- PDS services use canonical snapshot/revision read and save RPCs, with no delete/reinsert fallback.
- Authored migration `20261117101141_pds_section_transactions.sql` reconciles retained IDs, new rows and explicit removals in one invoker transaction.
- Family/background scalars share children/references transactions. Callers thread revisions and adopt returned rows.
- Authored SQL rollback, validation, identity, membership, and caller-policy tests plus an anonymous-caller two-session stale-save harness.
- Inventoried direct writers and documented that revision coordination covers participating callers, not all manual/legacy writes.

## Review and checks

Builder: `deepseek/deepseek-flash#max`, existing DeepSeek key connection. Reviewer: parent `openai/gpt-6.1-sol#medium`, OpenAI OAuth.

Review found undeclared SQL variables, fixture/RLS mistakes, count-only membership and weak concurrency assertions. First correction addressed these but introduced a stale-test fixture regression; second correction isolated that fixture. One unsuccessful corrective attempt remains recorded out of two allowed.

Parent independently verified:

- Current-src suite: 172 files / 1,630 tests passed.
- Targeted PDS/service/saved-section tests: 3 files / 30 passed.
- TypeScript, scoped ESLint, migration check (131 files), concurrency shell syntax, and diff whitespace checks passed.
- Synthetic-localhost production build passed; existing Vite/Browserslist/bundle-size warnings remain.

## Blocked acceptance and boundaries

Docker's Linux engine pipe is unavailable. The migration has not been compiled/applied on PostgreSQL, and SQL rollback, permissions, membership and concurrent-save tests have not run. This is not a transactional-correctness or production-security sign-off. Full database acceptance must close before release.

Existing permissive employee-ownership policies are unchanged. No live database writes, push, deployment, real credential issuance or email occurred. Prior Docker stack and unrelated DataTable snapshot remain preserved. Numeric/profile and comprehensive PDS load/conflict/uncertain-state UI remain Tasks 3–4.
