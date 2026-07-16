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

// ── Workflow state machine (Stages 2–8) ─────────────────────────────────────
// One ipcr_schedules row per employee; `status` walks these values in order.
export type ScheduleStatus =
  | 'Phase1 Open'        // PM opened Phase 1 + notified — employee form is fillable
  | 'Phase1 Submitted'  // employee submitted targets — awaiting office review
  | 'Phase1 Verified'   // supervisor verified & forwarded — awaiting PM storage
  | 'Phase1 Locked'     // PM accepted & locked into the vault
  | 'Phase2 Open'        // PM opened Phase 2 + notified — accomplishment form fillable
  | 'Phase2 Submitted'  // employee submitted accomplishments — awaiting office review
  | 'Phase2 Verified'   // supervisor verified & forwarded — awaiting PM close
  | 'Cycle Completed';  // PM closed the cycle

export const TARGET_CATEGORIES = ['Core Function', 'Support Function', 'Strategic Priority'] as const;
export type TargetCategory = (typeof TARGET_CATEGORIES)[number];

export interface Schedule {
  id: string;
  employee_id: string;
  cycle_type: 'Regular' | 'Probationary';
  phase: number;
  phase_start_date: string | null;
  phase_due_date: string | null;
  status: ScheduleStatus;
  created_at?: string;
}

export interface TargetRow {
  id: string;
  employee_id: string;
  schedule_id: string | null;
  mfo_pap: string | null;
  success_indicator: string | null;
  category: TargetCategory | null;
  item_weight_pct: number | null;
  category_weight_pct: number | null;
  original_mfo_pap: string | null;
  original_success_indicator: string | null;
  revised_mfo_pap: string | null;
  revised_success_indicator: string | null;
  is_revised: boolean;
  revised_by: string | null;
  revision_remarks: string | null;
  created_at?: string;
}

export interface AccomplishmentRow {
  id: string;
  target_id: string;
  employee_id: string;
  actual_accomplishment: string | null;
  q_rating: number | null;
  e_rating: number | null;
  t_rating: number | null;
  original_accomplishment: string | null;
  revised_accomplishment: string | null;
  is_revised: boolean;
  revised_by: string | null;
  revision_remarks: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
}

export interface DemoNotification {
  id: string;
  recipient_role: string | null;
  recipient_id: string | null;
  message: string;
  type: string | null;
  is_read: boolean;
  created_at: string;
}

export interface VaultRow {
  id: string;
  employee_id: string;
  schedule_id: string | null;
  locked_at: string;
  locked_by: string | null;
  phase2_eligible_date: string | null;
}

export interface CycleState {
  offset_days: number;
  simulated_date: string | null;
  phase1_status: 'Closed' | 'Open';
  phase2_status: 'Closed' | 'Open';
}

/** The official (post-review) text of a target field — revised wins if present. */
export const officialMfo = (t: TargetRow): string =>
  (t.is_revised && t.revised_mfo_pap ? t.revised_mfo_pap : t.mfo_pap) ?? '';
export const officialIndicator = (t: TargetRow): string =>
  (t.is_revised && t.revised_success_indicator ? t.revised_success_indicator : t.success_indicator) ?? '';
export const officialAccomplishment = (a: AccomplishmentRow): string =>
  (a.is_revised && a.revised_accomplishment ? a.revised_accomplishment : a.actual_accomplishment) ?? '';

/** Human-friendly status banner text per schedule status. */
export const STATUS_BANNER: Record<ScheduleStatus, string> = {
  'Phase1 Open': 'Target Setting is open — fill in and submit your targets.',
  'Phase1 Submitted': 'Submitted — Awaiting Office Account Review',
  'Phase1 Verified': 'Targets verified by Office Account. Pending PM storage.',
  'Phase1 Locked': 'Targets locked in the Cold Storage Vault.',
  'Phase2 Open': 'Accomplishment Rating is open — fill in your accomplishments.',
  'Phase2 Submitted': 'Submitted — Awaiting Office Account Review',
  'Phase2 Verified': 'Accomplishments verified by Office Account. Pending PM review.',
  'Cycle Completed': 'Cycle Completed',
};
