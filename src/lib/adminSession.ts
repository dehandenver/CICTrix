/**
 * The signed-in admin's session — the single place that reads or writes it.
 *
 * Stored in sessionStorage, NOT localStorage. localStorage is shared by every
 * tab in the browser, so signing into a second role in another tab overwrote
 * the first: an RSP tab would silently become PM (and vice versa) the moment the
 * other tab logged in, because a cross-tab `storage` event re-rendered it and
 * its components re-read the overwritten key. sessionStorage is scoped to one
 * tab, so each tab keeps the identity it signed in with.
 *
 * Trade-off, and it's deliberate: a brand-new tab starts signed out. That's the
 * price of being able to hold two roles open side by side, which is exactly what
 * this system is used for.
 */

export type AdminRole = 'super-admin' | 'rsp' | 'lnd' | 'pm';

export interface AdminSession {
  email: string;
  role: AdminRole;
}

const ADMIN_SESSION_KEY = 'cictrix_admin_session';

/**
 * Raw session for this tab. Callers that only need the email/role can use the
 * helpers below.
 *
 * A session left in localStorage by the previous (shared) scheme is adopted once
 * so this change doesn't sign everyone out mid-session, then removed so it can
 * never leak into another tab again.
 */
export const readAdminSession = (): { email?: string; role?: string } | null => {
  try {
    let raw = sessionStorage.getItem(ADMIN_SESSION_KEY);

    if (!raw) {
      const legacy = localStorage.getItem(ADMIN_SESSION_KEY);
      if (legacy) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, legacy);
        localStorage.removeItem(ADMIN_SESSION_KEY);
        raw = legacy;
      }
    }

    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const writeAdminSession = (session: AdminSession): void => {
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable (private mode); the in-memory session still works
    // for this page view.
  }
};

/** Clears both stores — the legacy localStorage copy included. */
export const clearAdminSession = (): void => {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // ignore
  }
};

/** Identifier (email) of the signed-in admin, for audit/attribution fields. */
export const getAdminEmail = (fallback = 'super-admin'): string => {
  const session = readAdminSession();
  return session?.email || fallback;
};

export const getAdminRole = (): string | null => {
  const session = readAdminSession();
  return session?.role ?? null;
};
