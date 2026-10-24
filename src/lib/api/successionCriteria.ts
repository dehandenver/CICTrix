/**
 * Succession planning — qualification filter and ranking criteria.
 *
 * Two stages, and they are deliberately different in kind:
 *
 *   A. QUALIFICATIONS (filter). Education, Eligibility, Experience and Relevant
 *      Training are minimum requirements. They are NOT weighted and they do not
 *      contribute points — an employee either meets all four and enters the
 *      pool, or fails one and does not.
 *
 *   B. CRITERIA (ranking). Only qualified employees are ranked, on Performance,
 *      Relevant Experience (which includes length of service), Relevant
 *      Training, Education beyond the minimum, and Eligibility beyond the
 *      minimum.
 *
 * The distinction matters: a criterion that gates must never also be scored on
 * whether it gates, or clearing the bar gets paid for twice. Education,
 * Training and Eligibility appear in both stages, but the ranking counts only
 * what is ABOVE the minimum the filter already checked.
 *
 * Kept separate from succession.ts so the rules are testable without a database
 * and reviewable on their own.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Weights
// ─────────────────────────────────────────────────────────────────────────────

export interface RankingWeights {
  /** Performance relevant to the target position. */
  ipcr: number;
  /**
   * Relevant experience INCLUDING length of service. One criterion, because
   * years of service is already the years component of the experience score —
   * a separate tenure weight paid for the same number twice.
   */
  experience: number;
  /** Relevant training beyond the minimum. */
  training: number;
  /** Education above the minimum, and only when relevant. */
  education: number;
  /** Eligibility above the level the position requires. */
  eligibility: number;
}

/**
 * Default ranking weights (sum 100), as given in section E of the succession
 * specification.
 *
 * There is no separate tenure weight. Length of service is scored inside
 * `experience`, where it is already the years component — a standalone tenure
 * criterion paid for the same number a second time, which is exactly the
 * double-count this module's two-stage split exists to prevent. The spec is
 * also explicit that longer service alone does not make somebody more
 * qualified, so it belongs as one input to experience, not as a criterion of
 * its own.
 *
 * The spec calls these "proposed initial weights" to be validated by HR or
 * derived through a method such as AHP, so treat them as a starting point
 * rather than a settled model. Per-position overrides live in
 * critical_positions.succession_weights and go through normalizeWeights.
 */
export const RANKING_WEIGHTS: RankingWeights = {
  ipcr: 30,
  experience: 20,
  training: 20,
  education: 15,
  eligibility: 15,
};

/**
 * Coerce a stored weight object into the current shape.
 *
 * Positions configured before this model carry `{ipcr, training, education,
 * eligibility}`. That eligibility weight used to be discarded, because
 * eligibility was filter-only; it is meaningful again and is now kept. Any
 * missing criterion falls back to its default, and the result is renormalised
 * so a hand-edited row that does not total 100 still produces comparable
 * scores.
 */
export function normalizeWeights(stored: unknown): RankingWeights {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  // A stored `tenure` weight is folded into experience rather than dropped.
  // Tenure is no longer its own criterion, but the points a position allocated
  // to it were allocated to length of service, which experience now carries.
  // Discarding them would silently shrink that position's achievable total.
  const storedTenure = raw.tenure === undefined ? 0 : num(raw.tenure, 0);

  const merged: RankingWeights = {
    ipcr: num(raw.ipcr, RANKING_WEIGHTS.ipcr),
    experience: num(raw.experience, RANKING_WEIGHTS.experience) + storedTenure,
    training: num(raw.training, RANKING_WEIGHTS.training),
    education: num(raw.education, RANKING_WEIGHTS.education),
    eligibility: num(raw.eligibility, RANKING_WEIGHTS.eligibility),
  };

  const total = merged.ipcr + merged.experience + merged.training + merged.education + merged.eligibility;
  if (total <= 0) return { ...RANKING_WEIGHTS };
  if (Math.abs(total - 100) < 0.01) return merged;

  const scale = 100 / total;
  return {
    ipcr: Number((merged.ipcr * scale).toFixed(2)),
    experience: Number((merged.experience * scale).toFixed(2)),
    training: Number((merged.training * scale).toFixed(2)),
    education: Number((merged.education * scale).toFixed(2)),
    eligibility: Number((merged.eligibility * scale).toFixed(2)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Education ladder — shared by the filter and the ranking
// ─────────────────────────────────────────────────────────────────────────────

/** Attainment level. -1 means nothing on record, which is not the same as 0. */
export function educationRank(label: string | null | undefined): number {
  const s = String(label ?? '').toLowerCase();
  if (!s.trim()) return -1;
  if (s.includes('ph.d') || s.includes('phd') || s.includes('doctorate') || s.includes('doctor of philosophy')) return 6;
  if (s.includes('doctor of medicine') || s.includes('dental medicine') || s.includes('juris doctor') || s.includes('bachelor of laws') || s.includes('ll.b') || s.includes('ll.m')) return 5;
  if (s.includes('master') || s.includes('m.a') || s.includes('m.s') || s.includes('mba')) return 4;
  if (s.includes('bachelor') || s.includes('college graduate') || s.includes('degree')) return 3;
  if (s.includes('vocational') || s.includes('technical') || s.includes('two-year') || s.includes('associate')) return 2;
  if (s.includes('college level') || s.includes('undergraduate')) return 1;
  return 0;
}

/** Bachelor's degree — the floor the filter enforces when a position sets none. */
export const BACHELOR_RANK = 3;

// ─────────────────────────────────────────────────────────────────────────────
// A. QUALIFICATIONS — the filter
// ─────────────────────────────────────────────────────────────────────────────

export interface QualificationInput {
  education: string | null;
  requiredEducation: string | null;
  eligibility: string | null;
  requiredEligibility: string | null;
  /** Years of relevant experience credited to the candidate. */
  yearsExperience: number | null;
  requiredYearsExperience: number | null;
  trainingHours: number;
  requiredTrainingHours: number | null;
}

export interface QualificationResult {
  qualified: boolean;
  gates: { education: boolean; eligibility: boolean; experience: boolean; training: boolean };
  /** One line per failed gate, phrased for the Not Yet Qualified list. */
  reasons: string[];
}

/** Top of the CSC scale: Professional, or an RA 1080 equivalent. */
const PROFESSIONAL_LEVEL = 2;

function eligibilityLevel(label: string | null | undefined): number {
  const s = String(label ?? '').trim().toLowerCase();
  if (!s) return 0;
  // Checked first: "sub-professional" contains "professional".
  if (s.includes('sub-professional') || s.includes('sub professional')) return 1;
  if (
    s.includes('professional') ||
    s.includes('ra 1080') || s.includes('ra1080') ||
    s.includes('board') || s.includes('bar') || s.includes('prc') || s.includes('licens')
  ) return 2;
  return 1;
}

function requiredEligibilityLevel(req: string | null | undefined): number {
  const s = String(req ?? '').trim().toLowerCase();
  if (!s) return 0;
  if (s.includes('sub-professional') || s.includes('sub professional')) return 1;
  if (s.includes('professional')) return 2;
  return 1;
}

/**
 * One of an employee's eligibility records, as the scorer needs it.
 *
 * Mirrors the columns `employee_eligibility` has today. Supporting document and
 * verification status are deliberately absent: those belong to the Personal
 * Data Sheet work and are being added there, so a record counts as valid on its
 * expiry date alone until that lands.
 */
export interface EligibilityRecord {
  type: string;
  /** ISO date, or null when the record never expires. */
  validUntil: string | null;
}

/** Points configured for one eligibility type (succession spec §D). */
export interface EligibilityTypePoints {
  name: string;
  points: number;
  isActive: boolean;
}

export interface EligibilityScore {
  /** 0–1. Multiply by the Eligibility weight for the contribution. */
  ratio: number;
  /** Raw points before the cap, so a score can be audited rather than read. */
  rawPoints: number;
  pointsForFullMarks: number;
  /** Records that counted, with the points each contributed. */
  counted: { type: string; points: number }[];
  /** Records excluded because they had expired. */
  expired: string[];
  /**
   * Record types with no row in eligibility_types. They score nothing, and
   * naming them is the point: an unconfigured type is a gap in the
   * configuration, not a judgement that the credential is worthless.
   */
  unconfigured: string[];
}

const eligibilityKey = (name: string) => String(name ?? '').trim().toLowerCase();

/**
 * Eligibility as a 0–1 ratio, from however many records the employee holds.
 *
 * Specification §D: multiple valid eligibilities raise the score, but "the
 * system should avoid simply giving unlimited points for every additional
 * eligibility". So the points sum and are then capped at
 * `pointsForFullMarks` — a long list of minor credentials approaches full
 * marks without ever passing a single major one plus the cap.
 *
 * Points come from the configuration rather than from this function, because
 * the spec puts them in the administrator's hands.
 */
export function eligibilityScore(
  records: EligibilityRecord[],
  types: EligibilityTypePoints[],
  pointsForFullMarks: number,
  today: string = new Date().toISOString().slice(0, 10),
): EligibilityScore {
  const byName = new Map<string, EligibilityTypePoints>();
  for (const t of types) byName.set(eligibilityKey(t.name), t);

  const counted: { type: string; points: number }[] = [];
  const expired: string[] = [];
  const unconfigured: string[] = [];
  const seen = new Set<string>();

  for (const r of records) {
    const name = String(r.type ?? '').trim();
    if (!name) continue;
    const key = eligibilityKey(name);

    // The same eligibility entered twice is one credential, not two. Without
    // this a duplicated PDS row would quietly double somebody's score.
    if (seen.has(key)) continue;
    seen.add(key);

    if (r.validUntil && r.validUntil < today) {
      expired.push(name);
      continue;
    }

    const config = byName.get(key);
    if (!config || config.isActive === false) {
      unconfigured.push(name);
      continue;
    }
    if (config.points > 0) counted.push({ type: name, points: config.points });
  }

  const rawPoints = counted.reduce((sum, c) => sum + c.points, 0);
  // Guarded: a cap of zero would make every ratio Infinity or NaN and silently
  // corrupt the whole ranking rather than one criterion.
  const cap = Number.isFinite(pointsForFullMarks) && pointsForFullMarks > 0 ? pointsForFullMarks : 1;

  return {
    ratio: Math.min(rawPoints / cap, 1),
    rawPoints,
    pointsForFullMarks: cap,
    counted,
    expired,
    unconfigured,
  };
}

/**
 * Does the employee hold the eligibility the position requires?
 *
 * Checks every record rather than one field. Somebody whose required
 * eligibility is their second entry used to fail the filter, because only
 * `employees.eligibility` was read.
 */
export function meetsRequiredEligibility(
  records: EligibilityRecord[],
  requiredEligibility: string | null | undefined,
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  const required = requiredEligibilityLevel(requiredEligibility);
  if (required === 0) {
    // No stated requirement: any unexpired record satisfies it.
    return records.some((r) => !r.validUntil || r.validUntil >= today);
  }
  return records.some(
    (r) => (!r.validUntil || r.validUntil >= today) && eligibilityLevel(r.type) >= required,
  );
}

/**
 * Does the candidate meet all four minimum requirements?
 *
 * A requirement the position has not configured cannot fail: an unset threshold
 * means "not specified", not "zero". The exception is education, where the spec
 * states a Bachelor's degree as the floor regardless, so an unset requirement
 * still enforces that much.
 *
 * Note performance is NOT a gate. It is a ranking criterion only — somebody who
 * meets the four minimums belongs in the pool even before they have been rated.
 */
export function evaluateQualifications(input: QualificationInput): QualificationResult {
  const reasons: string[] = [];

  // 1. Education — Bachelor's minimum, or higher when the position says so.
  const empEdu = educationRank(input.education);
  const reqEdu = Math.max(educationRank(input.requiredEducation), BACHELOR_RANK);
  const educationOk = empEdu >= reqEdu;
  if (!educationOk) {
    reasons.push(
      empEdu < 0
        ? 'No education record on file'
        : `Education below minimum — holds ${input.education}, requires ${input.requiredEducation || "Bachelor's degree"}`,
    );
  }

  // 2. Eligibility — must hold what the position requires.
  const empElig = eligibilityLevel(input.eligibility);
  const reqElig = requiredEligibilityLevel(input.requiredEligibility);
  const eligibilityOk = reqElig === 0 ? empElig > 0 : empElig >= reqElig;
  if (!eligibilityOk) {
    reasons.push(
      empElig === 0
        ? 'No eligibility on record'
        : `Eligibility below requirement — holds ${input.eligibility}, requires ${input.requiredEligibility}`,
    );
  }

  // 3. Experience — minimum relevant years.
  const reqYears = input.requiredYearsExperience;
  const years = input.yearsExperience;
  const experienceOk = reqYears == null || reqYears <= 0 ? true : (years ?? 0) >= reqYears;
  if (!experienceOk) {
    reasons.push(`Experience: ${(years ?? 0).toFixed(1)}/${reqYears} required years`);
  }

  // 4. Relevant training — minimum hours.
  const reqHours = input.requiredTrainingHours;
  const trainingOk = reqHours == null || reqHours <= 0 ? true : input.trainingHours >= reqHours;
  if (!trainingOk) {
    reasons.push(`Training: ${input.trainingHours.toFixed(0)}/${reqHours.toFixed(0)} required hours`);
  }

  return {
    qualified: educationOk && eligibilityOk && experienceOk && trainingOk,
    gates: { education: educationOk, eligibility: eligibilityOk, experience: experienceOk, training: trainingOk },
    reasons,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// B. CRITERIA — the ranking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Education ABOVE the minimum, as a 0–1 ratio, and only when relevant.
 *
 * A Bachelor's degree is the qualification, not an advantage, so it scores
 * zero here — it was already checked by the filter. A higher degree counts only
 * if it relates to the target position: the spec is explicit that a Master's in
 * an unrelated field should not outrank a relevant one.
 */
export function educationBeyondMinimumRatio(input: {
  education: string | null;
  requiredEducation: string | null;
  /**
   * Whether the higher degree relates to the target position. Pass null when
   * relevance is unknown — it is then treated as not established, so an
   * unrelated degree cannot quietly collect points.
   */
  relevant: boolean | null;
}): number {
  const empRank = educationRank(input.education);
  const minRank = Math.max(educationRank(input.requiredEducation), BACHELOR_RANK);
  if (empRank <= minRank) return 0;
  if (input.relevant !== true) return 0;
  // One level above the minimum (typically Master's) is most of the credit;
  // two or more (Doctorate) is full.
  return empRank >= minRank + 2 ? 1 : 0.6;
}

/**
 * Relevant training BEYOND the minimum, as a 0–1 ratio.
 *
 * The filter already required `requiredHours`. This scores the surplus, so
 * meeting the bar exactly earns nothing here and is not paid for twice. With no
 * threshold configured there is no "beyond" to measure, and the hours are
 * scored against a default expectation instead.
 */
export function trainingBeyondMinimumRatio(input: {
  hours: number;
  requiredHours: number | null;
  /** Trainings that match the target position's field or category. */
  relevantCount: number;
  totalCount: number;
}): number {
  const { hours, requiredHours } = input;
  const surplus =
    requiredHours == null || requiredHours <= 0
      ? Math.min(hours / 80, 1) // no threshold set — score against a default expectation
      : Math.min(Math.max(hours - requiredHours, 0) / requiredHours, 1);

  // Relevance share: advanced hours in an unrelated field are worth less than
  // the same hours aimed at the target position.
  const relevanceShare = input.totalCount > 0 ? input.relevantCount / input.totalCount : 0;

  return Number((surplus * 0.7 + relevanceShare * 0.3).toFixed(4));
}

export interface ExperienceInput {
  /** Years of experience judged relevant to the target position. */
  relevantYears: number | null;
  requiredYears: number | null;
  /**
   * Seniority of the candidate's current position relative to the target, as a
   * 0–1 ratio. null when position levels are not known.
   */
  positionLevelRatio: number | null;
  /**
   * Distinct upward moves on record (Staff -> Senior -> Supervisor = 2).
   * null when no work history exists — see the note on the return value.
   */
  progressionSteps: number | null;
}

/** One input to the relevant-experience score, for an auditable breakdown. */
export interface ExperiencePart {
  label: string;
  /** 0–1 contribution, or null when there is no data for it. */
  ratio: number | null;
  /** Share of the experience score this part carries when it is available. */
  weight: number;
  /** What the ratio was derived from, e.g. "10 yrs vs 5 required". */
  detail: string;
}

export interface ExperienceScore {
  ratio: number;
  /**
   * False when career progression could not be assessed because no work history
   * exists for the candidate. The two candidates in the spec — same years, one
   * promoted repeatedly and one flat — are indistinguishable in that case, and
   * the caller should say so rather than present the score as a full judgement.
   */
  progressionAssessed: boolean;
  /**
   * Every input considered, including those with no data. Unavailable parts are
   * kept in the list rather than omitted, so a breakdown shows what could not
   * be assessed instead of silently presenting a narrower judgement as whole.
   */
  parts: ExperiencePart[];
}

/** Upward moves at which the progression component is full. */
export const PROGRESSION_FULL_STEPS = 3;

/**
 * Relevant experience as a 0–1 ratio — quality, not only length.
 *
 * Three components: years relative to the requirement, seniority of the current
 * position, and career progression. Components with no data are dropped and the
 * remainder reweighted, rather than scored as zero: penalising every candidate
 * equally for a record nobody has would just add noise to the ranking.
 */
export function experienceScore(input: ExperienceInput): ExperienceScore {
  // Years — relative to the requirement when one is set, else against a
  // ten-year expectation so the component still discriminates.
  const years = input.relevantYears ?? 0;
  const req = input.requiredYears;
  const yearsRatio =
    req != null && req > 0
      ? Math.min(years / (req * 2), 1) // twice the minimum reads as full marks
      : Math.min(years / 10, 1);

  const levelOk = input.positionLevelRatio != null && Number.isFinite(input.positionLevelRatio);
  const progressionAssessed = input.progressionSteps != null;

  const parts: ExperiencePart[] = [
    {
      label: 'Relevant years',
      ratio: yearsRatio,
      weight: 0.45,
      detail:
        req != null && req > 0
          ? `${years.toFixed(1)} yrs · full marks at ${(req * 2).toFixed(0)} (twice the ${req} required)`
          : `${years.toFixed(1)} yrs · no minimum set, full marks at 10`,
    },
    {
      label: 'Position level',
      ratio: levelOk ? Math.max(0, Math.min(input.positionLevelRatio as number, 1)) : null,
      weight: 0.25,
      detail: levelOk
        ? 'Seniority of current position against the target, from the SRP'
        : 'No SRP rank for this position or the target',
    },
    {
      label: 'Career progression',
      ratio: progressionAssessed
        ? Math.min((input.progressionSteps ?? 0) / PROGRESSION_FULL_STEPS, 1)
        : null,
      weight: 0.3,
      detail: progressionAssessed
        ? `${input.progressionSteps} upward move(s) · full marks at ${PROGRESSION_FULL_STEPS}`
        : 'No work history on file',
    },
    {
      // Named so the breakdown accounts for every input specification B lists,
      // rather than leaving the reader to wonder whether it was considered.
      label: 'Responsibility relevance',
      ratio: null,
      weight: 0,
      detail: 'Not yet implemented — no source for previous responsibilities',
    },
  ];

  // Parts with no data are dropped and the rest reweighted, rather than scored
  // as zero: penalising every candidate equally for a record nobody has would
  // only add noise to the ranking.
  const scored = parts.filter((p) => p.ratio != null && p.weight > 0);
  const totalWeight = scored.reduce((sum, p) => sum + p.weight, 0);
  const ratio = totalWeight > 0
    ? Number((scored.reduce((sum, p) => sum + (p.ratio as number) * p.weight, 0) / totalWeight).toFixed(4))
    : 0;

  return { ratio, progressionAssessed, parts };
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined ranking score
// ─────────────────────────────────────────────────────────────────────────────

export interface RankingBreakdown {
  total: number;
  ipcr: number;
  experience: number;
  training: number;
  education: number;
  eligibility: number;
  /** The points each criterion could have earned. */
  max: RankingWeights;
  /** Mirrors ExperienceScore — the ranking is partial when this is false. */
  progressionAssessed: boolean;
}

/**
 * Weighted 0–100 ranking score for a qualified candidate.
 *
 * Every input is a 0–1 ratio so the weights stay the only place the model's
 * priorities are expressed. A missing IPCR scores zero rather than excluding
 * the candidate — performance is a ranking criterion, not a gate.
 */
export function rankingScore(input: {
  ipcrRatio: number | null;
  /** Includes length of service — there is no separate tenure criterion. */
  experience: ExperienceScore;
  trainingRatio: number;
  educationRatio: number;
  /** From eligibilityScore(): the capped 0–1 share of the eligibility weight. */
  eligibilityRatio: number;
  weights: RankingWeights;
}): RankingBreakdown {
  const W = input.weights;
  const at = (ratio: number, weight: number) => Number((ratio * weight).toFixed(2));

  const ipcr = at(input.ipcrRatio ?? 0, W.ipcr);
  const experience = at(input.experience.ratio, W.experience);
  const training = at(input.trainingRatio, W.training);
  const education = at(input.educationRatio, W.education);

  const eligibility = at(input.eligibilityRatio, W.eligibility);

  return {
    total: Number((ipcr + experience + training + education + eligibility).toFixed(2)),
    ipcr,
    experience,
    training,
    education,
    eligibility,
    max: W,
    progressionAssessed: input.experience.progressionAssessed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Required actions
// ─────────────────────────────────────────────────────────────────────────────

export /**
 * The next step for one failed qualification, shown in Required Actions.
 *
 * Matched against the authored gate message, so the patterns here have to stay
 * in step with the strings pushed into failedGates above. There is no IPCR case
 * any more: performance ranks candidates, it no longer disqualifies them, so it
 * can never appear here.
 */
function actionForGate(gate: string): string {
  const g = gate.toLowerCase();
  // 'course mismatch' is matched explicitly: that message never contains the
  // word "education", so it used to fall through to the generic line.
  if (g.includes('education') || g.includes('course mismatch')) {
    return 'Complete relevant units/certification in the required field, or consider an alternate candidate.';
  }
  if (g.includes('eligibility')) return 'Take and pass the required CSC eligibility exam.';
  if (g.includes('experience')) {
    return "Accrue the remaining years of relevant experience, or consider a candidate who already meets the position's minimum.";
  }
  if (g.includes('training')) return "Attend the training needed to meet the position's requirement.";
  return 'Address the noted requirement.';
}

// ─────────────────────────────────────────────────────────────────────────────
// C. System of Ranking Positions — relative rank
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
 * ordinal. level_order is the fallback for positions with no grade on file,
 * which on current data is about a third of them. Mixing the two scales is
 * refused: a salary grade of 24 and a level_order of 2 are not comparable
 * numbers, and pretending otherwise produces confident nonsense.
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
 * Section C: the system should not recommend someone currently occupying a
 * higher-ranked position for a lower-ranked target.
 *
 * Only a KNOWN downward move excludes. When rank cannot be established the
 * candidate stays in, because excluding on 'unknown' would quietly drop
 * everybody whose position has no grade recorded — which is most of them today
 * — and an SRP gap would read as a judgement about the person.
 */
export function isDownwardMove(candidate: PositionRank, target: PositionRank): boolean {
  return compareRank(candidate, target) === 'higher';
}

/**
 * Seniority of the candidate's current position relative to the target, 0–1,
 * for the relevant-experience score.
 *
 * Someone already at or above the target's level scores full: their experience
 * is being exercised at the right altitude. Below it, the ratio falls away with
 * the distance. Returns null when rank is unknown, so experienceScore drops the
 * component and reweights rather than scoring the candidate as junior on
 * missing data.
 */
export function positionLevelRatio(candidate: PositionRank, target: PositionRank): number | null {
  const pair = (a: number | null, b: number | null) =>
    usable(a) && usable(b) && b > 0 ? Math.min(a / b, 1) : null;
  return pair(candidate.salaryGrade, target.salaryGrade) ?? pair(candidate.levelOrder, target.levelOrder);
}

export type PoolExclusionReason = 'incumbent' | 'same-title' | 'other-department';

const normalizeLabel = (value: string | null | undefined): string =>
  String(value ?? '').trim().toLowerCase();

/**
 * Why an employee must not be auto-listed as a successor to a critical
 * position, or null when they may be.
 *
 * Three things are not succession. The incumbent holds the post already. A
 * peer with the same title would be a lateral move, and an office with several
 * Division Chiefs would otherwise rank them as each other's successors. And a
 * candidate from another office is outside the department whose bench is being
 * built. Applied to auto-discovered candidates only: a manual nomination is
 * HR's deliberate choice, so none of these rules overrides it.
 *
 * Checked in that order, so the incumbent is reported as the incumbent rather
 * than as a same-title peer of themselves. A position with no recorded
 * department is not filtered by department: an unknown office must not empty
 * the whole pool.
 */
export function poolExclusionReason(input: {
  employeeId: string;
  employeeDepartment: string | null;
  employeePosition: string | null;
  positionTitle: string;
  positionDepartment: string | null;
  incumbentEmployeeId: string | null;
}): PoolExclusionReason | null {
  if (input.incumbentEmployeeId && input.employeeId === input.incumbentEmployeeId) {
    return 'incumbent';
  }
  const heldTitle = normalizeLabel(input.employeePosition);
  if (heldTitle && heldTitle === normalizeLabel(input.positionTitle)) {
    return 'same-title';
  }
  const positionDepartment = normalizeLabel(input.positionDepartment);
  if (positionDepartment && normalizeLabel(input.employeeDepartment) !== positionDepartment) {
    return 'other-department';
  }
  return null;
}
