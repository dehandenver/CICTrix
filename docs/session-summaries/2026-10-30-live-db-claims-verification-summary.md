---
title: Live database check of handoff claims
date: 2026-10-30
summary: A read-only check of claims from another agent's handoff against the live Supabase database. applicants.total_score is missing and no applicants have status Reviewed. The training and IPCR counts match. The employee figures in the handoff and in the seed test don't measure the same thing as a plain employee count, so the test is the problem, not the data.
---

## Outcome

Five claims were confirmed and two were refuted. The bugs that came out of this check are tracked in [Fix applicant score and status writes](../plans/2026-10-30-applicant-status-and-score-writes.md) (findings F1, F2, F5 and F7). This file keeps the full evidence, including the counts that matched, so it doesn't need to be re-derived.

The check used only GET requests with the publishable key (`sb_publishable_…`, which does the anon key's job; it isn't a JWT). Nothing was written, and the key wasn't printed or saved.

## Claims vs. live results

| # | Claim | Live result | Verdict | Evidence |
|---|---|---|---|---|
| 1a | `applicants.total_score` exists, and `ApplicantDetailsPage.tsx:1955` writes it | Column missing | Refuted. The write fails, but it can't be reached (see Corrections) | `GET /applicants?select=id,total_score` → HTTP 400, `42703` |
| 1b | `applicant_category_scores.total_score` is readable | Readable | Confirmed | HTTP 200, row returned |
| 2 | Employees: 167 (seed test), 172 (handoff) | 137 rows in total, all Active. 127 Active in the 5 seeded offices | Both refuted as a total count (see Corrections) | `employees` → `Content-Range: 0-0/137`; `employees_with_department?status=eq.Active&department=in.(…)` → `/127` |
| 3a | Approved Phase 1 target settings: 284 | 284 of 285 rows | Confirmed | `target_settings?status=eq.approved` → `/284` |
| 3b | Completed Phase 2: 283 | 283 | Confirmed | `target_settings?status=eq.approved&phase2_status=eq.completed` → `/283` |
| 3c | Training sessions: 41 | 41 | Confirmed | `training_sessions` → `/41` |
| 3d | Training recommendations, suggested / enrolled: 90 / 21 | 90 / 21 of 119 | Confirmed | `training_recommendations?status=eq.SUGGESTED` → `/90`, `eq.ENROLLED` → `/21` |
| 4 | Applicants with status `Reviewed` (written by `EvaluationForm.tsx:465`) | 0 | The key can see the table; no rows have this status | `applicants?status=eq.Reviewed` → `*/0` |

Claim 3b is read as `target_settings.phase2_status = 'completed'`, the filter `scripts/seed-training-recommendations.mjs:71` uses. Counted per indicator instead, `success_indicator_ratings` has 793 rows, and every one has quality, efficiency and timeliness filled in.

## Context gathered at the same time

- **Applicants the key can see: 57.** Statuses: Not Selected 33, New Application 13, Hired 7, Interview/Exam Scheduled 2, Not Qualified 1, Withdrawn - Hired Elsewhere 1.
- **Evaluations: 14.** Every evaluated applicant has since reached a final status: 7 Hired, 6 Not Selected, 1 Withdrawn - Hired Elsewhere. The data therefore can't show whether the `Reviewed` write ever succeeded.
- **Migrations:** no CHECK constraint on `applicants.status`, and no RLS policies on `applicants`.

## Corrections made after the first report

The first report got two things wrong. These are the corrected readings:

1. **The `total_score` write doesn't lose data in production.** `handleSaveScoreSetup` can only be opened from a button hidden behind `showViewScoresButton = false` (`ApplicantDetailsPage.tsx:1233`). The defect is real but can't be reached. The fix plan's D1 and Step 1 cover it.
2. **The employee comparison was wrong.** The seed test (`scripts/seed-training-attendance.test.mjs:63,77`) doesn't count all employees. It counts Active employees in the 5 seeded offices, using the service-role key. That's 127 with the publishable key and 172 in the audit's service-key run, so the figure depends on both the key and the date. A fixed number in the test will keep breaking. The fix plan's D2 and Step 5 cover it.

## Where each finding went

| Finding | Tracked in |
|---|---|
| `total_score` write on a missing column | Fix plan F1–F3, Step 1; `docs/ux-feedback-audit.md` §0 item 4 |
| Stale `total_score` in `database.types.ts` | Fix plan F4, Step 2 |
| `Reviewed` written after an evaluation | Fix plan F5, D3, Steps 3–4; `docs/ux-feedback-audit.md`, `EvaluationForm` row |
| Seed test asserts a live employee count | Fix plan F7, D2, Step 5 |
| The read side of `total_score` (ranking) | Already fixed in promotional plan Task 3 (`20c24f1`) |

## How to re-run

Load `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env`. Send them as the `apikey` and `Authorization: Bearer` headers on `GET $VITE_SUPABASE_URL/rest/v1/<query>`. Add `Prefer: count=exact` and `Range: 0-0`, then read the total from `Content-Range`. Use the queries in the Evidence column. These counts are what the publishable key can see. To get service-role figures, use `SUPABASE_SERVICE_ROLE_KEY`, still with GET only, and never commit the key.
