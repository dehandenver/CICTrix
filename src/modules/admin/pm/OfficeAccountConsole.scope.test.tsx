import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listPendingApprovals } from '../../../lib/api/ipcrApproval';

vi.mock('../../../lib/supabase', async () => {
  const { supabaseStub } = await import('../../../test/supabaseStub');
  return { supabase: supabaseStub() };
});
vi.mock('../../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
vi.mock('../../../components/portal-header', () => ({ PortalHeader: () => null }));
vi.mock('./Phase2RatingPanel', () => ({ Phase2RatingPanel: () => null }));
vi.mock('../../../lib/employeeSession', () => ({
  readEmployeeSession: () => ({ employeeId: 'e9', fullName: 'Dept Head' }),
}));
vi.mock('../../../lib/api/officeRoles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/officeRoles')>()),
  resolveEmployeeId: vi.fn().mockResolvedValue('e9'),
  getActiveOfficeRole: vi.fn().mockResolvedValue({
    officeId: 'o1',
    officeName: 'Budget Office',
    role: 'Department Head',
  }),
}));
vi.mock('../../../lib/api/ipcrApproval', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/ipcrApproval')>()),
  listPendingApprovals: vi.fn().mockResolvedValue({ ok: true, data: [] }),
}));

import { OfficeAccountConsole } from './OfficeAccountConsole';

describe('OfficeAccountConsole initial office scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the resolved office scope on initial load and never calls listPendingApprovals(null)', async () => {
    render(
      <MemoryRouter>
        <OfficeAccountConsole />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(listPendingApprovals).toHaveBeenCalledWith({
        officeId: 'o1',
        officeName: 'Budget Office',
      });
    });

    for (const [arg] of vi.mocked(listPendingApprovals).mock.calls) {
      expect(arg).not.toBeNull();
      expect(arg).toEqual({ officeId: 'o1', officeName: 'Budget Office' });
    }
  });
});
