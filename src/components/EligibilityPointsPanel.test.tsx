import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EligibilityPointsPanel } from './EligibilityPointsPanel';
import * as eligibilityTypesApi from '../lib/api/eligibilityTypes';

vi.mock('../lib/api/eligibilityTypes', () => ({
  listEligibilityTypes: vi.fn(),
  upsertEligibilityType: vi.fn(),
  deleteEligibilityType: vi.fn(),
}));

const SAMPLE_TYPES: eligibilityTypesApi.EligibilityType[] = [
  {
    id: 'elig-1',
    name: 'Civil Service Eligibility (Professional)',
    points: 0,
    pointsForFullMarks: 100,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'elig-2',
    name: 'Bar / Board Eligibility (RA 1080)',
    points: 0,
    pointsForFullMarks: 100,
    isActive: false,
    sortOrder: 2,
  },
];

describe('EligibilityPointsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eligibilityTypesApi.listEligibilityTypes).mockResolvedValue({
      ok: true,
      data: SAMPLE_TYPES,
    });
  });

  it('renders V2 fixed tiers and omits V1 point inputs and full-marks cap input', async () => {
    render(<EligibilityPointsPanel />);

    expect(await screen.findByText('Civil Service Eligibility (Professional)')).toBeInTheDocument();

    expect(screen.getByText('Eligibility Points')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Manage recognized civil service and professional eligibilities and review the V2 scoring tiers',
      ),
    ).toBeInTheDocument();

    expect(screen.getByText('0 Recognized Eligibilities')).toBeInTheDocument();
    expect(screen.getByText('0.0 / 15 pts')).toBeInTheDocument();
    expect(screen.getByText('1 Recognized Eligibility')).toBeInTheDocument();
    expect(screen.getByText('7.5 / 15 pts')).toBeInTheDocument();
    expect(screen.getByText('2+ Distinct Recognized Eligibilities')).toBeInTheDocument();
    expect(screen.getByText('15.0 / 15 pts')).toBeInTheDocument();

    expect(screen.queryByLabelText(/Points for full marks/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('lists configured eligibility types and toggles recognized/active status', async () => {
    vi.mocked(eligibilityTypesApi.upsertEligibilityType).mockResolvedValue({
      ok: true,
      data: {
        ...SAMPLE_TYPES[1],
        isActive: true,
      },
    });

    render(<EligibilityPointsPanel />);

    const checkbox = await screen.findByRole('checkbox', {
      name: 'Bar / Board Eligibility (RA 1080) is recognized (active)',
    });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(eligibilityTypesApi.upsertEligibilityType).toHaveBeenCalledWith({
        id: 'elig-2',
        name: 'Bar / Board Eligibility (RA 1080)',
        points: 0,
        pointsForFullMarks: 100,
        isActive: true,
        sortOrder: 2,
      });
      expect(checkbox).toBeChecked();
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  it('adds a new eligibility type and removes an existing type', async () => {
    vi.mocked(eligibilityTypesApi.upsertEligibilityType).mockResolvedValue({
      ok: true,
      data: {
        id: 'elig-3',
        name: 'PRC Professional License',
        points: 0,
        pointsForFullMarks: 100,
        isActive: true,
        sortOrder: 3,
      },
    });
    vi.mocked(eligibilityTypesApi.deleteEligibilityType).mockResolvedValue({
      ok: true,
      data: true,
    });

    render(<EligibilityPointsPanel />);
    await screen.findByText('Civil Service Eligibility (Professional)');

    const input = screen.getByLabelText('New eligibility type name');
    fireEvent.change(input, { target: { value: 'PRC Professional License' } });
    fireEvent.click(screen.getByRole('button', { name: /Add type/i }));

    await waitFor(() => {
      expect(eligibilityTypesApi.upsertEligibilityType).toHaveBeenCalledWith({
        name: 'PRC Professional License',
        isActive: true,
        sortOrder: 3,
      });
      expect(screen.getByText('PRC Professional License')).toBeInTheDocument();
      expect(input).toHaveValue('');
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Civil Service Eligibility (Professional)' }),
    );

    await waitFor(() => {
      expect(eligibilityTypesApi.deleteEligibilityType).toHaveBeenCalledWith('elig-1');
      expect(screen.queryByText('Civil Service Eligibility (Professional)')).not.toBeInTheDocument();
    });
  });
});
