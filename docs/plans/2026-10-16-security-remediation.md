---
title: Security remediation (credentials, document encryption, authorization and public applicant flows)
date: 2026-10-16
status: Draft
summary: Expanded by the October 27 review and succession scoring dependency; re-verified and critiqued 2026-11-02 against upstream main e110977 (F6/F7 corrected, F22–F25 added, Phase 1 planned in detail). On 2026-11-05 PR 98 removed the Supabase JWTs from tracked files, but the key is not rotated and F1 stays open. Contain leaked keys, replace browser-only credentials, enforce role and office authorization, and protect applicant flows, qualification evidence, review decisions and audit history.
---

> **Last updated 2026-11-05.** [PR 98](https://github.com/dehandenver/CICTrix/pull/98) removed the Supabase JWTs from tracked files (see [November 5 update](#november-5-update-leaked-key-files-removed)). The key isn't revoked, so F1 stays open, and nothing in Phase 1 has been executed.
>
> **2026-11-02.** Re-verified against upstream `dehandenver/CICTrix` main (`e110977`, public) and the live project: every Critical/High finding from October 27 is still open (see [November 2 re-verification](#november-2-re-verification)). The earlier analysis was also checked claim by claim (see [November 2 critique](#november-2-critique-of-the-plan)): F6 and F7 were overstated, and F24 and F25 are new. F25, a default backend JWT secret, may be Critical. Phase 1 is now planned step by step below and awaits approval; nothing in it has been executed.

## Goal

After this plan, someone holding only the public publishable/anon key (which every visitor's browser has) can read open job postings and public reference data, and start a controlled application submission. Access to an existing person's applications, resubmissions and documents requires verified ownership. A reference number or a typed email address is not proof of identity. Staff access requires a signed-in Supabase Auth user, and database policies and backend checks limit that user to their active role and assigned records.

The remediation remains **Draft**. The user approved the investigation and expansion of this document on 2026-10-27, not execution of the remediation phases. Review scope: trace code and live read-only security configuration, reproduce suspected flaws locally with synthetic data, add supported findings and checks, then update the session summary and generated dashboard. The later succession discussion authorized adding the focused succession access-control work below to this plan, not applying live permissions or starting the broader security rebuild.

## Findings this plan fixes

Original audit of 2026-10-15, read-only, against the repo and the live project `fyzdfgxaaowjzbjpwrii`. Counts below are historical unless explicitly refreshed in the October 27 section.

| Ref | Finding | Evidence |
|---|---|---|
| F1 | A `service_role` key with an expiry claim in 2036 was reported committed in public repos `Jayyoo07/CICTrix` and `dehandenver/CICTrix`. An active service-role key bypasses RLS and grants Auth admin access. Its expiry claim alone does not establish that it remains active. | October 27 local scan reconfirmed service-role JWTs in 25 tracked files: `VERCEL_DEPLOYMENT.md`, `.claude/settings.local.json`, 23 under `scratch/`. The leaked credential was not used to test current validity. *Update 2026-11-05:* removed from tracked files, not revoked. See [November 5 update](#november-5-update-leaked-key-files-removed). |
| F2 | October 27 catalog inspection found 80 public base tables with RLS off; 78 have all four anon SELECT/INSERT/UPDATE/DELETE grants. | Includes `employee_education`, `employee_history`, many `ipcr_*` tables, `succession_candidates`, `evaluations`, `supervisor_password_resets`. Original count was 76. `employee_documents` now has RLS enabled but still has open-access policies (F3). See the refreshed baseline for grant exceptions. |
| F3 | Tables that do have RLS on use allow-all policies (`using (true)`) for anon. | `employees`, `employee_portal_accounts`, `applicants`, `applicant_attachments`, `employee_children`, `idp_submissions`. `employees` exposes TIN, SSS, GSIS, PhilHealth, Pag-IBIG, birth date, addresses, emergency contacts. |
| F4 | Portal passwords are stored/compared as plaintext; employee and supervisor credentials are exposed to anon, and office-account passwords to authenticated callers. | Historical counts: `employee_portal_accounts.password` 78 rows, `supervisors.password` 4, `office_role_assignments.account_password` 9; no hashes in that audit. October 27 HEAD verified anonymous access to the employee password column for 130 visible rows without downloading values. Live office-password column grants still allow authenticated SELECT, not anon SELECT. |
| F5 | Login for employees and promotional applicants is checked in the browser by fetching or caching account rows and comparing passwords. | `src/lib/employeePortalData.ts:92–112,326–337,395–425`; `src/modules/applicant/ApplicantWizard.tsx:1185–1188`. See F19 for password-change and stale-cache consequences. |
| F6 | Anon can call `SECURITY DEFINER` RPCs that manage accounts: `demo_set_password(account_id, …)` resets anyone's demo password, `demo_create_account` creates accounts with any role. *Corrected 2026-11-02:* these functions only touch the `public.accounts` table (0 rows), which is read only by the `/pm-demo` module. They do not touch `employee_portal_accounts`, office accounts or `auth.users`, so this is not a portal takeover. Severity Medium: unauthenticated writes to an isolated demo table plus a public route. | Advisor `anon_security_definer_function_executable`; function bodies inspected 2026-11-02. |
| F7 | 10 admin policies trust `user_metadata`, which any signed-in user can edit on themselves. *Corrected 2026-11-02:* 3 of the 10 tables (`competencies`, `employee_competencies`, `performance_evaluations`) have RLS **off**, so their policies are never evaluated; those tables are open through F2 instead. The other 7 rely on metadata for writes. Exploiting them needs a Supabase Auth account, so this is staff-to-admin escalation, not anonymous access. Only 5 Auth users exist, and each has a `user_roles` row. | Advisor `rls_references_user_metadata` (`performance_cycles`, `competencies`, `idp_entries`, `application_activity_log`, `training_course_drafts`, …); RLS state checked 2026-11-02. |
| F8 | `employee-documents` is public with unrestricted bucket-level insert/update/delete policies. `applicant-attachments` is private but allows public reads of files not hidden by the soft-delete helper, and bucket-wide insert/update/delete. | October 27 `storage.buckets` and `storage.objects` policies. Private bucket status alone is not access control when anon SELECT permits downloads/signing. |
| F9 | FastAPI has unauthenticated data, email and AI routes; privileged handlers use a service-role client. Some routes have since gained authentication. | October 27: 32 router endpoints, 8 without auth dependencies, of which 3 are placeholder auth endpoints. The 5 business endpoints are applicant create/list, email send, competency matching and competency assessment. `evaluations.py` and `weighting.py` now have auth dependencies; do not repeat the old 21-of-32 count. See F17 for authorization holes behind authentication. |
| F10 | Leaked-password protection remains off; the refreshed advisor reports 44 mutable-search-path functions (34 in the original audit). 2026-11-02 advisor: 45. | Advisors `auth_leaked_password_protection`, `function_search_path_mutable`; snapshot timestamp documented below. |

## Approach

Order matters. Retiring the leaked service-role key (Phase 1) stops its use; purging history (Phase 2) cannot recall copies already cloned, forked or cached. F11 requires a separate document-key rotation and migration of existing ciphertext. Neither rotation closes open table or Storage permissions, so restrict exposed data, key retrieval and unsafe RPCs during containment rather than waiting for the full portal migration.

The chosen identity architecture is **Supabase Auth for every person who signs in**, with verified JWTs available to RLS. This is a project choice, not a claim that Postgres only supports one identity provider. A hash-and-RPC login like the current `demo_login` would still leave subsequent requests anonymous unless a supported session/token integration were also implemented.

- **Portal identities.** Employees, supervisors / department heads and office accounts get `auth.users` rows, created by a one-off server-side script. Usernames without an email map to a synthetic address (`<username>@accounts.abyan.internal`), so users keep signing in with their username. Their role and employee link live in `app_metadata` (only writable with the service role) and in `public.user_roles`, never in `user_metadata`.
- **Existing passwords.** Treat exposed passwords as compromised. Provision accounts with fresh, securely generated credentials or one-use recovery/invitation flows; do not carry the exposed passwords into Auth. A first-login UI redirect does not stop someone who already knows a password from taking over its replacement. Enforce any pending-reset restriction server-side and remove plaintext columns and browser caches after cutover.
- **RLS model.** Carefully scoped helpers with a fixed `search_path`: `app_role()` (reads active `user_roles`) and `current_employee_id()`. Policies are written per table group against a role matrix (below), including column restrictions, record assignments, lifecycle state and disabled accounts. Audit `SECURITY DEFINER` function bodies and effective grants separately; enabling table RLS does not constrain a privileged function owner.
- **Rollout.** Each table group is built and tested on a Supabase preview branch (or a local `supabase start` stack loaded from a schema dump), with pgTAP tests in `supabase/tests/`, then applied to live one group at a time. Turning RLS on will break any screen that reads with the anon client, so each group ships with its code changes.

### Role matrix (draft, to confirm in Phase 4.1)

| Data | anon | employee | supervisor / dept head | interviewer | RSP / PM / L&D admin | superadmin |
|---|---|---|---|---|---|---|
| Job postings, salary grades, public reference tables | read | read | read | read | read/write (own module) | all |
| Applicants, attachments | controlled submission; subsequent access only through verified, scoped applicant capability/session | own application through verified applicant flow | none | read assigned; evaluate assigned where authorized | RSP: recruitment workflow | all |
| Employee profile and PDS (`employees`, `employee_*`) | none | own row | own office (read) | none | read; write where module owns it | all |
| IPCR, evaluations | none | own | own office | none | PM: all | all |
| Training, IDP | none | own | own office | none | L&D: all | all |
| Succession | none | none | own-office requirements and relevance reviews; no cross-office writes | none | RSP succession reads/ranking and assigned configuration; no implied access for other module admins | all |
| Accounts, roles, password resets, audit logs | none | none | none | none | none (via admin RPCs only) | all |

## Steps

### Phase 0: Decide (before any change)

1. Confirm whether the live database holds **real** personal data or only demo data. Have the Data Protection Officer assess the incident and applicable RA 10173/NPC notification criteria and deadlines, including the 72-hour requirement where applicable. A vulnerability alone does not establish every legal criterion for mandatory notification; preserve evidence and do not wait for remediation to start that assessment.
2. Decide whether to take the site offline during containment and staged cutover. Key rotation alone does not stop anon access to employee data; Phase 1 must also restrict the exposed data paths, with the full role model delivered in Phase 4.
3. Confirm who controls `dehandenver/CICTrix` (upstream). Phase 2 needs a force-push there too.

### Phase 1: Contain (same day)

*Planned in detail 2026-11-02 from the live catalog and upstream `e110977`. Not approved for execution yet.*

**Goal.** Kill the leaked service-role key, close the account-takeover and key-theft paths that need no login, and stop the backend's unauthenticated side effects. Phase 1 is deliberately limited to changes that do not break a working portal. Anonymous reads of `employees` PII and the open Storage writes stay open until Phase 3/4, because the employee and office portals still run as `anon` (they don't sign in through Supabase Auth). That gap is why Phase 0.2's offline decision matters.

**Who does what.** Steps marked *(owner)* are dashboard actions by whoever controls the Supabase project and the Vercel deployment; Claude cannot do them. Steps marked *(PR)* are repo changes merged by PR to `main`, so the Supabase GitHub integration applies the migration. Never hand-apply SQL. *(owner)* steps run in the order listed; the PR can be prepared in parallel and merged right after 1.2.

**Portal sign-in facts this plan depends on** (checked 2026-11-02):

| Caller | Sign-in | Runs as | Calls |
|---|---|---|---|
| RSP / PM / L&D admin (`LoginPage.tsx:92`) | Supabase Auth | `authenticated` | `undo_document_validation`, `finalize_ipcr_surfaces` (`Phase2RatingPanel` → `saveRatings`), `/api/email/send`, rater writes (`RaterManagementPage.tsx`) |
| Interviewer (`InterviewerLogin.tsx:146`) | Supabase Auth | `authenticated` | `get_document_decryption_key`, `/api/email/send` |
| Employee portal, and the office console it unlocks (`/office/*`, via `getActiveOfficeRoles`) | Browser password compare, with a localStorage fallback that includes a built-in demo account (F24) | `anon` | `employee_portal_accounts` and `employees` with `select('*')`; `office_role_assignments` through anon column grants that exclude the credential columns |
| `/pm-demo` route (`App.tsx:608`, `DemoRoot`) | `demo_login` RPC | `anon` | `demo_login`, `demo_set_password`, `demo_create_account` |
| Interviewer login pre-check (`interviewerAccess.ts:49`) | none yet | `anon` | `raters` SELECT |

#### 1.1 Preconditions *(owner)*

- Phase 0.1–0.3 answered: real vs demo data and DPO assessment started; offline decision; who controls upstream, the Supabase project and Vercel.
- Snapshot before changing anything: export current function ACLs, table grants, policies and Auth settings to a private location (not the repo). Note the current Vercel production revision so it can be rolled back.

#### 1.2 Rotate the Supabase API keys *(PR first, then owner)*

0. *(PR, must merge and deploy first)* Upgrade the backend's `supabase` Python package in `requirements.txt` and `backend/requirements.txt` (pinned at `2.4.2`) to a release that accepts the new key format, and run the backend tests. On 2026-11-02, `create_client` from `supabase==2.4.2` raised `SupabaseException: Invalid API key` for an `sb_secret_…`-shaped key and accepted a JWT-shaped one. Without the upgrade, step 2 takes every backend route down. The frontend's `@supabase/supabase-js ^2.93.3` was not tested with the new keys; confirm on a preview deployment.
0b. *(owner)* Supabase → Authentication → Sign In / Providers: turn off "Allow new users to sign up". The frontend has no `signUp` call, and all 5 existing Auth users are staff with `user_roles` rows. Open sign-up would let anyone get the Auth session that F7, F12 and F13 need. Whether it is currently on was not checked: it isn't visible through SQL.
1. Supabase dashboard → Project Settings → API Keys: create a new publishable key (`sb_publishable_…`) and a new secret key (`sb_secret_…`).
2. Vercel → Project → Environment Variables (Production and Preview): set `VITE_SUPABASE_ANON_KEY` to the publishable key; set `SUPABASE_SERVICE_ROLE_KEY` to the secret key; set `SUPABASE_KEY` to the publishable key if the backend still reads it. Redeploy, then confirm every portal loads and signs in.
3. Update the GitHub Actions secrets `SUPABASE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in every repo that runs `competency-assessment-queue.yml`, and every local `.env` / `backend/.env` (each collaborator). Delete local copies of the old keys, including the untracked `scratch/` files that hold them. The [November 5 update](#november-5-update-leaked-key-files-removed) lists every consumer.
4. Disable the legacy JWT-based `anon` and `service_role` keys. This is the step that kills the leaked key; deleting files does not.
5. Verify: a REST request with the old service-role JWT returns 401; the app works on the new keys. Do this with a harmless `HEAD … limit=0` request, never a read of row data.

Rollback: re-enable the legacy keys only if production is broken and no fix is available within the incident window; record that the leaked key was live again for that period.

#### 1.3 Revoke public execution on account and mutation RPCs *(PR)*

Create the migration with `npx supabase migration new phase1_revoke_public_rpcs`. Live grants on 2026-11-02:

| Function | `PUBLIC` | `anon` | `authenticated` | Phase 1 action |
|---|---|---|---|---|
| `demo_create_account(text,text,text,text,text,text,text,date,uuid)` | yes | yes | yes | Revoke from `PUBLIC`, `anon`, `authenticated` |
| `demo_set_password(uuid,text)` | yes | yes | yes | Revoke from all three |
| `demo_login(text,text)` | yes | yes | yes | Revoke from all three |
| `undo_document_validation(uuid,text)` | yes | yes | yes | Revoke from `PUBLIC`, `anon`; keep `authenticated` (RSP signs in via Auth) |
| `finalize_ipcr_surfaces(uuid)` | no | yes | yes | Revoke from `anon`; keep `authenticated` (PM signs in via Auth) |
| `build_ipcr_semester_roster(integer)` | no | yes | yes | Writes the frozen semester roster. Revoke from `anon` once its caller is confirmed to be an Auth-signed portal |
| `sync_ipcr_performance_competencies(uuid,uuid)` | no | yes | yes | Writes. Same as above |
| `evaluate_sor_publication(text)` | no | yes | yes | Writes. Same as above |
| `resolve_application_reference(text)` | yes | yes | yes | Maps any reference number to that person's primary reference. Keep only if the public tracker needs it, and fold it into the F13 redesign |

- In the same PR, remove the `/pm-demo` route and `DemoRoot` import from `App.tsx`. The route cannot work once the demo RPCs are closed. It writes only the isolated `accounts` table (F6 correction), so removing it loses no production function.
- The 2026-11-02 advisor lists **24** anon-executable `SECURITY DEFINER` functions, not 18. 11 of them return `trigger` and are not callable over the API (`sync_salaries_for_grade`, `assign_application_reference_no`, `finalize_ipcr_surfaces_trigger`, and others). Protect writes to their source tables instead. The 13 callable ones are the rows above plus `is_rsp_admin`, `is_super_admin`, `applicant_file_is_soft_deleted` and `generate_application_reference_no`, which only read or return booleans and can stay until Phase 4. Do not regrant to `PUBLIC`.
- Before revoking `anon` on the three IPCR writers, grep for their callers. Any caller from the employee or office portals runs as `anon` and would break.
- Residual: an authenticated user of any role can still call `undo_document_validation` with a forged actor and `finalize_ipcr_surfaces`. The role checks are Phase 4.10.
- Verify after merge: `has_function_privilege('anon', …)` and the `PUBLIC` ACL entry are false for each row above; RSP undo and PM rating finalization still work.

#### 1.4 Document key containment, F11–F12 *(PR, then owner)*

1. *(PR)* `src/lib/crypto/_internal/keys.ts`: remove the connected-mode fallback to `DEFAULT_PRIVATE_KEY_BASE64`. A failed or empty `get_document_decryption_key` result throws. Keep the development key out of the production bundle: load it only when mock mode is on and the build is a dev build, or move it into a test fixture. Verify with a production `npm run build` that the private key string is absent from `dist/`.
2. *(PR)* `raters`: revoke `anon` INSERT/UPDATE/DELETE and drop the anon write policies such as `raters_anon_all`. Keep `anon` SELECT for the interviewer login pre-check until Phase 3. Rater management already runs as `authenticated`. This stops anyone from enrolling their own email as an interviewer to obtain the key.
3. *(owner)* Generate a replacement RSA key pair offline. Do **not** swap the stored key yet: existing ciphertext is wrapped with the leaked pair and there is no key-version field to tell old and new files apart. First inventory how many encrypted files exist, then write a separate key-version and re-wrap plan (Phase 1.4b) before rotating. Until then, the leaked key still decrypts existing files that anyone can download (F8), so this is the strongest argument for the Phase 0.2 offline decision.

#### 1.5 Stop bulk password reads, F4 *(PR)*

The employee portal reads the `password` column as `anon` to compare in the browser, so revoking the column alone breaks employee login. Phase 1 stopgap:

1. Add `verify_employee_login(p_username text, p_password text)`, `SECURITY DEFINER`, fixed `search_path`, returning the account row **without** the password column, or nothing. Grant to `anon` only.
2. Switch `src/lib/employeePortalData.ts` login to the RPC and stop caching account rows with passwords.
3. Revoke `anon` and `authenticated` SELECT on `employee_portal_accounts.password` and `supervisors.password`. Confirmed 2026-11-02: `supervisors` has RLS off, `anon` has full grants, and the table has a `password` column. Revoking the table grant and regranting every column except `password` is the reliable form, because a column-level revoke alone doesn't remove a table-level grant.
4. **Before** the revoke, replace every `select('*')` on these tables with an explicit column list. PostgREST rejects `*` once any column is unreadable. Known sites: `employeePortalData.ts:103,135,180` and `officeDirectory.ts:166` (`supervisors`). Grep again at implementation time.

Residual, stated plainly: this stops downloading every password; it does not authenticate later requests, and the 211 plaintext passwords stay exposed until Phase 3 replaces them. Treat all of them as compromised.

#### 1.6 Backend containment, F9/F20/F22 *(PR, then owner)*

1. `competency_assessment.py:601`: remove the `"cictrix-queue-drain-secret"` default. If `QUEUE_DRAIN_SECRET` is empty, return 503 and do nothing. Use a constant-time comparison. *(owner)* Set a long random `QUEUE_DRAIN_SECRET` in Vercel.
2. `email.py` `/send`: require an authenticated RSP, interviewer or super-admin caller; cap recipients and body size. Update `src/lib/email.ts` to send the Supabase access token in `Authorization`. Both callers already sign in through Auth.
3. `applicants.py` `GET /`: require an authenticated RSP or super-admin caller. It currently returns up to 10,000 applicants with no login.
4. `competency_matching.py` `/analyze` and `competency_assessment.py` `/assess`: require authentication and send the token from `src/lib/api/competencyMatching.ts`.
5. `backend/main.py`: replace `allow_origins=["*"]` with the production and preview origins from an env var. Low severity on its own, since the API uses bearer tokens rather than cookies.
6. Stop printing applicant payloads in `applicants.py` (F21); it's a two-line change in a file already being touched.
7. F25: remove the custom-JWT fast path from `get_authenticated_user` and `get_current_user` in `backend/app/utils/dependencies.py`, and remove the `/api/auth/login` route that issues those tokens. No frontend code calls `/api/auth/login` (checked 2026-11-02), so Supabase Auth tokens are the only real callers. If the path must stay, make `config.py` refuse to start when `JWT_SECRET_KEY` is unset or equals `cictrix-default-jwt-secret-key`.
8. F24: remove `DEMO_ACCOUNT` and `withDemoAccount` from `src/lib/employeePortalData.ts`, or gate them on mock mode. The connected-mode login must not accept a built-in credential.

#### 1.7 Auth and dependency settings

- *(owner)* Supabase Auth → enable leaked-password protection.
- *(PR)* `npm audit fix` for F23 (`dompurify` critical, `react-router`/`react-router-dom` high, `ws` high), then run the full test suite. Use a separate commit so it can be reverted alone.

#### 1.8 Log review *(owner)*

Export Supabase API and Auth logs as far back as retention allows, plus Vercel function logs. Look for service-role requests from unknown IPs or user agents, `demo_set_password`/`demo_create_account` calls, `raters` inserts, and bulk reads of `employees` or `employee_portal_accounts`. Save the export privately for the DPO. This is evidence collection, not a full forensic investigation.

#### 1.9 Explicitly deferred out of Phase 1

| Exposure | Why it waits | Phase |
|---|---|---|
| Anon read of `employees` PII and 80+ RLS-off tables | Employee and office portals run as `anon`; locking them out breaks those portals | 3, then 4 |
| Public `employee-documents` bucket and open Storage writes | Stored `getPublicUrl` links (`employeeDocuments.ts:247`, `trainingEvaluations.ts:319`) and employee uploads run as `anon` | 4.7 |
| 10 `user_metadata` policies | Needs `app_role()` and the role table as source of truth | 3.5 |
| Secrets in git history | Needs the upstream owner's force-push | 2 |

#### 1.10 Phase 1 exit checks

- Old service-role JWT returns 401; the app and the backend run on the new keys in every portal.
- A self-service Auth sign-up attempt is refused.
- A backend request carrying a token signed with `cictrix-default-jwt-secret-key` returns 401.
- `employee01` with the built-in demo password is rejected in connected mode.
- `anon` cannot execute any function in 1.3, and `PUBLIC` holds no `EXECUTE` on them.
- `anon` cannot write `raters` or read any password column; employee login still works through the RPC.
- A failed decryption-key RPC fails closed; the production bundle contains no private key.
- Unauthenticated `POST /api/email/send`, `GET /api/applicants/`, `POST /api/competency-matching/analyze` and `POST /api/competency-assessment/assess` return 401; `POST /api/competency-assessment/queue/drain` without the configured secret returns 401 or 503.
- `npx tsc --noEmit`, `npm run lint`, `npm test`, and a click-through of each portal pass.

### Phase 2: Purge history

1. Remove secret values from tracked files. *The Supabase JWTs are done ([PR 98](https://github.com/dehandenver/CICTrix/pull/98), 2026-11-05).* Still to do: the document private key in `src/lib/crypto/_internal/keys.ts` and `supabase/migrations/20261026102622_document_encryption_keys.sql`. Untrack secret-bearing `.env` files only if tracked; keep sanitized examples. Coordinate historical migration sanitization with a new forward migration so fresh environments cannot reseed a compromised key.
2. Rewrite history with `git filter-repo` on a fresh mirror clone, covering all discovered secret values and paths, including non-JWT encryption keys. Inspect the rewrite before publishing it.
3. Coordinate history replacement with each repository owner after explicit approval. Follow this repo's remote restrictions: never push straight to `upstream` or to `Trsha11102004/CICTrix`; the upstream owner handles their repository. All collaborators re-clone; old clones must not be pushed back.
4. Ask GitHub Support to purge cached views and pull-request refs that still hold the old commits. Forks keep their copies; this is why Phase 1 comes first.
5. Enable GitHub secret scanning and push protection on the affected repositories, add a `gitleaks` pre-commit hook and CI scan, and check production bundles for embedded private keys. PEM-only or JWT-only searches miss the bare Base64 PKCS#8 key found in F11.

### Phase 3: Move logins to Supabase Auth and hash passwords

1. Migration: add `auth_user_id uuid references auth.users` to `employee_portal_accounts`, `supervisors`, `office_role_assignments`; extend `user_roles` with `employee_id` and `office`.
2. One-off migration script (run locally with the secret key from `.env`, never committed with it) that creates Auth users with new credentials/recovery flows, fills `user_roles`, and links `auth_user_id`. Use the active role table as the authorization source of truth; any mirrored metadata must never override explicit revocation or lookup failure.
3. Replace the browser password checks (F5) with `supabase.auth.signInWithPassword`, routed through `src/lib/`: employee portal, supervisor / office account, promotional application in `ApplicantWizard`. Change-password uses `supabase.auth.updateUser`.
4. Office account creation (`src/lib/api/officeRoles.ts`, `SystemAdministrationPage`) moves to a server-side endpoint or edge function that creates the Auth user. The generated password is shown once and never stored.
5. Rewrite the 10 `user_metadata` policies (F7) to use `app_role()`.
6. After all portals sign in through Auth: drop `employee_portal_accounts.password`, `supervisors.password`, `office_role_assignments.account_password`.
7. Remove local/demo credential fallbacks from connected mode, clear legacy plaintext account caches, and persist password changes in Auth before showing success. Test old-password rejection from a second browser, not only a same-tab login. Keep any first-change flag durable and enforced beyond route guards (F19).
8. Sign out of Supabase on interviewer logout as well as clearing UI state and decrypted-file caches (F18). Verify session/token behavior and define the remaining access-token lifetime. Remove unused custom-JWT acceptance, or explicitly enforce expiry, issuer/audience, active identity and revocation for every retained token path.
9. Enforce `is_active` in frontend login, backend dependencies and database helpers. Test disabled/deleted roles with stale metadata and already-issued tokens (F16).

### Phase 4: Real RLS

1. Confirm the role matrix above, table by table.
2. Add the scoped helpers and set `search_path` on the current inventory of flagged functions (44 in the refreshed advisor snapshot, not the original 34). A fixed path is not an authorization check; review effective function grants and bodies too.
3. Enable RLS and write policies per group, each a separate migration with pgTAP tests, in this order (most sensitive first): accounts and roles → employee PDS and documents → IPCR and evaluations → succession → training and IDP → applicants → reference tables.
4. Applicant tracking/submission (F13–F14): verify ownership before linking to an existing email identity or revealing its reference/history. Issue a high-entropy, expiring, narrowly scoped capability or authenticated applicant session; reference number plus a typed email is insufficient. Return only needed status fields. Replace arbitrary public table inserts with allowlisted submission/upload operations that derive identity, initial status and audit fields server-side. Preserve legitimate resubmission through the verified flow. Close public reference-registry reads and enumeration oracles.
5. Remove the allow-all policies (`*_open_access`, `Allow public …`, `Enable ALL for anon …`) and revoke blanket `anon` grants.
6. Inventory actual views and use `security_invoker = on` or revoke exposure as appropriate. The live `applicant_tracker_view` already has this setting, so its leak is the underlying permissions, not owner-rights execution. `employee_competency_summaries` is a base table on the inspected project, not a view. The advisor still flags `plantilla_slot_applicant_counts` as an owner-rights view.
7. Storage (F11–F12, F20): make `employee-documents` private; require verified ownership/assignment before issuing short-lived URLs or decrypting each file. A folder named after an applicant ID is not proof of ownership. Use scoped upload grants, server-validated size/type/content and per-applicant quotas. Apply Storage policies through Storage > Policies per repo rules. Do not return a global private key to every interviewer; decrypt only individually authorized objects in a trusted service or use equivalently scoped key access.
8. Backend (F9, F17): require verified identity plus active role, record assignment and valid workflow state on protected routes; explicitly allowlist health and redesigned public applicant operations. Use the caller's JWT wherever RLS can enforce scope. For necessary service-role operations, perform authorization before any database side effect. Reject 401/403 permanently rather than retrying through direct Supabase writes. Remove routes only after confirming they are unused.
9. Realtime: confirm subscriptions still work, since Realtime enforces RLS on the tables it publishes.
10. Document review/auditing (F14–F15): separate public file metadata from staff approval markers. Derive actor ID and timestamps from the verified server context and save the business action and audit event atomically. Prevent clients from fabricating approval/undo events or changing other people's uploads; restrict audit reads and make audit writes server-owned and append-only.
11. Abuse/privacy controls (F20–F21): bound recipient counts, body/request size, upload counts and AI input sizes; add identity-aware rate limits and provider budgets. Remove full applicant payload/response logging and raw database/provider exceptions from public responses; use redacted structured events and correlation IDs.

### Phase 4A: Succession scoring trust boundary

**Dependency and scope:** This is the focused security prerequisite for [Succession Scoring V2](2026-10-27-succession-scoring-v2.md), not approval to execute the entire security plan. Complete Phase 3's verified identity and active assignment linkage before relying on Office Account review decisions. Coordinate source-table protection with Phase 4's PDS and training work; do not implement conflicting policies twice.

**Verified evidence:** Read-only live catalog checks during succession planning found RLS disabled and anon SELECT/INSERT/UPDATE grants on `critical_positions`, `succession_candidates`, `employee_work_experience`, `employee_training`, and `employee_eligibility`. `office_role_assignments` had RLS enabled with no anon SELECT/INSERT/UPDATE grants, but its inspected columns had no `auth_user_id` link. These are configuration findings, not a claim of exploitation or a direct mutation test. Source checks read column names and privileges, not employee records or credential values.

- [ ] Define and test the role/action matrix for each affected table and mutation API before changing grants. Preserve employee-owned PDS maintenance, authorized HR/RSP access, legitimate L&D training updates, office succession setup, and Gap Analysis reads. An office review permission does not automatically grant the right to edit an employee's underlying PDS or create an eligibility.
- [ ] Resolve the caller from a verified Auth session and current active role/office assignment server-side. Office review writes must verify the critical position belongs to that assignment and that the employee/evidence belongs to the allowed scope. Ignore client-provided actor/office identifiers for authorization. Revoked/disabled assignments, missing identity, ambiguous mappings and failed role reads deny access, including with stale tokens or metadata.
- [ ] Protect both the review decisions and their inputs: `critical_positions`, `succession_candidates`, applicable employee education/profile fields, `employee_work_experience`, `employee_training`, `employee_eligibility`, and recognized eligibility/configuration sources used by the scorer. Remove unintended anonymous write paths and inspect effective grants, RLS, views, RPCs and privileged backend routes together. Securing only a new review table still permits score manipulation through editable source evidence. Do not add anon-open policies or privileged-client fallbacks to keep pages working.
- [ ] Make review decisions position-specific and bind them to source and requirement versions. Derive reviewer identity and timestamps on the server; save the decision and append-only audit event atomically. Reject stale concurrent saves and edits of another office's reviews. Source edits/deletions, changed position requirements, employee office changes and reviewer access changes must invalidate affected decisions before reuse; do not silently retain an authoritative final score.
- [ ] In a local or preview database, add pgTAP/API denial tests for anonymous access, signed-in wrong-role access, cross-office reads/writes, forged attribution, self-assigned office IDs, revoked assignments, direct source mutations, bypass RPCs and audit modification. Assert rejected mutations have no side effects. Add positive tests for each legitimate role/action from the matrix and for source-change invalidation and audit/save rollback.
- [ ] Deploy authenticated client/API paths and their database policies as a coordinated release through reviewed repository migrations. Test employee PDS, Office Account Critical Positions, Gap Analysis, RSP succession/overview and L&D training flows before tightening live access. Do not lock live tables ahead of compatible clients or apply repository migrations by hand. Recovery must preserve the access protections; never reopen public writes as a rollback strategy.
- [ ] Keep the V2 pure calculation engine build/test work independent and the existing scoring path active during preparation. Do not activate persisted relevance reviews or the V2 scoring cutover until identity, office authorization, protected source evidence, audit/invalidation checks and workflow regressions pass. Record the evidence that clears this gate in both plans; deployment/activation remains separately authorized.

The approved succession workflow has **no additional HR approval queue**. This section enforces the Office Account user's assigned scope, not a new approval stage. Pending relevance reviews stay visible in succession without a final score/rank/readiness; confirmed qualification failures stay hidden. The scoring implementation owns these presentation rules; security must not turn an authorization/read error into a successful empty list or zero score.

### Phase 5: Keep it closed

1. Run `get_advisors` (security) after every migration; zero `ERROR` lints is a necessary release gate, not proof of security. Business authorization, leaked browser keys and identity verification also need tests.
2. Add CI checks for RLS/grant/function drift and unsafe migrations, with reviewed public-reference exceptions. Cover PUBLIC grants, permissive policy combinations, `WITH CHECK (true)` inserts, authenticated-but-unscoped access, definer functions and unsafe default privileges; a text search for anon `USING (true)` alone misses these.
3. Write a short `docs/security.md`: the role matrix, which keys live where, and how to add a table safely.

## Risks

- **Phase 1 breaks anything still using the old keys.** The tracked scripts read keys from `.env`, so those files need the new values. The untracked `scratch/` scripts hardcode the old key and stop working after rotation.
- **The backend can't use the new secret key on its current client** (`supabase==2.4.2`). Upgrade it first (Phase 1.2 step 0), or the key rotation turns into a backend outage.
- **Column revokes break `select('*')`.** Phase 1.5 has to ship its query changes before or with the revoke.
- **Phase 4 breaks screens.** Many components read tables directly with the anon client; each table group needs its UI paths tested in every portal before it goes live.
- **Succession trust depends on source integrity.** Protecting review rows while leaving qualification records or position requirements anonymously editable permits manipulated rankings. Conversely, disabling source access without compatible authenticated PDS/L&D/office clients can interrupt legitimate work. Phase 4A is a coordinated release gate, not a blanket live lockdown.
- **Force-push disrupts collaborators** and any open PRs on both repos; it needs coordination with whoever owns upstream.
- **Users without an email** can't use self-service password reset with synthetic addresses; resets stay admin-driven through a server endpoint.
- **Exposed credentials** must be replaced through a trusted provisioning/recovery process. Hashing the same exposed password does not revoke it, and the existing password-change screen does not update the database.
- **Document rotation** needs a verified inventory, recoverable migration and key-version support. Removing the old key before migration can lose access to files; leaving it in a browser keeps them exposed.
- **Public applicant access** now requires an ownership-verification design, including applicants sharing an email and existing aliases. Prevent lockout without making typed email an authentication credential.
- **Scope.** This touches every portal and now includes encryption-key migration and applicant verification. Re-estimate implementation after the role matrix and ownership flow are agreed; the earlier 4–6-session estimate is not validated.

## Checks to run

- After Phase 1: the exit checks in Phase 1.10.
- After Phase 2: secret scanning passes on a fresh clone and built assets; assert the leaked service-role and private-key material is absent, including bare Base64 keys. Public JWT-shaped values alone are not proof of a secret leak.
- After Phase 3: no plaintext password column/cache exists; anonymous password-column access fails; every portal signs in, changes its password durably and signs out of the underlying Auth session. Old passwords fail in a clean second browser; inactive users and stale role metadata cannot restore privileges.
- After Phase 4: Supabase security advisors show 0 `ERROR` lints; pgTAP/API tests prove role, owner, office, interviewer assignment and workflow boundaries for SELECT/INSERT/UPDATE/DELETE and RPCs. Anonymous protected API calls fail before side effects; authenticated wrong-role calls fail too. Explicit public endpoints have separate scoped tests.
- Before succession V2 activation: Phase 4A tests prove own-office reviews, denied anonymous/cross-office source and review writes, verified reviewer attribution, atomic audit, stale-save rejection and invalidation after evidence/requirement/assignment changes. Employee PDS, L&D training, Critical Positions, Gap Analysis and RSP succession/overview regressions must pass; failed authorization/reads must never masquerade as zero scores or empty successful results.
- Every phase: `npx tsc --noEmit`, `npm run lint`, `npm test`, and a click-through of each portal.

## October 27 review: evidence and additional findings

### Scope and confidence

Reviewed local source at commit `b1594a2f8ac6853b780d10793bedb63ca05f0451`, tracked-file secret locations, current local `dist`, and read-only configuration on `fyzdfgxaaowjzbjpwrii`. Inspected security/performance advisors, aggregate log-source counts, catalog grants, RLS policies including permissive/restrictive modes, function definitions, triggers, constraints and Storage bucket settings. No production rows, users, permissions or files were changed; no email/AI calls or mutation RPCs were executed. The leaked service-role key was not exercised.

**Live-confirmed** means the relevant server configuration was inspected, with anonymous HTTP checks where specified. **Code-confirmed** means a reachable source path or isolated local reproduction establishes the defect; it does not imply a successful production exploit. Local Python reproductions executed the inspected function bodies with in-memory DB/Auth doubles, not a full deployed FastAPI stack. The documented hostname `https://abyan-hris.vercel.app` returned HTTP 404, so current Vercel deployment, backend environment and deployed bundle contents were not established.

Refreshed baseline:

- The security advisor snapshot was observed at `2026-10-26T22:44:21.724Z`: 79 tables without RLS, 10 metadata-trusting policies, 44 mutable-search-path functions, 18 anon-executable definer-function findings, and leaked-password protection disabled. Direct catalog inspection on October 27 found **80** public base tables with RLS disabled; **78** had all four anon SELECT/INSERT/UPDATE/DELETE grants. The exceptions were `accounts` (no table-level anon SELECT) and `ipcr_audit_log` (no anon UPDATE/DELETE). These are different observation times/scopes, not interchangeable totals.
- Anonymous HTTP **HEAD** requests using only the configured public anon key returned **206** for `applicant_tracker_view` (`select=id`, 31 visible rows), `raters` (`select=id`, 3 rows), and `employee_portal_accounts` (`select=password`, 130 rows). Requests used `limit=0` and `Prefer: count=exact`; no field values were downloaded. This verifies live Data API exposure rather than merely inferring it from migrations.
- Some protections work: `user_roles` has self-read-only RLS; `document_encryption_keys` denies direct anon/authenticated access; the decryption RPC itself denies anonymous execution. The soft-delete policies inspected on applicants, attachments and portal accounts are **restrictive**, so they are not defeated simply by permissive OR composition. The findings below account for these protections.
- Local tracked-file inspection reconfirmed F1's 25 secret-bearing paths. Current public GitHub visibility and whether the leaked JWT has been revoked were not rechecked. Historical plaintext password counts in F4 were not refreshed by reading password values.

### F11 — Critical: document private key is shipped to the browser and permission failures fall back to it

**Evidence:** `src/lib/crypto/_internal/keys.ts:6–10,64–101` embeds both halves of the RSA key pair. Even in connected mode, an unsuccessful `get_document_decryption_key` call falls back to that private key at lines 83–85. `supabase/migrations/20261026102622_document_encryption_keys.sql:25–35` seeds the same pair. Both files are tracked, and the exact private-key string appears in local `dist/assets/index-C7T1lXle.js`.

**Verification/impact:** Live stored key fingerprints matched the source pair (comparison only; private values were not returned by the live query). A local test ran the actual key/cipher modules with mock mode false and an RPC returning `42501`; a synthetic encrypted document still decrypted correctly. Anyone possessing ciphertext encrypted with this pair can decrypt it offline; current F8 permissions also permit downloading active applicant files. This does not prove how many existing files use that key or that the inspected local bundle is deployed.

**Remediation/check:** Phase 1.6 and Phase 2. Rotate and migrate affected encryption, remove every production fallback, and fail closed on key authorization errors. Test unauthenticated/wrong-role decryption denial, scan built assets, and verify the new scheme cannot be decrypted using the leaked key. Preserve controlled access to old ciphertext until migration is verified.

### F12 — High: editable interviewer records authorize retrieval of a global decryption key

**Evidence:** Live `raters` has anon/authenticated INSERT/UPDATE/DELETE grants and permissive `true` policies, including `raters_anon_all`; its only constraints are primary key/unique email, with no user triggers. The live decryption function matches `auth.jwt()->>'email'` to any active rater and returns the single `default` private key, without checking an applicant assignment. This matches `supabase/migrations/20261026102622_document_encryption_keys.sql:59–94`. `src/modules/interviewer/InterviewerLogin.tsx:98–145` also uses these records as the interviewer access list.

**Prerequisite/impact:** A caller with any valid Supabase Auth account/email can make that email an active rater using the public write path, then satisfy the key RPC's interviewer branch. *Qualified 2026-11-02:* the live database has 5 Auth users, all staff with `user_roles` rows, and the frontend has no sign-up flow. Unless self-service sign-up is enabled (unchecked; see Phase 1.2 step 0b), the realistic attacker is a PM or L&D user, or an interviewer, upgrading themselves. Inserting the rater row needs no Auth session at all, though, so an outsider can pre-stage it for any email they later control. An already-authorized interviewer receives a key shared across applicants, not just assigned applicants. These paths remain unsafe after merely deleting the embedded key in F11. Live policies and function body confirm the chain; no rater was inserted or changed to exercise it.

**Remediation/check:** Restrict access-list writes to authorized administrators, bind raters to immutable Auth user IDs, and enforce assignment for individual document access. After rotating the key, verify an unrelated signed-in user cannot self-enroll and interviewer A cannot obtain/decrypt interviewer B's files.

### F13 — High: unverified email links identities and discloses existing application references

**Evidence:** `src/lib/applicantTracker.ts:36–64` permits email-only lookup. `src/modules/applicant/ApplicantWizard.tsx:850–899,943–991` returns an existing reference for duplicate submissions and returns a new insert's reference. The live `assign_application_reference_no` trigger reuses the primary reference for `NEW.email` without verifying ownership (`supabase/migrations/20261021200000_one_reference_per_applicant.sql:141–189`). The reference registry is readable by every authenticated role through `USING (true)`; the normal reference format has six decimal digits generated with `random()` (lines 98–139).

**Prerequisite/impact:** Knowing another applicant's email is enough for the current tracker. With an eligible open vacancy, submitting under that email can return the victim's shared reference and attach an unrelated application to their identity. The duplicate-submission path is another reference disclosure. Replacing tracker reads with `track_application(reference_no, email)` alone would retain this weakness: both inputs can be obtained without ownership verification. Trigger/policy definitions and call sites were checked; no impersonated application was submitted.

**Remediation/check:** Phase 4.4. Verify email ownership or an equivalent approved identity process before revealing/linking existing records; use scoped unpredictable tokens/session identity, throttling and generic pre-verification responses. Test same-email submissions, duplicate applications, aliases and arbitrary authenticated registry reads. A longer reference alone does not fix identity spoofing.

### F14 — High: public attachment inserts can forge staff document approval

**Evidence:** The live `applicant_attachments` INSERT policy is `WITH CHECK (true)` for anon/authenticated. Catalog inspection found only its primary key and applicant foreign key, with no user triggers or check restricting reserved document types. `src/modules/interviewer/ApplicantDetailsPage.tsx:896–914` treats `document_type='doc_validated'` rows as durable approvals; its approval writer creates those rows at lines 1858–1865. The tracker also consumes them (`src/modules/applicant/ApplicationStatusPage.tsx:689–695`).

**Prerequisite/impact:** Someone knowing an existing applicant ID can insert a marker indistinguishable from staff approval, choosing the document type being marked as verified. This can make documents appear verified without review. Anonymous insert permission is intentionally retained by the original plan, so closing UPDATE/DELETE alone would not fix it. The ID is currently available through public reads. No marker was inserted during this review.

**Remediation/check:** Separate file submission from review state; only authorized staff operations can produce approval/resubmission/undo markers. Validate ownership, allowed file types and server-owned fields on every insert. Test direct anonymous and wrong-role inserts of all reserved marker types and staff-looking event fields, not only normal uploads.

### F15 — High: public mutation RPC and client-controlled audit attribution bypass intended review controls

**Evidence:** Live `undo_document_validation(uuid,text)` is `SECURITY DEFINER`, executable by PUBLIC/anon/authenticated, and checks scheduling state but no caller role. It deletes approval markers and records arbitrary `p_actor_email`; see `supabase/migrations/20261021000008_restore_applicant_document_events.sql:47–84`. `applicant_document_events` independently accepts arbitrary anon inserts, and `src/lib/api/applicantDocumentEvents.ts:39–53` sends actor attribution from the client. Live `finalize_ipcr_surfaces(uuid)` is also anon-executable with workflow-state guards but no caller authorization (`supabase/migrations/20261026023000_finalize_ipcr_surfaces.sql`).

**Prerequisite/impact:** For an unscheduled existing applicant, a public caller can undo validation and attribute it to someone else. The RPC remains privileged even after table policies are tightened. The finalizer is limited to approved/completed target settings, but unauthorized callers can still initiate its writes. Broader audit integrity is also weak: live `access_change_audit` has anon UPDATE/DELETE grants with RLS off, whereas `ipcr_audit_log` allows anon INSERT but not UPDATE/DELETE. Do not claim every audit table is deletable.

**Remediation/check:** Phase 1.3 and Phase 4.10. Revoke PUBLIC inheritance and explicit grants where inappropriate, authorize each remaining function, and derive audit identity from verified context. Check effective `has_function_privilege` for both public roles after revocation. Attempt forged actors, cross-applicant undo and unauthorized finalization in an isolated test database, asserting no side effects.

### F16 — High: disabling a role does not consistently revoke access

**Evidence:** `backend/app/utils/dependencies.py:57–79` filters active `user_roles` rows but falls back to `user.app_metadata` if no active role is found or the lookup errors. `src/modules/admin/LoginPage.tsx:126–169` fetches only `role`, not `is_active`. The live `is_rsp_admin()` checks the role but not `is_active`; `open_vacancy`/`close_vacancy` trust it. In contrast, the live `is_super_admin()` does check active status.

**Verification/impact:** An isolated run of the actual backend authentication function with an inactive RSP row and stale RSP app metadata returned an authorized RSP identity. The backend bypass requires that stale metadata; it is not a claim that every inactive account has it. The live vacancy helper's missing active check is independent of metadata. A database role toggle therefore cannot be relied on as complete revocation.

**Remediation/check:** Phase 3.9. Explicit inactive/missing roles and lookup failures must deny access, never restore authority from stale claims. Apply one active-role rule to helpers, APIs and login. Test disabled/deleted accounts, role removal, failed role lookups, stale tokens/metadata and mid-session changes.

### F17 — High: authenticated callers can reach recruitment actions outside their role or assignment

**Evidence:** `backend/app/routes/applicants.py:219–281` gates status changes on `get_authenticated_user`, then uses the service-role client without a recruitment-role check. `backend/app/routes/employees.py:97–109,163–172,239–249` similarly accepts any resolved role for hiring/promotion and has no authorized workflow-state check before writes. `backend/app/routes/evaluations.py:56–77` requires RATER/INTERVIEWER but leaves assignment validation as a TODO. `src/lib/api/employeesApi.ts:93–117,265–278` falls back from any backend failure, including 401/403, to direct employee/applicant writes.

**Verification/impact:** Isolated handler execution with a PM identity returned by the real authentication function reached an applicant-status write to `Hired`. A RATER identity reached evaluation insertion for an arbitrary synthetic applicant without an assignment lookup. These are business authorization defects, not unauthenticated endpoints. Actual deployed route reachability and successful full hiring transactions were not tested. Direct-write fallback remains a bypass while F2–F3 permissions allow it.

**Remediation/check:** Phase 4.8. Require the specific recruitment role/assignment, validate state transitions and reserve service-role access for authorized operations. Test each action with anon, employee, PM, L&D, assigned/unassigned interviewer and RSP identities. Verify denial occurs before a DB call that changes data and that 401/403 never triggers a fallback mutation.

### F18 — Medium: interviewer logout leaves the underlying Supabase session signed in

**Evidence:** Connected interviewer login calls `supabase.auth.signInWithPassword` (`src/modules/interviewer/InterviewerLogin.tsx:141–145`). Normal `handleInterviewerLogout` clears the UI session/key cache and navigates, but never calls Supabase sign-out (`src/App.tsx:528–533`). The revoked-access handler does sign out at lines 542–550. `src/lib/supabase.ts:21` uses the default persistent Auth client.

**Impact:** A shared-browser user can see the logout screen while the underlying Auth session remains available to the client, including refresh capability. Clearing the in-memory document key alone does not remove that session. Code-confirmed; no real account was logged in or out for this review.

**Remediation/check:** Phase 3.8. Sign out of Auth, clear portal state and dispose decrypted resources together. Test a reload/new tab after logout and require reauthentication for protected operations. Separately document short-lived access-token revocation behavior instead of assuming sign-out instantly invalidates every issued JWT.

### F19 — High: employee password changes are local-only and stale credentials remain a login fallback

**Evidence:** `src/lib/employeePortalData.ts:395–425` changes only the local account list through `saveEmployeePortalAccounts` (lines 210–220). Both the initial password page (`src/modules/employee/SetInitialPasswordPage.tsx:61–73`) and employee settings call it. `src/App.tsx:452–459` tries the database first, then accepts local cached credentials even when the database comparison returns no match. *Line numbers at `e110977` (2026-11-02):* `changeEmployeePortalPassword` is at `employeePortalData.ts:498–529`, `saveEmployeePortalAccounts` at 313–327 (localStorage only, as before), the browser compare at 112 and 437, and the fallback at `App.tsx:456–459`. Behaviour is unchanged. The row mapper/writer (`employeePortalData.ts:21–75`) does not persist/reload `mustChangePassword`.

**Verification/impact:** A local run of the actual password-change function returned `{ok:true}` and changed the browser cache, with a DB mock configured to throw on any access remaining untouched. The database password therefore remains usable; cached credentials can also outlive a later server reset. A fresh browser's database-loaded account loses the local-only first-change flag. These are additional failures beyond plaintext storage in F4–F5.

**Remediation/check:** Phase 3.3/3.7. Make Auth authoritative for password changes and login, eliminate connected-mode cached/demo authentication, and replace compromised passwords rather than preserving them. Verify old passwords fail across browsers and that DB/network denial never falls back to cached credentials.

### F20 — Medium: public uploads and costly backend operations lack application-level abuse bounds

**Evidence:** Both live Storage buckets have `file_size_limit=NULL` and `allowed_mime_types=NULL`, and applicant uploads have bucket-only public INSERT permission. The 10 MB/type checks in `src/modules/applicant/AttachmentsUploadForm.tsx:111–155` run in the browser. `backend/app/routes/email.py:36–56,78–117` has no auth dependency or recipient-list/body cap and accepts arbitrary recipients/content when SMTP is configured. `backend/app/routes/competency_matching.py:130–175` and `competency_assessment.py:49–51,346` lack authentication and invoke AI processing. No application limiter was found in the inspected routers/main middleware.

**Impact/limits:** Clients can bypass the upload form and repeat uploads or email/AI work, consuming storage, provider quotas and service capacity. Null bucket limits mean no bucket-specific override, **not** unlimited files beyond Supabase's global limits. SMTP/AI production configuration and any external gateway limits are unverified; no messages, uploads or paid AI requests were sent.

**Remediation/check:** Phase 4.7/4.11. Use scoped upload permissions, per-applicant quotas, bounded request sizes, rate limits and provider budgets. Test limits through raw API calls in a sandbox, including ciphertext overhead and repeated submissions. Authorization alone does not bound an allowed user's usage.

### F21 — Medium: applicant personal data is copied into backend debug logs

**Evidence:** `backend/app/routes/applicants.py:27,56–61` prints the complete create payload and Supabase response. The request model includes name, email, address, contact number and disability status (`backend/app/models/applicant.py:8–25`). Error paths return raw exception text at lines 86–95 and 128–132.

**Impact/limits:** When this endpoint handles submissions, personal data is copied into application logs with a different access/retention boundary; raw exceptions can also disclose schema/provider details. This is code-confirmed. Whether historical Vercel logs contain submissions was not inspected, and SQL injection or credential leakage through these particular log lines was not demonstrated.

**Remediation/check:** Phase 4.11. Log minimal redacted identifiers/outcomes, restrict log access/retention, and return generic errors with correlation IDs. Exercise successful and failed synthetic submissions locally and assert PII, credentials and raw provider responses are absent from logs and HTTP errors.

### Validation performed and remaining checks

- `npx tsc --noEmit`: passed.
- Targeted Vitest run: **5 files, 51 tests passed** (crypto, document viewing, tracker, document events, rater accounts). Explicitly excluded nested `.worktrees` and `.claude/worktrees`; the initial command also discovered duplicate worktree tests (102 passed). These existing tests establish current behavior, not closure of the security findings.
- Synthetic local reproductions confirmed denied-RPC decryption, local-only password changes, inactive-role metadata fallback, wrong-role status mutation and missing evaluation assignment enforcement. They used source modules/function bodies and in-memory doubles, with no production mutations.
- Read-only catalog/advisor checks and anonymous HEAD responses established the live permissions described above. Aggregate logs were inspected only for available sources; this was **not** a forensic investigation of past access.
- The apparently unsafe credential print template in `QualifiedApplicantsPage.tsx` was not counted as a confirmed deployed XSS finding: the current router uses `QualifiedApplicantsRSPPage`, and the active ranking/shared credential printers escape text. Likewise, missing frontend guards, broad CORS or a function appearing in an advisor were not treated as proof of an independent exploit without tracing the enforcement path.
- Remaining deployment checks: identify the current Vercel production URL/revision, verify the deployed bundle and API authentication behavior, confirm leaked-key retirement through the approved rotation process, inventory encrypted/legacy files, inspect provider/gateway limits and perform an isolated adversarial role matrix. Dependency advisories and historical log/backup exposure were not comprehensively audited in this review.

## November 2 re-verification

**Date:** 2026-11-02. **Source:** upstream `dehandenver/CICTrix` main at `e110977` (pushed 2026-10-30), visibility **public** per `gh repo view`. **Live:** read-only catalog queries on `fyzdfgxaaowjzbjpwrii` returning counts and privilege booleans only; no row values, passwords or keys were read, and the leaked key was not exercised.

| Ref | Status 2026-11-02 | Evidence |
|---|---|---|
| F1 | Open | 26 tracked files hold JWTs: 24 decode to `"role":"service_role"` (`VERCEL_DEPLOYMENT.md` and 23 under `scratch/`), plus `.claude/settings.local.json`. Whether the legacy key is still enabled was not tested. |
| F2 | Open, slightly worse | 81 public tables with RLS off (80 on Oct 27); `anon` holds UPDATE or DELETE on 123 public tables or views. |
| F3 | Open | 56 public-schema policies with a `true` condition for `anon`/`PUBLIC`; `anon` can SELECT `employees`, which has `tin_number`, `sss_number`, `gsis_number`, `philhealth_number`, `pagibig_number`, `date_of_birth`. |
| F4 | Open | `anon` has SELECT on `employee_portal_accounts.password`; 0 of 211 values match a bcrypt prefix (aggregate count only). |
| F6 | Open | `demo_create_account`, `demo_login`, `demo_set_password` executable by `PUBLIC`, `anon`, `authenticated`. Still called from the public `/pm-demo` route. |
| F7 | Open | 10 policies reference `user_metadata`. |
| F8 | Open | `employee-documents` public; `applicant-attachments` private with permissive object policies. |
| F11 | Open | `src/lib/crypto/_internal/keys.ts` still embeds the private key and falls back to it when the key RPC fails. |
| F15 | Open | `undo_document_validation` executable by `PUBLIC`/`anon`; `finalize_ipcr_surfaces` by `anon`. |
| F9/F20 | Open | Business routes with no auth dependency: `GET /api/applicants/`, `POST /api/email/send`, `POST /api/competency-matching/analyze`, `POST /api/competency-assessment/assess`. |

F5, F10, F12–F14 and F16–F21 were not re-tested; nothing merged since October 27 touches their code paths in a way that would close them.

### F22 — High: queue drain endpoint falls back to a secret published in the repo

**Evidence:** `backend/app/routes/competency_assessment.py:601` uses `settings.QUEUE_DRAIN_SECRET or "cictrix-queue-drain-secret"`; `backend/app/core/config.py:36` defaults the setting to `""`. The route has no other auth and drains up to 50 jobs per call with the service-role client.

**Impact/limits:** If the deployment never set `QUEUE_DRAIN_SECRET`, anyone who reads this public repo can trigger service-role processing and paid AI work on demand. Whether production sets the variable was not checked. The comparison is also not constant-time.

**Remediation/check:** Phase 1.6. Fail closed when the secret is unset; compare in constant time; set a random secret in Vercel. Verify an unset secret returns 503 and a wrong one 401, with no queue rows changed.

### F23 — High: known-vulnerable runtime dependencies

**Evidence:** `npm audit --omit=dev` on the upstream lockfile: `dompurify <=3.4.16` (critical, XSS bypasses), `react-router 6.0.0–7.18.1` and `react-router-dom` (high), `ws 8.0.0–8.20.1` (high, memory disclosure and DoS).

**Impact/limits:** Advisory-level. Exploitability depends on how each package is used. The DOMPurify issues need specific hook or custom-element configurations, and no `dangerouslySetInnerHTML` was found in `src`. Not traced call by call.

**Remediation/check:** Phase 1.7. `npm audit fix`, then the full test suite and a portal click-through.

### F24 — Medium: built-in demo employee credential is accepted by the production login

**Evidence:** `src/lib/employeePortalData.ts:257` defines `DEMO_ACCOUNT` (username `employee01`, with a hardcoded password and employee number `EMP-2024-001`). `withDemoAccount` (line 299) injects it into every account list read from localStorage. `handleEmployeeLogin` (`App.tsx:456–459`) falls back to that list when the database lookup fails, with no mock-mode check. The account ships in the public repo and the bundle.

**Impact/limits:** Anyone can open the employee portal with a known credential. On 2026-11-02 no live employee had `employee_number = 'EMP-2024-001'`, so the session links to no real record. Today it adds little beyond the anon access in F3. It becomes an impersonation path if that number is ever assigned to a real person, and it would survive Phase 3 if left in place. Login was not attempted.

**Remediation/check:** Phase 1.6 step 8. Assert that `employee01` is rejected in connected mode.

### F25 — Critical if unset: backend accepts tokens signed with a default secret published in the repo

**Evidence:** `backend/app/core/config.py:25` defaults `JWT_SECRET_KEY` to `"cictrix-default-jwt-secret-key"`. `backend/app/utils/dependencies.py` tries `verify_token` with that secret **first** in both `get_current_user` and `get_authenticated_user`, and takes `role` straight from the token. `require_role` then trusts it. Every authenticated backend route is affected, including hiring, applicant status, employees and evaluations, and these handlers use the service-role client. Nothing in the frontend calls `/api/auth/login`, so the custom-token path is dead code that is still reachable.

**Impact/limits:** If production never set `JWT_SECRET_KEY`, anyone can mint a token with any role and reach every protected backend route. These tokens also ignore `user_roles.is_active` and can't be revoked (compare F16). Whether Vercel sets the variable was not checked, and no token was forged against a deployment. The October 27 review mentions "custom-JWT acceptance" in Phase 3.8 but didn't connect it to the default secret.

**Remediation/check:** Phase 1.6 step 7. Remove the path, or fail closed on the default. Verify that a token signed with the default secret returns 401. *Update 2026-11-05:* `VERCEL_DEPLOYMENT.md` also published a sample `JWT_SECRET_KEY`. It is gone from the tree but stays in Git history, so if Vercel uses that value, replace it.

## November 2 critique of the plan

The plan was largely written by another agent (October 15–27). Each claim below was checked against upstream `e110977` and the live project on 2026-11-02, and the plan was corrected where the evidence differed. Claims not listed held up, including F1–F4, F8, F11, F13–F15, F16 (`is_rsp_admin` still ignores `is_active`; `is_super_admin` treats a null `is_active` as active), F17's evaluation TODO, F18, F21 and the Phase 4.6 view analysis.

| Ref | Plan said | System shows | Change made |
|---|---|---|---|
| K1 | F6: demo RPCs reset "anyone's" password and create accounts "with any role" | They write only `public.accounts`, which has 0 rows and is used only by `/pm-demo` | F6 downgraded to Medium and reworded; Phase 1.3 keeps the revoke. The first draft of this plan and the review chat repeated the overstatement. |
| K2 | F7: 10 policies let any signed-in user act as admin | 3 of those tables have RLS off, so their policies never run; the other 7 need an Auth session, and there are 5 Auth users, all staff | F7 reworded as staff-to-admin escalation |
| K3 | F12/F13/F7 assume an attacker "with any valid Supabase Auth account" | No sign-up flow in the frontend; sign-up setting not visible through SQL | Added Phase 1.2 step 0b: disable sign-up. It's cheap and removes the prerequisite for three findings. |
| K4 | Phase 1.1–1.2: rotate keys, then update Vercel and redeploy | `supabase==2.4.2` rejects `sb_secret_…` keys with `Invalid API key` (tested locally) | Added Phase 1.2 step 0: upgrade supabase-py before rotating |
| K5 | Phase 3.8: "remove unused custom-JWT acceptance" | That path verifies tokens with a default secret published in the repo, before Supabase verification | New F25, moved into Phase 1.6 |
| K6 | F19 covers local credential fallbacks | The fallback also includes a hardcoded demo account | New F24, Phase 1.6 |
| K7 | 18 anon-executable definer functions | 24, of which 11 are triggers; 3 callable ones write IPCR data and weren't named | Phase 1.3 table extended |
| K8 | Revoke password column access | `select('*')` on those tables would start failing | Phase 1.5 step 4 added |
| K9 | Advisor counts: 79 RLS-off, 44 mutable search path | 80 and 45 (advisor); 81 RLS-off by catalog; 7 tables have policies with RLS disabled, which the plan never mentions | Counts updated. The 7 tables show policies that were written but are not enforced, so check them in Phase 4. |
| K10 | Source line numbers | They match the `b1594a2` baseline; several moved by `e110977` (e.g. F19) | F19 updated; other references should be re-read at implementation time |

## November 5 update: leaked key files removed

**Date:** 2026-11-05. **Source:** upstream `dehandenver/CICTrix` main at `cd71e17`, merged through [PR 98](https://github.com/dehandenver/CICTrix/pull/98) and deployed to production. **Live:** read-only catalog and API-key metadata checks on `fyzdfgxaaowjzbjpwrii`. The leaked key was not used. Plan: [remove leaked key files](2026-11-05-remove-leaked-key-files.md).

**What shipped.** This covers the Supabase JWT part of Phase 2 step 1, and it ran before rotation because it was cheap and independent. It doesn't replace Phase 1.

- All 40 `scratch/` files and `.claude/settings.local.json` are untracked. The local copies stay on disk, and `.claude/settings.local.json` is now ignored and redacted locally. The `scratch/` copies still hold the key.
- `VERCEL_DEPLOYMENT.md` uses placeholders for the 3 keys and the sample `JWT_SECRET_KEY`.

**What is still open.** Rotation is the only thing that stops the key working. Until Phase 1.2 finishes, it stays usable from Git history, forks and clones.

| Ref | Status 2026-11-05 | Evidence |
|---|---|---|
| F1, tracked files | Closed on `main` | A search of upstream `cd71e17` finds 0 JWTs, 0 files under `scratch/`, and no `.claude/settings.local.json`. |
| F1, key validity | Open | The live legacy anon key matches the leaked anon key and the legacy keys are not disabled, so the leaked `service_role` key almost certainly still works. This is inferred, not tested. The key has been public since 2026-05-21. |
| F2 | Open | 80 RLS-off tables with anon grants, including `supervisors`, which has a `password` column. |
| F4 | Unchanged, one limit | Anon can't read the credential columns on `office_role_assignments`. |
| F11 | Open | The document private key is still in `src/lib/crypto/_internal/keys.ts` and `supabase/migrations/20261026102622_document_encryption_keys.sql`. |
| F25 | Open | The sample `JWT_SECRET_KEY` stays in Git history. Whether Vercel uses that value or the code default is unchecked. |

**Not checked:** the contents of `Trsha11102004/CICTrix`, upstream's GitHub Actions secrets, Vercel's environment variables and the Supabase logs (Phase 1.8).

**Everything that uses the keys.** Phase 1.2 has to cover each of these before step 4 disables the legacy keys.

| Connection | Key | Reads it from | Rotation action |
|---|---|---|---|
| Frontend (`src/lib/supabase.ts`) | anon | Vercel build env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Update Vercel, rebuild |
| Backend on Vercel (`api/index.py`, `backend/app/core/supabase_client.py`) | anon, service role | Vercel env `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Update Vercel, after step 0 |
| GitHub Action (`competency-assessment-queue.yml`), every 30 minutes | anon, service role | Repo secrets of the same names. They exist on the fork; upstream is unchecked. | Update each repo that runs it |
| Local queue listener (`run-queue.bat`, `backend/run_competency_queue.py`) | service role | `backend/.env` | Update `backend/.env` |
| About 17 `scripts/*.mjs` and the root one-off scripts | anon or service role | `.env`, `.env.seed`, `backend/.env` | Update env files |
| Each collaborator's env files | both | `.env`, `.env.local`, `backend/.env` | Each person updates theirs |
| Supabase Edge Functions | none | 0 deployed | Nothing |

**Changes to this plan.** Phase 1.2 step 3 now covers GitHub Actions secrets, which it had missed. Phase 2 step 1, the F1 row, F25 and the first risk reflect the removal.

**Next step.** Phase 1.2 step 0: upgrade `supabase==2.4.2`, then rotate.

Useful references: [Supabase API key rotation](https://supabase.com/docs/guides/api/api-keys), [RLS-disabled advisor remediation](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public), [mutable-search-path remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [metadata-policy remediation](https://supabase.com/docs/guides/database/database-linter?lint=0015_rls_references_user_metadata), [PostgreSQL function privileges](https://www.postgresql.org/docs/current/sql-grant.html).
