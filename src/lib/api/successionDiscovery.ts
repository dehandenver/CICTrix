/**
 * Succession discovery helpers: relative position rank checks (to avoid
 * recommending downward moves) and canonical eligibility resolution against
 * the active `eligibility_types` catalog.
 */

// ─────────────────────────────────────────────────────────────────────────────
// System of Ranking Positions — relative rank
// ─────────────────────────────────────────────────────────────────────────────

/** A position's place in the ladder, from the SRP. */
export interface PositionRank {
  /** Civil-service salary grade, 1–33. The signal to trust when present. */
  salaryGrade: number | null;
  /** Ordering of the position_level label. Higher is more senior. */
  levelOrder: number | null;
}

/**
 * 'unknown' is a real answer, not a failure. A position with neither signal
 * cannot be compared, and saying so is different from calling it a peer.
 */
export type RankComparison = 'higher' | 'equal' | 'lower' | 'unknown';

const usable = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

/**
 * Where the candidate's current position sits relative to the target.
 *
 * Salary grade decides when both sides have one — it is externally defined and
 * ordinal. level_order is the fallback for positions with no grade on file.
 * Mixing the two scales is refused: a salary grade and a level_order are not
 * comparable numbers.
 */
export function compareRank(candidate: PositionRank, target: PositionRank): RankComparison {
  const pick = (a: number | null, b: number | null): RankComparison | null => {
    if (!usable(a) || !usable(b)) return null;
    if (a > b) return 'higher';
    if (a < b) return 'lower';
    return 'equal';
  };
  return (
    pick(candidate.salaryGrade, target.salaryGrade) ??
    pick(candidate.levelOrder, target.levelOrder) ??
    'unknown'
  );
}

/**
 * Should this candidate be kept out of the pool as a downward move?
 *
 * Only a KNOWN downward move excludes. When rank cannot be established the
 * candidate stays in so missing SRP data never quietly drops someone.
 */
export function isDownwardMove(candidate: PositionRank, target: PositionRank): boolean {
  return compareRank(candidate, target) === 'higher';
}

// ─────────────────────────────────────────────────────────────────────────────
// Relative rank read from position title
// ─────────────────────────────────────────────────────────────────────────────

const DEPARTMENT_HEAD_TITLE =
  /^(city (accountant|engineer|health officer|general services officer|social welfare (&|and) dev(\.|elopment)? officer)|head of .+)$/;
const ASSISTANT_HEAD_TITLE = /^assistant city /;
const CHIEF_TITLE = /\bchief\b/;
const TITLE_SERIES_SUFFIX = /^(.*?)\s+(i{1,3}|iv|vi{0,3}|ix|x|\d{1,2})$/;
const ROMAN_VALUES: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
};

interface TitleRank {
  /** 3 department head, 2 assistant head, 0 everything else. */
  tier: number;
  chief: boolean;
  family: string;
  numeral: number | null;
}

function titleHierarchyTier(baseTitle: string): number {
  if (DEPARTMENT_HEAD_TITLE.test(baseTitle)) return 3;
  if (ASSISTANT_HEAD_TITLE.test(baseTitle)) return 2;
  return 0;
}

function parseTitleRank(title: string | null | undefined): TitleRank | null {
  const full = String(title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!full) return null;
  const base = full.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const tier = titleHierarchyTier(base);
  const series = TITLE_SERIES_SUFFIX.exec(base);
  const numeral = series ? ROMAN_VALUES[series[2]] ?? Number(series[2]) : null;
  return {
    tier,
    chief: CHIEF_TITLE.test(full),
    family: series ? series[1] : base,
    numeral,
  };
}

/** Compares two position titles; 'unknown' unless the title alone settles it. */
export function compareTitleRank(
  candidateTitle: string | null | undefined,
  targetTitle: string | null | undefined,
): RankComparison {
  const c = parseTitleRank(candidateTitle);
  const t = parseTitleRank(targetTitle);
  if (!c || !t) return 'unknown';
  if (c.tier !== t.tier && (c.tier >= 2 || t.tier >= 2)) return c.tier > t.tier ? 'higher' : 'lower';
  if (c.tier >= 2) return 'equal';
  if (c.family !== t.family || c.numeral == null || t.numeral == null) return 'unknown';
  if (c.numeral !== t.numeral) return c.numeral > t.numeral ? 'higher' : 'lower';
  if (c.chief !== t.chief) return c.chief ? 'higher' : 'lower';
  return 'equal';
}

/** True only when the titles alone show the candidate sits above the target. */
export function isDownwardTitleMove(
  candidateTitle: string | null | undefined,
  targetTitle: string | null | undefined,
): boolean {
  return compareTitleRank(candidateTitle, targetTitle) === 'higher';
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical eligibility mapping & catalog resolution
// ─────────────────────────────────────────────────────────────────────────────

const CANONICAL_ELIGIBILITY_NAMES = [
  'Civil Service Eligibility (Professional)',
  'Civil Service Eligibility (Sub-Professional)',
  'PRC Professional License',
  'Bar / Board Eligibility (RA 1080)',
  'Latin Honors',
  'Barangay Eligibility',
  "Professional Driver's License",
  'Other Recognized Eligibility',
] as const;

const CANONICAL_BY_LOWER = new Map<string, string>(
  CANONICAL_ELIGIBILITY_NAMES.map((name) => [name.toLowerCase(), name]),
);

const CSC_PROFESSIONAL_ALIASES = new Set([
  'csc professional',
  'career service professional',
  'civil service professional',
  'cs professional',
  'csc subprofessional / csc professional',
]);

const CSC_SUBPROFESSIONAL_ALIASES = new Set([
  'csc sub-professional',
  'csc subprofessional',
  'career service subprofessional',
  'career service sub-professional',
  'civil service sub-professional',
  'cs sub-professional',
]);

/**
 * Maps legacy `employees.eligibility` shorthand to the canonical
 * `eligibility_types` catalog names. Unmatched values are returned trimmed as-is
 * so strict catalog resolution can decide whether they are recognized.
 */
export function canonicalEligibilityTypeName(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';

  const normalized = trimmed.replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();

  if (/\bra\s*1080\b/i.test(normalized) || /\bbar\s*\/\s*board\b/i.test(normalized)) {
    return 'Bar / Board Eligibility (RA 1080)';
  }
  if (CSC_PROFESSIONAL_ALIASES.has(lower)) {
    return 'Civil Service Eligibility (Professional)';
  }
  if (CSC_SUBPROFESSIONAL_ALIASES.has(lower)) {
    return 'Civil Service Eligibility (Sub-Professional)';
  }
  if (/\bpd\s*907\b/i.test(normalized) || /\blatin\s+honors\b/i.test(normalized)) {
    return 'Latin Honors';
  }
  if (
    /\bdriver\b.*\bmc\s*11\b/i.test(normalized) ||
    /^professional driver'?s license$/i.test(normalized)
  ) {
    return "Professional Driver's License";
  }
  if (/\bprc\b/i.test(normalized)) {
    return 'PRC Professional License';
  }
  if (/\bbarangay\s+eligibility\b/i.test(normalized)) {
    return 'Barangay Eligibility';
  }

  return CANONICAL_BY_LOWER.get(lower) ?? trimmed;
}

/**
 * Resolves a raw eligibility string against the active `eligibility_types`
 * catalog (`activeTypeNames` is a lowercase set of active `name` values).
 */
export function resolveRecognizedEligibility(
  raw: string,
  activeTypeNames: ReadonlySet<string>,
): { recognized: boolean; canonicalName: string } {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return { recognized: false, canonicalName: '' };
  }

  const canonicalName = canonicalEligibilityTypeName(trimmed);
  if (activeTypeNames.has(canonicalName.toLowerCase())) {
    return { recognized: true, canonicalName };
  }

  const matchedAliasOrCanonical =
    canonicalName !== trimmed || CANONICAL_BY_LOWER.has(trimmed.replace(/\s+/g, ' ').toLowerCase());

  if (!matchedAliasOrCanonical) {
    return { recognized: false, canonicalName: trimmed };
  }

  return { recognized: false, canonicalName };
}
