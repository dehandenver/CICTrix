import { describe, expect, it } from 'vitest';
import { buildCandidateRows } from './interviewerDashboardModel';

const applicant = (overrides: Record<string, unknown>) => ({
  id: 'a1', first_name: 'Paula', last_name: 'Promoted', position: 'City Accountant II',
  office: 'Office of The City Accountant', interview_date: '2026-11-02', ...overrides,
});

describe('buildCandidateRows applicant type', () => {
  it('carries the current position of a promotional applicant', () => {
    const [row] = buildCandidateRows(
      [applicant({ application_type: 'promotion', employee_id: 'EMP-2024-001', current_position: 'City Accountant I' })],
      [], new Map(), '',
    );
    expect(row.appType).toBe('Promotional');
    expect(row.currentPosition).toBe('City Accountant I');
  });

  it('keeps a hired external applicant Original with no current position', () => {
    const [row] = buildCandidateRows(
      [applicant({ application_type: 'job', employee_id: 'EMP-2026-001', current_position: null })],
      [], new Map(), '',
    );
    expect(row.appType).toBe('Original');
    expect(row.currentPosition).toBe('');
  });
});
