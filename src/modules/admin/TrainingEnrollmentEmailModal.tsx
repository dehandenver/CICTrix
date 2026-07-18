/**
 * Notify-enrolled-attendees modal (§7).
 *
 * Opens the instant "Enroll final attendees" completes. Recipients + their
 * emails are passed in live (resolved from employees during enrollment); an
 * attendee with no email on file is flagged (non-blocking). Send routes through
 * the single sendTrainingEnrollmentEmail stub. Enrollment is already finalized,
 * so Skip is always safe.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, Mail, X } from 'lucide-react';
import { sendTrainingEnrollmentEmail, type EnrolledRecipient } from '../../lib/api/trainingEmail';

type Props = {
  sessionId: string;
  trainingTitle: string;
  dates: string;
  venue: string | null;
  objectives: string[];
  recipients: EnrolledRecipient[];
  onClose: () => void;
};

export const TrainingEnrollmentEmailModal = ({ sessionId, trainingTitle, dates, venue, objectives, recipients, onClose }: Props) => {
  const [subject, setSubject] = useState(`You're enrolled: ${trainingTitle}`);
  const [body, setBody] = useState(
    [
      `Hello,`,
      ``,
      `You have been enrolled in "${trainingTitle}".`,
      ``,
      `When: ${dates}`,
      `Where: ${venue || 'To be announced'}`,
      objectives.length ? `\nObjectives:\n${objectives.map((o) => `• ${o}`).join('\n')}` : ``,
      ``,
      `Please make yourself available. See you there.`,
      ``,
      `— Learning & Development`,
    ].filter((l) => l !== undefined).join('\n')
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const missing = useMemo(() => recipients.filter((r) => !r.email || !r.email.trim()).length, [recipients]);

  const handleSend = async () => {
    setSending(true);
    const res = await sendTrainingEnrollmentEmail({ sessionId, trainingTitle, subject, body, recipients });
    setSending(false);
    if (!res.ok) { setResult(`Could not send: ${res.error}`); return; }
    setResult(`Sent to ${res.sent} recipient${res.sent === 1 ? '' : 's'}${res.skippedNoEmail ? ` · ${res.skippedNoEmail} skipped (no email)` : ''}.`);
    window.setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => !sending && onClose()}>
      <div className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-start justify-between bg-white px-6 pt-6 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Notify enrolled attendees</h2>
            <p className="text-sm text-slate-500">{trainingTitle}</p>
          </div>
          <button type="button" onClick={onClose} disabled={sending} className="text-slate-400 hover:text-slate-600 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 px-6 pb-6">
          {/* Recipients */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Recipients ({recipients.length}){missing > 0 && <span className="ml-2 font-normal normal-case text-amber-600">{missing} missing an email</span>}
            </p>
            <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {recipients.map((r) => (
                <li key={r.employeeId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-slate-800">{r.name}</span>
                  {r.email && r.email.trim() ? (
                    <span className="truncate text-xs text-slate-500">{r.email}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> no email on file</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Message</label>
            <textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          {result && <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">{result}</p>}

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} disabled={sending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Skip for now</button>
            <button type="button" onClick={() => void handleSend()} disabled={sending} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              <Mail className="h-4 w-4" /> {sending ? 'Sending…' : 'Send now'}
            </button>
          </div>
          <p className="text-center text-xs text-slate-400">Enrollment is already complete — email is just a notification.</p>
        </div>
      </div>
    </div>
  );
};

export default TrainingEnrollmentEmailModal;
