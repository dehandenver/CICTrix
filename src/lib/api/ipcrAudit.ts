/**
 * IPCR audit trail.
 *
 * Every approve, return, edit, submit and rating writes one row to the
 * append-only ipcr_audit_log (migration 20260715). This module is the single
 * place that writes those rows and the one place that reads them back for the
 * Office Account History tabs.
 */
import { supabase } from '../supabase';

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
