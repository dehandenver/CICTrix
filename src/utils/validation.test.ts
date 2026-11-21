import { describe, expect, it } from 'vitest';
import type { ApplicantFormData } from '../types/applicant.types';
import { validateApplicantForm } from './validation';
import { createEmptyWorkExperienceEntry } from './workExperience';

function makeValidFormData(overrides: Partial<ApplicantFormData> = {}): ApplicantFormData {
  return {
    first_name: 'Maria',
    middle_name: 'Clara',
    last_name: 'Santos',
    gender: 'Female',
    address: '123 Rizal St, Iloilo City',
    contact_number: '09171234567',
    email: 'maria.santos@lgu.gov.ph',
    position: 'Administrative Officer IV',
    item_number: 'ABYAN-2026-001',
    office: 'City Human Resource Management Office',
    is_pwd: false,
    application_type: 'job',
    employee_id: '',
    current_position: '',
    current_department: '',
    current_division: '',
    employee_username: '',
    education_attainment: '',
    education_degree: '',
    education_school: '',
    work_experience_years: '',
    work_experience_months: '',
    relevant_experience_position: '',
    relevant_experience_company: '',
    relevant_experience_duties: '',
    work_experience_entries: [],
    gov_id_type: 'UMID',
    gov_id_expiration: '',
    ...overrides,
  };
}

describe('validateApplicantForm', () => {
  describe('education_school', () => {
    it('requires education_school when education_attainment is selected', () => {
      const errors = validateApplicantForm(
        makeValidFormData({
          education_attainment: 'College Graduate',
          education_school: '   ',
        }),
      );
      expect(errors.education_school).toBe('School or institution is required');
    });

    it('passes when both education_attainment and education_school are filled', () => {
      const errors = validateApplicantForm(
        makeValidFormData({
          education_attainment: 'College Graduate',
          education_school: 'West Visayas State University',
        }),
      );
      expect(errors.education_school).toBeUndefined();
    });

    it('does not require education_school when education_attainment is blank', () => {
      const errors = validateApplicantForm(
        makeValidFormData({
          education_attainment: '',
          education_school: '',
        }),
      );
      expect(errors.education_school).toBeUndefined();
    });
  });

  describe('work_experience_entries', () => {
    it('passes when work_experience_entries has only blank entries', () => {
      const errors = validateApplicantForm(
        makeValidFormData({
          work_experience_entries: [createEmptyWorkExperienceEntry()],
        }),
      );
      expect(errors.work_experience_entries).toBeUndefined();
      expect(errors.work_experience_years).toBeUndefined();
    });

    it('passes when work_experience_entries has valid entries even without legacy scalar fields', () => {
      const errors = validateApplicantForm(
        makeValidFormData({
          work_experience_entries: [
            {
              from_date: '2022-01-01',
              to_date: '2024-06-30',
              is_present: false,
              position_title: 'Administrative Aide IV',
              company_name: 'City Hall',
              duties_responsibilities: 'Maintained personnel 201 files',
              is_government_service: true,
            },
          ],
        }),
      );
      expect(errors.work_experience_entries).toBeUndefined();
      expect(errors.work_experience_years).toBeUndefined();
      expect(errors.relevant_experience_position).toBeUndefined();
    });

    it('sets work_experience_entries error when any non-blank entry is incomplete or invalid', () => {
      const errors = validateApplicantForm(
        makeValidFormData({
          work_experience_entries: [
            {
              from_date: '2023-05-01',
              to_date: '',
              is_present: false,
              position_title: 'Clerk',
              company_name: '',
              duties_responsibilities: '',
              is_government_service: false,
            },
          ],
        }),
      );
      expect(errors.work_experience_entries).toBe(
        'Please complete or fix the highlighted work experience entries',
      );
      expect(errors.work_experience_years).toBeUndefined();
    });

    it('falls back to legacy scalar validation when work_experience_entries is empty or undefined', () => {
      const errorsWithUndefined = validateApplicantForm(
        makeValidFormData({
          work_experience_entries: undefined,
          relevant_experience_position: 'Clerk',
        }),
      );
      expect(errorsWithUndefined.work_experience_entries).toBeUndefined();
      expect(errorsWithUndefined.work_experience_years).toBe('Years/months of experience is required');
      expect(errorsWithUndefined.relevant_experience_company).toBe('Company/organization is required');
      expect(errorsWithUndefined.relevant_experience_duties).toBe('Description of duties is required');

      const errorsWithEmptyArray = validateApplicantForm(
        makeValidFormData({
          work_experience_entries: [],
          work_experience_years: '2',
        }),
      );
      expect(errorsWithEmptyArray.relevant_experience_position).toBe('Position held is required');
      expect(errorsWithEmptyArray.relevant_experience_company).toBe('Company/organization is required');
      expect(errorsWithEmptyArray.relevant_experience_duties).toBe('Description of duties is required');
    });
  });
});
