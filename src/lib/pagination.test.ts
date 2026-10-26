import { describe, expect, it } from 'vitest';
import { clampPage, getPageList, paginate, parsePageParam, parsePageSizeParam } from './pagination';

describe('getPageList', () => {
  it('lists every page up to 7', () => {
    expect(getPageList(1, 1)).toEqual([1]);
    expect(getPageList(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('collapses long ranges to first, last and current ±1 with gaps', () => {
    expect(getPageList(1, 20)).toEqual([1, 2, 'gap', 20]);
    expect(getPageList(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
    expect(getPageList(20, 20)).toEqual([1, 'gap', 19, 20]);
    expect(getPageList(3, 20)).toEqual([1, 2, 3, 4, 'gap', 20]);
  });
});

describe('clampPage', () => {
  it('keeps the page within 1..pageCount', () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(-3, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(3, 5)).toBe(3);
    expect(clampPage(2, 0)).toBe(1);
  });
});

describe('URL params', () => {
  it('reads a page as a positive whole number, else 1', () => {
    expect(parsePageParam('3')).toBe(3);
    expect(parsePageParam(null)).toBe(1);
    expect(parsePageParam('0')).toBe(1);
    expect(parsePageParam('-2')).toBe(1);
    expect(parsePageParam('2.5')).toBe(1);
    expect(parsePageParam('abc')).toBe(1);
  });

  it('reads a page size only from the allowed options', () => {
    expect(parsePageSizeParam('25')).toBe(25);
    expect(parsePageSizeParam('50')).toBe(50);
    expect(parsePageSizeParam('7')).toBe(10);
    expect(parsePageSizeParam(undefined)).toBe(10);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 23 }, (_, i) => i + 1);

  it('returns the requested slice', () => {
    const p = paginate(items, 2, 10);
    expect(p).toMatchObject({ pageCount: 3, current: 2, start: 10 });
    expect(p.pageItems).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('clamps a page past the end to the last page', () => {
    const p = paginate(items, 99, 10);
    expect(p.current).toBe(3);
    expect(p.pageItems).toEqual([21, 22, 23]);
  });

  it('gives one empty page for no items', () => {
    expect(paginate([], 4, 10)).toMatchObject({ pageCount: 1, current: 1, pageItems: [] });
  });
});
