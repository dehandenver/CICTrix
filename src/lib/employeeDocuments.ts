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

/**
 * Application documents shown on the Employee Portal "Document Requirements" tab.
 * The string `id` IS the document_type column value (must match the CHECK
 * constraint in migration 006_employee_document_requests.sql).
 */
export const APPLICATION_DOC_TYPES = [
  {
    id: 'Resume / Curriculum Vitae',
    label: 'Resume / Curriculum Vitae',
    description: 'Your most recent resume or CV submitted with your application.',
  },
  {
    id: 'Application Letter',
    label: 'Application Letter',
    description: 'The application or cover letter you submitted for this position.',
  },
  {
    id: 'Transcript of Records',
    label: 'Transcript of Records',
    description: 'Official transcript of records from your school or university.',
  },
  {
    id: 'Other Relevant Documents',
    label: 'Other Relevant Documents',
    description: 'Any additional supporting documents relevant to your application.',
  },
] as const;

export type ApplicationDocumentType = (typeof APPLICATION_DOC_TYPES)[number]['id'];

export type EmployeeDocumentStatus = 'Pending' | 'Submitted' | 'Approved' | 'Rejected';

/**
 * Routes a row to the correct Employee Portal tab:
 *   'application' -> Document Requirements tab
 *   'compliance'  -> RSP Reports pipeline (NBI, Medical, SALN, ...)
 *   'hr_request'  -> Submission Bin tab (HR-created, carries a due date)
 */
export type EmployeeDocumentCategory = 'application' | 'compliance' | 'hr_request';

export type RequestSource = 'HR' | 'PM' | 'LND';

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
  category: EmployeeDocumentCategory;
  request_source: RequestSource | null;
  due_date: string | null;
  requested_by: string | null;
  description: string | null;
  uploaded_at: string;
}

/** A document row joined with the submitting employee's profile. */
export interface EmployeeDocumentSubmission extends EmployeeDocumentRow {
  employee_number: string;
  full_name: string;
  position: string;
  department: string;
}

/** Helper used by callers that show "No employee record found" errors. */
const buildLookupErrorMessage = (employeeId: string, email?: string): string => {
  const queriedFor = [
    employeeId && `employee_id="${employeeId}"`,
    email && `email="${email}"`,
  ]
    .filter(Boolean)
    .join(' or ');
  return `No employee record found in Supabase for ${queriedFor}. Make sure this employee exists in the employees table.`;
};

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
 *   2. Match `employees.employee_id = identifier`.
 *   3. If `fallbackEmail` is provided, match `employees.email = fallbackEmail`.
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
      console.warn(`resolveEmployeeUuid: lookup by ${column} failed`, result.error);
      return null;
    }
    return result.data?.id ?? null;
  };

  if (normalized) {
    const byEmployeeId = await tryColumn('employee_id', normalized);
    if (byEmployeeId) return byEmployeeId;
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
  documentType: string;
  file: File;
  /** Which Employee Portal tab this upload belongs to. Defaults to 'compliance'. */
  category?: EmployeeDocumentCategory;
  /**
   * When set, the upload *fulfills* an existing hr_request row: the row is
   * updated in place (file fields set, status -> 'Submitted') instead of
   * inserting a new row. Used by the Submission Bin's Upload / Resubmit buttons.
   */
  requestId?: string;
}): Promise<{ success: true; row: EmployeeDocumentRow } | { success: false; error: string }> {
  const { employeeId, email, documentType, file, category = 'compliance', requestId } = params;

  if (!employeeId && !email) {
    return { success: false, error: 'Missing employee identifier.' };
  }
  if (!file) {
    return { success: false, error: 'No file selected.' };
  }

  const employeeUuid = await resolveEmployeeUuid(employeeId, email);
  if (!employeeUuid) {
    return {
      success: false,
      error: buildLookupErrorMessage(employeeId, email),
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

  const fileFields = {
    file_name: file.name,
    file_url: fileUrl,
    file_size: file.size ?? null,
    file_type: file.type || null,
    uploaded_at: new Date().toISOString(),
  };

  // 3a) Fulfilling an existing HR request — update that row in place.
  if (requestId) {
    const updateResult = await (supabase as any)
      .from('employee_documents')
      .update({ ...fileFields, status: 'Submitted' as EmployeeDocumentStatus })
      .eq('id', requestId)
      .select('*')
      .single();

    if (updateResult.error) {
      console.error('uploadEmployeeDocument: request fulfillment update failed', updateResult.error);
      await (supabase as any).storage.from(EMPLOYEE_DOCUMENTS_BUCKET).remove([objectKey]);
      return { success: false, error: updateResult.error.message || 'Could not attach file to the request.' };
    }

    return { success: true, row: updateResult.data as EmployeeDocumentRow };
  }

  // 3b) Fresh upload — insert a new metadata row.
  const insertPayload = {
    employee_id: employeeUuid,
    document_type: documentType,
    document_name: documentType,
    category,
    status: 'Pending' as EmployeeDocumentStatus,
    ...fileFields,
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
 * HR creates a document request for an employee (Submission Bin).
 * Inserts a row with category='hr_request', status='Pending' and no file —
 * the employee later fulfills it via uploadEmployeeDocument({ requestId }).
 */
export async function createDocumentRequest(params: {
  employeeId: string;
  email?: string;
  documentName: string;
  description: string;
  dueDate: string;
  requestedBy: string;
  source?: RequestSource;
}): Promise<{ success: true; row: EmployeeDocumentRow } | { success: false; error: string }> {
  const { employeeId, email, documentName, description, dueDate, requestedBy, source = 'HR' } = params;

  if (!documentName.trim()) {
    return { success: false, error: 'Document name is required.' };
  }

  const employeeUuid = await resolveEmployeeUuid(employeeId, email);
  if (!employeeUuid) {
    return {
      success: false,
      error: 'No matching employee record found in Supabase for this request.',
    };
  }

  const insertPayload = {
    employee_id: employeeUuid,
    document_type: 'Other Relevant Documents',
    document_name: documentName.trim(),
    category: 'hr_request' as EmployeeDocumentCategory,
    request_source: source,
    status: 'Pending' as EmployeeDocumentStatus,
    description: description.trim() || null,
    due_date: dueDate || null,
    requested_by: requestedBy.trim() || null,
  };

  const insertResult = await (supabase as any)
    .from('employee_documents')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertResult.error) {
    console.error('createDocumentRequest: insert failed', insertResult.error);
    return { success: false, error: insertResult.error.message || 'Could not create the document request.' };
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
    .from('employees_with_department')
    .select('id, employee_id, full_name, current_position, department')
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
    return {
      ...row,
      // `employee_number` field name kept for back-compat with consumers
      // (RSP Reports detail page) — value comes from the Schema B `employee_id` column.
      employee_number: emp?.employee_id ?? '—',
      full_name: emp?.full_name ?? 'Unknown Employee',
      position: emp?.current_position ?? 'Unassigned Position',
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
