import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicantAssessmentForm } from './ApplicantAssessmentForm';
import { MAX_WORK_EXPERIENCES, emptyWorkExperience, validateWorkExperiences } from '../../lib/workExperience';
import type { ApplicantFormData, ValidationErrors } from '../../types/applicant.types';

vi.mock('../../hooks/useDepartmentOptions', () => ({ useDepartmentOptions: () => [] }));
vi.mock('../../lib/recruitmentData', () => ({
  ensureRecruitmentSeedData: () => {},
  getAuthoritativeJobPostings: () => [],
  loadJobPostings: async () => [],
}));

const Harness = ({ withErrors = false }: { withErrors?: boolean }) => {
  const [data, setData] = useState({ work_experiences: [emptyWorkExperience()] } as unknown as ApplicantFormData);
  const errors: ValidationErrors = withErrors ? { work_experiences: validateWorkExperiences(data.work_experiences) } : {};
  return (
    <div className="abyan-ds af">
      <ApplicantAssessmentForm
        formData={data}
        errors={errors}
        page={4}
        onChange={(field, value) => setData((d) => ({ ...d, [field]: value }))}
      />
    </div>
  );
};

const entries = () => screen.getAllByRole('group', { name: /^Work experience \d+$/ });

describe('Relevant work experience list', () => {
  it('starts with one entry, keeps the HR notice, and hides Remove', () => {
    render(<Harness />);
    expect(screen.getByText(/HR policy notice:/)).toBeInTheDocument();
    expect(screen.getByText(/Count each period once/)).toBeInTheDocument();
    expect(entries()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Remove work experience/ })).not.toBeInTheDocument();
  });

  it('adds numbered entries with their own fields, and removes one', () => {
    render(<Harness />);
    fireEvent.change(within(entries()[0]).getByLabelText('Position Held'), { target: { value: 'Clerk' } });
    fireEvent.click(screen.getByRole('button', { name: /Add another work experience/ }));
    expect(entries()).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Work experience 2' })).toHaveFocus();

    fireEvent.change(within(entries()[1]).getByLabelText('Position Held'), { target: { value: 'Aide' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove work experience 1' }));
    expect(entries()).toHaveLength(1);
    expect(within(entries()[0]).getByLabelText('Position Held')).toHaveValue('Aide');
    expect(screen.getByRole('heading', { name: 'Work experience 1' })).toBeInTheDocument();
  });

  it(`stops at ${MAX_WORK_EXPERIENCES} entries`, () => {
    render(<Harness />);
    const add = screen.getByRole('button', { name: /Add another work experience/ });
    for (let i = 1; i < MAX_WORK_EXPERIENCES; i += 1) fireEvent.click(add);
    expect(entries()).toHaveLength(MAX_WORK_EXPERIENCES);
    expect(add).toBeDisabled();
    expect(screen.getByText(`You've added the maximum of ${MAX_WORK_EXPERIENCES}.`)).toBeInTheDocument();
  });

  it('shows each entry its own inline errors', () => {
    render(<Harness withErrors />);
    fireEvent.click(screen.getByRole('button', { name: /Add another work experience/ }));
    const second = entries()[1];
    expect(within(second).getByText('Position held is required')).toBeInTheDocument();
    expect(within(second).getByText('Description of duties is required')).toBeInTheDocument();
    fireEvent.change(within(second).getByLabelText('Additional Months'), { target: { value: '12' } });
    expect(within(second).getByText('Enter months from 0 to 11')).toBeInTheDocument();
  });
});
