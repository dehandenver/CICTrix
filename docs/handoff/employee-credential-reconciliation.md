# Single-Account Credential Reconciliation & Cutover Runbook

## Scope and Preconditions

- **Target account (exact, single-account scope):**
  - Portal Account ID: `portal-EMP-CC334757`
  - Canonical Employee Number: `EMP-CC334757`
  - Last observed remote username: `ryanlopezcastro`
- **No secrets in documentation:** This procedure contains zero passwords, API keys, session tokens, or pasted credential values.
- **Unverified browser history:** The originating user browser's historical `localStorage` cache (`cictrix_employee_portal_accounts`) was never directly inspected. Any client-side password mismatch reported before this fix is inferred from the earlier `updateEmployeePortalEmployee` / cache-only persistence defect.
- **Why code deployment alone cannot fix an already-diverged credential:** Deploying remote-only authentication stops writing new passwords solely to `localStorage`, and targeted eviction clears obsolete browser entries after confirmed operations. However, it cannot upload or reconcile an unknown browser-only password into Postgres; if the remote `employee_portal_accounts` row still holds an older password, that browser will fail sign-in immediately once remote-only login is promoted unless an explicitly approved reconciliation occurs first.
- **Non-enumeration rule:** Never enumerate, bulk-reset, or alter any other demo or employee portal account (`employee01` or any other row), and never treat a browser's cached password entry as authoritative proof of ownership.

## Six Operational Gates

All six gates below are mandatory and approval-gated. Completing local code verification does not authorize any production push, cutover, SQL edit, or credential change.

### Gate 1 — Separate Approval for Code Delivery
1. Obtain explicit approval before pushing `fix/persistence-credential-integration`, opening a PR, merging, or deploying to staging/production.
2. Confirm Phase 2 additive migration `20261120195500_employee_portal_account_integrity.sql` (and earlier `20261120160156_external_hire_transaction.sql` / PDS RPC migrations) is applied through the approved PR/Supabase integration flow **before** promoting frontend callers that consume `must_change_password` and `reset_employee_portal_password`. Missing RPCs produce unavailable errors and never revert to client-side fallback writes.

### Gate 2 — Cutover Disclosure & Controlled Pre-Cutover Window
1. Before enabling remote-authoritative login in production, explicitly disclose to stakeholders that local-only/browser-cached accounts and hardcoded demo passwords (such as `employee01`) will stop authenticating immediately on cutover.
2. Obtain explicit operator sign-off for this cutover impact and verify that the tested HR recovery modal in RSP Dashboard is operational.
3. If reconciliation of `portal-EMP-CC334757` is explicitly approved, execute it inside a controlled pre-cutover maintenance window. Preserve unrelated active employee sessions and do not bulk-clear browser storage across users.

### Gate 3 — Separate Explicit Approval & Private Credential Confirmation
1. Request and record separate written authorization specifically naming `portal-EMP-CC334757` (`EMP-CC334757`, username `ryanlopezcastro`) for reconciliation.
2. Reconfirm the exact intended credential directly and privately with the authorized account owner/operator during the approved window. Never infer or assume the intended password from any value mentioned earlier in troubleshooting notes.

### Gate 4 — Approved Execution Path (Explicit HR Reset First, Never Legacy Upsert)
1. **Recheck target identity and revision first** via remote metadata read (`id`, `employee_id`, `username`, `updated_at`, `deleted_at`, `must_change_password`) confirming exactly one active row matches `id = 'portal-EMP-CC334757'` and `employee_id = 'EMP-CC334757'` with `deleted_at IS NULL`.
2. **Preferred path:** Execute the tested explicit HR reset path (`resetEmployeePortalPassword` -> `reset_employee_portal_password` RPC), handing the generated temporary credential through the approved private channel, followed immediately by an authorized sign-in through `/employee/set-password` where the owner sets their confirmed private password (clearing `must_change_password = false`).
3. **Prohibited paths:** Never use the retired legacy cache/upsert helper (`upsertEmployeePortalAccount` / `cictrix_employee_portal_accounts`), never insert a second row, and never rename `ryanlopezcastro` during reset.
4. **Contingency live SQL (only if separately approved when the HR UI path is unavailable):** Follow the repository's user-run Supabase Dashboard SQL Editor procedure (confirming the safety prompt), scoped strictly to `WHERE id = 'portal-EMP-CC334757' AND employee_id = 'EMP-CC334757' AND deleted_at IS NULL AND updated_at = '<observed_raw_updated_at>'` plus one secret-free `employee_password_resets` metadata row; preserve `id`, `employee_id`, and `username`; zero inserts/upserts, zero schema changes, zero `supabase_migrations` history edits, and never log or commit the secret.

### Gate 5 — Fresh Connected Verification & Secret Hygiene
1. Verify the reconciled credential via a fresh connected sign-in in a clean browser profile (confirming both authentication and expected post-login route).
2. Confirm that both the superseded credential and any stale cached `localStorage` copy cannot authenticate.
3. Keep all credentials out of browser screenshots, network captures, console logs, terminal history, handoff reports, and commits; do not transmit temporary or chosen passwords to any unapproved external email or messaging destination.

### Gate 6 — Stop-on-Conflict & Forward-Only Rollback Policy
1. If a concurrent `updated_at` conflict (`40001` / `revision_conflict`), identity ambiguity, duplicate `request_id` (`23505`), or zero-row update occurs at any step, **stop immediately** and recheck remote metadata before taking action; never broaden the `WHERE` predicate or repeat resets blindly.
2. Never roll back to a superseded/compromised password or re-enable legacy cache-login/upsert code on client failure; halt affected actions and ship a reviewed forward correction instead.
