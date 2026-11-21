/**
 * PDS education rows → the attainment text succession scores.
 *
 * `employee_education` is the table the Personal Data Sheet edits. The legacy
 * `employees.highest_educational_attainment` column is a copy that the PDS
 * never writes, so succession treated a new Master's as if it did not exist.
 * Reading the rows here keeps the detail table as the source of truth, with the
 * legacy column kept as a fallback for employees whose PDS was never filled in.
 *
 * Two consumers shape the output:
 *   - `normalizeDegree` (successionPipelineV2.ts) reads degree words —
 *     master / doctorate / bachelor — so the course text matters.
 *   - qualification checks tokenise the text to compare fields of study,
 *     so every degree is offered, not just the highest.
 */

export interface EducationRow {
  level: string | null;
  course: string | null;
  year_graduated: number | null;
}

/**
 * Order of the levels the table's check constraint allows. `Doctorate` is
 * permitted even though the PDS editor only offers up to Graduate Studies.
 */
export const EDUCATION_LEVEL_RANK: Record<string, number> = {
  Doctorate: 6,
  'Graduate Studies': 5,
  College: 4,
  Vocational: 3,
  Secondary: 2,
  Elementary: 1,
};

const levelOf = (row: EducationRow): string => String(row.level ?? '').trim();

const rankOf = (row: EducationRow): number => EDUCATION_LEVEL_RANK[levelOf(row)] ?? 0;

/**
 * The highest row on file: level first, then the later graduation year.
 * A row with an unknown or missing level ranks below every known level.
 */
export function highestEducation(rows: readonly EducationRow[]): EducationRow | null {
  let best: EducationRow | null = null;
  for (const row of rows) {
    if (!best) {
      best = row;
      continue;
    }
    const rank = rankOf(row);
    const bestRank = rankOf(best);
    if (rank > bestRank) {
      best = row;
      continue;
    }
    if (rank < bestRank) continue;
    if (Number(row.year_graduated ?? 0) > Number(best.year_graduated ?? 0)) best = row;
  }
  return best;
}

/**
 * Level-based label, used when the row carries no course name.
 *
 * Graduate Studies deliberately does not claim a master's: the level cannot
 * tell a master's from a doctorate, and inventing one would earn ranking
 * points for a degree the record does not name.
 */
export function educationLevelLabel(row: EducationRow): string {
  const graduated = row.year_graduated != null;
  switch (levelOf(row)) {
    case 'College':
      return graduated ? 'College Graduate' : 'College Level';
    case 'Vocational':
      return 'Vocational';
    case 'Secondary':
      return graduated ? 'High School Graduate' : 'High School Level';
    case 'Elementary':
      return graduated ? 'Elementary Graduate' : 'Elementary Level';
    case 'Graduate Studies':
      return 'Graduate Studies';
    case 'Doctorate':
      return 'Doctorate';
    default:
      return '';
  }
}

/** The course when named, otherwise the level label. */
export function educationLabel(row: EducationRow): string {
  const course = String(row.course ?? '').trim();
  return course || educationLevelLabel(row);
}

/**
 * Every row's course and level label, for the field-of-study gate. A Bachelor's
 * in the required field still qualifies after an unrelated Master's is added,
 * which a highest-row-only read would miss.
 */
export function educationSearchTexts(rows: readonly EducationRow[]): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    const course = String(row.course ?? '').trim();
    const levelLabel = educationLevelLabel(row);
    if (!course && !levelLabel) continue;
    if (course) out.add(course);
    if (levelLabel) out.add(levelLabel);
  }
  return [...out];
}
