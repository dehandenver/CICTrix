/**
 * Moves an applicant to a workflow status without overwriting a newer one.
 *
 * The write is a compare-and-set against the exact stored value it read, so a
 * hire or withdrawal that lands in between is not overwritten. A row the update
 * could not touch is re-read: PostgREST returns no error for a row an RLS policy
 * filters out, so zero rows alone can't tell a lost race from a denied write.
 */
import { supabase } from '../supabase';
import { canTransition, normalizeStatus, type ApplicantWorkflowStatus } from './applicantStatus';

export type StatusTransitionResult =
  | { kind: 'advanced'; status: string }
  | { kind: 'unchanged'; reason: 'transition-not-allowed' | 'concurrent-change' | 'not-found' }
  | { kind: 'failed'; error: string };

const STATUS_NOT_APPLIED = 'The status update was not applied.';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);

const readStoredStatus = async (applicantId: string) => {
  const { data, error } = await supabase
    .from('applicants')
    .select('id, status')
    .eq('id', applicantId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; status: string | null } | null;
};

export async function transitionApplicantStatus(
  applicantId: string,
  target: ApplicantWorkflowStatus,
  storedAs: string = target,
): Promise<StatusTransitionResult> {
  try {
    const before = await readStoredStatus(applicantId);
    if (!before) return { kind: 'unchanged', reason: 'not-found' };

    const current = normalizeStatus(before.status);
    if (!current || !canTransition(current, target)) {
      return { kind: 'unchanged', reason: 'transition-not-allowed' };
    }

    const { data, error } = await (supabase as any)
      .from('applicants')
      .update({ status: storedAs })
      .eq('id', applicantId)
      .eq('status', before.status as string)
      .select('id');
    if (error) return { kind: 'failed', error: error.message };
    if (data && data.length > 0) return { kind: 'advanced', status: storedAs };

    const after = await readStoredStatus(applicantId);
    if (!after) return { kind: 'unchanged', reason: 'not-found' };
    if (after.status !== before.status) return { kind: 'unchanged', reason: 'concurrent-change' };
    return { kind: 'failed', error: STATUS_NOT_APPLIED };
  } catch (error) {
    return { kind: 'failed', error: messageOf(error) };
  }
}
