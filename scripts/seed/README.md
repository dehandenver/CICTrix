# RSP HRMO dataset reset

Replaces **all** data in Supabase with the RSP HRMO Dataset Report (550 rows),
without changing app behavior. Schema changes are **additive only** (new tables +
nullable columns), so existing code keeps working.

## Files
- `dataset.json` — departments, divisions, job_postings, employees, archives
- `applicants.json`, `applicant_scores.json`, `exam_interview_schedules.json` — the 150-row tables
- `generate.mjs` — turns the JSON into one transactional SQL script (handles escaping, dates, address splitting)
- `dataset_reset.sql` — **the generated output you run**

## Regenerate
```
node scripts/seed/generate.mjs
```

## Apply (destructive — back up first)
1. In Supabase → **Database → Backups**, take a manual backup (or export the tables you care about).
2. Open **SQL Editor**, paste the entire contents of `dataset_reset.sql`, and **Run**.
   It runs in a single transaction: adds new tables/columns → `TRUNCATE … CASCADE`
   (wipes every data table) → reloads the dataset → `COMMIT`. If anything fails,
   nothing is applied.

## What gets loaded
| Table | Rows | Notes |
|---|---|---|
| departments | 5 | + `department_head_name` (surname, not linked to an employee) |
| divisions | 20 | new table |
| job_postings | 30 | + division, supervisor, salary_grade, employment_status, no_of_vacancies, date_posted, application_deadline |
| applicants | 150 | + `applicant_ref` (ABYAN id), `additional_months`; `status` from the scores sheet |
| applicant_scores | 150 | new table (Educ/Exp/Perf/Written/Potential/PCPT/Oral/Overall + status) |
| exam_interview_schedules | 150 | new table (Written Exam / Panel Interview rows) |
| employees | 25 | + division, highest_educational_attainment, eligibility |
| archives | 20 | new table |

New tables/columns are keyed by the dataset's natural IDs (`DEPT-…`, `DIV-…`,
`PLANTILLA-…`, `ABYAN-…`, `EMP-…`, `ARCHIVE-…`), so relationships are preserved
without UUID remapping.

## Known reconstructions
- Employee `eligibility` for the 5 Formal Profiles was truncated in the PDF
  ("CSC S… Profes", "RA 10…"); reconstructed to standard CSC values
  (CSC Sub-Professional / CSC Professional / RA 1080 (Board Passer)). Verify if exact text matters.
