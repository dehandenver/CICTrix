import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Employee, EmployeeEducation } from '../../types/employee.types';

const pdsApi = vi.hoisted(() => ({
  listChildren: vi.fn(),
  listEducation: vi.fn(),
  listEligibility: vi.fn(),
  listWorkExperience: vi.fn(),
  listVoluntaryWork: vi.fn(),
  listLdInterventions: vi.fn(),
  listReferences: vi.fn(),
  saveChildren: vi.fn(),
  saveEducation: vi.fn(),
  saveEligibility: vi.fn(),
  saveWorkExperience: vi.fn(),
  saveVoluntaryWork: vi.fn(),
  saveLdInterventions: vi.fn(),
  saveReferences: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../lib/api/personalDataSheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api/personalDataSheet')>();
  return { ...actual, ...pdsApi };
});

vi.mock('../../lib/api/employeePortal', () => ({
  patchPortalEmployee: vi.fn(async () => ({ ok: true })),
}));

import { PersonalDataSheetSection } from './PersonalDataSheetSection';

const emptyResult = async () => ({ ok: true, data: [] });
const savedResult = async () => ({ ok: true, data: null });

beforeEach(() => {
  vi.clearAllMocks();
  pdsApi.listChildren.mockImplementation(emptyResult);
  pdsApi.listEducation.mockImplementation(emptyResult);
  pdsApi.listEligibility.mockImplementation(emptyResult);
  pdsApi.listWorkExperience.mockImplementation(emptyResult);
  pdsApi.listVoluntaryWork.mockImplementation(emptyResult);
  pdsApi.listLdInterventions.mockImplementation(emptyResult);
  pdsApi.listReferences.mockImplementation(emptyResult);
  pdsApi.saveChildren.mockImplementation(savedResult);
  pdsApi.saveEducation.mockImplementation(savedResult);
  pdsApi.saveEligibility.mockImplementation(savedResult);
  pdsApi.saveWorkExperience.mockImplementation(savedResult);
  pdsApi.saveVoluntaryWork.mockImplementation(savedResult);
  pdsApi.saveLdInterventions.mockImplementation(savedResult);
  pdsApi.saveReferences.mockImplementation(savedResult);
});

afterEach(cleanup);

const renderSection = () =>
  render(
    <PersonalDataSheetSection
      employeeId="emp-1"
      profile={{} as Employee}
      onSaved={vi.fn()}
    />,
  );

describe('Personal Data Sheet persistence', () => {
  it('preservesTwoCollegeRecordsAndDoctorate', async () => {
    const education: EmployeeEducation[] = [
      { id: 'edu-college-1', level: 'College', school: 'College One School', degree: 'BSA', sortOrder: 3 },
      { id: 'edu-doctorate', level: 'Doctorate', school: 'Doctorate School', degree: 'PhD', sortOrder: 5 },
      { id: 'edu-college-2', level: 'College', school: 'College Two School', degree: 'BSB', sortOrder: 4 },
    ];
    pdsApi.listEducation.mockResolvedValue({ ok: true, data: education });

    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: /Educational Background/ }));

    expect(await screen.findByDisplayValue('College One School')).toBeInTheDocument();
    expect(screen.getByDisplayValue('College Two School')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Doctorate School')).toBeInTheDocument();
    expect(screen.getAllByText('College')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Save Educational Background' }));

    await waitFor(() => expect(pdsApi.saveEducation).toHaveBeenCalledTimes(1));
    const savedRows = pdsApi.saveEducation.mock.calls[0][1] as EmployeeEducation[];
    expect(savedRows.map((row) => row.id).filter(Boolean)).toEqual(
      expect.arrayContaining(['edu-college-1', 'edu-college-2', 'edu-doctorate']),
    );
  });

  it('rejectsPartiallyCompletedRowsBeforeAnyWrite', async () => {
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: /Work Experience/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add work experience/ }));
    fireEvent.change(screen.getByLabelText('Position Title'), { target: { value: 'Clerk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Work Experience' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Date From is required.');
    expect(screen.getByRole('alert')).toHaveTextContent('Department/Agency/Office/Company is required.');
    expect(pdsApi.saveWorkExperience).not.toHaveBeenCalled();
  });
});
