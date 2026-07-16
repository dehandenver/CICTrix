/**
 * IPCR Demo — session persistence.
 *
 * The demo has its own login (against the `accounts` table) that is fully
 * separate from the app's admin/employee/interviewer sessions. A logged-in demo
 * account is kept in localStorage under a dedicated key so a page refresh during
 * the presentation doesn't drop you.
 */

import type { DemoAccount } from './types';

const KEY = 'cictrix.pmDemo.session';

export function loadDemoSession(): DemoAccount | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoAccount;
  } catch {
    return null;
  }
}

export function saveDemoSession(account: DemoAccount): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(account));
  } catch {
    /* ignore quota/availability errors in the demo */
  }
}

export function clearDemoSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
