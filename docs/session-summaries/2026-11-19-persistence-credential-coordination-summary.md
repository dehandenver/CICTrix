# Persistence and employee credentials: coordinated plans

## Changed

Coordinated `docs/plans/2026-11-17-persistence-integrity-repairs.md` and `docs/plans/2026-11-19-employee-credential-consistency.md` without implementing product code. The persistence plan now contains the authoritative shared addendum; its external specification points to that addendum rather than retaining a competing credential interface.

- Persistence Task 7 owns create-only provisioning, active identity uniqueness, durable first-password state, checked metadata consumers, password-free promotional drafts, and the explicit reset RPC/audit transaction.
- Credential Tasks 2–3 own self-change/UI behavior; new Task 4 owns the two explicit reset UIs and retirement of cached credential authority.
- Stable mutation targets include immutable account ID, canonical employee number, and the loaded revision.
- Existing/conflicted/uncertain account creation returns no recoverable/printed password and cannot resend a welcome email.
- The next PDS/hiring/credential release is one verified unit. Training keeps its later independent acceptance; Persistence Task 10 is not marked complete after its first checkpoint.

The plans specify one future integration worktree, sequential ownership of shared files, precise service/RPC outcomes, a cross-plan lifecycle matrix, and separate approvals for code release, cutover, live reconciliation, and email.

## Read-only evidence

The observed live metadata snapshot contained 137 active accounts, no active missing employee numbers, and no duplicate active employee-number or normalized-username groups. The existing employee-number/lower-username indexes are non-unique; supporting uniqueness remains planned work in Task 7, not a change applied during coordination.

The release gates require real isolated DB/PostgREST/concurrency and isolated-browser evidence, not only mocks. Durable first-password persistence/routing is now included so newly created/reset accounts keep that workflow across fresh browsers; existing accounts are not bulk-reset. Existing plaintext exposure, permissive access, legacy raw API writers, server-side authorization, and session revocation remain separate security limitations; no general production-security guarantee is claimed.

## Verification and status

Documentation checks passed for task numbering, shared contract references, the synchronized external specification, matching integration-worktree names, required first-password state, dashboard links, and an acyclic declared dependency schedule. The dashboard regenerated with 137 plans and 138 summaries. These are structural planning checks, not proof of runtime behavior.

No implementation/runtime suite is claimed by this summary. No migration, production account, email, push, PR, merge, or deployment was performed.

The ownership conflict is resolved in the documents. All new code, database, browser, and operational gates remain pending; the credential plan remains Draft for review.

## 2026-11-20 logic-audit amendments (F1–F6)

Amended `docs/plans/2026-11-17-persistence-integrity-repairs.md`, `docs/plans/2026-11-19-employee-credential-consistency.md`, and the external specification (`C:/Users/ajcbu/.opencode/plan/2026-11-17-persistence-integrity-repairs.md`) to close six logic and code-alignment gaps before implementation:

- **F1 (Strict reserve-then-hire contract):** `complete_external_hire` requires `For Contract Signing` and a reserved open plantilla slot (`slot_missing` / `not_reserved` for legacy slotless or unreserved calls); `RSPDashboard.tsx` replaces the Ranking Report unreserved direct-hire modal bypass (`showHireApplicantsModal`) with navigation to `/admin/rsp/for-hiring`, and unrouted `QualifiedApplicantsPage.tsx` stays updated for hygiene without bypassing reservation.
- **F2 (`p_request_id` reset confirmation without password readback):** `reset_employee_portal_password` accepts `p_request_id uuid DEFAULT NULL` and writes it to `employee_password_resets.request_id` (unique partial index `employee_password_resets_request_id_uidx` `WHERE request_id IS NOT NULL`, zero passwords logged). Dropped reset responses confirm via one bounded metadata-only read of `(account_id, request_id)` plus active account metadata, never selecting `password`.
- **F3 (Opaque raw-string revisions & monotonic timestamps):** Every PostgREST compare-and-set (`employee_portal_accounts.updated_at` and `training_evaluations.updated_at`) treats the loaded revision as an opaque raw string and advances client writes via `new Date(Math.max(Date.now(), Date.parse(expected) + 2)).toISOString()`; `reset_employee_portal_password` computes `GREATEST(clock_timestamp(), existing.updated_at + interval '1 millisecond')`.
- **F4 (Closed browser-cache inventory):** Added `src/lib/recruitmentData.ts` (`createEmployeeNumberAllocator`) to Task 7B to remove its direct `localStorage.getItem('cictrix_employee_portal_accounts')` read and duplicate query; Task 3 removes `EmployeePage.tsx`'s `!currentUser.supabaseId` `updateEmployeePortalEmployee` fallback that resurrected `DEMO_ACCOUNT`; Credential Task 1 allows omitting `employeeNumbers` in `listEmployeePortalAccountIdentities()` so `RSPDashboard.tsx` discovers active portal-only accounts remotely without browser storage.
- **F5 (Acyclic execution order & unrouted reset screen):** Split Task 7 into **Task 7A** (Phase 2 migration and SQL/concurrency tests before Credential Task 1) and **Task 7B** (provisioning/allocators/callers after Credential Task 1), removed Persistence Task 4's false dependency on Credential Task 1, and noted `EmployeeDetailPage.tsx` is only mounted by the unrouted `EmployeeDirectory.tsx` (unit/component tested, not a routed browser-acceptance target).
- **F6 (`"strict": false` narrowing rule):** Required explicit `res.ok === true` / `res.ok === false` (or type guard) checks across callers because `tsconfig.json` compiles with `"strict": false`.

No product code, migrations, tests, or live database rows were changed. `docs/plans/2026-11-19-employee-credential-consistency.md` remains `Draft`, and all implementation, database, HTTP, browser, and release gates remain pending.
