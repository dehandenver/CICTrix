---
title: Semester IPCRs for succession planning
date: 2026-10-25
status: In Progress
summary: Seed completed semester IPCRs tailored to each employee's position, and fix the succession pool so the incumbent, same-title peers and other departments are never ranked as successors.
---

## Goal

Make succession planning name a correct, ranked successor for each critical
position. Two defects block that: 39 active regular employees have no IPCR
(they score 0 on the 30% performance criterion), and `listAutoSuccessors`
ranks the incumbent, same-title peers and other offices as successors.

## Settled decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Data | Demo data; synthetic IPCRs are acceptable. |
| 2 | Scope | Two changes and two PRs: an IPCR data migration, and a code fix. |
| 3 | Cycles | Cycle 5 becomes Jul–Dec 2025. New cycles for Jan–Jun 2025 and Jan–Jun 2026. Cycle 2 becomes Jul–Dec 2026, Active and empty. |
| 4 | Semesters per employee | Only semesters the employee was hired on or before the first day of. Probationary and 2026 hires get none. |
| 5 | Content | Position-tailored Core MFO and indicator; Strategic and Support stay office-level; scope scales with position level; ratings are independent of credentials. |
| 6 | Ratings | Stable per-employee baseline (kept from the existing 78), ±0.3 drift, slight upward trend, about 73% Very Satisfactory and 27% Outstanding, none below 3.5, deterministic. |
| 7 | Audit fields | `rated_by` is the employee. `approved_by` and `phase2_approved_by` are the department head, on new rows and the existing 78, filling empty values only. Heads' own IPCRs and offices without an active head stay empty (`target_settings_no_self_approval`). |
| 8 | Transition row | `semester_transition_state` is left alone. |
| 9 | Succession pool | Same department only; exclude the incumbent and anyone holding the same title. Manual nominations are unaffected. |
| 10 | Done means | Run the real succession logic on every critical position and report the qualified count per position. Empty positions are reported with the blocking gate; no credential data is changed to force a result. |

## Approach

### PR 1 — data migration (`supabase/migrations/20261024174932_seed_semester_ipcrs.sql`)

1. Update `performance_cycles`: retitle and re-date cycles 5 and 2, insert the two new cycles. Titles use the "January–June 2025" form that `normalizeSemesterKey` parses.
2. One `DO` block selects employees at runtime (active, Regular/Permanent, `deleted_at is null`, hire date on or before the semester start, no `target_settings` row for that cycle). No hardcoded IDs.
3. Insert `target_settings` → `mfos` → `success_indicators` → `success_indicator_ratings`, all idempotent. Timestamps fall inside each semester and after the hire date.
4. Core MFO text comes from a position-title template; Strategic and Support come from the existing office templates; the 50/50/0 office gets no Support MFO.
5. Fill empty `approved_by` / `phase2_approved_by` with `departments.head_employee_id` where the head is active and is not the employee.
6. End-of-block assertions fail the migration on a rating outside 1–5 or an IPCR without its MFOs.

### PR 2 — succession pool fix

`listAutoSuccessors` in `src/lib/api/succession.ts`: restrict the pool to the position's department, exclude the incumbent, exclude employees whose position title equals the target's. The rule lives in a small tested helper in `successionCriteria.ts`.

## Steps

1. Save this plan; branch `feat/semester-ipcr-seed` from `main`.
2. Gather positions, office templates, department heads.
3. Write the migration.
4. Dry-run the selection and counts with read-only SQL.
5. Run checks; commit PR 1.
6. Branch for PR 2; failing tests first, then the fix.
7. Run checks; commit PR 2.
8. After merge: row counts, roll-up recompute, 33-position succession run.

## Risks

- The migration runs on production when PR 1 merges. It cannot be hand-applied, and Supabase MCP writes are declined here, so post-merge verification waits for the merge.
- Fifteen source files read `performance_cycles`; check none depends on cycle id order or the old titles.
- The existing 78 keep `approved_at` in Jan 2025 although relabelled Jul–Dec 2025. Everyone with an older record also gets Jan–Jun 2026, which is newer, so ranking is unaffected.
- The real succession run needs working Supabase credentials; the legacy anon key was disabled on 2026-09-24.
- Employee data changes outside this work; counts here were taken on 2026-10-25 and will drift.

## Checks to run

- `npm run check:migrations`
- `npx tsc --noEmit`
- `npx vitest run`
- `npm run lint`
- Read-only SQL: new-row counts per cycle, ratings in 1–5, no employee with two rows per cycle, approver rules, roll-up equals `getLatestOverallScores`.
