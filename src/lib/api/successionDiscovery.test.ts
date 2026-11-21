import { describe, it, expect } from 'vitest';
import {
  compareRank,
  isDownwardMove,
  compareTitleRank,
  isDownwardTitleMove,
  canonicalEligibilityTypeName,
  resolveRecognizedEligibility,
} from './successionDiscovery';

describe('System of Ranking Positions (PositionRank)', () => {
  const sg = (n: number | null) => ({ salaryGrade: n, levelOrder: null });
  const lvl = (n: number | null) => ({ salaryGrade: null, levelOrder: n });

  it('ranks by salary grade when both sides have one', () => {
    expect(compareRank(sg(24), sg(21))).toBe('higher');
    expect(compareRank(sg(3), sg(21))).toBe('lower');
    expect(compareRank(sg(15), sg(15))).toBe('equal');
  });

  it('falls back to level order when a salary grade is missing', () => {
    expect(compareRank(lvl(3), lvl(1))).toBe('higher');
    expect(compareRank(lvl(1), lvl(4))).toBe('lower');
  });

  it('prefers salary grade over level order when both exist', () => {
    expect(compareRank({ salaryGrade: 24, levelOrder: 1 }, { salaryGrade: 21, levelOrder: 4 })).toBe('higher');
  });

  it('refuses to compare a salary grade against a level order', () => {
    expect(compareRank(sg(24), lvl(2))).toBe('unknown');
    expect(compareRank(lvl(2), sg(24))).toBe('unknown');
  });

  it('returns unknown when neither side is ranked', () => {
    expect(compareRank(sg(null), sg(null))).toBe('unknown');
  });

  describe('isDownwardMove', () => {
    it('excludes a candidate ranked above the target', () => {
      expect(isDownwardMove(sg(24), sg(10))).toBe(true);
    });

    it('keeps lateral and upward moves', () => {
      expect(isDownwardMove(sg(10), sg(10))).toBe(false);
      expect(isDownwardMove(sg(10), sg(24))).toBe(false);
    });

    it('keeps a candidate whose rank cannot be established', () => {
      expect(isDownwardMove(sg(null), sg(20))).toBe(false);
      expect(isDownwardMove(sg(24), sg(null))).toBe(false);
    });
  });
});

describe('Title hierarchy and downward move detection (isDownwardTitleMove)', () => {
  it('excludes senior-for-junior moves', () => {
    expect(isDownwardTitleMove('City Engineer', 'Assistant City Engineer')).toBe(true);
    expect(isDownwardTitleMove('City Engineer', 'Engineer IV (Chief Maintenance Engr)')).toBe(true);
    expect(isDownwardTitleMove('City Engineer', 'Engineer IV (Chief Mech/Elec Engr)')).toBe(true);
    expect(isDownwardTitleMove('Assistant City Accountant', 'Accountant IV')).toBe(true);
    expect(isDownwardTitleMove('Assistant City Accountant', 'Accountant III (Division Chief)')).toBe(true);
    expect(
      isDownwardTitleMove('City Social Welfare & Dev. Officer', 'Social Welfare Officer IV (Division Chief)'),
    ).toBe(true);
  });

  it('keeps candidates genuinely below the target', () => {
    expect(isDownwardTitleMove('Engineer II', 'Engineer IV')).toBe(false);
    expect(isDownwardTitleMove('Accountant III (Division Chief)', 'Assistant City Accountant')).toBe(false);
    expect(isDownwardTitleMove('Engineer IV (Chief Maintenance Engr)', 'Assistant City Engineer')).toBe(false);
    expect(isDownwardTitleMove('Accountant III (Division Chief)', 'Accountant IV')).toBe(false);
  });

  it('compares numerals within a family, ignoring parentheticals and digits vs romans', () => {
    expect(compareTitleRank('Engineer V', 'Engineer II (Civil Engineer)')).toBe('higher');
    expect(compareTitleRank('Nurse 2', 'Nurse III')).toBe('lower');
    expect(compareTitleRank('Nurse II', 'Nurse 2')).toBe('equal');
    expect(compareTitleRank('Engineer IV (Chief Maintenance Engr)', 'Engineer IV')).toBe('higher');
  });

  it('stays unknown across families so nobody is dropped on a guess', () => {
    expect(compareTitleRank('Nurse V', 'Midwife II')).toBe('unknown');
    expect(compareTitleRank('Dentist IV', 'Medical Officer III')).toBe('unknown');
    expect(compareTitleRank('', 'Engineer I')).toBe('unknown');
    expect(isDownwardTitleMove('Nurse V', 'Midwife II')).toBe(false);
  });
});

describe('canonicalEligibilityTypeName', () => {
  it('maps RA 1080 and Bar / Board variants', () => {
    expect(canonicalEligibilityTypeName('RA 1080')).toBe('Bar / Board Eligibility (RA 1080)');
    expect(canonicalEligibilityTypeName('ra1080')).toBe('Bar / Board Eligibility (RA 1080)');
    expect(canonicalEligibilityTypeName('Board Exam (RA 1080)')).toBe('Bar / Board Eligibility (RA 1080)');
    expect(canonicalEligibilityTypeName('Bar / Board')).toBe('Bar / Board Eligibility (RA 1080)');
    expect(canonicalEligibilityTypeName('bar/board eligibility')).toBe('Bar / Board Eligibility (RA 1080)');
  });

  it('maps all legacy CSC Professional shorthands', () => {
    for (const raw of [
      'csc professional',
      'CSC   Professional',
      'Career Service Professional',
      'Civil Service Professional',
      'CS Professional',
      'CSC Subprofessional / CSC Professional',
    ]) {
      expect(canonicalEligibilityTypeName(raw)).toBe('Civil Service Eligibility (Professional)');
    }
  });

  it('maps all legacy CSC Sub-Professional shorthands', () => {
    for (const raw of [
      'CSC Sub-Professional',
      'csc subprofessional',
      'Career Service Subprofessional',
      'Career Service Sub-Professional',
      'Civil Service Sub-Professional',
      'CS Sub-Professional',
    ]) {
      expect(canonicalEligibilityTypeName(raw)).toBe('Civil Service Eligibility (Sub-Professional)');
    }
  });

  it('maps PD 907 and Latin Honors variants', () => {
    expect(canonicalEligibilityTypeName('PD 907')).toBe('Latin Honors');
    expect(canonicalEligibilityTypeName('pd907')).toBe('Latin Honors');
    expect(canonicalEligibilityTypeName('Latin Honors (Cum Laude)')).toBe('Latin Honors');
  });

  it("maps Driver MC 11 and Professional Driver's License variants", () => {
    expect(canonicalEligibilityTypeName('Driver (MC 11, s. 1996)')).toBe("Professional Driver's License");
    expect(canonicalEligibilityTypeName("Professional Driver's License")).toBe("Professional Driver's License");
    expect(canonicalEligibilityTypeName('professional drivers license')).toBe("Professional Driver's License");
  });

  it('maps PRC variants', () => {
    expect(canonicalEligibilityTypeName('PRC')).toBe('PRC Professional License');
    expect(canonicalEligibilityTypeName('PRC License')).toBe('PRC Professional License');
    expect(canonicalEligibilityTypeName('PRC Professional License')).toBe('PRC Professional License');
  });

  it('maps Barangay Eligibility variants', () => {
    expect(canonicalEligibilityTypeName('Barangay Eligibility')).toBe('Barangay Eligibility');
    expect(canonicalEligibilityTypeName('  barangay   eligibility ')).toBe('Barangay Eligibility');
  });

  it('preserves canonical casing for exact canonical names regardless of case', () => {
    expect(canonicalEligibilityTypeName('other recognized eligibility')).toBe('Other Recognized Eligibility');
  });

  it('returns trimmed input untouched when no alias matches', () => {
    expect(canonicalEligibilityTypeName('  Registered Civil Engineer  ')).toBe('Registered Civil Engineer');
    expect(canonicalEligibilityTypeName('Mechanic (MC 11, s. 1996 - Cat. II)')).toBe(
      'Mechanic (MC 11, s. 1996 - Cat. II)',
    );
  });
});

describe('resolveRecognizedEligibility', () => {
  const activeTypes = new Set([
    'civil service eligibility (professional)',
    'civil service eligibility (sub-professional)',
    'prc professional license',
    'bar / board eligibility (ra 1080)',
    'latin honors',
    'barangay eligibility',
    "professional driver's license",
    'other recognized eligibility',
  ]);

  it('resolves legacy shorthands to recognized canonical names when active', () => {
    expect(resolveRecognizedEligibility('CSC Professional', activeTypes)).toEqual({
      recognized: true,
      canonicalName: 'Civil Service Eligibility (Professional)',
    });
    expect(resolveRecognizedEligibility('RA 1080', activeTypes)).toEqual({
      recognized: true,
      canonicalName: 'Bar / Board Eligibility (RA 1080)',
    });
    expect(resolveRecognizedEligibility('PD 907', activeTypes)).toEqual({
      recognized: true,
      canonicalName: 'Latin Honors',
    });
  });

  it('marks deactivated or removed canonical types as unrecognized', () => {
    const partialCatalog = new Set(['civil service eligibility (professional)']);
    expect(resolveRecognizedEligibility('PRC License', partialCatalog)).toEqual({
      recognized: false,
      canonicalName: 'PRC Professional License',
    });
  });

  it('strictly marks non-catalog strings as unrecognized', () => {
    expect(resolveRecognizedEligibility('Registered Civil Engineer', activeTypes)).toEqual({
      recognized: false,
      canonicalName: 'Registered Civil Engineer',
    });
    expect(resolveRecognizedEligibility('Mechanic (MC 11, s. 1996 - Cat. II)', activeTypes)).toEqual({
      recognized: false,
      canonicalName: 'Mechanic (MC 11, s. 1996 - Cat. II)',
    });
    expect(resolveRecognizedEligibility('   ', activeTypes)).toEqual({
      recognized: false,
      canonicalName: '',
    });
  });

  it('recognizes a custom type if it is explicitly present in activeTypeNames', () => {
    const extended = new Set([...activeTypes, 'registered civil engineer']);
    expect(resolveRecognizedEligibility('Registered Civil Engineer', extended)).toEqual({
      recognized: true,
      canonicalName: 'Registered Civil Engineer',
    });
  });
});
