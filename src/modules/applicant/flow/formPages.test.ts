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
    expect(firstPageWithErrors({ gov_id_type: 'required', work_experiences: [{ company: 'required' }] }, '')).toBe(3);
    expect(firstPageWithErrors({}, 'Missing required documents')).toBe(FORM_PAGE_COUNT);
    expect(firstPageWithErrors({}, '')).toBeNull();
  });

  it('clamps stored page numbers', () => {
    expect(clampFormPage(undefined)).toBe(1);
    expect(clampFormPage(0)).toBe(1);
    expect(clampFormPage(99)).toBe(FORM_PAGE_COUNT);
    expect(clampFormPage(3)).toBe(3);
  });
});
