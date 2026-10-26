import { beforeEach, describe, expect, it } from 'vitest';
import { DRAFTS_KEY, draftHasData, emptyDrafts, loadDrafts, saveDrafts } from './applicationDrafts';
import { emptyWorkExperience } from '../../../lib/workExperience';
import type { ApplicantFormData } from '../../../types/applicant.types';

const entry = (position: string) => ({ years: '1', months: '0', position, company: 'City Hall', duties: 'Records' });

describe('application drafts and work experiences', () => {
  beforeEach(() => sessionStorage.clear());

  it('converts a draft saved with the old flat fields into a one-item list', () => {
    sessionStorage.setItem(DRAFTS_KEY, JSON.stringify({
      ...emptyDrafts(),
      drafts: {
        'slot-1': {
          first_name: 'Ana',
          work_experience_years: '3',
          work_experience_months: '4',
          relevant_experience_position: 'Clerk',
          relevant_experience_company: 'City Hall',
          relevant_experience_duties: 'Records',
        },
      },
    }));
    const draft = loadDrafts().drafts['slot-1'] as unknown as Record<string, unknown>;
    expect(draft.work_experiences).toEqual([{ years: '3', months: '4', position: 'Clerk', company: 'City Hall', duties: 'Records' }]);
    expect(draft).not.toHaveProperty('work_experience_years');
    expect(draft).not.toHaveProperty('relevant_experience_position');
    expect(draft.first_name).toBe('Ana');
  });

  it('saves and reloads several entries per plantilla without mixing plantillas', () => {
    const state = emptyDrafts();
    state.drafts = {
      'slot-1': { work_experiences: [entry('Clerk'), entry('Aide')] } as never,
      'slot-2': { work_experiences: [entry('Engineer')] } as never,
    };
    saveDrafts(state);
    const reloaded = loadDrafts().drafts;
    expect(reloaded['slot-1'].work_experiences.map((e) => e.position)).toEqual(['Clerk', 'Aide']);
    expect(reloaded['slot-2'].work_experiences.map((e) => e.position)).toEqual(['Engineer']);
  });

  it('counts a draft as started once any entry has data', () => {
    const blank = { work_experiences: [emptyWorkExperience()] } as unknown as ApplicantFormData;
    expect(draftHasData(blank)).toBe(false);
    expect(draftHasData({ ...blank, work_experiences: [emptyWorkExperience(), { ...emptyWorkExperience(), company: 'X' }] })).toBe(true);
  });
});
