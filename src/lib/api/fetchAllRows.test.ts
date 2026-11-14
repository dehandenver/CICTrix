import { describe, expect, it, vi } from 'vitest';
import { fetchAllRows, FETCH_ALL_PAGE_SIZE } from './fetchAllRows';

const tableOf = (size: number) => Array.from({ length: size }, (_, i) => i);

const servePages = (table: number[], serverLimit = FETCH_ALL_PAGE_SIZE) =>
  vi.fn(async (from: number, to: number) => ({
    data: table.slice(from, Math.min(to + 1, from + serverLimit)),
    error: null,
  }));

describe('fetchAllRows', () => {
  it('returns every row of a table larger than one page', async () => {
    const table = tableOf(FETCH_ALL_PAGE_SIZE * 2 + 5);
    const readPage = servePages(table);

    const { data, error } = await fetchAllRows(readPage);

    expect(error).toBeNull();
    expect(data).toEqual(table);
    expect(readPage).toHaveBeenCalledWith(0, FETCH_ALL_PAGE_SIZE - 1);
    expect(readPage).toHaveBeenCalledWith(FETCH_ALL_PAGE_SIZE, FETCH_ALL_PAGE_SIZE * 2 - 1);
  });

  it('does not treat a smaller server-side row cap as the end of the table', async () => {
    const table = tableOf(250);

    const { data } = await fetchAllRows(servePages(table, 100));

    expect(data).toEqual(table);
  });

  it('returns an empty list for an empty table', async () => {
    await expect(fetchAllRows(servePages([]))).resolves.toEqual({ data: [], error: null });
  });

  it('treats null data as the end of the table', async () => {
    await expect(fetchAllRows(async () => ({ data: null, error: null }))).resolves.toEqual({
      data: [],
      error: null,
    });
  });

  it('returns no rows at all when a later page fails', async () => {
    const failure = { message: 'timeout' };
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ data: tableOf(FETCH_ALL_PAGE_SIZE), error: null })
      .mockResolvedValueOnce({ data: null, error: failure });

    await expect(fetchAllRows(readPage)).resolves.toEqual({ data: null, error: failure });
  });
});
