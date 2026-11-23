import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const { db, uploadFile } = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  db: {
    applications: [] as Row[],
    attachments: [] as Row[],
    // Per-applicant delay on the attachments read, to race a row switch.
    attachmentDelayMs: {} as Record<string, number>,
    queryDelayMs: {} as Record<string, number>,
    lookupDelayMs: {} as Record<string, number>,
    reads: [] as string[],
  },
}));

vi.mock('../../lib/supabase', () => {
  const builder = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let delay = db.queryDelayMs[table] ?? 0;
    let inserted: Row | null = null;
    let updates: Row | null = null;
    const run = () => {
      const source = table === 'applicant_tracker_view' ? db.applications : db.attachments;
      const rows = source
        .filter((r) => filters.every((f) => f(r)))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      if (inserted) db.attachments.push({ ...inserted, id: `uploaded-${db.attachments.length}`, created_at: new Date().toISOString() });
      else if (updates) db.applications = db.applications.map((row) => filters.every((f) => f(row)) ? { ...row, ...updates } : row);
      else db.reads.push(table);
      return new Promise((resolve) => setTimeout(() => resolve({ data: rows, error: null }), delay));
    };
    const b: any = {
      select: () => b,
      insert: (row: Row) => { inserted = row; return b; },
      update: (row: Row) => { updates = row; return b; },
      order: () => b,
      range: () => b,
      eq: (col: string, val: unknown) => {
        if (table === 'applicant_tracker_view') delay = db.lookupDelayMs[String(val)] ?? delay;
        if (table === 'applicant_attachments' && col === 'applicant_id') delay = db.attachmentDelayMs[String(val)] ?? 0;
        filters.push((r) => r[col] === val);
        return b;
      },
      in: (col: string, vals: unknown[]) => {
        if (table === 'applicant_attachments') delay = Math.max(0, ...vals.map((id) => db.attachmentDelayMs[String(id)] ?? 0));
        filters.push((r) => vals.includes(r[col])); return b;
      },
      then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => run().then(ok, fail),
    };
    return b;
  };
  const channel: any = { on: () => channel, subscribe: () => channel };
  return {
    ATTACHMENTS_BUCKET: 'attachments',
    supabase: {
      from: (table: string) => builder(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
      channel: () => channel,
      removeChannel: () => undefined,
      storage: { from: () => ({ upload: uploadFile }) },
    },
  };
});
vi.mock('../../lib/plantillaSlots', () => ({
  fetchApplicantSlotLinksChecked: () => Promise.resolve({ ok: true, data: new Map() }),
  fetchSlotsByJobPostingChecked: () => Promise.resolve({ ok: true, data: new Map() }),
}));
vi.mock('../../lib/crypto', () => ({ encryptApplicantFile: async (file: File) => file }));
vi.mock('../../lib/recruitmentData', () => ({ getApplicants: () => [], saveApplicants: vi.fn() }));

import { ApplicationStatusPage } from './ApplicationStatusPage';

const REF = 'ABYAN-584-392';

const application = (id: string, position: string, status: string, created_at: string): Row => ({
  id, position, status, created_at,
  office: 'Office of the City Engineer',
  reference_no: REF,
  reference_no_normalized: 'ABYAN584392',
  first_name: 'Patricia Ann', last_name: 'Cordero',
  email: 'patricia@example.com',
  updated_at: created_at,
});

const upload = (applicant_id: string, file_name: string, document_type: string, created_at: string): Row => ({
  id: `${applicant_id}-${file_name}`, applicant_id, file_name, file_path: `${applicant_id}/${file_name}`, document_type, created_at,
});

const notice = (applicant_id: string, created_at: string): Row => ({
  id: `${applicant_id}-notice`, applicant_id,
  file_name: 'resubmission::Transcript of Records::Unreadable scan',
  file_path: '—', document_type: 'resubmission_request', created_at,
});

beforeEach(() => {
  db.applications = [
    application('newest', 'Engineer II (Drainage / Flood Control)', 'Submitted', '2026-10-23T00:00:00Z'),
    application('needs-docs', 'Engineer I', 'Under Initial Screening', '2026-10-20T00:00:00Z'),
    application('closed', 'Draftsman II', 'Not Selected', '2026-10-02T00:00:00Z'),
  ];
  db.attachments = [
    upload('newest', 'engineer-ii-pds.pdf', 'pds_with_photo', '2026-10-23T00:00:00Z'),
    upload('needs-docs', 'engineer-i-tor.pdf', 'transcript_of_records', '2026-10-20T00:00:00Z'),
    notice('needs-docs', '2026-10-21T00:00:00Z'),
  ];
  db.attachmentDelayMs = {};
  db.queryDelayMs = {};
  db.lookupDelayMs = {};
  db.reads = [];
  uploadFile.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => { cleanup(); vi.useRealTimers(); });

const renderTracker = (ref = REF) => render(
  <MemoryRouter initialEntries={[`/track?ref=${ref}`]}>
    <Routes><Route path="/track" element={<ApplicationStatusPage />} /></Routes>
  </MemoryRouter>,
);

const rowButton = (position: string) => screen.getByRole('button', { name: new RegExp(position.replace(/[()/]/g, '.')) });
const searchFor = (value: string) => {
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest('form')!);
};
const submitFile = (filename: string) => {
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [new File(['document'], filename, { type: 'application/pdf' })] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm & Submit' }));
};

describe('ApplicationStatusPage with several applications', () => {
  it('lists every application and opens the one waiting on the applicant', async () => {
    renderTracker();

    expect(await screen.findByRole('heading', { name: 'Your applications' })).toBeInTheDocument();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows).toHaveLength(3);

    const needsDocs = screen.getByRole('button', { name: /^Engineer I\b(?! \()/ });
    expect(needsDocs).toHaveAttribute('aria-expanded', 'true');
    expect(within(needsDocs).getByText('Action required')).toBeInTheDocument();
    expect(await screen.findByText('Notices from RSP Admin')).toBeInTheDocument();
    expect(await screen.findByText('engineer-i-tor.pdf')).toBeInTheDocument();
  });

  it('expands another row with its own status and collapses the first', async () => {
    renderTracker();
    await screen.findByText('Notices from RSP Admin');

    fireEvent.click(rowButton('Engineer II (Drainage / Flood Control)'));

    expect(rowButton('Engineer II (Drainage / Flood Control)')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Engineer I\b(?! \()/ })).toHaveAttribute('aria-expanded', 'false');
    expect(await screen.findByText('engineer-ii-pds.pdf')).toBeInTheDocument();
    // Nothing from the other application carries over.
    expect(screen.queryByText('engineer-i-tor.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('Notices from RSP Admin')).not.toBeInTheDocument();
  });

  it('collapses the open row when it is clicked again', async () => {
    renderTracker();
    await screen.findByText('Notices from RSP Admin');

    fireEvent.click(screen.getByRole('button', { name: /^Engineer I\b(?! \()/ }));

    expect(screen.queryByRole('heading', { name: 'Current Status' })).not.toBeInTheDocument();
    within(screen.getByRole('list')).getAllByRole('button').forEach((b) => expect(b).toHaveAttribute('aria-expanded', 'false'));
  });

  it('keeps an in-flight refresh scoped to the row now open, not the row left behind', async () => {
    vi.useFakeTimers();
    renderTracker();
    await act(() => vi.advanceTimersByTimeAsync(100));
    db.attachmentDelayMs = { 'needs-docs': 500 };
    window.dispatchEvent(new Event('focus'));
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(db.reads.filter((table) => table === 'applicant_attachments')).toHaveLength(2);
    fireEvent.click(rowButton('Engineer II (Drainage / Flood Control)'));
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(screen.getByText('engineer-ii-pds.pdf')).toBeInTheDocument();
    expect(screen.queryByText('engineer-i-tor.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('Notices from RSP Admin')).not.toBeInTheDocument();
  });

  it('rejects an old search result after another person has already loaded', async () => {
    vi.useFakeTimers();
    db.lookupDelayMs.ABYAN584392 = 500;
    db.applications.push({ ...application('other', 'Accountant I', 'Submitted', '2026-10-24'), email: 'other@example.com' });
    renderTracker();
    await act(() => vi.advanceTimersByTimeAsync(10));
    searchFor('other@example.com');
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByText('Accountant I', { exact: false })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(screen.queryByRole('heading', { name: 'Your applications' })).not.toBeInTheDocument();
    expect(screen.getByText('other@example.com')).toBeInTheDocument();
    expect(screen.queryByText('engineer-i-tor.pdf')).not.toBeInTheDocument();
  });

  it('rejects a previous person’s pending refresh when a new search completes', async () => {
    vi.useFakeTimers();
    renderTracker();
    await act(() => vi.advanceTimersByTimeAsync(100));
    db.queryDelayMs.applicant_tracker_view = 500;
    window.dispatchEvent(new Event('focus'));
    await act(() => vi.advanceTimersByTimeAsync(10));
    db.queryDelayMs.applicant_tracker_view = 0;
    db.applications.push({ ...application('other', 'Accountant I', 'Submitted', '2026-10-24'), email: 'other@example.com' });
    searchFor('other@example.com');
    await act(() => vi.advanceTimersByTimeAsync(100));
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(screen.getByText('other@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your applications' })).not.toBeInTheDocument();
  });

  it('does not let an old upload clear a newer spinner after A → B → A', async () => {
    vi.useFakeTimers();
    let finishOld!: (value: unknown) => void;
    let finishNew!: (value: unknown) => void;
    uploadFile.mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { finishNew = resolve; }));
    renderTracker();
    await act(() => vi.advanceTimersByTimeAsync(100));
    submitFile('old.pdf');
    await act(() => vi.advanceTimersByTimeAsync(1));
    fireEvent.click(rowButton('Engineer II (Drainage / Flood Control)'));
    fireEvent.click(screen.getByRole('button', { name: /^Engineer I\b(?! \()/ }));
    submitFile('new.pdf');
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(uploadFile).toHaveBeenCalledTimes(2);
    await act(async () => { finishOld({ error: { message: 'Old upload failed' } }); });
    expect(screen.getByText('Uploading your document, please wait…')).toBeInTheDocument();
    expect(screen.queryByText("We couldn't upload this document.")).not.toBeInTheDocument();
    await act(async () => { finishNew({ error: { message: 'New upload failed' } }); });
    expect(screen.queryByText('Uploading your document, please wait…')).not.toBeInTheDocument();
    expect(screen.getByText("We couldn't upload this document.")).toBeInTheDocument();
  });

  it('refreshes uploaded documents immediately and rejects a pre-write refresh', async () => {
    vi.useFakeTimers();
    renderTracker();
    await act(() => vi.advanceTimersByTimeAsync(100));
    db.queryDelayMs.applicant_tracker_view = 500;
    window.dispatchEvent(new Event('focus'));
    await act(() => vi.advanceTimersByTimeAsync(10));
    submitFile('corrected-tor.pdf');
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByText('corrected-tor.pdf')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1_200));
    expect(screen.getByText('corrected-tor.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Notices from RSP Admin')).not.toBeInTheDocument();
    expect(db.reads.filter((table) => table === 'applicant_tracker_view')).toHaveLength(3);
  });

  it('keeps a collapsed row status live through polling', async () => {
    vi.useFakeTimers();
    renderTracker();
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByText('Notices from RSP Admin')).toBeInTheDocument();
    const closedRow = () => screen.getByRole('button', { name: /Draftsman II/ });
    expect(within(closedRow()).getByText('Not Selected')).toBeInTheDocument();

    db.applications = db.applications.map((a) => (a.id === 'newest' ? { ...a, status: 'Shortlisted' } : a));

    const newestRow = rowButton('Engineer II (Drainage / Flood Control)');
    await act(() => vi.advanceTimersByTimeAsync(15_100));
    expect(within(newestRow).getByText('Shortlisted')).toBeInTheDocument();
    expect(newestRow).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('ApplicationStatusPage with one application', () => {
  it('shows the page as before, with no list', async () => {
    db.applications = [db.applications[0]];
    renderTracker();

    expect(await screen.findByRole('heading', { name: 'Application Details' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your applications' })).not.toBeInTheDocument();
    expect(await screen.findByText('engineer-ii-pds.pdf')).toBeInTheDocument();
  });

  it('finishes the automatic search under React StrictMode effect replay', async () => {
    vi.useFakeTimers();
    db.applications = [db.applications[0]];
    render(<StrictMode><MemoryRouter initialEntries={[`/track?ref=${REF}`]}><ApplicationStatusPage /></MemoryRouter></StrictMode>);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByRole('heading', { name: 'Application Details' })).toBeInTheDocument();
  });

  it('renders contract-signing deadline, instructions, and approved badge for For Contract Signing', async () => {
    db.applications = [
      {
        ...application('signing-1', 'City Accountant', 'For Contract Signing', '2026-10-10T08:00:00Z'),
        signing_deadline: '2026-11-30',
        signing_instructions: 'Bring two valid IDs to Room 302.',
      },
    ];
    renderTracker();

    expect(await screen.findByText('For Contract Signing')).toBeInTheDocument();
    expect(screen.getByText('Bring two valid IDs to Room 302.')).toBeInTheDocument();
    expect(screen.getByText(/Report on or before/i)).toBeInTheDocument();
    expect(screen.queryByText(/Your application has been received\. We will begin reviewing it shortly\./i)).not.toBeInTheDocument();
  });

  it('renders the regret letter when an archived application is Not Selected', async () => {
    db.applications = [
      {
        ...application('not-selected-1', 'Accountant II', 'Not Selected', '2026-10-10T08:00:00Z'),
        archived_at: '2026-11-01T09:00:00Z',
      },
    ];
    renderTracker();

    expect(await screen.findByText(/Dear Patricia Ann Cordero/i)).toBeInTheDocument();
    expect(screen.getByText(/we have chosen to move forward with another candidate/i)).toBeInTheDocument();
  });
});
