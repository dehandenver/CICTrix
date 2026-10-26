import { describe, expect, it } from 'vitest';
import { ALL_OFFICES, eventsInPeriod, inOffice, periodRange, scopeNeedsToOffice } from './lndDashboardModel';

const today = new Date(2026, 9, 26); // Oct 26, 2026 (Q4)

describe('periodRange', () => {
  it('returns the calendar month, quarter and year containing today', () => {
    expect(periodRange('month', today)).toEqual({ start: new Date(2026, 9, 1), end: new Date(2026, 10, 1) });
    expect(periodRange('quarter', today)).toEqual({ start: new Date(2026, 9, 1), end: new Date(2027, 0, 1) });
    expect(periodRange('year', today)).toEqual({ start: new Date(2026, 0, 1), end: new Date(2027, 0, 1) });
    expect(periodRange('quarter', new Date(2026, 1, 10))).toEqual({ start: new Date(2026, 0, 1), end: new Date(2026, 3, 1) });
  });
});

describe('eventsInPeriod', () => {
  const ev = (start: string, end: string | null = null) => ({ startDate: start, endDate: end });
  const events = [
    ev('2026-02-03T00:00:00'),                         // Q1
    ev('2026-09-29T00:00:00', '2026-10-02T00:00:00'),  // runs into October
    ev('2026-10-20T00:00:00'),                         // this month
    ev('2026-11-15T00:00:00'),                         // later this quarter, not finished yet
    ev('2026-12-30T00:00:00', '2027-01-02T00:00:00'),  // runs into next year
  ];

  it('keeps trainings that run during any part of the month or quarter', () => {
    expect(eventsInPeriod(events, 'month', today)).toEqual([events[1], events[2]]);
    expect(eventsInPeriod(events, 'quarter', today)).toEqual([events[1], events[2], events[3], events[4]]);
  });

  it('leaves the year (the calendar list itself) unchanged', () => {
    expect(eventsInPeriod(events, 'year', today)).toBe(events);
  });
});

describe('office scoping', () => {
  it('matches office names loosely and treats "all" as every office', () => {
    expect(inOffice('Office of The City Engineer', ALL_OFFICES)).toBe(true);
    expect(inOffice(' office of the  city engineer', 'Office of The City Engineer')).toBe(true);
    expect(inOffice('Office of The City Accountant', 'Office of The City Engineer')).toBe(false);
  });

  it('keeps only the selected office in each competency', () => {
    const needs = [
      { competency: 'A', offices: [{ office: 'OCE', affected: 2 }, { office: 'OCA', affected: 1 }] },
      { competency: 'B', offices: [{ office: 'OCA', affected: 3 }] },
    ];
    expect(scopeNeedsToOffice(needs, 'OCE')).toEqual([
      { competency: 'A', offices: [{ office: 'OCE', affected: 2 }] },
      { competency: 'B', offices: [] },
    ]);
    expect(scopeNeedsToOffice(needs, ALL_OFFICES)).toBe(needs);
  });
});
