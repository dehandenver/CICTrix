import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CompetencyFrameworkPage } from './CompetencyFrameworkPageView';

describe('CompetencyFrameworkPage', () => {
  it('renders the PM competency dashboard sections', () => {
    render(
      <MemoryRouter>
        <CompetencyFrameworkPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Competency Gap Report')).toBeInTheDocument();
    expect(screen.getByText('Competency Management')).toBeInTheDocument();
  });
});
