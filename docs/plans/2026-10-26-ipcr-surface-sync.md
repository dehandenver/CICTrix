---
title: Sync every IPCR surface from the authoritative record
date: 2026-10-26
status: Done
summary: Make a finished Phase 1/2 IPCR land in every derived store, backfill the 272 seeded IPCRs through the same function, and fill the missing accomplishment text, so the Summary of Ratings, tracker, vault, PM dashboard, archive and RSP all read real data.
---

## Goal

When this is done, opening Summary of Ratings shows every seeded employee with a rating and a completion count, not 0 of 130. IPCR Management 2.2 shows each one at "Forwarded to PM", 2.3 shows frozen targets instead of "Not in Vault", 2.4 has history, the PM dashboard and reports have evaluation rows, the archive lists three semesters, and RSP reads those employees as having a closed IPCR. Every new IPCR reaches the same state the moment Phase 2 is finalized, without anyone remembering to run a script.

Governing decision: `target_settings` is the record of truth. `ipcr_performance` is the read model the Summary of Ratings and the archive read, and this work keeps it populated. Verified store-by-store in [ipcr-data-map.md](../ipcr-data-map.md), which also lists the failure modes this plan has to survive.

## Approach

Root cause. The seed migration wrote `target_settings`, `mfos`, `success_indicators` and `success_indicator_ratings`. A finished IPCR in this app is supposed to leave rows in six further places, and two of those the app itself never writes. The Summary of Ratings reads the one store nobody filled, so it shows 0 of 130.

Settled decisions.

| # | Topic | Decision |
|---|---|---|
| 1 | Authority | `target_settings` is the record of truth. `ipcr_performance` stays the read model for the SoR and the archive, kept populated by the fan-out. |
| 2 | Sync trigger point | The fan-out runs automatically when a Phase 1/2 IPCR reaches `phase2_status = 'completed'`. |
| 3 | Ownership of legacy rows | The fan-out tags its own rows `IPCR-TS-<period>-<employee_number>` and deletes only those. If untagged rows exist for that employee and period, it writes nothing. No live writer exists for that table today, so this is a safety net for historical rows, not a live conflict. |
| 4 | Semesters | All three completed semesters, so the archive keeps its history. |
| 5 | Ratings label | The page stops claiming January–June 2025 and says "All rated periods", because it averages every period it reads. |
| 6 | Competencies on mirrored rows | Null. No Gemini matcher run; the drill-down breakdown stays empty. |
| 7 | `performance_evaluations` | Written, `status = 'Approved'`, `final_score` from the mean. |
| 8 | `ipcr_submissions` | One row per phase (`target`, `rating`) at `Forwarded to PM`, period = cycle title. |
| 9 | `locked_targets` | One frozen set per employee and cycle. |
| 10 | Accomplishments | Generated in a separate forward migration, tailored by position family and level, wording scaled to the row's own score. |
| 11 | Implementation shape | One SQL function; called by a trigger and explicitly by the app, so failure is visible. No TypeScript reimplementation. |
| 12 | Out of scope | `employee_competencies`, `ipcr_competency_matches`, `ipcr_audit_log`, `ipcr_workspace` creation. |

### The function

`public.finalize_ipcr_surfaces(p_target_setting_id uuid)`, `security definer` with a pinned `search_path`. No-op unless the record is approved with `phase2_status = 'completed'`. Everything it writes is idempotent, so the backfill and any later re-run are safe.

- **`ipcr_performance`** — one row per success indicator. `ipcr_id` = `IPCR-TS-<period>-<employee_number>`, `ipcr_row_id` = `ROW-000N`, `employee_num` from `employees.employee_number`, `rating_period` derived from the cycle dates, `function_type` upper-cased, `target_text` from `success_indicators.description`, `accomplishment_text` from the rating row, Q/E/T copied, `ave_rating` their mean, competency columns null. Deletes its own tagged rows for that key first, then skips entirely if untagged rows exist. Indicators with no Q/E/T at all are skipped, since a null `ave_rating` would vanish from the view anyway.
- **`performance_evaluations`** — inserted only when no row exists for `(employee_id, cycle_id)`.
- **`ipcr_submissions`** — upsert on `(employee_id, period, phase)`, two rows, `forwarded_at` from the record's own timestamps, `updated_by` the approver.
- **`locked_targets`** — inserted when none exists for `(employee_id, period)`, `targets` as `[{function_type, target_text}]`, verified and locked by the approver at `approved_at`.

The legacy label is derived from the cycle's own dates, not from a hardcoded map:

```sql
to_char(start_date, 'Mon FMDD') || '-' || to_char(end_date, 'Mon FMDD YYYY')
-- 2025-01-01 … 2025-06-30  →  Jan 1-Jun 30 2025
-- 2025-07-01 … 2025-12-31  →  Jul 1-Dec 31 2025
-- 2026-01-01 … 2026-06-30  →  Jan 1-Jun 30 2026
```

A hardcoded map would need an edit every semester, which is the failure this whole change exists to end. The function asserts the derived label against the three known semesters during the backfill, so a formatting or `lc_time` surprise fails loudly instead of writing a period the archive filters out.

`ipcr_submissions.period` and `locked_targets.period` take the cycle title, because that is what the app writes and what the tracker and 2.3 look up. `performance_evaluations.period` also takes the title, matching what the app's own (now orphaned) writer used.

### Confirmed against production (probe, 2026-10-26)

- `ipcr_performance`: no CHECK constraints; every column nullable except the bigint `id`; FKs on `employee_num → employees.employee_number` and `competency_id → competency_dictionary`. The mirror skips any employee with a null `employee_number` and raises a notice with the count, rather than failing the batch.
- `ipcr_submissions`: unique `(employee_id, period, phase)`; `period` and `phase` NOT NULL; `stage` CHECK covers `Forwarded to PM`.
- `performance_evaluations`: unique `(employee_id, cycle_id)`, so the insert is `on conflict do nothing`; `status` CHECK covers `Approved`; `final_score` bounded 0–5.
- `locked_targets`: no unique key on `(employee_id, period)`, so the function checks for an existing set before inserting; `targets` and `locked_at` are NOT NULL with defaults.

### The legacy portal form — dead code, not a bug to fix

`handleSaveIPCR` at [EmployeePage.tsx:999](src/modules/employee/EmployeePage.tsx#L999) has no caller, and `isEditingIPCR` and `ipcrSaving` are never read in the JSX. So `saveOrSubmitEmployeeIPCR` is unreachable, which means `ipcr_performance` and `performance_evaluations` have no live writer today. The `remarks` field it would send to a table without that column is therefore latent, not live. Left alone: wiring it up or deleting it is a separate decision, and neither is needed for this change. Recorded in [ipcr-data-map.md](../ipcr-data-map.md).

Consequence for the mirror: the "untagged rows win" rule guards historical data only. Nothing in the running app competes with the fan-out.

### Triggers and backfill

`after insert or update of phase2_status on target_settings`, guarded on the record actually being finalized, calls the function. The backfill calls it once for every already-finalized record.

### Accomplishments

A forward migration fills `success_indicator_ratings.accomplishment` where it is null, redeclaring the seed's position-family table and its four level templates (head, supervisory, senior, staff). Core indicators read in past tense around the position's deliverable phrase; strategic and support use the office's wording. The claim scales with the row's mean: 4.5+ exceeded, 4.0–4.49 delivered in full, 3.5–3.99 delivered with minor revisions. Deterministic, so re-running changes nothing.

### App and copy

- `saveRatings` in `src/lib/api/ipcrRatings.ts` calls the RPC in its completion branch and returns an error if it fails, so a missing fan-out surfaces at the point of action.
- `REPORT_PERIOD` in `src/modules/admin/pm/SummaryOfRatings.tsx` becomes `All rated periods`, used in the landing subtitle and the drill-in, with the per-row period column reading "All periods".
- `Jan 1-Jun 30 2026` joins `CANONICAL_RATING_PERIODS` in `src/lib/ipcrPeriods.ts`, or the archive filters out the newest semester.

## Steps

1. Branch `feat/ipcr-surface-sync` from `main`.
2. ~~Read-only probe~~ Done 2026-10-26; results in "Confirmed against production" above and in [ipcr-data-map.md](../ipcr-data-map.md).
3. Migration one, via `npx supabase migration new fill_ipcr_accomplishments`: the accomplishment backfill, with an assertion that no seeded rating row is left null.
4. Migration two, via `npx supabase migration new finalize_ipcr_surfaces`: the function, both triggers, and the backfill loop over the 272 records. Assertions inside it raise rather than leave half-written stores.
5. App changes: the RPC call, the label copy, the canonical period, plus a test for the service's error path.
6. Normalise the semester key in `getEmployeeHistory` (`performanceHistory.ts`) with the exported `normalizeSemesterKey`, so the three spellings of one semester render as one cycle on 2.4 instead of two half-filled ones. Test with the two conventions.
7. Read-only verification queries against production after merge, then a click-through of the seven screens listed under Goal.
8. Session summary at `docs/session-summaries/2026-10-26-ipcr-surface-sync-summary.md`, then regenerate the plans index.

## Risks

- **The migrations cannot be executed before merge.** No local Postgres; Supabase MCP writes are declined. Mitigation: keep the function small, make every write idempotent, assert counts inside the migration, and dry-run the selection with a read-only query first.
- **Unknown constraints.** `ipcr_performance` and `performance_evaluations` have no DDL in this repo. A violated CHECK would abort the backfill. Step 2 exists to find them before writing.
- **Two writers on `ipcr_performance`.** Not true today: the only other writer is dead code. The tagging rule protects historical rows if that form is ever wired back up; a mistake there shows up as duplicated rows for one employee and period.
- **One semester, three spellings.** `ipcr_performance` stores `Jul 1-Dec 31 2025`, the tracker and vault store `July–December 2025`, and the evaluation row stores the title. Any screen merging them on the raw string splits the semester in two. 2.4 does exactly that, hence step 6.
- **`performance_evaluations` has no live writer.** The PM dashboard, PM reports, 2.4, the succession transfer tool and analytics all read it. The fan-out fills it for these 272 records and for every later finalize; nothing else does. If the RPC call is ever removed from `saveRatings`, those screens go quiet again with no error.
- **Trigger scope.** An unguarded trigger would fire on draft saves and rewrite rows repeatedly. The guard is the `phase2_status` transition.
- **A blended rating.** The page will average three semesters per employee, which is what the new label states. If a single-semester figure is ever needed, the view has to expose `rating_period` first; it is defined in Supabase, not this repo.
- **Deploy order.** The function does not exist yet, so if the front end ships before the migration applies, finalizing an IPCR reports an error. The rating itself is saved and the fan-out is idempotent, so a retry after the migration lands fixes it; the trigger covers the same transition once it is in place.
- **`ipcr_workspace` stays untouched**, so the employee portal's workspace and PDF remain blank for these semesters. Documented, not fixed here.
- **The archive will only ever hold three semesters.** `ipcr_performance` is confirmed empty, and the 805 rows the July checklist recorded were truncated, most likely by the dataset reset. Nothing upstream of 2024 survives to mirror.
- **A reopen leaves the mirror behind.** Returning a finalized Phase 2 for revision sets `phase2_status` back to `in_progress`; the mirrored rows stay until the record is completed again. The function's delete-and-reinsert covers the re-complete case, not the abandoned one.

## Checks to run

- `npm run check:migrations` (two new files, no version drift)
- `npx tsc --noEmit`
- `npx vitest run` (service error path, `ipcrPeriods` period list). Baseline on this checkout: 29 tests in 26 files fail before any of this work, all with `Invalid Chai property` or jest-dom matchers not registering. The count is identical with and without these changes, so the suite is not a regression signal here; `tsc` is the gate that works.
- `npm run lint` — known to fail on `main` for want of an ESLint config; note the result rather than fixing it here
- Read-only SQL after merge: `ipcr_performance` rows and distinct employee count per period; zero rows whose `employee_num` has no `employees` match; `ipcr_submissions` two rows per finalized IPCR; `locked_targets` one set per employee and period; `performance_evaluations` one row per employee and cycle; no null `accomplishment` among seeded ratings; every `rating_period` matches the derived label and appears in `CANONICAL_RATING_PERIODS`
- Manual pass: Summary of Ratings landing and drill-in, IPCR Management 2.2, 2.3, 2.4 (each semester listed once, not twice), PM dashboard, IPCR archive, RSP promotional eligibility
- Failure path: force an RPC error once in staging or with a bad id, and confirm `saveRatings` reports it rather than finalizing silently

## Status check 2026-11-12

Done. Migrations, RPC wiring and backfill are live; see `docs/session-summaries/2026-10-26-ipcr-surface-sync-summary.md`. The manual seven-screen pass and an RPC error-path test were not done.

Automated checks on `origin/main` (`cd71e17`): `npx tsc --noEmit` clean; `npx vitest run` passes 635 files and 5,479 tests, including the promotion smoke tests; `npm run check:migrations` OK (130 files). Vercel built and deployed `cd71e17` to production on 2026-11-05. A local `npm run build` fails on this machine because esbuild cannot delete its own temp files; the code compiles.
