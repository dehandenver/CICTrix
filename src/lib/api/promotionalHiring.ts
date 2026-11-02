import { supabase } from '../supabase';

/**
 * Promotion appointment boundary.
 *
 * A promotion moves an existing employee into a reserved plantilla. The
 * database function `complete_promotional_appointment` does all of it in one
 * transaction (migration 20261102041556) and is safe to repeat: a replay for a
 * completed promotion answers `already_completed: true` and writes nothing.
 * This module is the only browser caller. It has no password, account or
 * external-hire logic, and it never falls back to another write path: a
 * rejection is reported, never worked around.
 */

// The RPC is not in the generated database types yet.
const client = supabase as any;

/**
 * Backstop for a hung connection. The database's own statement timeout for
 * signed-in users is shorter, so a slow lock wait comes back as "busy" first.
 */
export const PROMOTION_RPC_TIMEOUT_MS = 30_000;

const RPC_NAME = 'complete_promotional_appointment';

export type PromotionalAppointmentResult = {
  applicantId: string;
  employeeUuid: string;
  employeeNumber: string;
  slotId: string;
  completedAt: string;
  alreadyCompleted: boolean;
};

export type PromotionalAppointmentErrorKind =
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

export class PromotionalAppointmentError extends Error {
  readonly kind: PromotionalAppointmentErrorKind;
  readonly code: string | null;
  readonly hint: string | null;
  /** True when trying again is safe and may succeed. Replays never appoint twice. */
  readonly retryable: boolean;

  constructor(
    message: string,
    details: {
      kind: PromotionalAppointmentErrorKind;
      code?: string | null;
      hint?: string | null;
      retryable?: boolean;
    },
  ) {
    super(message);
    this.name = 'PromotionalAppointmentError';
    this.kind = details.kind;
    this.code = details.code ?? null;
    this.hint = details.hint ?? null;
    this.retryable = details.retryable ?? false;
  }
}

/** HINT values the function raises with SQLSTATE P0001. */
const REJECTION_HINTS = new Set([
  'application_not_found',
  'not_promotion',
  'employee_not_found',
  'employee_ambiguous',
  'account_missing',
  'account_ambiguous',
  'slot_missing',
  'slot_filled_elsewhere',
  'slot_reserved_elsewhere',
  'not_reserved',
  'assessment_incomplete',
  'posting_missing',
  'office_inactive',
  'office_ambiguous',
  'plantilla_ambiguous',
  'partial_completion',
  'concurrent_change',
]);

const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);
const NOT_AUTHORIZED_CODES = new Set(['42501', 'PGRST301', 'PGRST302']);
// Statement timeout, deadlock, serialization failure, lock not available.
const BUSY_CODES = new Set(['57014', '40P01', '40001', '55P03']);
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

const NOT_AUTHORIZED_MESSAGE =
  'You are not authorized to complete promotional appointments. Sign in as an RSP or admin user and try again.';
const NOT_DEPLOYED_MESSAGE =
  'The promotion update has not been deployed to this database yet. Ask your administrator to apply the latest database migration, then try again.';
// Says neither "failed" nor "completed": the transaction may have committed.
const UNCERTAIN_MESSAGE =
  "We couldn't confirm the result of this promotion. Check your connection and retry. Retrying is safe and will not appoint the employee twice.";

const BUSY_MESSAGE =
  'Someone else was updating this employee or plantilla at the same time, so nothing was saved. Try again in a moment. Retrying is safe and will not appoint the employee twice.';

const uncertain = (code: string | null = null): PromotionalAppointmentError =>
  new PromotionalAppointmentError(UNCERTAIN_MESSAGE, { kind: 'uncertain', code, retryable: true });

const text = (value: unknown): string => (value == null ? '' : String(value).trim());

const classifyRpcError = (error: any): PromotionalAppointmentError => {
  const code = text(error?.code);
  const hint = text(error?.hint);
  const message = text(error?.message);

  if (MISSING_FUNCTION_CODES.has(code)) {
    return new PromotionalAppointmentError(NOT_DEPLOYED_MESSAGE, { kind: 'not_deployed', code });
  }
  if (hint === 'not_authorized' || NOT_AUTHORIZED_CODES.has(code)) {
    return new PromotionalAppointmentError(
      hint === 'not_authorized' && message ? message : NOT_AUTHORIZED_MESSAGE,
      { kind: 'not_authorized', code, hint: hint || null },
    );
  }
  if (REJECTION_HINTS.has(hint) || code === 'P0001') {
    return new PromotionalAppointmentError(
      message || `The promotion could not be completed (${hint || 'rejected'}).`,
      { kind: 'rejected', code, hint: hint || null },
    );
  }
  if (BUSY_CODES.has(code)) {
    return new PromotionalAppointmentError(BUSY_MESSAGE, { kind: 'busy', code, retryable: true });
  }
  // A SQLSTATE or PostgREST code means the database answered, so the
  // transaction rolled back. No code at all is a transport failure.
  if (SQLSTATE_PATTERN.test(code) || code.startsWith('PGRST')) {
    return new PromotionalAppointmentError(
      message || 'The promotion could not be completed.',
      { kind: 'failed', code, hint: hint || null },
    );
  }
  return uncertain(code || null);
};

const toResult = (row: any): PromotionalAppointmentResult | null => {
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
 * Complete a promotion for one application. Throws PromotionalAppointmentError
 * on every non-success. The caller never supplies an actor; the database takes
 * it from the signed-in session.
 */
export async function completePromotionalAppointment(
  applicantId: string,
): Promise<PromotionalAppointmentResult> {
  const id = text(applicantId);
  if (!id) {
    throw new PromotionalAppointmentError('An application is required to complete a promotion.', {
      kind: 'rejected',
      hint: 'application_not_found',
    });
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PROMOTION_RPC_TIMEOUT_MS);

  let response: { data: unknown; error: unknown };
  try {
    response = await client.rpc(RPC_NAME, { p_applicant_id: id }).abortSignal(controller.signal);
  } catch {
    // Fetch rejected or the request was aborted: no response to read.
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
