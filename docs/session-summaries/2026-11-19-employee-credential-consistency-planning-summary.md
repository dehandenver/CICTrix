# Employee credential consistency: planning

## Delivered

Created the Draft implementation plan at `docs/plans/2026-11-19-employee-credential-consistency.md`. It covers checked remote authentication, confirmed remote credential changes, async employee settings/initial-password callers, cross-browser acceptance, and a separately authorized single-account reconciliation procedure.

The plan selectively reuses the employee portion of `fix/real-password-changes` rather than merging its unrelated admin Settings work. It explicitly rejects local-only credential fallbacks and addresses stale writes and lost-response uncertainty left open by that branch.

## Evidence and limits

The prior diagnostic run reproduced the cross-browser defect with actual service/login code and synthetic accounts; all diagnostic assertions passed. The matching existing branch corrected future persistence in that scenario. Neither run established the user's successful browser's stored credential history.

Planning inspected current service/callers, the existing branch and its plan/tests, the repository plan template, and the related security/persistence plans. No product code, production credential, or schema was changed. No implementation tests or browser acceptance are claimed by this planning summary.

## Approval

The new plan remains Draft. Implementation, execution method/model choice, and any eventual external operation remain subject to their respective approvals. Production account reconciliation is not authorized by creating or approving the implementation plan.

## Follow-up connection and logic audit

Fresh read-only checks found the same Supabase project in the served production bundle, the original project environment, and MCP. The public REST metadata read and MCP account/employee join agree on one active account linked to one active employee. No credentials were read into this summary and no live writes occurred.

The audit corrected a plan defect: password/username mutations now require immutable account ID plus expected employee number instead of targeting a mutable username. The plan adds username-reassignment and mismatched-identity regression requirements, including the initial-password caller's stable employee-number input.

The audit also found that cache eviction is not independent of HR reset/provisioning: existing consumers use cached accounts for identity reuse and can submit stale credentials. The Draft now blocks execution approval until its boundary with Task 7 of the persistence-integrity plan is settled, or the user explicitly approves a minimal consumer-scope expansion. No product fix or complete end-to-end guarantee is claimed.

## Coordinated amendment

The user's subsequent request to coordinate both plans settled that ownership choice. The persistence plan's Credential coordination addendum now owns create-only provisioning, identity indexes, a checked reset/audit RPC, remote metadata consumers, and the shared release contract. Credential Task 4 owns explicit reset callers and final targeted cache retirement; Task 5 shares cross-boundary acceptance with the persistence plan's Task 10 checkpoint.

Both plans now use the loaded account ID, employee number, and canonical revision for mutations. The original external specification and local execution brief/ledger point to the coordinated ordering rather than silently retaining the obsolete Task 7 signature.

The planning dependency is resolved, not implemented. Both execution/release gates and any production credential reconciliation remain subject to approval and actual evidence.

The coordinated migration now includes durable first-password state for the existing new-hire/reset workflow. The earlier Draft's deferral of that persistence gap is superseded: new/reset accounts set the flag, confirmed employee password changes clear it atomically, and existing accounts are not bulk-reset. Server-enforced authorization and session revocation remain outside this consistency repair.
