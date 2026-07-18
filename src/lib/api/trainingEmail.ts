/**
 * Training enrollment email — the single send seam (§7).
 *
 * No email provider is wired yet. Everything upstream (the modal, the recipient
 * list pulled live from employees, the editable template) is real; only the
 * actual send routes through this one stub, which logs the payload and reports
 * success. Enrollment is already finalized before this is ever called, so email
 * is a notify step, never a gate.
 *
 * When a provider is chosen (Resend via a Supabase Edge Function is the
 * lowest-friction option if this stays on Supabase), only this function changes.
 */

export type EnrollmentEmailRecipient = {
  employeeId: string;
  name: string;
  email: string | null;
};

/** Recipients returned by enrollFinalAttendees carry an extra `department`; the
 *  send only needs name+email, so the richer object is accepted as-is. */
export type EnrolledRecipient = EnrollmentEmailRecipient;

export type EnrollmentEmailPayload = {
  sessionId: string;
  trainingTitle: string;
  subject: string;
  body: string;
  recipients: EnrollmentEmailRecipient[];
};

export type SendResult = { ok: boolean; sent: number; skippedNoEmail: number; error?: string };

export async function sendTrainingEnrollmentEmail(
  payload: EnrollmentEmailPayload
): Promise<SendResult> {
  const withEmail = payload.recipients.filter((r) => r.email && r.email.trim());
  const skippedNoEmail = payload.recipients.length - withEmail.length;

  // TODO(provider): replace this log with the real send (e.g. a Supabase Edge
  // Function calling Resend). Signature stays the same.
  console.info('[sendTrainingEnrollmentEmail] (stub) would send:', {
    sessionId: payload.sessionId,
    trainingTitle: payload.trainingTitle,
    subject: payload.subject,
    to: withEmail.map((r) => r.email),
    skippedNoEmail,
  });

  return { ok: true, sent: withEmail.length, skippedNoEmail };
}
