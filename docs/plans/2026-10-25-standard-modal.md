---
title: Standard modal — the Create Job Position modal as the system-wide basis
date: 2026-10-25
status: In Progress
summary: Extract the Create New Job Position modal into one shared Modal component (gradient header, white body, footer with Cancel + primary), make it DESIGN_IDENTITY §9.10, and migrate every modal portal by portal.
---

## Goal

Every modal in ABYAN has the same anatomy as the Create New Job Position modal:

- a gradient header with a white title, subtitle and close button
- a white body that scrolls inside the panel
- a footer with Cancel on the left of the primary action

The guide (§9.10), the token file and one shared component carry this, and every portal's modals use it.

**Decisions (2026-10-25, user):**

- **Overlay.** The guide's deep-blue tint, `rgba(4,14,107,.45)`. Create Job's near-black `slate-900/60` changes to match.
- **Confirmation dialogs.** Small confirmations get the gradient header too: Logout, Close Vacancy, Restore, Permanently Delete. Destructive confirms keep the blue header and use the red `.btn-destructive` for the action.
- **Rollout.** Phased, covering all modals, with one commit per phase.

## Approach

**Anatomy (new §9.10)**

| Part | Spec |
|---|---|
| Overlay | `--overlay` `rgba(4,14,107,.45)`, fixed, centered, 16px padding |
| Panel | White, `--radius-xl` (16px), `--shadow-3`, `overflow: hidden`, `max-height: 88vh`, flex column |
| Sizes | `sm` 480px (confirmations), `md` 640px (forms, the default), `lg` 880px (lists, tables) |
| Header | `--gradient-modal-header` = `linear-gradient(135deg, #363EE8 0%, #040E6B 100%)`, padding 16px 24px. Title in Title M (20px), white, weight 700 (as Create Job). Optional subtitle in Body M (14px), `#C8D1FF` (4.6:1 on `#363EE8`). Close is a 36px icon button: white at 80%, hover background white at 10%, focus ring white at 50%, `aria-label="Close"`. |
| Body | Padding 20px 24px. It scrolls inside the panel, so the header and footer stay put. |
| Footer | 1px `--neutral-200` top border, padding 16px 24px. Right-aligned: Cancel (`.btn-secondary`) on the left of the primary (`.btn-primary`, or `.btn-destructive`). Loading follows §9.1: spinner, label kept, no "Saving…". |
| Mobile (< 640px) | A full-screen sheet with no outer padding or radius. The header and footer stay fixed and the body scrolls. |
| Behaviour | `role="dialog"`, `aria-modal`, `aria-labelledby` (title) and `aria-describedby` (subtitle). Focus moves to the first field, or to the close button. Tab stays inside the modal. Esc and an overlay click close it (`dismissible={false}` turns both off for busy or destructive steps). Focus returns to the opener. Page scroll locks while it's open. `useBackClosesView` closes one level on browser Back (§8.2). |

**Shared component.** A new module folder `src/components/modal/` (index.ts, README.md, `_internal/`). Its public interface:

```tsx
<Modal open onClose title subtitle? icon? size?="md" dismissible?=true initialFocusRef?
       footer={<><button className="btn btn-secondary btn-md">Cancel</button><Button loading={saving}>Create Position</Button></>}>
  …body…
</Modal>
```

`ConfirmModal` is a thin `size="sm"` wrapper for confirmations: title, message, confirm label, `tone="primary" | "destructive"`, `loading`.

**Tokens and guide.**

- Add `--gradient-modal-header` to `src/styles/abyan-tokens.css`, and to §3.5 and §14.1.
- Rewrite §9.10 with the table above, and add a §15 Do/Don't row.
- Add a §16 checklist line: "Modals use the shared `Modal`".
- §9.7.1's list modal becomes `size="lg"`. Its rule that "only the overlay scrolls" is replaced by "the body scrolls inside the panel", because the header and footer must stay visible. Recorded as a decision change in §17.

**Existing `src/components/Dialog.tsx`** keeps its props and renders the new `Modal`, so its 10 importers change in one step. Its `.dialog-*` CSS in `components.css` is deleted once nothing uses it.

## Steps

Each phase ends with the checks and a commit. Each push to `main` is asked for separately.

1. **Foundation.** The `modal` module, the token, the DESIGN_IDENTITY §3.5, §9.10, §14.1, §15, §16 and §17 updates, and `Dialog.tsx` re-pointed. Its 10 importers are App.tsx, CompetencyFrameworkPage, IPCRManagementPage, PMCompetencyFramework, PMIPCRManagement, PMPromotionalApplications, PMDashboard, SupervisorAccessPage, SystemAdministrationPage, EvaluationForm and InterviewerDashboard. Vitest covers focus trap, Esc, overlay dismiss and focus return.
2. **Shared and RSP.**
   - Shared dialogs: ConfirmLogoutDialog (every portal) and DocumentPreviewModal.
   - RSP: JobPostingsPage (Create/Edit Position, the source; its overlay changes to blue), CloseVacancyDialog, ScheduleApplicantsModal, QualifiedApplicantsSection/Page, ForHiringPage, GenerateCredentialsPage, NewlyHiredPage, SalaryGradesPage, JobVacanciesPanel, CriticalPositionPage, RaterManagementPage, Recruitment/RaterManagement navigation guides, RSPDashboard modals, the rsp-archives list modal and dialogs, ChangePositionModal and EmployeeDetailPage.
3. **L&D and Super Admin.** AttendanceGrid, SeminarEnrollment, TrainingCalendar, TrainingCourses, TrainingEnrollmentEmailModal, TrainingPlan and SystemAdministrationPage.
4. **PM.** PMDashboard, PMIPCRManagement and OfficeTrainingCourses.
5. **Interviewer and Applicant.** ApplicantDetailsPage, EditApplicantDetailsModal, InterviewerDashboardParts and applicant `flow/FlowUi.tsx`.

Each file's `fixed inset-0` / `role="dialog"` markup is checked before migrating. Side drawers, toasts, loaders and full-screen viewers that aren't modals are left alone and listed in the phase summary. Prototype and demo files (`prototypes/TrainingCoursesPrototype.tsx`, `pm/demo/*`) are out of scope.

## Risks

- **Size.** Around 39 files and many bespoke modals. Each phase is a separate commit, so a problem rolls back one portal.
- **Behaviour.** Some modals carry custom close guards, such as unsaved-changes prompts and busy states. Migration keeps them through `dismissible` and the existing handlers, and each guard is checked per file.
- **Inner scrolling.** Long modals that relied on the overlay scrolling now scroll the body inside the panel, so their contents need checking at 1366×768.
- **Legacy colours.** The `globals.css` rule that colours `span`/`p`/`h2` dark (§17 item 8) would turn header text dark. The header sets its white colour on the elements themselves, the same fix as Logout.
- **Live checks.** The local anon key is disabled, so portal pages can't be checked signed in. Each phase gets a temporary component harness with the real modals, and the live check after deploy is limited to the bundle.

## Checks to run

- `npx tsc --noEmit`, `npx vitest run` (with the new `Modal` tests) and `npm run build`, per phase.
- Browser, per phase:
  - each migrated modal at 1366×768 and 375px
  - the header's white text checked as a rendered colour, not just in code
  - focus trap, Esc, focus return and body scroll
- The DESIGN_IDENTITY §16 checklist.

## Status check 2026-11-12

Still In Progress. Phases 1–3 are done (foundation, shared and RSP, L&D and Super Admin). Left: Phase 4 PM (hand-rolled overlays in PMDashboard, PMIPCRManagement and OfficeTrainingCourses), Phase 5 Interviewer and Applicant (ApplicantDetailsPage, EditApplicantDetailsModal), the 14 untitled legacy `Dialog` calls, and a decision on the Salary Grades drawer.

Automated checks on `origin/main` (`cd71e17`): `npx tsc --noEmit` clean; `npx vitest run` passes 635 files and 5,479 tests, including the promotion smoke tests; `npm run check:migrations` OK (130 files). Vercel built and deployed `cd71e17` to production on 2026-11-05. A local `npm run build` fails on this machine because esbuild cannot delete its own temp files; the code compiles.
