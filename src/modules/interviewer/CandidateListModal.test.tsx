import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CandidateListModal } from './InterviewerDashboardParts';
import type { CandidateRow } from './interviewerDashboardModel';

const row = (overrides: Partial<CandidateRow>): CandidateRow => ({
  id: 'a1', name: 'Paula Promoted', position: 'City Accountant II', department: 'Office of The City Accountant',
  titleKey: 'city accountant ii', interviewDate: '2026-11-02', interviewTime: '', evaluated: false,
  evaluatedByMe: false, evaluatedAt: '', recommendation: '', rating: null, appType: 'Original', currentPosition: '',
  ...overrides,
});

const renderModal = (rows: CandidateRow[]) =>
  render(
    <CandidateListModal kpi="pending" rows={rows} departments={[]} todayKey="2026-10-30"
      onClose={vi.fn()} onEvaluate={vi.fn()} onView={vi.fn()} />,
  );

const rowFor = (name: string) => screen.getByText(name).closest('tr')!;

describe('CandidateListModal applicant type', () => {
  it('tags a promotional applicant and shows the position they hold now', () => {
    renderModal([
      row({ id: 'p', name: 'Paula Promoted', appType: 'Promotional', currentPosition: 'City Accountant I' }),
      row({ id: 'o', name: 'Oscar Original' }),
    ]);

    const promoted = within(rowFor('Paula Promoted'));
    expect(promoted.getByText('Promotional').className).toContain('badge-tint');
    expect(promoted.getByText('From: City Accountant I')).toBeTruthy();

    const original = within(rowFor('Oscar Original'));
    expect(original.queryByText('Promotional')).toBeNull();
    expect(original.queryByText(/^From:/)).toBeNull();
  });
});
