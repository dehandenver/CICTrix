/**
 * Employee Documents — Supabase-backed API
 *
 * Files live in Storage bucket `employee-documents`.
 * Metadata lives in table `employee_documents`.
 * Joined employee details (full name, department, position, employee_number)
 * come from the `employees` table when listing for the RSP Reports page.
 *
 * No localStorage. Everything is Supabase.
 */

import { supabase } from './supabase';

export const EMPLOYEE_DOCUMENTS_BUCKET = 'employee-documents';

/**
 * Canonical RSP Reports doc-type identifiers, matching the 6 cards on the
 * RSP Reports page exactly. The string value IS the document_type column value.
 */
export const EMPLOYEE_DOC_TYPES = [
  {
    id: 'NBI Clearance',
    label: 'NBI Clearance',
    description: 'Updated NBI Clearance (must be valid for current year).',
  },
  {
    id: 'Medical Certificate',
    label: 'Medical Certificate',
    description: 'Recent medical certificate from an accredited clinic or hospital.',
  },
  {
    id: 'SALN',
    label: 'SALN',
    description: 'Statement of Assets, Liabilities and Net Worth — latest signed copy.',
  },
  {
    id: 'Certificate of Training',
    label: 'Certificate of Training',
    description: 'Certificate from a completed mandatory orientation or skills training.',
  },
  {
    id: 'Performance Evaluation Form',
    label: 'Performance Evaluation Form',
    description: 'Completed and signed latest performance evaluation form.',
  },
  {
    id: 'Updated Resume/CV',
    label: 'Updated Resume/CV',
    description: 'Most recent resume with up-to-date work experience and credentials.',
  },
] as const;

export type EmployeeDocumentType = (typeof EMPLOYEE_DOC_TYPES)[number]['id'];

export type EmployeeDocumentStatus = 'Pending' | 'Approved' | 'Rejected';

export interface EmployeeDocumentRow {
  id: string;
  employee_id: string;
  document_type: string;
  document_name: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  status: EmployeeDocumentStatus;
  uploaded_at: string;
}

/** A document row joined with the submitting employee's profile. */
export interface EmployeeDocumentSubmission extends EmployeeDocumentRow {
  employee_number: string;
  full_name: string;
  position: string;
  department: string;
}

/**
 * Sanitize a file name for use as a Storage object key.
 * Allows letters, digits, dot, underscore, hyphen — replaces everything else.
 */
const sanitizeForKey = (input: string): string => {
  return input.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 120) || 'file';
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a Supabase employee UUID using multiple strategies (in order):
 *   1. If `identifier` is already a UUID, return it.
 *   2. Match `employees.employee_number = identifier`.
 *   3. Match `employees.plantilla_item_number = identifier` (the legacy "ITEM-…" column).
 *   4. If `fallbackEmail` is provided, match `employees.email = fallbackEmail`.
 * Returns null if nothing matches.
 */
export async function resolveEmployeeUuid(
  identifier: string,
  fallbackEmail?: string,
): Promise<string | null> {
  const normalized = String(identifier ?? '').trim();
  const normalizedEmail = String(fallbackEmail ?? '').trim().toLowerCase();

  if (normalized && UUID_REGEX.test(normalized)) {
    return normalized;
  }

  const tryColumn = async (column: string, value: string): Promise<string | null> => {
    if (!value) return null;
    const result = await (supabase as any)
      .from('employees')
      .select('id')
      .eq(column, value)
      .limit(1)
      .maybeSingle();

    if (result.error) {
      // Column might not exist on the schema; that's fine, try the next strategy.
      console.warn(`resolveEmployeeUuid: lookup by ${column} failed`, result.error);
      return null;
    }
    return result.data?.id ?? null;
  };

  if (normalized) {
    const byEmployeeNumber = await tryColumn('employee_number', normalized);
    if (byEmployeeNumber) return byEmployeeNumber;

    const byItemNumber = await tryColumn('plantilla_item_number', normalized);
    if (byItemNumber) return byItemNumber;
  }

  if (normalizedEmail) {
    const byEmail = await tryColumn('email', normalizedEmail);
    if (byEmail) return byEmail;
  }

  return null;
}

/**
 * Upload a file to Storage and insert a metadata row in employee_documents.
 * Accepts a Supabase UUID, a human employee_number, or an email lookup.
 * Returns the inserted row on success.
 */
export async function uploadEmployeeDocument(params: {
  employeeId: string;
  email?: string;
  documentType: EmployeeDocumentType;
  file: File;
}): Promise<{ success: true; row: EmployeeDocumentRow } | { success: false; error: string }> {
  const { employeeId, email, documentType, file } = params;

  if (!employeeId && !email) {
    return { success: false, error: 'Missing employee identifier.' };
  }
  if (!file) {
    return { success: false, error: 'No file selected.' };
  }

  const employeeUuid = await resolveEmployeeUuid(employeeId, email);
  if (!employeeUuid) {
    const queriedFor = [employeeId && `employee_number="${employeeId}"`, email && `email="${email}"`]
      .filter(Boolean)
      .join(' or ');
    return {
      success: false,
      error: `No employee record found in Supabase for ${queriedFor}. Make sure this employee exists in the employees table.`,
    };
  }

  const safeName = sanitizeForKey(file.name);
  const objectKey = `${employeeUuid}/${documentType}/${Date.now()}-${safeName}`;

  // 1) Upload the binary to Storage.
  const uploadResult = await (supabase as any).storage
    .from(EMPLOYEE_DOCUMENTS_BUCKET)
    .upload(objectKey, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });

  if (uploadResult.error) {
    console.error('uploadEmployeeDocument: storage upload failed', uploadResult.error);
    return { success: false, error: uploadResult.error.message || 'Storage upload failed.' };
  }

  // 2) Resolve a public URL for the uploaded object.
  const publicUrlResult = (supabase as any).storage
    .from(EMPLOYEE_DOCUMENTS_BUCKET)
    .getPublicUrl(objectKey);

  const fileUrl: string = publicUrlResult?.data?.publicUrl ?? objectKey;

  // 3) Insert the metadata row.
  const insertPayload = {
    employee_id: employeeUuid,
    document_type: documentType,
    document_name: documentType,
    file_name: file.name,
    file_url: fileUrl,
    file_size: file.size ?? null,
    file_type: file.type || null,
    status: 'Pending' as EmployeeDocumentStatus,
  };

  const insertResult = await (supabase as any)
    .from('employee_documents')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertResult.error) {
    console.error('uploadEmployeeDocument: metadata insert failed', insertResult.error);
    // Best-effort cleanup of the orphaned object.
    await (supabase as any).storage
      .from(EMPLOYEE_DOCUMENTS_BUCKET)
      .remove([objectKey]);
    return { success: false, error: insertResult.error.message || 'Metadata insert failed.' };
  }

  return { success: true, row: insertResult.data as EmployeeDocumentRow };
}

/**
 * List every submission of a given document type, joined with employee profile fields.
 * Used by the RSP Reports detail page (one row per employee per submission).
 */
export async function listEmployeeDocumentsByType(
  documentType: EmployeeDocumentType,
): Promise<EmployeeDocumentSubmission[]> {
  const docResult = await (supabase as any)
    .from('employee_documents')
    .select('*')
    .eq('document_type', documentType)
    .order('uploaded_at', { ascending: false });

  if (docResult.error) {
    console.error('listEmployeeDocumentsByType: fetch failed', docResult.error);
    throw new Error(
      `Could not fetch employee_documents (${docResult.error.message ?? 'unknown error'}). ` +
      `Make sure migration 004_employee_documents_uploads.sql has been applied to Supabase.`,
    );
  }

  const rows = (docResult.data || []) as EmployeeDocumentRow[];
  if (rows.length === 0) return [];

  const employeeIds = Array.from(new Set(rows.map((r) => r.employee_id).filter(Boolean)));

  const empResult = await (supabase as any)
    .from('employees')
    .select('id, employee_number, first_name, last_name, position, department')
    .in('id', employeeIds);

  if (empResult.error) {
    console.error('listEmployeeDocumentsByType: employee join failed', empResult.error);
  }

  const employeeById = new Map<string, any>();
  for (const emp of (empResult.data || []) as any[]) {
    employeeById.set(emp.id, emp);
  }

  return rows.map((row) => {
    const emp = employeeById.get(row.employee_id);
    const fullName = emp
      ? [emp.first_name, emp.last_name].filter(Boolean).join(' ').trim() || 'Unknown Employee'
      : 'Unknown Employee';
    return {
      ...row,
      employee_number: emp?.employee_number ?? '—',
      full_name: fullName,
      position: emp?.position ?? 'Unassigned Position',
      department: emp?.department ?? 'Unassigned Department',
    } satisfies EmployeeDocumentSubmission;
  });
}

/**
 * List documents for a single employee (Employee Portal: Submission Bin).
 */
export async function listEmployeeDocumentsForEmployee(
  employeeId: string,
  email?: string,
): Promise<EmployeeDocumentRow[]> {
  if (!employeeId && !email) return [];

  const employeeUuid = await resolveEmployeeUuid(employeeId, email);
  if (!employeeUuid) return [];

  const result = await (supabase as any)
    .from('employee_documents')
    .select('*')
    .eq('employee_id', employeeUuid)
    .order('uploaded_at', { ascending: false });

  if (result.error) {
    console.error('listEmployeeDocumentsForEmployee: fetch failed', result.error);
    return [];
  }

  return (result.data || []) as EmployeeDocumentRow[];
}

/**
 * Delete a document row plus its underlying Storage object.
 * Used when an employee replaces a previously submitted file.
 */
export async function deleteEmployeeDocument(documentId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!documentId) return { success: false, error: 'Missing document id.' };

  const fetchResult = await (supabase as any)
    .from('employee_documents')
    .select('file_url')
    .eq('id', documentId)
    .single();

  if (fetchResult.error || !fetchResult.data) {
    console.error('deleteEmployeeDocument: lookup failed', fetchResult.error);
    return { success: false, error: fetchResult.error?.message || 'Document not found.' };
  }

  const fileUrl: string = fetchResult.data.file_url || '';
  const objectKey = extractObjectKey(fileUrl);

  if (objectKey) {
    const removeResult = await (supabase as any).storage
      .from(EMPLOYEE_DOCUMENTS_BUCKET)
      .remove([objectKey]);
    if (removeResult.error) {
      console.warn('deleteEmployeeDocument: storage remove failed (continuing)', removeResult.error);
    }
  }

  const deleteResult = await (supabase as any)
    .from('employee_documents')
    .delete()
    .eq('id', documentId);

  if (deleteResult.error) {
    console.error('deleteEmployeeDocument: row delete failed', deleteResult.error);
    return { success: false, error: deleteResult.error.message };
  }

  return { success: true };
}

/**
 * Trigger a browser download for a given document URL using its preferred filename.
 */
export async function downloadEmployeeDocument(submission: {
  file_url: string;
  file_name: string;
}): Promise<void> {
  try {
    const response = await fetch(submission.file_url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = submission.file_name || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('downloadEmployeeDocument: failed, falling back to direct link', error);
    window.open(submission.file_url, '_blank', 'noopener');
  }
}

/**
 * Best-effort extraction of the Storage object key from a public URL.
 * Public URLs follow the pattern `{base}/storage/v1/object/public/{bucket}/{key}`.
 */
const extractObjectKey = (fileUrl: string): string | null => {
  if (!fileUrl) return null;
  const marker = `/${EMPLOYEE_DOCUMENTS_BUCKET}/`;
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) {
    // The url may already be a raw object key (fallback path).
    return fileUrl.includes('/') ? fileUrl : null;
  }
  return fileUrl.slice(idx + marker.length);
};

/**
 * Window-level event so any open page can refresh after a document changes.
 */
export const EMPLOYEE_DOCUMENTS_UPDATED_EVENT = 'cictrix:employee-documents-updated';

export const dispatchEmployeeDocumentsUpdated = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EMPLOYEE_DOCUMENTS_UPDATED_EVENT));
};
