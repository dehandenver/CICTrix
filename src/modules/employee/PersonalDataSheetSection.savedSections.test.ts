import { describe, expect, it } from 'vitest';
import type { Employee } from '../../types/employee.types';
import { getInitiallySavedSections } from './PersonalDataSheetSection';

const emptyProfile = {} as Employee;

describe('getInitiallySavedSections', () => {
  it('marks nothing for an empty profile and no loaded lists', () => {
    expect(getInitiallySavedSections(emptyProfile, {}).size).toBe(0);
  });

  it('treats an omitted list (failed or pending fetch) as not saved', () => {
    const saved = getInitiallySavedSections(emptyProfile, { eligibility: undefined, workExperience: undefined });
    expect(saved.has('eligibility')).toBe(false);
    expect(saved.has('workExperience')).toBe(false);
  });

  it('treats a loaded empty list as not saved', () => {
    const saved = getInitiallySavedSections(emptyProfile, { voluntaryWork: [], ldInterventions: [] });
    expect(saved.has('voluntaryWork')).toBe(false);
    expect(saved.has('training')).toBe(false);
  });

  it('marks list sections with at least one loaded row', () => {
    const saved = getInitiallySavedSections(emptyProfile, {
      eligibility: [{ eligibilityName: 'CSC Professional' }],
      workExperience: [{ positionTitle: 'Clerk' }],
      voluntaryWork: [{ orgNameAddress: 'Red Cross' }],
      ldInterventions: [{ title: 'Records Management' }],
    });
    expect([...saved].sort()).toEqual(['eligibility', 'training', 'voluntaryWork', 'workExperience']);
  });

  it('only counts education rows that name a school', () => {
    const blank = getInitiallySavedSections(emptyProfile, { education: [{ level: 'elementary', school: '  ' } as never] });
    const filled = getInitiallySavedSections(emptyProfile, { education: [{ level: 'elementary', school: 'Iloilo Central' } as never] });
    expect(blank.has('education')).toBe(false);
    expect(filled.has('education')).toBe(true);
  });

  it('does not mark personal from the HR-entered name alone', () => {
    expect(getInitiallySavedSections({ surname: 'Cruz', firstName: 'Juan' } as Employee, {}).has('personal')).toBe(false);
    expect(getInitiallySavedSections({ surname: 'Cruz', firstName: 'Juan', placeOfBirth: 'Iloilo City' } as Employee, {}).has('personal')).toBe(true);
  });

  it('marks background once a yes/no question is answered, even with "No"', () => {
    expect(getInitiallySavedSections({ relatedThirdDegree: null } as Employee, {}).has('background')).toBe(false);
    expect(getInitiallySavedSections({ relatedThirdDegree: false } as Employee, {}).has('background')).toBe(true);
  });

  it('marks family from parent names or children', () => {
    expect(getInitiallySavedSections({ motherSurname: 'Santos' } as Employee, {}).has('family')).toBe(true);
    expect(getInitiallySavedSections(emptyProfile, { children: [{ fullName: 'Ana', dateOfBirth: '' }] }).has('family')).toBe(true);
  });
});
