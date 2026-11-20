import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SuccessionPlanningPage } from './SuccessionPlanningPage';
import * as successionApi from '../lib/api/succession';
import * as pipelineV2 from '../lib/api/successionPipelineV2';

vi.mock('../lib/api/succession', () => ({
  listDepartmentSummaries: vi.fn(),
  listCriticalPositions: vi.fn(),
  listAutoSuccessorsForPositions: vi.fn(),
  RANKING_WEIGHTS: {
    education: 15,
    ipcr: 30,
    training: 20,
    experience: 20,
    eligibility: 15,
  },
}));

vi.mock('../lib/api/successionPipelineV2', () => ({
  fetchSuccessionPoolV2: vi.fn(),
}));

describe('SuccessionPlanningPage V2 Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows toggling between Legacy Model and Reviewed Scoring V2', async () => {
    vi.spyOn(successionApi, 'listDepartmentSummaries').mockResolvedValue({
      ok: true,
      data: [
        {
          departmentId: 'd-1',
          departmentName: 'City Planning',
          code: 'CPDO',
          criticalPositionCount: 1,
          vacantCriticalCount: 0,
          isActive: true,
        },
      ],
    });

    vi.spyOn(successionApi, 'listCriticalPositions').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'pos-101',
          departmentId: 'd-1',
          title: 'Planning Officer IV',
          incumbentName: 'Incumbent A',
          incumbentLeavingDate: null,
        } as any,
      ],
    });

    vi.spyOn(successionApi, 'listAutoSuccessorsForPositions').mockResolvedValue(
      new Map([
        [
          'pos-101',
          {
            ok: true,
            data: {
              qualified: [],
              notQualified: [],
              downwardMovesExcluded: 0,
            },
          },
        ],
      ]),
    );

    const mockV2Pool: pipelineV2.SuccessionPoolV2 = {
      positionId: 'pos-101',
      scoringDate: '2026-10-28',
      requirements: {
        experienceYears: 3,
        trainingHours: 40,
        education: { minimum: 'bachelor', field: 'Urban Planning' },
        eligibility: { kind: 'required', key: 'CSC Professional' },
      },
      ranked: [
        {
          status: 'scored',
          modelVersion: 'v2',
          positionId: 'pos-101',
          scoringDate: '2026-10-28',
          candidate: { employeeId: 'emp-1', name: 'Maria Gomez' },
          contributions: {
            performance: 25.0,
            experience: 15.0,
            training: 18.0,
            education: 9.0,
            eligibility: 15.0,
          },
          total: 82.0,
          readiness: 'Ready Now',
          rank: 1,
          reasonCodes: [],
          audit: {} as any,
        },
      ],
      needsReview: [
        {
          status: 'needs-review',
          modelVersion: 'v2',
          positionId: 'pos-101',
          scoringDate: '2026-10-28',
          candidate: { employeeId: 'emp-2', name: 'Pedro Santos' },
          reasonCodes: ['WORK_REVIEW_INCOMPLETE'],
          audit: {} as any,
        },
      ],
      configurationNeeded: [],
      excluded: [],
    };

    const fetchV2Spy = vi.spyOn(pipelineV2, 'fetchSuccessionPoolV2').mockResolvedValue(mockV2Pool);

    render(
      <MemoryRouter>
        <SuccessionPlanningPage />
      </MemoryRouter>,
    );

    // Expand department
    const deptButton = await screen.findByText('City Planning');
    fireEvent.click(deptButton);

    await screen.findByText('Planning Officer IV');

    // Default view has Legacy Model button active
    const legacyBtn = screen.getByRole('button', { name: 'Legacy Model (V1)' });
    const v2Btn = screen.getByRole('button', { name: 'Reviewed Scoring (V2)' });
    expect(legacyBtn).toBeInTheDocument();
    expect(v2Btn).toBeInTheDocument();

    // Click Reviewed Scoring (V2)
    fireEvent.click(v2Btn);

    await waitFor(() => {
      expect(fetchV2Spy).toHaveBeenCalledWith('pos-101');
      expect(screen.getByText('Maria Gomez')).toBeInTheDocument();
      expect(screen.getByText('82.0')).toBeInTheDocument();
      expect(screen.getByText('Ready Now')).toBeInTheDocument();
      expect(screen.getByText('Needs Evidence Review (1 candidates)')).toBeInTheDocument();
      expect(screen.getByText('Pedro Santos')).toBeInTheDocument();
    });
  });

  it('renders error and Retry action when fetchSuccessionPoolV2 rejects, and clicking Retry reloads the pool', async () => {
    vi.spyOn(successionApi, 'listDepartmentSummaries').mockResolvedValue({
      ok: true,
      data: [
        {
          departmentId: 'd-1',
          departmentName: 'City Planning',
          code: 'CPDO',
          criticalPositionCount: 1,
          vacantCriticalCount: 0,
          isActive: true,
        },
      ],
    });

    vi.spyOn(successionApi, 'listCriticalPositions').mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'pos-101',
          departmentId: 'd-1',
          title: 'Planning Officer IV',
          incumbentName: 'Incumbent A',
          incumbentLeavingDate: null,
        } as any,
      ],
    });

    vi.spyOn(successionApi, 'listAutoSuccessorsForPositions').mockResolvedValue(
      new Map([
        [
          'pos-101',
          {
            ok: true,
            data: { qualified: [], notQualified: [], downwardMovesExcluded: 0 },
          },
        ],
      ]),
    );

    const fetchV2Spy = vi
      .spyOn(pipelineV2, 'fetchSuccessionPoolV2')
      .mockRejectedValueOnce(new Error('Failed to load work experience evidence: column missing'))
      .mockResolvedValueOnce({
        positionId: 'pos-101',
        scoringDate: '2026-10-28',
        requirements: {
          experienceYears: 3,
          trainingHours: 40,
          education: { minimum: 'bachelor', field: 'Urban Planning' },
          eligibility: { kind: 'required', key: 'CSC Professional' },
        },
        ranked: [
          {
            status: 'scored',
            modelVersion: 'v2',
            positionId: 'pos-101',
            scoringDate: '2026-10-28',
            candidate: { employeeId: 'emp-1', name: 'Maria Gomez' },
            contributions: { performance: 25, experience: 15, training: 18, education: 9, eligibility: 15 },
            total: 82,
            readiness: 'Ready Now',
            rank: 1,
            reasonCodes: [],
            audit: {} as any,
          },
        ],
        needsReview: [],
        configurationNeeded: [],
        excluded: [],
      });

    render(
      <MemoryRouter>
        <SuccessionPlanningPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('City Planning'));
    await screen.findByText('Planning Officer IV');

    fireEvent.click(screen.getByRole('button', { name: 'Reviewed Scoring (V2)' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load V2 pool: Failed to load work experience evidence: column missing');

    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(fetchV2Spy).toHaveBeenCalledTimes(2);
      expect(fetchV2Spy).toHaveBeenNthCalledWith(2, 'pos-101');
      expect(screen.getByText('Maria Gomez')).toBeInTheDocument();
    });
  });
});
