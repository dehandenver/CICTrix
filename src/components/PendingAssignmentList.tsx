// Subtab 2 — "Qualified Applicants" within the RSP qualified page.
// Table of qualified applicants who still need a schedule + interviewer.
// RSP selects multiple applicants via checkboxes and applies a single
// exam/interview schedule + interviewer to all of them in one save.

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
import { RaterManagementSubsection } from './RaterManagementSubsection';

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

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

const normalizeType = (t: string | null | undefined) =>
  (t ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original';

export const PendingAssignmentList = ({ applicants, completedEvaluationIds }: PendingAssignmentListProps) => {
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);
  const [overrides, setOverrides] = useState<Record<string, ApplicantAssignmentFields>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Shared bulk-assignment fields.
  const [examDate, setExamDate] = useState('');
  const [examTime, setExamTime] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('');
  const [interviewerEmail, setInterviewerEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    void fetchActiveInterviewers().then(setInterviewers);

    // Refetch when Rater Management adds or grants access to a new rater so
    // the Assigned Interviewer dropdown stays in sync without a page reload.
    const onRatersUpdated = () => {
      void fetchActiveInterviewers().then(setInterviewers);
    };
    window.addEventListener('cictrix:raters-updated', onRatersUpdated);
    return () => {
      window.removeEventListener('cictrix:raters-updated', onRatersUpdated);
    };
  }, []);

  const mergeAssignment = useCallback(
    (a: ApplicantRecord): ApplicantRecord => ({ ...a, ...(overrides[a.id] ?? {}) }),
    [overrides],
  );

  const pendingApplicants = useMemo(() => {
    return applicants
      .filter((a) => isQualified(a, completedEvaluationIds))
      .filter((a) => !isApplicantFullyAssigned(mergeAssignment(a)));
  }, [applicants, completedEvaluationIds, mergeAssignment]);

  // Drop ids that disappeared from the pending list (already assigned).
  useEffect(() => {
    setSelectedIds((prev) => {
      const stillPending = new Set(pendingApplicants.map((a) => a.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (stillPending.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [pendingApplicants]);

  const allSelected = pendingApplicants.length > 0 && selectedIds.size === pendingApplicants.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === pendingApplicants.length ? new Set<string>() : new Set(pendingApplicants.map((a) => a.id)),
    );
  };

  const allFieldsFilled =
    examDate.trim() &&
    examTime.trim() &&
    interviewDate.trim() &&
    interviewTime.trim() &&
    interviewerEmail.trim();

  const handleBulkSave = async () => {
    if (!allFieldsFilled || selectedIds.size === 0 || saving) return;

    setError('');
    setToast('');
    setSaving(true);

    const fields: ApplicantAssignmentFields = {
      exam_date: examDate,
      exam_time: examTime,
      interview_date: interviewDate,
      interview_time: interviewTime,
      assigned_interviewer_email: interviewerEmail,
    };

    const ids = Array.from(selectedIds);
    const results = await Promise.all(ids.map((id) => saveApplicantAssignment(id, fields)));

    const failedIds: string[] = [];
    const succeededIds: string[] = [];
    results.forEach((res, i) => {
      if (res.success) succeededIds.push(ids[i]);
      else failedIds.push(ids[i]);
    });

    if (succeededIds.length > 0) {
      setOverrides((prev) => {
        const next = { ...prev };
        succeededIds.forEach((id) => {
          next[id] = fields;
        });
        return next;
      });
      setSelectedIds(new Set());
      setToast(`Assigned schedule to ${succeededIds.length} applicant${succeededIds.length === 1 ? '' : 's'}.`);
    }

    if (failedIds.length > 0) {
      setError(
        `Failed to save ${failedIds.length} applicant${failedIds.length === 1 ? '' : 's'}. Please try again.`,
      );
    }

    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-bold text-slate-900">Qualified Applicants — Pending Assignment</h3>
        <p className="mt-1 text-sm text-slate-500">
          Select applicants below, then publish a single exam &amp; interview schedule with an assigned
          interviewer. Saved rows graduate to <span className="font-semibold">Applicant Score</span>.
        </p>
      </section>

      {/* Bulk assignment panel */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-slate-900">Publish Schedule</h4>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            {selectedIds.size} selected
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
                No active raters found. Grant access to raters below or in Rater Management first.
              </p>
            )}
          </div>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
        {toast && <p className="mt-3 text-sm font-medium text-emerald-600">{toast}</p>}

        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => void handleBulkSave()}
            disabled={!allFieldsFilled || selectedIds.size === 0 || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? 'Saving…' : `Save Assignment${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
          </button>
        </div>
      </section>

      {/* Rater Management (spec: positioned above the applicants table). */}
      <RaterManagementSubsection onAccessChange={() => void fetchActiveInterviewers().then(setInterviewers)} />

      {/* Applicants table */}
      {pendingApplicants.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <CheckCircle2 size={40} className="mb-3 text-emerald-400" />
          <p className="font-semibold text-slate-600">All qualified applicants have been assigned.</p>
          <p className="mt-1 text-sm text-slate-400">
            View them under <span className="font-semibold">Applicant Score</span>.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="w-10 px-5 py-3 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all pending applicants"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Applicant Name</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Applied</th>
              </tr>
            </thead>
            <tbody>
              {pendingApplicants.map((a) => {
                const checked = selectedIds.has(a.id);
                return (
                  <tr
                    key={a.id}
                    onClick={() => toggleOne(a.id)}
                    className={`cursor-pointer border-b border-slate-100 last:border-0 transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${a.full_name}`}
                        checked={checked}
                        onChange={() => toggleOne(a.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-slate-900">{a.full_name || '—'}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{a.email}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">{a.position || '—'}</td>
                    <td className="px-5 py-4 text-sm text-slate-700">{a.office || '—'}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          normalizeType(a.application_type) === 'Promotional'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {normalizeType(a.application_type)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(a.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};
