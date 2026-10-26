/**
 * Pagination helpers shared by every paged table (DESIGN_IDENTITY.md §9.6).
 * Pure functions, so the page math is tested once and reused.
 */

/** Page-size choices offered by the "Show [n] entries" select. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

/** §9.6: past this many pages, collapse the list with ellipses. */
const MAX_PAGES_WITHOUT_GAPS = 7;

// Design Identity §9.6: first, last, current ±1, with ellipses past 7 pages.
export const getPageList = (current: number, total: number): Array<number | 'gap'> => {
  if (total <= MAX_PAGES_WITHOUT_GAPS) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
};

export const pageCountFor = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));

/** Keeps a page inside 1..pageCount, so a shrunken list never strands the view on an empty page. */
export const clampPage = (page: number, pageCount: number) => Math.min(Math.max(1, Math.floor(page) || 1), Math.max(1, pageCount));

/** A page number from a URL value: a positive whole number, else 1. */
export const parsePageParam = (raw: string | null | undefined): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
};

/** A page size from a URL value: one of `options`, else the first option. */
export const parsePageSizeParam = (
  raw: string | null | undefined,
  options: readonly number[] = PAGE_SIZE_OPTIONS,
): number => {
  const n = Number(raw);
  return options.includes(n) ? n : options[0];
};

/** One page of `items`, with the page clamped into range. */
export const paginate = <T,>(items: T[], page: number, pageSize: number) => {
  const pageCount = pageCountFor(items.length, pageSize);
  const current = clampPage(page, pageCount);
  const start = (current - 1) * pageSize;
  return { pageCount, current, start, pageItems: items.slice(start, start + pageSize) };
};
