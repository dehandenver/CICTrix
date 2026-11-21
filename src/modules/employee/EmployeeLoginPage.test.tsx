import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readEmployeeSession } from '../../lib/employeeSession';
import { EmployeeLoginPage } from './EmployeeLoginPage';

vi.mock('../../lib/employeeSession', () => ({ readEmployeeSession: vi.fn() }));

const fillCredentials = (username = 'maria.santos', password = 'test-password') => {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
};

const submitForm = () => {
  fireEvent.submit(screen.getByLabelText('Username').closest('form')!);
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

// Authored CSS contracts only; the coordinator verifies the actual browser cascade.
const pageRule = (selector: string) => {
  const rule = Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .find((candidate): candidate is CSSStyleRule =>
      candidate instanceof CSSStyleRule && candidate.selectorText === selector);
  expect(rule, `Missing page rule: ${selector}`).toBeDefined();
  return rule!.style;
};

describe('EmployeeLoginPage', () => {
  beforeEach(() => {
    vi.mocked(readEmployeeSession).mockReset().mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('uses the shared large primary button inside the design-system scope', () => {
    render(<EmployeeLoginPage onLogin={vi.fn()} />);
    const button = screen.getByRole('button', { name: /sign in/i });
    expect(button).toHaveClass('btn', 'btn-primary', 'btn-lg', 'w-full');
    expect(button.closest('.abyan-ds')).not.toBeNull();
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('labels the primary action exactly Sign in', () => {
    render(<EmployeeLoginPage onLogin={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('authors a scoped primary700 hover fill that excludes disabled submits', () => {
    render(<EmployeeLoginPage onLogin={vi.fn()} />);
    const hover = pageRule('.abyan-ds.employee-login .btn-primary:hover:not(:disabled)');
    expect(hover.getPropertyValue('background')).toBe('var(--color-primary-700)');
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toHaveAttribute('style');
  });

  it('authors gradient and white loading overrides without selecting idle disabled submits', () => {
    const onLogin = vi.fn();
    const { rerender } = render(<EmployeeLoginPage onLogin={onLogin} isLoading />);
    const selector = '.abyan-ds.employee-login .btn-primary.is-loading';
    const loading = pageRule(selector);
    expect(loading.getPropertyValue('background')).toBe('var(--gradient-button)');
    expect(loading.getPropertyValue('color')).toBe('var(--color-white)');
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeDisabled();
    expect(button.matches(selector)).toBe(true);
    expect(button).toHaveAttribute('aria-busy', 'true');
    rerender(<EmployeeLoginPage onLogin={onLogin} />);
    expect(button.matches(selector)).toBe(false);
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('style');
  });

  it('backs the existing mobile mark with brand color in its 32px footprint', () => {
    render(<EmployeeLoginPage onLogin={vi.fn()} />);
    const mark = screen.getByRole('img', { name: 'Abyan' });
    expect(mark).toHaveClass('h-8', 'w-8', 'bg-[var(--color-primary)]', 'rounded-[var(--radius-md)]');
  });

  it('exposes username and current-password autocomplete to password managers', () => {
    render(<EmployeeLoginPage onLogin={vi.fn()} />);
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Username')).not.toHaveAttribute('aria-describedby');
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-describedby');
  });

  it('gives both password-toggle states a 36px target and 20px icon', () => {
    render(<EmployeeLoginPage onLogin={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveClass('h-9', 'w-9', 'right-1');
    expect(toggle.querySelector('svg')).toHaveAttribute('width', '20');
    expect(toggle.querySelector('svg')).toHaveAttribute('height', '20');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide password' })).toBe(toggle);
    expect(toggle.querySelector('svg')).toHaveAttribute('width', '20');
    expect(toggle.querySelector('svg')).toHaveAttribute('height', '20');
  });

  it('shows and hides the entered password without submitting', () => {
    const onLogin = vi.fn();
    render(<EmployeeLoginPage onLogin={onLogin} />);
    fillCredentials();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('test-password');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(onLogin).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('rejects a blank username (%j) without authenticating', (username) => {
    const onLogin = vi.fn();
    render(<EmployeeLoginPage onLogin={onLogin} />);
    fillCredentials(username);
    submitForm();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your employee ID or username.');
    expect(screen.getByLabelText('Username')).toHaveAccessibleDescription(/Enter your employee ID or username/);
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/Enter your employee ID or username/);
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('rejects an empty password without authenticating', () => {
    const onLogin = vi.fn();
    render(<EmployeeLoginPage onLogin={onLogin} />);
    fillCredentials('maria.santos', '');
    submitForm();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your password.');
    expect(screen.getByLabelText('Username')).toHaveAccessibleDescription(/Enter your password/);
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/Enter your password/);
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('passes the entered credentials unchanged and releases loading without a session', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<EmployeeLoginPage onLogin={onLogin} />);
    fillCredentials(' maria.santos ', ' test-password ');
    submitForm();
    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled());
    expect(onLogin).toHaveBeenCalledExactlyOnceWith(' maria.santos ', ' test-password ');
    expect(readEmployeeSession).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Username')).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the action label and disables all sign-in controls while the callback is pending', async () => {
    const pending = deferred();
    render(<EmployeeLoginPage onLogin={() => pending.promise} />);
    fillCredentials();
    submitForm();
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveClass('is-loading');
    expect(screen.getByLabelText('Username')).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
    await act(async () => { pending.resolve(); });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('ignores repeated form submits before the callback settles', async () => {
    const pending = deferred();
    const onLogin = vi.fn(() => pending.promise);
    render(<EmployeeLoginPage onLogin={onLogin} />);
    fillCredentials();
    act(() => {
      submitForm();
      submitForm();
    });
    expect(onLogin).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(); });
  });

  it('disables controls and rejects form submission during external loading', () => {
    const onLogin = vi.fn();
    const { rerender } = render(<EmployeeLoginPage onLogin={onLogin} />);
    fillCredentials();
    rerender(<EmployeeLoginPage onLogin={onLogin} isLoading />);
    const button = screen.getByRole('button', { name: /sign in/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Username')).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
    submitForm();
    expect(onLogin).not.toHaveBeenCalled();
    rerender(<EmployeeLoginPage onLogin={onLogin} />);
    expect(button).toBeEnabled();
  });

  it('shows credential-specific recovery and clears it when credentials change', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onLogin = vi.fn().mockRejectedValue(new Error('Invalid username or password'));
    render(<EmployeeLoginPage onLogin={onLogin} />);
    fillCredentials();
    submitForm();
    expect(await screen.findByRole('alert')).toHaveTextContent("That username and password don't match an account.");
    expect(screen.getByRole('alert')).toHaveTextContent('temporary password');
    expect(screen.getByLabelText('Username')).toHaveAccessibleDescription(/don't match an account/);
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/temporary password/);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'corrected-test-password' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Username')).not.toHaveAttribute('aria-describedby');
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-describedby');
    expect(readEmployeeSession).not.toHaveBeenCalled();
  });

  it('shows network recovery, preserves credentials and permits a successful retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onLogin = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(undefined);
    render(<EmployeeLoginPage onLogin={onLogin} />);
    fillCredentials();
    submitForm();
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't confirm whether it completed");
    expect(screen.getByRole('alert')).toHaveTextContent('Check your connection');
    expect(screen.getByLabelText('Username')).toHaveAccessibleDescription(/Check your connection/);
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/Check your connection/);
    expect(screen.getByLabelText('Username')).toHaveValue('maria.santos');
    expect(screen.getByLabelText('Password')).toHaveValue('test-password');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled());
    expect(onLogin).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Username')).not.toHaveAttribute('aria-describedby');
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-describedby');
  });

  it('retains loading after success when a session exists for the parent to navigate', async () => {
    vi.mocked(readEmployeeSession).mockReturnValue({
      employeeId: 'EMP-TEST-001',
      email: 'maria.santos@example.test',
      fullName: 'Maria Santos',
      loginUsername: 'maria.santos',
      mustChangePassword: true,
    });
    render(<EmployeeLoginPage onLogin={vi.fn().mockResolvedValue(undefined)} />);
    fillCredentials();
    submitForm();
    await waitFor(() => expect(readEmployeeSession).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /sign in/i })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Username')).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('accepts a synchronous login callback without leaving the form busy when no session exists', async () => {
    render(<EmployeeLoginPage onLogin={() => undefined} />);
    fillCredentials();
    submitForm();
    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled());
    expect(readEmployeeSession).toHaveBeenCalledOnce();
  });

  it('distinguishes lookup_unavailable from invalid credentials and advises retrying', async () => {
    const unavailableErr = Object.assign(new Error('Lookup unavailable'), {
      kind: 'lookup_unavailable',
    });
    const onLogin = vi.fn().mockRejectedValue(unavailableErr);
    render(<EmployeeLoginPage onLogin={onLogin} />);
    fillCredentials();
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent("That username and password don't match an account.");
    expect(alert.textContent).toMatch(/reach the employee sign-in service|Check your connection/i);
  });

  it('distinguishes ambiguous_account with contact-HR guidance without exposing counts', async () => {
    const ambiguousErr = Object.assign(new Error('Ambiguous account'), {
      kind: 'ambiguous_account',
    });
    const onLogin = vi.fn().mockRejectedValue(ambiguousErr);
    render(<EmployeeLoginPage onLogin={onLogin} />);
    fillCredentials();
    submitForm();

    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent("That username and password don't match an account.");
    expect(alert.textContent).toMatch(/contact hr/i);
    expect(alert.textContent).not.toMatch(/\b(2|two|multiple|count|duplicates)\b/i);
  });
});
