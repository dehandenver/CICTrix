/**
 * IPCR Phase 1 — Office Account approval actions.
 *
 * Wires the Office Account Portal to the real target_settings workflow added in
 * 20260715_ipcr_phase1_workflow_phase2.sql. Writes go through Supabase directly
 * for now; the immutability of APPROVED records is already enforced by a DB
 * trigger, and the self-approval block is applied here (client-side) until the
 * FastAPI hardening lands.
 *
 * Note: submissions are not yet scoped to the approver's office — the
 * employee→office link is a plain department name today. This lists every
 * pending IPCR; office-scoping is a follow-up.
 */
import { supabase } from '../supabase';

export interface PendingIndicator {
  id: string;
  description: string;
}
export interface PendingMfo {
  id: string;
  functionType: 'core' | 'strategic' | 'support';
  title: string;
  indicators: PendingIndicator[];
}
export interface PendingApproval {
  targetSettingId: string;
  employeeId: string;
  employeeName: string;
  department: string | null;
  position: string | null;
  submittedAt: string | null;
  mfos: PendingMfo[];
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function writeAudit(entry: {
  target_setting_id: string;
  action: string;
  performed_by: string | null;
  performed_by_role: string;
  reason?: string | null;
}): Promise<void> {
  try {
    await (supabase as any).from('ipcr_audit_log').insert({
      target_setting_id: entry.target_setting_id,
      action: entry.action,
      performed_by: entry.performed_by,
      performed_by_role: entry.performed_by_role,
      reason: entry.reason ?? null,
    });
  } catch (err) {
    // Audit is best-effort; never block the primary action on it.
    console.warn('[ipcrApproval] audit write failed:', err);
  }
}

/** Every IPCR awaiting approval, with its submitter and frozen-candidate targets. */
export async function listPendingApprovals(): Promise<Result<PendingApproval[]>> {
  try {
    const { data: settings, error } = await (supabase as any)
      .from('target_settings')
      .select('id, employee_id, submitted_at')
      .eq('status', 'submitted_for_approval')
      .order('submitted_at', { ascending: true });
    if (error) return { ok: false, error: error.message };
    if (!settings?.length) return { ok: true, data: [] };

    const empIds = [...new Set(settings.map((s: any) => s.employee_id))];
    const { data: emps } = await (supabase as any)
      .from('employees_with_department')
      .select('id, full_name, current_department, current_position')
      .in('id', empIds);
    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));

    const { data: mfoRows } = await (supabase as any)
      .from('mfos')
      .select('id, target_setting_id, function_type, title, sort_order, success_indicators(id, description, sort_order)')
      .in('target_setting_id', settings.map((s: any) => s.id))
      .order('sort_order', { ascending: true });

    const byId = new Map<string, PendingApproval>();
    for (const s of settings as any[]) {
      const e: any = empMap.get(s.employee_id);
      byId.set(s.id, {
        targetSettingId: s.id,
        employeeId: s.employee_id,
        employeeName: (e?.full_name ?? '(unknown employee)').trim(),
        department: e?.current_department ?? null,
        position: e?.current_position ?? null,
        submittedAt: s.submitted_at,
        mfos: [],
      });
    }
    for (const m of (mfoRows ?? []) as any[]) {
      const p = byId.get(m.target_setting_id);
      if (!p) continue;
      p.mfos.push({
        id: m.id,
        functionType: m.function_type,
        title: m.title,
        indicators: ((m.success_indicators ?? []) as any[])
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((si) => ({ id: si.id, description: si.description })),
      });
    }
    return { ok: true, data: [...byId.values()] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to load pending approvals.' };
  }
}

/** Approve and freeze. Blocks self-approval (dual-role users). */
export async function approveTargets(p: {
  targetSettingId: string;
  approverEmployeeId: string | null;
  submitterEmployeeId: string;
}): Promise<Result<null>> {
  if (p.approverEmployeeId && p.approverEmployeeId === p.submitterEmployeeId) {
    return { ok: false, error: 'You cannot approve your own IPCR.' };
  }
  try {
    const { error } = await (supabase as any)
      .from('target_settings')
      .update({
        status: 'approved',
        approved_by: p.approverEmployeeId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', p.targetSettingId)
      .eq('status', 'submitted_for_approval'); // only a pending record can be approved
    if (error) return { ok: false, error: error.message };
    await writeAudit({
      target_setting_id: p.targetSettingId,
      action: 'approve',
      performed_by: p.approverEmployeeId,
      performed_by_role: 'office_account',
    });
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Approve failed.' };
  }
}

/** Send back to the employee with a comment. Blocks acting on your own IPCR. */
export async function returnForRevision(p: {
  targetSettingId: string;
  approverEmployeeId: string | null;
  submitterEmployeeId: string;
  comment: string;
}): Promise<Result<null>> {
  if (p.approverEmployeeId && p.approverEmployeeId === p.submitterEmployeeId) {
    return { ok: false, error: 'You cannot return your own IPCR.' };
  }
  try {
    const { error } = await (supabase as any)
      .from('target_settings')
      .update({
        status: 'returned_for_revision',
        returned_at: new Date().toISOString(),
        review_comment: p.comment?.trim() || null,
      })
      .eq('id', p.targetSettingId)
      .eq('status', 'submitted_for_approval');
    if (error) return { ok: false, error: error.message };
    await writeAudit({
      target_setting_id: p.targetSettingId,
      action: 'return',
      performed_by: p.approverEmployeeId,
      performed_by_role: 'office_account',
      reason: p.comment?.trim() || null,
    });
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Return failed.' };
  }
}
