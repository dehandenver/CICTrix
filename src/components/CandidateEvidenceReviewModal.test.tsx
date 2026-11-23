import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CandidateEvidenceReviewModal } from './CandidateEvidenceReviewModal';
import { supabase } from '../lib/supabase';
import * as successionReviews from '../lib/api/successionReviews';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('CandidateEvidenceReviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCandidate = { employeeId: 'emp-101', name: 'Juan Dela Cruz' };
  const mockPosition = {
    id: 'pos-202',
    title: 'Senior IT Officer',
    requirements: {
      experienceYears: 3,
      trainingHours: 40,
      education: { minimum: 'bachelor' as const, field: 'IT' },
      eligibility: { kind: 'required' as const, key: 'CSC Professional' },
    },
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CandidateEvidenceReviewModal
        isOpen={false}
        onClose={vi.fn()}
        candidate={mockCandidate}
        criticalPosition={mockPosition}
        onReviewSaved={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('loads and displays evidence items and allows saving reviews', async () => {
    const workSelectSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'work-1',
            position_title: 'Junior Programmer',
            company_name: 'City Hall',
            from_date: '2021-01-01',
            to_date: '2024-01-01',
            is_present: false,
          },
        ],
        error: null,
      }),
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'employee_work_experience') {
        return { select: workSelectSpy };
      }
      if (table === 'employee_training') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 't-1',
                  training_title: 'Fullstack Development',
                  number_of_hours: 40,
                  from_date: '2023-05-01',
                  to_date: '2023-05-05',
                  conducted_by: 'DICT',
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'employee_education') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'ed-1',
                  level: 'College',
                  course: 'BS Computer Science',
                  year_graduated: 2020,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'employee_eligibility') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'el-1',
                  eligibility_type: 'CSC Professional',
                  validity_date: null,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);
    const batchSaveSpy = vi.spyOn(successionReviews, 'batchSaveSuccessionReviews').mockResolvedValue([]);
    const onSavedMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <CandidateEvidenceReviewModal
        isOpen={true}
        onClose={onCloseMock}
        candidate={mockCandidate}
        criticalPosition={mockPosition}
        onReviewSaved={onSavedMock}
      />,
    );

    expect(screen.getByText('Loading evidence records...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Junior Programmer')).toBeInTheDocument();
      expect(screen.getByText('Fullstack Development')).toBeInTheDocument();
      expect(screen.getByText('BS Computer Science')).toBeInTheDocument();
      expect(screen.getAllByText('CSC Professional').length).toBeGreaterThanOrEqual(1);
    });

    const workCols = workSelectSpy.mock.calls[0]?.[0] as string;
    expect(workCols).toContain('company_name');
    expect(workCols).not.toContain('department_agency_office_company');

    // Toggle checkboxes
    const relevantCheckboxes = screen.getAllByRole('checkbox');
    expect(relevantCheckboxes.length).toBeGreaterThan(0);
    fireEvent.click(relevantCheckboxes[0]);

    // Click Save Review
    const saveButton = screen.getByRole('button', { name: 'Save Review' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(batchSaveSpy).toHaveBeenCalled();
      expect(onSavedMock).toHaveBeenCalled();
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  it.each([
    'employee_work_experience',
    'employee_training',
    'employee_education',
    'employee_eligibility',
  ])('surfaces an error instead of empty evidence lists when %s read fails', async (failingTable) => {
    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(
          table === failingTable
            ? { data: null, error: { message: `Failed reading ${failingTable}` } }
            : { data: [], error: null },
        ),
      }),
    }));

    vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);

    render(
      <CandidateEvidenceReviewModal
        isOpen={true}
        onClose={vi.fn()}
        candidate={mockCandidate}
        criticalPosition={mockPosition}
        onReviewSaved={vi.fn()}
      />,
    );

    expect(await screen.findByText(new RegExp(`Failed reading ${failingTable}`))).toBeInTheDocument();
    expect(screen.queryByText('No work experience on file for this candidate.')).not.toBeInTheDocument();
    expect(screen.queryByText('No training records on file for this candidate.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Review' })).toBeDisabled();
  });

  it('starts reviewed count at 0 / N for unreviewed records and preserves user selections on save error', async () => {
    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(
          table === 'employee_work_experience'
            ? {
                data: [
                  {
                    id: 'work-1',
                    position_title: 'Junior Programmer',
                    company_name: 'City Hall',
                    from_date: '2021-01-01',
                    to_date: '2024-01-01',
                    is_present: false,
                  },
                ],
                error: null,
              }
            : table === 'employee_eligibility'
              ? {
                  data: [
                    {
                      id: 'el-1',
                      eligibility_type: 'CSC Professional',
                      validity_date: null,
                    },
                  ],
                  error: null,
                }
              : { data: [], error: null },
        ),
      }),
    }));

    vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);
    vi.spyOn(successionReviews, 'batchSaveSuccessionReviews').mockRejectedValue(
      new Error('Database write failed'),
    );

    render(
      <CandidateEvidenceReviewModal
        isOpen={true}
        onClose={vi.fn()}
        candidate={mockCandidate}
        criticalPosition={mockPosition}
        onReviewSaved={vi.fn()}
      />,
    );

    expect(await screen.findByText('Junior Programmer')).toBeInTheDocument();
    // Neither record has been reviewed yet — must NOT show 2 / 2.
    expect(screen.getByText('Reviewed: 0 / 2 items')).toBeInTheDocument();

    // Check both checkboxes on the work item (Relevant + City Hall) -> 1 / 2 reviewed
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    expect(screen.getByText('Reviewed: 1 / 2 items')).toBeInTheDocument();

    // Trigger a save failure -> inline error appears, evidence list & checkboxes remain intact
    fireEvent.click(screen.getByRole('button', { name: 'Save Review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Database write failed');
    expect(screen.getByText('Junior Programmer')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
    expect(screen.getAllByRole('checkbox')[1]).toBeChecked();
  });
});
