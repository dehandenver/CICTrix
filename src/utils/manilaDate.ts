/**
 * Calendar-date helpers anchored to Asia/Manila (PHT, UTC+8).
 *
 * Avoids `new Date().toISOString().slice(0, 10)`, which evaluates in UTC and
 * returns yesterday's date between 00:00 and 07:59 Philippine Time.
 */

const MANILA_TIME_ZONE = 'Asia/Manila';

/** Returns today's calendar date in Asia/Manila as YYYY-MM-DD. */
export function todayManilaIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}
