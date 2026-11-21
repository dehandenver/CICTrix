import type {
  ApplicantWorkExperienceEntry,
  ApplicantWorkExperienceEntryErrors,
} from '../types/applicant.types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function createEmptyWorkExperienceEntry(): ApplicantWorkExperienceEntry {
  return {
    from_date: '',
    to_date: '',
    is_present: false,
    position_title: '',
    company_name: '',
    duties_responsibilities: '',
    is_government_service: false,
  };
}

export function isWorkExperienceEntryBlank(
  entry: Partial<ApplicantWorkExperienceEntry> | null | undefined,
): boolean {
  if (!entry) return true;
  return (
    !String(entry.from_date ?? '').trim() &&
    !String(entry.to_date ?? '').trim() &&
    !String(entry.position_title ?? '').trim() &&
    !String(entry.company_name ?? '').trim() &&
    !String(entry.duties_responsibilities ?? '').trim() &&
    !entry.is_present &&
    !entry.is_government_service
  );
}

/** Parse a YYYY-MM-DD string as a strict calendar date at UTC midnight, or null. */
export function parseStrictIsoDate(value: string | null | undefined): Date | null {
  const text = String(value ?? '').trim();
  if (!ISO_DATE_RE.test(text)) return null;
  const [yStr, mStr, dStr] = text.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function utcToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function normalizeWorkExperienceEntry(
  raw: Partial<ApplicantWorkExperienceEntry> | null | undefined,
): ApplicantWorkExperienceEntry {
  const isPresent = Boolean(raw?.is_present);
  return {
    from_date: String(raw?.from_date ?? '').trim(),
    to_date: isPresent ? '' : String(raw?.to_date ?? '').trim(),
    is_present: isPresent,
    position_title: String(raw?.position_title ?? '').trim(),
    company_name: String(raw?.company_name ?? '').trim(),
    duties_responsibilities: String(raw?.duties_responsibilities ?? '').trim(),
    is_government_service: Boolean(raw?.is_government_service),
  };
}

export function sanitizeWorkExperienceEntries(raw: unknown): ApplicantWorkExperienceEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<ApplicantWorkExperienceEntry> => Boolean(item && typeof item === 'object'))
    .map((item) => normalizeWorkExperienceEntry(item));
}

export function filterMeaningfulWorkExperienceEntries(
  raw: unknown,
): ApplicantWorkExperienceEntry[] {
  return sanitizeWorkExperienceEntries(raw).filter((entry) => !isWorkExperienceEntryBlank(entry));
}

/** Whole months between two ISO dates (matching employeeApplicationProfile.ts), floored at 0. */
export function entryMonths(
  entry: Partial<ApplicantWorkExperienceEntry>,
  now: Date = new Date(),
): number {
  const start = parseStrictIsoDate(entry.from_date);
  if (!start) return 0;
  const end = entry.is_present
    ? utcToday(now)
    : parseStrictIsoDate(entry.to_date);
  if (!end) return 0;
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  return Math.max(0, months);
}

export function computeWorkExperienceTotalMonths(
  entries: readonly Partial<ApplicantWorkExperienceEntry>[] | null | undefined,
  now: Date = new Date(),
): number {
  if (!entries || entries.length === 0) return 0;
  return entries.reduce((sum, entry) => sum + entryMonths(entry, now), 0);
}

export function computeWorkExperienceYearsDecimal(
  entries: readonly Partial<ApplicantWorkExperienceEntry>[] | null | undefined,
  now: Date = new Date(),
): number | null {
  const totalMonths = computeWorkExperienceTotalMonths(entries, now);
  if (totalMonths <= 0) return null;
  return +(totalMonths / 12).toFixed(2);
}

export function formatWorkExperienceTotal(totalMonths: number): string {
  const clamped = Math.max(0, Math.round(totalMonths));
  const years = Math.floor(clamped / 12);
  const months = clamped % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (months > 0 || parts.length === 0) parts.push(`${months} ${months === 1 ? 'mo' : 'mos'}`);
  return parts.join(' ');
}

export function deriveLegacyWorkExperienceFields(
  entries: readonly Partial<ApplicantWorkExperienceEntry>[] | null | undefined,
  now: Date = new Date(),
) {
  const meaningful = (entries ?? []).filter((e) => !isWorkExperienceEntryBlank(e));
  const totalMonths = computeWorkExperienceTotalMonths(meaningful, now);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const primary = meaningful[0];

  return {
    work_experience_years: totalMonths > 0 ? String(years) : '',
    work_experience_months: totalMonths > 0 ? String(months) : '',
    relevant_experience_position: String(primary?.position_title ?? '').trim(),
    relevant_experience_company: String(primary?.company_name ?? '').trim(),
    relevant_experience_duties: String(primary?.duties_responsibilities ?? '').trim(),
  };
}

export function validateWorkExperienceEntries(
  entries: readonly Partial<ApplicantWorkExperienceEntry>[] | null | undefined,
  now: Date = new Date(),
): Record<number, ApplicantWorkExperienceEntryErrors> {
  const results: Record<number, ApplicantWorkExperienceEntryErrors> = {};
  if (!entries || entries.length === 0) return results;

  const today = utcToday(now);

  entries.forEach((entry, index) => {
    if (isWorkExperienceEntryBlank(entry)) return;
    const entryErrors: ApplicantWorkExperienceEntryErrors = {};

    const fromRaw = String(entry.from_date ?? '').trim();
    const fromDate = parseStrictIsoDate(fromRaw);
    if (!fromRaw) {
      entryErrors.from_date = 'Start date is required';
    } else if (!fromDate) {
      entryErrors.from_date = 'Enter a valid start date';
    } else if (fromDate.getTime() > today.getTime()) {
      entryErrors.from_date = 'Start date cannot be in the future';
    }

    if (!entry.is_present) {
      const toRaw = String(entry.to_date ?? '').trim();
      const toDate = parseStrictIsoDate(toRaw);
      if (!toRaw) {
        entryErrors.to_date = 'End date is required unless currently employed';
      } else if (!toDate) {
        entryErrors.to_date = 'Enter a valid end date';
      } else {
        if (fromDate && toDate.getTime() < fromDate.getTime()) {
          entryErrors.to_date = 'End date cannot be earlier than start date';
        } else if (toDate.getTime() > today.getTime()) {
          entryErrors.to_date = 'End date cannot be in the future';
        }
      }
    }

    if (!String(entry.position_title ?? '').trim()) {
      entryErrors.position_title = 'Position held is required';
    }
    if (!String(entry.company_name ?? '').trim()) {
      entryErrors.company_name = 'Company/organization is required';
    }
    if (!String(entry.duties_responsibilities ?? '').trim()) {
      entryErrors.duties_responsibilities = 'Description of duties is required';
    }

    if (Object.keys(entryErrors).length > 0) {
      results[index] = entryErrors;
    }
  });

  return results;
}
