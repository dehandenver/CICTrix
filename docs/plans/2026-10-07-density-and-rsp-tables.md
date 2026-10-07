---
title: Portal density pass, RSP table fixes, scoring modal restyle, L&D request pagination
date: 2026-10-07
status: Done
summary: Paginate L&D training requests, drop the Job Posts Edit button, clarify resubmission timestamps, compact the Scheduled Applicants and Applicant Score tables, restyle the scoring modal to match Create New Job Position, and lower the portal type/size scale through tokens.
---

## Goal

Portal pages show a full table and its controls at 1366×768 without zooming,
at the density of the public Currently Vacant Jobs table, and the RSP scoring
flow reads as one product with the Create Job modal.

## Approach

Seven tasks, built in the order below so the shared density tokens (Task 7)
land before the per-table work that depends on them.

Surfaces found:

| Task | File |
|---|---|
| 1 L&D Training requests | `src/modules/admin/LndTrainingNeeds.tsx` (`filteredRequests`, two `.map` blocks at ~202/241) |
| 2 Job Posts Edit button | `src/components/JobPostingsPage.tsx:1693` (`editingId`, handler at ~876) |
| 3 Resubmissions | `src/components/QualifiedApplicantsPage.tsx` Documents tab (~2270) and Activity timeline (~2365). There is no separate Resubmissions page. |
| 4 Scheduled Applicants | `src/components/PendingAssignmentList.tsx` (~586–680) |
| 4 "Edit Written Exam Score" | `src/components/QualifiedApplicantsSection.tsx:1696` |
| 5 Applicant Score rows | `src/components/QualifiedApplicantsSection.tsx:1431` |
| 6 Scoring modal | `src/components/QualifiedApplicantsSection.tsx` ~700–900; reference modal in `JobPostingsPage.tsx` |
| 7 Density | `src/styles/abyan-tokens.css`, `src/styles/rsp-design.css`, `DESIGN_IDENTITY.md` |

Why the portals look oversized: `rsp-design.css` forces h1 to 36px, a 36px
button floor and 40px controls, and the guide itself specifies 64px table rows,
45px default buttons and 44px inputs. The Vacant Jobs table uses Tailwind
`text-sm` (14px) and `py-3` cells. The fix is a token change, not per-component
overrides.

Task 7 mechanism: add density tokens (type scale, control heights, cell
padding) to `abyan-tokens.css` under the existing `.abyan-ds, .rsp-ds` scope,
and point the remaps in `rsp-design.css` at them. Do **not** change the root
`html` font-size: it would also shrink the public landing page, which is the
reference.

Task 3 data: resubmission events already persist as `applicant_attachments`
rows (`resubmission_request`, `resubmission_resolved`) with `created_at`.
"Original submission" vs "Resubmission #n" is derived per document type by
ordering its upload rows by `created_at`. No migration expected; if the rows
turn out not to carry a reliable time, I stop and report before adding one.

## Steps

1. Branch `feat/density-pass` from the current branch.
2. Task 7 tokens: add the density scale to `abyan-tokens.css`, update
   `rsp-design.css`, update `DESIGN_IDENTITY.md` §4, §5, §8.2, §9.1, §9.3, §9.5
   to match. Preview first (see Risks).
3. Task 1: client-side pagination, 10 per page, reset on tab change, clamp page
   after Approve/Dismiss, hide under 2 pages, Vacant-Jobs pager style, total
   count stays per tab.
4. Task 2: remove the Edit button; remove `editingId`/handler/modal code only if
   nothing else uses it; recheck Actions column width.
5. Task 4: one-line `MMM DD, YYYY · h:mm AM` dates (`nowrap`), two-line cells
   max, badge inline with name, interviewer name with email as `title`,
   compact "Edit Schedule" (icon + label inline), ~52px rows, no horizontal
   scroll at 1366px. Rename "Edit Written Exam Score" to "Exam Score", keeping
   the pencil.
6. Task 5: remove "Edit Scores" and the Actions column; row becomes
   `role="button" tabIndex={0}`, Enter/Space opens the scoring modal, hover
   `--bg-row-hover`, focus ring; same compact sizing as Task 4.
7. Task 6: restyle the scoring modal to the Create Job modal (header, section
   cards, inputs, pinned footer with Cancel + primary Save Scores, overlay,
   max-height); compact score summary; segmented-control states for
   Appointment and Position Type, with a distinct locked state. Logic untouched.
8. Task 3: one timestamp format (`Oct 5, 2026 · 5:07 PM`, local time) on the
   Documents tab and Activity timeline; label entries "Original submission" /
   "Resubmission #n"; newest resubmission marked; name/doc type primary, badge
   secondary, timestamps muted 12px.
9. Verify, then commit per task.

## Risks

- **Task 7 changes design tokens and contradicts the guide** (Title L 36px vs
  requested h1 22–24px; buttons 50/45/36 vs 32–36; inputs 44 vs 36–40; rows 64
  vs 48–56). CLAUDE.md treats a token change as a decision, so it needs your
  yes, and it is an open visual question, so I would show a `ui-preview` of one
  table, the toolbar and the modal at the new scale before building.
- The sidebar rail sizes (72px, 48px items) are an approved mockup
  (`2026-09-28-sidebar-rail.html`). Shrinking them deviates from a saved
  decision; I propose leaving the rail alone and only shrinking labels if you
  want.
- The top bar is already 64px, inside the requested 56–64px; no change planned.
- Global density affects L&D and PM pages that are not in `.rsp-ds`; any page
  outside both scopes keeps its current size until it adopts a scope.
- Screenshots need a logged-in RSP/L&D session. If I can't sign in locally I
  will say so rather than fake them.

## Checks to run

- `npx tsc --noEmit` (known baseline: one jspdf error)
- `npm run lint`
- `npm test`
- Manual or browser check at 1366×768 and 1920×1080 of every surface listed
  above, plus §16 PR checklist.
