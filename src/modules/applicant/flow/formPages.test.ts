import { describe, expect, it } from 'vitest';
import { FORM_PAGE_COUNT, clampFormPage, firstPageWithErrors, pageErrors } from './formPages';

describe('formPages', () => {
  it('scopes errors to the page that shows the field', () => {
    const errors = { first_name: 'First name is required', email: 'Email is required' };
    expect(pageErrors(1, errors, '').count).toBe(1);
    expect(pageErrors(1, errors, '').errors).toEqual({ first_name: 'First name is required' });
    expect(pageErrors(2, errors, '').errors).toEqual({ email: 'Email is required' });
    expect(pageErrors(3, errors, '').count).toBe(0);
  });

  it('puts the file error on the documents page only', () => {
    expect(pageErrors(4, {}, 'Missing required documents').count).toBe(0);
    expect(pageErrors(FORM_PAGE_COUNT, {}, 'Missing required documents').fileError).toBe('Missing required documents');
  });

  it('finds the first page with an error', () => {
    expect(firstPageWithErrors({ gov_id_type: 'required', relevant_experience_company: 'required' }, '')).toBe(3);
    expect(firstPageWithErrors({}, 'Missing required documents')).toBe(FORM_PAGE_COUNT);
    expect(firstPageWithErrors({}, '')).toBeNull();
  });

  it('clamps stored page numbers', () => {
    expect(clampFormPage(undefined)).toBe(1);
    expect(clampFormPage(0)).toBe(1);
    expect(clampFormPage(99)).toBe(FORM_PAGE_COUNT);
    expect(clampFormPage(3)).toBe(3);
  });

  it('routes education_school to Page 3 and work_experience_entries to Page 4', () => {
    const errors = {
      education_school: 'School or institution is required',
      work_experience_entries: 'Please complete or fix the highlighted work experience entries',
    };

    expect(pageErrors(3, errors, '').errors).toEqual({
      education_school: 'School or institution is required',
    });
    expect(pageErrors(4, errors, '').errors).toEqual({
      work_experience_entries: 'Please complete or fix the highlighted work experience entries',
    });
    expect(firstPageWithErrors({ education_school: 'required' }, '')).toBe(3);
    expect(firstPageWithErrors({ work_experience_entries: 'required' }, '')).toBe(4);
  });
});
