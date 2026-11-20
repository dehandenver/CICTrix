---
title: Make employee portal credentials consistent across browsers
date: 2026-11-19
status: In Progress
summary: Coordinated Draft. Repair remote credential persistence, login, and explicit resets after Persistence Task 7 makes provisioning and metadata consumers cache-independent; require joint acceptance before release.
---

# Employee Credential Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` for inline execution or `subagent-driven-development` if the user explicitly chooses delegation. Follow tasks in order and track the checkboxes. Do not dispatch an agent without the repository-required model/effort approval.

**Goal:** A confirmed employee password or username change works in a fresh browser, and a stale browser copy cannot authenticate after the remote credential changes.

**Architecture:** Keep the existing React employee portal and `employee_portal_accounts` table. Add checked, remote-only authentication and account reads in the service layer; make credential changes asynchronous and update the remote row before updating UI/session state. Treat account reconciliation as a separately authorized operational action, not an automatic cache migration.

**Tech Stack:** React 18, TypeScript, Vite, Supabase JS/PostgREST, Vitest, React Testing Library.

**Spec:** The repair scope agreed in this conversation on 2026-11-19 and the design contract below, together with the authoritative Credential coordination addendum in `2026-11-17-persistence-integrity-repairs.md`. That addendum owns shared interfaces, Persistence Task 7's expanded credential lifecycle scope, execution order, and release gates. Other persistence tasks retain their behavior contracts.

## Goal

Employees can sign in and manage credentials without depending on the browser that generated or changed them. The login page distinguishes rejected credentials from a failed lookup. Account & Security and Set Initial Password show success or navigate only after the remote change is confirmed.

This plan addresses the reproduced application defect. It does not assert that the user's successful browser has a particular cached password; that browser's account history has not been inspected.

## Approach

### Evidence and existing work

- Production `main` was `bbb196c` during investigation. Its login, password-change, and username-change code is unchanged by the PDS deployment.
- A synthetic run of the actual service functions and `App.tsx` login handler reproduced: password change reports success with zero remote writes; the new password works in the original browser, fails in an empty browser, and the old remote password still works.
- `fix/real-password-changes` contains the employee fix in `e299490`; its later tip observed during planning was `58bcbf2`. The branch is not part of production `main`. The same synthetic scenario against that branch confirmed remote persistence, but it still preserves local-only fallback behavior.
- Review and selectively adapt its employee code/tests. Do not merge/cherry-pick the entire branch: it also changes admin authentication and Settings, outside this repair.
- The current portal stores plaintext credentials and compares them in JavaScript. Its permissive grants/RLS and browser sessions remain security limitations, not problems solved by this consistency repair. The broader work remains in `2026-10-16-security-remediation.md`, especially F19.

### Connection and logic audit (2026-11-19)

Fresh read-only checks confirmed production still serves `/assets/index-BT_dQPmP.js` from `main` at `bbb196c`. Its embedded API URL and the original project `.env` both identify `https://fyzdfgxaaowjzbjpwrii.supabase.co`. A public-client metadata read and the independent MCP database read resolve the same active portal account. Joining its `employee_id` to `employees.employee_number` resolves one active employee, not a missing employee or UUID/employee-number mix-up.

The live account table has a non-null timestamp revision and no non-internal update trigger; revision advancement is an application-writer contract, not a database-enforced guarantee. It has no `must_change_password` column.

**Planning dependency coordinated on user request (updated 2026-11-20 for logic-audit gaps F1–F6).** The initial Draft proposed evicting a changed account from the legacy cache independently. That was unsafe: Newly Hired uses cached accounts for identity reuse, the detail-page reset uses them to find accounts, and other callers can upsert stale credentials. The coordinated ownership is now:

- Persistence Task 7A (before Task 1 here) owns the Phase 2 migration adding identity uniqueness, durable first-password state (`must_change_password`), `employee_password_resets.request_id`, and the `reset_employee_portal_password` RPC/audit transaction plus SQL/concurrency tests. Persistence Task 7B (after Task 1 here) owns create-only provisioning, `recruitmentData.ts` (`createEmployeeNumberAllocator`), checked remote metadata consumers, password-free promotional draft state, and hiring callers/backfills.
- This plan's Tasks 2–3 own employee self-changes and awaited forms after that foundation; Task 4 owns the explicit HR-reset UIs (`RSPDashboard.tsx` and unrouted `EmployeeDetailPage.tsx`) and final cache-consumer retirement.
- Task 5 and the persistence plan's Task 10 PDS/hiring checkpoint jointly verify the complete lifecycle before any shared credential code is released.
- The addendum supplies the single shared interfaces/writer inventory and resolves the earlier scope choice. Its implementation, schema, browser, and release gates remain unverified and must not be treated as completed by updating these documents.

The audit also corrected the mutation target below: use the resolved immutable portal account ID plus expected employee number, not a username that another account could acquire while a form is open.

### Design contract

1. **Remote authority.** Employee portal sign-in and Account & Security reauthentication use only an active remote account. A missing account, wrong password, ambiguous match, permission failure, or unavailable lookup never falls back to `localStorage`, including the hardcoded `employee01` account. Do not add offline/demo authentication to this connected deployment.
2. **Exact credentials.** Preserve the regular portal's username login contract: trim and case-fold usernames, escape literal underscores in `ilike`, reject unsupported wildcard input, and compare passwords exactly without trimming or case-folding. Promotional applications keep their existing username-or-employee-number behavior.
3. **Checked writes.** A password or username change receives the resolved immutable account ID, expected employee number, and loaded revision. Read by that ID, reject identity or revision mismatch, then update using that revision plus its current username and active status. Require one returned canonical row matching the intended value and both identity fields. Store and pass `expectedRevision` (`updated_at`) as an **opaque raw string** from Postgres—never round-tripped through `new Date(...).toISOString()`—so microsecond precision is preserved in `.eq('updated_at', expectedRevision)`. Client PostgREST writers compute `new Date(Math.max(Date.now(), Date.parse(expectedRevision) + 2)).toISOString()` to advance monotonically past microsecond truncation, while the Task 7A reset RPC uses `GREATEST(clock_timestamp(), existing.updated_at + interval '1 millisecond')` so server resets still advance after a fast browser clock. A stale/zero-row write is not success and must not trigger an insert/upsert or a local-only save.
4. **Concurrent changes.** Guard writes with `id`, observed `username`, raw unmodified `expectedRevision` (`updated_at`), and active status. Do not put the current password into a URL filter. This protects against supported application writers that monotonically advance `updated_at`; it does not claim protection against arbitrary SQL writers that bypass that contract.
5. **Lost responses.** A transport failure can follow a committed write. Make one bounded remote read by immutable account ID (or for HR reset, by `(account_id, request_id)` on `employee_password_resets` plus active account metadata, never selecting `password`). If the intended value/request and same employee identity are confirmed, return success with the canonical account. Otherwise return conflict, unavailable, or unconfirmed as appropriate; never assert that the old password still works without evidence, and never automatically replay the write.
6. **Browser data.** New checked APIs return a password-free account identity with its canonical revision. Do not mirror a newly changed password into browser storage. Persistence Task 7B converts provisioning, HR metadata lists, `recruitmentData.ts` (`createEmployeeNumberAllocator`), and promotional prefill/drafts; Credential Task 3 removes `EmployeePage.tsx`'s `!currentUser.supabaseId` `updateEmployeePortalEmployee` cache fallback (which writes back to `cictrix_employee_portal_accounts` and re-injects hardcoded `DEMO_ACCOUNT`); Credential Task 4 converts explicit resets before enabling targeted cache retirement. After these consumers are safe, cleanup failure must not turn a confirmed server save into a reported failure. Do not clear unrelated employees, sessions, preferences, or other portal data.
7. **UI/session consistency.** Reauthentication must resolve the same non-empty employee number as the current employee. Serialize credential actions, keep pending/error state honest, ignore responses after an employee change/unmount, and update the parent's in-memory session plus `sessionStorage` after a confirmed username rename.
8. **First-password state.** Persistence Task 7A adds durable `must_change_password` before Task 1 runs. New provisioning and HR resets set true, and a successful employee password change clears it atomically with the password/revision. Map it into canonical account/session state; a fresh browser must route new/reset accounts through Set Initial Password. Await remote confirmation before `onDone` or clearing the session restriction. Do not silently assume false if the supporting migration is missing. Historical accounts default false without an inferred/bulk reset. This does not implement server-enforced authorization or session revocation.
9. **Existing divergence.** Never upload a cached password to repair a mismatch automatically. Reconciliation requires explicit approval of the exact account and intended credential. Approval of this plan or its implementation is not approval of a production password change.
10. **TypeScript narrowing (`"strict": false`).** Because `tsconfig.json` compiles with `"strict": false` (`strictNullChecks: false`), callers checking discriminated union results (`PortalAccountResult`, `PortalCredentialChangeResult`, `PortalPasswordResetResult`, etc.) must use explicit `result.ok === true` / `result.ok === false` checks (or type guards) rather than relying on `if (!result.ok)` narrowing.

**Alternatives:** Deploying `e299490` unchanged fixes future persistence but leaves stale-cache authentication and misleading lost-response copy. A full Supabase Auth migration would address broader security problems but is a different project. The chosen approach adapts the existing fix and closes its consistency gaps without replacing authentication architecture.

### Global constraints

- No product code changes until this Draft plan is approved.
- Follow the settled ownership/dependency/release contract in the persistence plan's Credential coordination addendum. Updating the plans does not approve code implementation or mark any of their gates passed.
- After approval, use `using-git-worktrees` to prepare the shared `fix/persistence-credential-integration` branch/worktree from then-current production `upstream/main`; carry both coordinated plans/planning records and regenerate the dashboard. Do not implement in or merge the old persistence-repair/password-change worktrees.
- No production database writes, password resets, email sends, pushes, PR creation, or deployment without explicit approval for that operation.
- No real passwords, API keys, full account responses, or session credentials in source, fixtures, logs, screenshots, plans, summaries, or commits.
- External calls stay in `src/lib/`; components do not query Supabase directly.
- No new dependencies, admin Settings changes, session revocation system, or broad RLS changes. Supporting identity indexes/first-password column/reset RPC belong exclusively to Persistence Task 7's CLI-generated Phase 2 migration; this plan consumes them and must not author a duplicate migration. Hiring/provisioning changes likewise remain Persistence Task 7's responsibility.
- Preserve unrelated work, including the existing unstaged DataTable snapshot change and all work in `fix/real-password-changes`.
- Preserve deployed PDS fixes and the remaining persistence-integrity behavior contracts. Record coordinated status/handoffs in both plans and their ledger without marking unrun implementation or acceptance complete.
- UI work is limited to existing controls, loading, and feedback; read `DESIGN_IDENTITY.md` before implementation, use existing tokens/classes, and run its section 16 checklist. No layout/token redesign or new mockup is required.

### Review Focus

1. A remote timeout, permission error, or missing row must never become a cached login or local-only credential change. Tests: Tasks 1–2.
2. A server commit followed by a lost response must not report a definite failure, perform an automatic second write, or promise the old credential works. Tests: Task 2.
3. A reset, rename, or username reassignment between lookup and update must not overwrite a newer credential or mutate a different employee's account. Tests: Task 2.
4. Remote-only accounts, renamed sessions, and delayed responses for a different employee must not lock out the rightful employee or change another employee's UI/session. Tests: Task 3.
5. Two tabs sharing `localStorage` are not two independent browsers; acceptance must use isolated storage contexts and explicitly seed a stale-cache hire replay after self-change and reset. Tests/checks: Task 5 and the persistence plan's Task 10 checkpoint.

### File boundaries

| File | Responsibility |
| --- | --- |
| `src/lib/employeePortalData.ts` | Shared service: this plan owns reads/authentication, self-change and explicit reset service; Persistence Task 7 owns provisioning. Retire the unsafe upsert only after all planned callers are converted. |
| `src/lib/employeePortalData.authentication.test.ts` (new) | Remote-only authentication/read behavior and sanitized failures. |
| `src/lib/employeePortalData.changes.test.ts` (adapt from existing branch) | Remote credential writes, stale revisions, lost responses, cache behavior. |
| `src/App.tsx` | Checked login orchestration and confirmed session-username callback, without changing employee profile hydration. |
| `src/App.employee-auth.test.tsx` (new) | Actual route/login integration, no-cache fallback, session identity, username propagation. |
| `src/modules/employee/EmployeeLoginPage.tsx` and existing `.test.tsx` | Distinct invalid/unavailable feedback while retaining input/loading behavior. |
| `src/modules/employee/EmployeePage.tsx` and new `EmployeePage.credentials.test.tsx` | Remote account resolution, identity-bound unlock, awaited credential forms, and removal of the `!currentUser.supabaseId` `updateEmployeePortalEmployee` cache fallback. |
| `src/modules/employee/SetInitialPasswordPage.tsx` and new `.test.tsx` | Await confirmed save, duplicate-submit protection, initial-password outcome handling. |
| `src/modules/admin/RSPDashboard.tsx`, `src/modules/admin/components/EmployeeDetailPage.tsx`, and new `.credentials.test.tsx` files | Explicit, awaited, identity/revision-bound HR resets; no implicit account creation or username regeneration. Coordinate RSP metadata/provisioning edits with Persistence Task 7. (`EmployeeDetailPage.tsx` is only mounted by the unrouted `EmployeeDirectory.tsx` with no route in `App.tsx`, so it is covered by unit/component tests rather than a live routed browser test.) |
| `src/lib/employeePortalData.resets.test.ts` (new) | Checked reset RPC, audit/error/uncertain result handling and no secret on unconfirmed reset. |
| `docs/handoff/employee-credential-reconciliation.md` (new during execution) | Secret-free, approval-gated single-account operational procedure. |
| `docs/session-summaries/2026-11-19-employee-credential-consistency-summary.md` (during execution) | Actual delivery, deviations, checks, and any blocked acceptance. |

No new module directory or broad refactor is needed.

## Steps

### Task 1: Make connected login and account reads remote-only

**Files:** `src/lib/employeePortalData.ts`, `src/App.tsx`, `src/modules/employee/EmployeeLoginPage.tsx`; new `src/lib/employeePortalData.authentication.test.ts`, new `src/App.employee-auth.test.tsx`, existing `src/modules/employee/EmployeeLoginPage.test.tsx`.

**Interfaces:**

```ts
type PortalAccountIdentity = Pick<
  EmployeePortalAccount,
  'id' | 'username' | 'employee' | 'updatedAt'
> & { mustChangePassword: boolean };
type PortalAccountFailureKind =
  | 'invalid_credentials' | 'not_found' | 'ambiguous_account' | 'lookup_unavailable';
type PortalAccountResult =
  | { ok: true; account: PortalAccountIdentity }
  | { ok: false; kind: PortalAccountFailureKind };

authenticateEmployeePortalAccount(username: string, password: string): Promise<PortalAccountResult>;
getEmployeePortalAccountByEmployeeNumber(employeeNumber: string): Promise<PortalAccountResult>;
type PortalAccountListResult =
  | { ok: true; accounts: PortalAccountIdentity[] }
  | { ok: false; kind: 'ambiguous_account' | 'lookup_unavailable' };
listEmployeePortalAccountIdentities(employeeNumbers?: string[]): Promise<PortalAccountListResult>;
```

These exports live in `employeePortalData.ts`. This task now runs **after** Persistence Task 7A (Order 4), so `must_change_password` is already present in the branch's migrations during local/disposable DB testing. The employee-number helper resolves a known employee, not a new regular-login identifier type. Omitting `employeeNumbers` (`undefined`) lists all active non-deleted account metadata (ordered deterministically, excluding `password`, so `RSPDashboard` directory discovery can still see active portal accounts without an `employees` row); passing `string[]` scopes to those employee numbers (with `[]` returning `{ ok: true, accounts: [] }` without querying); a successful absent account is distinct from a failed query. Its SQL projection excludes the password column. Keep raw authentication rows/passwords internal. Persistence Task 7B adapts promotional account/draft result types while preserving its identifier and error-code behavior.

- [ ] **1. Write failing service tests.** Use synthetic accounts and a Supabase mock recording reads/writes. Assert active remote credentials succeed with empty storage; a matching cached password cannot override remote rejection, soft deletion, missing account, duplicate normalized matches, thrown read, or returned read error. Map durable `must_change_password` to the canonical identity; an unavailable supporting column/schema is unavailable, not false. Assert literal underscores stay literal, unsupported wildcards do not broaden a read, password whitespace/case remain exact, public result has no password, and diagnostic calls contain no supplied/stored password or account row. Assert `listEmployeePortalAccountIdentities()` returns deterministic ordered metadata for all active non-deleted accounts without selecting `password`, while passing `[]` short-circuits without a query.
- [ ] **2. Write failing App/page tests.** Mount the actual App with unrelated modules stubbed, but keep the credential service real against the mocked remote store. Seed a legacy cached password and assert no employee session/dashboard for it. Assert valid remote login creates the right employee session and preserves dashboard/`returnTo` behavior. Assert lookup failure produces unavailable/retry guidance, not “username and password don't match”; ambiguity produces generic contact-HR guidance without exposing account counts.
- [ ] **3. Run the new tests and confirm behavioral failures.**
  Run `npx vitest run src/lib/employeePortalData.authentication.test.ts src/App.employee-auth.test.tsx src/modules/employee/EmployeeLoginPage.test.tsx`. Record the failing assertions before implementation; initialization or mock import failures do not establish the regression.
- [ ] **4. Implement the checked reads and integrate login.** Reuse the existing active-row/escaped-identifier query pattern. Metadata projections explicitly select the required `must_change_password` and revision columns, excluding password; the authentication projection remains private. Match exactly after normalization and refuse multiple active matches. Replace only `handleEmployeeLogin`'s remote-then-local credential resolution; keep its employee hydration and session creation. Pass a sanitized failure kind through the existing callback error boundary so the page can distinguish invalid, unavailable, and ambiguous outcomes. Do not change shared legacy helpers into new fallbacks. Do not deploy these new callers until Persistence Task 7A's supporting migration (already ordered first locally) is applied in production as part of Release Unit 1.
- [ ] **5. Rerun Task 1 tests plus `npx vitest run src/lib/employeePortalData.promotion.test.ts src/modules/applicant/ApplicantWizard.promotion.test.tsx src/test/promotionEntry.smoke.test.tsx` and `npx tsc --noEmit`.** Expected: all pass; promotional identifier and access behavior is unchanged.
- [ ] **6. Commit only Task 1 files.** Suggested message: `fix(employee): make connected portal login remote authoritative`.

### Task 2: Persist credential changes and classify uncertain outcomes

**Files:** `src/lib/employeePortalData.ts`, `src/lib/employeePortalData.changes.test.ts`.

**Consumes:** Task 1's checked read/identity rules plus the completed Persistence Task 7 provisioning/metadata handoff. Private helpers may retain raw rows to verify passwords and revisions. Do not deploy these self-change/cache changes without the other coordinated tasks.

**Produces:**

```ts
type PortalCredentialFailureKind =
  | 'validation' | 'invalid_credentials' | 'account_unavailable'
  | 'username_taken' | 'conflict' | 'unavailable' | 'unconfirmed';
type PortalCredentialChangeResult =
  | { ok: true; account: PortalAccountIdentity }
  | { ok: false; kind: PortalCredentialFailureKind; error: string };
type PortalCredentialTarget = {
  accountId: string;
  employeeNumber: string;
  expectedRevision: string;
};

changeEmployeePortalPassword(
  target: PortalCredentialTarget, currentPassword: string, newPassword: string
): Promise<PortalCredentialChangeResult>;
changeEmployeePortalUsername(
  target: PortalCredentialTarget, newUsername: string
): Promise<PortalCredentialChangeResult>;
```

- [ ] **1. Adapt the existing branch's employee change tests, not its admin tests.** Pin server-first success on a remote-only account; wrong current password and stale cached password cause no write; a missing/deleted/ambiguous remote account or failed read never changes storage; zero/multiple returned rows and a stale revision never report success; case-insensitive username collision and Postgres `23505` map to `username_taken`. Preserve current service validation (password minimum six characters; username minimum three and letters/digits/dot/underscore/hyphen); the initial-password UI retains its existing eight-character requirement.
- [ ] **2. Add failure/concurrency tests.** Simulate two forms reading the same revision, an admin reset/rename advancing the revision before save, server commit followed by lost response, pre-commit transport failure, and failed verification read. Include a microsecond-precision `updated_at` fixture (e.g., `2026-11-19T12:00:00.123456+00:00`) asserting `.eq('updated_at', expectedRevision)` receives the exact unmodified raw string and the written `updated_at` advances by at least `+2ms` above `Date.parse(expectedRevision)` even when `Date.now()` is behind the row's timestamp. Reassign the former username to a different synthetic employee while the original form is open; neither mutation may switch to that other account, even if its password happens to match. Reject an account-ID/employee-number mismatch or a changed loaded revision before any write. Require no automatic replay and at most one bounded readback by account ID. Confirm success only when readback shows the intended credential and employee identity. Assert no failure copy promises the old password still works after an uncertain result.
- [ ] **3. Add storage tests and run red after the Persistence Task 7 handoff.** Assert confirmed changes do not store the new password and read/write refusal leaves unrelated browser data untouched. Final targeted eviction and its consumer regression proof belong to Task 4, not a standalone cleanup here. Run `npx vitest run src/lib/employeePortalData.changes.test.ts` and confirm behavioral regression failures before implementation.
- [ ] **4. Implement the async mutations.** Selectively adapt `e299490`: require remote presence by the supplied immutable account ID and expected employee number, bind updates to ID/employee number/username/unmodified raw `expectedRevision`/active state, write `updated_at` using `new Date(Math.max(Date.now(), Date.parse(expectedRevision) + 2)).toISOString()`, request the canonical returned row, and verify exactly one result. Password change writes `must_change_password = false` in that same row mutation; username change leaves it untouched. Never resolve a mutation target from the former username or email. Keep current-password comparison inside the service, not in URL filters. Resolve a transport ambiguity with the bounded readback contract, including the intended first-change flag. Remove the existing branch's `savedTo: 'device'` path and its claim that the old password always remains valid on failure.
- [ ] **5. Rerun Tasks 1–2 service tests and `npx tsc --noEmit`.** Before callers are converted in Task 3, identify the exact expected TypeScript failures at the two existing credential-change callers; do not weaken the result types to hide them. Convert Tasks 2–3 in one working change if needed, and do not commit an uncompilable intermediate tree.
- [ ] **6. Commit the service/test change only after Task 3 caller conversion passes compilation**, or combine these two tasks into one coherent commit. Suggested message: `fix(employee): confirm remote credential changes before success`.

### Task 3: Await account changes in every employee caller

**Files:** `src/modules/employee/EmployeePage.tsx`, `src/modules/employee/SetInitialPasswordPage.tsx`, `src/App.tsx`; new `EmployeePage.credentials.test.tsx`, new `SetInitialPasswordPage.test.tsx`, extended `src/App.employee-auth.test.tsx`.

**Consumes:** Task 1 reads/authentication and Task 2 mutation results.

**Produces:** An optional `EmployeePage` prop `onPortalUsernameChanged?: (employeeId: string, username: string) => void`. `App.tsx` provides it on every employee route and updates only a matching current employee's in-memory session and `writeEmployeeSession` value. `SetInitialPasswordPage` also receives required `employeeNumber: string` from `employeeSession.employeeId`; it resolves the remote identity through Task 1 before building Task 2's `PortalCredentialTarget`. `EmployeePage` builds that same target from its resolved account ID/current employee number and the loaded canonical `updatedAt`; successful mutations replace that revision with the returned one, not a guessed client baseline. No password enters the callback/session.

- [ ] **1. Write failing settings tests.** Resolve a remote account by the signed-in employee number with empty local storage. Unlock only after checked remote authentication and an exact, non-empty matching employee number. Reject another employee's otherwise-valid account and blank identity. Exercise read failures, rename on another device, and an employee switch while resolution/unlock/save is pending; old responses cannot repopulate controls or update the new employee/session. Add a regression test asserting an unlinked profile edit (`!currentUser.supabaseId`) fails honestly and makes zero `localStorage` writes to `cictrix_employee_portal_accounts`.
- [ ] **2. Write failing mutation UI tests.** Hold promises pending and assert no success message, cleared password inputs, renamed session, or `onDone` yet. Double submits and simultaneous username/password actions produce only one mutation. Explicit rejection shows its safe error and retains retryable form input. Unconfirmed outcome requests checking/reverification, not a claim of definite failure. Success clears sensitive inputs and applies only confirmed canonical identity.
- [ ] **3. Write initial-password/session tests and run red.** Test pending, rejected, unconfirmed, success, duplicate submits, and unmount/identity change. A failed/unconfirmed initial save never clears the current session restriction or navigates. Fresh-browser login to a new/reset account routes through Set Initial Password from the durable flag; a confirmed password change clears it remotely and in the session, while a username change/hire replay cannot. A confirmed rename updates App and persisted session; reload/account-tab re-entry resolves the renamed remote account rather than the former username/cache. Run `npx vitest run src/modules/employee/EmployeePage.credentials.test.tsx src/modules/employee/SetInitialPasswordPage.test.tsx src/App.employee-auth.test.tsx`.
- [ ] **4. Implement the callers.** Use remote account resolution rather than `portalAccountAtMount` as authority, construct the immutable `PortalCredentialTarget`, await remote unlock/save results, serialize credential actions, and guard async completions by current employee/generation. Remove the `!currentUser.supabaseId` local-only `updateEmployeePortalEmployee` fallback in `EmployeePage.tsx`'s `persistProfilePatch` so unlinked profiles fail with an actionable error instead of resurrecting `cictrix_employee_portal_accounts` and hardcoded `DEMO_ACCOUNT`. Keep remote calls in services. Wire the confirmed-rename callback to all eight existing `EmployeePage` route instances without refactoring routing. Pass the signed-in employee number to the initial-password route, resolve its matching account ID, await the initial save in `try/finally`, and protect against same-tick duplicate submission.
- [ ] **5. Run all Task 1–3 tests, existing employee login/IPCR tests, and `npx tsc --noEmit`.** Expected: pass, with no regression to profile/PDS saves, safe return navigation, per-tab session identity, or initial-password gating within the current session.
- [ ] **6. Commit the UI/session integration once compiling**, together with Task 2 if required by its signature change. Suggested message: `fix(employee): await credential saves and synchronize session usernames`.

### Task 4: Checked HR resets and final credential-cache retirement

**Files:** `src/lib/employeePortalData.ts`, new `src/lib/employeePortalData.resets.test.ts`, `src/modules/admin/RSPDashboard.tsx`, `src/modules/admin/components/EmployeeDetailPage.tsx`, new `src/modules/admin/RSPDashboard.credentials.test.tsx`, new `src/modules/admin/components/EmployeeDetailPage.credentials.test.tsx`; extend the account-change/cache tests.

**Consumes:** Task 1 identity/list reads, Task 2's loaded identity/revision target, and Persistence Task 7's create-only caller conversion, unique indexes, reset RPC, and SQL/concurrency tests. **Produces:** `resetEmployeePortalPassword` and `PortalPasswordResetResult` exactly as defined in the persistence plan's coordination addendum. Do not create another reset/provisioning API or migration.

- [ ] **1. Write failing reset-service tests.** Require one explicitly chosen active account with matching employee number and loaded revision. Assert the actor/revision/identity RPC refusal and audit rollback return no password; missing accounts are not created; reset preserves the current username even when it differs from the employee's name. Assert each reset attempt generates a client `requestId = crypto.randomUUID()` passed as `p_request_id`; on a dropped response, the service performs one bounded metadata-only read of `employee_password_resets` by `(account_id, request_id)` plus an active `employee_portal_accounts` metadata read (never selecting `password`), returning `{ ok: true, account, credentials }` only if that exact `(account_id, request_id)` row exists, `conflict` if absent and `updated_at` advanced past `expectedRevision`, or `unconfirmed` with no secret otherwise. Assert no automatic reset retry or second generated password occurs. Failed/unconfirmed results contain no candidate secret, and logs contain no credentials.
- [ ] **2. Write failing tests for both reset UIs.** With empty/stale credential storage, resolve the selected employee from remote metadata. While pending, disable duplicate confirmation, show no password or success, and do not close the modal. Verify canonical success, unavailable/stale/deleted target, refused reset, lost response, and selected-employee switch. The two UIs must behave identically on outcome classification. Never rename the account to a name-derived username or fall back to account creation. Note: `EmployeeDetailPage.tsx` is only mounted by the unrouted `EmployeeDirectory.tsx` (not routed in `App.tsx`), so its reset behavior is verified through `EmployeeDetailPage.credentials.test.tsx` (shared reset service and parity with `RSPDashboard.tsx`), while live browser acceptance exercises `RSPDashboard.tsx`.
- [ ] **3. Run red.** Run `npx vitest run src/lib/employeePortalData.resets.test.ts src/modules/admin/RSPDashboard.credentials.test.tsx src/modules/admin/components/EmployeeDetailPage.credentials.test.tsx` and record behavioral failures. RPC/schema absence is covered by an unavailable test, not papered over with a direct update fallback.
- [ ] **4. Implement the checked reset service and callers.** Generate a per-attempt `requestId = crypto.randomUUID()` and pass `p_request_id: requestId` to the migration-owned `reset_employee_portal_password` RPC; on a dropped response, perform the bounded metadata-only `(account_id, request_id)` + active account metadata readback without selecting `password`, returning `{ ok: true, account, credentials }` only if that exact `request_id` row exists, `conflict` if absent with an advanced `updated_at`, or `unconfirmed` with no secret otherwise. Keep secret candidates local to one pending request and expose them only after confirmed durable success. Keep calls in the service layer. RSP's old separate audit call is replaced by the atomic RPC audit, not duplicated. Preserve stable ID/employee number/revision/current username and ignore late results after selection changes.
- [ ] **5. Close the cache/writer inventory before enabling retirement.** Verify Persistence Task 7B's remote identity reuse, `recruitmentData.ts` (`createEmployeeNumberAllocator`), account lists, and password-free promotional prefill/drafts, plus Task 3's removal of `EmployeePage.tsx`'s `updateEmployeePortalEmployee` cache fallback. Replace every remaining reset use of `findEmployeePortalAccount`, `getEmployeePortalAccounts`, and `upsertEmployeePortalAccount`; remove the destructive credential-upsert export/private writer and `updateEmployeePortalEmployee` (if unused after a full caller/import scan). Do not remove unrelated local profile metadata helpers solely because their names contain “account.”
- [ ] **6. Enable and test targeted obsolete-credential cleanup.** After a confirmed login/self-change/reset, evict only that obsolete credential entry; never a whole storage namespace or another employee's data. Assert provisioning still finds the existing account after cleanup, promotional prefill uses the current username, both HR resets work with empty storage, and storage exceptions do not turn remote success into failure. No new password enters local/session/application-draft storage.
- [ ] **7. Run the reset/change/provisioning/caller tests plus `npx tsc --noEmit`, then commit.** Suggested message: `fix(employee): verify explicit resets and retire credential cache authority`. No release before Task 5 and the joint gate.

### Task 5: Cross-browser acceptance and approval-gated reconciliation

**Files:** Extend `src/App.employee-auth.test.tsx`; create `docs/handoff/employee-credential-reconciliation.md` and `docs/session-summaries/2026-11-19-employee-credential-consistency-summary.md`; update this plan and regenerate `docs/plans/index.html`.

**Consumes:** The completed checked service and UI contracts. Produces a tested release candidate and an operational procedure, not an automatic production repair.

- [ ] **1. Add the end-to-end regression within Vitest.** Keep actual App/service/hiring/reset logic against a shared synthetic remote store and separately mounted browser-storage/session contexts. Cover the full lifecycle in the persistence addendum: change a password, replay hiring with a stale cached credential, confirm unchanged account/password/employee identity, sign in from the other context, reset once through HR, reject a stale self-save, rename, and verify promotional prefill and reload. Assert no repeated printed password/email and no session on unavailable reads. Assert actual mutations rather than unconditional success mocks.
- [ ] **2. Run real HTTP/browser acceptance against a disposable local or explicitly approved staging Supabase database.** Use two distinct profiles/isolated browser contexts, not two tabs. Use one synthetic employee and confirm password change, username change, stale-cache rejection, remote-only settings unlock, initial-password save, denied/zero-row write, and a dropped write response (including an HR reset dropped response verified via `employee_password_resets.request_id` without reading `password`). Live HR reset route checks target `RSPDashboard.tsx` (since `EmployeeDetailPage.tsx` has no route in `App.tsx`). Record storage isolation, account identity, result, and request status without credentials. If a safe environment or isolated contexts are unavailable, mark this gate Blocked; do not substitute production mutations or label mocks as browser evidence.
- [ ] **3. Write the reconciliation runbook, with no real secret.** Target only the previously inspected demo account (`portal-EMP-CC334757`, employee number `EMP-CC334757`, last observed username `ryanlopezcastro`) after rechecking its identity and revision. Explain that the browser-specific history is unverified and that code deployment cannot repair an already-diverged credential. Never enumerate/reset other demo accounts or trust a cached password as evidence of ownership.
- [ ] **4. Record the operational gates in that runbook and the joint release checklist.**
  1. Ask approval separately for the tested code's push/PR/deployment.
  2. Before enabling authoritative login in production, disclose that local-only accounts/passwords will stop working. Obtain approval for this cutover and have the tested HR recovery path ready. Any specifically approved reconciliation occurs in a controlled pre-cutover window; preserve existing sessions and do not bulk-delete browser state.
  3. Ask approval separately for the exact demo account's reconciliation and chosen credential. Reconfirm the desired credential privately; do not infer it is still the value pasted earlier.
  4. Prefer the tested explicit reset flow for the chosen immutable account/employee/revision, followed by an authorized employee password change to the intended value. Never use the legacy upsert/reset path. If an approved operator must use narrowly scoped live DML instead, require exactly one existing-row change plus secret-free audit metadata, preserve identity/username, and follow the repository's user-run dashboard procedure; no inserts/upserts, schema changes, or migration-history edits. Do not log or commit the secret.
  5. Verify the chosen credential through a fresh connected sign-in; verify the superseded credential and a stale cached copy cannot sign in. Keep the value out of browser captures and reports. Do not email or copy credentials to any external destination.
  6. If a concurrent change, identity ambiguity, or zero-row result appears, stop and recheck; do not broaden the update or repeat a reset blindly. Do not restore a stale/compromised password as a rollback.
- [ ] **5. Run all checks below and the persistence addendum's joint gates, review the complete shared-unit diff, and record actual evidence.** Resolve any failed test or document a blocker. Do not mark the implementation verified while database/HTTP/isolated-browser gates are outstanding. Persistence Task 10's PDS/hiring checkpoint is not completion of its later training/final checks. Mark code delivery and optional production reconciliation separately; plan approval never changes the latter to authorized.
- [ ] **6. Save the execution summary, update status, regenerate the dashboard, and commit docs.** Suggested message: `docs: record employee credential consistency verification`. Do not push or deploy as part of completing this local task.

## Risks

- Removing the connected fallback intentionally stops local-only/demo passwords from working. A release without an approved reconciliation/cutover plan can lock out affected users; a release note and explicit operator approval are required.
- The existing password-change branch is useful prior work, not an already approved merge. Preserve its worktree and exclude unrelated admin changes.
- Existing plaintext storage, public grants/RLS, and browser-only sessions mean these changes are not a security certification or a server-enforced identity boundary.
- Durable first-password state depends on the new supporting column being applied before these callers. Routing from that state is not server-enforced authorization, and existing sessions are not automatically revalidated after an HR reset.
- Existing HR reset/provisioning callers use legacy cache helpers; one detail-page reset does not await its remote save. Persistence Task 7 and Credential Task 4 now explicitly own conversion of those paths, and their combined regression tests are mandatory before release.
- No intermediate shared-file commit may be released while those consumers remain unsafe. The ownership dependency is settled by the addendum, but not satisfied until its implementation and acceptance gates pass.
- Existing sessions are not revoked/revalidated by a password change. Acceptance concerns fresh authentication; global logout/token invalidation is out of scope.
- Timestamp-based stale-write checks depend on supported writers advancing `updated_at`. Manual SQL or other writers that bypass it remain outside that guarantee.
- A readback can be unavailable after a committed write. Show unconfirmed status and recovery guidance rather than promising either password works.

## Checks to run

All automated tests use synthetic credentials and mocked/disposable services, never production credentials.

```powershell
$env:VITE_SUPABASE_URL = 'http://127.0.0.1:54329'
$env:VITE_SUPABASE_ANON_KEY = 'local-test-placeholder'
npx vitest run src/lib/employeePortalData.authentication.test.ts src/lib/employeePortalData.changes.test.ts src/lib/employeePortalData.resets.test.ts src/lib/employeePortalData.provisioning.test.ts src/App.employee-auth.test.tsx src/modules/employee/EmployeeLoginPage.test.tsx src/modules/employee/EmployeePage.credentials.test.tsx src/modules/employee/SetInitialPasswordPage.test.tsx src/modules/admin/RSPDashboard.credentials.test.tsx src/modules/admin/components/EmployeeDetailPage.credentials.test.tsx
npx vitest run src/lib/employeePortalData.promotion.test.ts src/modules/applicant/ApplicantWizard.promotion.test.tsx src/test/promotionEntry.smoke.test.tsx src/modules/employee/EmployeePage.ipcr.test.tsx
npx tsc --noEmit
npm run lint
```

Those synthetic settings are only for mocked tests and build verification. Real HTTP/browser acceptance uses the disposable stack's actual client URL/key and migrated schema, never this placeholder and never production credentials. For full-suite/build verification in an isolated worktree without its own `.env`, use the following; do not copy production `.env` into the worktree:

```powershell
$env:VITE_SUPABASE_URL = 'http://127.0.0.1:54329'
$env:VITE_SUPABASE_ANON_KEY = 'local-test-placeholder'
npx vitest run --dir src
npm run build
npm run check:migrations
git diff --check
powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1
```

Expected: zero failing tests, zero TypeScript errors, zero lint warnings, successful build, migration inventory passing its check with only the explicitly planned CLI-generated Phase 2 additions and all deployed versions preserved, and no whitespace errors. Record existing build warnings separately rather than treating them as new fixes. Inspect the staged diff for credentials and unrelated files.

Manual acceptance includes the isolated browser/HTTP matrix in Task 5, Persistence Task 7's real lifecycle SQL/concurrency suites, the addendum's joint release gates, and the design guide section 16 checklist for touched controls. A separate approved production smoke/reconciliation result must never be inferred from passing local tests.

### Planning self-review

- Coverage: persistence, authoritative login, identity-bound settings, initial-password awaiting, explicit resets, safe provisioning, cache consumers, existing-data reconciliation, and release gates each have one owning task across the two plans.
- Types/callers: both async mutations share one loaded identity/revision contract; all current employee/reset callers and all eight route instances are listed. Persistence Task 7 migrates provisioning and promotional account/draft types in one typed handoff; existing promotional identifier/error behavior is preserved.
- Review Focus: every listed failure class is assigned tests/checks above; unknown user-browser history stays explicitly unknown.
- Scope: no admin Settings integration, new authentication architecture, live schema operation, real-account reset, or code implementation is authorized by this Draft. Supporting migration authoring belongs to Persistence Task 7 during approved execution.
- Coordination: the stable target includes the loaded revision; the cache-consumer ownership/order conflict is resolved in the persistence addendum. Actual implementation/DB/browser verification and production approvals remain open, not inferred.
- Logic-audit amendments (2026-11-20): resolved gaps `F1`–`F6` across both plans (`complete_external_hire` strict reserve-then-hire & Ranking Report redirect, `p_request_id` reset confirmation without password readback, opaque raw-string revisions & monotonic timestamps, missed `recruitmentData.ts`/`updateEmployeePortalEmployee`/unfiltered metadata list consumers, Task 7A-before-Credential-1 sequencing & unrouted `EmployeeDetailPage.tsx` note, and explicit `result.ok === true`/`false` narrowing under `"strict": false`).
