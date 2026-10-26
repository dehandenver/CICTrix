import { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS, clampPage, getPageList, pageCountFor } from '../lib/pagination';
import '../styles/pagination.css';

interface PaginationProps {
  /** Total matching rows across all pages. */
  total: number;
  /** 1-based page; clamped into range for display. */
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Shows the "Show [n] entries" select when provided. */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  /** Noun in "Showing 1–10 of 42 <itemLabel>". */
  itemLabel?: string;
  /** Accessible name for the nav landmark, e.g. "Office pages". */
  label: string;
}

/**
 * Pagination per DESIGN_IDENTITY.md §9.6: "Showing X–Y of Z" on the left;
 * the entries select, Previous, page numbers (ellipses past 7 pages) and Next
 * on the right. Renders nothing when there are no rows; the table's empty
 * state speaks for itself.
 */
export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  itemLabel = 'entries',
  label,
}: PaginationProps) {
  const sizeId = useId();
  if (total <= 0) return null;

  const pageCount = pageCountFor(total, pageSize);
  const current = clampPage(page, pageCount);
  const start = (current - 1) * pageSize;

  return (
    <nav className="abyan-tokens abyan-pager" aria-label={label}>
      <p className="abyan-pager-info" aria-live="polite">
        Showing {start + 1}–{Math.min(start + pageSize, total)} of {total.toLocaleString('en-US')} {itemLabel}
      </p>
      <div className="abyan-pager-right">
        {onPageSizeChange && (
          <span className="abyan-pager-size">
            <label htmlFor={sizeId}>Show</label>
            <select id={sizeId} value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span aria-hidden="true">entries</span>
          </span>
        )}
        {pageCount > 1 && (
          <div className="abyan-pager-btns">
            <button type="button" className="abyan-page abyan-page--nav" onClick={() => onPageChange(current - 1)} disabled={current === 1}>
              <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" /> Previous
            </button>
            {getPageList(current, pageCount).map((p, i) =>
              p === 'gap' ? (
                <span key={`gap-${i}`} className="abyan-page-gap" aria-hidden="true">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={`abyan-page abyan-page-num${p === current ? ' is-active' : ''}`}
                  onClick={() => onPageChange(p)}
                  aria-current={p === current ? 'page' : undefined}
                  aria-label={`Page ${p}`}
                >
                  {p}
                </button>
              ),
            )}
            <button type="button" className="abyan-page abyan-page--nav" onClick={() => onPageChange(current + 1)} disabled={current === pageCount}>
              Next <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
