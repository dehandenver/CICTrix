import { supabase } from '../supabase';

/**
 * External appointment boundary.
 *
 * An external hire creates a new employee row, fills the reserved plantilla,
 * marks the applicant Hired, and records one hire history entry in a single
 * transaction via `complete_external_hire` (migration 20261120160156). Replays
 * return `already_completed: true` without creating another employee. This
 * module never falls back to FastAPI or client-side table inserts.
 */

// The RPC is not in the generated database types yet.
const client = supabase as any;

export const EXTERNAL_HIRE_RPC_TIMEOUT_MS = 30_000;

const RPC_NAME = 'complete_external_hire';

export type ExternalHireResult = {
  applicantId: string;
  employeeUuid: string;
  employeeNumber: string;
  slotId: string;
  completedAt: string;
  alreadyCompleted: boolean;
};

export type ExternalHireErrorKind =
  /** The database refused with a known reason; nothing was written. */
  | 'rejected'
  | 'not_authorized'
  /** The migration that defines the RPC has not reached this database. */
  | 'not_deployed'
  /** Another database error; the transaction rolled back. */
  | 'failed'
  /** A lock wait timed out or conflicted; the transaction rolled back and a retry may succeed. */
  | 'busy'
  /** No usable answer. The transaction may or may not have committed. */
  | 'uncertain'
  /** The appointment committed but the employee record could not be read back. */
  | 'employee_read_failed';

export class ExternalHireError extends Error {
  readonly kind: ExternalHireErrorKind;
  readonly code: string | null;
  readonly hint: string | null;
  /** True when trying again is safe and may succeed. Replays never hire twice. */
  readonly retryable: boolean;

  constructor(
    message: string,
    details: {
      kind?: ExternalHireErrorKind;
      code?: string | null;
      hint?: string | null;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'ExternalHireError';
    this.kind = details.kind ?? 'rejected';
    this.code = details.code ?? null;
    this.hint = details.hint ?? null;
    this.retryable = details.retryable ?? false;
  }
}

/** HINT values the function raises with SQLSTATE P0001. */
const REJECTION_HINTS = new Set([
  'application_not_found',
  'is_promotion',
  'slot_missing',
  'slot_filled_elsewhere',
  'slot_reserved_elsewhere',
  'not_reserved',
  'posting_missing',
  'office_inactive',
  'office_ambiguous',
  'plantilla_ambiguous',
  'employee_number_conflict',
  'email_conflict',
  'partial_completion',
  'concurrent_change',
]);

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);
const NOT_AUTHORIZED_CODES = new Set(['42501', 'PGRST301', 'PGRST302']);
const BUSY_CODES = new Set(['57014', '40P01', '40001', '55P03']);
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

const NOT_AUTHORIZED_MESSAGE =
  'You are not authorized to complete external hires. Sign in as an RSP or admin user and try again.';
const NOT_DEPLOYED_MESSAGE =
  'The external hiring update has not been deployed to this database yet. Ask your administrator to apply the latest database migration, then try again.';
const UNCERTAIN_MESSAGE =
  "We couldn't confirm the result of this hire. Check your connection and retry. Retrying is safe and will not hire the applicant twice.";
const BUSY_MESSAGE =
  'Someone else was updating this record or plantilla at the same time, so nothing was saved. Try again in a moment. Retrying is safe and will not hire the applicant twice.';

const uncertain = (code: string | null = null): ExternalHireError =>
  new ExternalHireError(UNCERTAIN_MESSAGE, { kind: 'uncertain', code, retryable: true });

const text = (value: unknown): string => (value == null ? '' : String(value).trim());

const classifyRpcError = (error: any): ExternalHireError => {
  const code = text(error?.code);
  const hint = text(error?.hint);
  const message = text(error?.message);

  if (MISSING_FUNCTION_CODES.has(code)) {
    return new ExternalHireError(NOT_DEPLOYED_MESSAGE, { kind: 'not_deployed', code });
  }
  if (hint === 'not_authorized' || NOT_AUTHORIZED_CODES.has(code)) {
    return new ExternalHireError(
      hint === 'not_authorized' && message ? message : NOT_AUTHORIZED_MESSAGE,
      { kind: 'not_authorized', code, hint: hint || null },
    );
  }
  if (REJECTION_HINTS.has(hint) || code === 'P0001') {
    return new ExternalHireError(
      message || `The external hire could not be completed (${hint || 'rejected'}).`,
      { kind: 'rejected', code, hint: hint || null },
    );
  }
  if (BUSY_CODES.has(code)) {
    return new ExternalHireError(BUSY_MESSAGE, { kind: 'busy', code, retryable: true });
  }
  if (SQLSTATE_PATTERN.test(code) || code.startsWith('PGRST')) {
    return new ExternalHireError(
      message || 'The external hire could not be completed.',
      { kind: 'failed', code, hint: hint || null },
    );
  }
  return uncertain(code || null);
};

const toResult = (row: any): ExternalHireResult | null => {
  const employeeUuid = text(row?.employee_uuid);
  const employeeNumber = text(row?.employee_number);
  if (!employeeUuid || !employeeNumber) return null;
  return {
    applicantId: text(row?.applicant_id),
    employeeUuid,
    employeeNumber,
    slotId: text(row?.slot_id),
    completedAt: text(row?.completed_at),
    alreadyCompleted: row?.already_completed === true,
  };
};

/**
 * Complete an external appointment for one reserved application. Throws
 * ExternalHireError on every non-success. The caller never supplies an actor;
 * the database takes it from the signed-in session.
 */
export async function completeExternalHire(applicantId: string): Promise<ExternalHireResult> {
  const id = text(applicantId);
  if (!id) {
    throw new ExternalHireError('An application is required to complete an external hire.', {
      kind: 'rejected',
      hint: 'application_not_found',
    });
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, EXTERNAL_HIRE_RPC_TIMEOUT_MS);

  let response: { data: unknown; error: unknown };
  try {
    response = await client.rpc(RPC_NAME, { p_applicant_id: id }).abortSignal(controller.signal);
  } catch {
    throw uncertain();
  } finally {
    clearTimeout(timer);
  }

  if (timedOut) throw uncertain();
  if (response?.error) throw classifyRpcError(response.error);

  const result = toResult(response?.data);
  if (!result) throw uncertain();
  return result;
}
