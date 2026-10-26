/**
 * Relevant work experience on the application form: a list of entries, each
 * with the same five fields. Pure helpers shared by the form, its validation,
 * drafts, submission and the HR view.
 *
 * Stored on applicants.work_experiences (migration 20261026120100) as
 * [{ years, months, position, company, duties }]; applicants.years_of_experience
 * keeps the total, which scoring and qualification checks read.
 */

/** Form state for one entry. Strings, as typed. */
export interface WorkExperienceEntry {
  years: string;
  months: string;
  position: string;
  company: string;
  duties: string;
}

export type WorkExperienceField = keyof WorkExperienceEntry;
/** Inline error per field of one entry. */
export type WorkExperienceErrors = Partial<Record<WorkExperienceField, string>>;

/** One entry as stored in applicants.work_experiences. */
export interface StoredWorkExperience {
  years: number;
  months: number;
  position: string | null;
  company: string | null;
  duties: string | null;
}

/** A sensible cap so the form stays reviewable. */
export const MAX_WORK_EXPERIENCES = 10;
export const MONTHS_PER_YEAR = 12;
/** Upper bound on one entry's years; anything above is a typo. */
const MAX_YEARS_PER_ENTRY = 60;

export const emptyWorkExperience = (): WorkExperienceEntry => ({ years: '', months: '', position: '', company: '', duties: '' });

const filled = (v: string | null | undefined) => String(v ?? '').trim() !== '';

export const isBlankWorkExperience = (e: WorkExperienceEntry) =>
  !filled(e.years) && !filled(e.months) && !filled(e.position) && !filled(e.company) && !filled(e.duties);

const WHOLE_NUMBER = /^\d+$/;

/**
 * Per-entry errors, aligned with `entries`, or undefined when all are valid.
 * A single, completely blank entry is allowed: applicants with no relevant
 * experience can still apply. Any entry with data needs every field and some
 * time served; extra blank entries must be filled in or removed.
 */
export const validateWorkExperiences = (entries: WorkExperienceEntry[]): WorkExperienceErrors[] | undefined => {
  if (entries.length === 1 && isBlankWorkExperience(entries[0])) return undefined;

  const errors = entries.map((e) => {
    const err: WorkExperienceErrors = {};
    const years = String(e.years ?? '').trim();
    const months = String(e.months ?? '').trim();

    if (years && (!WHOLE_NUMBER.test(years) || Number(years) > MAX_YEARS_PER_ENTRY)) {
      err.years = `Enter whole years from 0 to ${MAX_YEARS_PER_ENTRY}`;
    }
    if (months && (!WHOLE_NUMBER.test(months) || Number(months) > MONTHS_PER_YEAR - 1)) {
      err.months = `Enter months from 0 to ${MONTHS_PER_YEAR - 1}`;
    }
    if (!err.years && !err.months && (Number(years || 0) + Number(months || 0)) === 0) {
      err.years = 'Enter how long you held this position';
    }
    if (!filled(e.position)) err.position = 'Position held is required';
    if (!filled(e.company)) err.company = 'Company/organization is required';
    if (!filled(e.duties)) err.duties = 'Description of duties is required';
    return err;
  });

  return errors.some((err) => Object.keys(err).length > 0) ? errors : undefined;
};

/**
 * After an edit, keep only the errors that were already on screen and are
 * still true, so fixing a field clears its message without new messages
 * appearing while the applicant is still typing.
 */
export const keepShownErrors = (
  shown: WorkExperienceErrors[] | undefined,
  current: WorkExperienceErrors[] | undefined,
): WorkExperienceErrors[] | undefined => {
  if (!shown || !current) return undefined;
  const kept = current.map((err, i) => {
    const out: WorkExperienceErrors = {};
    for (const field of Object.keys(err) as WorkExperienceField[]) {
      if (shown[i]?.[field]) out[field] = err[field];
    }
    return out;
  });
  return kept.some((err) => Object.keys(err).length > 0) ? kept : undefined;
};

const toInt = (v: string | number | null | undefined) => {
  const n = Number(String(v ?? '').trim() || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/**
 * Total relevant experience in years (e.g. 3.5), summed across entries. This
 * is what qualification checks and scoring read. Entries carry no dates, so
 * overlapping jobs count twice; the form asks applicants not to do that.
 */
export const totalExperienceYears = (entries: WorkExperienceEntry[]): number => {
  const months = entries.reduce((sum, e) => sum + toInt(e.years) * MONTHS_PER_YEAR + toInt(e.months), 0);
  return +(months / MONTHS_PER_YEAR).toFixed(2);
};

/** The entries to store: blank ones dropped, numbers parsed, text trimmed. */
export const toStoredWorkExperiences = (entries: WorkExperienceEntry[]): StoredWorkExperience[] =>
  entries
    .filter((e) => !isBlankWorkExperience(e))
    .map((e) => ({
      years: toInt(e.years),
      months: toInt(e.months),
      position: e.position.trim() || null,
      company: e.company.trim() || null,
      duties: e.duties.trim() || null,
    }));

/** Stored entries read back from the database; tolerates nulls and junk. */
export const parseStoredWorkExperiences = (raw: unknown): StoredWorkExperience[] =>
  Array.isArray(raw)
    ? raw
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map((r) => ({
          years: toInt(r.years as number),
          months: toInt(r.months as number),
          position: filled(r.position as string) ? String(r.position).trim() : null,
          company: filled(r.company as string) ? String(r.company).trim() : null,
          duties: filled(r.duties as string) ? String(r.duties).trim() : null,
        }))
    : [];

/** "3 yrs 6 mos" / "8 mos" / "0 mos". */
export const formatDuration = (years: number, months: number) => {
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years === 1 ? '' : 's'}`);
  if (months > 0 || years === 0) parts.push(`${months} mo${months === 1 ? '' : 's'}`);
  return parts.join(' ');
};

/** The five flat fields drafts and profiles used before the list existed. */
export interface LegacyWorkExperienceFields {
  work_experience_years?: string;
  work_experience_months?: string;
  relevant_experience_position?: string;
  relevant_experience_company?: string;
  relevant_experience_duties?: string;
}

/** One entry from the old flat fields (an old sessionStorage draft, or a profile prefill). */
export const entryFromLegacy = (data: LegacyWorkExperienceFields): WorkExperienceEntry => ({
  years: String(data.work_experience_years ?? ''),
  months: String(data.work_experience_months ?? ''),
  position: String(data.relevant_experience_position ?? ''),
  company: String(data.relevant_experience_company ?? ''),
  duties: String(data.relevant_experience_duties ?? ''),
});

/**
 * A draft's entries, whatever shape it was saved in: the list as-is (at least
 * one entry), or an old flat draft converted to a one-item list.
 */
export const workExperiencesOf = (data: { work_experiences?: unknown } & LegacyWorkExperienceFields): WorkExperienceEntry[] => {
  if (Array.isArray(data.work_experiences) && data.work_experiences.length > 0) {
    return (data.work_experiences as Partial<WorkExperienceEntry>[])
      .slice(0, MAX_WORK_EXPERIENCES)
      .map((e) => ({ ...emptyWorkExperience(), ...e }));
  }
  return [entryFromLegacy(data)];
};
