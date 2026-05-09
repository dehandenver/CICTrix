/**
 * Frontend email client.
 *
 * Talks to POST /api/email/send (FastAPI backend, see backend/app/routes/email.py).
 * Vite proxies /api/* to http://localhost:8000 in dev. In production, the same
 * relative path will hit whatever serves /api.
 */

export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  body: string;
  applicantId?: string;
  employeeId?: string;
  template?: string;
}

export interface SendEmailResult {
  success: boolean;
  deliveredTo: string[];
  message: string;
}

/**
 * Sends an email through the backend SMTP service. Throws an `Error` with
 * a user-friendly message on failure (so callers can surface it directly).
 */
export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
  const body = {
    to: payload.to,
    subject: payload.subject,
    body: payload.body,
    applicant_id: payload.applicantId,
    employee_id: payload.employeeId,
    template: payload.template,
  };

  let response: Response;
  try {
    response = await fetch('http://localhost:8000/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    console.error('sendEmail: network error', networkError);
    throw new Error(
      'Could not reach the backend at http://localhost:8000/api/email/send. Make sure the backend ' +
        'server is running (cd backend && python -m uvicorn main:app --reload).',
    );
  }

  let parsed: any = null;
  try {
    parsed = await response.json();
  } catch {
    // Body might be empty/text on certain errors; fall through to status-based messages.
  }

  if (!response.ok) {
    const detail =
      parsed?.detail ||
      parsed?.message ||
      `Email service returned HTTP ${response.status}.`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  return {
    success: Boolean(parsed?.success),
    deliveredTo: Array.isArray(parsed?.delivered_to) ? parsed.delivered_to : [],
    message: typeof parsed?.message === 'string' ? parsed.message : 'Email sent.',
  };
}
