/** The API returns at most this many rows per request, whatever is asked for. */
export const FETCH_ALL_PAGE_SIZE = 1000;

/** Safe batch size for PostgREST `.in(...)` filters to avoid HTTP 414 URI limits. */
export const FETCH_IN_CHUNK_SIZE = 150;

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

/**
 * Reads every row matching an arbitrarily large `.in(...)` list by splitting
 * `values` into URL-safe chunks and paging each chunk through `fetchAllRows`.
 */
export async function fetchInChunks<T, K>(
  values: readonly K[],
  readChunkPage: (chunk: K[], from: number, to: number) => PromiseLike<PageResult<T>>,
  chunkSize: number = FETCH_IN_CHUNK_SIZE,
): Promise<PageResult<T>> {
  const unique = [...new Set(values)];
  if (unique.length === 0) return { data: [], error: null };

  const size = Math.max(1, Math.floor(chunkSize));
  const rows: T[] = [];
  for (let start = 0; start < unique.length; start += size) {
    const chunk = unique.slice(start, start + size);
    const { data, error } = await fetchAllRows<T>((from, to) => readChunkPage(chunk, from, to));
    if (error) return { data: null, error };
    if (data?.length) rows.push(...data);
  }
  return { data: rows, error: null };
}
