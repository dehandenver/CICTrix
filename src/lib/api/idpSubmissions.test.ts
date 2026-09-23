import { describe, expect, it } from 'vitest';
import { cycleYearFor, emptySubmission, missingRequired, type IdpSubmission } from './idpSubmissions';

/** A submission with every required question answered. */
const complete = (over: Partial<IdpSubmission> = {}): IdpSubmission => ({
  ...emptySubmission('EMP-1', 2026),
  fullName: 'Juan Dela Cruz',
  office: 'OFFICE OF THE CITY ENGINEER',
  division: 'Construction',
  position: 'Engineer I',
  salaryGrade: '12',
  yearsInPosition: '3',
  yearsGovernmentService: '7',
  eligibility: 'CS Professional',
  educationalAttainment: 'BS Civil Engineering',
  age: '31',
  gender: 'Male',
  email: 'juan@iloilocity.gov.ph',
  skillsToDevelop: 'Structural analysis software',
  strengthsToUtilize: 'Training junior staff',
  worksOutsideJobDescription: false,
  ...over,
});

describe('missingRequired', () => {
  it('reports nothing when every required question is answered', () => {
    expect(missingRequired(complete())).toEqual([]);
  });

  it('lists each unanswered personal-data question by its form label', () => {
    const missing = missingRequired(complete({ office: '', salaryGrade: '', eligibility: '' }));
    expect(missing).toContain('Office');
    expect(missing).toContain('Salary Grade');
    expect(missing).toContain('Eligibility');
    expect(missing).toHaveLength(3);
  });

  it('treats whitespace as unanswered', () => {
    expect(missingRequired(complete({ division: '   ' }))).toContain('Division');
  });

  it('requires an answer to the outside-tasks yes/no', () => {
    // null means untouched. Defaulting it to NO would silently answer a
    // question on the employee's behalf.
    const missing = missingRequired(complete({ worksOutsideJobDescription: null }));
    expect(missing).toContain('Are you performing work tasks outside your job description?');
  });

  it('requires Part III only when the answer is YES', () => {
    const yes = complete({ worksOutsideJobDescription: true, outsideTasks: '' });
    expect(missingRequired(yes)).toContain('If yes, what are those tasks?');

    const no = complete({ worksOutsideJobDescription: false, outsideTasks: '' });
    expect(missingRequired(no)).not.toContain('If yes, what are those tasks?');
    expect(missingRequired(no)).toEqual([]);
  });

  it('accepts Part III once it is filled in', () => {
    const yes = complete({ worksOutsideJobDescription: true, outsideTasks: 'Records digitisation' });
    expect(missingRequired(yes)).toEqual([]);
  });

  it('does not require the checkbox groups or the recommendation', () => {
    // These carry no asterisk on the printed form, so an employee with no
    // training needs to declare must still be able to submit.
    const noneChosen = complete({
      careerNeeds: [],
      personalGoals: [],
      careerSpecifics: '',
      personalSpecifics: '',
      otherTopics: '',
    });
    expect(missingRequired(noneChosen)).toEqual([]);
  });

  it('flags every unanswered question on a blank form', () => {
    const blank = emptySubmission('EMP-1', 2026);
    const missing = missingRequired(blank);
    // 14 text fields plus the yes/no question.
    expect(missing).toHaveLength(15);
    expect(missing).toContain('Full Name');
    expect(missing).toContain('Are you performing work tasks outside your job description?');
  });
});

describe('cycleYearFor', () => {
  it('uses the calendar year of the given date', () => {
    expect(cycleYearFor(new Date('2026-09-23T00:00:00Z'))).toBe(2026);
    expect(cycleYearFor(new Date('2027-01-02T00:00:00Z'))).toBe(2027);
  });
});

describe('emptySubmission', () => {
  it('starts with the yes/no unanswered rather than false', () => {
    expect(emptySubmission('EMP-1', 2026).worksOutsideJobDescription).toBeNull();
  });

  it('starts with empty checkbox groups and no submitted timestamp', () => {
    const s = emptySubmission('EMP-1', 2026);
    expect(s.careerNeeds).toEqual([]);
    expect(s.personalGoals).toEqual([]);
    expect(s.submittedAt).toBeNull();
  });
});
