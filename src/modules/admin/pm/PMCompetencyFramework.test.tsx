import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PMCompetencyFramework } from './PMCompetencyFramework';

vi.mock('../../../lib/api/pmCompetency', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/pmCompetency')>();
  const requirement = {
    id: 'r1',
    position_title: 'Administrative Aide',
    competency_id: 1,
    proficiency_level: 'Intermediate' as const,
    updated_by: null,
    updated_at: '2026-10-01',
  };
  return {
    ...actual,
    listCompetencyStandards: vi.fn(async () => ({
      ok: true,
      data: [
        { id: 1, competency_name: 'Public Communication Skills', training_stream: 'TECHNICAL' },
        { id: 2, competency_name: 'Digital Literacy for Government Services', training_stream: 'TECHNICAL' },
      ],
    })),
    listPositions: vi.fn(async () => ({ ok: true, data: ['Administrative Aide'] })),
    listAllRequirements: vi.fn(async () => ({ ok: true, data: [requirement] })),
    listPositionDepartments: vi.fn(async () => ({ ok: true, data: {} })),
    listRequirementsForPosition: vi.fn(async () => ({ ok: true, data: [requirement] })),
  };
});

describe('PMCompetencyFramework · Position Requirements', () => {
  it('shows Required as one labelled icon, and keeps the counter and level column', async () => {
    render(<PMCompetencyFramework />);

    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Administrative Aide' }));

    const requiredRow = (await screen.findByText('Public Communication Skills')).closest('tr')!;
    const optionalRow = screen.getByText('Digital Literacy for Government Services').closest('tr')!;

    // One representation only: the icon, named for assistive tech, no Yes/No word.
    expect(within(requiredRow).getByRole('img', { name: 'Required' })).toBeInTheDocument();
    expect(within(optionalRow).getByRole('img', { name: 'Not required' })).toBeInTheDocument();
    // Hover tooltip comes from the SVG <title>.
    expect(requiredRow.querySelector('svg title')?.textContent).toBe('Required');
    expect(optionalRow.querySelector('svg title')?.textContent).toBe('Not required');
    expect(screen.queryByText(/✅|❌/)).not.toBeInTheDocument();
    expect(within(requiredRow).queryByText('Yes')).not.toBeInTheDocument();
    expect(within(optionalRow).queryByText('No')).not.toBeInTheDocument();

    // Counter and Proficiency Level column are unaffected.
    expect(screen.getByText(/competencies required for this position/)).toHaveTextContent('1 of 2 competencies required');
    expect(within(requiredRow).getByRole('combobox')).toHaveValue('Intermediate');
    expect(within(optionalRow).getByText('—')).toBeInTheDocument();
    expect(within(optionalRow).getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});
