---
title: Repair PDS, external hiring, and training persistence integrity
date: 2026-11-17
status: In Progress
summary: Preserve records and make hiring/training writes truthful and replay-safe, with coordinated employee credential lifecycle ownership and joint PDS/hiring release gates.
spec: C:/Users/ajcbu/.opencode/plan/2026-11-17-persistence-integrity-repairs.md
---

## Goal

Implement the user's approved ten-task persistence-integrity plan without changing scoring rules, authentication architecture, or unrelated UI. The full approved specification and task contracts are saved at the `spec` path above. For future coordinated execution, read that specification together with the Credential coordination addendum below: the addendum supersedes only the overlapping Task 7 credential interface, its dependent caller scope, and the shared release ordering. Historical implementation/verification records remain unchanged.

Preserve the nine-section PDS navigation in `docs/mockups/2026-10-06-pds-step-list.html` and the hiring flow in `docs/mockups/2026-10-21-hire-reservation-flow.html`. No redesign or design-token changes are approved.

## Approach

Use targeted Postgres transactions plus focused changes to existing service/UI boundaries. Deliver PDS integrity first, external hiring second, and training third. Preserve row IDs and fields the editor does not own. Detect stale state, failed loads, zero-row writes, and uncertain outcomes instead of reporting success.

The user approved the plan and this model pair with “go ahead and build”:

| Responsibility | Exact model/effort | Verified connection |
| --- | --- | --- |
| Planning, coordination, review | `openai/gpt-6.1-sol#medium` | OpenAI OAuth |
| Implementation and tests | `deepseek/deepseek-flash#max` | DeepSeek API key; catalog identity DeepSeek V4.1 Flash 1017 |

The current session API reports Sol/medium. Both providers are active and both selected efforts are advertised. No alternate/free/Pro model substitution is authorized.

OpenAI owns this plan, progress tracking, diff review, and independent verification. DeepSeek owns source, migrations, tests, and implementation corrections. Builders run sequentially with explicit path ownership and may not commit, push, deploy, spawn helpers, or call live services. Parent reviews and commits logical stops. At most two unsuccessful corrective dispatches per task; then stop and ask.

## Steps

The full step-by-step contracts are in the approved specification; execution briefs are extracted from it for each task.

| Task | Owned change boundary | Depends on | State |
| --- | --- | --- | --- |
| 1 | `personalDataSheet.ts`, employee types, PDS section, focused validation/preservation tests | Baseline | Complete |
| 2 | PDS RPC service integration, scalar mapper if needed, CLI-generated migration, SQL/concurrency tests | 1 | Complete; production migration applied and REST reads passed |
| 3 | Checked profile writes, nullable numeric clears, local-only parent callback, wizard/draft behavior | 1, 2 | Complete; production frontend deployed; authenticated save/browser acceptance outstanding |
| 4 | PDS load/retry/conflict/uncertain states and canonical save snapshots | 2, 3 | Complete (`c96658b`; verified in Release Unit 1) |
| 5 | Succession evidence query/schema mismatch and PDS downstream regressions | 1–4 | Complete (`313cb25`; verified in Release Unit 1) |
| 6 | External hire RPC (strict reserve-then-hire), browser/backend routing, redirect `RSPDashboard` Ranking Report bypass to `/admin/rsp/for-hiring`, SQL/concurrency/service/backend tests | Phase 1 | Complete (`8d7de60`; verified in Release Unit 1) |
| 7 (7A) | CLI-generated Phase 2 migration (active identity unique indexes, durable `must_change_password`, `employee_password_resets.request_id`, `reset_employee_portal_password` RPC), SQL/concurrency tests | 6 | Complete (`53ace5d`; verified in Release Unit 1) |
| 7 (7B) | Create-only provisioning, `recruitmentData.ts` remote allocator, metadata consumers, password-free promotional drafts, hiring callers/backfills, unrouted `QualifiedApplicantsPage` hygiene | 7A; Credential Task 1 interfaces | Complete (`229ff64`; verified in Release Unit 1) |
| 8 | Atomic calendar/session/competency saves and lock/replay safeguards | Joint Phase 2/credential acceptance | Pending |
| 9 | Attendance/evaluation/archive failure states and versioned partial score patches | 8 | Pending |
| 10 | Cross-boundary smoke tests, isolated database acceptance, full checks, branch review | Joint PDS/hiring checkpoint plus final training completion | PDS/hiring checkpoint complete (`56c6262`); live two-profile browser acceptance Blocked; Training Tasks 8–9 and final completion pending |

Execution ledger: `.superpowers/sdd/2026-11-17-persistence-integrity-repairs/progress.md` in this isolated worktree. It records task baselines, child identities, review verdicts, corrective counters, and plan-conflict rulings.

### Credential coordination addendum (2026-11-19; 2026-11-20 logic-audit amendments)

**Companion:** `2026-11-19-employee-credential-consistency.md`. The user requested coordination of both plans. These amendments settle their ownership/dependency conflict and resolve logic-audit gaps F1–F6; they do not start implementation or authorize production activity. The credential plan remains Draft pending implementation approval. Preserve the previously approved model/effort choices for the original persistence tasks; do not assume they authorize dispatch of new credential tasks.

**Source of truth:** This addendum owns shared provisioning/reset interfaces, durable first-password state, writer ownership, ordering, and release gates. The credential plan owns its remote-authentication/self-change/UI task details. Its Task 1 defines `PortalAccountIdentity`, `PortalAccountResult`, and checked account reads; its Task 2 defines `PortalCredentialTarget` and mutation failure kinds. The original external specification still owns PDS, appointment, and training behavior. In an interface or release-order conflict, this addendum wins; do not implement two variants.

#### Shared credential rules

1. The durable credential identity is the portal account's immutable text `id` plus the canonical `employees.employee_number` carried in `employee_portal_accounts.employee_id`. Employee UUID, application UUID, email, username, and employee number are not interchangeable.
2. Account discovery, HR account lists, promotional prefill, provisioning identity reuse, and reset lost-response verification read remote **metadata**, never cached passwords. An existing account is displayed as existing; its password is neither fetched for recovery nor printed/emailed again (and never selected during reset lost-response verification).
3. Provisioning may only insert a missing account. Employee self-change and an explicitly confirmed HR reset are separate mutation paths. A retry of hiring, startup repair, credential printing, or contact/profile hydration cannot rename an account or change its password.
4. Employee self-change and HR reset use a loaded `PortalCredentialTarget = { accountId, employeeNumber, expectedRevision }`, where the revision is the canonical account `updated_at`. Require exact identity and revision; never retarget by mutable username or email. Treat `expectedRevision` (`updated_at`) as an **opaque raw string** returned by Postgres—never round-tripped through `new Date(...).toISOString()` before equality filtering, so microsecond precision is preserved.
5. Only a confirmed create or confirmed explicit reset may return a newly generated temporary password to its initiating UI. A conflict/replay/uncertain create returns no password. Keep temporary credentials in memory only; clear them on dismissal, unmount, identity change, and explicit cancellation. Redact them from logs, summaries, persisted caches, and generic result serializers.
6. All supported credential writers strictly advance `updated_at` monotonically. Client PostgREST writers (Credential Task 2) compute `new Date(Math.max(Date.now(), Date.parse(expectedRevision) + 2)).toISOString()` so sub-millisecond microseconds cannot tie or move backward; `reset_employee_portal_password` computes `GREATEST(clock_timestamp(), existing.updated_at + interval '1 millisecond')` so server writes strictly advance even after a fast browser clock. Lost responses trigger bounded verification, not automatic reset/reissue, credential regeneration, or “old password still works” promises. A concurrent later credential change is not silently overwritten. For dropped reset responses, `reset_employee_portal_password` persists a client-supplied `p_request_id` on `employee_password_resets.request_id` (zero previous/new passwords recorded), and bounded recovery reads `(account_id, request_id)` metadata plus active account metadata (never `password`) to confirm whether that exact request committed.
7. Retire credential-cache authority only after **all** consumers below are converted—including removing `localStorage.getItem('cictrix_employee_portal_accounts')` from `src/lib/recruitmentData.ts` (`createEmployeeNumberAllocator`) and removing the `!currentUser.supabaseId` `updateEmployeePortalEmployee` cache fallback in `src/modules/employee/EmployeePage.tsx` (which otherwise writes back to `cictrix_employee_portal_accounts` and re-injects hardcoded `DEMO_ACCOUNT`). Preserve unrelated browser state; remove only obsolete matching credential entries after a confirmed operation or login. Cache cleanup failure cannot invalidate confirmed durable success.
8. No automatic welcome-email sends on replay, reset, or recovered/uncertain creation. Any actual email remains a separately confirmed action after confirmed new creation.
9. Preserve the existing first-password requirement across fresh browsers: new provisioning and confirmed HR resets set a durable `must_change_password` flag; only a confirmed employee password change clears it, atomically with that password/revision. A username change, hire replay, metadata refresh, or cache cleanup cannot clear the flag. This is persistence of an existing workflow, not a claim of server-enforced session revocation or complete authorization security.
10. **TypeScript narrowing (`"strict": false`).** Because `tsconfig.json` compiles with `"strict": false` (`strictNullChecks: false`), callers checking discriminated union results (`PortalAccountResult`, `PortalAccountProvisionResult`, `PortalCredentialChangeResult`, `PortalPasswordResetResult`, `PdsResult`) must check `res.ok === true` / `res.ok === false` explicitly (or use explicit type guards) rather than relying on `if (!res.ok)` narrowing.

#### Provisioning and reset contracts

Persistence Task 7 **replaces** the original `ensureEmployeePortalAccount(nextAccount)` signature with the following contract in `src/lib/employeePortalData.ts`:

```ts
type PortalAccountProvisioningInput = {
  employee: Employee; // employeeId is the confirmed canonical employee number
  requestedUsername: string;
};
type PortalIssuedCredential = { username: string; password: string };
type PortalAccountProvisionResult =
  | { ok: true; created: true; account: PortalAccountIdentity; credentials: PortalIssuedCredential }
  | { ok: true; created: false; account: PortalAccountIdentity }
  | { ok: false; kind: 'invalid_employee' | 'account_conflict' | 'unavailable' | 'unconfirmed'; error: string };

ensureEmployeePortalAccount(input: PortalAccountProvisioningInput): Promise<PortalAccountProvisionResult>;
```

The service verifies the employee identity and queries active remote account metadata first. If an account exists, return `created: false` without calling `createPassword`, changing its username, reading its password, or writing it. A confirmed missing account permits generating one candidate internally and attempting an insert, never an upsert. `requestedUsername` is a proposal, not permission to rename an existing account. A different employee's username collision is `account_conflict`, not a randomized/reassigned identity.

Database uniqueness arbitrates concurrent inserts. On a uniqueness conflict, reread metadata by canonical employee number and return existing only if that identity is unambiguous; otherwise refuse. After an insert response is lost, a bounded metadata read may confirm an existing account but **cannot prove this caller created it**: return `created: false` with no credentials, or `unconfirmed` if verification fails. Do not surface the candidate password from that uncertain request.

Credential Task 4 produces the following explicit HR-reset service, consuming the migration-owned RPC described below:

```ts
type PortalPasswordResetResult =
  | { ok: true; account: PortalAccountIdentity; credentials: PortalIssuedCredential }
  | { ok: false; kind: PortalCredentialFailureKind; error: string };

resetEmployeePortalPassword(target: PortalCredentialTarget): Promise<PortalPasswordResetResult>;
```

Only the service generates the candidate temporary password after checked target resolution and an explicit UI confirmation, along with a per-attempt client `requestId = crypto.randomUUID()` passed as `p_request_id`. An existing-row reset preserves account ID, employee number, and the employee-chosen username. It does not create a missing account. On a lost response, perform one bounded metadata-only read of `employee_password_resets` by `(account_id, request_id)` plus an active `employee_portal_accounts` metadata read (never selecting `password`): return `{ ok: true, account, credentials }` only if that exact `(account_id, request_id)` row exists, return `conflict` if absent and `updated_at` advanced past `expectedRevision`, otherwise return `unconfirmed` with no secret and never generate a second password automatically. This service is not a provisioning fallback.

#### Persistence Task 7 additions and exact ownership

**Owns:** **Task 7A** (CLI-generated Phase 2 schema migration and `portal_account_lifecycle` SQL/concurrency tests, run **before** Credential Task 1) and **Task 7B** (create-only provisioning and metadata-list integration in `employeePortalData.ts`; `recruitmentData.ts` (`createEmployeeNumberAllocator`), `hiringFlow.ts`, `GenerateCredentialsPage.tsx`, `NewlyHiredPage.tsx`, unrouted `QualifiedApplicantsPage.tsx`, RSP provisioning/account-list sections, `ApplicantWizard.tsx` metadata prefill and its `flow/applicationDrafts.ts` serializer, and `hiredApplicantSync.ts`, run **after** Credential Task 1). Coordinate shared-file edits sequentially with the credential tasks. No simultaneous builders edit these files.

**Task 7A (Phase 2 migration and SQL/concurrency tests, before Credential Task 1):**

- [ ] Audit metadata constraints immediately before authoring the Phase 2 migration. The read-only 2026-11-19 snapshot found 137 active accounts, zero active missing employee numbers, zero duplicate active employee-number groups, and zero duplicate active normalized-username groups. Existing indexes enforce primary ID and case-sensitive username uniqueness only; employee-number and lower-username indexes are not unique.
- [ ] In the CLI-generated Phase 2 migration, add `must_change_password boolean NOT NULL DEFAULT false`, unique active-account indexes on `btrim(employee_id)` (non-null active employee IDs) and `lower(btrim(username))` (active usernames), retaining existing stricter constraints, and `employee_password_resets.request_id uuid` with partial unique index `employee_password_resets_request_id_uidx` (`WHERE request_id IS NOT NULL`). Do not infer historical first-change state from browser caches or force-reset all existing accounts: default false preserves existing access; newly provisioned/reset accounts explicitly set true. Suggested account index names: `employee_portal_accounts_active_employee_number_uidx` and `employee_portal_accounts_active_username_uidx`. Recheck for duplicate/blank/ambiguous identity blockers; fail migration preflight rather than deleting, merging, renaming, or issuing credentials to repair data automatically.
- [ ] The same migration owns `reset_employee_portal_password(p_account_id text, p_employee_number text, p_expected_updated_at timestamptz, p_new_password text, p_actor_user_id uuid DEFAULT NULL, p_request_id uuid DEFAULT NULL) RETURNS jsonb`. Use `SECURITY INVOKER`, schema-qualified objects, narrow execute grants and explicit PUBLIC revoke. Verify active RSP/ADMIN actor identity using the same verified-token/service-backed actor rules as Task 6, not caller-supplied email. No new broad grants or policy weakening.
- [ ] The reset RPC checks the existing active row's identity/revision, updates only password, `must_change_password = true`, and a strictly advanced monotonic server-side timestamp `GREATEST(clock_timestamp(), existing.updated_at + interval '1 millisecond')`, and writes `employee_password_resets` audit metadata including `request_id = p_request_id` in the same transaction (rejecting duplicate `p_request_id` via uniqueness without silently applying a second reset). No previous/new password enters the audit row. Return only `{ account_id, employee_number, username, updated_at, must_change_password }`; audit failure rolls back the reset. Reject missing/deleted/mismatched/stale targets and unauthorized actors before writes.
- [ ] Add `supabase/tests/portal_account_lifecycle.test.sql` and `supabase/tests/portal_account_lifecycle_concurrency.sh`: two account-create contenders produce one account; username collision cannot target another employee; reset/auth-role/audit failures roll back password/flag together; two same-revision resets produce one winner; `p_request_id` persists and uniqueness blocks replay; timestamps strictly advance even when an existing row has a future `updated_at` (clock-skew regression); identity and username remain unchanged. Test durable new/reset first-change state and its preservation on replay/rename. Test anonymous callers, forged actor parameters, unauthorized authenticated actors, authorized RSP/ADMIN, and verified service-backed actors, not only owner execution.

**Task 7B (Provisioning, remote metadata consumers, and hiring callers, after Credential Task 1):**

- [ ] Implement `ensureEmployeePortalAccount` above with tests in `src/lib/employeePortalData.provisioning.test.ts`. Add explicit assertions that replay does not call the password generator or download an existing password; racing/uncertain losers return no secret.
- [ ] Update `src/lib/recruitmentData.ts` (`createEmployeeNumberAllocator`): remove its direct `localStorage.getItem('cictrix_employee_portal_accounts')` read and duplicate `employees_with_department` query, and query remote `employee_portal_accounts` (`employee_id` where `deleted_at IS NULL`) with checked error propagation so employee-number allocation never depends on browser storage.
- [ ] Update every provisioning entry point to consume the new result, preserving the strict reserve-then-hire contract (`complete_external_hire` requires `For Contract Signing` + a reserved open plantilla slot; legacy slotless applications return `slot_missing`, unreserved applications return `not_reserved`). In Task 6/7, replace `RSPDashboard.tsx`'s unreserved Ranking Report direct-hire modal bypass (`showHireApplicantsModal`) with navigation to `/admin/rsp/for-hiring`, and update unrouted `QualifiedApplicantsPage.tsx` to consume `completeExternalHire` + `ensureEmployeePortalAccount` and surface `not_reserved` / `slot_missing` honestly without writing `Hired` or credentials on refusal. `GenerateOutcome` in `hiringFlow.ts` gains `existingAccounts: Array<{ applicantId: string; employeeNumber: string; accountId: string; username: string }>`; preserve existing `credentials`, `promotions`, `failures`, and `unconfirmed` fields. `CredentialResult` gains required `username: string`, populated from the confirmed credential receipt rather than assuming employee number equals username. Only `created: true` contributes printable credentials. Existing-account outcomes show success/next steps without a blank/fabricated temporary password. Update all fixtures, rendering, and print/email controls that consume this outcome.
- [ ] `NewlyHiredPage` stops deciding account identity or number reuse from the local credential cache. Resolve the already-confirmed hire/employee number remotely before proposing account creation; never allocate another employee number because an account is absent from this browser. Do not persist or print pre-generated candidate credentials before `ensureEmployeePortalAccount` confirms creation.
- [ ] RSP account lists and promotional prefill use Task 1's checked remote metadata API. `RSPDashboard.tsx`'s directory loads all active non-deleted account metadata via `listEmployeePortalAccountIdentities()` (unfiltered call, password excluded) so active portal accounts without an `employees` row remain discoverable without browser storage, while targeted callers (such as `NewlyHiredPage`) pass explicit `employeeNumbers`. Metadata errors are unavailable, not an empty roster or permission to generate a second account. Do not fetch the password column for those reads.
- [ ] Change the promotional authentication result's public account value and wizard/draft account type to `PortalAccountIdentity`, preserving identifier support and existing error codes. Private authentication may compare the password, but persisted wizard state cannot include it. Sanitize the account field of old/new application drafts on both load and save with an identity allowlist, preserving unrelated form answers and choices. Restored metadata is not authentication proof. Extend `src/modules/applicant/flow/applicationDrafts.test.ts` (create if absent) and promotional tests to prove password stripping and continued prefill/authentication behavior.
- [ ] Replace cached-password reads/credential upserts in every discovered provisioning path. Keep the legacy upsert export only as a temporary internal dependency of the two reset UIs until Credential Task 4 replaces them; this intermediate state is not releasable.
- [ ] Extend `src/components/GenerateCredentialsPage.test.tsx`, add `src/components/NewlyHiredPage.credentials.test.tsx`, `src/components/QualifiedApplicantsPage.credentials.test.tsx`, and `src/modules/admin/RSPDashboard.accounts.test.tsx`; extend `src/modules/applicant/ApplicantWizard.promotion.test.tsx`, `src/lib/hiringFlow.external.test.ts`, and `src/lib/hiringFlow.promotion.test.ts`. Use an independently changed remote credential fixture at this task's checkpoint, then replay the hire from stale/empty browser storage and assert unchanged remote password, account ID, employee number, no credential output, no new employee, and no email. Credential Task 5 repeats the scenario with the actual self-change service after it exists.

Task 7's TDD cycle remains mandatory: run each new behavioral test red before its implementation and green afterwards. Its targeted run is `npx vitest run --dir src src/lib/employeePortalData.provisioning.test.ts src/lib/hiringFlow.external.test.ts src/lib/hiringFlow.promotion.test.ts src/components/GenerateCredentialsPage.test.tsx src/components/NewlyHiredPage.credentials.test.tsx src/components/QualifiedApplicantsPage.credentials.test.tsx src/modules/admin/RSPDashboard.accounts.test.tsx src/modules/applicant/ApplicantWizard.promotion.test.tsx src/modules/applicant/flow/applicationDrafts.test.ts`. Then run the exact lifecycle SQL file with `psql -X -v ON_ERROR_STOP=1 -f supabase/tests/portal_account_lifecycle.test.sql` and the concurrency harness with `bash supabase/tests/portal_account_lifecycle_concurrency.sh`, using only a verified disposable database/container as required by Task 10.

Credential Task 4 owns conversion of the two **explicit reset** UIs (`RSPDashboard.tsx`, plus unrouted `modules/admin/components/EmployeeDetailPage.tsx`—which is only imported by `EmployeeDirectory.tsx` with no route in `App.tsx`, so it is updated and unit-tested for hygiene without being treated as a live routed browser-acceptance screen), reset-service tests, and final targeted credential-cache retirement. It removes the now-unused destructive credential-upsert export/helper after a full caller/import scan. It does not rewrite hiring or admin Settings.

#### Unified execution order and worktree

Prepare one fresh `fix/persistence-credential-integration` worktree from then-current production `upstream/main` after execution approval. Carry these two coordinated plans and relevant planning records; preserve existing worktrees. Keep one writer at a time on shared paths, and do not cherry-pick the whole `fix/real-password-changes` branch.

| Order | Work | Required handoff |
| --- | --- | --- |
| 1 | Persistence Tasks 4–5 | Complete remaining PDS load/conflict/uncertain UI and `successionPipelineV2.ts` `company_name`/evidence-error fix; preserve deployed Tasks 1–3. |
| 2 | Persistence Task 6 | Atomic replay-safe external appointment RPC (`complete_external_hire`, strict reserve-then-hire contract), browser/backend routing, and redirecting `RSPDashboard`'s unreserved Ranking Report hire bypass to `/admin/rsp/for-hiring`. |
| 3 | Persistence Task 7A | CLI-generated Phase 2 migration (active identity unique indexes, durable `must_change_password`, `employee_password_resets.request_id`, `reset_employee_portal_password` RPC with `GREATEST(...)` timestamp) plus `portal_account_lifecycle.test.sql` and concurrency harness. |
| 4 | Credential Task 1 | Checked remote reads/authentication (`must_change_password` already present in branch migrations), unfiltered & scoped metadata list API, and shared identity/revision types; local only, no cutover. |
| 5 | Persistence Task 7B | Create-only `ensureEmployeePortalAccount`, `recruitmentData.ts` remote allocator fix, remote metadata consumers (`RSPDashboard`, `NewlyHiredPage`, `ApplicantWizard`/password-free drafts), `hiringFlow.ts`, `GenerateCredentialsPage`, unrouted `QualifiedApplicantsPage` hygiene, and `hiredApplicantSync.ts`. |
| 6 | Credential Tasks 2–3 | Confirmed self-changes (opaque raw-string `expectedRevision`, `+2ms` advance) and awaited `EmployeePage` (removing `!currentUser.supabaseId` `updateEmployeePortalEmployee` cache fallback) / `SetInitialPasswordPage` / `App.tsx` session sync. |
| 7 | Credential Task 4 | Checked explicit HR reset service (`requestId`-based metadata readback), `RSPDashboard.tsx` reset modal, unrouted `EmployeeDetailPage.tsx` unit-tested hygiene, full caller scan, and final cache-authority retirement. |
| 8 | Credential Task 5 + Persistence Task 10 PDS/hiring checkpoint | Joint cross-boundary acceptance and Release Unit 1 gate. |
| 9 | Persistence Tasks 8–9, then Task 10 final | Release Unit 2: training repair (including opaque raw-string `training_evaluations.updated_at` handling in Task 9) and final integration acceptance; Task 10 is not Done after only the first checkpoint. |

The original Task 4 brief remains valid for its PDS behavior, and no new implementation or delegation was launched by these amendments.

#### Joint production release gates

**Release unit 1:** all remaining PDS/hiring work (Persistence Tasks 4–7) and Credential Tasks 1–5, including their PDS/hiring integration checkpoint. They may be developed/committed in steps, but do not release the shared module halfway through this sequence. **Release unit 2:** training Tasks 8–9 plus final Task 10, after its independent gates. Deployed Tasks 1–3 stay deployed; this is not permission to repeat their migration.

- [ ] The writer/reader inventory above—including `recruitmentData.ts` (`createEmployeeNumberAllocator`) and `updateEmployeePortalEmployee`—is closed by a caller/import scan: no supported hiring/reset/login/profile path uses cached passwords as authority, writes back to `cictrix_employee_portal_accounts`, reissues an existing credential, or imports the retired credential upsert. Backend/startup/hiring paths retain their own identity/transaction tests.
- [ ] A real isolated database and PostgREST run proves constraints, rollback, invoker behavior, authorized/unauthorized actors, concurrency, and reset-audit atomicity. Apply the exact CLI-generated migrations in a disposable environment. Missing Docker/schema parity/HTTP fixtures means Blocked, not “frontend passed.”
- [ ] Two isolated browser contexts pass the complete lifecycle: new hire → confirmed account creation → sign-in/required first-password change → self-change → stale-cache hire replay → second-browser sign-in → confirmed HR reset → stale self-save conflict → required post-reset password change → username change → promotional prefill/login → startup reload. Assert stable account/employee IDs, durable first-change routing in both profiles, no old-password authentication, no repeated credential card/email, correct revised username/session, and no extra employee/newly-hired row.
- [ ] Drop responses separately after appointment commit, account insert, self-change, and reset. A retry/verification may resolve state (with HR reset lost-response confirmation verified via `employee_password_resets.request_id` metadata rather than reading `password`) but cannot create a new employee/account, replay a reset, recover a stored password for printing, or resend an email.
- [ ] Run each plan's focused suites, full `--dir src` suite, TypeScript, zero-warning lint, build, migration check, Python external/promotion tests, SQL/concurrency suites, whole-unit review, and touched-UI checks. Record actual artifacts/commit SHAs; a known failed or unrun **in-scope** acceptance item blocks release.
- [ ] Recheck staging/production project separation, migration order, target identities, uniqueness/provenance preflight, and changed writer inventory. Additive Phase 2 constraints/RPCs must be applied through PR integration and verified before the new callers are promoted. Missing RPCs produce unavailable errors, never legacy direct-write fallbacks.
- [ ] Prepare the single-account reconciliation and cutover procedure before promotion. Any approved reconciliation of local-only credentials happens in a controlled window before remote-only login is promoted, with the tested HR recovery path ready. Do not automatically copy browser secrets, bulk-reset users, or promise an inventory of unknown browser caches. Obtain explicit approval for the cutover's impact on local-only users.
- [ ] Push/PR/merge/deployment, live account reconciliation, and real email sends each retain their applicable approval requirements. Do not roll back to destructive credential-upsert or cache-login code after schema/client changes; on failure stop affected actions and ship a reviewed forward correction.
- [ ] Track existing security findings separately: plaintext credential exposure, permissive grants/RLS, legacy clients able to issue raw writes, server-enforced route/operation authorization, and session revocation are **not** cleared by these plans. Durable first-password persistence/routing is included, but browser routing is not a server authorization barrier. The release record must not claim prevention against arbitrary/old raw API writers or production-security sign-off. Any newly discovered in-scope defect or a security finding materially worsened by the change blocks release pending a reviewed resolution.

**Resolved planning dependency, not verified implementation:** owner/interface/ordering decisions are now explicit. Every implementation/test/release checkbox above remains open until actual execution evidence exists.

## Risks

- Existing permissive RLS/grants are verified and remain a separate security issue. New invoker RPCs may not elevate privileges or weaken policies.
- Missing Docker daemon or local Postgres blocks actual transaction/concurrency acceptance. Do not use production as a substitute or report mocked tests as database proof.
- Legacy hiring provenance can be ambiguous. Refuse rather than merge people, invent another employee, or rotate existing credentials.
- Succession reviews reference source IDs; PDS reconciliation must preserve them.
- Breaking service contracts require all active callers and fixtures to change together. Small compatibility integration changes belong to the task that changes the contract.
- New migration files must be CLI-generated and applied through PR integration only. No MCP/dashboard application.
- No additional push, deployment, production data repair, actual email, or real credential issuance is authorized by this coordination. The earlier Tasks 1–3 deployment is historical and does not authorize future releases.

## Checks to run

- `npx tsc --noEmit`
- `npx vitest run --dir src` plus each task's targeted regression tests.
- `npm run lint`
- `npm run build`
- `npm run check:migrations`
- `git diff --check`
- Isolated SQL rollback, permission, trigger, concurrent-connection, and lost-response tests from the approved specification.
- Backend external-hiring and existing promotional-hiring unittest suites with local synthetic settings and mocked external calls.
- Rendered UI/keyboard/responsive checks and `DESIGN_IDENTITY.md` section 16 for affected surfaces.

Baseline and final results are recorded in the ledger; only observed passing checks count. Repository test discovery otherwise includes old nested worktrees, so use `--dir src`.

### Task 1 checkpoint

Education grouping/editor preserves repeated qualifications and Doctorate. All seven PDS list saves reject meaningful incomplete rows before external writes; wholly blank new placeholders remain allowed. Row/field validation errors use the existing feedback surface. No migrations or transactional save changes are included yet.

DeepSeek/max implemented; parent Sol/medium reviewed and independently verified 172 files/1,619 tests, TypeScript, scoped lint, production build, and diff whitespace checks. No corrective dispatches. Database atomicity and rendered-browser acceptance remain for later tasks. See `docs/session-summaries/2026-11-17-persistence-integrity-task-1-summary.md`.

### Task 2 checkpoint

Replaced PDS list delete/reinsert services with canonical snapshot/revision RPC calls. Authored invoker reconciliation migration and rollback, permission, membership, and two-session tests; family/background scalar changes now share the list save request. Existing IDs and unowned metadata are retained by the transaction design. No legacy fallback remains.

Parent reviewed the full changes and two corrections, and independently verified 172 files/1,630 tests, targeted 30 tests, TypeScript, scoped lint, production build, migration versions, shell syntax, and whitespace. PostgreSQL compilation, rollback, permissions and concurrency have **not run** because Docker is unavailable; Task 2 is not fully accepted or release-ready. Further local implementation may proceed under the recorded preflight ruling, but this database gate must close before release.

Docker later became available: the exact migration compiled and the SQL suite passed on the older isolated local schema. After reproducing the known live required employee columns, both unmodified suites failed on missing `department` in their fixtures. Concurrency and production-shaped permission acceptance remain open; Docker availability is no longer the immediate blocker.

### Task 3 checkpoint

Profile saves now check the returned employee row before updating local state; clearing height/weight writes null, and PDS does not write twice through its parent. Unsaved drafts survive unrelated saves, previous-employee lists/revisions are cleared, and setup saves await confirmation before advancing. Optional Skip still permits closing after an attempted partial save, with failures shown.

Parent reviewed the implementation and independently reran 52 affected tests, the full 173-file/1,645-test suite, TypeScript, scoped lint, and production build at completion. Real PostgREST and rendered-browser acceptance remain outstanding. See `docs/session-summaries/2026-11-17-persistence-integrity-task-3-summary.md`. Task 4 is not started.

### Approved review corrections (2026-11-19)

User requested DeepSeek Flash/max to fix the independent review findings. Keep the approved parent Sol/medium and builder `deepseek/deepseek-flash#max` roles. This is correction of Tasks 1–3, not Task 4 implementation.

1. Reproduce and fix canonical family/background scalar values reverting on an unrelated profile update. Keep section snapshots and revisions consistent, without an extra write or loss of dirty edits.
2. Reproduce and reject fractional education years/units instead of truncating them in input handlers.
3. Reproduce delayed mutation responses across employee identity changes; prevent obsolete responses from changing drafts, lists, revisions, feedback, saving state or parent profile, including A→B→A identity reuse.
4. Correct both SQL/concurrency employee fixtures for required production-shaped department/position columns, and isolate the no-visible test from all applicable permissive employee policies inside its rolled-back test transaction. No production policies, privileges or migration changes.
5. Verify focused regressions, TypeScript, lint/build/full tests and both exact database suites on the owned isolated Docker database. Parent independently reviews and reruns acceptance before committing.

Owned correction paths: `src/modules/employee/PersonalDataSheetSection.tsx` and its persistence tests; minimum `employeePortal`/`EmployeePage` integration tests/source only if required for these findings; `supabase/tests/pds_section_transactions.test.sql` and `supabase/tests/pds_section_concurrency.sh`. No redesign, packages, scoring/authentication changes or unrelated refactors.

Corrections implemented by DeepSeek Flash/max and reviewed by parent Sol/medium. Parent independently verified 53 focused tests, 173 files/1,671 full-suite tests, TypeScript, scoped lint, production build, migration versions, shell syntax and whitespace. The three code findings have regression coverage; the two database-test corrections are authored but not database-accepted because Docker's Linux engine pipe is unavailable again. See `docs/session-summaries/2026-11-19-persistence-review-corrections-summary.md`. Task 4 remains pending.

Subsequent Docker retry: parent ran the exact migration, revised SQL suite and revised two-session concurrency harness successfully against the owned isolated database. Required department/position columns and both permissive employee policies were reproduced. Actual lock contention and stale rejection were observed; winner ID and revision matched the final read. This closes the scoped local SQL/concurrency gate, not full production-schema, ownership-security, HTTP/PostgREST or rendered-browser acceptance. Schema restore limitations and synthetic cleanup are recorded in the correction summary. Nothing applied to production.

### Production deployment and read-only smoke checks

PR #107 was merged to `main` as `bbb196c` after resolving the generated plans-index conflict against `upstream/main`. Vercel reported success for the production deployment; the served bundle includes both PDS RPC names. The Supabase migration `20261117101141_pds_section_transactions` is recorded in production and both functions exist as `SECURITY INVOKER`.

Production read-only checks:

- Public landing page and `/employee/login` loaded with no browser console errors.
- `read_pds_section` returned rows, a revision, and section scalars for all seven sections using the public publishable key.

Not claimed: authenticated employee saves in production, production SQL rollback/permission suites, or a full production-schema clone. The plan's no-production-data-mutation constraint was preserved; no synthetic production employee was created or edited.

### Release Unit 1 Checkpoint (Orders 1–8)

Orders 1–8 completed Release Unit 1 code, migration, cross-boundary Vitest acceptance, isolated database/concurrency, and ephemeral PostgREST HTTP checks on `fix/persistence-credential-integration`:

- **Commits (`0dd8dd4..56c6262`):**
  - Order 1a (Task 4): `c96658b` (`fix(pds): distinguish unavailable records from empty sections`)
  - Order 1b (Task 5): `313cb25` (`fix(succession): retain and validate PDS evidence reads`)
  - Order 2 (Task 6): `8d7de60` (`fix(hiring): make external appointments atomic and replay-safe`)
  - Order 3 (Task 7A): `53ace5d` (`feat(employee): add portal account integrity constraints and reset rpc`)
  - Order 4 (Credential Task 1): `96e4863` (`fix(employee): make connected portal login remote authoritative`)
  - Order 5 (Task 7B): `229ff64` (`fix(hiring): preserve credentials and confirmed completion across callers`)
  - Order 6 (Credential Tasks 2–3): `4cf6034`, `b5c5b50` (`fix(employee): confirm remote credential changes and synchronize session usernames`; `fix(employee): guard account-tab generation and re-resolve on entry`)
  - Order 7 (Credential Task 4): `3d63f49` (`fix(employee): verify explicit resets and retire credential cache authority`)
  - Order 8a (Credential Task 5 + Task 10 PDS/Hiring checkpoint smoke tests): `56c6262` (`test(integrity): add release unit 1 cross-boundary acceptance suites`)
- **Verified checks post-`56c6262`:** `npx tsc --noEmit` (0 errors); `npx vitest run --dir src` (`192` files / `1,815` tests passed); `npm run lint` (0 errors, 0 warnings); `npm run build` (`3156` modules); `npm run check:migrations` (`133` files); `python -m unittest backend/test_external_hiring.py backend/test_promotional_hiring.py` (`30` tests `OK`); `git diff --check` clean; production `src/` caller scan confirmed zero references to retired cache helpers; isolated Postgres SQL/concurrency suites passed on `cictrix-integrity-e1aa71a5` (`pds_section_transactions.test.sql` + `pds_section_concurrency.sh` on `integrity_repairs`; `external_hire.test.sql` + `external_hire_concurrency.sh` and `portal_account_lifecycle.test.sql` + `portal_account_lifecycle_concurrency.sh` on `external_hire_test`; `promotional_appointment.test.sql` hit `23505` on `rej6` duplicate `employee_id` fixture enforced by Order 3's unique index); ephemeral `public.ecr.aws/supabase/postgrest:v16.5` HTTP acceptance confirmed role denials (`401`/`403`/`42501`), RSP reset + secret-free audit read, `40001`/`23505` rejections, and `read_pds_section`/`save_pds_section` round-trip + `40001` conflict.
- **Explicit non-completion & blockers:** Task 10 is **not** final Done until Release Unit 2 (training Tasks 8–9 + final Task 10 integration acceptance) completes. Live two-profile rendered browser acceptance against a full disposable Auth+Kong+PostgREST stack remains **Blocked** locally (no Playwright dependency / no disposable GoTrue+Kong stack without modifying `supabase_db_cictrix-schema-test`). Production cutover, push/PR/deploy, and single-account reconciliation ([docs/handoff/employee-credential-reconciliation.md](../handoff/employee-credential-reconciliation.md)) remain separately approval-gated; see [docs/session-summaries/2026-11-19-employee-credential-consistency-summary.md](../session-summaries/2026-11-19-employee-credential-consistency-summary.md).
