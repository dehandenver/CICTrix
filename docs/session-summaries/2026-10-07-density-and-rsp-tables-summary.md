---
title: Density pass and RSP table fixes — summary
date: 2026-10-07
plan: docs/plans/2026-10-07-density-and-rsp-tables.md
---

## Shipped vs. planned

All seven tasks shipped as planned.

| Task | Change | File |
|---|---|---|
| 1 | L&D training requests paginate at 10 per page (table and narrow-screen cards), reset to page 1 on tab change, clamp after Approve/Dismiss, hide under 2 pages, per-tab total kept | `src/modules/admin/LndTrainingNeeds.tsx` |
| 2 | Job Posts row Edit button removed, plus `openEditModal`, its only caller. The Create/Edit modal and save path are shared with Create, so they stay | `src/components/JobPostingsPage.tsx` |
| 3 | Documents list uploads as "Original submission", "Resubmission #n" (oldest first, latest marked); one local-time format "Oct 5, 2026 · 5:07 PM" in Documents and Activity; timeline numbers received resubmissions | `src/components/QualifiedApplicantsPage.tsx` |
| 4 | Scheduled Applicants: one-line schedules, two lines max per cell, badge beside name, interviewer email as tooltip, compact Edit Schedule, fixed column widths. "Edit Written Exam Score" now reads "Exam Score" | `src/components/PendingAssignmentList.tsx`, `src/components/QualifiedApplicantsSection.tsx` |
| 5 | Applicant Score: Edit Scores button and Actions column removed; whole row opens the scoring modal (`role="button"`, `tabIndex=0`, Enter/Space, hover, focus ring); one-line 12-hour schedules | `src/components/QualifiedApplicantsSection.tsx` |
| 6 | Scoring modal restyled to the Create New Job Position modal, on tokens; distinct selected/available/locked appointment cards; segmented Position Type; compact score summary; pinned footer with `.btn` pair | `src/components/QualifiedApplicantsSection.tsx` |
| 7 | Compact scale in the guide and tokens together | `DESIGN_IDENTITY.md`, `src/styles/abyan-tokens.css`, `src/styles/rsp-design.css` |

Typography and density applied: page title 24/32, section/modal title 20/28, card title 16/24, headlines 14/20, caption 13/16, body 14, small 12, table header 13 semibold, badges 22px tall at 12px, Medium/Small buttons 36/32px, inputs 40px (36 compact), pagination 36px, table cells 12×16px padding. Large buttons (50px), the marketing hero, the top bar and the side navigation are unchanged.

## Deviations

- Resubmission order is derived from existing `applicant_attachments.created_at`; no schema change was needed.
- L&D and PM pages sit outside the `.abyan-ds` / `.rsp-ds` scopes and already render at 12–14px, so the token change does not reach them; only Task 1 touched L&D.
- The scoring modal keeps its "click outside does not close" behaviour to protect unsaved scores; Create Job closes on backdrop click.
- `openEditModal` removal leaves `editingId` always null; its branches in the shared save path were left untouched as out of scope.

## Checks run

- `npx tsc --noEmit`: pass.
- `npm test`: 19 files, 227 tests passed.
- `npm run build`: pass (existing chunk-size warning only).
- `npm run lint`: cannot run. The repo has no ESLint config, so it fails the same way on `main`.
- No screenshots: portal pages need a logged-in RSP/L&D session that was not available here.
