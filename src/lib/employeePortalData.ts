import { Employee } from '../types/employee.types';

export interface EmployeePortalAccount {
  id: string;
  username: string;
  password: string;
  employee: Employee;
  createdAt: string;
  updatedAt: string;
}

const EMPLOYEE_PORTAL_ACCOUNTS_KEY = 'cictrix_employee_portal_accounts';

const DEMO_ACCOUNT: EmployeePortalAccount = {
  id: 'employee-account-demo-employee01',
  username: 'employee01',
  password: 'hr2024',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  employee: {
    employeeId: 'EMP-2024-001',
    fullName: 'Maria Santos',
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
  // Employee portal accounts are now stored only in Supabase database
  // Do not save to localStorage to avoid quota exceeded errors
  const normalized = withDemoAccount(Array.isArray(accounts) ? accounts : []);
  
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

  if (index >= 0) {
    const existing = accounts[index];
    accounts[index] = {
      ...existing,
      ...nextAccount,
      createdAt: existing.createdAt || nowIso,
      updatedAt: nowIso,
    };
  } else {
    accounts.push({
      ...nextAccount,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  saveEmployeePortalAccounts(accounts);
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
