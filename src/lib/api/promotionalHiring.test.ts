import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('../supabase', () => ({ supabase: { rpc: rpcMock } }));

import {
  PROMOTION_RPC_TIMEOUT_MS,
  PromotionalAppointmentError,
  completePromotionalAppointment,
} from './promotionalHiring';

const APPLICANT_ID = '09e72c95-0000-4000-8000-000000000001';

const rpcRow = {
  applicant_id: APPLICANT_ID,
  employee_uuid: 'a1b2c3d4-0000-4000-8000-000000000002',
  employee_number: 'EMP-0042',
  slot_id: 'b1b2c3d4-0000-4000-8000-000000000003',
  completed_at: '2026-11-02T08:00:00+00:00',
  already_completed: false,
};

/** supabase-js returns a builder: awaiting it resolves to { data, error }. */
const answerWith = (result: { data: unknown; error: unknown }) => {
  rpcMock.mockImplementation(() => ({ abortSignal: () => Promise.resolve(result) }));
};

const rejectWith = (error: unknown) => {
  rpcMock.mockImplementation(() => ({ abortSignal: () => Promise.reject(error) }));
};

const caught = async (): Promise<PromotionalAppointmentError> => {
  try {
    await completePromotionalAppointment(APPLICANT_ID);
  } catch (error) {
    expect(error).toBeInstanceOf(PromotionalAppointmentError);
    return error as PromotionalAppointmentError;
  }
  throw new Error('expected completePromotionalAppointment to reject');
};

describe('completePromotionalAppointment', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls the RPC with only the applicant id and maps the row to camelCase', async () => {
    answerWith({ data: rpcRow, error: null });

    const result = await completePromotionalAppointment(APPLICANT_ID);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('complete_promotional_appointment', {
      p_applicant_id: APPLICANT_ID,
    });
    expect(result).toEqual({
      applicantId: APPLICANT_ID,
      employeeUuid: rpcRow.employee_uuid,
      employeeNumber: 'EMP-0042',
      slotId: rpcRow.slot_id,
      completedAt: rpcRow.completed_at,
      alreadyCompleted: false,
    });
  });

  it('never sends an actor parameter from the browser', async () => {
    answerWith({ data: rpcRow, error: null });

    await completePromotionalAppointment(APPLICANT_ID);

    const [, params] = rpcMock.mock.calls[0];
    expect(Object.keys(params)).toEqual(['p_applicant_id']);
  });

  it('passes already_completed through for a replay', async () => {
    answerWith({ data: { ...rpcRow, already_completed: true }, error: null });

    const result = await completePromotionalAppointment(APPLICANT_ID);

    expect(result.alreadyCompleted).toBe(true);
  });

  it('refuses a blank applicant id without calling the RPC', async () => {
    await expect(completePromotionalAppointment('  ')).rejects.toBeInstanceOf(
      PromotionalAppointmentError,
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  describe('rejections by the database', () => {
    const rejectedHints = [
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
    ];

    it.each(rejectedHints)('treats %s as a final, readable rejection', async (hint) => {
      answerWith({
        data: null,
        error: { code: 'P0001', hint, message: `Readable message for ${hint}.` },
      });

      const error = await caught();

      expect(error.kind).toBe('rejected');
      expect(error.hint).toBe(hint);
      expect(error.code).toBe('P0001');
      expect(error.retryable).toBe(false);
      expect(error.message).toBe(`Readable message for ${hint}.`);
    });

    it('falls back to a generic message when a rejection carries none', async () => {
      answerWith({ data: null, error: { code: 'P0001', hint: 'not_reserved', message: '' } });

      const error = await caught();

      expect(error.message.length).toBeGreaterThan(0);
      expect(error.retryable).toBe(false);
    });

    it('classifies not_authorized (SQLSTATE 42501 with hint) as not authorized', async () => {
      answerWith({
        data: null,
        error: { code: '42501', hint: 'not_authorized', message: 'Only RSP or ADMIN may do this.' },
      });

      const error = await caught();

      expect(error.kind).toBe('not_authorized');
      expect(error.hint).toBe('not_authorized');
      expect(error.retryable).toBe(false);
    });

    it('classifies a bare permission-denied error (no EXECUTE grant) as not authorized', async () => {
      answerWith({
        data: null,
        error: { code: '42501', message: 'permission denied for function complete_promotional_appointment' },
      });

      const error = await caught();

      expect(error.kind).toBe('not_authorized');
      expect(error.retryable).toBe(false);
    });

    it('classifies an expired session as not authorized', async () => {
      answerWith({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } });

      const error = await caught();

      expect(error.kind).toBe('not_authorized');
      expect(error.retryable).toBe(false);
    });

    it('treats other database errors as final, because the transaction rolled back', async () => {
      answerWith({ data: null, error: { code: '23505', message: 'duplicate key value' } });

      const error = await caught();

      expect(error.kind).toBe('failed');
      expect(error.code).toBe('23505');
      expect(error.retryable).toBe(false);
    });

    it.each([
      ['57014', 'canceling statement due to statement timeout'],
      ['40P01', 'deadlock detected'],
      ['40001', 'could not serialize access due to concurrent update'],
      ['55P03', 'could not obtain lock on row in relation "employees"'],
    ])('treats %s (lock wait or conflict) as busy and safe to retry, without raw database text', async (code, raw) => {
      answerWith({ data: null, error: { code, message: raw } });

      const error = await caught();

      expect(error.kind).toBe('busy');
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(true);
      expect(error.message).not.toContain(raw);
      expect(error.message).toMatch(/try again/i);
    });
  });

  describe('RPC not deployed', () => {
    it.each(['PGRST202', '42883'])('reports an actionable error for %s', async (code) => {
      answerWith({
        data: null,
        error: { code, message: 'Could not find the function public.complete_promotional_appointment' },
      });

      const error = await caught();

      expect(error.kind).toBe('not_deployed');
      expect(error.retryable).toBe(false);
      expect(error.message).toMatch(/has not been deployed/i);
    });
  });

  describe('uncertain outcomes', () => {
    const retryableWording = (message: string) => {
      expect(message).toMatch(/retry/i);
      expect(message).toMatch(/not appoint (the employee )?twice|safe/i);
      // Must not claim either outcome: the transaction may have committed.
      expect(message).not.toMatch(/\b(failed|succeeded|successful|was completed|has been completed)\b/i);
    };

    it('treats a network failure reported on the error object as retryable', async () => {
      answerWith({
        data: null,
        error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
      });

      const error = await caught();

      expect(error.kind).toBe('uncertain');
      expect(error.retryable).toBe(true);
      retryableWording(error.message);
    });

    it('treats a thrown fetch rejection as retryable', async () => {
      rejectWith(new TypeError('NetworkError when attempting to fetch resource.'));

      const error = await caught();

      expect(error.kind).toBe('uncertain');
      expect(error.retryable).toBe(true);
      retryableWording(error.message);
    });

    it('treats an aborted request as retryable', async () => {
      const abort = new Error('The operation was aborted.');
      abort.name = 'AbortError';
      rejectWith(abort);

      const error = await caught();

      expect(error.retryable).toBe(true);
      retryableWording(error.message);
    });

    it('treats an empty response (no data, no error) as retryable', async () => {
      answerWith({ data: null, error: null });

      const error = await caught();

      expect(error.kind).toBe('uncertain');
      expect(error.retryable).toBe(true);
    });

    it('treats a response missing the employee identity as retryable', async () => {
      answerWith({ data: { applicant_id: APPLICANT_ID }, error: null });

      const error = await caught();

      expect(error.kind).toBe('uncertain');
      expect(error.retryable).toBe(true);
    });

    it('times out a hung request and reports it as retryable', async () => {
      vi.useFakeTimers();
      rpcMock.mockImplementation(() => ({
        abortSignal: (signal: AbortSignal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => {
              const abort = new Error('signal is aborted without reason');
              abort.name = 'AbortError';
              reject(abort);
            });
          }),
      }));

      const pending = completePromotionalAppointment(APPLICANT_ID).catch((e) => e);
      await vi.advanceTimersByTimeAsync(PROMOTION_RPC_TIMEOUT_MS + 1);
      const error = (await pending) as PromotionalAppointmentError;

      expect(error).toBeInstanceOf(PromotionalAppointmentError);
      expect(error.kind).toBe('uncertain');
      expect(error.retryable).toBe(true);
      retryableWording(error.message);
    });
  });
});
