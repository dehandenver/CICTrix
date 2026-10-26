import { describe, expect, it } from 'vitest';
import { pageOfficeDirectory, type OfficeDirectoryRow } from './officeDirectory';

const office = (n: number, extra: Partial<OfficeDirectoryRow> = {}): OfficeDirectoryRow => ({
  officeId: `o${n}`,
  officeName: `Office ${String(n).padStart(2, '0')}`,
  code: '',
  isActive: true,
  deptHead: null,
  supervisors: [],
  employeeCount: n,
  divisions: [],
  ...extra,
});

const rows = Array.from({ length: 23 }, (_, i) => office(i + 1));

describe('pageOfficeDirectory', () => {
  it('defaults to the first 10 active offices', () => {
    const page = pageOfficeDirectory(rows);
    expect(page).toMatchObject({ total: 23, page: 1, pageSize: 10, pageCount: 3 });
    expect(page.rows.map((r) => r.officeId)).toEqual(['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 'o9', 'o10']);
  });

  it('returns the requested page and size', () => {
    const page = pageOfficeDirectory(rows, { page: 2, pageSize: 10 });
    expect(page.rows[0].officeId).toBe('o11');
    expect(pageOfficeDirectory(rows, { pageSize: 25 })).toMatchObject({ pageCount: 1, page: 1 });
  });

  it('clamps a page past the end and reports the page it returned', () => {
    const page = pageOfficeDirectory(rows, { page: 9, pageSize: 10 });
    expect(page.page).toBe(3);
    expect(page.rows.map((r) => r.officeId)).toEqual(['o21', 'o22', 'o23']);
  });

  it('leaves out inactive offices and counts only active ones', () => {
    const withInactive = [...rows, office(99, { isActive: false })];
    expect(pageOfficeDirectory(withInactive, { pageSize: 50 }).total).toBe(23);
  });

  it('searches office and department head names, and totals the matches', () => {
    const headed = [office(1, { deptHead: { name: 'Maria Santos', contact: '', position: null, accountStatus: 'Active' } }), office(2), office(12)];
    expect(pageOfficeDirectory(headed, { search: 'santos' }).rows.map((r) => r.officeId)).toEqual(['o1']);
    expect(pageOfficeDirectory(headed, { search: 'OFFICE 0' })).toMatchObject({ total: 2, pageCount: 1 });
    expect(pageOfficeDirectory(headed, { search: 'nothing' })).toMatchObject({ total: 0, rows: [], page: 1 });
  });
});
