import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CompetencyFrameworkPage } from './CompetencyFrameworkPageView';

describe('CompetencyFrameworkPage', () => {
  it('lands on Competency Management with its two subtabs', () => {
    render(
      <MemoryRouter>
        <CompetencyFrameworkPage />
      </MemoryRouter>
    );

    // The redundant AI "Competency Gap Report" surface is gone; the module now
    // opens straight into Competency Management (Position Requirements + Map).
    expect(screen.queryByText('Competency Gap Report')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Position Requirements/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Competency Map/i })).toBeInTheDocument();
  });
});
