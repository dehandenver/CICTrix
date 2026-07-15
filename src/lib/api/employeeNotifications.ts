/**
 * Employee-facing notification inbox (migration 20260718 · employee_notifications).
 *
 * The Employee Portal had no per-employee message store — notifications.ts is
 * admin/division-scoped and ipcr_notifications is office-level. This is the inbox
 * behind the Phase 2 "we will notify you when the self-rating period opens"
 * promise. All reads/writes are anon (RLS disabled), same posture as the other
 * IPCR tables; every call is best-effort so a missing table (migration not yet
 * applied) never breaks the portal.
 */
import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export interface EmployeeNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  period: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

/** Recent notifications for an employee (newest first). Empty on any error. */
export async function listEmployeeNotifications(employeeId: string, limit = 30): Promise<EmployeeNotification[]> {
  if (!employeeId) return [];
  try {
    const { data, error } = await supabase
      .from('employee_notifications')
      .select('id, type, title, message, period, link, is_read, created_at')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as EmployeeNotification[];
  } catch {
    return [];
  }
}

/** Mark every unread notification for an employee as read. Best-effort. */
export async function markEmployeeNotificationsRead(employeeId: string): Promise<void> {
  if (!employeeId) return;
  try {
    await supabase.from('employee_notifications').update({ is_read: true }).eq('employee_id', employeeId).eq('is_read', false);
  } catch {
    /* non-fatal */
  }
}

/**
 * Insert notifications in bulk (used when the self-rating period opens for a
 * whole period). De-dupes nothing — callers pass one row per employee.
 */
export async function createNotifications(
  rows: Array<{ employeeId: string; type: string; title: string; message: string; period?: string | null; link?: string | null }>,
): Promise<number> {
  if (!rows.length) return 0;
  try {
    const { data, error } = await supabase
      .from('employee_notifications')
      .insert(
        rows.map((r) => ({
          employee_id: r.employeeId,
          type: r.type,
          title: r.title,
          message: r.message,
          period: r.period ?? null,
          link: r.link ?? '/employee/ipcr-workspace',
        })),
      )
      .select('id');
    if (error) return 0;
    return (data ?? []).length;
  } catch {
    return 0;
  }
}
