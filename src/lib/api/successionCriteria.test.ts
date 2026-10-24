import { describe, expect, it } from 'vitest';
import {
  eligibilityScore,
  meetsRequiredEligibility,
  PROGRESSION_FULL_STEPS,
  RANKING_WEIGHTS,
  actionForGate,
  compareRank,
  isDownwardMove,
  positionLevelRatio,
  educationBeyondMinimumRatio,
  evaluateQualifications,
  experienceScore,
  normalizeWeights,
  poolExclusionReason,
  rankingScore,
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

describe('B. Weights', () => {
  it('matches the weights given in specification E', () => {
    // Pinned so a future edit to the model is a deliberate, visible change
    // rather than a silent drift away from the document.
    expect(RANKING_WEIGHTS).toEqual({
      ipcr: 30, experience: 20, training: 20, education: 15, eligibility: 15,
    });
    const total = Object.values(RANKING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it('has no separate tenure criterion', () => {
    // Length of service is the years component of the experience score. A
    // standalone tenure weight scored the same number a second time.
    expect((RANKING_WEIGHTS as unknown as Record<string, number>).tenure).toBeUndefined();
  });

  it('ranks performance highest', () => {
    const w = RANKING_WEIGHTS;
    expect(w.ipcr).toBeGreaterThan(w.experience);
    expect(w.ipcr).toBeGreaterThan(w.training);
    expect(w.ipcr).toBeGreaterThan(w.education);
    expect(w.ipcr).toBeGreaterThan(w.eligibility);
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
      ipcrRatio: 1, experience: exp, trainingRatio: 1, educationRatio: 1, eligibilityRatio: 1,
      weights: RANKING_WEIGHTS,
    });
    expect(r.total).toBeCloseTo(
      r.ipcr + r.experience + r.training + r.education + r.eligibility, 2,
    );
    expect(r.total).toBeLessThanOrEqual(100);
  });

  it('scores an unrated candidate at zero for performance without excluding them', () => {
    const r = rankingScore({
      ipcrRatio: null, experience: exp, trainingRatio: 0.5, educationRatio: 0, eligibilityRatio: 0,
      weights: RANKING_WEIGHTS,
    });
    expect(r.ipcr).toBe(0);
    expect(r.total).toBeGreaterThan(0);
  });

  it('ranks performance above tenure at equal ratios', () => {
    const strongPerformer = rankingScore({
      ipcrRatio: 1, experience: exp, trainingRatio: 0, educationRatio: 0, eligibilityRatio: 0,
      weights: RANKING_WEIGHTS,
    });
    const longServer = rankingScore({
      ipcrRatio: 0, experience: exp, trainingRatio: 0, educationRatio: 0, eligibilityRatio: 0,
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

  it('keeps a legacy row’s eligibility weight now that it scores again', () => {
    // This value used to be discarded, because eligibility was filter-only.
    // Eligibility above the position's minimum is a ranking criterion again, so
    // the stored weight is honoured rather than dropped.
    const w = normalizeWeights({ ipcr: 35, training: 30, education: 20, eligibility: 15 });
    expect(w.eligibility).toBeGreaterThan(0);
    const total = w.ipcr + w.experience + w.training + w.education + w.eligibility;
    expect(total).toBeCloseTo(100, 1);
  });

  it('renormalises a hand-edited row that does not total 100', () => {
    const w = normalizeWeights({ ipcr: 10, experience: 10, training: 10, education: 10, eligibility: 10 });
    const total = w.ipcr + w.experience + w.training + w.education + w.eligibility;
    expect(total).toBeCloseTo(100, 1);
    expect(w.ipcr).toBeCloseTo(20, 1);
  });

  it('folds a legacy tenure weight into experience rather than dropping it', () => {
    // Those points were allocated to length of service, which experience now
    // carries. Discarding them would shrink the position's achievable total.
    const w = normalizeWeights({ ipcr: 30, experience: 20, training: 20, education: 15, eligibility: 10, tenure: 5 });
    expect(w.experience).toBeCloseTo(25, 1);
    const total = w.ipcr + w.experience + w.training + w.education + w.eligibility;
    expect(total).toBeCloseTo(100, 1);
  });

  it('falls back to defaults for negative or non-numeric entries', () => {
    const w = normalizeWeights({ ipcr: -5, education: 'abc' });
    expect(w.ipcr).toBeGreaterThan(0);
    expect(w.education).toBeGreaterThan(0);
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

describe('C. System of Ranking Positions', () => {
  const sg = (n: number | null) => ({ salaryGrade: n, levelOrder: null });
  const lvl = (n: number | null) => ({ salaryGrade: null, levelOrder: n });

  it('ranks by salary grade when both sides have one', () => {
    expect(compareRank(sg(24), sg(21))).toBe('higher');
    expect(compareRank(sg(3), sg(21))).toBe('lower');
    expect(compareRank(sg(15), sg(15))).toBe('equal');
  });

  it('falls back to level order when a salary grade is missing', () => {
    // About a third of real positions have no grade on file.
    expect(compareRank(lvl(3), lvl(1))).toBe('higher');
    expect(compareRank(lvl(1), lvl(4))).toBe('lower');
  });

  it('prefers salary grade over level order when both exist', () => {
    const candidate = { salaryGrade: 24, levelOrder: 1 };
    const target = { salaryGrade: 21, levelOrder: 4 };
    // Grade says higher, level says lower. Grade wins.
    expect(compareRank(candidate, target)).toBe('higher');
  });

  it('refuses to compare a salary grade against a level order', () => {
    // SG 24 and level_order 2 are different scales; comparing them would be
    // confident nonsense.
    expect(compareRank(sg(24), lvl(2))).toBe('unknown');
    expect(compareRank(lvl(2), sg(24))).toBe('unknown');
  });

  it('returns unknown when neither side is ranked', () => {
    expect(compareRank(sg(null), sg(null))).toBe('unknown');
  });

  describe('isDownwardMove', () => {
    it('excludes a candidate ranked above the target', () => {
      // Section C: never recommend a Division Chief for a Staff post.
      expect(isDownwardMove(sg(24), sg(10))).toBe(true);
    });

    it('keeps lateral and upward moves', () => {
      expect(isDownwardMove(sg(10), sg(10))).toBe(false);
      expect(isDownwardMove(sg(10), sg(24))).toBe(false);
    });

    it('keeps a candidate whose rank cannot be established', () => {
      // An SRP gap must not read as a judgement about the person.
      expect(isDownwardMove(sg(null), sg(20))).toBe(false);
      expect(isDownwardMove(sg(24), sg(null))).toBe(false);
    });
  });

  describe('positionLevelRatio', () => {
    it('gives full marks at or above the target level', () => {
      expect(positionLevelRatio(sg(20), sg(20))).toBe(1);
      expect(positionLevelRatio(sg(24), sg(20))).toBe(1);
    });

    it('falls away with distance below the target', () => {
      const near = positionLevelRatio(sg(18), sg(20))!;
      const far = positionLevelRatio(sg(4), sg(20))!;
      expect(near).toBeGreaterThan(far);
      expect(far).toBeGreaterThan(0);
    });

    it('returns null when rank is unknown, so the component is dropped', () => {
      expect(positionLevelRatio(sg(null), sg(20))).toBeNull();
      expect(positionLevelRatio(sg(24), lvl(3))).toBeNull();
    });
  });
});

describe('Eligibility from multiple records (spec §B–D)', () => {
  const types = [
    { name: 'CSC Professional', points: 40, isActive: true },
    { name: 'PRC License', points: 40, isActive: true },
    { name: "Professional Driver's License", points: 5, isActive: true },
    { name: 'Retired Type', points: 30, isActive: false },
  ];
  const CAP = 100;
  const rec = (type: string, validUntil: string | null = null) => ({ type, validUntil });

  it('adds up every valid eligibility rather than reading one', () => {
    // The whole point of §B: an employee may hold more than one.
    const s = eligibilityScore([rec('CSC Professional'), rec('PRC License')], types, CAP, '2026-10-05');
    expect(s.rawPoints).toBe(80);
    expect(s.ratio).toBeCloseTo(0.8, 5);
    expect(s.counted).toHaveLength(2);
  });

  it('caps at full marks so extra credentials cannot run away with it', () => {
    // §D: "avoid simply giving unlimited points for every additional eligibility".
    const many = [rec('CSC Professional'), rec('PRC License'), rec("Professional Driver's License")];
    const s = eligibilityScore(many, types, CAP, '2026-10-05');
    expect(s.rawPoints).toBe(85);
    expect(s.ratio).toBeLessThanOrEqual(1);

    const over = eligibilityScore(many, types, 50, '2026-10-05');
    expect(over.ratio).toBe(1);
    expect(over.rawPoints).toBe(85); // raw is still reported, so the cap is visible
  });

  it('excludes an expired record and says which', () => {
    const s = eligibilityScore(
      [rec('CSC Professional', '2020-01-01'), rec('PRC License', '2099-01-01')],
      types, CAP, '2026-10-05',
    );
    expect(s.rawPoints).toBe(40);
    expect(s.expired).toEqual(['CSC Professional']);
  });

  it('counts a record with no expiry date', () => {
    expect(eligibilityScore([rec('CSC Professional', null)], types, CAP, '2026-10-05').rawPoints).toBe(40);
  });

  it('reports an unconfigured type instead of silently scoring it zero', () => {
    // An unconfigured type is a gap in the configuration, not a judgement that
    // the credential is worthless. HR has to be able to see the difference.
    const s = eligibilityScore([rec('Barangay Eligibility')], types, CAP, '2026-10-05');
    expect(s.rawPoints).toBe(0);
    expect(s.unconfigured).toEqual(['Barangay Eligibility']);
  });

  it('treats a deactivated type as unconfigured', () => {
    const s = eligibilityScore([rec('Retired Type')], types, CAP, '2026-10-05');
    expect(s.rawPoints).toBe(0);
    expect(s.unconfigured).toEqual(['Retired Type']);
  });

  it('does not pay twice for the same eligibility entered twice', () => {
    const s = eligibilityScore([rec('CSC Professional'), rec('csc professional')], types, CAP, '2026-10-05');
    expect(s.rawPoints).toBe(40);
    expect(s.counted).toHaveLength(1);
  });

  it('ignores case and surrounding space when matching a type', () => {
    expect(eligibilityScore([rec('  csc PROFESSIONAL ')], types, CAP, '2026-10-05').rawPoints).toBe(40);
  });

  it('scores nothing, and does not crash, with no records', () => {
    const s = eligibilityScore([], types, CAP, '2026-10-05');
    expect(s.ratio).toBe(0);
    expect(s.counted).toEqual([]);
  });

  it('survives a cap of zero rather than returning Infinity', () => {
    // A misconfigured cap must cost this one criterion, not corrupt every
    // candidate's total with NaN.
    const s = eligibilityScore([rec('CSC Professional')], types, 0, '2026-10-05');
    expect(Number.isFinite(s.ratio)).toBe(true);
    expect(s.ratio).toBeLessThanOrEqual(1);
  });
});

describe('meetsRequiredEligibility', () => {
  const rec = (type: string, validUntil: string | null = null) => ({ type, validUntil });

  it('finds the required eligibility even when it is not the first record', () => {
    // The bug this replaces: only employees.eligibility was read, so a second
    // entry could not satisfy the gate.
    const records = [rec("Professional Driver's License"), rec('CSC Professional')];
    expect(meetsRequiredEligibility(records, 'Professional', '2026-10-05')).toBe(true);
  });

  it('rejects a candidate holding only a lower level', () => {
    expect(meetsRequiredEligibility([rec('Sub-Professional')], 'Professional', '2026-10-05')).toBe(false);
  });

  it('does not accept an expired record', () => {
    expect(meetsRequiredEligibility([rec('CSC Professional', '2020-01-01')], 'Professional', '2026-10-05')).toBe(false);
  });

  it('accepts any unexpired record when the position states no requirement', () => {
    expect(meetsRequiredEligibility([rec('Barangay Eligibility')], null, '2026-10-05')).toBe(true);
    expect(meetsRequiredEligibility([], null, '2026-10-05')).toBe(false);
  });
});

describe('Ranking with eligibility', () => {
  // Every experience component at full marks, so the totals below are the
  // weights themselves and an absolute assertion means something.
  const perfectExp = experienceScore({
    relevantYears: 10,
    requiredYears: 5,
    positionLevelRatio: 1,
    progressionSteps: PROGRESSION_FULL_STEPS,
  });
  const base = {
    ipcrRatio: 1,
    experience: perfectExp,
    trainingRatio: 1,
    educationRatio: 1,
    weights: RANKING_WEIGHTS,
  };

  it('ranks a candidate with more eligibility points above one with fewer', () => {
    const many = rankingScore({ ...base, eligibilityRatio: 1 });
    const none = rankingScore({ ...base, eligibilityRatio: 0 });
    expect(many.total).toBeGreaterThan(none.total);
    expect(many.total - none.total).toBeCloseTo(RANKING_WEIGHTS.eligibility, 2);
  });

  it('scales a partial eligibility score by its weight', () => {
    const half = rankingScore({ ...base, eligibilityRatio: 0.5 });
    expect(half.eligibility).toBeCloseTo(RANKING_WEIGHTS.eligibility / 2, 2);
  });

  it('tops out at 100', () => {
    expect(rankingScore({ ...base, eligibilityRatio: 1 }).total).toBeCloseTo(100, 2);
  });
});

describe('Weights after the eligibility split', () => {
  it('sums to 100', () => {
    const w = RANKING_WEIGHTS;
    expect(w.ipcr + w.experience + w.training + w.education + w.eligibility).toBe(100);
  });

  it('matches the figures in the specification table', () => {
    expect(RANKING_WEIGHTS.ipcr).toBe(30);
    expect(RANKING_WEIGHTS.experience).toBe(20);
    expect(RANKING_WEIGHTS.training).toBe(20);
    expect(RANKING_WEIGHTS.education).toBe(15);
    expect(RANKING_WEIGHTS.eligibility).toBe(15);
  });

  it('keeps a legacy stored eligibility weight instead of discarding it', () => {
    // Rows written under the old shape carried this value and it was dropped,
    // because eligibility had no ranking weight. It counts again.
    const w = normalizeWeights({ ipcr: 40, training: 20, education: 20, eligibility: 20 });
    expect(w.eligibility).toBeGreaterThan(0);
    const total = w.ipcr + w.experience + w.training + w.education + w.eligibility;
    expect(total).toBeCloseTo(100, 1);
  });
});

describe('Succession pool scope', () => {
  const target = {
    positionTitle: 'Assistant City Accountant',
    positionDepartment: 'Office of The City Accountant',
    incumbentEmployeeId: 'emp-incumbent',
  };
  const candidate = {
    employeeId: 'emp-1',
    employeeDepartment: 'Office of The City Accountant',
    employeePosition: 'Accountant II (General Fund Accountant)',
  };

  it('keeps a same-department employee in a different role', () => {
    expect(poolExclusionReason({ ...target, ...candidate })).toBeNull();
  });

  it('excludes the incumbent from their own succession pool', () => {
    expect(
      poolExclusionReason({ ...target, ...candidate, employeeId: 'emp-incumbent' }),
    ).toBe('incumbent');
  });

  it('excludes a peer holding the same title as a lateral move', () => {
    expect(
      poolExclusionReason({
        ...target,
        ...candidate,
        employeePosition: '  assistant city accountant ',
      }),
    ).toBe('same-title');
  });

  it('excludes an employee from another department', () => {
    expect(
      poolExclusionReason({
        ...target,
        ...candidate,
        employeeDepartment: 'Office of The City Engineer',
      }),
    ).toBe('other-department');
  });

  it('matches the department regardless of case and spacing', () => {
    expect(
      poolExclusionReason({
        ...target,
        ...candidate,
        employeeDepartment: ' OFFICE OF THE CITY ACCOUNTANT ',
      }),
    ).toBeNull();
  });

  it('does not filter by department when the position has none recorded', () => {
    expect(
      poolExclusionReason({
        ...target,
        ...candidate,
        positionDepartment: null,
        employeeDepartment: 'Office of The City Engineer',
      }),
    ).toBeNull();
  });

  it('reports the incumbent before the same-title peer rule', () => {
    expect(
      poolExclusionReason({
        ...target,
        ...candidate,
        employeeId: 'emp-incumbent',
        employeePosition: 'Assistant City Accountant',
      }),
    ).toBe('incumbent');
  });

  it('does not treat a missing position title as a same-title peer', () => {
    expect(
      poolExclusionReason({ ...target, ...candidate, employeePosition: null }),
    ).toBeNull();
  });
});
