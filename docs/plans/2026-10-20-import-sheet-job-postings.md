---
title: Import the office plantilla sheet as job postings
date: 2026-10-20
status: Done
summary: Turn the four-office plantilla Google Sheet into job postings, plantilla slots, a new Social Welfare office and per-office divisions, with Faker filling the qualification fields inside CSC rules, and keep divisions out of office lists.
spec: Grilling session 2026-10-20 (decisions D1–D12 below)
---

## Goal

The plantilla sheet (City Engineer, City Accountant, City Health, City Social Welfare) lands in the live database as real job postings an admin can open and close, under offices and divisions the rest of the system shows correctly. The sheet only carries item no., title, division, SG, status and a function line; every other posting field is generated, and generated values must read as genuine Philippine LGU postings.

## Decisions

| # | Decision |
|---|---|
| D1 | Import **every** sheet job row (~106). VACANT → posting `Open`; FILLED → posting `Closed`. |
| D2 | Offices use the existing `departments` names: Office of The City Engineer, Office of The City Accountant, Office of The City Health Officer. |
| D3 | New office **Office of The City Social Welfare and Development Officer** (code `OCSWDO`), active, with an active `department_weighting_configs` row on option **C** (30/50/20). No head yet; employees come in a later import. |
| D4 | Plantilla item numbers are stored **exactly as written** in the sheet (`42`, `117`) in `plantilla_slots.item_number` and mirrored to `job_postings.item_number`. The script aborts on any duplicate within the sheet or against the database. |
| D5 | Sheet fixes on rows 98, 103, 108, 110 only (title of row 98, function line of row 103, division of row 108, title of row 110). Rows 47 and 89 stay as written. Rows 114–117 are skipped: no item number. Office header and separator rows only set the current office. |
| D6 | Divisions become **child rows** in `departments` (`parent_department_id` = office). A division name used by more than one office gets the office code appended, e.g. "Executive & Administrative Division (OCA)". |
| D7 | Code: office lists read top-level departments only; job posts display "Division · Office". |
| D8 | Qualifications come from CSC-style rules by job family and SG (education, eligibility, experience, training). Faker (`en_PH`, fixed seed) only varies summaries, duty picks from per-family pools, and dates. |
| D9 | Critical Flag is **not** imported here; it goes into Succession Planning with the employee import. |
| D10 | FILLED rows: slot status `filled` (no applicant link yet); posting gets full qualifications, duties and documents but no deadline or start date. |
| D11 | Required documents: the seven the application form enforces (Application Letter, PDS with photo, Proof of Eligibility Rating/License, Certificate of Relevant Training/Seminars, Transcript of Records, Drug Test Result, Government-Issued ID). `posted_by` = `HR Admin`. |
| D12 | A Python generator writes one transactional SQL file; the user reviews it and runs it in the Supabase SQL editor **after** the D7 code fix is deployed. |

Monthly salary is not generated: it is Step 1 of `salary_grades` for the row's SG, matching existing postings.

## Steps

1. Branch `feat/import-sheet-postings` off `main`; save this plan.
2. D7 code fix: filter `parent_department_id is null` in `listDepartments`, `getDepartments`, compliance, L&D archive, succession summaries and the office directory rows; `formatOfficeLabel` and the applicant wizard show "Division · Office". Tests for the label and the filter.
3. `scripts/import-sheet-postings/` generator: reads a CSV export of the sheet, applies D5, builds rows per D1–D11, writes `import_sheet_postings.sql`.
4. Generate the SQL and review it: counts, constraint values, sample rows per office.
5. Type-check, lint, tests; commit code fix and generator separately.
6. User deploys the code fix, then runs the SQL. Read-only verification queries afterwards.

## Risks

- **Ordering.** Running the SQL before the D7 fix is live shows ~20 division rows as offices in every dropdown.
- **Fuzzy applicant matching** in `JobPostingsPage` compares `division || department` to an applicant's office. Item-number matching runs first and covers these postings, so only legacy free-text applicants could miss.
- **Generated content** is plausible, not official. Admins should treat qualification text as a draft until HR confirms each position's Qualification Standards.
- **Pending migration 20260928** (plantilla labels) isn't applied live. Nothing here depends on it.

## Checks to run

- `npx tsc --noEmit`, `npm run lint`, `npm test`.
- Generator: row counts per office and status, no duplicate item numbers, every status/slot value inside its CHECK set, every SG has a salary.
- After the SQL runs: read-only counts of postings, slots, departments and weighting config; spot-check the RSP job list, public vacancy list and office directory.

## Status check 2026-11-12

Done. Code fix, generator and live import verified; see `docs/session-summaries/2026-10-20-import-sheet-job-postings-summary.md`.

Automated checks on `origin/main` (`cd71e17`): `npx tsc --noEmit` clean; `npx vitest run` passes 635 files and 5,479 tests, including the promotion smoke tests; `npm run check:migrations` OK (130 files). Vercel built and deployed `cd71e17` to production on 2026-11-05. A local `npm run build` fails on this machine because esbuild cannot delete its own temp files; the code compiles.
