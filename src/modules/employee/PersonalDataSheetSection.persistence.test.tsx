import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Employee, EmployeeChild, EmployeeEducation } from '../../types/employee.types';
import { emptyAddress } from '../../types/employee.types';

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

const portalApi = vi.hoisted(() => ({
  patchPortalEmployee: vi.fn(),
}));

vi.mock('../../lib/api/employeePortal', () => ({
  patchPortalEmployee: portalApi.patchPortalEmployee,
}));

import { PersonalDataSheetSection } from './PersonalDataSheetSection';

const emptyResult = async () => ({
  ok: true,
  data: { rows: [], revision: 'loaded-revision', scalars: {} },
});
const savedResult = async () => ({
  ok: true,
  data: { rows: [], revision: 'saved-revision', scalars: {} },
});

beforeEach(() => {
  vi.clearAllMocks();
  portalApi.patchPortalEmployee.mockResolvedValue({ ok: true, data: baseProfile() });
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

const baseProfile = (overrides: Partial<Employee> = {}): Employee => ({
  employeeId: 'EMP-1',
  supabaseId: 'emp-1',
  fullName: 'Ana Cruz',
  email: 'ana@example.test',
  dateOfBirth: '1990-01-02',
  age: 36,
  gender: 'Female',
  civilStatus: 'Single',
  nationality: 'Filipino',
  mobileNumber: '09123456789',
  homeAddress: 'Iloilo City',
  emergencyContactName: 'Maria Cruz',
  emergencyRelationship: 'Mother',
  emergencyContactNumber: '09123456780',
  sssNumber: '123',
  philhealthNumber: '456',
  pagibigNumber: '789',
  tinNumber: '321',
  surname: 'Cruz',
  firstName: 'Ana',
  middleName: '',
  nameExtension: '',
  heightM: 1.65,
  weightKg: 60,
  bloodType: 'O+',
  placeOfBirth: 'Iloilo',
  residential: emptyAddress(),
  permanent: emptyAddress(),
  ...overrides,
});

const renderSection = (profile: Employee = {} as Employee, onSaved = vi.fn()) =>
  render(
    <PersonalDataSheetSection
      employeeId="emp-1"
      profile={profile}
      onSaved={onSaved}
    />,
  );

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type AnyMock = ReturnType<typeof vi.fn>;

type MutationCase = {
  name: string;
  navName: RegExp;
  saveLabel: string;
  successMessage: string;
  mock: AnyMock;
  successData: unknown;
  staleText?: string;
};

const listMocks = [
  pdsApi.listChildren,
  pdsApi.listEducation,
  pdsApi.listEligibility,
  pdsApi.listWorkExperience,
  pdsApi.listVoluntaryWork,
  pdsApi.listLdInterventions,
  pdsApi.listReferences,
];

/** Keep the second employee's reads unresolved so they cannot mask a stale write. */
const makeSecondEmployeeReadsPending = () => {
  for (const mock of listMocks) {
    mock.mockImplementation((id: string) =>
      id === 'emp-2' ? new Promise(() => {}) : emptyResult(),
    );
  }
};

const mutationCases = (): MutationCase[] => [
  {
    name: 'Personal Information',
    navName: /Personal Information/,
    saveLabel: 'Save Personal Information',
    successMessage: 'Personal Information saved.',
    mock: portalApi.patchPortalEmployee as AnyMock,
    successData: baseProfile({ placeOfBirth: 'STALE PLACE' }),
  },
  {
    name: 'Family Background',
    navName: /Family Background/,
    saveLabel: 'Save Family Background',
    successMessage: 'Family Background saved.',
    mock: pdsApi.saveChildren,
    successData: {
      rows: [{ id: 'stale-child', fullName: 'STALE CHILD' }],
      revision: 'stale-revision',
      scalars: { spouseSurname: 'STALE SPOUSE' },
    },
    staleText: 'STALE CHILD',
  },
  {
    name: 'Educational Background',
    navName: /Educational Background/,
    saveLabel: 'Save Educational Background',
    successMessage: 'Educational Background saved.',
    mock: pdsApi.saveEducation,
    successData: {
      rows: [{ id: 'stale-education', level: 'College', school: 'STALE SCHOOL' }],
      revision: 'stale-revision',
      scalars: {},
    },
  },
  {
    name: 'Civil Service Eligibility',
    navName: /Civil Service Eligibility/,
    saveLabel: 'Save Civil Service Eligibility',
    successMessage: 'Civil Service Eligibility saved.',
    mock: pdsApi.saveEligibility,
    successData: {
      rows: [{ id: 'stale-eligibility', eligibilityName: 'STALE ELIGIBILITY' }],
      revision: 'stale-revision',
      scalars: {},
    },
    staleText: 'STALE ELIGIBILITY',
  },
  {
    name: 'Work Experience',
    navName: /Work Experience/,
    saveLabel: 'Save Work Experience',
    successMessage: 'Work Experience saved.',
    mock: pdsApi.saveWorkExperience,
    successData: {
      rows: [{ id: 'stale-work', positionTitle: 'STALE POSITION' }],
      revision: 'stale-revision',
      scalars: {},
    },
    staleText: 'STALE POSITION',
  },
  {
    name: 'Voluntary Work',
    navName: /Voluntary Work/,
    saveLabel: 'Save Voluntary Work',
    successMessage: 'Voluntary Work saved.',
    mock: pdsApi.saveVoluntaryWork,
    successData: {
      rows: [{ id: 'stale-voluntary', orgNameAddress: 'STALE VOLUNTEER' }],
      revision: 'stale-revision',
      scalars: {},
    },
    staleText: 'STALE VOLUNTEER',
  },
  {
    name: 'Learning & Development',
    navName: /Learning & Development/,
    saveLabel: 'Save Learning & Development',
    successMessage: 'Learning & Development history saved.',
    mock: pdsApi.saveLdInterventions,
    successData: {
      rows: [{ id: 'stale-training', title: 'STALE TRAINING' }],
      revision: 'stale-revision',
      scalars: {},
    },
    staleText: 'STALE TRAINING',
  },
  {
    name: 'Other Information',
    navName: /Other Information/,
    saveLabel: 'Save Other Information',
    successMessage: 'Other Information saved.',
    mock: portalApi.patchPortalEmployee as AnyMock,
    successData: baseProfile({ specialSkillsHobbies: 'STALE SKILLS' }),
  },
  {
    name: 'Background Information',
    navName: /Background Information/,
    saveLabel: 'Save Background Information',
    successMessage: 'Background Information saved.',
    mock: pdsApi.saveReferences,
    successData: {
      rows: [{ id: 'stale-reference', name: 'STALE REFERENCE' }],
      revision: 'stale-revision',
      scalars: { govIdType: 'STALE ID' },
    },
    staleText: 'STALE REFERENCE',
  },
];

/** Mimics EmployeePage: confirmed section values flow back into `profile`. */
function ProfileHarness({ initial }: { initial: Employee }) {
  const [profile, setProfile] = useState(initial);
  return (
    <PersonalDataSheetSection
      employeeId="emp-1"
      profile={profile}
      onSaved={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
    />
  );
}


describe('Personal Data Sheet persistence', () => {
  it('preservesTwoCollegeRecordsAndDoctorate', async () => {
    const education: EmployeeEducation[] = [
      { id: 'edu-college-1', level: 'College', school: 'College One School', degree: 'BSA', sortOrder: 3 },
      { id: 'edu-doctorate', level: 'Doctorate', school: 'Doctorate School', degree: 'PhD', sortOrder: 5 },
      { id: 'edu-college-2', level: 'College', school: 'College Two School', degree: 'BSB', sortOrder: 4 },
    ];
    pdsApi.listEducation.mockResolvedValue({
      ok: true,
      data: { rows: education, revision: 'education-revision', scalars: {} },
    });

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
    expect(pdsApi.saveEducation.mock.calls[0][2]).toBe('education-revision');
  });

  it('saves children and family scalars in one RPC with the loaded revision', async () => {
    renderSection();

    const nav = await screen.findByRole('navigation', { name: 'PDS sections' });
    fireEvent.click(within(nav).getByRole('button', { name: /Family Background/ }));
    await waitFor(() => expect(pdsApi.listChildren).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Add child/ }));
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Test Child' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Family Background' }));

    await waitFor(() => expect(pdsApi.saveChildren).toHaveBeenCalledTimes(1));
    const [employeeId, rows, revision, scalarPatch] = pdsApi.saveChildren.mock.calls[0];
    expect(employeeId).toBe('emp-1');
    expect((rows as EmployeeChild[]).map((row) => row.fullName)).toEqual(['Test Child']);
    expect(revision).toBe('loaded-revision');
    expect(scalarPatch).toMatchObject({ spouseSurname: '', fatherSurname: '', motherSurname: '' });
    expect(portalApi.patchPortalEmployee).not.toHaveBeenCalled();
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

  it('clears existing height and weight instead of omitting them', async () => {
    portalApi.patchPortalEmployee.mockResolvedValue({
      ok: true,
      data: baseProfile({ heightM: undefined, weightKg: undefined }),
    });
    renderSection(baseProfile());

    fireEvent.change(await screen.findByLabelText('Height (m)'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Personal Information' }));

    await waitFor(() => expect(portalApi.patchPortalEmployee).toHaveBeenCalledTimes(1));
    const patch = portalApi.patchPortalEmployee.mock.calls[0][1] as Partial<Employee>;
    expect(patch.heightM).toBeNull();
    expect(patch.weightKg).toBeNull();
  });

  it('merges only the confirmed normalized row into the saved profile', async () => {
    const onSaved = vi.fn();
    portalApi.patchPortalEmployee.mockResolvedValue({
      ok: true,
      data: baseProfile({ placeOfBirth: 'Iloilo City (canonical)', heightM: 1.7 }),
    });
    renderSection(baseProfile(), onSaved);

    fireEvent.change(await screen.findByLabelText('Place of Birth'), { target: { value: 'Iloilo City' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Personal Information' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved.mock.calls[0][0]).toMatchObject({
      placeOfBirth: 'Iloilo City (canonical)',
      heightM: 1.7,
    });
  });

  it('keeps another section’s dirty draft after a confirmed save', async () => {
    portalApi.patchPortalEmployee.mockResolvedValue({
      ok: true,
      data: baseProfile({ placeOfBirth: 'Iloilo City (canonical)' }),
    });
    render(<ProfileHarness initial={baseProfile()} />);

    const nav = await screen.findByRole('navigation', { name: 'PDS sections' });
    fireEvent.click(within(nav).getByRole('button', { name: /Family Background/ }));
    fireEvent.change(screen.getAllByLabelText('Surname')[0], { target: { value: 'Draft Spouse' } });

    fireEvent.click(within(nav).getByRole('button', { name: /Personal Information/ }));
    fireEvent.change(screen.getByLabelText('Place of Birth'), { target: { value: 'Iloilo City' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Personal Information' }));
    await screen.findByText('Personal Information saved.');

    fireEvent.click(within(nav).getByRole('button', { name: /Family Background/ }));
    expect(screen.getAllByLabelText('Surname')[0]).toHaveValue('Draft Spouse');
  });

  it('hydrates family and background scalar drafts from the read snapshot', async () => {
    pdsApi.listChildren.mockResolvedValue({
      ok: true,
      data: { rows: [], revision: 'children-revision', scalars: { spouseSurname: 'Canonical Spouse' } },
    });
    pdsApi.listReferences.mockResolvedValue({
      ok: true,
      data: { rows: [], revision: 'references-revision', scalars: { govIdType: 'Passport' } },
    });
    renderSection(baseProfile({ spouseSurname: 'Stale Spouse', govIdType: 'SSS ID' }));

    const nav = await screen.findByRole('navigation', { name: 'PDS sections' });
    fireEvent.click(within(nav).getByRole('button', { name: /Family Background/ }));
    expect(await screen.findByDisplayValue('Canonical Spouse')).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole('button', { name: /Background Information/ }));
    expect(await screen.findByDisplayValue('Passport')).toBeInTheDocument();
  });

  it('clears the previous employee’s lists and revisions on an identity change', async () => {
    pdsApi.listChildren.mockImplementation((id: string) =>
      id === 'emp-1'
        ? Promise.resolve({
            ok: true,
            data: { rows: [{ id: 'child-1', fullName: 'Old Child' }], revision: 'old-revision', scalars: {} },
          })
        : new Promise(() => {}),
    );

    const view = renderSection(baseProfile({ placeOfBirth: 'Old Place' }));
    const nav = await screen.findByRole('navigation', { name: 'PDS sections' });
    fireEvent.click(within(nav).getByRole('button', { name: /Family Background/ }));
    expect(await screen.findByDisplayValue('Old Child')).toBeInTheDocument();

    view.rerender(
      <PersonalDataSheetSection
        employeeId="emp-2"
        profile={baseProfile({ supabaseId: 'emp-2', employeeId: 'EMP-2', placeOfBirth: 'New Place' })}
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.queryByDisplayValue('Old Child')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Save Family Background' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Reload Family Background before saving.');
    expect(pdsApi.saveChildren).not.toHaveBeenCalled();

    fireEvent.click(within(nav).getByRole('button', { name: /Personal Information/ }));
    expect(screen.getByLabelText('Place of Birth')).toHaveValue('New Place');
  });

  it('keeps the canonical family scalars after an unrelated profile save', async () => {
    portalApi.patchPortalEmployee.mockResolvedValue({
      ok: true,
      data: baseProfile({ placeOfBirth: 'Iloilo City (canonical)' }),
    });
    pdsApi.listChildren.mockResolvedValue({
      ok: true,
      data: {
        rows: [],
        revision: 'children-revision',
        scalars: { spouseSurname: 'Canonical Spouse' },
      },
    });
    render(<ProfileHarness initial={baseProfile({ spouseSurname: 'Stale Spouse' })} />);

    const nav = await screen.findByRole('navigation', { name: 'PDS sections' });
    fireEvent.click(within(nav).getByRole('button', { name: /Family Background/ }));
    expect(await screen.findByDisplayValue('Canonical Spouse')).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole('button', { name: /Personal Information/ }));
    fireEvent.change(screen.getByLabelText('Place of Birth'), { target: { value: 'Iloilo City' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Personal Information' }));
    await screen.findByText('Personal Information saved.');

    fireEvent.click(within(nav).getByRole('button', { name: /Family Background/ }));
    expect(screen.getAllByLabelText('Surname')[0]).toHaveValue('Canonical Spouse');

    fireEvent.click(screen.getByRole('button', { name: 'Save Family Background' }));
    await waitFor(() => expect(pdsApi.saveChildren).toHaveBeenCalledTimes(1));
    expect(pdsApi.saveChildren.mock.calls[0][3]).toMatchObject({
      spouseSurname: 'Canonical Spouse',
    });
  });

  it('keeps the canonical background scalars after an unrelated profile save', async () => {
    portalApi.patchPortalEmployee.mockResolvedValue({
      ok: true,
      data: baseProfile({ placeOfBirth: 'Iloilo City (canonical)' }),
    });
    pdsApi.listReferences.mockResolvedValue({
      ok: true,
      data: {
        rows: [],
        revision: 'references-revision',
        scalars: { govIdType: 'Passport' },
      },
    });
    render(<ProfileHarness initial={baseProfile({ govIdType: 'SSS ID' })} />);

    const nav = await screen.findByRole('navigation', { name: 'PDS sections' });
    fireEvent.click(within(nav).getByRole('button', { name: /Background Information/ }));
    expect(await screen.findByDisplayValue('Passport')).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole('button', { name: /Personal Information/ }));
    fireEvent.change(screen.getByLabelText('Place of Birth'), { target: { value: 'Iloilo City' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Personal Information' }));
    await screen.findByText('Personal Information saved.');

    fireEvent.click(within(nav).getByRole('button', { name: /Background Information/ }));
    expect(screen.getByLabelText(/Government Issued ID/)).toHaveValue('Passport');

    fireEvent.click(screen.getByRole('button', { name: 'Save Background Information' }));
    await waitFor(() => expect(pdsApi.saveReferences).toHaveBeenCalledTimes(1));
    expect(pdsApi.saveReferences.mock.calls[0][3]).toMatchObject({
      govIdType: 'Passport',
    });
  });

  it('rejects fractional education numbers instead of truncating them', async () => {
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: /Educational Background/ }));
    fireEvent.change(screen.getAllByLabelText('Name of School')[0], {
      target: { value: 'State University' },
    });
    fireEvent.change(screen.getAllByLabelText('Units Earned (if not graduated)')[0], {
      target: { value: '3.5' },
    });
    fireEvent.change(screen.getAllByLabelText('Year Attended From')[0], {
      target: { value: '2020.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Educational Background' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Units earned must be a whole number.');
    expect(screen.getByRole('alert')).toHaveTextContent('Year attended from must be a whole number.');
    expect(pdsApi.saveEducation).not.toHaveBeenCalled();
  });

  it('still saves blank, zero, and integer education numbers', async () => {
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: /Educational Background/ }));
    fireEvent.change(screen.getAllByLabelText('Name of School')[0], {
      target: { value: 'State University' },
    });
    fireEvent.change(screen.getAllByLabelText('Units Earned (if not graduated)')[0], {
      target: { value: '0' },
    });
    fireEvent.change(screen.getAllByLabelText('Year Attended From')[0], {
      target: { value: '2020' },
    });
    fireEvent.change(screen.getAllByLabelText('Year Graduated')[0], {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Educational Background' }));

    await waitFor(() => expect(pdsApi.saveEducation).toHaveBeenCalledTimes(1));
    expect(pdsApi.saveEducation.mock.calls[0][1][0]).toMatchObject({
      highestLevelUnits: 0,
      periodFrom: 2020,
      periodTo: null,
      yearGraduated: 0,
    });
  });

  it.each(mutationCases())(
    'ignores a stale $name success after an identity switch',
    async (testCase) => {
      const pending = deferred<unknown>();
      testCase.mock.mockReturnValue(pending.promise);
      makeSecondEmployeeReadsPending();
      const onSaved = vi.fn();
      const view = renderSection(baseProfile(), onSaved);

      const nav = await screen.findByRole('navigation', { name: 'PDS sections' });
      fireEvent.click(within(nav).getByRole('button', { name: testCase.navName }));
      fireEvent.click(screen.getByRole('button', { name: testCase.saveLabel }));
      await waitFor(() => expect(testCase.mock).toHaveBeenCalledTimes(1));

      view.rerender(
        <PersonalDataSheetSection
          employeeId="emp-2"
          profile={baseProfile({ supabaseId: 'emp-2', employeeId: 'EMP-2', placeOfBirth: 'New Place' })}
          onSaved={onSaved}
        />,
      );

      await act(async () => {
        pending.resolve({ ok: true, data: testCase.successData });
      });

      expect(onSaved).not.toHaveBeenCalled();
      expect(screen.queryByText(testCase.successMessage)).not.toBeInTheDocument();
      if (testCase.staleText) {
        expect(screen.queryByText(testCase.staleText)).not.toBeInTheDocument();
      }
    },
  );

  it.each(mutationCases())(
    'ignores a stale $name failure after an identity switch',
    async (testCase) => {
      const pending = deferred<unknown>();
      testCase.mock.mockReturnValue(pending.promise);
      makeSecondEmployeeReadsPending();
      const onSaved = vi.fn();
      const view = renderSection(baseProfile(), onSaved);

      const nav = await screen.findByRole('navigation', { name: 'PDS sections' });
      fireEvent.click(within(nav).getByRole('button', { name: testCase.navName }));
      fireEvent.click(screen.getByRole('button', { name: testCase.saveLabel }));
      await waitFor(() => expect(testCase.mock).toHaveBeenCalledTimes(1));

      view.rerender(
        <PersonalDataSheetSection
          employeeId="emp-2"
          profile={baseProfile({ supabaseId: 'emp-2', employeeId: 'EMP-2', placeOfBirth: 'New Place' })}
          onSaved={onSaved}
        />,
      );

      await act(async () => {
        pending.resolve({ ok: false, error: 'STALE FAILURE' });
      });

      expect(onSaved).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('ignores a stale success after A → B → A', async () => {
    const pending = deferred<unknown>();
    portalApi.patchPortalEmployee.mockReturnValue(pending.promise);
    const onSaved = vi.fn();
    const profileA = baseProfile({ placeOfBirth: 'A Place' });
    const view = renderSection(profileA, onSaved);

    fireEvent.click(await screen.findByRole('button', { name: 'Save Personal Information' }));
    await waitFor(() => expect(portalApi.patchPortalEmployee).toHaveBeenCalledTimes(1));

    view.rerender(
      <PersonalDataSheetSection
        employeeId="emp-2"
        profile={baseProfile({ supabaseId: 'emp-2', employeeId: 'EMP-2', placeOfBirth: 'B Place' })}
        onSaved={onSaved}
      />,
    );
    view.rerender(
      <PersonalDataSheetSection employeeId="emp-1" profile={profileA} onSaved={onSaved} />,
    );

    await act(async () => {
      pending.resolve({ ok: true, data: baseProfile({ placeOfBirth: 'STALE PLACE' }) });
    });

    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Place of Birth')).toHaveValue('A Place');
    expect(screen.queryByText('Personal Information saved.')).not.toBeInTheDocument();
  });

  it('ignores a stale success after unmount', async () => {
    const pending = deferred<unknown>();
    portalApi.patchPortalEmployee.mockReturnValue(pending.promise);
    const onSaved = vi.fn();
    const view = renderSection(baseProfile(), onSaved);

    fireEvent.click(await screen.findByRole('button', { name: 'Save Personal Information' }));
    await waitFor(() => expect(portalApi.patchPortalEmployee).toHaveBeenCalledTimes(1));
    view.unmount();

    await act(async () => {
      pending.resolve({ ok: true, data: baseProfile({ placeOfBirth: 'STALE PLACE' }) });
    });

    expect(onSaved).not.toHaveBeenCalled();
  });

  it('still accepts its own save after StrictMode effect replay', async () => {
    const onSaved = vi.fn();
    render(
      <StrictMode>
        <PersonalDataSheetSection employeeId="emp-1" profile={baseProfile()} onSaved={onSaved} />
      </StrictMode>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Save Personal Information' }));

    await screen.findByText('Personal Information saved.');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ placeOfBirth: 'Iloilo' }));
  });

  it('keeps the current employee saving until its own request completes', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    portalApi.patchPortalEmployee
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onSaved = vi.fn();
    const view = renderSection(baseProfile({ placeOfBirth: 'A Place' }), onSaved);

    fireEvent.click(await screen.findByRole('button', { name: 'Save Personal Information' }));
    await waitFor(() => expect(portalApi.patchPortalEmployee).toHaveBeenCalledTimes(1));

    view.rerender(
      <PersonalDataSheetSection
        employeeId="emp-2"
        profile={baseProfile({ supabaseId: 'emp-2', employeeId: 'EMP-2', placeOfBirth: 'B Place' })}
        onSaved={onSaved}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'Save Personal Information' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);
    await waitFor(() => expect(portalApi.patchPortalEmployee).toHaveBeenCalledTimes(2));

    await act(async () => {
      first.resolve({ ok: true, data: baseProfile({ placeOfBirth: 'STALE PLACE' }) });
    });
    expect(saveButton).toBeDisabled();
    expect(onSaved).not.toHaveBeenCalled();

    await act(async () => {
      second.resolve({ ok: true, data: baseProfile({ placeOfBirth: 'B Saved' }) });
    });
    await screen.findByText('Personal Information saved.');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ placeOfBirth: 'B Saved' }));
  });
});
