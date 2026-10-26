import { describe, expect, it } from 'vitest';
import {
  MAX_WORK_EXPERIENCES,
  emptyWorkExperience,
  formatDuration,
  keepShownErrors,
  parseStoredWorkExperiences,
  toStoredWorkExperiences,
  totalExperienceYears,
  validateWorkExperiences,
  workExperiencesOf,
  type WorkExperienceEntry,
} from './workExperience';

const entry = (over: Partial<WorkExperienceEntry> = {}): WorkExperienceEntry => ({
  years: '2', months: '6', position: 'Clerk', company: 'City Hall', duties: 'Records', ...over,
});

describe('validateWorkExperiences', () => {
  it('accepts one blank entry (no relevant experience) and complete entries', () => {
    expect(validateWorkExperiences([emptyWorkExperience()])).toBeUndefined();
    expect(validateWorkExperiences([entry(), entry({ years: '0', months: '8' })])).toBeUndefined();
  });

  it('requires every field of an entry that has data, per entry', () => {
    const errors = validateWorkExperiences([entry(), entry({ company: ' ', duties: '' })]);
    expect(errors).toEqual([{}, { company: 'Company/organization is required', duties: 'Description of duties is required' }]);
  });

  it('flags a blank entry once there is more than one', () => {
    const errors = validateWorkExperiences([entry(), emptyWorkExperience()]);
    expect(errors?.[1]).toMatchObject({ years: expect.any(String), position: expect.any(String) });
  });

  it('limits months to 0–11 and years to whole non-negative numbers', () => {
    expect(validateWorkExperiences([entry({ months: '12' })])?.[0].months).toBe('Enter months from 0 to 11');
    expect(validateWorkExperiences([entry({ months: '-1' })])?.[0].months).toBeDefined();
    expect(validateWorkExperiences([entry({ years: '-2' })])?.[0].years).toBe('Enter whole years from 0 to 60');
    expect(validateWorkExperiences([entry({ years: '1.5' })])?.[0].years).toBeDefined();
    expect(validateWorkExperiences([entry({ years: '61' })])?.[0].years).toBeDefined();
    expect(validateWorkExperiences([entry({ months: '11' })])).toBeUndefined();
  });

  it('needs some time served', () => {
    expect(validateWorkExperiences([entry({ years: '0', months: '0' })])?.[0].years).toBe('Enter how long you held this position');
    expect(validateWorkExperiences([entry({ years: '', months: '' })])?.[0].years).toBeDefined();
  });
});

describe('keepShownErrors', () => {
  it('clears fixed errors without surfacing new ones', () => {
    const shown = [{ company: 'required', duties: 'required' }];
    const current = [{ duties: 'required', position: 'required' }];
    expect(keepShownErrors(shown, current)).toEqual([{ duties: 'required' }]);
    expect(keepShownErrors(shown, undefined)).toBeUndefined();
    expect(keepShownErrors(undefined, current)).toBeUndefined();
    expect(keepShownErrors([{ company: 'x' }], [{ position: 'y' }])).toBeUndefined();
  });
});

describe('totalExperienceYears', () => {
  it('sums every entry', () => {
    expect(totalExperienceYears([entry({ years: '2', months: '6' }), entry({ years: '1', months: '9' })])).toBe(4.25);
    expect(totalExperienceYears([emptyWorkExperience()])).toBe(0);
    expect(totalExperienceYears([entry({ years: '0', months: '4' })])).toBe(0.33);
  });
});

describe('stored shape', () => {
  it('drops blank entries and parses numbers for storage', () => {
    expect(toStoredWorkExperiences([entry({ position: ' Clerk ' }), emptyWorkExperience()])).toEqual([
      { years: 2, months: 6, position: 'Clerk', company: 'City Hall', duties: 'Records' },
    ]);
  });

  it('reads stored rows back, including backfilled ones with null text', () => {
    expect(parseStoredWorkExperiences([{ years: 3, months: 0, position: null, company: null, duties: null }, null, 'x']))
      .toEqual([{ years: 3, months: 0, position: null, company: null, duties: null }]);
    expect(parseStoredWorkExperiences(null)).toEqual([]);
  });

  it('formats a duration', () => {
    expect(formatDuration(3, 6)).toBe('3 yrs 6 mos');
    expect(formatDuration(1, 0)).toBe('1 yr');
    expect(formatDuration(0, 1)).toBe('1 mo');
    expect(formatDuration(0, 0)).toBe('0 mos');
  });
});

describe('workExperiencesOf (draft migration)', () => {
  it('converts an old flat draft into a one-item list', () => {
    expect(workExperiencesOf({
      work_experience_years: '4', work_experience_months: '2',
      relevant_experience_position: 'Engineer I', relevant_experience_company: 'DPWH', relevant_experience_duties: 'Design',
    })).toEqual([{ years: '4', months: '2', position: 'Engineer I', company: 'DPWH', duties: 'Design' }]);
    expect(workExperiencesOf({})).toEqual([emptyWorkExperience()]);
  });

  it('keeps a saved list, fills missing fields, and caps it', () => {
    expect(workExperiencesOf({ work_experiences: [{ position: 'A' }] })).toEqual([{ ...emptyWorkExperience(), position: 'A' }]);
    const many = Array.from({ length: MAX_WORK_EXPERIENCES + 3 }, () => entry());
    expect(workExperiencesOf({ work_experiences: many })).toHaveLength(MAX_WORK_EXPERIENCES);
  });
});
