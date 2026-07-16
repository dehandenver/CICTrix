/**
 * IPCR Demo — shared types.
 *
 * Self-contained presentation build. Everything here talks to the demo-only
 * tables from migration 20260725 (accounts, demo_offices, ipcr_*, notifications,
 * demo_settings, cycle_log) and never touches the production IPCR machinery.
 */

export type DemoRole = 'Employee' | 'Supervisor' | 'DeptHead' | 'PMAdmin';

export const DEMO_ROLES: { value: DemoRole; label: string }[] = [
  { value: 'Employee', label: 'Employee' },
  { value: 'Supervisor', label: 'Supervisor' },
  { value: 'DeptHead', label: 'Dept Head' },
  { value: 'PMAdmin', label: 'PM Admin' },
];

export interface DemoAccount {
  id: string;
  email: string;
  full_name: string;
  employee_code: string | null;
  role: DemoRole;
  office: string | null;
  position_title: string | null;
  date_hired: string | null;
  status: 'Active' | 'Inactive';
  created_at?: string;
}

export interface DemoOffice {
  id: string;
  name: string;
  sort_order: number;
}

export interface NewAccountInput {
  full_name: string;
  employee_code: string;
  email: string;
  password: string;
  role: DemoRole;
  office: string | null;
  position_title: string;
  date_hired: string | null;
}

export const roleLabel = (role: DemoRole): string =>
  DEMO_ROLES.find((r) => r.value === role)?.label ?? role;
