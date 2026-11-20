import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEmployeePortalAccountByEmployeeNumber: vi.fn(),
  changeEmployeePortalPassword: vi.fn(),
}));

vi.mock('../../lib/employeePortalData', () => ({
  getEmployeePortalAccountByEmployeeNumber: (...args: unknown[]) =>
    mocks.getEmployeePortalAccountByEmployeeNumber(...args),
  changeEmployeePortalPassword: (...args: unknown[]) =>
    mocks.changeEmployeePortalPassword(...args),
}));

import { SetInitialPasswordPage } from './SetInitialPasswordPage';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const fillForm = (temp = 'Temp#1234', next = 'NewValid#123', confirm = 'NewValid#123') => {
  const inputs = document.querySelectorAll('input');
  fireEvent.change(inputs[0], { target: { value: temp } });
  fireEvent.change(inputs[1], { target: { value: next } });
  fireEvent.change(inputs[2], { target: { value: confirm } });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.getEmployeePortalAccountByEmployeeNumber.mockResolvedValue({
    ok: true,
    account: {
      id: 'portal-EMP-2026-001',
      username: 'EMP-2026-001',
      mustChangePassword: true,
      updatedAt: '2026-11-20T08:00:00.123456+00:00',
      employee: {
        employeeId: 'EMP-2026-001',
        fullName: 'Maria Santos',
        email: 'maria@example.gov.ph',
      },
    },
  });
});

afterEach(() => {
  cleanup();
});

describe('SetInitialPasswordPage (Credential Task 3)', () => {
  it('resolves remote account by employeeNumber, serializes duplicate submits, and calls onDone only after confirmed success', async () => {
    const onDone = vi.fn();
    const pending = deferred<any>();
    mocks.changeEmployeePortalPassword.mockReturnValueOnce(pending.promise);

    render(
      <SetInitialPasswordPage
        {...({ employeeNumber: 'EMP-2026-001' } as any)}
        username="EMP-2026-001"
        fullName="Maria Santos"
        onDone={onDone}
      />,
    );

    fillForm();
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mocks.getEmployeePortalAccountByEmployeeNumber).toHaveBeenCalledTimes(1);
    });
    expect(mocks.getEmployeePortalAccountByEmployeeNumber).toHaveBeenCalledWith('EMP-2026-001');
    expect(mocks.changeEmployeePortalPassword).toHaveBeenCalledTimes(1);
    expect(mocks.changeEmployeePortalPassword).toHaveBeenCalledWith(
      {
        accountId: 'portal-EMP-2026-001',
        employeeNumber: 'EMP-2026-001',
        expectedRevision: '2026-11-20T08:00:00.123456+00:00',
      },
      'Temp#1234',
      'NewValid#123',
    );
    expect(onDone).not.toHaveBeenCalled();

    pending.resolve({
      ok: true,
      account: {
        id: 'portal-EMP-2026-001',
        username: 'EMP-2026-001',
        mustChangePassword: false,
        updatedAt: '2026-11-20T08:01:00.000000+00:00',
        employee: { employeeId: 'EMP-2026-001', fullName: 'Maria Santos', email: 'maria@example.gov.ph' },
      },
    });

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it('never calls onDone on rejected or unconfirmed password changes and surfaces the error', async () => {
    const onDone = vi.fn();
    mocks.changeEmployeePortalPassword.mockResolvedValueOnce({
      ok: false,
      kind: 'unconfirmed',
      error: 'We could not confirm whether your password change completed. Try signing in or check again.',
    });

    render(
      <SetInitialPasswordPage
        {...({ employeeNumber: 'EMP-2026-001' } as any)}
        username="EMP-2026-001"
        fullName="Maria Santos"
        onDone={onDone}
      />,
    );

    fillForm();
    fireEvent.submit(document.querySelector('form')!);

    expect(
      await screen.findByText(/could not confirm whether your password change completed/i),
    ).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('ignores late completion after unmount or employeeNumber switch', async () => {
    const onDone = vi.fn();
    const pending = deferred<any>();
    mocks.changeEmployeePortalPassword.mockReturnValueOnce(pending.promise);

    const { rerender, unmount } = render(
      <SetInitialPasswordPage
        employeeNumber="EMP-2026-001"
        username="EMP-2026-001"
        fullName="Maria Santos"
        onDone={onDone}
      />,
    );

    fillForm();
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => {
      expect(mocks.changeEmployeePortalPassword).toHaveBeenCalledTimes(1);
    });

    // Switch employeeNumber before save resolves
    rerender(
      <SetInitialPasswordPage
        employeeNumber="EMP-2026-002"
        username="EMP-2026-002"
        fullName="Juan Dela Cruz"
        onDone={onDone}
      />,
    );

    pending.resolve({
      ok: true,
      account: {
        id: 'portal-EMP-2026-001',
        username: 'EMP-2026-001',
        mustChangePassword: false,
        updatedAt: '2026-11-20T08:01:00.000000+00:00',
        employee: { employeeId: 'EMP-2026-001', fullName: 'Maria Santos', email: 'maria@example.gov.ph' },
      },
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(onDone).not.toHaveBeenCalled();
    unmount();
  });
});
