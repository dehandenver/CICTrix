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
 *      Tenure, Education beyond the minimum, Relevant Training and Relevant
 *      Experience.
 *
 * The distinction matters: a criterion that gates must never also be scored on
 * whether it gates, or clearing the bar gets paid for twice. Education and
 * Training appear in both stages, but the ranking counts only what is ABOVE the
 * minimum the filter already checked. Eligibility appears only in the filter —
 * it is binary, so there is nothing to rank once it has been met.
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
  /** Relevant experience — quality, not only length of service. */
  experience: number;
  /** Relevant training beyond the minimum. */
  training: number;
  /** Education above the minimum, and only when relevant. */
  education: number;
  /** Time in the organisation. Deliberately the smallest weight. */
  tenure: number;
}

/**
 * Default ranking weights (sum 100), as given in section E of the succession
 * specification.
 *
 * Tenure is lowest on purpose: the spec is explicit that longer service alone
 * does not make somebody more qualified, so it can break a tie without
 * outweighing performance or relevant experience.
 *
 * The spec calls these "proposed initial weights" to be validated by HR or
 * derived through a method such as AHP, so treat them as a starting point
 * rather than a settled model. Per-position overrides live in
 * critical_positions.succession_weights and go through normalizeWeights.
 */
export const RANKING_WEIGHTS: RankingWeights = {
  ipcr: 30,
  experience: 25,
  training: 20,
  education: 15,
  tenure: 10,
};

/**
 * Coerce a stored weight object into the current shape.
 *
 * Positions configured before this model carry `{ipcr, training, education,
 * eligibility}` — eligibility is now filter-only and has no ranking weight, so
 * its points would otherwise vanish and the row would silently stop summing to
 * 100. Any missing criterion falls back to its default, `eligibility` is
 * dropped, and the result is renormalised so a hand-edited row that does not
 * total 100 still produces comparable scores.
 */
export function normalizeWeights(stored: unknown): RankingWeights {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const merged: RankingWeights = {
    ipcr: num(raw.ipcr, RANKING_WEIGHTS.ipcr),
    experience: num(raw.experience, RANKING_WEIGHTS.experience),
    training: num(raw.training, RANKING_WEIGHTS.training),
    education: num(raw.education, RANKING_WEIGHTS.education),
    tenure: num(raw.tenure, RANKING_WEIGHTS.tenure),
  };

  const total = merged.ipcr + merged.experience + merged.training + merged.education + merged.tenure;
  if (total <= 0) return { ...RANKING_WEIGHTS };
  if (Math.abs(total - 100) < 0.01) return merged;

  const scale = 100 / total;
  return {
    ipcr: Number((merged.ipcr * scale).toFixed(2)),
    experience: Number((merged.experience * scale).toFixed(2)),
    training: Number((merged.training * scale).toFixed(2)),
    education: Number((merged.education * scale).toFixed(2)),
    tenure: Number((merged.tenure * scale).toFixed(2)),
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

/** Years of tenure at which the tenure component is full. */
export const TENURE_FULL_YEARS = 15;

/**
 * Tenure as a 0–1 ratio, saturating at TENURE_FULL_YEARS.
 *
 * Saturating rather than growing without limit is the point: the spec wants
 * long service to add something, not to let a thirty-year record outrank a
 * stronger candidate on length alone.
 */
export function tenureRatio(years: number | null): number {
  if (years == null || !Number.isFinite(years) || years <= 0) return 0;
  return Math.min(years / TENURE_FULL_YEARS, 1);
}

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

export interface ExperienceScore {
  ratio: number;
  /**
   * False when career progression could not be assessed because no work history
   * exists for the candidate. The two candidates in the spec — same years, one
   * promoted repeatedly and one flat — are indistinguishable in that case, and
   * the caller should say so rather than present the score as a full judgement.
   */
  progressionAssessed: boolean;
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
  const parts: { value: number; weight: number }[] = [];

  // Years — relative to the requirement when one is set, else against a
  // ten-year expectation so the component still discriminates.
  const years = input.relevantYears ?? 0;
  const req = input.requiredYears;
  const yearsValue =
    req != null && req > 0
      ? Math.min(years / (req * 2), 1) // twice the minimum reads as full marks
      : Math.min(years / 10, 1);
  parts.push({ value: yearsValue, weight: 0.45 });

  if (input.positionLevelRatio != null && Number.isFinite(input.positionLevelRatio)) {
    parts.push({ value: Math.max(0, Math.min(input.positionLevelRatio, 1)), weight: 0.25 });
  }

  const progressionAssessed = input.progressionSteps != null;
  if (progressionAssessed) {
    parts.push({
      value: Math.min((input.progressionSteps ?? 0) / PROGRESSION_FULL_STEPS, 1),
      weight: 0.3,
    });
  }

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const ratio = totalWeight > 0
    ? Number((parts.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight).toFixed(4))
    : 0;

  return { ratio, progressionAssessed };
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
  tenure: number;
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
  experience: ExperienceScore;
  trainingRatio: number;
  educationRatio: number;
  tenureRatio: number;
  weights: RankingWeights;
}): RankingBreakdown {
  const W = input.weights;
  const at = (ratio: number, weight: number) => Number((ratio * weight).toFixed(2));

  const ipcr = at(input.ipcrRatio ?? 0, W.ipcr);
  const experience = at(input.experience.ratio, W.experience);
  const training = at(input.trainingRatio, W.training);
  const education = at(input.educationRatio, W.education);
  const tenure = at(input.tenureRatio, W.tenure);

  return {
    total: Number((ipcr + experience + training + education + tenure).toFixed(2)),
    ipcr,
    experience,
    training,
    education,
    tenure,
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
