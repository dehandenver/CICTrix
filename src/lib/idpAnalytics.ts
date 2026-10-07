/**
 * IDP analytics — what employees asked for, aggregated for the L&D Dashboard.
 *
 * Reads only the checkbox tags. The tags are kept in their own vocabulary
 * rather than mapped onto TNA competencies: the two do not line up word for
 * word, and the form has no Cultural Transformation checkbox, so any mapping
 * would be invented. Free-text answers are left out until they are coded.
 */

import type { IdpSubmission } from './api/idpSubmissions';
import { CAREER_NEED_OPTIONS, PERSONAL_GOAL_OPTIONS } from './idpQuestionnaire';

export type IdpTagKind = 'career' | 'personal';

/** Every checkbox tag, career first, in form order, with a chart-sized label. */
export const IDP_TAGS: { tag: string; label: string; kind: IdpTagKind }[] = [
  { tag: CAREER_NEED_OPTIONS[0], label: 'Job specific', kind: 'career' },
  { tag: CAREER_NEED_OPTIONS[1], label: 'Leadership & supervisory', kind: 'career' },
  { tag: CAREER_NEED_OPTIONS[2], label: 'Computer literacy', kind: 'career' },
  { tag: PERSONAL_GOAL_OPTIONS[0], label: 'Financial literacy', kind: 'personal' },
  { tag: PERSONAL_GOAL_OPTIONS[1], label: 'Health & wellness', kind: 'personal' },
  { tag: PERSONAL_GOAL_OPTIONS[2], label: 'Communication', kind: 'personal' },
  { tag: PERSONAL_GOAL_OPTIONS[3], label: 'Personal development', kind: 'personal' },
];

const KNOWN_TAGS = new Set(IDP_TAGS.map((t) => t.tag));

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();

/** The known tags one submission ticked, deduplicated. */
const tagsOf = (s: IdpSubmission): Set<string> =>
  new Set(
    [...(s.careerNeeds ?? []), ...(s.personalGoals ?? [])]
      .map((t) => normalize(String(t)))
      .filter((t) => KNOWN_TAGS.has(t)),
  );

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/** Distinct offices across the submissions, as written on the form. */
export const idpOffices = (subs: IdpSubmission[]): string[] =>
  Array.from(new Set(subs.map((s) => s.office).filter(Boolean))).sort();

/**
 * The office in `offices` with the same name as `name`, ignoring case and
 * spacing, or null. TNA and IDP spell office names differently.
 */
export const matchOffice = (name: string, offices: string[]): string | null =>
  offices.find((o) => normalize(o) === normalize(name)) ?? null;

/**
 * Per tag, how many employees in each office ticked it. A person can tick
 * several tags, so totals exceed headcount.
 */
export const tagSelectionsByOffice = (subs: IdpSubmission[]) =>
  IDP_TAGS.map(({ tag, label, kind }) => {
    const byOffice: Record<string, number> = {};
    for (const s of subs) {
      if (s.office && tagsOf(s).has(tag)) byOffice[s.office] = (byOffice[s.office] ?? 0) + 1;
    }
    const total = Object.values(byOffice).reduce((a, b) => a + b, 0);
    return { tag, label, kind, byOffice, total };
  });

/** For one office, the share (0–100) of its IDP submitters who ticked each tag. */
export const officeTagShares = (subs: IdpSubmission[], office: string) => {
  const inOffice = subs.filter((s) => normalize(s.office ?? '') === normalize(office));
  return IDP_TAGS.map(({ tag, label, kind }) => {
    const count = inOffice.filter((s) => tagsOf(s).has(tag)).length;
    return { tag, label, kind, count, share: pct(count, inOffice.length) };
  });
};

/** Each office's most-ticked tag and the share of its submitters behind it. */
export const topTagPerOffice = (subs: IdpSubmission[]) =>
  idpOffices(subs)
    .map((office) => {
      const shares = officeTagShares(subs, office);
      const submitters = subs.filter((s) => s.office === office).length;
      const top = shares.reduce((best, cur) => (cur.count > best.count ? cur : best), shares[0]);
      return top.count > 0
        ? { office, submitters, tag: top.tag as string | null, label: top.label, share: top.share }
        : { office, submitters, tag: null, label: '—', share: 0 };
    })
    .sort((a, b) => b.share - a.share || a.office.localeCompare(b.office));
