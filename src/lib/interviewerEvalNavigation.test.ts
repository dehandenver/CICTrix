import { describe, expect, it } from 'vitest';
import { getApplicantType } from './interviewerEvalNavigation';

describe('getApplicantType', () => {
  it('trusts application_type over an employee link', () => {
    // Hiring writes employee_id onto an external applicant; they stay Original.
    expect(getApplicantType({ application_type: 'job', employee_id: 'EMP-2026-001' })).toBe('Original');
  });

  it('reads promotion and promotional as Promotional', () => {
    expect(getApplicantType({ application_type: 'promotion' })).toBe('Promotional');
    expect(getApplicantType({ application_type: ' Promotional ' })).toBe('Promotional');
  });

  it('falls back to the employee link only when the type is empty', () => {
    expect(getApplicantType({ application_type: '', employee_id: 'EMP-2026-001' })).toBe('Promotional');
    expect(getApplicantType({ employee_id: null })).toBe('Original');
  });
});
