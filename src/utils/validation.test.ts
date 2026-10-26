import { describe, expect, it } from 'vitest';
import { validateApplicantForm } from './validation';
import { emptyWorkExperience } from '../lib/workExperience';
import { firstPageWithErrors, pageErrors } from '../modules/applicant/flow/formPages';
import type { ApplicantFormData } from '../types/applicant.types';

const base: ApplicantFormData = {
  first_name: 'Ana', middle_name: '', last_name: 'Cruz', gender: 'Female', address: 'Iloilo City',
  contact_number: '09171234567', email: 'ana@example.com', position: 'Clerk', item_number: '', office: 'Accounting',
  is_pwd: false, application_type: 'promotion', employee_id: 'E-1', current_position: 'Aide', current_department: 'Accounting',
  current_division: '', employee_username: '', education_attainment: '', education_degree: '', education_school: '',
  work_experiences: [emptyWorkExperience()], gov_id_type: '', gov_id_expiration: '',
};

describe('validateApplicantForm · work experiences', () => {
  it('accepts no experience (one blank entry)', () => {
    expect(validateApplicantForm(base).work_experiences).toBeUndefined();
  });

  it('reports errors per entry, on the work experience page', () => {
    const data = {
      ...base,
      work_experiences: [
        { years: '2', months: '0', position: 'Clerk', company: 'City Hall', duties: 'Records' },
        { years: '1', months: '13', position: '', company: 'DPWH', duties: 'Design' },
      ],
    };
    const errors = validateApplicantForm(data);
    expect(errors.work_experiences).toEqual([{}, { months: 'Enter months from 0 to 11', position: 'Position held is required' }]);
    expect(firstPageWithErrors(errors, '')).toBe(4);
    expect(pageErrors(4, errors, '').count).toBe(1);
  });
});
