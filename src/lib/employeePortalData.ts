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

const EMPLOYEE_PORTAL_ACCOUNTS_KEY = 'cictrix_employee_portal_accounts';

// Supabase row shape for employee_portal_accounts. See migration
// backend/database/migrations/008_create_employee_portal_accounts.sql.
interface PortalAccountRow {
  id: string;
  username: string;
  password: string;
  employee_id: string | null;
  full_name: string | null;
  email: string | null;
  mobile_number: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

const portalAccountFromRow = (row: PortalAccountRow): EmployeePortalAccount => ({
  id: row.id,
  username: row.username,
  password: row.password,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  employee: {
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
  } as Employee,
});

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
): Promise<{ ok: boolean; account?: EmployeePortalAccount; error?: string }> => {
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
    return { ok: true, account: portalAccountFromRow(accountRow) };
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

/**
 * Rename the username of an existing portal account.
 * Returns success or a structured error so the UI can show a precise message.
 */
export const changeEmployeePortalUsername = (
  currentUsername: string,
  newUsername: string,
): { ok: true; account: EmployeePortalAccount } | { ok: false; error: string } => {
  const currentKey = normalizeUsername(currentUsername);
  const nextRaw = String(newUsername ?? '').trim();
  const nextKey = normalizeUsername(nextRaw);

  if (!nextRaw) return { ok: false, error: 'Please enter a new username.' };
  if (nextRaw.length < 3) return { ok: false, error: 'Username must be at least 3 characters long.' };
  if (!/^[a-zA-Z0-9._-]+$/.test(nextRaw)) {
    return { ok: false, error: 'Username can only contain letters, digits, dot, underscore, or hyphen.' };
  }
  if (currentKey === nextKey) return { ok: false, error: 'New username is the same as the current one.' };

  const accounts = getEmployeePortalAccounts();
  const index = accounts.findIndex((account) => normalizeUsername(account.username) === currentKey);
  if (index < 0) return { ok: false, error: 'Could not find your portal account.' };

  const collision = accounts.some(
    (account, i) => i !== index && normalizeUsername(account.username) === nextKey,
  );
  if (collision) return { ok: false, error: 'That username is already taken. Pick a different one.' };

  const nowIso = new Date().toISOString();
  accounts[index] = {
    ...accounts[index],
    username: nextRaw,
    updatedAt: nowIso,
  };

  saveEmployeePortalAccounts(accounts);
  return { ok: true, account: accounts[index] };
};

/**
 * Change the password of an existing portal account, requiring the current
 * password as a confirmation.
 */
export const changeEmployeePortalPassword = (
  username: string,
  currentPassword: string,
  newPassword: string,
): { ok: true } | { ok: false; error: string } => {
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: 'New password must be at least 6 characters long.' };
  }
  if (newPassword === currentPassword) {
    return { ok: false, error: 'New password must differ from your current password.' };
  }

  const usernameKey = normalizeUsername(username);
  const accounts = getEmployeePortalAccounts();
  const index = accounts.findIndex((account) => normalizeUsername(account.username) === usernameKey);
  if (index < 0) return { ok: false, error: 'Could not find your portal account.' };

  if (accounts[index].password !== currentPassword) {
    return { ok: false, error: 'Current password is incorrect.' };
  }

  const nowIso = new Date().toISOString();
  accounts[index] = {
    ...accounts[index],
    password: newPassword,
    mustChangePassword: false,
    updatedAt: nowIso,
  };

  saveEmployeePortalAccounts(accounts);
  return { ok: true };
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
