import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuccessionPlanningPage } from './SuccessionPlanningPage';
import type { SuccessionPoolV2 } from '../lib/api/successionPipelineV2';
import type { CandidateEvidenceReviewModalProps } from './CandidateEvidenceReviewModal';

const api = vi.hoisted(() => ({
  listDepartmentSummaries: vi.fn(),
  listCriticalPositions: vi.fn(),
  fetchSuccessionPoolsV2: vi.fn(),
  fetchSuccessionPoolV2: vi.fn(),
}));

vi.mock('../lib/api/succession', () => ({
  listDepartmentSummaries: api.listDepartmentSummaries,
  listCriticalPositions: api.listCriticalPositions,
}));

vi.mock('../lib/api/successionPipelineV2', () => ({
  fetchSuccessionPoolsV2: api.fetchSuccessionPoolsV2,
  fetchSuccessionPoolV2: api.fetchSuccessionPoolV2,
}));

vi.mock('./CandidateEvidenceReviewModal', () => ({
  CandidateEvidenceReviewModal: ({
    isOpen,
    onClose,
    candidate,
    criticalPosition,
    onReviewSaved,
  }: CandidateEvidenceReviewModalProps) =>
    isOpen ? (
      <div role="dialog" aria-label="Candidate Evidence Review">
        <span>Modal candidate: {candidate.name}</span>
        <span>Modal position: {criticalPosition.title}</span>
        <button
          type="button"
          onClick={() => {
            onReviewSaved();
            onClose();
          }}
        >
          Mock Save Review
        </button>
        <button type="button" onClick={onClose}>
          Mock Close
        </button>
      </div>
    ) : null,
}));

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="location-probe">{loc.pathname + loc.search}</div>;
};

const baseRequirements = {
  experienceYears: 3,
  trainingHours: 40,
  education: { minimum: 'bachelor' as const, field: 'Urban Planning' },
  eligibility: { kind: 'required' as const, key: 'Civil Service Eligibility (Professional)' },
};

const makePool = (overrides: Partial<SuccessionPoolV2> = {}): SuccessionPoolV2 => ({
  positionId: 'pos-101',
  scoringDate: '2026-11-22',
  requirements: baseRequirements,
  ranked: [
    {
      status: 'scored',
      modelVersion: 'v2',
      positionId: 'pos-101',
      scoringDate: '2026-11-22',
      candidate: { employeeId: 'emp-1', name: 'Maria Gomez' },
      contributions: {
        performance: 27.0,
        experience: 14.0,
        training: 20.0,
        education: 9.0,
        eligibility: 15.0,
      },
      total: 85.0,
      readiness: 'Ready Now',
      rank: 1,
      reasonCodes: [],
      audit: {
        performanceRating: 4.5,
        relevantWorkDays: 1534,
        relevantYears: 4.2,
        trainingHours: 80,
        highestRelevantDegree: 'master',
        distinctEligibilityTypes: [
          'Civil Service Eligibility (Professional)',
          'Bar / Board Eligibility (RA 1080)',
        ],
        minimums: { experience: 'met', training: 'met', education: 'met', eligibility: 'met' },
        requirements: baseRequirements,
        competencies: { required: 2, met: 1 },
      },
    },
    {
      status: 'scored',
      modelVersion: 'v2',
      positionId: 'pos-101',
      scoringDate: '2026-11-22',
      candidate: { employeeId: 'emp-2', name: 'Jose Rizalino' },
      contributions: {
        performance: 24.0,
        experience: 18.0,
        training: 15.0,
        education: 3.0,
        eligibility: 7.5,
      },
      total: 67.5,
      readiness: 'Developmental',
      rank: 2,
      reasonCodes: [],
      audit: {
        performanceRating: 4.0,
        relevantWorkDays: 1972,
        relevantYears: 5.4,
        trainingHours: 60,
        highestRelevantDegree: 'bachelor',
        distinctEligibilityTypes: ['Civil Service Eligibility (Professional)'],
        minimums: { experience: 'met', training: 'met', education: 'met', eligibility: 'met' },
        requirements: baseRequirements,
        competencies: { required: 2, met: 1 },
      },
    },
  ],
  needsReview: [
    {
      status: 'needs-review',
      modelVersion: 'v2',
      positionId: 'pos-101',
      scoringDate: '2026-11-22',
      candidate: { employeeId: 'emp-3', name: 'Pedro Santos' },
      reasonCodes: ['WORK_REVIEW_INCOMPLETE'],
      audit: {
        performanceRating: 4.1,
        relevantWorkDays: 0,
        relevantYears: 0,
        trainingHours: 40,
        highestRelevantDegree: 'bachelor',
        distinctEligibilityTypes: [],
        minimums: { experience: 'unknown', training: 'met', education: 'met', eligibility: 'met' },
        requirements: baseRequirements,
        competencies: { required: 2, met: 0 },
      },
    },
  ],
  configurationNeeded: [
    {
      status: 'configuration-needed',
      modelVersion: 'v2',
      positionId: 'pos-101',
      scoringDate: '2026-11-22',
      candidate: { employeeId: 'emp-4', name: 'Lorna Reyes' },
      reasonCodes: ['TRAINING_REQUIREMENT_NEEDED'],
      audit: {
        performanceRating: 4.0,
        relevantWorkDays: 0,
        relevantYears: 0,
        trainingHours: 0,
        highestRelevantDegree: null,
        distinctEligibilityTypes: [],
        minimums: { experience: 'unknown', training: 'unknown', education: 'unknown', eligibility: 'unknown' },
        requirements: baseRequirements,
        competencies: { required: 0, met: 0 },
      },
    },
  ],
  excluded: [
    {
      status: 'excluded',
      modelVersion: 'v2',
      positionId: 'pos-101',
      scoringDate: '2026-11-22',
      candidate: { employeeId: 'emp-5', name: 'Excluded User' },
      reasonCodes: ['EXPERIENCE_MINIMUM_NOT_MET'],
      audit: {
        performanceRating: 3.5,
        relevantWorkDays: 100,
        relevantYears: 0.27,
        trainingHours: 20,
        highestRelevantDegree: 'bachelor',
        distinctEligibilityTypes: [],
        minimums: { experience: 'failed', training: 'failed', education: 'met', eligibility: 'met' },
        requirements: baseRequirements,
        competencies: { required: 2, met: 0 },
      },
    },
  ],
  downwardMovesExcluded: 2,
  candidateMeta: {
    'emp-1': {
      presentPosition: 'Planning Officer III',
      department: 'City Planning',
      ipcrPeriod: '2026-S1',
      ipcrAdjectival: 'Very Satisfactory',
      experienceUsedTenureFallback: true,
      eligibilityDetail: {
        recognized: [
          'Civil Service Eligibility (Professional)',
          'Bar / Board Eligibility (RA 1080)',
        ],
        expired: ['PRC Professional License'],
        unrecognized: ['Registered Civil Engineer'],
      },
      competencyBreakdown: [
        { name: 'Urban Land Use Planning', met: true, satisfiedBy: 'GIS Masterclass' },
        { name: 'Fiscal Budgeting', met: false, satisfiedBy: null },
      ],
      gapAnalysis: ['Missing Fiscal Budgeting training coverage'],
      requiredActions: ['Complete L&D Fiscal Budgeting workshop'],
      timeline: '6–12 months',
    },
    'emp-2': {
      presentPosition: 'Project Development Officer II',
      department: 'City Planning',
      ipcrPeriod: '2026-S1',
      ipcrAdjectival: 'Very Satisfactory',
      experienceUsedTenureFallback: false,
      eligibilityDetail: {
        recognized: ['Civil Service Eligibility (Professional)'],
        expired: [],
        unrecognized: [],
      },
      competencyBreakdown: [],
      gapAnalysis: [],
      requiredActions: [],
      timeline: null,
    },
  },
  ...overrides,
});

describe('SuccessionPlanningPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('opens the office and highlights the position named in the URL', async () => {
    api.listDepartmentSummaries.mockResolvedValue({
      ok: true,
      data: [
        {
          departmentId: 'd-eng',
          departmentName: 'Engineering',
          code: 'ENG',
          criticalPositionCount: 1,
          vacantCriticalCount: 0,
          isActive: true,
        },
      ],
    });
    api.listCriticalPositions.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'p-city-eng',
          departmentId: 'd-eng',
          title: 'City Engineer',
          incumbentName: 'A',
          incumbentLeavingDate: null,
        },
      ],
    });
    api.fetchSuccessionPoolsV2.mockResolvedValue(
      new Map([['p-city-eng', makePool({ positionId: 'p-city-eng', ranked: [], needsReview: [], configurationNeeded: [], excluded: [], downwardMovesExcluded: 0 })]]),
    );

    render(
      <MemoryRouter initialEntries={['/admin/rsp/succession?dept=d-eng&position=p-city-eng']}>
        <SuccessionPlanningPage />
      </MemoryRouter>,
    );

    await screen.findByText('City Engineer');
    expect(api.listCriticalPositions).toHaveBeenCalledTimes(1);
    expect(api.listCriticalPositions).toHaveBeenCalledWith('d-eng');
    expect(api.fetchSuccessionPoolsV2).toHaveBeenCalledWith(['p-city-eng']);

    const block = document.getElementById('succession-position-p-city-eng') as HTMLElement;
    await waitFor(() => expect(block.className).toContain('ring-2'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('renders V2-only table without V1/V2 toggle or Readiness column, with header counts, sorting, breakdown, and review modal', async () => {
    api.listDepartmentSummaries.mockResolvedValue({
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
    api.listCriticalPositions.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'pos-101',
          departmentId: 'd-1',
          title: 'Planning Officer IV',
          incumbentName: 'Incumbent A',
          incumbentLeavingDate: '2026-12-01',
        },
      ],
    });
    const pool = makePool();
    api.fetchSuccessionPoolsV2.mockResolvedValue(new Map([['pos-101', pool]]));
    api.fetchSuccessionPoolV2.mockResolvedValue(pool);

    render(
      <MemoryRouter>
        <SuccessionPlanningPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('City Planning'));

    await screen.findByText('Planning Officer IV');
    await screen.findByText('Maria Gomez');

    // No V1/V2 toggle
    expect(screen.queryByRole('button', { name: /Legacy Model/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reviewed Scoring/i })).not.toBeInTheDocument();

    // No Readiness column or badges
    expect(screen.queryByRole('columnheader', { name: /Readiness/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Ready Now')).not.toBeInTheDocument();
    expect(screen.queryByText('Ready in 1–2 Years')).not.toBeInTheDocument();
    expect(screen.queryByText('Developmental')).not.toBeInTheDocument();

    // Position header line with incumbent, leaving date, excluded count, downward moves
    expect(screen.getByText(/Held by: Incumbent A/i)).toBeInTheDocument();
    expect(screen.getByText(/1 did not meet the minimum requirements/i)).toBeInTheDocument();
    expect(screen.getByText(/2 excluded as downward moves/i)).toBeInTheDocument();

    // Candidate details & scores
    expect(screen.getByText('Planning Officer III')).toBeInTheDocument();
    expect(screen.getByText('Project Development Officer II')).toBeInTheDocument();
    expect(screen.getByText('27.0 / 30')).toBeInTheDocument();
    expect(screen.getByText('85.0 / 100')).toBeInTheDocument();

    // Configuration needed banner & needs review cards
    expect(screen.getByText(/Position Requirements Incomplete:/i)).toBeInTheDocument();
    expect(screen.getByText('Needs Evidence Review (1 candidate)')).toBeInTheDocument();
    expect(screen.getByText('Pedro Santos')).toBeInTheDocument();

    // Column sorting: Experience (20%) puts Jose Rizalino (18.0) before Maria Gomez (14.0), preserving rank
    const expHeaderBtn = screen.getByRole('button', { name: /Experience \(20%\)/i });
    fireEvent.click(expHeaderBtn);
    const candidateTable = expHeaderBtn.closest('table') as HTMLElement;
    const bodyRowsDesc = within(candidateTable).getAllByRole('row').slice(1);
    expect(within(bodyRowsDesc[0]).getByText('Jose Rizalino')).toBeInTheDocument();
    expect(within(bodyRowsDesc[0]).getByText('2')).toBeInTheDocument();
    expect(within(bodyRowsDesc[1]).getByText('Maria Gomez')).toBeInTheDocument();
    expect(within(bodyRowsDesc[1]).getByText('1')).toBeInTheDocument();

    // Click again to sort ascending
    fireEvent.click(expHeaderBtn);
    const bodyRowsAsc = within(candidateTable).getAllByRole('row').slice(1);
    expect(within(bodyRowsAsc[0]).getByText('Maria Gomez')).toBeInTheDocument();

    // Expand candidate breakdown
    fireEvent.click(screen.getByRole('button', { name: /Maria Gomez/i }));
    expect(screen.getByText(/Score breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/City Hall tenure fallback from date_hired was used/i)).toBeInTheDocument();
    expect(screen.getByText('Registered Civil Engineer')).toBeInTheDocument();
    expect(screen.getByText('not in recognized eligibilities')).toBeInTheDocument();
    expect(screen.getByText('PRC Professional License')).toBeInTheDocument();
    expect(screen.getByText('expired')).toBeInTheDocument();
    expect(screen.getByText('Urban Land Use Planning')).toBeInTheDocument();
    expect(screen.getByText('(GIS Masterclass)')).toBeInTheDocument();
    expect(screen.getByText('Fiscal Budgeting')).toBeInTheDocument();
    expect(screen.getByText('Missing Fiscal Budgeting training coverage')).toBeInTheDocument();
    expect(screen.getByText('Complete L&D Fiscal Budgeting workshop')).toBeInTheDocument();
    expect(screen.getByText(/Estimated timeline: 6–12 months/i)).toBeInTheDocument();

    // Open L&D Archive navigation
    fireEvent.click(screen.getByRole('button', { name: /Open L&D Archive/i }));
    expect(screen.getByTestId('location-probe').textContent).toBe(
      '/admin/lnd?module=archive&employee=emp-1&office=City+Planning',
    );

    // Trigger Review Evidence modal and verify single-position refresh on save
    const reviewButtons = screen.getAllByRole('button', { name: 'Review Evidence' });
    fireEvent.click(reviewButtons[0]);
    expect(screen.getByRole('dialog', { name: 'Candidate Evidence Review' })).toBeInTheDocument();
    expect(screen.getByText('Modal candidate: Maria Gomez')).toBeInTheDocument();
    expect(screen.getByText('Modal position: Planning Officer IV')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mock Save Review' }));
    await waitFor(() => {
      expect(api.fetchSuccessionPoolV2).toHaveBeenCalledWith('pos-101');
    });
  });

  it('shows an error alert and allows retrying a failed position pool load', async () => {
    api.listDepartmentSummaries.mockResolvedValue({
      ok: true,
      data: [
        {
          departmentId: 'd-2',
          departmentName: 'Treasury',
          code: 'CTO',
          criticalPositionCount: 1,
          vacantCriticalCount: 1,
          isActive: true,
        },
      ],
    });
    api.listCriticalPositions.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'pos-202',
          departmentId: 'd-2',
          title: 'City Treasurer',
          incumbentName: null,
          incumbentLeavingDate: null,
        },
      ],
    });
    api.fetchSuccessionPoolsV2.mockRejectedValueOnce(new Error('Network down'));
    api.fetchSuccessionPoolV2.mockResolvedValueOnce(
      makePool({
        positionId: 'pos-202',
        ranked: [],
        needsReview: [],
        configurationNeeded: [],
        excluded: [],
        downwardMovesExcluded: 0,
      }),
    );

    render(
      <MemoryRouter>
        <SuccessionPlanningPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('Treasury'));
    await screen.findByText(/Failed to load succession pool: Network down/i);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('No candidates currently meet all minimum qualifications.');
    expect(api.fetchSuccessionPoolV2).toHaveBeenCalledWith('pos-202');
  });
});
