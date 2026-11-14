# data-table

The one table design for the whole app, modelled on the Succession Planning table and `DESIGN_IDENTITY.md` §9.5. It is a style layer plus small parts, not a generic `<DataTable>` component, so each table keeps its own sorting, filtering, selection, row click and actions.

## Specs

| Part | Value |
|---|---|
| Container `.abyan-table-wrap` | white, 1px `--neutral-200`, 12px radius, `overflow-x: auto` (tables scroll sideways on small screens) |
| Header `th` | `--bg-page` background, 600 12/16px UPPERCASE, 0.4px tracking, `--neutral-600`, 12px × 20px padding, bottom border |
| Body `td` | 500 14/20px `--neutral-800`, 16px × 20px padding, 1px `--neutral-200` divider, none under the last row |
| Hover / selected | `--bg-row-hover` / `--color-primary-50` (`tr.is-selected`) |
| Zebra | none |
| Primary / secondary text | `.abyan-cell-primary` 600 `--color-primary-900`; `.abyan-cell-secondary` 500 14px `--neutral-600` |
| Alignment | text left; `.is-num` right with tabular figures; `.is-center`; `td.is-top` aligns a cell to the top of the row (a `vertical-align` on the `<tr>` has no effect, because the cells set their own) |
| Badges | the existing `.badge-*` classes (§9.8) |
| Compact | `.abyan-table.is-compact` (10/12px padding) for nested tables |
| Readability | inside a table, light-grey utilities (`text-slate-300/400/500`, `text-gray-400/500`) lift to `--neutral-600`, and 9–13px text to 14px; badges and pills are excluded |
| Top scorer | `tr.is-top-scorer`: `--color-primary-50` tint, 3px `--color-primary` left accent, plus `<TopScorerBadge />` |

## Public interface

| Export | What it does |
|---|---|
| `getTableView({ loading, error, rowCount })` | `'loading' \| 'error' \| 'empty' \| 'rows'`. A failed first load is an error, never an empty table. |
| `<TableStateRows view columns showSkeleton? error? errorAction? onRetry? emptyTitle? emptyMessage? />` | The skeleton (from `table-loading`), the error row with Retry, or the empty row. Renders nothing for `'rows'`. |
| `topScorerIds(rows, { idOf, scoreOf, groupOf?, minGroupSize? })` | Ids of the highest scorer(s) per group. Ties all count. No result for a group with no positive score or fewer than 2 rows. Pass the full data, not the visible page. |
| `topScorerRowClass(isTop)` | `'is-top-scorer'` or `''`. |
| `<TopScorerBadge />` | "Top scorer" pill with a trophy icon. |

```tsx
const view = getTableView({ loading: initialLoading, error, rowCount: rows.length });
const top = useMemo(() => topScorerIds(allRows, { idOf: r => r.id, scoreOf: r => r.total, groupOf: r => r.position }), [allRows]);

<div className="abyan-table-wrap">
  <table className="abyan-table">
    <thead><tr><th>Applicant</th><th className="is-num">Total</th></tr></thead>
    <tbody>
      <TableStateRows view={view} columns={['two-line', 'text']} showSkeleton={showSkeleton}
        error={error} errorAction="load the applicants" onRetry={reload}
        emptyTitle="No applicants yet" emptyMessage="Applicants appear here once they apply." />
      {view === 'rows' && pageRows.map(r => (
        <tr key={r.id} className={topScorerRowClass(top.has(r.id))}>…</tr>
      ))}
    </tbody>
  </table>
</div>
```

## Not handled

- Fetching, sorting, filtering and pagination. Use `tableSort`, the table-loading hooks and the existing pager.
- Print popups built from HTML strings (`window.open`). They carry their own inline styles; use `topScorerIds` there too.
- The legacy dark theme. Colours are scoped to the light theme, as in `rsp-design.css`.

## Dependencies

`table-loading`, `src/lib/friendlyErrors.ts`, Lucide icons, the `.btn` and `.badge` classes, and the tokens in `src/styles/abyan-tokens.css` (with §3 hex fallbacks).
