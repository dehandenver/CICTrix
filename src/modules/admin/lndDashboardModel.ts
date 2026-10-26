/**
 * Period and office scoping for the L&D dashboard. Pure, so the filter rules
 * are tested apart from the page.
 *
 * What each control scopes (decided 2026-10-26):
 *   - Period (Month / Quarter / Year): training completion only. The
 *     2-training rule is yearly by definition, IDPs are per cycle year, and the
 *     needs assessment carries no dates.
 *   - Office: everything counted per employee or per office. Trainings have no
 *     owning office, so training completion stays LGU-wide.
 */

export type Period = 'month' | 'quarter' | 'year';
export const PERIODS: Period[] = ['month', 'quarter', 'year'];
export const PERIOD_LABEL: Record<Period, string> = { month: 'This month', quarter: 'This quarter', year: 'This year' };

/** Office filter value meaning "every office". */
export const ALL_OFFICES = 'all';

/** The calendar month / quarter / year containing `today`: [start, end). */
export const periodRange = (period: Period, today: Date): { start: Date; end: Date } => {
  const y = today.getFullYear();
  if (period === 'month') return { start: new Date(y, today.getMonth(), 1), end: new Date(y, today.getMonth() + 1, 1) };
  if (period === 'quarter') {
    const q = Math.floor(today.getMonth() / 3) * 3;
    return { start: new Date(y, q, 1), end: new Date(y, q + 3, 1) };
  }
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
};

/**
 * Trainings that run during any part of the period, finished or not: the same
 * overlap rule the Training Calendar uses for its year. `events` is already
 * that year's calendar, so Year returns it unchanged and the year figure
 * matches the calendar exactly.
 */
export const eventsInPeriod = <E extends { startDate: string; endDate: string | null }>(
  events: E[],
  period: Period,
  today: Date,
): E[] => {
  if (period === 'year') return events;
  const { start, end } = periodRange(period, today);
  return events.filter((e) => {
    const first = new Date(e.startDate);
    const last = new Date(e.endDate ?? e.startDate);
    return first < end && last >= start;
  });
};

/** Office names are spelled inconsistently across sources; compare loosely. */
export const officeKey = (name: string | null | undefined) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const inOffice = (name: string | null | undefined, selected: string) =>
  selected === ALL_OFFICES || officeKey(name) === officeKey(selected);

/** Needs with only the selected office's rows left in each competency. */
export const scopeNeedsToOffice = <N extends { offices: { office: string }[] }>(needs: N[], selected: string): N[] =>
  selected === ALL_OFFICES ? needs : needs.map((n) => ({ ...n, offices: n.offices.filter((o) => inOffice(o.office, selected)) }));
