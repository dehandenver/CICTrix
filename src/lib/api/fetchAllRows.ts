/** The API returns at most this many rows per request, whatever is asked for. */
export const FETCH_ALL_PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: unknown };

/**
 * Reads every row of a query, one page at a time. Past the API's row limit a
 * plain select succeeds with the rows cut off, so a whole-table read has to
 * page.
 *
 * `readPage` must order by a unique key, or rows can repeat or go missing
 * between pages. Returns the same `{ data, error }` as a plain query, and a
 * failed page gives `data: null`, never a partial list.
 */
export async function fetchAllRows<T>(
  readPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await readPage(rows.length, rows.length + FETCH_ALL_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    if (!data?.length) return { data: rows, error: null };
    // Advance by what arrived: a server limit below the page size isn't the end.
    rows.push(...data);
  }
}
