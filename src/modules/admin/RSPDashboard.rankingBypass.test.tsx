import fs from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const { hireApplicantMock } = vi.hoisted(() => ({ hireApplicantMock: vi.fn() }));

vi.mock('../../lib/api/employeesApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api/employeesApi')>()),
  hireApplicant: hireApplicantMock,
}));
vi.mock('../../components/AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('../../components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./RspDashboardOverview', () => ({ RspDashboardOverview: () => null }));
vi.mock('../../components/QualifiedApplicantsSection', () => ({ QualifiedApplicantsSection: () => null }));
vi.mock('./rsp-archives', () => ({ RspArchives: () => <div>archives</div> }));
vi.mock('../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
const NO_DEPARTMENTS: string[] = [];
vi.mock('../../hooks/useDepartmentOptions', () => ({
  useDepartmentNames: () => NO_DEPARTMENTS,
  useDepartmentOptions: () => NO_DEPARTMENTS,
}));
vi.mock('../../lib/supabase', async () => {
  const { supabaseStub } = await import('../../test/supabaseStub');
  return {
    isMockModeEnabled: false,
    supabase: supabaseStub(() => []),
  };
});

import { RSPDashboard } from './RSPDashboard';

describe('RSPDashboard Ranking Report direct-hire bypass removal', () => {
  it('replaces the unreserved Ranking Report hire modal bypass with /admin/rsp/for-hiring navigation', () => {
    const source = fs.readFileSync(path.resolve(__dirname, './RSPDashboard.tsx'), 'utf8');

    expect(source).toContain("navigate('/admin/rsp/for-hiring')");
    expect(source).not.toContain('showHireApplicantsModal');
    expect(source).not.toContain('handleConfirmHireApplicants');
    expect(source).not.toMatch(/import\s*\{[^}]*\bhireApplicant\b[^}]*\}\s*from/);
  });

  it('renders /admin/rsp/reports without invoking hireApplicant or rendering the direct-hire modal', () => {
    const view = render(
      <MemoryRouter initialEntries={['/admin/rsp/reports']}>
        <Routes>
          <Route path="/admin/rsp/reports" element={<RSPDashboard />} />
          <Route path="/admin/rsp/for-hiring" element={<div>For Hiring</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(view.queryByText('Select Applicants to Hire')).not.toBeInTheDocument();
    expect(hireApplicantMock).not.toHaveBeenCalled();
  });
});
