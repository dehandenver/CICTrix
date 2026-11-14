---
title: Top-align MFO and Success Indicator inputs in the employee IPCR targets form
date: 2026-11-02
status: Done
summary: The MFO input sits lower than the first Success Indicator input because the shared table rule centers cells vertically. Top-align the cells so the first MFO and first indicator share a baseline.
---

## Goal

In the employee portal's My IPCR Workspace (Phase 1 targets), the MFO input and the first Success Indicator input in each row start at the same height, and stay there when an MFO has several indicators or a counter wraps. Nothing else about the form changes.

No saved mockup covers this surface; `DESIGN_IDENTITY.md` §9.5 (tables) and §9.3 (form controls) govern.

## Approach

**Root cause.** The targets table in `src/modules/employee/EmployeePage.tsx` (rows at ~1940) puts `align-top` on the `<tr>`. The shared table layer sets `vertical-align: middle` directly on every cell in `src/components/data-table/_internal/data-table.css:53-57` (`.abyan-table td`, specificity 0,1,1). A rule on the cell beats a value inherited from the row, so `align-top` on the `<tr>` does nothing. A Tailwind `align-top` on the `<td>` would also lose, since a utility class (0,1,0) is weaker than `.abyan-table td`.

The MFO cell is one input tall; the indicator cell holds an input, its counter, and the "+ Add Success Indicator" link. The shorter MFO cell is centered against the taller one, which is the ~15px drop visible in the screenshot. With two or more indicators the MFO input would float further down the row.

**Fix.** Add a cell modifier `.abyan-table td.is-top { vertical-align: top; }` beside the existing `is-num`, `is-center` and `is-action` modifiers in `data-table.css`, and put `is-top` on the two `<td>`s in the targets row. This matches how the shared layer already offers per-cell overrides, and `EmployeePhase2.css` already top-aligns its table with a scoped rule for the same reason.

Rejected: a one-off rule in an employee stylesheet (works, but the next form table hits the same trap) and inline `style` on the cells (bypasses the token layer).

## Steps

1. In `data-table.css`, add `.abyan-table td.is-top { vertical-align: top; }` next to the other cell modifiers, and list `is-top` in the modifier table of `src/components/data-table/README.md`.
2. In `EmployeePage.tsx`, add `is-top` to both `<td>`s of the targets row and drop the dead `align-top` on the `<tr>`.
3. Check the other copies of this form for the same dead `align-top`: `src/modules/admin/pm/demo/EmployeeIPCR.tsx` and the Office Account console. Fix them only if they render the same MFO/indicator table (same one-class change); otherwise leave them and say so.
4. Add a component test that types into, adds and removes MFO and indicator inputs and asserts both cells carry `is-top`. Then verify the real layout in the browser with an indicator cell made taller than the MFO cell. Both inputs start at the same y, the trash icons line up with their own input, and nothing shifts when the character counter appears or the form is read-only.

## Risks

- `td.is-top` is new shared CSS. Nothing else carries the class, so no other table changes; the `DataTable` snapshot tests should be unaffected.
- The MFO column is 40% wide; a long MFO plus counter could now make the MFO cell taller than a one-indicator cell. Top alignment handles this correctly, but check it in step 4.
- Read-only rows use `opacity-60`; confirm the alignment holds there too.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test` (at least `EmployeePage.ipcr.test.tsx` and `src/components/data-table`)
- Manual pass through the targets form per step 4, then the `DESIGN_IDENTITY.md` §16 checklist.
