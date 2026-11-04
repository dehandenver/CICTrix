import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const POSITIONS = Array.from({ length: 197 }, (_, i) => `Position ${String(i + 1).padStart(3, '0')}`);

vi.mock('../../../lib/api/pmCompetency', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/pmCompetency')>()),
  listCompetencyStandards: vi.fn(async () => ({ ok: true, data: [] })),
  listPositions: vi.fn(async () => ({ ok: true, data: POSITIONS })),
  listAllRequirements: vi.fn(async () => ({ ok: true, data: [] })),
  listPositionDepartments: vi.fn(async () => ({ ok: true, data: {} })),
}));

import { PMCompetencyFramework } from './PMCompetencyFramework';

const openPositionList = async () => {
  render(<PMCompetencyFramework />);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  await within(await screen.findByRole('listbox')).findByRole('option', { name: 'Position 197' });
  return input;
};

describe('PMCompetencyFramework position search', () => {
  it('lists every position when the search is empty', async () => {
    await openPositionList();

    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(POSITIONS.length);
  });

  it('keeps every match when a search matches more than 50 positions', async () => {
    const input = await openPositionList();

    // Padded numbers, so this matches Position 100 through Position 197.
    fireEvent.change(input, { target: { value: 'Position 1' } });

    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(98);
  });
});
