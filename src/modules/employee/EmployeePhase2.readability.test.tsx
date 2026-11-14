import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmployeeRatingSheet, Phase2Status } from '../../lib/api/ipcrRatings';

vi.mock('../../lib/supabase', async () => {
  const { supabaseStub } = await import('../../test/supabaseStub');
  return { supabase: supabaseStub() };
});
vi.mock('../../lib/api/ipcrRatings', () => ({
  loadEmployeeRatingSheet: vi.fn(),
  saveEmployeeRatings: vi.fn(),
}));

import { loadEmployeeRatingSheet, saveEmployeeRatings } from '../../lib/api/ipcrRatings';
import { EmployeePhase2 } from './EmployeePhase2';

const makeSheet = (phase2Status: Phase2Status = 'open'): EmployeeRatingSheet => ({
  targetSettingId: 'target-1',
  employeeId: 'employee-1',
  employeeName: 'Ana Cruz',
  period: 'July–December 2026',
  phase2Status,
  phase2OpenTargetDate: null,
  returnedAt: null,
  mfos: [
    {
      id: 'mfo-1', functionType: 'core', title: 'Process reports',
      indicators: [{
        successIndicatorId: 'si-1', description: 'Submit 20 accurate reports on time.',
        accomplishment: 'Submitted 20 accurate reports before the deadline.',
        remarks: 'Previously saved employee note.',
        quality: 4, efficiency: 3, timeliness: 5, overriddenByOffice: false,
      }],
    },
    {
      id: 'mfo-2', functionType: 'strategic', title: 'Improve reporting',
      indicators: [{
        successIndicatorId: 'si-2', description: 'Introduce one reporting improvement.',
        accomplishment: '', remarks: '',
        quality: 4, efficiency: 4, timeliness: 4, overriddenByOffice: false,
      }],
    },
    {
      id: 'mfo-3', functionType: 'support', title: 'Support office operations',
      indicators: [{
        successIndicatorId: 'si-3', description: 'Attend all office coordination meetings.',
        accomplishment: '', remarks: '',
        quality: 4, efficiency: 4, timeliness: 4, overriddenByOffice: false,
      }],
    },
  ],
});

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(loadEmployeeRatingSheet).mockResolvedValue({ ok: true, data: makeSheet() });
  vi.mocked(saveEmployeeRatings).mockResolvedValue({
    ok: true, data: { phase2Status: 'in_progress', overallScore: 4, adjectival: 'Very Satisfactory' },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('employee Phase 2 achievement editing', () => {
  it.each<Phase2Status>(['open', 'completed', 'closed'])(
    'shows six aligned columns and no remarks fields when %s', async (status) => {
      vi.mocked(loadEmployeeRatingSheet).mockResolvedValue({ ok: true, data: makeSheet(status) });
      render(<EmployeePhase2 employeeId="employee-1" phaseOpen />);

      const table = await screen.findByRole('table');
      expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
        'Success Indicator (frozen)', 'Achievement', 'Q', 'E', 'T', 'A',
      ]);
      expect(within(table).getAllByRole('textbox')).toHaveLength(3);
      expect(screen.queryByPlaceholderText('e.g. Submitted ahead of deadline')).not.toBeInTheDocument();

      for (const row of within(table).getAllByRole('row').slice(1)) {
        const columnCount = within(row).getAllByRole('cell').reduce(
          (sum, cell) => sum + (cell as HTMLTableCellElement).colSpan, 0,
        );
        expect(columnCount).toBe(6);
      }
      if (status !== 'open') {
        for (const input of within(table).getAllByRole('textbox')) expect(input).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
      }
    },
  );

  it('provides four visible lines and keeps the limit and counter while editing long text', async () => {
    render(<EmployeePhase2 employeeId="employee-1" phaseOpen />);

    const achievement = (await screen.findAllByPlaceholderText('Detail your achievement matching this target...'))[0];
    expect(achievement).toHaveAttribute('rows', '4');
    expect(achievement).toHaveAccessibleName('Achievement for Submit 20 accurate reports on time.');
    expect(achievement).toHaveAttribute('maxlength', '500');
    const longText = 'Completed the required reports with verified data.\n'.repeat(9);
    fireEvent.change(achievement, { target: { value: longText } });
    expect(achievement).toHaveValue(longText);
    expect(achievement).toHaveAttribute('rows', '4');
    expect(screen.getByText(`${longText.length}/500`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Self-Ratings' })).toBeEnabled();
  });

  it.each([false, true])('preserves hidden remarks and Q/E/T when saving with submit=%s', async (submit) => {
    render(<EmployeePhase2 employeeId="employee-1" phaseOpen />);

    const achievement = (await screen.findAllByPlaceholderText('Detail your achievement matching this target...'))[0];
    fireEvent.change(achievement, { target: { value: 'Completed 22 verified reports.' } });
    fireEvent.click(screen.getByRole('button', { name: submit ? 'Submit Self-Ratings' : 'Save Draft' }));

    await waitFor(() => expect(saveEmployeeRatings).toHaveBeenCalledWith({
      targetSettingId: 'target-1',
      employeeId: 'employee-1',
      submit,
      entries: [
        {
          successIndicatorId: 'si-1', accomplishment: 'Completed 22 verified reports.',
          remarks: 'Previously saved employee note.', quality: 4, efficiency: 3, timeliness: 5,
        },
        { successIndicatorId: 'si-2', accomplishment: '', remarks: '', quality: 4, efficiency: 4, timeliness: 4 },
        { successIndicatorId: 'si-3', accomplishment: '', remarks: '', quality: 4, efficiency: 4, timeliness: 4 },
      ],
    }));
    expect(await screen.findByText(submit ? 'Submitted. Overall rating: 4 (Very Satisfactory).' : 'Draft saved.')).toBeInTheDocument();
  });

  it('keeps fields and submission disabled when the rating window is closed', async () => {
    render(<EmployeePhase2 employeeId="employee-1" phaseOpen={false} />);
    const table = await screen.findByRole('table');
    for (const input of within(table).getAllByRole('textbox')) expect(input).toBeDisabled();
    for (const input of within(table).getAllByRole('combobox')) expect(input).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Submit Self-Ratings' })).not.toBeInTheDocument();
  });
});
