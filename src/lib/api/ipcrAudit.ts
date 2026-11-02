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

/** Newest rows read per phase, across every office, before the office scope applies. */
const HISTORY_ROW_LIMIT = 1000;
const UNKNOWN_NAME = '—';

/**
 * The audit entries for one phase, newest first, limited to the reviewer's
 * office. The log has no office column, so each entry is joined to its target
 * setting and that employee's department, as the pending-approvals list does.
 * ipcr_audit_log has no row-level security, so this filter is the only scope.
 */
export async function listAuditHistory(p: {
  phase: AuditPhase;
  scope?: OfficeScope | null;
}): Promise<Result<AuditHistoryEntry[]>> {
  try {
    const { data: logRows, error } = await (supabase as any)
      .from('ipcr_audit_log')
      .select('id, target_setting_id, action, performed_by, performed_by_role, reason, created_at')
      .in('action', AUDIT_ACTIONS[p.phase] as string[])
      .order('created_at', { ascending: false })
      .limit(HISTORY_ROW_LIMIT);
    if (error) return { ok: false, error: error.message };

    const rows = ((logRows ?? []) as any[]).filter((r) => !AUDIT_DRAFT_REASONS.includes(r.reason));
    if (!rows.length) return { ok: true, data: [] };

    const { data: settings, error: sErr } = await (supabase as any)
      .from('target_settings')
      .select('id, employee_id')
      .in('id', [...new Set(rows.map((r) => r.target_setting_id))]);
    if (sErr) return { ok: false, error: sErr.message };
    const employeeBySetting = new Map<string, string>(
      ((settings ?? []) as any[]).map((s) => [s.id, s.employee_id]),
    );

    const peopleIds = new Set<string>(employeeBySetting.values());
    for (const r of rows) if (r.performed_by) peopleIds.add(r.performed_by);
    const { data: people, error: eErr } = await (supabase as any)
      .from('employees_with_department')
      .select('id, full_name, current_department')
      .in('id', [...peopleIds]);
    if (eErr) return { ok: false, error: eErr.message };
    const personById = new Map<string, any>(((people ?? []) as any[]).map((e) => [e.id, e]));

    const acceptedNames = await getAcceptedOfficeNames(p.scope);
    const entries: AuditHistoryEntry[] = [];
    for (const r of rows) {
      const employeeId = employeeBySetting.get(r.target_setting_id);
      const employee = employeeId ? personById.get(employeeId) : undefined;
      if (!employeeId) continue;
      if (acceptedNames) {
        const dept = norm(employee?.current_department);
        if (!dept || !acceptedNames.has(dept)) continue;
      }
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
