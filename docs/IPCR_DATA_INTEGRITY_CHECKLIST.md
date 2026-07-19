# IPCR Data Integrity Checklist (§7)

Verified 2026-07-19 against the live Supabase project. Every line below was
checked by query, not by assumption. Re-run the checks before a demo — several
of these degrade silently when a bad row lands.

## Status

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | All 51 non-head employees have 4 complete, rated semesters | **PASS** | 51/51 cover all four canonical periods |
| 2 | Legal in Phase 1; all other offices in Phase 2 | **PASS** | Legal 10 `draft`; IT 11, Accountant 10, Engineer 10, Health 9 `approved` |
| 3 | Summary of Ratings reads real seeded history, not defaulting low | **PASS** | Mean 4.227 / 5; 0 rows outside canonical periods |
| 4 | Gap analysis / training needs runs against seeded data via the API | **PARTIAL** | View returns 168 rows for 52 employees, but **0** flagged `training_needed` — see Known issue 1 |
| 5 | Office weighting recorded and applied per office | **PASS** | 5/5 active offices on option C; split now drives `computeOverallScore` on both the employee save and the PM roll-up |
| 6 | Office accounts show My IPCR Workspace / Training locked-with-note | **PASS** | `OfficeAccountLockedNote` gated on `isOfficeAccount` |

Supporting counts: 805 `ipcr_performance` rows, 183 MFOs, 212 success indicators.

## The canonical rating periods

Only these four count toward any rating aggregate:

```
Jan 1-Jun 30 2024   Jul 1-Dec 31 2024   Jan 1-Jun 30 2025   Jul 1-Dec 31 2025
```

Defined once in `src/lib/ipcrPeriods.ts`. An unrated, in-progress period must
never be added — that is exactly what drags averages down.

## Known issues

### 1. Gap analysis finds no gaps (blocks the training-needs feature)

`v_competency_gap_analysis` returns 168 rows but flags **nobody** as needing
training. Every `final_gap_indicator` is negative (range −1.20 to 0.00).

Cause: `required_proficiency` is a flat **3** for every competency and position,
while seeded possessed proficiency runs 4.0–4.6. Raising the ratings baseline so
Summary of Ratings would not read low — the correct call for that requirement —
removed every gap as a side effect, because the bar never moves.

Consequence: the L&D Training Needs Assessment, the IPCR→L&D recommendation
pipeline, and the PM gap narrative all have nothing to show, even though the
data pipeline itself works end to end.

Agreed fix: vary the requirement by position level (junior at or below 3,
mid-level 3.5–4, senior/supervisory 4–5), so a senior role is held to a senior
bar. Lowering seeded ratings instead would reintroduce the "Summary of Ratings
reads low" problem and is off the table.

**Blocked.** The obvious place to express that is
`position_competency_requirements` (`position_title` + `competency_id` +
`proficiency_level`, a text scale of Basic / Intermediate / Advanced). It does
not drive the view. Probed directly on 2026-07-19: writing Basic, then
Intermediate, then Advanced for `Attorney IV` / competency 2 left
`required_proficiency` at exactly `3` in all three cases, unchanged from having
no row at all. The probe was reverted; the table is back to its original 10 rows.

So `required_proficiency` is computed inside `v_competency_gap_analysis` from
something other than that table, and the mapping cannot be read from this repo —
the view is defined directly in Supabase. Re-tiering the requirements table
would write hundreds of rows and change nothing.

Black-box mapping of the view narrowed it further (2026-07-19):

* `required_proficiency` takes only three values: `3`, `3.5`, `4`.
* It varies **per employee, not per position**. Two `Midwife II` employees on the
  same competency get different requirements — EMP-130 gets `4`, EMP-2026-013
  gets `3`. So no position-level table can be the sole input.
* Only **5 of 52** employees have anything other than a flat `3`: EMP-130 to
  EMP-134, the original pre-seed employees. All 47 seeded employees are flat `3`.

That last point matters for the rank-suffix plan: whatever drives the variation
is attached to those five legacy records, not to position title or rank. Tiering
by rank suffix cannot be expressed through any table reachable from here until
the view shows where the requirement actually resolves from.

This item cannot progress until the view definition is captured:

```sql
select pg_get_viewdef('v_competency_gap_analysis'::regclass, true);
```

Note also that the scale is three text values, so if the view maps Advanced to
4, no requirement can express the 4–5 senior band without changing the view or
the scale.

### 2. `target_settings.status` value outside its CHECK constraint

One City Health employee's row has `status = 'submitted_for_approval'`, which is
not in that column's CHECK list (`draft` / `submitted` / `approved` / `rejected`).
Either the constraint was altered live or the row predates it. Harmless today,
but it will fail validation if anything re-asserts the constraint. Left in place
deliberately — guessing between a live constraint edit and a stale row risks
masking a real migration-drift bug.

### 3. Seeded supervisor passwords in migration `010`

Seeded supervisor passwords (`pm123` / `lnd123`) remain in
`backend/database/migrations/010_create_supervisors.sql`. Not bundled or
exploitable today since the table is not used for auth, but it should be
scrubbed, or the migration retired, if the Supervisor model is ever revived.

### 4. Weighting options A and B would zero-weight real work

All five offices file Core, Strategic **and** Support MFOs. Option A sets
Support to 0 and option B sets Strategic to 0, so moving any office onto them
today discards rated work. All five are on C. A and B remain selectable — that
is an operational choice, not a bug — but nothing should sit on them while the
function mix looks like this.

## Resolved

### Hardcoded admin credentials in the shipped bundle — RESOLVED 2026-07-19

`MOCK_USERS` in `LoginPage.tsx` compiled working super-admin, RSP, PM and L&D
passwords into the public JS bundle, readable by anyone with devtools. All four
roles now authenticate against Supabase Auth with the role read from
`user_roles`, and the table is deleted rather than trimmed.

Verified against the live production bundle: `admin123`, `rsp123`, `pm123`,
`lnd123`, `Admin@123`, `RSP@123`, `PM@123`, `LND@123`, the `@abyan.gov.ph`
addresses and the `MOCK_USERS` symbol are all absent.

Note when re-verifying: check the bundle hash actually corresponds to your
build. During this work the deploy briefly served both a newer bundle from an
unrelated commit and, later, an older cached one — either would have produced a
false result if trusted without re-checking.

### Portal JWT gap — RESOLVED 2026-07-19

Backend-gated endpoints were unreachable from the admin portals: `require_role`
accepted only custom JWTs, which the portals never had. It now accepts Supabase
session tokens via `get_authenticated_user`, which resolves the role from
`user_roles` rather than defaulting to `RSP` when none is present — an
unresolved role is rejected instead of silently granted.

Verified end to end against production: PM and L&D can set a split; super-admin
and RSP get 403; an invalid code gets 400; no token gets 401; previous configs
are retained rather than overwritten.

## Re-running the checks

```bash
node scripts/seed-ipcr-historical-4sem.mjs   # 4 closed semesters, idempotent
node scripts/seed-ipcr-current-targets.mjs   # current-cycle targets from history
node scripts/seed-office-weighting.mjs       # office weighting, idempotent
node scripts/create-admin-accounts.mjs       # admin accounts (--rotate to reset)
```

Still outstanding: `v_competency_gap_analysis` is defined directly in Supabase,
not in this repo, so it cannot be reviewed or period-scoped from here. Capture it
with:

```sql
select pg_get_viewdef('v_competency_gap_analysis'::regclass, true);
```
