import { describe, expect, it, vi } from 'vitest';
import { fetchAllRows, fetchInChunks, FETCH_ALL_PAGE_SIZE } from './fetchAllRows';

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

describe('fetchInChunks', () => {
  it('deduplicates keys, splits into chunks, and pages each chunk past 1,000 rows', async () => {
    const keys = ['k1', 'k2', 'k1', 'k3', 'k4', 'k5'];
    const db = new Map<string, string[]>([
      ['k1', ['r1a', 'r1b']],
      ['k2', ['r2a']],
      ['k3', Array.from({ length: 5 }, (_, i) => `r3-${i}`)],
      ['k4', []],
      ['k5', ['r5a']],
    ]);
    const chunksSeen: string[][] = [];
    const readChunkPage = vi.fn(async (chunk: string[], from: number, to: number) => {
      if (from === 0) chunksSeen.push(chunk);
      const matching = chunk.flatMap((k) => db.get(k) ?? []);
      // Simulate a small server cap of 2 rows per page
      return { data: matching.slice(from, Math.min(to + 1, from + 2)), error: null };
    });

    const { data, error } = await fetchInChunks(keys, readChunkPage, 2);

    expect(error).toBeNull();
    expect(chunksSeen).toEqual([['k1', 'k2'], ['k3', 'k4'], ['k5']]);
    expect(data).toEqual(['r1a', 'r1b', 'r2a', 'r3-0', 'r3-1', 'r3-2', 'r3-3', 'r3-4', 'r5a']);
  });

  it('returns empty without calling readChunkPage when values is empty', async () => {
    const readChunkPage = vi.fn();
    await expect(fetchInChunks([], readChunkPage)).resolves.toEqual({ data: [], error: null });
    expect(readChunkPage).not.toHaveBeenCalled();
  });

  it('aborts and returns null data if any chunk fails', async () => {
    const failure = { message: 'db down' };
    const readChunkPage = vi
      .fn()
      .mockResolvedValueOnce({ data: ['ok'], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: failure });

    await expect(fetchInChunks(['a', 'b'], readChunkPage, 1)).resolves.toEqual({ data: null, error: failure });
  });
});
