---
title: Fix application confirmation counts and position labels
date: 2026-10-29
status: In Progress
summary: Keep the submit confirmation's wording fixed while requests run, and lead the review cards and success rows with the position title, with the plantilla as smaller text beneath it.
---

## Goal

When an applicant submits, the confirmation keeps saying "Submit application?" (or "Submit 2 applications?" for a batch) until it closes, instead of dropping to "Submit 0 applications?". The Step 3 review cards and the success screen name the position being applied for (for example "Administrative Officer II") as the heading, with the plantilla ("Plantilla 27 · SG 11") in smaller text beneath it.

No mockup covers this surface (`docs/mockups/` checked 2026-10-29). This revises the earlier version of this plan (published in #81): same diagnosis, smaller build, plus the review-card header.

## Approach

All product changes are in `src/modules/applicant/ApplicantWizard.tsx`.

**Zero count (root cause).** `handleSubmitAll` marks every target `submitting` before the first request. `pendingKeys` (line 1080) counts only keys with no outcome or a `failed` one, so it drops to 0 immediately. The still-open `ConfirmModal` (lines 1938–1954) builds its title and body from the live `pendingKeys`/`failedKeys`, so it shows "Submit 0 applications?" and the batch description. The submission itself is unaffected.

Fix: replace the `confirmSubmit` boolean with `confirmBatch: { keys: string[]; mode: 'submit' | 'retry' } | null`, captured when the review button opens the dialog. The dialog title, body and confirm label read from `confirmBatch`; `handleSubmitAll` submits `confirmBatch.keys` instead of recomputing. The modal already disables its buttons while `busy`, so no extra lock is added.

| Situation | Confirmation title |
|---|---|
| One application | Submit application? |
| Several applications | Submit N applications? |
| One failed, retrying | Retry application? |
| Several failed, retrying | Retry N applications? |

Descriptions stay as they are today, chosen by the captured count. The review button's own label ("Submit Application", "Submit N Applications", "Retry N Failed") is unchanged.

**Plantilla shown instead of the position.** Two places use the plantilla as the heading:

- Review card summary (lines 1792–1795): heading is `Application for ${labelFor(key)}`, caption is `captionFor(key)` (position · plantilla · SG).
- Success rows (line 1127 builds `label` from `choiceLabel`; line 1482 renders it as `af-headline`).

Fix: add one local helper, `positionTitleFor(key)`, returning the trimmed `formData.position`, then `posting.title`, then `'Your application'`. It never uses `current_position`, so promotions show the target position.

- Review card: heading (`af-title-s`, 18px) becomes `positionTitleFor(key)`. The caption (`af-caption`, 14px) becomes the plantilla label and SG only, for example `Plantilla 27 · SG 11`. It is omitted when there is no plantilla (general applications).
- Success rows: completed entries gain `positionTitle` and an optional `plantillaLabel`. They render as an `af-headline` title with an `af-body-s` plantilla line beneath it, before the existing reference block. Badges and references are unchanged.

`labelFor`, `choiceLabel` and `captionFor` keep their current output for the other places that use them: the Step 2 form heading, the tabs, the copy-answers menu, and the error lists. Changing those is out of scope unless approved separately.

## Steps

1. **Stable confirmation.** Add `confirmBatch` state; open it from the review button with the failed keys (retry) or pending keys (submit); drive the dialog from it; submit its keys; clear it on cancel and when the attempt finishes. End state: the dialog never shows a count other than the one it opened with.
2. **Position-first labels.** Add `positionTitleFor`; update the review card summary and the completed entries and success rows as above. End state: review cards and success rows read "Administrative Officer II" over "Plantilla 27 · SG 11".
3. **Tests** in a new `src/modules/applicant/ApplicantWizard.test.tsx`. Mock the Supabase client and the submission dependencies, and enter the review step through a saved v2 draft. Four tests:
   - A single submission held open by a pending promise keeps the title "Submit application?".
   - A two-item batch keeps "Submit 2 applications?" after the first item resolves.
   - A retry of one failed item keeps "Retry application?" while it runs, and the item that already succeeded is not resent.
   - A promotional application with a different `current_position` shows the target position as the heading on the review card and the success row, with the plantilla label beneath.
4. **Verify** with the checks below and a manual pass through the review and success screens at desktop and 375px.
5. **Close out.** Update status, write the session summary, and regenerate the plans dashboard.

## Risks

- **Mocking the wizard is the costliest part.** The wizard pulls in Supabase, encryption, storage and recruitment sync. If the fixture balloons, fall back to extracting the confirmation-copy and label logic into small pure functions and unit-testing those, and say so in the summary.
- **Long position titles** could crowd the review card's badges and Edit button. The summary row already wraps (`flex-wrap`); confirm at 375px and add a scoped wrap rule only if needed.
- **Mixed labels across steps.** Step 2 (form heading, tabs) still says "Application for Plantilla 27" until a follow-up changes it.
- **Separate bug, not fixed here.** The applicant row is saved before files upload, so a failed upload followed by a retry can show "Already applied" without attachments. It needs its own investigation.

## Checks to run

- `npx vitest run src/modules/applicant/ApplicantWizard.test.tsx src/components/JobDetailsPage.plantillas.test.tsx`
- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build`
- `DESIGN_IDENTITY.md` §16 checklist for the review and success screens.
