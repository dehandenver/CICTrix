// Subtab 2 — "Qualified Applicants" within the RSP qualified page.
// Two sub-views:
//   "Pending Assignment" — qualified applicants that still need a schedule.
//   "Scheduled"         — applicants with a complete schedule, awaiting evaluation.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Pencil,
  Save,
  UserCheck,
  Users,
  X,
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

const fmtTime = (t: string) => {
  if (!t) return '—';
  try {
    const [h, m] = t.split(':');
    const hour = parseInt(h, 10);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}:${m} ${suffix}`;
  } catch {
    return t;
  }
};

const normalizeType = (t: string | null | undefined) =>
  (t ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original';

export const PendingAssignmentList = ({ applicants, completedEvaluationIds }: PendingAssignmentListProps) => {
  const navigate = useNavigate();

  const [subTab, setSubTab] = useState<'pending' | 'scheduled' | 'rater-management'>('pending');
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

  // Edit-schedule modal state.
  const [editingApplicant, setEditingApplicant] = useState<ApplicantRecord | null>(null);
  const [editExamDate, setEditExamDate] = useState('');
  const [editExamTime, setEditExamTime] = useState('');
  const [editInterviewDate, setEditInterviewDate] = useState('');
  const [editInterviewTime, setEditInterviewTime] = useState('');
  const [editInterviewerEmail, setEditInterviewerEmail] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    void fetchActiveInterviewers().then(setInterviewers);

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

  const scheduledApplicants = useMemo(() => {
    return applicants
      .filter((a) => isQualified(a, completedEvaluationIds))
      .filter((a) => isApplicantFullyAssigned(mergeAssignment(a)));
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
      setToast(`Schedule published for ${succeededIds.length} applicant${succeededIds.length === 1 ? '' : 's'}. View them in the Scheduled tab.`);
      // Auto-switch to scheduled tab after save
      setTimeout(() => setSubTab('scheduled'), 900);
    }

    if (failedIds.length > 0) {
      setError(
        `Failed to save ${failedIds.length} applicant${failedIds.length === 1 ? '' : 's'}. Please try again.`,
      );
    }

    setSaving(false);
  };

  const openEditModal = (a: ApplicantRecord) => {
    const merged = mergeAssignment(a);
    setEditingApplicant(a);
    setEditExamDate(merged.exam_date ?? '');
    setEditExamTime(merged.exam_time ?? '');
    setEditInterviewDate(merged.interview_date ?? '');
    setEditInterviewTime(merged.interview_time ?? '');
    setEditInterviewerEmail(merged.assigned_interviewer_email ?? '');
    setEditError('');
  };

  const handleEditSave = async () => {
    if (!editingApplicant || editSaving) return;
    setEditError('');
    setEditSaving(true);
    const result = await saveApplicantAssignment(editingApplicant.id, {
      exam_date: editExamDate,
      exam_time: editExamTime,
      interview_date: editInterviewDate,
      interview_time: editInterviewTime,
      assigned_interviewer_email: editInterviewerEmail,
    });
    setEditSaving(false);
    if ('error' in result) {
      setEditError(result.error);
      return;
    }
    setOverrides((prev) => ({
      ...prev,
      [editingApplicant.id]: {
        exam_date: editExamDate,
        exam_time: editExamTime,
        interview_date: editInterviewDate,
        interview_time: editInterviewTime,
        assigned_interviewer_email: editInterviewerEmail,
      },
    }));
    setEditingApplicant(null);
  };

  const getInterviewerName = (email: string | null | undefined) => {
    if (!email) return '—';
    return interviewers.find((i) => i.email === email)?.name ?? email;
  };

  return (
    <div className="space-y-4">

      {/* Sub-tab toggle */}
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1" style={{ width: 'fit-content' }}>
        <button
          type="button"
          onClick={() => setSubTab('pending')}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all"
          style={subTab === 'pending'
            ? { background: '#363EE8', color: '#ffffff' }
            : { background: 'transparent', color: '#64748b' }}
        >
          <Clock size={14} />
          Pending Assignment
          {pendingApplicants.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-bold"
              style={subTab === 'pending'
                ? { background: 'rgba(255,255,255,0.25)', color: '#ffffff' }
                : { background: '#FEF3C7', color: '#92400E' }}
            >
              {pendingApplicants.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setSubTab('scheduled')}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all"
          style={subTab === 'scheduled'
            ? { background: '#363EE8', color: '#ffffff' }
            : { background: 'transparent', color: '#64748b' }}
        >
          <CalendarCheck size={14} />
          Scheduled
          {scheduledApplicants.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-bold"
              style={subTab === 'scheduled'
                ? { background: 'rgba(255,255,255,0.25)', color: '#ffffff' }
                : { background: '#DCFCE7', color: '#15803D' }}
            >
              {scheduledApplicants.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setSubTab('rater-management')}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all"
          style={subTab === 'rater-management'
            ? { background: '#363EE8', color: '#ffffff' }
            : { background: 'transparent', color: '#64748b' }}
        >
          <Users size={14} />
          Rater Management
        </button>
      </div>

      {/* ── PENDING ASSIGNMENT VIEW ── */}
      {subTab === 'pending' && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-bold" style={{ color: '#363EE8' }}>Qualified Applicants — Pending Assignment</h3>
            <p className="mt-1 text-sm text-slate-500">
              Select applicants below, then publish a single exam &amp; interview schedule with an assigned
              interviewer. Published applicants move to the <span className="font-semibold">Scheduled</span> tab.
            </p>
          </section>

          {/* Bulk assignment panel */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h4 className="text-sm font-bold" style={{ color: '#040E6B' }}>Publish Schedule</h4>
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
          </section>

          {/* Pending applicants table */}
          {pendingApplicants.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <CheckCircle2 size={40} className="mb-3 text-emerald-400" />
              <p className="font-semibold text-slate-600">All qualified applicants have been assigned a schedule.</p>
              <button
                type="button"
                onClick={() => setSubTab('scheduled')}
                className="mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: '#363EE8' }}
              >
                <CalendarCheck size={14} /> View Scheduled Applicants
              </button>
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
          {/* Save Assignment — sticky bottom-right */}
          <div className="flex items-center justify-end pt-2 pb-2">
            <button
              type="button"
              onClick={() => void handleBulkSave()}
              disabled={!allFieldsFilled || selectedIds.size === 0 || saving}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: '#363EE8' }}
            >
              <Save size={14} />
              {saving ? 'Saving…' : `Save Assignment${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
            </button>
          </div>
        </>
      )}

      {/* ── RATER MANAGEMENT TAB ── */}
      {subTab === 'rater-management' && (
        <RaterManagementSubsection onAccessChange={() => void fetchActiveInterviewers().then(setInterviewers)} />
      )}

      {/* ── SCHEDULED VIEW ── */}
      {subTab === 'scheduled' && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-bold" style={{ color: '#363EE8' }}>Scheduled Applicants</h3>
            <p className="mt-1 text-sm text-slate-500">
              These applicants have a published exam &amp; interview schedule. Click{' '}
              <span className="font-semibold">Proceed to Evaluation</span> once the interview is complete
              to begin scoring in the <span className="font-semibold">Applicant Score</span> tab.
            </p>
          </section>

          {scheduledApplicants.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <CalendarCheck size={40} className="mb-3 text-slate-300" />
              <p className="font-semibold text-slate-600">No scheduled applicants yet.</p>
              <p className="mt-1 text-sm text-slate-400">Publish a schedule in the Pending Assignment tab first.</p>
              <button
                type="button"
                onClick={() => setSubTab('pending')}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Go to Pending Assignment
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Applicant</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Position / Office</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Exam Schedule</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Interview Schedule</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Assigned Interviewer</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledApplicants.map((a) => {
                    const merged = mergeAssignment(a);
                    const interviewer = getInterviewerName(merged.assigned_interviewer_email);
                    return (
                      <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold" style={{ color: '#040E6B' }}>{a.full_name || '—'}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{a.email}</p>
                          <span
                            className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              normalizeType(a.application_type) === 'Promotional'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-sky-100 text-sky-700'
                            }`}
                          >
                            {normalizeType(a.application_type)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-slate-800">{a.position || '—'}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{a.office || '—'}</p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-1.5">
                            <Calendar size={13} className="mt-0.5 shrink-0 text-slate-400" />
                            <div>
                              <p className="text-sm font-medium text-slate-800">{fmtDate(merged.exam_date ?? '')}</p>
                              <p className="text-xs text-slate-500">{fmtTime(merged.exam_time ?? '')}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-1.5">
                            <Calendar size={13} className="mt-0.5 shrink-0 text-slate-400" />
                            <div>
                              <p className="text-sm font-medium text-slate-800">{fmtDate(merged.interview_date ?? '')}</p>
                              <p className="text-xs text-slate-500">{fmtTime(merged.interview_time ?? '')}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-1.5">
                            <UserCheck size={13} className="mt-0.5 shrink-0 text-slate-400" />
                            <div>
                              <p className="text-sm font-medium text-slate-800">{interviewer}</p>
                              {merged.assigned_interviewer_email && interviewer !== merged.assigned_interviewer_email && (
                                <p className="text-xs text-slate-400">{merged.assigned_interviewer_email}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(a)}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <Pencil size={11} /> Edit Schedule
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate('/admin/rsp/applicant-score')}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition"
                              style={{ background: '#363EE8' }}
                            >
                              Proceed to Evaluation <ArrowRight size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── EDIT SCHEDULE MODAL ── */}
      {editingApplicant && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,14,107,0.45)', padding: '1rem' }}
          onClick={() => setEditingApplicant(null)}
        >
          <div
            style={{ background: '#ffffff', borderRadius: 20, boxShadow: '0 24px 80px rgba(54,62,232,0.22)', width: '100%', maxWidth: 520, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ background: 'linear-gradient(135deg, #5B65F0 0%, #363EE8 100%)', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>Edit Schedule</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)' }}>
                  {editingApplicant.full_name} — {editingApplicant.position}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingApplicant(null)}
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', color: '#ffffff', padding: '0.35rem', display: 'flex' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>
                    <Calendar size={11} /> Exam Date
                  </label>
                  <input
                    type="date"
                    value={editExamDate}
                    onChange={(e) => setEditExamDate(e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #C8D1FF', borderRadius: 8, padding: '0.5rem 0.65rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>
                    <Clock size={11} /> Exam Time
                  </label>
                  <input
                    type="time"
                    value={editExamTime}
                    onChange={(e) => setEditExamTime(e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #C8D1FF', borderRadius: 8, padding: '0.5rem 0.65rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>
                    <Calendar size={11} /> Interview Date
                  </label>
                  <input
                    type="date"
                    value={editInterviewDate}
                    onChange={(e) => setEditInterviewDate(e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #C8D1FF', borderRadius: 8, padding: '0.5rem 0.65rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>
                    <Clock size={11} /> Interview Time
                  </label>
                  <input
                    type="time"
                    value={editInterviewTime}
                    onChange={(e) => setEditInterviewTime(e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #C8D1FF', borderRadius: 8, padding: '0.5rem 0.65rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>
                  <UserCheck size={11} /> Assigned Interviewer
                </label>
                <select
                  value={editInterviewerEmail}
                  onChange={(e) => setEditInterviewerEmail(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid #C8D1FF', borderRadius: 8, padding: '0.5rem 0.65rem', fontSize: '0.875rem', outline: 'none', background: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="">Select an interviewer…</option>
                  {interviewers.map((i) => (
                    <option key={i.email} value={i.email}>
                      {i.name}{i.designation ? ` — ${i.designation}` : ''} ({i.email})
                    </option>
                  ))}
                </select>
              </div>
              {editError && <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#EF4444' }}>{editError}</p>}
            </div>

            {/* Modal footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1.5px solid #EEF0FD', display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => setEditingApplicant(null)}
                style={{ padding: '0.55rem 1.25rem', background: '#ffffff', border: '1.5px solid #C8D1FF', borderRadius: 8, fontWeight: 600, fontSize: '0.875rem', color: '#040E6B', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleEditSave()}
                disabled={editSaving}
                style={{ padding: '0.55rem 1.5rem', background: editSaving ? '#C8D1FF' : 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.875rem', color: '#ffffff', cursor: editSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: editSaving ? 'none' : '0 4px 14px rgba(54,62,232,0.35)' }}
              >
                <Save size={14} />
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
