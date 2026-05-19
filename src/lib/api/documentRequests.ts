/**
 * Document Requests API
 *
 * "Document requests" are HR-issued document obligations stored in
 * employee_documents with category='hr_request' (see migration 006).
 * Status flow: Pending → Submitted → Approved | Rejected.
 *
 * Enriches each row with the employee's name + department via a second read
 * of employees_with_department (PostgREST embedded joins through views are
 * unreliable, so we merge in JS).
 */

import { supabase as supabaseClient } from '../../lib/supabase';
import { dispatchEmployeeDocumentsUpdated, type RequestSource } from '../employeeDocuments';

const supabase = supabaseClient as any;

export type DocRequestStatus = 'Pending' | 'Submitted' | 'Approved' | 'Rejected';

export interface DocumentRequest {
  id: string;
  employee_id: string;
  document_type: string;
  document_name: string;
  status: DocRequestStatus;
  request_source: RequestSource | null;
  due_date: string | null;
  requested_by: string | null;
  description: string | null;
  uploaded_at: string;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  employee_name?: string | null;
  department?: string | null;
}

export async function getDocumentRequests(filters?: { source?: RequestSource }) {
  try {
    let query = supabase
      .from('employee_documents')
      .select('id, employee_id, document_type, document_name, status, request_source, due_date, requested_by, description, uploaded_at, file_url, file_name, file_type')
      .eq('category', 'hr_request');

    if (filters?.source) {
      query = query.eq('request_source', filters.source);
    }

    const { data: rows, error } = await query.order('due_date', { ascending: true, nullsFirst: false });

    if (error) throw error;

    const requestRows = (Array.isArray(rows) ? rows : []) as DocumentRequest[];
    if (requestRows.length === 0) return { success: true, data: [] as DocumentRequest[] };

    const ids = Array.from(new Set(requestRows.map(r => r.employee_id))).filter(Boolean);
    const { data: employees } = await supabase
      .from('employees_with_department')
      .select('id, full_name, department')
      .in('id', ids);

    const empById = new Map<string, any>();
    for (const e of (employees ?? []) as any[]) empById.set(e.id, e);

    return {
      success: true,
      data: requestRows.map(r => {
        const e = empById.get(r.employee_id);
        return {
          ...r,
          employee_name: e?.full_name ?? null,
          department: e?.department ?? null,
        };
      }),
    };
  } catch (error) {
    console.error('Error fetching document requests:', error);
    return { success: false, error: String(error), data: [] as DocumentRequest[] };
  }
}

/** KPI tallies: Total / Pending / Overdue / Approved. */
export function summarizeRequests(rows: DocumentRequest[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let total = 0;
  let pending = 0;
  let overdue = 0;
  let approved = 0;

  for (const r of rows) {
    total++;
    if (r.status === 'Pending') pending++;
    if (r.status === 'Approved') approved++;
    if (r.status === 'Pending' && r.due_date) {
      const due = new Date(r.due_date);
      if (!Number.isNaN(due.getTime()) && due < today) overdue++;
    }
  }
  return { total, pending, overdue, approved };
}

/**
 * Approve or reject a submitted document request. Fires the portal refresh
 * event so any open Submission Bin re-renders (Rejected rows automatically
 * fall back into the employee's pendingRequests list).
 */
export async function updateDocumentRequestStatus(
  id: string,
  status: 'Approved' | 'Rejected',
): Promise<{ success: true; row: DocumentRequest } | { success: false; error: string }> {
  if (!id) return { success: false, error: 'Missing request id.' };

  const { data, error } = await supabase
    .from('employee_documents')
    .update({ status })
    .eq('id', id)
    .select('id, employee_id, document_type, document_name, status, request_source, due_date, requested_by, description, uploaded_at, file_url, file_name, file_type')
    .single();

  if (error) {
    console.error('updateDocumentRequestStatus: update failed', error);
    return { success: false, error: error.message ?? 'Could not update the request status.' };
  }

  dispatchEmployeeDocumentsUpdated();
  return { success: true, row: data as DocumentRequest };
}

/** Group requests by department for the Documents table. */
export function groupRequestsByDepartment(rows: DocumentRequest[]) {
  const byDept = new Map<string, DocumentRequest[]>();
  for (const r of rows) {
    const dept = r.department ?? 'Unassigned';
    const list = byDept.get(dept);
    if (list) list.push(r);
    else byDept.set(dept, [r]);
  }
  return Array.from(byDept.entries())
    .map(([department, requests]) => ({ department, requests }))
    .sort((a, b) => a.department.localeCompare(b.department));
}
