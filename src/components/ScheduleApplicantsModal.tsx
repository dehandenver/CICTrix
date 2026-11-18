// "Schedule Applicants" dialog: one interview slot, one oral exam slot, a
// rater and a venue applied to every selected applicant (DESIGN_IDENTITY §9.10).

import { useMemo, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { Modal } from './modal';
import type { ApplicantRecord } from './QualifiedApplicantsSection';
import { scheduleApplicantsBatch, type InterviewerOption } from '../lib/applicantSchedule';
import {
  groupByDepartmentAndPosition,
  isPastDate,
  localIsoDate,
  SESSION_TIMES,
  type InterviewSession,
} from '../lib/scheduleSelection';

const INPUT_CLASS =
  'h-11 w-full rounded-[var(--radius-md)] border border-[var(--neutral-200)] bg-[var(--bg-surface)] px-3 text-[14px] font-medium text-[var(--neutral-800)] outline-none transition-colors hover:border-[var(--color-primary-200)] focus:border-[var(--color-primary)] focus:shadow-[shadow:var(--ring-input)]';
const LABEL_CLASS = 'mb-1.5 block text-[14px] font-medium leading-4 text-[var(--neutral-800)]';

const SESSIONS: { value: InterviewSession; label: string }[] = [
  { value: 'morning', label: 'Morning (8:00 AM)' },
  { value: 'afternoon', label: 'Afternoon (1:00 PM)' },
  { value: 'custom', label: 'Custom time' },
];

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

const formatTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const Required = () => <span className="text-[var(--error-500)]" aria-hidden="true"> *</span>;

interface SlotValue {
  date: string;
  session: InterviewSession;
  customTime: string;
}

const EMPTY_SLOT: SlotValue = { date: '', session: 'morning', customTime: '' };

const slotTime = (slot: SlotValue) => (slot.session === 'custom' ? slot.customTime : SESSION_TIMES[slot.session]);

/** First validation problem with a slot, or null when it can be saved. */
const slotError = (name: string, slot: SlotValue, today: string): string | null => {
  if (!slot.date) return `Choose the ${name} date.`;
  if (isPastDate(slot.date, today)) return `The ${name} date cannot be in the past.`;
  if (!slotTime(slot)) return `Enter a custom time for the ${name}.`;
  return null;
};

/** A date plus Morning / Afternoon / Custom time for one scheduled event. */
const ScheduleSlot = ({ id, title, today, autoFocus, value, onChange }: {
  id: string;
  title: string;
  today: string;
  autoFocus?: boolean;
  value: SlotValue;
  onChange: (next: SlotValue) => void;
}) => (
  <fieldset className="!border-0 !p-0">
    <legend className="mb-3 block text-[16px] font-semibold leading-5 text-[var(--color-primary-900)]">{title}</legend>
    <label htmlFor={`${id}-date`} className={LABEL_CLASS}>{title} date<Required /></label>
    <input
      id={`${id}-date`}
      type="date"
      autoFocus={autoFocus}
      min={today}
      value={value.date}
      onChange={(e) => onChange({ ...value, date: e.target.value })}
      className={INPUT_CLASS}
    />
    <p className={`${LABEL_CLASS} mt-3`} id={`${id}-session-label`}>{title} time<Required /></p>
    <div role="radiogroup" aria-labelledby={`${id}-session-label`} className="flex flex-wrap gap-2">
      {SESSIONS.map((s) => (
        <label
          key={s.value}
          className={`inline-flex h-9 cursor-pointer items-center rounded-[var(--radius-pill)] border px-4 text-[13px] font-semibold transition-colors ${
            value.session === s.value
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-50)] text-[var(--color-primary)]'
              : 'border-[var(--neutral-200)] text-[var(--neutral-800)] hover:border-[var(--color-primary-200)]'
          }`}
        >
          <input
            type="radio"
            name={`${id}-session`}
            value={s.value}
            aria-label={`${title}: ${s.label}`}
            checked={value.session === s.value}
            onChange={() => onChange({ ...value, session: s.value })}
            className="sr-only"
          />
          {s.label}
        </label>
      ))}
    </div>
    {value.session === 'custom' && (
      <input
        type="time"
        aria-label={`Custom ${title.toLowerCase()} time`}
        value={value.customTime}
        onChange={(e) => onChange({ ...value, customTime: e.target.value })}
        className={`${INPUT_CLASS} mt-3 sm:max-w-[200px]`}
      />
    )}
  </fieldset>
);

interface ScheduleApplicantsModalProps {
  applicants: ApplicantRecord[];
  raters: InterviewerOption[];
  onCancel: () => void;
  /** Called after a successful save with a message for the success alert. */
  onScheduled: (message: string) => void;
}

export const ScheduleApplicantsModal = ({ applicants, raters, onCancel, onScheduled }: ScheduleApplicantsModalProps) => {
  const today = localIsoDate();
  const [interview, setInterview] = useState<SlotValue>(EMPTY_SLOT);
  const [oral, setOral] = useState<SlotValue>(EMPTY_SLOT);
  const [raterEmail, setRaterEmail] = useState('');
  const [venue, setVenue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const positionSummary = useMemo(
    () => groupByDepartmentAndPosition(applicants).flatMap((d) =>
      d.positions.map((p) => ({ key: p.key, position: p.position, department: d.department, count: p.applicants.length })),
    ),
    [applicants],
  );

  const handleConfirm = async () => {
    if (saving) return;
    const problem = slotError('interview', interview, today) ?? slotError('oral examination', oral, today);
    if (problem) return setError(problem);
    if (!raterEmail) return setError('Choose a rater.');

    setError('');
    setSaving(true);
    const result = await scheduleApplicantsBatch({
      applicants: applicants.map((a) => ({ id: a.id, status: a.status })),
      interviewDate: interview.date,
      interviewTime: slotTime(interview),
      oralExamDate: oral.date,
      oralExamTime: slotTime(oral),
      raterEmail,
      venue,
    });
    setSaving(false);

    if ('error' in result) {
      setError(result.error);
      return;
    }
    const rater = raters.find((r) => r.email === raterEmail)?.name ?? raterEmail;
    onScheduled(
      `Scheduled ${result.scheduled} applicant${result.scheduled === 1 ? '' : 's'} with ${rater}: interview ${formatDate(interview.date)}, ${formatTime(slotTime(interview))}; oral exam ${formatDate(oral.date)}, ${formatTime(slotTime(oral))}. They are now in the Scheduled tab.`,
    );
  };

  return (
    <Modal
      open
      onClose={onCancel}
      dismissible={!saving}
      title="Schedule Applicants"
      subtitle={<>Interview and oral exam for {applicants.length} applicant{applicants.length === 1 ? '' : 's'} across{' '}{positionSummary.length} position{positionSummary.length === 1 ? '' : 's'}.</>}
      footer={(
        <>
          <button type="button" className="btn btn-md btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button
            type="button"
            className={`btn btn-md btn-primary${saving ? ' is-loading' : ''}`}
            onClick={() => void handleConfirm()}
            disabled={saving}
            aria-busy={saving || undefined}
          >
            {!saving && <CalendarCheck size={16} strokeWidth={1.75} aria-hidden="true" />}
            Confirm Schedule
          </button>
        </>
      )}
    >
        <div className="space-y-5">
          <ul className="!m-0 divide-y divide-[var(--neutral-200)] rounded-[var(--radius-lg)] border border-[var(--neutral-200)] !p-0">
            {positionSummary.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold leading-[18px] text-[var(--color-primary-900)]">{p.position}</span>
                  <span className="block truncate text-[12px] font-medium leading-4 text-[var(--neutral-600)]">{p.department}</span>
                </span>
                <span className="badge badge-tint shrink-0">{p.count}</span>
              </li>
            ))}
          </ul>

          <ScheduleSlot
            id="interview"
            title="Interview"
            today={today}
            autoFocus
            value={interview}
            onChange={setInterview}
          />

          <ScheduleSlot
            id="oral"
            title="Oral examination"
            today={today}
            value={oral}
            onChange={setOral}
          />

          <div>
            <label htmlFor="schedule-rater" className={LABEL_CLASS}>Assigned rater<Required /></label>
            <select
              id="schedule-rater"
              value={raterEmail}
              onChange={(e) => setRaterEmail(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Select a rater…</option>
              {raters.map((r) => (
                <option key={r.email} value={r.email}>
                  {r.name}{r.designation ? ` — ${r.designation}` : ''} ({r.email})
                </option>
              ))}
            </select>
            {raters.length === 0 && (
              <p className="!m-0 mt-1 text-[12px] font-medium leading-4 text-[var(--warning-700)]">
                No active raters found. Grant access in the Rater Management tab first.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="schedule-venue" className={LABEL_CLASS}>Venue or meeting link</label>
            <input
              id="schedule-venue"
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. City Hall Conference Room 3"
              className={INPUT_CLASS}
            />
            <p className="!m-0 mt-1 text-[12px] font-medium leading-4 text-[var(--neutral-600)]">Optional.</p>
          </div>

          {error && (
            <p role="alert" className="!mb-0 text-[12px] font-medium leading-4 text-[var(--error-700)]">{error}</p>
          )}
        </div>
    </Modal>
  );
};
