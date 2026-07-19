/**
 * The canonical IPCR rating periods.
 *
 * Why this exists: `ipcr_performance` has repeatedly accumulated rows that are
 * not real, scored semesters — unrated probationary placeholders
 * ("Probationary — 1st 3 Months"), alternate labels ("2nd Half 2025"), and a
 * batch of future-dated rows running to 2055 from a buggy generator. Those rows
 * average into the same aggregates as genuine ratings, so the Summary of
 * Ratings silently drifts downward every time one lands.
 *
 * 274 such rows were removed on 2026-07-19 (backed up under `backups/`), which
 * moved the overall mean from 3.877 to 4.206. Deleting alone isn't durable
 * though — the next failed batch or stray insert reintroduces the problem. So
 * every read that aggregates ratings scopes to this list rather than trusting
 * the table to contain only good rows.
 *
 * Add a new entry here when a semester is closed and rated. An unrated,
 * in-progress period must NOT be listed: that is precisely what pulls averages
 * down.
 */

export const CANONICAL_RATING_PERIODS = [
  'Jan 1-Jun 30 2024',
  'Jul 1-Dec 31 2024',
  'Jan 1-Jun 30 2025',
  'Jul 1-Dec 31 2025',
] as const;

export type CanonicalRatingPeriod = (typeof CANONICAL_RATING_PERIODS)[number];

/** True when `period` is a closed, rated semester that may count toward averages. */
export function isCanonicalRatingPeriod(period: unknown): boolean {
  return CANONICAL_RATING_PERIODS.includes(String(period ?? '').trim() as CanonicalRatingPeriod);
}

/** Drop any row whose rating_period isn't a closed, rated semester. */
export function onlyCanonicalPeriods<T extends { rating_period?: unknown }>(rows: T[]): T[] {
  return (rows ?? []).filter((r) => isCanonicalRatingPeriod(r.rating_period));
}

/** Mutable copy for PostgREST `.in()`, which rejects a readonly tuple. */
export const canonicalPeriodList = (): string[] => [...CANONICAL_RATING_PERIODS];
