import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobPosting } from '../types/recruitment.types';

// A posting with three admin-named plantillas: one open, one filled, one this
// browser already applied to. Old ABYAN-style internal keys are present on
// purpose — they must never reach the screen.
const job = {
  id: 'job-legal-1',
  jobCode: 'ABYAN-2026-297',
  title: 'Admin Aid I',
  department: 'Legal',
  status: 'Active',
  salaryGrade: 10,
  applicationDeadline: '2099-12-31T00:00:00.000Z',
  postedDate: '2026-09-25T00:00:00.000Z',
  requiredDocuments: ['Resume/CV', 'Application Letter'],
  responsibilities: [],
  summary: 'Posting-wide summary',
  qualifications: { education: '', experience: { years: 0, field: '' }, skills: [], certifications: [] },
  // Slots 20 and 100 were merged from separate postings and keep their own text.
  plantillaSlots: [
    {
      id: 'slot-a', jobPostingId: 'job-legal-1', slotNumber: 1, label: 'Plantilla 20', itemNumber: 'ABYAN-2026-297', status: 'filled',
      division: 'Records Division', summary: 'Keeps the legal records.', responsibilities: ['Files case folders'],
    },
    {
      id: 'slot-b', jobPostingId: 'job-legal-1', slotNumber: 2, label: 'Plantilla 100', itemNumber: 'ABYAN-2026-298', status: 'open', salaryGrade: 10,
      summary: 'Drafts routine contracts.', responsibilities: ['Prepares contract drafts'],
    },
    { id: 'slot-c', jobPostingId: 'job-legal-1', slotNumber: 3, label: 'Plantilla 3', itemNumber: 'PLT-0A1B2C3D4E', status: 'open' },
  ],
} as unknown as JobPosting;

vi.mock('../lib/recruitmentData', () => ({
  getJobPostings: () => [job],
  loadJobPostings: () => Promise.resolve([job]),
}));

vi.mock('../lib/supabase', () => ({ supabase: {}, ATTACHMENTS_BUCKET: 'x', isMockModeEnabled: () => false }));

vi.mock('../lib/plantillaSlots', () => ({
  fetchSlotApplicantCounts: () => Promise.resolve(new Map([['slot-b', 15]])),
}));

/** `plantillaSlotId` is what a landing vacancy row hands over for its plantilla. */
const renderPage = async (plantillaSlotId?: string) => {
  const { JobDetailsPage } = await import('./JobDetailsPage');
  const state = plantillaSlotId
    ? { landingJob: { id: 'job-legal-1', title: job.title, department: job.department, itemNumber: job.jobCode, postingDate: '', closingDate: '', originalJob: job, plantillaSlotId } }
    : null;
  render(
    <MemoryRouter initialEntries={[{ pathname: '/job-details/job-legal-1', state }]}>
      <Routes>
        <Route path="/job-details/:jobId" element={<JobDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText(/Please review your application carefully before submission/);
  return document.querySelector('.af-hero-sub') as HTMLElement;
};

describe('Job Details — the one plantilla a vacancy stands for', () => {
  beforeEach(() => {
    // jsdom has no matchMedia; the page uses it for its desktop/mobile layout.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    localStorage.clear();
    sessionStorage.clear();
    // This browser already applied to Plantilla 3.
    localStorage.setItem('cictrix_applied_plantilla', JSON.stringify({ 'slot-c': { referenceNo: 'ABYAN-748-102', at: '' } }));
  });

  it('shows the submission instruction and a Continue button, with no plantilla card to choose from', async () => {
    const hero = await renderPage('slot-b');

    expect(hero).toHaveTextContent('Plantilla 100');
    expect(screen.getByRole('note')).toHaveTextContent(
      'Please review your application carefully before submission. Ensure that all required fields are completed and all supporting documents are accurate, complete, valid, and readable. The completeness and quality of your submission may be considered during the evaluation of your application.',
    );
    expect(screen.queryByText(/Choose your plantilla items/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Plantilla 20')).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /Continue to Application/ })) expect(button).toBeEnabled();
  });

  it('falls back to the first open plantilla when no row named one', async () => {
    const hero = await renderPage();

    expect(hero).toHaveTextContent('Plantilla 100');
  });

  it('selects the plantilla named in the ?slot= query string when route state is absent', async () => {
    const { JobDetailsPage } = await import('./JobDetailsPage');
    render(
      <MemoryRouter initialEntries={['/job-details/job-legal-1?slot=slot-c']}>
        <Routes>
          <Route path="/job-details/:jobId" element={<JobDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText(/Please review your application carefully before submission/);
    expect(document.querySelector('.af-hero-sub')).toHaveTextContent('Plantilla 3');
  });

  it('never shows a plantilla item number or any ABYAN-style code', async () => {
    await renderPage('slot-b');

    expect(screen.queryByText(/Plantilla Item No/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ABYAN-\d/);
    expect(document.body.textContent).not.toMatch(/PLT-/);
  });

  it('lets the next person on this browser apply to a plantilla someone here already applied to', async () => {
    // Any number of people may apply. The browser flag is not a person; the
    // database rejects a real duplicate by email at submit.
    await renderPage('slot-c');

    expect(screen.queryByRole('heading', { name: 'This plantilla is no longer open' })).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /Continue to Application/ })) expect(button).toBeEnabled();
  });

  it('says a filled plantilla is no longer open', async () => {
    await renderPage('slot-a');

    expect(screen.getByRole('heading', { name: 'This plantilla is no longer open' })).toBeInTheDocument();
    expect(screen.getByText(/has been filled/i)).toBeInTheDocument();
  });

  it('shows only this plantilla\'s own summary and duties', async () => {
    await renderPage('slot-b');

    expect(screen.getByText('Drafts routine contracts.')).toBeInTheDocument();
    expect(screen.getByText('Prepares contract drafts')).toBeInTheDocument();
    expect(screen.queryByText('Keeps the legal records.')).not.toBeInTheDocument();
    expect(screen.queryByText('Files case folders')).not.toBeInTheDocument();
    // Per-plantilla text replaces the posting-wide summary, not added to it.
    expect(screen.queryByText('Posting-wide summary')).not.toBeInTheDocument();
  });

  it('no longer lists Curriculum Vitae as a required document', async () => {
    await renderPage();

    const docs = screen.getByRole('heading', { name: 'Required documents' }).closest('section') as HTMLElement;
    expect(within(docs).queryByText(/Resume\/CV|Curriculum Vitae/i)).not.toBeInTheDocument();
    expect(within(docs).getByText('Application Letter')).toBeInTheDocument();
  });
});
