import { describe, expect, it } from 'vitest';
import {
  RANKING_WEIGHTS,
  actionForGate,
  educationBeyondMinimumRatio,
  evaluateQualifications,
  experienceScore,
  normalizeWeights,
  rankingScore,
  tenureRatio,
  trainingBeyondMinimumRatio,
  type QualificationInput,
} from './successionCriteria';

const qualified: QualificationInput = {
  education: "Bachelor of Science in Civil Engineering",
  requiredEducation: "Bachelor's degree",
  eligibility: 'CS Professional',
  requiredEligibility: 'Professional',
  yearsExperience: 6,
  requiredYearsExperience: 5,
  trainingHours: 60,
  requiredTrainingHours: 40,
};

describe('A. Qualifications — the filter', () => {
  it('admits a candidate meeting all four minimums', () => {
    const r = evaluateQualifications(qualified);
    expect(r.qualified).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('rejects on any single failed gate', () => {
    for (const patch of [
      { education: 'High School Graduate' },
      { eligibility: null },
      { yearsExperience: 2 },
      { trainingHours: 10 },
    ] as Partial<QualificationInput>[]) {
      const r = evaluateQualifications({ ...qualified, ...patch });
      expect(r.qualified).toBe(false);
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });

  it('enforces a Bachelor floor even when the position sets no requirement', () => {
    // The spec states Bachelor's as the minimum outright, so an unset
    // requirement must not let a vocational record through.
    const r = evaluateQualifications({
      ...qualified,
      requiredEducation: null,
      education: 'Vocational / Technical Course',
    });
    expect(r.gates.education).toBe(false);
  });

  it('does not fail a requirement the position never configured', () => {
    // Unset means "not specified", not "zero required".
    const r = evaluateQualifications({
      ...qualified,
      yearsExperience: 0,
      requiredYearsExperience: null,
      trainingHours: 0,
      requiredTrainingHours: null,
    });
    expect(r.gates.experience).toBe(true);
    expect(r.gates.training).toBe(true);
    expect(r.qualified).toBe(true);
  });

  it('treats sub-professional as insufficient where Professional is required', () => {
    const r = evaluateQualifications({ ...qualified, eligibility: 'CS Sub-Professional' });
    expect(r.gates.eligibility).toBe(false);
  });

  it('accepts board/PRC licences as professional-level eligibility', () => {
    const r = evaluateQualifications({ ...qualified, eligibility: 'PRC Licensed Civil Engineer' });
    expect(r.gates.eligibility).toBe(true);
  });

  it('does not gate on performance', () => {
    // Performance is a ranking criterion. An unrated employee who meets the four
    // minimums still belongs in the pool.
    const r = evaluateQualifications(qualified);
    expect(Object.keys(r.gates).sort()).toEqual(['education', 'eligibility', 'experience', 'training']);
  });

  it('reports every failed gate, not just the first', () => {
    const r = evaluateQualifications({
      ...qualified,
      education: 'High School Graduate',
      eligibility: null,
      yearsExperience: 1,
    });
    expect(r.reasons).toHaveLength(3);
  });
});

describe('B. Education beyond the minimum', () => {
  it('scores a Bachelor at zero — it is the qualification, not an advantage', () => {
    expect(
      educationBeyondMinimumRatio({
        education: 'Bachelor of Science in Civil Engineering',
        requiredEducation: "Bachelor's degree",
        relevant: true,
      }),
    ).toBe(0);
  });

  it('credits a relevant Master and a relevant Doctorate, Doctorate higher', () => {
    const master = educationBeyondMinimumRatio({
      education: 'Master of Public Administration',
      requiredEducation: "Bachelor's degree",
      relevant: true,
    });
    const doctorate = educationBeyondMinimumRatio({
      education: 'Doctorate in Public Administration',
      requiredEducation: "Bachelor's degree",
      relevant: true,
    });
    expect(master).toBeGreaterThan(0);
    expect(doctorate).toBeGreaterThan(master);
  });

  it('gives no credit for a higher degree that is not relevant', () => {
    // "Higher degree should receive points only if relevant to the target position."
    expect(
      educationBeyondMinimumRatio({
        education: 'Master of Music',
        requiredEducation: "Bachelor's degree",
        relevant: false,
      }),
    ).toBe(0);
  });

  it('withholds credit when relevance is unknown rather than assuming it', () => {
    expect(
      educationBeyondMinimumRatio({
        education: 'Master of Public Administration',
        requiredEducation: "Bachelor's degree",
        relevant: null,
      }),
    ).toBe(0);
  });
});

describe('B. Tenure', () => {
  it('rises with years but saturates so long service cannot dominate', () => {
    expect(tenureRatio(0)).toBe(0);
    expect(tenureRatio(5)).toBeGreaterThan(0);
    expect(tenureRatio(15)).toBe(1);
    expect(tenureRatio(40)).toBe(1);
  });

  it('matches the weights given in specification E', () => {
    // Pinned so a future edit to the model is a deliberate, visible change
    // rather than a silent drift away from the document.
    expect(RANKING_WEIGHTS).toEqual({
      ipcr: 30, experience: 25, training: 20, education: 15, tenure: 10,
    });
    const total = Object.values(RANKING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it('carries the smallest weight of the five criteria', () => {
    const w = RANKING_WEIGHTS;
    expect(w.tenure).toBeLessThan(w.ipcr);
    expect(w.tenure).toBeLessThan(w.experience);
    expect(w.tenure).toBeLessThan(w.training);
    expect(w.tenure).toBeLessThan(w.education);
  });

  it('treats missing hire data as zero rather than crediting it', () => {
    expect(tenureRatio(null)).toBe(0);
  });
});

describe('B. Training beyond the minimum', () => {
  it('pays nothing for exactly meeting the threshold the filter already checked', () => {
    const r = trainingBeyondMinimumRatio({
      hours: 40, requiredHours: 40, relevantCount: 0, totalCount: 0,
    });
    expect(r).toBe(0);
  });

  it('rewards hours above the threshold', () => {
    const met = trainingBeyondMinimumRatio({ hours: 40, requiredHours: 40, relevantCount: 2, totalCount: 4 });
    const over = trainingBeyondMinimumRatio({ hours: 80, requiredHours: 40, relevantCount: 2, totalCount: 4 });
    expect(over).toBeGreaterThan(met);
  });

  it('values relevant training over unrelated training at equal hours', () => {
    const relevant = trainingBeyondMinimumRatio({ hours: 80, requiredHours: 40, relevantCount: 4, totalCount: 4 });
    const unrelated = trainingBeyondMinimumRatio({ hours: 80, requiredHours: 40, relevantCount: 0, totalCount: 4 });
    expect(relevant).toBeGreaterThan(unrelated);
  });
});

describe('B. Relevant experience', () => {
  it('separates the two candidates from the spec on career progression', () => {
    // Candidate A: 10 years, one organisation, Staff -> Senior -> Supervisor.
    const a = experienceScore({
      relevantYears: 10, requiredYears: 5, positionLevelRatio: 0.9, progressionSteps: 2,
    });
    // Candidate B: 10 years, several organisations, mostly the same level.
    const b = experienceScore({
      relevantYears: 10, requiredYears: 5, positionLevelRatio: 0.4, progressionSteps: 0,
    });
    expect(a.ratio).toBeGreaterThan(b.ratio);
    expect(a.progressionAssessed).toBe(true);
  });

  it('flags when progression could not be assessed instead of scoring it zero', () => {
    // No work history on file. Scoring progression as zero for everybody would
    // add noise; the caller is told the judgement is partial instead.
    const s = experienceScore({
      relevantYears: 10, requiredYears: 5, positionLevelRatio: null, progressionSteps: null,
    });
    expect(s.progressionAssessed).toBe(false);
    expect(s.ratio).toBeGreaterThan(0);
  });

  it('does not let a missing component drag the ratio down', () => {
    const withAll = experienceScore({
      relevantYears: 10, requiredYears: 5, positionLevelRatio: 1, progressionSteps: 3,
    });
    const yearsOnly = experienceScore({
      relevantYears: 10, requiredYears: 5, positionLevelRatio: null, progressionSteps: null,
    });
    // Years alone is full marks here, so dropping the other components and
    // reweighting must leave the ratio at full too.
    expect(yearsOnly.ratio).toBeCloseTo(1, 5);
    expect(withAll.ratio).toBeCloseTo(1, 5);
  });

  it('rewards more relevant years', () => {
    const few = experienceScore({ relevantYears: 3, requiredYears: 5, positionLevelRatio: null, progressionSteps: null });
    const many = experienceScore({ relevantYears: 9, requiredYears: 5, positionLevelRatio: null, progressionSteps: null });
    expect(many.ratio).toBeGreaterThan(few.ratio);
  });
});

describe('Ranking score', () => {
  const exp = experienceScore({ relevantYears: 10, requiredYears: 5, positionLevelRatio: 0.8, progressionSteps: 2 });

  it('is 0–100 and sums its components', () => {
    const r = rankingScore({
      ipcrRatio: 1, experience: exp, trainingRatio: 1, educationRatio: 1, tenureRatio: 1,
      weights: RANKING_WEIGHTS,
    });
    expect(r.total).toBeCloseTo(
      r.ipcr + r.experience + r.training + r.education + r.tenure, 2,
    );
    expect(r.total).toBeLessThanOrEqual(100);
  });

  it('scores an unrated candidate at zero for performance without excluding them', () => {
    const r = rankingScore({
      ipcrRatio: null, experience: exp, trainingRatio: 0.5, educationRatio: 0, tenureRatio: 0.5,
      weights: RANKING_WEIGHTS,
    });
    expect(r.ipcr).toBe(0);
    expect(r.total).toBeGreaterThan(0);
  });

  it('ranks performance above tenure at equal ratios', () => {
    const strongPerformer = rankingScore({
      ipcrRatio: 1, experience: exp, trainingRatio: 0, educationRatio: 0, tenureRatio: 0,
      weights: RANKING_WEIGHTS,
    });
    const longServer = rankingScore({
      ipcrRatio: 0, experience: exp, trainingRatio: 0, educationRatio: 0, tenureRatio: 1,
      weights: RANKING_WEIGHTS,
    });
    expect(strongPerformer.total).toBeGreaterThan(longServer.total);
  });
});

describe('normalizeWeights', () => {
  it('returns the defaults for an empty or missing configuration', () => {
    expect(normalizeWeights(null)).toEqual(RANKING_WEIGHTS);
    expect(normalizeWeights({})).toEqual(RANKING_WEIGHTS);
  });

  it('migrates a legacy row that still carries an eligibility weight', () => {
    // Eligibility is filter-only now. Its points must not disappear, or the row
    // would silently stop summing to 100.
    const w = normalizeWeights({ ipcr: 35, training: 30, education: 20, eligibility: 15 });
    const total = w.ipcr + w.experience + w.training + w.education + w.tenure;
    expect(total).toBeCloseTo(100, 1);
    expect((w as unknown as Record<string, unknown>).eligibility).toBeUndefined();
  });

  it('renormalises a hand-edited row that does not total 100', () => {
    const w = normalizeWeights({ ipcr: 10, experience: 10, training: 10, education: 10, tenure: 10 });
    const total = w.ipcr + w.experience + w.training + w.education + w.tenure;
    expect(total).toBeCloseTo(100, 1);
    expect(w.ipcr).toBeCloseTo(20, 1);
  });

  it('falls back to defaults for negative or non-numeric entries', () => {
    const w = normalizeWeights({ ipcr: -5, tenure: 'abc' });
    expect(w.ipcr).toBeGreaterThan(0);
    expect(w.tenure).toBeGreaterThan(0);
  });
});

describe('actionForGate', () => {
  it('gives a course-mismatch failure the education action', () => {
    // Regression: this message never contains the word "education", so it used
    // to fall through to the generic "Address the noted requirement."
    const a = actionForGate('Course mismatch — position requires BS Civil Engineering, candidate holds BS Biology');
    expect(a).toMatch(/units|certification/i);
    expect(a).not.toBe('Address the noted requirement.');
  });

  it('gives a missing education record the education action', () => {
    expect(actionForGate('No education record on file')).toMatch(/units|certification/i);
  });

  it('gives an experience shortfall its own action', () => {
    const a = actionForGate('Experience: 3.0/5 required years');
    expect(a).toMatch(/years of relevant experience/i);
    expect(a).not.toBe('Address the noted requirement.');
  });

  it('gives eligibility and training their own actions', () => {
    expect(actionForGate('No eligibility on record')).toMatch(/CSC eligibility/i);
    expect(actionForGate('Training: 10/40 required hours')).toMatch(/training/i);
  });

  it('falls back to the generic line for anything unrecognised', () => {
    expect(actionForGate('Something nobody has written a case for')).toBe('Address the noted requirement.');
  });
});
