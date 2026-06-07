// Subtab 2 — "Qualified Applicants" within the RSP qualified page.
// Lists qualified applicants who still need a schedule + interviewer.
// Once all five fields are saved, the applicant disappears from this
// list (they graduate to subtab 3, "Applicant Score").

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Save,
  UserCheck,
} from 'lucide-react';
import {
  fetchActiveInterviewers,
  isApplicantFullyAssigned,
  saveApplicantAssignment,
  type ApplicantAssignmentFields,
  type InterviewerOption,
} from '../lib/applicantSchedule';
import type { ApplicantRecord } from './QualifiedApplicantsSection';

interface PendingAssignmentListProps {
  applicants: ApplicantRecord[];
  completedEvaluationIds: Set<string>;
}

const isQualified = (a: ApplicantRecord, completedIds: Set<string>): boolean => {
  const s = (a.status ?? '').toLowerCase();
  return (
    s.includes('qualified') ||
    s.includes('shortlist') ||
    s.includes('recommended') ||
    completedIds.has(a.id)
  );
};

interface CardProps {
  applicant: ApplicantRecord;
  interviewers: InterviewerOption[];
  onAssigned: (id: string, fields: ApplicantAssignmentFields) => void;
}

const Card = ({ applicant, interviewers, onAssigned }: CardProps) => {
  const [examDate, setExamDate] = useState(applicant.exam_date ?? '');
  const [examTime, setExamTime] = useState(applicant.exam_time ?? '');
  const [interviewDate, setInterviewDate] = useState(applicant.interview_date ?? '');
  const [interviewTime, setInterviewTime] = useState(applicant.interview_time ?? '');
  const [interviewerEmail, setInterviewerEmail] = useState(applicant.assigned_interviewer_email ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allFilled =
    examDate.trim() &&
    examTime.trim() &&
    interviewDate.trim() &&
    interviewTime.trim() &&
    interviewerEmail.trim();

  const handleSave = async () => {
    if (!allFilled) {
      setError('Please complete all schedule fields and assign an interviewer.');
      return;
    }
    setError('');
    setSaving(true);
    const fields: ApplicantAssignmentFields = {
      exam_date: examDate,
      exam_time: examTime,
      interview_date: interviewDate,
      interview_time: interviewTime,
      assigned_interviewer_email: interviewerEmail,
    };
    const result = await saveApplicantAssignment(applicant.id, fields);
    setSaving(false);
    if (!result.success) {
      setError('error' in result ? result.error : 'Save failed.');
      return;
    }
    onAssigned(applicant.id, fields);
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">{applicant.full_name || '—'}</h3>
          <p className="text-sm text-slate-500">
            {applicant.position || '—'} · {applicant.office || '—'}
          </p>
          <p className="mt-1 text-xs text-slate-400">{applicant.email}</p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          Pending Assignment
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <Calendar size={12} /> Exam Date
          </label>
          <input
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <Clock size={12} /> Exam Time
          </label>
          <input
            type="time"
            value={examTime}
            onChange={(e) => setExamTime(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <Calendar size={12} /> Interview Date
          </label>
          <input
            type="date"
            value={interviewDate}
            onChange={(e) => setInterviewDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <Clock size={12} /> Interview Time
          </label>
          <input
            type="time"
            value={interviewTime}
            onChange={(e) => setInterviewTime(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <UserCheck size={12} /> Assigned Interviewer
          </label>
          <select
            value={interviewerEmail}
            onChange={(e) => setInterviewerEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select an interviewer…</option>
            {interviewers.map((i) => (
              <option key={i.email} value={i.email}>
                {i.name}{i.designation ? ` — ${i.designation}` : ''} ({i.email})
              </option>
            ))}
          </select>
          {interviewers.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              No active raters found. Add raters in Rater Management first.
            </p>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}

      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!allFilled || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Saving…' : 'Save Assignment'}
        </button>
      </div>
    </article>
  );
};

export const PendingAssignmentList = ({ applicants, completedEvaluationIds }: PendingAssignmentListProps) => {
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);
  const [overrides, setOverrides] = useState<Record<string, ApplicantAssignmentFields>>({});

  useEffect(() => {
    void fetchActiveInterviewers().then(setInterviewers);
  }, []);

  const handleAssigned = useCallback(
    (id: string, fields: ApplicantAssignmentFields) => {
      setOverrides((prev) => ({ ...prev, [id]: fields }));
    },
    [],
  );

  const mergeAssignment = useCallback(
    (a: ApplicantRecord): ApplicantRecord => ({ ...a, ...(overrides[a.id] ?? {}) }),
    [overrides],
  );

  const pendingApplicants = useMemo(() => {
    return applicants
      .filter((a) => isQualified(a, completedEvaluationIds))
      .filter((a) => !isApplicantFullyAssigned(mergeAssignment(a)));
  }, [applicants, completedEvaluationIds, mergeAssignment]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-bold text-slate-900">Qualified Applicants — Pending Assignment</h3>
        <p className="mt-1 text-sm text-slate-500">
          Set the exam &amp; interview schedule and assign an interviewer for each applicant.
          Once saved, the applicant graduates to <span className="font-semibold">Applicant Score</span>.
        </p>
      </section>

      {pendingApplicants.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <CheckCircle2 size={40} className="mb-3 text-emerald-400" />
          <p className="font-semibold text-slate-600">All qualified applicants have been assigned.</p>
          <p className="mt-1 text-sm text-slate-400">
            View them under <span className="font-semibold">Applicant Score</span>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {pendingApplicants.map((a) => (
            <Card
              key={a.id}
              applicant={mergeAssignment(a)}
              interviewers={interviewers}
              onAssigned={handleAssigned}
            />
          ))}
        </div>
      )}
    </div>
  );
};
