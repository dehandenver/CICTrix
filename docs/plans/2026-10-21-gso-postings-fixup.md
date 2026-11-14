---
title: Bring the General Services Office up to the imported-office standard
date: 2026-10-21
status: Done
summary: The 25 GSO seats exist live but went in bare. Add the office, weighting C and its divisions, fill every post's CSC qualifications, duties, documents and summary, and open the 5 vacant posts with dates, in one transactional SQL file.
spec: Chat decision 2026-10-21 (recommendations accepted). Follows docs/plans/2026-10-20-import-sheet-job-postings.md.
---

## Goal

The Office of the City General Services Officer works like the other four imported offices. It's a real office in `departments`, with IPCR weighting and divisions. Its 24 posts carry full posting content. Its 5 vacancies appear on the public list.

## Findings (live, 2026-10-21)

- All 25 seats from the GSO sheet already exist, with the right labels (112–150), titles, divisions, SGs and filled/open statuses, across 24 posts. Supply Officer I has seats 124 (filled) and 125 (open).
- There is **no `departments` row** for GSO, so no weighting and no divisions.
- Every GSO post has empty education, eligibility, training, duties, documents, summary and posted-by, with experience 0. The 5 posts with a vacant seat are **On Hold** with no dates, so they're hidden from the public vacancy list.

## Decisions

| # | Decision |
|---|---|
| G1 | Office name stays exactly as the posts store it, "Office of the City General Services Officer" (lowercase "the"). Renaming would mean updating every post. Code `OCGSO`, active, weighting C. |
| G2 | The 5 divisions become child departments. "Executive & Administrative Division" becomes "(OCGSO)" because other offices share the name. |
| G3 | Posts are **updated in place**, matched by office and title, so post and seat IDs are kept. The content comes from the same CSC rules and Faker wording as the 2026-10-20 import, plus GSO families: GSO head (LGC: degree in public or business administration, Professional eligibility, 5 years), supply officer, building official (RA 1080 Civil Engineer or Architect), transport regulation officer, driver, plumber, mechanic, heavy equipment operator. |
| G4 | Posts with a vacant seat become **Open**, with deadlines 14–28 days after 2026-10-21 and start dates after that. Filled-only posts stay **Closed** with no dates. |
| G5 | The sheet's head note "Department Head (Registered Social Worker)" is treated as "Department Head". It looks copied from the Social Welfare sheet. |
| G6 | Employees and succession for GSO are added to `docs/plans/2026-10-21-import-employees.md` (D25), not here. |

## Steps

1. `scripts/gso-postings-fixup/` holds `gso_sheet.csv` (from the GSO sheet screenshot; no personal data), `generate.py` (reuses `scripts/import-sheet-postings/generate.py`) and the generated `gso_postings_fixup.sql`.
2. Generate and review: 24 posts (5 Open), 5 divisions, and identical output on every run.
3. Commit, then push to the fork and open a PR on `dehandenver/CICTrix`.
4. The user runs the SQL in the Supabase SQL editor. Then run read-only checks.

## Risks

- **Guards stop the run** if the GSO office already exists, if any of the 25 seats isn't found with its expected label, title and status, or if the number of GSO posts isn't 24. If someone edits GSO seats first, regenerate.
- The Supply Officer I post opens, so applicants see seat 125 open and 124 struck through. That's existing behaviour for mixed posts.

## Checks to run

- After the run (read-only): `departments` has OCGSO plus 5 child divisions and active weighting C. All 24 GSO posts have qualifications and posted-by. Exactly 5 are Open, with deadlines.
- Browser: the public vacancy list shows 119, 125, 131, 140 and 149. The office filter and the office directory list "Office of the City General Services Officer" with its 5 divisions.

## Status check 2026-11-12

Done. The SQL ran live and all 24 posts carry full content. Today 0 GSO posts are Open (G4 expected 5), most likely closed by the later vacancy open/close work; see `docs/session-summaries/2026-10-21-gso-postings-fixup-summary.md`.

Automated checks on `origin/main` (`cd71e17`): `npx tsc --noEmit` clean; `npx vitest run` passes 635 files and 5,479 tests, including the promotion smoke tests; `npm run check:migrations` OK (130 files). Vercel built and deployed `cd71e17` to production on 2026-11-05. A local `npm run build` fails on this machine because esbuild cannot delete its own temp files; the code compiles.
