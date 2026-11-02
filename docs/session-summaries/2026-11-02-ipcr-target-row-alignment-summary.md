# IPCR target row alignment: summary

Plan: `docs/plans/2026-11-02-ipcr-target-row-alignment.md`

## Shipped

- `.abyan-table td.is-top { vertical-align: top; }` added to `src/components/data-table/_internal/data-table.css` and documented in the data-table README.
- `EmployeePage.tsx`: the MFO and Success Indicator cells of the Phase 1 targets row carry `is-top`; the dead `align-top` on the `<tr>` is gone.
- `EmployeePage.ipcr.test.tsx`: new `Phase 1 target inputs` tests cover the alignment class and that both inputs stay editable, counted, and removable (type, counters, add/remove indicator, add/remove MFO).

## Deviations

- Plan step 3 (other copies of the form): none exist. `Add Success Indicator` appears only in `EmployeePage.tsx`. Other `align-top` rows in the app are different tables and were left alone.
- Typing could not be exercised in the live browser: the test account's phase was closed, so the inputs rendered disabled. Typing and add/remove are covered by the component test instead.

## Checks run

- Browser, real CSS, dev server on the new branch: with the indicator cell made 192px tall, the MFO input and first indicator input both start at y=598 with `is-top`; with the class removed the MFO input starts at y=661 (63px low).
- `npx tsc --noEmit` clean. ESLint (zero warnings) clean on the two changed TS files.
- `npx vitest run src/components/data-table src/modules/employee`: 7 files, 67 tests passed.
