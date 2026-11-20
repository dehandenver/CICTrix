import { Employee } from '../types/employee.types';
import { supabase } from './supabase';

export interface EmployeePortalAccount {
  id: string;
  username: string;
  password: string;
  employee: Employee;
  createdAt: string;
  updatedAt: string;
  // True for accounts created via the hire flow — employee must set their own
  // password before accessing any module. Cleared after the first successful
  // password change.
  mustChangePassword?: boolean;
}

export type PortalAccountIdentity = Pick<
  EmployeePortalAccount,
  'id' | 'username' | 'employee' | 'updatedAt'
> & { mustChangePassword: boolean };

export type PortalAccountFailureKind =
  | 'invalid_credentials'
  | 'not_found'
  | 'ambiguous_account'
  | 'lookup_unavailable';

export type PortalAccountResult =
  | { ok: true; account: PortalAccountIdentity }
  | { ok: false; kind: PortalAccountFailureKind };

export type PortalAccountListResult =
  | { ok: true; accounts: PortalAccountIdentity[] }
  | { ok: false; kind: 'ambiguous_account' | 'lookup_unavailable' };

export class EmployeePortalLoginError extends Error {
  readonly kind: PortalAccountFailureKind;

  constructor(kind: PortalAccountFailureKind, message?: string) {
    super(
      message ??
        (kind === 'invalid_credentials' || kind === 'not_found'
          ? 'Invalid username or password.'
          : kind === 'ambiguous_account'
            ? 'Multiple portal accounts matched this username.'
            : 'Employee portal sign-in is temporarily unavailable.'),
    );
    this.name = 'EmployeePortalLoginError';
    this.kind = kind;
  }
}

const EMPLOYEE_PORTAL_ACCOUNTS_KEY = 'cictrix_employee_portal_accounts';

const METADATA_PROJECTION =
  'id, username, employee_id, full_name, email, mobile_number, created_at, updated_at, deleted_at, must_change_password';
const AUTH_PROJECTION =
  'id, username, password, employee_id, full_name, email, mobile_number, created_at, updated_at, deleted_at, must_change_password';

// Supabase row shape for employee_portal_accounts. See migration
// backend/database/migrations/008_create_employee_portal_accounts.sql and
// supabase/migrations/20261120195500_employee_portal_account_integrity.sql.
interface PortalAccountRow {
  id: string;
  username: string;
  password?: string;
  employee_id: string | null;
  full_name: string | null;
  email: string | null;
  mobile_number: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  must_change_password?: boolean | null;
}

const portalAccountEmployeeFromRow = (row: PortalAccountRow): Employee =>
  ({
    employeeId: String(row.employee_id ?? ''),
    fullName: String(row.full_name ?? ''),
    email: String(row.email ?? ''),
    mobileNumber: String(row.mobile_number ?? ''),
    dateOfBirth: '',
    age: 0,
    gender: 'Other',
    civilStatus: 'Single',
    nationality: '',
    homeAddress: '',
    emergencyContactName: '',
    emergencyRelationship: '',
    emergencyContactNumber: '',
    sssNumber: '',
    philhealthNumber: '',
    pagibigNumber: '',
    tinNumber: '',
  }) as Employee;

const portalAccountFromRow = (row: PortalAccountRow): EmployeePortalAccount => ({
  id: row.id,
  username: row.username,
  password: String(row.password ?? ''),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ...(typeof row.must_change_password === 'boolean'
    ? { mustChangePassword: row.must_change_password }
    : {}),
  employee: portalAccountEmployeeFromRow(row),
});

const portalAccountIdentityFromRow = (row: PortalAccountRow): PortalAccountIdentity | null => {
  const id = String(row?.id ?? '').trim();
  const username = String(row?.username ?? '').trim();
  // Preserve updated_at as the opaque raw string from Postgres (never round-trip through Date).
  const updatedAt = typeof row?.updated_at === 'string' ? row.updated_at : String(row?.updated_at ?? '');
  if (!id || !username || !updatedAt.trim() || typeof row?.must_change_password !== 'boolean') {
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    updatedAt,
    mustChangePassword: row.must_change_password,
    employee: portalAccountEmployeeFromRow(row),
  };
};

const upsertPortalAccountToSupabase = async (account: EmployeePortalAccount): Promise<{ ok: boolean; error?: unknown }> => {
  try {
    const { error } = await (supabase as any)
      .from('employee_portal_accounts')
      .upsert(
        [
          {
            id: account.id,
            username: account.username,
            password: account.password,
            employee_id: account.employee?.employeeId ?? null,
            full_name: account.employee?.fullName ?? null,
            email: account.employee?.email ?? null,
            mobile_number: account.employee?.mobileNumber ?? null,
            updated_at: account.updatedAt,
          },
        ],
        { onConflict: 'id' },
      );
    if (error) {
      console.error('[employeePortalData] Supabase upsert failed:', error);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    console.error('[employeePortalData] Supabase upsert threw:', err);
    return { ok: false, error: err };
  }
};

// Async lookup against Supabase — the durable source of truth so credentials
// generated on an RSP browser can be used by the employee on any browser.
export const findEmployeePortalAccountFromSupabase = async (
  username: string,
  password?: string,
): Promise<EmployeePortalAccount | null> => {
  const usernameKey = String(username ?? '').trim().toLowerCase();
  if (!usernameKey) return null;

  try {
    const { data, error } = await (supabase as any)
      .from('employee_portal_accounts')
      .select('*')
      .ilike('username', usernameKey);
    if (error) {
      console.error('[employeePortalData] Supabase find failed:', error);
      return null;
    }
    const rows = Array.isArray(data) ? (data as PortalAccountRow[]) : [];
    const matched = rows.find((row) => String(row.username ?? '').trim().toLowerCase() === usernameKey);
    if (!matched) return null;
    if (typeof password === 'string' && matched.password !== password) return null;
    return portalAccountFromRow(matched);
  } catch (err) {
    console.error('[employeePortalData] Supabase find threw:', err);
    return null;
  }
};

export const findEmployeePortalAccountFromSupabaseByEmployeeIdOrEmail = async (
  employeeId?: string,
  email?: string,
): Promise<EmployeePortalAccount | null> => {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const normalizedId = String(employeeId ?? '').trim();
  if (!normalizedEmail && !normalizedId) return null;

  try {
    const filters = [];
    if (normalizedEmail) filters.push(`email.ilike.${normalizedEmail}`);
    if (normalizedId) filters.push(`employee_id.eq.${normalizedId}`);

    const { data, error } = await (supabase as any)
      .from('employee_portal_accounts')
      .select('*')
      .or(filters.join(','));

    if (error) {
      console.error('[employeePortalData] Supabase find by employeeId/email failed:', error);
      return null;
    }

    const rows = Array.isArray(data) ? (data as PortalAccountRow[]) : [];
    const matched = rows.find((row) =>
      (normalizedEmail && String(row.email ?? '').trim().toLowerCase() === normalizedEmail) ||
      (normalizedId && String(row.employee_id ?? '').trim() === normalizedId)
    );
    return matched ? portalAccountFromRow(matched) : null;
  } catch (err) {
    console.error('[employeePortalData] Supabase find by employeeId/email threw:', err);
    return null;
  }
};

/** Why a promotional login could not be resolved. */
export const PROMOTIONAL_AUTH_ERROR = {
  INVALID_CREDENTIALS: 'invalid_credentials',
  AMBIGUOUS_ACCOUNT: 'ambiguous_account',
  MISSING_EMPLOYEE_NUMBER: 'missing_employee_number',
  LOOKUP_UNAVAILABLE: 'lookup_unavailable',
} as const;

// PostgREST's `ilike` accepts `*` as a wildcard alias for SQL `%`, and SQL
// itself treats `_` as a single-character wildcard. These identifiers are not
// legitimate portal usernames/employee numbers, so reject them before a remote
// read rather than letting them broaden a sensitive account lookup.
const UNSUPPORTED_IDENTIFIER_WILDCARDS = /[%*\\]/;

const escapeIlikeLiteral = (value: string) => value.replace(/_/g, '\\_');

const logSanitizedPortalLookupWarning = (context: string, err: unknown) => {
  const lookupError = err as { code?: unknown; message?: unknown } | null;
  console.warn(`[employeePortalData] ${context}:`, {
    code: lookupError?.code ?? null,
    message: typeof lookupError?.message === 'string' ? lookupError.message : 'remote read failed',
  });
};

/**
 * Authoritative remote-only employee portal sign-in.
 *
 * Trims and case-folds username, compares password verbatim without trimming or
 * case-folding, escapes literal underscores, rejects wildcard inputs before
 * querying, and never falls back to browser storage or DEMO_ACCOUNT.
 */
export const authenticateEmployeePortalAccount = async (
  username: string,
  password: string,
): Promise<PortalAccountResult> => {
  const usernameKey = String(username ?? '').trim().toLowerCase();
  if (
    !usernameKey ||
    typeof password !== 'string' ||
    password.length === 0 ||
    UNSUPPORTED_IDENTIFIER_WILDCARDS.test(usernameKey)
  ) {
    return { ok: false, kind: 'invalid_credentials' };
  }

  try {
    const { data, error } = await (supabase as any)
      .from('employee_portal_accounts')
      .select(AUTH_PROJECTION)
      .is('deleted_at', null)
      .ilike('username', escapeIlikeLiteral(usernameKey));

    if (error) throw error;

    const rows = Array.isArray(data) ? (data as PortalAccountRow[]) : [];
    const activeMatches = rows.filter(
      (row) =>
        row.deleted_at == null &&
        String(row.username ?? '').trim().toLowerCase() === usernameKey,
    );

    if (activeMatches.length === 0) {
      return { ok: false, kind: 'invalid_credentials' };
    }
    if (activeMatches.length > 1) {
      return { ok: false, kind: 'ambiguous_account' };
    }

    const [matched] = activeMatches;
    const identity = portalAccountIdentityFromRow(matched);
    if (!identity) {
      logSanitizedPortalLookupWarning(
        'Portal credential lookup missing required identity or must_change_password schema',
        { code: 'SCHEMA_MISMATCH', message: 'missing boolean must_change_password or revision' },
      );
      return { ok: false, kind: 'lookup_unavailable' };
    }

    if (typeof matched.password !== 'string' || matched.password !== password) {
      return { ok: false, kind: 'invalid_credentials' };
    }

    return { ok: true, account: identity };
  } catch (err) {
    logSanitizedPortalLookupWarning('Portal credential lookup unavailable', err);
    return { ok: false, kind: 'lookup_unavailable' };
  }
};

/**
 * Checked remote metadata lookup by canonical employee number.
 * Uses METADATA_PROJECTION so the password column is never selected.
 */
export const getEmployeePortalAccountByEmployeeNumber = async (
  employeeNumber: string,
): Promise<PortalAccountResult> => {
  const employeeKey = String(employeeNumber ?? '').trim();
  if (!employeeKey || UNSUPPORTED_IDENTIFIER_WILDCARDS.test(employeeKey)) {
    return { ok: false, kind: 'not_found' };
  }
  const normalizedKey = employeeKey.toLowerCase();

  try {
    const { data, error } = await (supabase as any)
      .from('employee_portal_accounts')
      .select(METADATA_PROJECTION)
      .is('deleted_at', null)
      .ilike('employee_id', escapeIlikeLiteral(employeeKey));

    if (error) throw error;

    const rows = Array.isArray(data) ? (data as PortalAccountRow[]) : [];
    const activeMatches = rows.filter(
      (row) =>
        row.deleted_at == null &&
        String(row.employee_id ?? '').trim().toLowerCase() === normalizedKey,
    );

    if (activeMatches.length === 0) {
      return { ok: false, kind: 'not_found' };
    }
    if (activeMatches.length > 1) {
      return { ok: false, kind: 'ambiguous_account' };
    }

    const identity = portalAccountIdentityFromRow(activeMatches[0]);
    if (!identity) {
      logSanitizedPortalLookupWarning(
        'Portal account metadata lookup missing required schema columns',
        { code: 'SCHEMA_MISMATCH', message: 'missing boolean must_change_password or revision' },
      );
      return { ok: false, kind: 'lookup_unavailable' };
    }

    return { ok: true, account: identity };
  } catch (err) {
    logSanitizedPortalLookupWarning('Portal account metadata lookup unavailable', err);
    return { ok: false, kind: 'lookup_unavailable' };
  }
};

/**
 * Checked remote metadata list of active non-deleted portal accounts.
 * - Omitting `employeeNumbers` lists all active accounts (excluding password).
 * - Passing `string[]` scopes to those employee numbers (`[]` short-circuits).
 */
export const listEmployeePortalAccountIdentities = async (
  employeeNumbers?: string[],
): Promise<PortalAccountListResult> => {
  let scopedValues: string[] | null = null;
  let scopedKeys: Set<string> | null = null;

  if (employeeNumbers !== undefined) {
    if (!Array.isArray(employeeNumbers)) {
      return { ok: false, kind: 'lookup_unavailable' };
    }
    scopedValues = [];
    scopedKeys = new Set<string>();
    for (const raw of employeeNumbers) {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed) continue;
      if (UNSUPPORTED_IDENTIFIER_WILDCARDS.test(trimmed)) {
        return { ok: false, kind: 'lookup_unavailable' };
      }
      const key = trimmed.toLowerCase();
      if (!scopedKeys.has(key)) {
        scopedKeys.add(key);
        scopedValues.push(trimmed);
      }
    }
    if (scopedValues.length === 0) {
      return { ok: true, accounts: [] };
    }
  }

  try {
    let query = (supabase as any)
      .from('employee_portal_accounts')
      .select(METADATA_PROJECTION)
      .is('deleted_at', null);

    if (scopedValues !== null) {
      query = query.in('employee_id', scopedValues);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = Array.isArray(data) ? (data as PortalAccountRow[]) : [];
    const seenEmployeeIds = new Set<string>();
    const seenUsernames = new Set<string>();
    const accounts: PortalAccountIdentity[] = [];

    for (const row of rows) {
      if (row.deleted_at != null) continue;
      const empKey = String(row.employee_id ?? '').trim().toLowerCase();
      if (scopedKeys !== null && (!empKey || !scopedKeys.has(empKey))) {
        continue;
      }

      const identity = portalAccountIdentityFromRow(row);
      if (!identity) {
        logSanitizedPortalLookupWarning(
          'Portal account metadata list missing required schema columns',
          { code: 'SCHEMA_MISMATCH', message: 'missing boolean must_change_password or revision' },
        );
        return { ok: false, kind: 'lookup_unavailable' };
      }

      const userKey = identity.username.trim().toLowerCase();
      if ((empKey && seenEmployeeIds.has(empKey)) || seenUsernames.has(userKey)) {
        return { ok: false, kind: 'ambiguous_account' };
      }
      if (empKey) seenEmployeeIds.add(empKey);
      seenUsernames.add(userKey);
      accounts.push(identity);
    }

    accounts.sort(
      (a, b) =>
        a.username.trim().toLowerCase().localeCompare(b.username.trim().toLowerCase()) ||
        a.id.localeCompare(b.id),
    );

    return { ok: true, accounts };
  } catch (err) {
    logSanitizedPortalLookupWarning('Portal account metadata list unavailable', err);
    return { ok: false, kind: 'lookup_unavailable' };
  }
};

const readPortalAccountsForIdentifier = async (
  column: 'username' | 'employee_id',
  identifier: string,
): Promise<PortalAccountRow[]> => {
  // Narrow the read to the entered identifier. The legacy account table stores
  // plaintext passwords, so never download the roster for a browser comparison.
  // Soft-deleted rows are excluded explicitly, not left to RLS.
  const { data, error } = await (supabase as any)
    .from('employee_portal_accounts')
    .select('*')
    .is('deleted_at', null)
    .ilike(column, escapeIlikeLiteral(identifier));
  if (error) throw error;
  return Array.isArray(data) ? (data as PortalAccountRow[]) : [];
};

/**
 * Authenticate an existing employee for a promotional application against the
 * current remote account table. The browser cache is never consulted: it can
 * belong to another browser and can hold a password that has since changed.
 *
 * A username and an employee number are both accepted; only the identifier is
 * normalized (trimmed and case-folded). The password must match the remote
 * value exactly.
 */
export const authenticatePromotionalEmployee = async (
  identifier: string,
  password: string,
): Promise<{ ok: boolean; account?: PortalAccountIdentity; error?: string }> => {
  const identifierKey = String(identifier ?? '').trim().toLowerCase();
  if (
    !identifierKey ||
    String(password ?? '').length === 0 ||
    UNSUPPORTED_IDENTIFIER_WILDCARDS.test(identifierKey)
  ) {
    return { ok: false, error: PROMOTIONAL_AUTH_ERROR.INVALID_CREDENTIALS };
  }

  try {
    // Two targeted reads keep the match explicit and let us detect an
    // identifier that resolves to more than one account.
    const [byUsername, byEmployeeNumber] = await Promise.all([
      readPortalAccountsForIdentifier('username', identifierKey),
      readPortalAccountsForIdentifier('employee_id', identifierKey),
    ]);

    const matches = new Map<string, PortalAccountRow>();
    [...byUsername, ...byEmployeeNumber].forEach((row) => {
      // A permissive policy can still return a soft-deleted row. Ignore it
      // rather than authenticating or treating it as an active duplicate.
      if (row.deleted_at != null) return;
      const usernameMatches =
        String(row.username ?? '').trim().toLowerCase() === identifierKey;
      const employeeNumberMatches =
        String(row.employee_id ?? '').trim().toLowerCase() === identifierKey;
      if (!usernameMatches && !employeeNumberMatches) return;
      const key = String(row.id ?? '');
      if (!matches.has(key)) matches.set(key, row);
    });

    if (matches.size === 0) {
      return { ok: false, error: PROMOTIONAL_AUTH_ERROR.INVALID_CREDENTIALS };
    }
    if (matches.size > 1) {
      return { ok: false, error: PROMOTIONAL_AUTH_ERROR.AMBIGUOUS_ACCOUNT };
    }

    const [accountRow] = [...matches.values()];
    if (String(accountRow.password ?? '') !== password) {
      return { ok: false, error: PROMOTIONAL_AUTH_ERROR.INVALID_CREDENTIALS };
    }
    if (!String(accountRow.employee_id ?? '').trim()) {
      return { ok: false, error: PROMOTIONAL_AUTH_ERROR.MISSING_EMPLOYEE_NUMBER };
    }
    const identity = portalAccountIdentityFromRow(accountRow);
    if (!identity) {
      return { ok: false, error: PROMOTIONAL_AUTH_ERROR.LOOKUP_UNAVAILABLE };
    }
    return { ok: true, account: identity };
  } catch (err) {
    // Do not include the submitted password or account row in the diagnostic.
    const lookupError = err as { code?: unknown; message?: unknown } | null;
    console.warn('[employeePortalData] Promotional credential lookup unavailable:', {
      code: lookupError?.code ?? null,
      message: lookupError?.message ?? 'remote read failed',
    });
    return { ok: false, error: PROMOTIONAL_AUTH_ERROR.LOOKUP_UNAVAILABLE };
  }
};

const DEMO_ACCOUNT: EmployeePortalAccount = {
  id: 'employee-account-demo-employee01',
  username: 'employee01',
  password: 'hr2024',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  employee: {
    employeeId: 'EMP-2024-001',
    fullName: 'Maria Santos',
    employmentStatus: 'Probationary',
    email: 'maria.santos@ilongcity.gov.ph',
    dateOfBirth: '1990-05-15',
    age: 34,
    gender: 'Female',
    civilStatus: 'Married',
    nationality: 'Filipino',
    mobileNumber: '+63-908-123-4567',
    homeAddress: '123 Rizal Street, Iloilo City, Iloilo 5000',
    emergencyContactName: 'Juan Santos',
    emergencyRelationship: 'Spouse',
    emergencyContactNumber: '+63-908-765-4321',
    sssNumber: '01-2345678-0',
    philhealthNumber: 'PH-01-2345678-9',
    pagibigNumber: '121234567890',
    tinNumber: '123-456-789-000',
    currentPosition: 'Administrative Assistant I',
    currentDepartment: 'Office of the City Mayor',
    currentDivision: 'Administrative Division',
  },
};

const normalizeUsername = (value: string) => String(value ?? '').trim().toLowerCase();

const safeJsonParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const withDemoAccount = (accounts: EmployeePortalAccount[]) => {
  const hasDemo = accounts.some((account) => normalizeUsername(account.username) === normalizeUsername(DEMO_ACCOUNT.username));
  if (hasDemo) {
    return accounts;
  }
  return [DEMO_ACCOUNT, ...accounts];
};

export const getEmployeePortalAccounts = (): EmployeePortalAccount[] => {
  const raw = localStorage.getItem(EMPLOYEE_PORTAL_ACCOUNTS_KEY);
  const parsed = safeJsonParse<EmployeePortalAccount[]>(raw, []);
  return withDemoAccount(Array.isArray(parsed) ? parsed : []);
};

export const saveEmployeePortalAccounts = (accounts: EmployeePortalAccount[]) => {
  // Persist to localStorage so generated credentials survive page navigation and
  // are reachable by the Employee Portal login + the Applicant Wizard's
  // promotional auth path. Both consumers call getEmployeePortalAccounts(), which
  // reads this same key — so without the write here, generated credentials would
  // immediately disappear and login would fail. (The previous comment about
  // "Supabase only" was a regression: nothing actually wrote to Supabase, and the
  // localStorage write was removed without replacement.)
  const normalized = withDemoAccount(Array.isArray(accounts) ? accounts : []);
  try {
    localStorage.setItem(EMPLOYEE_PORTAL_ACCOUNTS_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.error('[employeePortalData] failed to persist accounts to localStorage:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cictrix:employee-accounts-updated'));
  }
};

export const upsertEmployeePortalAccount = (
  nextAccount: Omit<EmployeePortalAccount, 'createdAt' | 'updatedAt'>
) => {
  const nowIso = new Date().toISOString();
  const accounts = getEmployeePortalAccounts();
  const usernameKey = normalizeUsername(nextAccount.username);
  const index = accounts.findIndex((account) => normalizeUsername(account.username) === usernameKey);

  let upserted: EmployeePortalAccount;
  if (index >= 0) {
    const existing = accounts[index];
    upserted = {
      ...existing,
      ...nextAccount,
      createdAt: existing.createdAt || nowIso,
      updatedAt: nowIso,
    };
    accounts[index] = upserted;
  } else {
    upserted = {
      ...nextAccount,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    accounts.push(upserted);
  }

  saveEmployeePortalAccounts(accounts);

  // Mirror to Supabase so the employee can log in from any browser, not
  // just the RSP admin's browser where this was originally generated. Callers
  // that report success await this: until it resolves ok, the account exists
  // only in this browser.
  return upsertPortalAccountToSupabase(upserted);
};

export interface EmployeePasswordResetLog {
  account_id: string | null;
  employee_username: string | null;
  employee_number: string | null;
  reset_by: string | null;
  reset_at: string;
}

/**
 * Record a password-reset action for auditing (RSP spec: log who triggered a
 * reset and when). A failed insert only warns — it must not hide the fact
 * that the password itself was already changed. Mirrors
 * resetSupervisorPassword's audit-insert pattern in src/lib/api/supervisors.ts.
 */
export const logEmployeePasswordReset = async (entry: {
  accountId: string;
  username: string;
  employeeNumber?: string;
  resetBy: string;
}): Promise<void> => {
  try {
    const { error } = await (supabase as any).from('employee_password_resets').insert([
      {
        account_id: entry.accountId,
        employee_username: entry.username,
        employee_number: entry.employeeNumber ?? null,
        reset_by: entry.resetBy,
        note: 'Password reset to a temporary value.',
      },
    ]);
    if (error) {
      console.warn('[employeePortalData] Failed to write password-reset audit log:', error);
    }
  } catch (err) {
    console.warn('[employeePortalData] Failed to write password-reset audit log:', err);
  }
};

/** Fetch the most recent password-reset log entry for a portal account, if any. */
export const getLastEmployeePasswordReset = async (
  accountId: string
): Promise<EmployeePasswordResetLog | null> => {
  try {
    const { data, error } = await (supabase as any)
      .from('employee_password_resets')
      .select('*')
      .eq('account_id', accountId)
      .order('reset_at', { ascending: false })
      .limit(1);
    if (error) {
      console.warn('[employeePortalData] Failed to fetch password-reset audit log:', error);
      return null;
    }
    return Array.isArray(data) && data.length > 0 ? (data[0] as EmployeePasswordResetLog) : null;
  } catch (err) {
    console.warn('[employeePortalData] Failed to fetch password-reset audit log:', err);
    return null;
  }
};

export const findEmployeePortalAccount = (username: string, password?: string) => {
  const usernameKey = normalizeUsername(username);
  if (!usernameKey) return null;

  const accounts = getEmployeePortalAccounts();
  const matched = accounts.find((account) => normalizeUsername(account.username) === usernameKey);
  if (!matched) return null;

  if (typeof password === 'string' && matched.password !== password) {
    return null;
  }

  return matched;
};

export const findEmployeeByEmployeeId = (employeeId: string) => {
  const normalizedEmployeeId = String(employeeId ?? '').trim();
  if (!normalizedEmployeeId) return null;

  return (
    getEmployeePortalAccounts().find(
      (account) => String(account.employee.employeeId ?? '').trim() === normalizedEmployeeId
    ) ?? null
  );
};

export type PortalCredentialFailureKind =
  | 'validation'
  | 'invalid_credentials'
  | 'account_unavailable'
  | 'username_taken'
  | 'conflict'
  | 'unavailable'
  | 'unconfirmed';

export type PortalCredentialChangeResult =
  | { ok: true; account: PortalAccountIdentity }
  | { ok: false; kind: PortalCredentialFailureKind; error: string };

export type PortalCredentialTarget = {
  accountId: string;
  employeeNumber: string;
  expectedRevision: string;
};

const validatePortalCredentialTarget = (
  target: PortalCredentialTarget,
):
  | { ok: true; accountId: string; employeeNumber: string; expectedRevision: string }
  | { ok: false; kind: 'validation'; error: string } => {
  const accountId = String(target?.accountId ?? '').trim();
  const employeeNumber = String(target?.employeeNumber ?? '').trim();
  const expectedRevision = String(target?.expectedRevision ?? '');

  if (
    !accountId ||
    !employeeNumber ||
    !expectedRevision.trim() ||
    Number.isNaN(Date.parse(expectedRevision))
  ) {
    return {
      ok: false,
      kind: 'validation',
      error: 'A loaded portal account target and revision are required.',
    };
  }

  return { ok: true, accountId, employeeNumber, expectedRevision };
};

const readPortalAccountByTarget = async (
  accountId: string,
  employeeNumber: string,
  expectedRevision: string,
): Promise<
  | { ok: true; row: PortalAccountRow }
  | { ok: false; kind: PortalCredentialFailureKind; error: string }
> => {
  try {
    const { data, error } = await (supabase as any)
      .from('employee_portal_accounts')
      .select(AUTH_PROJECTION)
      .is('deleted_at', null)
      .eq('id', accountId);

    if (error) {
      return {
        ok: false,
        kind: 'unavailable',
        error: 'Unable to reach the employee account service right now. Please try again.',
      };
    }

    const activeRows = ((data ?? []) as PortalAccountRow[]).filter(
      (row) => row?.deleted_at == null && String(row.id ?? '').trim() === accountId,
    );

    if (activeRows.length !== 1) {
      return {
        ok: false,
        kind: 'account_unavailable',
        error: 'Could not find your active portal account. Contact HR for assistance.',
      };
    }

    const existing = activeRows[0];
    if (typeof existing.must_change_password !== 'boolean') {
      return {
        ok: false,
        kind: 'unavailable',
        error: 'Employee portal account state is unavailable right now. Please try again.',
      };
    }

    if (
      String(existing.employee_id ?? '').trim() !== employeeNumber ||
      !String(existing.username ?? '').trim()
    ) {
      return {
        ok: false,
        kind: 'account_unavailable',
        error: 'Your portal account does not match the signed-in employee record.',
      };
    }

    if (String(existing.updated_at ?? '') !== expectedRevision) {
      return {
        ok: false,
        kind: 'conflict',
        error: 'Your account was updated elsewhere since this form was opened. Reload and try again.',
      };
    }

    return { ok: true, row: existing };
  } catch {
    return {
      ok: false,
      kind: 'unavailable',
      error: 'Unable to reach the employee account service right now. Please try again.',
    };
  }
};

const recoverLostPortalCredentialUpdate = async (
  accountId: string,
  employeeNumber: string,
  expectedRevision: string,
  matchesIntended: (row: PortalAccountRow) => boolean,
  unconfirmedMessage: string,
  projection: string = AUTH_PROJECTION,
): Promise<PortalCredentialChangeResult> => {
  try {
    const { data, error } = await (supabase as any)
      .from('employee_portal_accounts')
      .select(projection)
      .is('deleted_at', null)
      .eq('id', accountId);

    if (error) {
      return { ok: false, kind: 'unconfirmed', error: unconfirmedMessage };
    }

    const activeRows = ((data ?? []) as PortalAccountRow[]).filter(
      (row) => row?.deleted_at == null && String(row.id ?? '').trim() === accountId,
    );
    if (activeRows.length !== 1) {
      return { ok: false, kind: 'unconfirmed', error: unconfirmedMessage };
    }

    const row = activeRows[0];
    if (String(row.employee_id ?? '').trim() !== employeeNumber) {
      return { ok: false, kind: 'unconfirmed', error: unconfirmedMessage };
    }

    const identity = portalAccountIdentityFromRow(row);
    if (!identity) {
      return { ok: false, kind: 'unconfirmed', error: unconfirmedMessage };
    }

    if (String(row.updated_at ?? '') !== expectedRevision) {
      if (matchesIntended(row)) {
        return { ok: true, account: identity };
      }
      return {
        ok: false,
        kind: 'conflict',
        error: 'Your account was updated elsewhere before this change could be confirmed. Reload and check your account details.',
      };
    }

    return { ok: false, kind: 'unconfirmed', error: unconfirmedMessage };
  } catch {
    return { ok: false, kind: 'unconfirmed', error: unconfirmedMessage };
  }
};

/**
 * Rename the username of an existing portal account by immutable account ID and expected revision.
 */
export const changeEmployeePortalUsername = async (
  target: PortalCredentialTarget,
  newUsername: string,
): Promise<PortalCredentialChangeResult> => {
  const checkedTarget = validatePortalCredentialTarget(target);
  if (checkedTarget.ok === false) return checkedTarget;

  const nextRaw = String(newUsername ?? '').trim();
  const nextKey = normalizeUsername(nextRaw);

  if (!nextRaw) {
    return { ok: false, kind: 'validation', error: 'Please enter a new username.' };
  }
  if (nextRaw.length < 3) {
    return { ok: false, kind: 'validation', error: 'Username must be at least 3 characters long.' };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(nextRaw)) {
    return {
      ok: false,
      kind: 'validation',
      error: 'Username can only contain letters, digits, dot, underscore, or hyphen.',
    };
  }

  const { accountId, employeeNumber, expectedRevision } = checkedTarget;
  const loaded = await readPortalAccountByTarget(accountId, employeeNumber, expectedRevision);
  if (loaded.ok === false) return loaded;

  const existing = loaded.row;
  if (normalizeUsername(existing.username) === nextKey) {
    return { ok: false, kind: 'validation', error: 'New username is the same as the current one.' };
  }

  try {
    const { data: collisionRows, error: collisionError } = await (supabase as any)
      .from('employee_portal_accounts')
      .select(METADATA_PROJECTION)
      .is('deleted_at', null)
      .ilike('username', escapeIlikeLiteral(nextKey));

    if (collisionError) {
      return {
        ok: false,
        kind: 'unavailable',
        error: 'Unable to check username availability right now. Please try again.',
      };
    }

    const taken = ((collisionRows ?? []) as PortalAccountRow[]).some(
      (row) =>
        row?.deleted_at == null &&
        String(row.id ?? '').trim() !== accountId &&
        normalizeUsername(row.username) === nextKey,
    );
    if (taken) {
      return {
        ok: false,
        kind: 'username_taken',
        error: 'That username is already taken. Pick a different one.',
      };
    }
  } catch {
    return {
      ok: false,
      kind: 'unavailable',
      error: 'Unable to check username availability right now. Please try again.',
    };
  }

  const nextUpdatedAt = new Date(
    Math.max(Date.now(), Date.parse(expectedRevision) + 2),
  ).toISOString();
  const unconfirmedMsg =
    'We could not confirm whether your username change completed. Reload Account & Security to check your current username before trying again.';

  try {
    const { data, error } = await (supabase as any)
      .from('employee_portal_accounts')
      .update({
        username: nextRaw,
        updated_at: nextUpdatedAt,
      })
      .eq('id', accountId)
      .eq('employee_id', existing.employee_id)
      .eq('username', existing.username)
      .eq('updated_at', expectedRevision)
      .is('deleted_at', null)
      .select(METADATA_PROJECTION);

    if (error) {
      if (String(error?.code ?? '') === '23505') {
        return {
          ok: false,
          kind: 'username_taken',
          error: 'That username is already taken. Pick a different one.',
        };
      }
      if (isTransportOrUncertainInsertError(error)) {
        return await recoverLostPortalCredentialUpdate(
          accountId,
          employeeNumber,
          expectedRevision,
          (row) => String(row.username ?? '').trim() === nextRaw,
          unconfirmedMsg,
          METADATA_PROJECTION,
        );
      }
      return {
        ok: false,
        kind: 'unavailable',
        error: 'Unable to update your username right now. Please try again.',
      };
    }

    const rows = (Array.isArray(data) ? data : data ? [data] : []) as PortalAccountRow[];
    if (rows.length === 0) {
      return {
        ok: false,
        kind: 'conflict',
        error: 'Your account was updated elsewhere before this change could be saved. Reload and try again.',
      };
    }
    if (rows.length > 1) {
      return { ok: false, kind: 'unconfirmed', error: unconfirmedMsg };
    }

    const updated = rows[0];
    if (
      String(updated.id ?? '').trim() !== accountId ||
      String(updated.employee_id ?? '').trim() !== employeeNumber ||
      String(updated.username ?? '').trim() !== nextRaw
    ) {
      return { ok: false, kind: 'unconfirmed', error: unconfirmedMsg };
    }

    const identity = portalAccountIdentityFromRow(updated);
    if (!identity) {
      return { ok: false, kind: 'unconfirmed', error: unconfirmedMsg };
    }

    return { ok: true, account: identity };
  } catch (err) {
    if (String((err as { code?: unknown })?.code ?? '') === '23505') {
      return {
        ok: false,
        kind: 'username_taken',
        error: 'That username is already taken. Pick a different one.',
      };
    }
    if (isTransportOrUncertainInsertError(err)) {
      return await recoverLostPortalCredentialUpdate(
        accountId,
        employeeNumber,
        expectedRevision,
        (row) => String(row.username ?? '').trim() === nextRaw,
        unconfirmedMsg,
        METADATA_PROJECTION,
      );
    }
    return {
      ok: false,
      kind: 'unavailable',
      error: 'Unable to update your username right now. Please try again.',
    };
  }
};

/**
 * Change the password of an existing portal account by immutable account ID and expected revision.
 */
export const changeEmployeePortalPassword = async (
  target: PortalCredentialTarget,
  currentPassword: string,
  newPassword: string,
): Promise<PortalCredentialChangeResult> => {
  const checkedTarget = validatePortalCredentialTarget(target);
  if (checkedTarget.ok === false) return checkedTarget;

  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    return { ok: false, kind: 'validation', error: 'Please enter your current password.' };
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return {
      ok: false,
      kind: 'validation',
      error: 'New password must be at least 6 characters long.',
    };
  }
  if (newPassword === currentPassword) {
    return {
      ok: false,
      kind: 'validation',
      error: 'New password must differ from your current password.',
    };
  }

  const { accountId, employeeNumber, expectedRevision } = checkedTarget;
  const loaded = await readPortalAccountByTarget(accountId, employeeNumber, expectedRevision);
  if (loaded.ok === false) return loaded;

  const existing = loaded.row;
  if (String(existing.password ?? '') !== currentPassword) {
    return { ok: false, kind: 'invalid_credentials', error: 'Current password is incorrect.' };
  }

  const nextUpdatedAt = new Date(
    Math.max(Date.now(), Date.parse(expectedRevision) + 2),
  ).toISOString();
  const unconfirmedMsg =
    'We could not confirm whether your password change completed. Try signing in with your new password or check Account & Security before trying again.';

  try {
    const { data, error } = await (supabase as any)
      .from('employee_portal_accounts')
      .update({
        password: newPassword,
        must_change_password: false,
        updated_at: nextUpdatedAt,
      })
      .eq('id', accountId)
      .eq('employee_id', existing.employee_id)
      .eq('username', existing.username)
      .eq('updated_at', expectedRevision)
      .is('deleted_at', null)
      .select(AUTH_PROJECTION);

    if (error) {
      if (isTransportOrUncertainInsertError(error)) {
        return await recoverLostPortalCredentialUpdate(
          accountId,
          employeeNumber,
          expectedRevision,
          (row) => String(row.password ?? '') === newPassword && row.must_change_password === false,
          unconfirmedMsg,
        );
      }
      return {
        ok: false,
        kind: 'unavailable',
        error: 'Unable to update your password right now. Please try again.',
      };
    }

    const rows = (Array.isArray(data) ? data : data ? [data] : []) as PortalAccountRow[];
    if (rows.length === 0) {
      return {
        ok: false,
        kind: 'conflict',
        error: 'Your account was updated elsewhere before this change could be saved. Reload and try again.',
      };
    }
    if (rows.length > 1) {
      return { ok: false, kind: 'unconfirmed', error: unconfirmedMsg };
    }

    const updated = rows[0];
    if (
      String(updated.id ?? '').trim() !== accountId ||
      String(updated.employee_id ?? '').trim() !== employeeNumber ||
      String(updated.password ?? '') !== newPassword ||
      updated.must_change_password !== false
    ) {
      return { ok: false, kind: 'unconfirmed', error: unconfirmedMsg };
    }

    const identity = portalAccountIdentityFromRow(updated);
    if (!identity) {
      return { ok: false, kind: 'unconfirmed', error: unconfirmedMsg };
    }

    return { ok: true, account: identity };
  } catch (err) {
    if (isTransportOrUncertainInsertError(err)) {
      return await recoverLostPortalCredentialUpdate(
        accountId,
        employeeNumber,
        expectedRevision,
        (row) => String(row.password ?? '') === newPassword && row.must_change_password === false,
        unconfirmedMsg,
      );
    }
    return {
      ok: false,
      kind: 'unavailable',
      error: 'Unable to update your password right now. Please try again.',
    };
  }
};

/**
 * Check whether a portal account still requires a first-login password reset.
 * Used by the route guard to redirect to /employee/set-password.
 */
export const portalAccountRequiresPasswordChange = (username: string): boolean => {
  const usernameKey = normalizeUsername(username);
  const accounts = getEmployeePortalAccounts();
  const account = accounts.find((a) => normalizeUsername(a.username) === usernameKey);
  return Boolean(account?.mustChangePassword);
};

export const updateEmployeePortalEmployee = (employeeId: string, patch: Partial<Employee>) => {
  const normalizedEmployeeId = String(employeeId ?? '').trim();
  if (!normalizedEmployeeId) return false;

  const accounts = getEmployeePortalAccounts();
  const index = accounts.findIndex(
    (account) => String(account.employee.employeeId ?? '').trim() === normalizedEmployeeId
  );

  if (index < 0) return false;

  const account = accounts[index];
  const nowIso = new Date().toISOString();

  accounts[index] = {
    ...account,
    employee: {
      ...account.employee,
      ...patch,
      updatedAt: nowIso,
    },
    updatedAt: nowIso,
  };

  saveEmployeePortalAccounts(accounts);
  return true;
};

export const createUniqueUsername = (
  firstName: string,
  lastName: string,
  occupiedUsernames: Set<string>
): string => {
  const sanitize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const base = `${sanitize(firstName)}${sanitize(lastName)}`;

  if (!occupiedUsernames.has(base)) {
    return base;
  }

  // Try adding numbers
  for (let i = 1; i <= 999; i++) {
    const candidate = `${base}${i}`;
    if (!occupiedUsernames.has(candidate)) {
      return candidate;
    }
  }

  // Fallback: use timestamp
  return `${base}${Date.now()}`;
};

export const createPassword = (): string => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  
  const all = uppercase + lowercase + numbers + symbols;
  
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Add 8 more random characters
  for (let i = 0; i < 8; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  
  // Shuffle
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

export const getEmployeePortalAccountsKey = () => EMPLOYEE_PORTAL_ACCOUNTS_KEY;

export type PortalAccountProvisioningInput = {
  employee: Employee;
  requestedUsername: string;
};

export type PortalIssuedCredential = { username: string; password: string };

export type PortalAccountProvisionResult =
  | { ok: true; created: true; account: PortalAccountIdentity; credentials: PortalIssuedCredential }
  | { ok: true; created: false; account: PortalAccountIdentity }
  | { ok: false; kind: 'invalid_employee' | 'account_conflict' | 'unavailable' | 'unconfirmed'; error: string };

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

const isTransportOrUncertainInsertError = (err: unknown): boolean => {
  if (!err) return false;
  if (err instanceof Error && !(err as { code?: unknown }).code) return true;
  const errObj = err as { code?: unknown; message?: unknown; status?: unknown };
  const code = String(errObj.code ?? '').trim();
  if (code) return false;
  const msg = String(errObj.message ?? '');
  return /fetch|network|timeout|abort|connection|econn|etimedout|socket|failed to fetch/i.test(msg);
};

const resolveProvisionInsertReread = async (
  employeeNumber: string,
  fromConflict: boolean,
): Promise<PortalAccountProvisionResult> => {
  const reread = await getEmployeePortalAccountByEmployeeNumber(employeeNumber);
  if (reread.ok === true) {
    return { ok: true, created: false, account: reread.account };
  }
  if (reread.ok === false && reread.kind === 'ambiguous_account') {
    return {
      ok: false,
      kind: 'account_conflict',
      error: new EmployeePortalLoginError(reread.kind).message,
    };
  }
  if (fromConflict && reread.ok === false && reread.kind !== 'lookup_unavailable') {
    return {
      ok: false,
      kind: 'account_conflict',
      error: 'That username or employee number is already used by another portal account.',
    };
  }
  return {
    ok: false,
    kind: 'unconfirmed',
    error: 'We could not confirm whether the employee portal account was created. Check Accounts before resetting the password.',
  };
};

export const ensureEmployeePortalAccount = async (
  input: PortalAccountProvisioningInput,
): Promise<PortalAccountProvisionResult> => {
  const employeeNumber = String(input.employee?.employeeId ?? '').trim();
  const requestedUsername = String(input.requestedUsername ?? '').trim();

  if (!employeeNumber || UNSUPPORTED_IDENTIFIER_WILDCARDS.test(employeeNumber)) {
    return {
      ok: false,
      kind: 'invalid_employee',
      error: 'A confirmed employee number is required before creating a portal account.',
    };
  }

  if (requestedUsername.length < 3 || !USERNAME_PATTERN.test(requestedUsername)) {
    return {
      ok: false,
      kind: 'invalid_employee',
      error: 'Requested username must be at least 3 characters and use only letters, numbers, dots, underscores, or hyphens.',
    };
  }

  const existingByEmployee = await getEmployeePortalAccountByEmployeeNumber(employeeNumber);
  if (existingByEmployee.ok === true) {
    return { ok: true, created: false, account: existingByEmployee.account };
  }
  if (existingByEmployee.ok === false && existingByEmployee.kind !== 'not_found') {
    if (existingByEmployee.kind === 'lookup_unavailable') {
      return {
        ok: false,
        kind: 'unavailable',
        error: new EmployeePortalLoginError(existingByEmployee.kind).message,
      };
    }
    return {
      ok: false,
      kind: 'account_conflict',
      error: new EmployeePortalLoginError(existingByEmployee.kind).message,
    };
  }

  try {
    const { data: usernameRows, error: usernameError } = await (supabase as any)
      .from('employee_portal_accounts')
      .select(METADATA_PROJECTION)
      .is('deleted_at', null)
      .ilike('username', escapeIlikeLiteral(requestedUsername));

    if (usernameError) {
      return {
        ok: false,
        kind: 'unavailable',
        error: 'Unable to check username availability right now. Please try again.',
      };
    }

    const activeUsernameMatches = ((usernameRows ?? []) as PortalAccountRow[]).filter(
      (row) =>
        row?.deleted_at == null &&
        String(row.username ?? '').trim().toLowerCase() === requestedUsername.toLowerCase(),
    );

    if (activeUsernameMatches.length > 0) {
      const sameEmployeeRow = activeUsernameMatches.find(
        (row) => String(row.employee_id ?? '').trim().toLowerCase() === employeeNumber.toLowerCase(),
      );
      if (sameEmployeeRow && activeUsernameMatches.length === 1) {
        const identity = portalAccountIdentityFromRow(sameEmployeeRow);
        if (identity) {
          return { ok: true, created: false, account: identity };
        }
      }
      return {
        ok: false,
        kind: 'account_conflict',
        error: 'That username is already used by another employee portal account.',
      };
    }
  } catch {
    return {
      ok: false,
      kind: 'unavailable',
      error: 'Unable to check username availability right now. Please try again.',
    };
  }

  const candidatePassword = createPassword();
  const now = new Date().toISOString();
  const insertRow = {
    id: `portal-${employeeNumber}`,
    username: requestedUsername,
    password: candidatePassword,
    employee_id: employeeNumber,
    full_name: String(input.employee.fullName ?? '').trim() || requestedUsername,
    email: String(input.employee.email ?? '').trim(),
    mobile_number: String(input.employee.mobileNumber ?? '').trim(),
    created_at: now,
    updated_at: now,
    deleted_at: null,
    must_change_password: true,
  };

  try {
    const { data, error } = await (supabase as any)
      .from('employee_portal_accounts')
      .insert([insertRow])
      .select(METADATA_PROJECTION);

    if (error) {
      if (String(error?.code ?? '') === '23505') {
        return await resolveProvisionInsertReread(employeeNumber, true);
      }
      if (isTransportOrUncertainInsertError(error)) {
        return await resolveProvisionInsertReread(employeeNumber, false);
      }
      return {
        ok: false,
        kind: 'unavailable',
        error: 'Unable to create the employee portal account right now. Please try again.',
      };
    }

    const insertedRow = Array.isArray(data) ? data[0] : data;
    const identity = insertedRow ? portalAccountIdentityFromRow(insertedRow as PortalAccountRow) : null;
    if (!identity) {
      return await resolveProvisionInsertReread(employeeNumber, false);
    }

    return {
      ok: true,
      created: true,
      account: identity,
      credentials: {
        username: identity.username,
        password: candidatePassword,
      },
    };
  } catch (err) {
    if (String((err as { code?: unknown })?.code ?? '') === '23505') {
      return await resolveProvisionInsertReread(employeeNumber, true);
    }
    if (isTransportOrUncertainInsertError(err)) {
      return await resolveProvisionInsertReread(employeeNumber, false);
    }
    return {
      ok: false,
      kind: 'unavailable',
      error: 'Unable to create the employee portal account right now. Please try again.',
    };
  }
};
