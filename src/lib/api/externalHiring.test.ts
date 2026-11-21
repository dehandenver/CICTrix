import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('../supabase', () => ({ supabase: { rpc: rpcMock } }));

import {
  EXTERNAL_HIRE_RPC_TIMEOUT_MS,
  ExternalHireError,
  completeExternalHire,
} from './externalHiring';

const APPLICANT_ID = '11111111-0000-4000-8000-0000000000bb';

const rpcRow = {
  applicant_id: APPLICANT_ID,
  employee_uuid: 'e0e0e0e0-0000-4000-8000-000000000099',
  employee_number: 'EMP-11111111',
  slot_id: 'b1b2c3d4-0000-4000-8000-000000000003',
  completed_at: '2026-11-20T08:00:00+00:00',
  already_completed: false,
};

const answerWith = (result: { data: unknown; error: unknown }) => {
  rpcMock.mockImplementation(() => ({ abortSignal: () => Promise.resolve(result) }));
};

const rejectWith = (error: unknown) => {
  rpcMock.mockImplementation(() => ({ abortSignal: () => Promise.reject(error) }));
};

const caught = async (): Promise<ExternalHireError> => {
  try {
    await completeExternalHire(APPLICANT_ID);
  } catch (error) {
    expect(error).toBeInstanceOf(ExternalHireError);
    return error as ExternalHireError;
  }
  throw new Error('expected completeExternalHire to reject');
};

describe('completeExternalHire', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls complete_external_hire with only the applicant id and maps camelCase fields', async () => {
    answerWith({ data: rpcRow, error: null });

    const result = await completeExternalHire(APPLICANT_ID);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('complete_external_hire', {
      p_applicant_id: APPLICANT_ID,
    });
    expect(result).toEqual({
      applicantId: APPLICANT_ID,
      employeeUuid: rpcRow.employee_uuid,
      employeeNumber: 'EMP-11111111',
      slotId: rpcRow.slot_id,
      completedAt: rpcRow.completed_at,
      alreadyCompleted: false,
    });
  });

  it('never sends an actor parameter from the browser', async () => {
    answerWith({ data: rpcRow, error: null });

    await completeExternalHire(APPLICANT_ID);

    const [, params] = rpcMock.mock.calls[0];
    expect(Object.keys(params)).toEqual(['p_applicant_id']);
  });

  it('passes already_completed through for a replay', async () => {
    answerWith({ data: { ...rpcRow, already_completed: true }, error: null });

    const result = await completeExternalHire(APPLICANT_ID);

    expect(result.alreadyCompleted).toBe(true);
  });

  it('refuses a blank applicant id without calling the RPC', async () => {
    await expect(completeExternalHire('  ')).rejects.toBeInstanceOf(ExternalHireError);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  describe('rejections by the database', () => {
    const rejectedHints = [
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

    it('classifies a bare permission-denied error as not authorized', async () => {
      answerWith({
        data: null,
        error: { code: '42501', message: 'permission denied for function complete_external_hire' },
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

    it.each(['PGRST202', '42883'])('classifies missing RPC (%s) as not_deployed without retrying', async (code) => {
      answerWith({ data: null, error: { code, message: 'Could not find the function' } });

      const error = await caught();

      expect(error.kind).toBe('not_deployed');
      expect(error.code).toBe(code);
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
      ['55P03', 'could not obtain lock on row in relation "plantilla_slots"'],
    ])('treats %s as busy and safe to retry without leaking raw DB text', async (code, raw) => {
      answerWith({ data: null, error: { code, message: raw } });

      const error = await caught();

      expect(error.kind).toBe('busy');
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(true);
      expect(error.message).not.toContain(raw);
      expect(error.message).toMatch(/try again/i);
    });
  });

  describe('lost or unreadable responses', () => {
    it('treats a transport rejection as uncertain and safe to retry', async () => {
      rejectWith(new TypeError('Failed to fetch'));

      const error = await caught();

      expect(error.kind).toBe('uncertain');
      expect(error.retryable).toBe(true);
      expect(error.message).toMatch(/retry/i);
    });

    it('treats a hung request that hits the timeout as uncertain and aborts it', async () => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      rpcMock.mockImplementation(() => ({
        abortSignal: (s: AbortSignal) => {
          signal = s;
          return new Promise((_, reject) => {
            s.addEventListener('abort', () => {
              const abort = new Error('signal is aborted without reason');
              abort.name = 'AbortError';
              reject(abort);
            });
          });
        },
      }));

      const promise = caught();
      await vi.advanceTimersByTimeAsync(EXTERNAL_HIRE_RPC_TIMEOUT_MS + 1);
      const error = await promise;

      expect(signal?.aborted).toBe(true);
      expect(error.kind).toBe('uncertain');
      expect(error.retryable).toBe(true);
    });

    it('treats a malformed RPC payload as uncertain', async () => {
      answerWith({ data: { applicant_id: APPLICANT_ID }, error: null });

      const error = await caught();

      expect(error.kind).toBe('uncertain');
      expect(error.retryable).toBe(true);
    });
  });
});
