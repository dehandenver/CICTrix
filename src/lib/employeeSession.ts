/**
 * The signed-in employee's portal session — the single place that reads or
 * writes it.
 *
 * Stored in sessionStorage, NOT localStorage, for the same reason
 * `adminSession.ts` is: localStorage is shared by every tab in the browser, so
 * signing a second employee in from another tab overwrote the first. The
 * original tab then silently became the second employee — showing their IPCR,
 * their documents, and attributing anything saved to the wrong person.
 * sessionStorage is scoped to one tab, so each tab keeps the identity it signed
 * in with.
 *
 * Trade-off, and it's deliberate: a brand-new tab starts signed out. That's the
 * price of being able to hold two employee portals open side by side, which is
 * exactly what this system is used for during testing and demos.
 */

import type { EmployeeSession } from '../types/employee.types';

const EMPLOYEE_SESSION_KEY = 'cictrix_employee_session';

/**
 * The session for this tab.
 *
 * A session left in localStorage by the previous (shared) scheme is adopted
 * once so this change doesn't sign everyone out mid-session, then removed so it
 * can never leak into another tab again.
 */
export const readEmployeeSession = (): EmployeeSession | null => {
  try {
    let raw = sessionStorage.getItem(EMPLOYEE_SESSION_KEY);

    if (!raw) {
      const legacy = localStorage.getItem(EMPLOYEE_SESSION_KEY);
      if (legacy) {
        sessionStorage.setItem(EMPLOYEE_SESSION_KEY, legacy);
        localStorage.removeItem(EMPLOYEE_SESSION_KEY);
        raw = legacy;
      }
    }

    if (!raw) return null;

    const parsed = JSON.parse(raw) as EmployeeSession;
    if (!parsed?.employeeId) {
      clearEmployeeSession();
      return null;
    }
    return parsed;
  } catch {
    clearEmployeeSession();
    return null;
  }
};

export const writeEmployeeSession = (session: EmployeeSession): void => {
  try {
    sessionStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable (private mode); the in-memory session still works
    // for this page view.
  }
};

/** Clears both stores — the legacy localStorage copy included. */
export const clearEmployeeSession = (): void => {
  try {
    sessionStorage.removeItem(EMPLOYEE_SESSION_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(EMPLOYEE_SESSION_KEY);
  } catch {
    // ignore
  }
};
