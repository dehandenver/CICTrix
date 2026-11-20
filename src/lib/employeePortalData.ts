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

const normalizeUsername = (value: string) => String(value ?? '').trim().toLowerCase();

export const evictObsoleteCachedCredential = (target: {
  id?: string;
  employeeNumber?: string;
  username?: string;
}): void => {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(EMPLOYEE_PORTAL_ACCOUNTS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    const idKey = String(target.id ?? '').trim();
    const empKey = String(target.employeeNumber ?? '').trim().toLowerCase();
    const userKey = normalizeUsername(target.username ?? '');
    if (!idKey && !empKey && !userKey) return;

    const remaining = parsed.filter((entry: any) => {
      if (!entry || typeof entry !== 'object') return true;
      const entryId = String(entry.id ?? '').trim();
      const entryEmp = String(entry.employee?.employeeId ?? '').trim().toLowerCase();
      const entryUser = normalizeUsername(entry.username ?? '');
      if (idKey && entryId === idKey) return false;
      if (empKey && entryEmp === empKey) return false;
      if (userKey && entryUser === userKey) return false;
      return true;
    });

    if (remaining.length === parsed.length) return;
    if (remaining.length === 0) {
      localStorage.removeItem(EMPLOYEE_PORTAL_ACCOUNTS_KEY);
    } else {
      localStorage.setItem(EMPLOYEE_PORTAL_ACCOUNTS_KEY, JSON.stringify(remaining));
    }
  } catch {
    // Storage failures must never turn a confirmed remote mutation or sign-in into failure.
  }
};

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

    evictObsoleteCachedCredential({
      id: identity.id,
      employeeNumber: identity.employee.employeeId,
      username: identity.username,
    });
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

export interface EmployeePasswordResetLog {
  account_id: string | null;
  employee_username: string | null;
  employee_number: string | null;
  reset_by: string | null;
  reset_at: string;
}

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
        evictObsoleteCachedCredential({
          id: identity.id,
          employeeNumber,
          username: identity.username,
        });
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

    evictObsoleteCachedCredential({
      id: identity.id,
      employeeNumber,
      username: existing.username,
    });
    evictObsoleteCachedCredential({
      id: identity.id,
      employeeNumber,
      username: identity.username,
    });
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

    evictObsoleteCachedCredential({
      id: identity.id,
      employeeNumber,
      username: existing.username,
    });
    evictObsoleteCachedCredential({
      id: identity.id,
      employeeNumber,
      username: identity.username,
    });
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

export type PortalPasswordResetResult =
  | { ok: true; account: PortalAccountIdentity; credentials: PortalIssuedCredential }
  | { ok: false; kind: PortalCredentialFailureKind; error: string };

const PASSWORD_RESET_AUDIT_METADATA_COLUMNS =
  'id, account_id, employee_username, employee_number, reset_at, request_id';

const generatePasswordResetRequestId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const classifyPasswordResetRpcError = (
  err: unknown,
): { kind: PortalCredentialFailureKind; error: string } => {
  const errObj = (err ?? {}) as { code?: unknown; hint?: unknown };
  const code = String(errObj.code ?? '').trim();
  const hint = String(errObj.hint ?? '').trim();

  if (
    code === 'P0002' ||
    hint === 'account_not_found' ||
    hint === 'identity_mismatch' ||
    hint === 'invalid_target'
  ) {
    return {
      kind: 'account_unavailable',
      error: 'This active portal account could not be matched to the employee record.',
    };
  }

  if (hint === 'invalid_password') {
    return {
      kind: 'validation',
      error: 'Generated temporary password did not satisfy server validation. Please try again.',
    };
  }

  if (
    code === '40001' ||
    hint === 'revision_conflict' ||
    code === '23505' ||
    hint === 'duplicate_request_id'
  ) {
    return {
      kind: 'conflict',
      error: 'This portal account was updated elsewhere before the reset completed. Reload the account and try again.',
    };
  }

  if (code === '42501' || hint === 'not_authorized' || code === 'PGRST202' || code === '42883') {
    return {
      kind: 'unavailable',
      error: 'Password reset service is currently unavailable. Please try again later.',
    };
  }

  return {
    kind: 'unavailable',
    error: 'Unable to reset the employee portal password right now. Please try again.',
  };
};

const recoverLostPasswordResetRpc = async (
  accountId: string,
  employeeNumber: string,
  expectedRevision: string,
  requestId: string,
  newPassword: string,
): Promise<PortalPasswordResetResult> => {
  const unconfirmedError =
    'The password reset request could not be confirmed after a connection interruption. Re-check the account before retrying or sharing temporary credentials.';

  try {
    const [auditRes, accountRes] = await Promise.all([
      (supabase as any)
        .from('employee_password_resets')
        .select(PASSWORD_RESET_AUDIT_METADATA_COLUMNS)
        .eq('account_id', accountId)
        .eq('request_id', requestId)
        .limit(1),
      (supabase as any)
        .from('employee_portal_accounts')
        .select(METADATA_PROJECTION)
        .is('deleted_at', null)
        .eq('id', accountId),
    ]);

    if (auditRes?.error || accountRes?.error) {
      return { ok: false, kind: 'unconfirmed', error: unconfirmedError };
    }

    const activeRows = ((accountRes?.data ?? []) as PortalAccountRow[]).filter(
      (row) => row?.deleted_at == null && String(row.id ?? '').trim() === accountId,
    );

    if (activeRows.length !== 1) {
      return {
        ok: false,
        kind: 'account_unavailable',
        error: 'Could not find an active employee portal account for this reset.',
      };
    }

    const identity = portalAccountIdentityFromRow(activeRows[0]);
    if (!identity || identity.employee.employeeId !== employeeNumber) {
      return {
        ok: false,
        kind: 'account_unavailable',
        error: 'This active portal account could not be matched to the employee record.',
      };
    }

    const auditRows = (auditRes?.data ?? []) as Array<{
      account_id?: unknown;
      request_id?: unknown;
      employee_number?: unknown;
    }>;
    const matchingAudit = auditRows.find(
      (row) =>
        String(row?.account_id ?? '').trim() === accountId &&
        String(row?.request_id ?? '').trim() === requestId &&
        String(row?.employee_number ?? '').trim() === employeeNumber,
    );

    if (matchingAudit && identity.mustChangePassword === true && identity.updatedAt !== expectedRevision) {
      evictObsoleteCachedCredential({
        id: identity.id,
        employeeNumber,
        username: identity.username,
      });
      return {
        ok: true,
        account: identity,
        credentials: {
          username: identity.username,
          password: newPassword,
        },
      };
    }

    if (identity.updatedAt !== expectedRevision) {
      return {
        ok: false,
        kind: 'conflict',
        error: 'This portal account was updated elsewhere before the reset completed. Reload the account and try again.',
      };
    }

    return { ok: false, kind: 'unconfirmed', error: unconfirmedError };
  } catch {
    return { ok: false, kind: 'unconfirmed', error: unconfirmedError };
  }
};

export const resetEmployeePortalPassword = async (
  target: PortalCredentialTarget,
): Promise<PortalPasswordResetResult> => {
  const targetCheck = validatePortalCredentialTarget(target);
  if (targetCheck.ok === false) {
    return {
      ok: false,
      kind: 'account_unavailable',
      error: 'A loaded active portal account target and revision are required.',
    };
  }

  const { accountId, employeeNumber, expectedRevision } = targetCheck;
  const newPassword = createPassword();
  const requestId = generatePasswordResetRequestId();

  try {
    const { data, error } = await (supabase as any).rpc('reset_employee_portal_password', {
      p_account_id: accountId,
      p_employee_number: employeeNumber,
      p_expected_updated_at: expectedRevision,
      p_new_password: newPassword,
      p_request_id: requestId,
    });

    if (error) {
      if (isTransportOrUncertainInsertError(error)) {
        return await recoverLostPasswordResetRpc(
          accountId,
          employeeNumber,
          expectedRevision,
          requestId,
          newPassword,
        );
      }
      const classified = classifyPasswordResetRpcError(error);
      return { ok: false, kind: classified.kind, error: classified.error };
    }

    const rpcRow = (Array.isArray(data) ? data[0] : data) as {
      account_id?: unknown;
      employee_number?: unknown;
      username?: unknown;
      updated_at?: unknown;
      must_change_password?: unknown;
    } | null;

    const returnedAccountId = String(rpcRow?.account_id ?? '').trim();
    const returnedEmployeeNumber = String(rpcRow?.employee_number ?? '').trim();
    const returnedUsername = String(rpcRow?.username ?? '').trim();
    const returnedUpdatedAt =
      typeof rpcRow?.updated_at === 'string'
        ? rpcRow.updated_at
        : String(rpcRow?.updated_at ?? '');

    if (
      !rpcRow ||
      returnedAccountId !== accountId ||
      returnedEmployeeNumber !== employeeNumber ||
      !returnedUsername ||
      !returnedUpdatedAt.trim() ||
      Number.isNaN(Date.parse(returnedUpdatedAt)) ||
      rpcRow.must_change_password !== true
    ) {
      return await recoverLostPasswordResetRpc(
        accountId,
        employeeNumber,
        expectedRevision,
        requestId,
        newPassword,
      );
    }

    const identity: PortalAccountIdentity = {
      id: returnedAccountId,
      username: returnedUsername,
      updatedAt: returnedUpdatedAt,
      mustChangePassword: true,
      employee: portalAccountEmployeeFromRow({
        id: returnedAccountId,
        username: returnedUsername,
        employee_id: returnedEmployeeNumber,
        full_name: null,
        email: null,
        mobile_number: null,
        created_at: returnedUpdatedAt,
        updated_at: returnedUpdatedAt,
        must_change_password: true,
      }),
    };

    evictObsoleteCachedCredential({
      id: identity.id,
      employeeNumber,
      username: identity.username,
    });

    return {
      ok: true,
      account: identity,
      credentials: {
        username: identity.username,
        password: newPassword,
      },
    };
  } catch (err) {
    if (isTransportOrUncertainInsertError(err)) {
      return await recoverLostPasswordResetRpc(
        accountId,
        employeeNumber,
        expectedRevision,
        requestId,
        newPassword,
      );
    }
    const classified = classifyPasswordResetRpcError(err);
    return { ok: false, kind: classified.kind, error: classified.error };
  }
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
