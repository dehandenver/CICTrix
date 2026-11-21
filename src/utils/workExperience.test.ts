import { describe, expect, it } from 'vitest';
import {
  computeWorkExperienceTotalMonths,
  computeWorkExperienceYearsDecimal,
  createEmptyWorkExperienceEntry,
  deriveLegacyWorkExperienceFields,
  filterMeaningfulWorkExperienceEntries,
  formatWorkExperienceTotal,
  isWorkExperienceEntryBlank,
  sanitizeWorkExperienceEntries,
  validateWorkExperienceEntries,
} from './workExperience';

describe('workExperience helpers', () => {
  it('treats freshly created entries as blank until a field or toggle is set', () => {
    const empty = createEmptyWorkExperienceEntry();
    expect(isWorkExperienceEntryBlank(empty)).toBe(true);
    expect(isWorkExperienceEntryBlank({ ...empty, position_title: 'Clerk' })).toBe(false);
    expect(isWorkExperienceEntryBlank({ ...empty, is_present: true })).toBe(false);
  });

  it('computes total months and decimal years across past and present jobs', () => {
    const now = new Date('2026-11-22T00:00:00Z');
    const entries = [
      {
        from_date: '2024-03-01',
        to_date: '',
        is_present: true,
        position_title: 'Admin Aide IV',
        company_name: 'City Hall',
        duties_responsibilities: 'Maintains files',
        is_government_service: true,
      },
      {
        from_date: '2022-04-01',
        to_date: '2024-02-28',
        is_present: false,
        position_title: 'Clerk',
        company_name: 'Private Co',
        duties_responsibilities: 'Encoded records',
        is_government_service: false,
      },
    ];

    // 2024-03 -> 2026-11 = 32 mos; 2022-04 -> 2024-02 = 22 mos; total = 54 mos = 4 yrs 6 mos
    expect(computeWorkExperienceTotalMonths(entries, now)).toBe(54);
    expect(computeWorkExperienceYearsDecimal(entries, now)).toBe(4.5);
    expect(formatWorkExperienceTotal(54)).toBe('4 yrs 6 mos');
    expect(formatWorkExperienceTotal(12)).toBe('1 yr');
    expect(formatWorkExperienceTotal(0)).toBe('0 mos');
  });

  it('normalizes entries and strips blank entries before submission', () => {
    const sanitized = sanitizeWorkExperienceEntries([
      {
        from_date: ' 2023-01-15 ',
        to_date: '2025-05-01',
        is_present: true,
        position_title: ' Analyst ',
        company_name: ' LGU ',
        duties_responsibilities: ' Audited payroll ',
        is_government_service: true,
      },
      createEmptyWorkExperienceEntry(),
    ]);

    expect(sanitized).toHaveLength(2);
    expect(sanitized[0].to_date).toBe(''); // is_present clears to_date
    expect(sanitized[0].position_title).toBe('Analyst');

    const meaningful = filterMeaningfulWorkExperienceEntries(sanitized);
    expect(meaningful).toHaveLength(1);
    expect(meaningful[0].company_name).toBe('LGU');
  });

  it('derives legacy summary fields cleanly from structured entries', () => {
    const now = new Date('2026-11-22T00:00:00Z');
    const summary = deriveLegacyWorkExperienceFields(
      [
        {
          from_date: '2025-11-01',
          to_date: '',
          is_present: true,
          position_title: 'HR Assistant',
          company_name: 'CHRMO',
          duties_responsibilities: 'Recruitment support',
          is_government_service: true,
        },
      ],
      now,
    );

    expect(summary).toEqual({
      work_experience_years: '1',
      work_experience_months: '0',
      relevant_experience_position: 'HR Assistant',
      relevant_experience_company: 'CHRMO',
      relevant_experience_duties: 'Recruitment support',
    });
  });

  it('validates partial entries, invalid dates, inverted ranges, and future dates', () => {
    const now = new Date('2026-11-22T00:00:00Z');
    const errors = validateWorkExperienceEntries(
      [
        {
          from_date: '2026-12-15',
          to_date: '2025-01-01',
          is_present: false,
          position_title: '',
          company_name: 'LGU',
          duties_responsibilities: '',
          is_government_service: false,
        },
      ],
      now,
    );

    expect(errors[0]?.from_date).toBe('Start date cannot be in the future');
    expect(errors[0]?.to_date).toBe('End date cannot be earlier than start date');
    expect(errors[0]?.position_title).toBe('Position held is required');
    expect(errors[0]?.duties_responsibilities).toBe('Description of duties is required');
  });
});
