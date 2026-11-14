/**
 * IPCR audit trail.
 *
 * Every approve, return, edit, submit and rating writes one row to the
 * append-only ipcr_audit_log (migration 20260715). This module is the single
 * place that writes those rows and the one place that reads them back for the
 * Office Account History tabs.
 */
import { supabase } from '../supabase';
import { type OfficeScope, getAcceptedOfficeNames, norm } from './officeScope';

/** The two IPCR phases the console reviews. Mirrors the PM tracker's `phase`. */
export type AuditPhase = 'target' | 'rating';

/**
 * Which phase an audit action belongs to. The log has no phase column, so the
 * action name carries it; a new action must be listed here to show in History.
 */
export const AUDIT_ACTIONS: Record<AuditPhase, readonly string[]> = {
  target: ['submit', 'approve', 'return', 'admin_edit'],
  rating: ['rate', 'return_phase2', 'admin_edit_ratings'],
};

/** Reasons logged for Phase 2 saves that are not a submission; History hides them. */
export const REASON_SELF_RATING_DRAFT = 'Phase 2 self-rating draft';
export const REASON_PARTIAL_SAVE = 'Phase 2 partial save';
export const AUDIT_DRAFT_REASONS = [REASON_SELF_RATING_DRAFT, REASON_PARTIAL_SAVE] as const;

/** Appended to a success banner when the action worked but its audit row did not save. */
export const AUDIT_FAILED_NOTE = ' Saved, but the history entry could not be recorded.';

/** The banner text for an action: `text`, plus the warning when its audit row was lost. */
export const withAuditNote = (text: string, result: { auditFailed?: boolean }): string =>
  result.auditFailed ? `${text}${AUDIT_FAILED_NOTE}` : text;

export interface AuditEntryInput {
  target_setting_id: string;
  action: string;
  performed_by: string | null;
  performed_by_role: 'employee' | 'office_account';
  reason?: string | null;
}

/**
 * Append one audit row. Resolves true when it saved. It never throws and never
 * blocks the action it records: a failure is logged and reported to the caller,
 * which tells the reviewer.
 */
export async function writeAuditEntry(entry: AuditEntryInput): Promise<boolean> {
  try {
    const { error } = await (supabase as any).from('ipcr_audit_log').insert({
      target_setting_id: entry.target_setting_id,
      action: entry.action,
      performed_by: entry.performed_by,
      performed_by_role: entry.performed_by_role,
      reason: entry.reason ?? null,
    });
    if (error) {
      console.warn('[ipcrAudit] audit write failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[ipcrAudit] audit write failed:', err);
    return false;
  }
}

export interface AuditHistoryEntry {
  id: string;
  createdAt: string;
  action: string;
  reason: string | null;
  targetSettingId: string;
  employeeId: string;
  employeeName: string;
  department: string | null;
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Newest entries returned per phase, after the office scope applies. */
const HISTORY_ROW_LIMIT = 1000;
/**
 * Ids per `.in()` lookup. The ids travel in the URL, and the API rejects a
 * request from about 800 UUIDs, so every lookup is split into chunks.
 */
const LOOKUP_CHUNK = 100;
const UNKNOWN_NAME = '—';
const LOG_COLUMNS = 'id, target_setting_id, action, performed_by, performed_by_role, reason, created_at';
/** PostgREST filter: no reason, or a reason that is not a draft save. A bare `not.in` would drop null reasons. */
const NOT_A_DRAFT = `reason.is.null,reason.not.in.(${AUDIT_DRAFT_REASONS.map((r) => `"${r}"`).join(',')})`;

const chunks = <T,>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / LOOKUP_CHUNK) }, (_, i) =>
    items.slice(i * LOOKUP_CHUNK, (i + 1) * LOOKUP_CHUNK));

type Rows = { rows: any[]; error?: string };

/** `select … where column in (ids)`, one request per chunk of ids. */
async function selectIn(table: string, columns: string, column: string, ids: string[]): Promise<Rows> {
  const rows: any[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await (supabase as any).from(table).select(columns).in(column, part);
    if (error) return { rows: [], error: error.message };
    rows.push(...((data ?? []) as any[]));
  }
  return { rows };
}

/**
 * The phase's audit rows, newest first. With `settingIds` they are limited to
 * those target settings in the query itself, so one office's rows are never
 * crowded out by another's.
 */
async function selectLogRows(phase: AuditPhase, settingIds: string[] | null): Promise<Rows> {
  const base = () =>
    (supabase as any)
      .from('ipcr_audit_log')
      .select(LOG_COLUMNS)
      .in('action', AUDIT_ACTIONS[phase] as string[])
      .or(NOT_A_DRAFT)
      .order('created_at', { ascending: false })
      .limit(HISTORY_ROW_LIMIT);
  const rows: any[] = [];
  for (const part of settingIds ? chunks(settingIds) : [null]) {
    const { data, error } = await (part ? base().in('target_setting_id', part) : base());
    if (error) return { rows: [], error: error.message };
    rows.push(...((data ?? []) as any[]));
  }
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { rows: rows.slice(0, HISTORY_ROW_LIMIT) };
}

/**
 * The audit entries for one phase, newest first, limited to the reviewer's
 * office. The log has no office column, so an office is resolved through its
 * employees' departments, as the pending-approvals list does: office employees,
 * then their target settings, then the log rows for those settings.
 * ipcr_audit_log has no row-level security, so this filter is the only scope.
 */
export async function listAuditHistory(p: {
  phase: AuditPhase;
  scope?: OfficeScope | null;
}): Promise<Result<AuditHistoryEntry[]>> {
  try {
    const acceptedNames = await getAcceptedOfficeNames(p.scope);
    const personById = new Map<string, any>();
    let settingIds: string[] | null = null;
    let employeeBySetting = new Map<string, string>();

    if (acceptedNames) {
      // ilike narrows the query; the exact comparison below keeps the pending list's matching.
      for (const name of acceptedNames) {
        const { data, error } = await (supabase as any)
          .from('employees_with_department')
          .select('id, full_name, current_department')
          .ilike('current_department', `%${name}%`);
        if (error) return { ok: false, error: error.message };
        for (const e of (data ?? []) as any[]) {
          if (acceptedNames.has(norm(e.current_department))) personById.set(e.id, e);
        }
      }
      const found = await selectIn('target_settings', 'id, employee_id', 'employee_id', [...personById.keys()]);
      if (found.error) return { ok: false, error: found.error };
      employeeBySetting = new Map(found.rows.map((s) => [s.id, s.employee_id]));
      settingIds = [...employeeBySetting.keys()];
      if (!settingIds.length) return { ok: true, data: [] };
    }

    const log = await selectLogRows(p.phase, settingIds);
    if (log.error) return { ok: false, error: log.error };
    if (!log.rows.length) return { ok: true, data: [] };

    if (!acceptedNames) {
      const found = await selectIn('target_settings', 'id, employee_id', 'id', [...new Set(log.rows.map((r) => r.target_setting_id))]);
      if (found.error) return { ok: false, error: found.error };
      employeeBySetting = new Map(found.rows.map((s) => [s.id, s.employee_id]));
    }

    const missing = new Set<string>();
    for (const r of log.rows) {
      const employeeId = employeeBySetting.get(r.target_setting_id);
      if (employeeId && !personById.has(employeeId)) missing.add(employeeId);
      if (r.performed_by && !personById.has(r.performed_by)) missing.add(r.performed_by);
    }
    const people = await selectIn('employees_with_department', 'id, full_name, current_department', 'id', [...missing]);
    if (people.error) return { ok: false, error: people.error };
    for (const e of people.rows) personById.set(e.id, e);

    const entries: AuditHistoryEntry[] = [];
    for (const r of log.rows) {
      const employeeId = employeeBySetting.get(r.target_setting_id);
      if (!employeeId) continue;
      const employee = personById.get(employeeId);
      entries.push({
        id: r.id,
        createdAt: r.created_at,
        action: r.action,
        reason: r.reason ?? null,
        targetSettingId: r.target_setting_id,
        employeeId,
        employeeName: (employee?.full_name ?? UNKNOWN_NAME).trim(),
        department: employee?.current_department ?? null,
        actorId: r.performed_by ?? null,
        actorName: (personById.get(r.performed_by)?.full_name ?? UNKNOWN_NAME).trim(),
        actorRole: r.performed_by_role ?? null,
      });
    }
    return { ok: true, data: entries };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load history.' };
  }
}
