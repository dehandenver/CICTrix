// Subtab 2 — "Qualified Applicants" within the RSP qualified page.
// Two sub-views:
//   "Pending Assignment" — qualified applicants that still need a schedule.
//   "Scheduled"         — applicants with a complete schedule, awaiting evaluation.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Pencil,
  Save,
  Search,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { SortButton, SortHeader, toTime, useTableSort } from './tableSort';
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

/** One-line schedule, e.g. "Sep 25, 2026 · 3:28 PM"; the time is dropped when absent. */
const fmtSchedule = (date: string, time: string) => {
  const d = fmtDate(date);
  return time ? `${d} · ${fmtTime(time)}` : d;
};

const normalizeType = (t: string | null | undefined) =>
  (t ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original';

/**
 * When the applicant qualified. There is no qualified_at column, so the row's
 * last update stands in for it, falling back to the application date.
 */
const qualifiedTime = (a: ApplicantRecord) => {
  const updated = toTime(a.updated_at);
  return Number.isNaN(updated) ? toTime(a.created_at) : updated;
};

type PendingSortKey = 'qualified' | 'name' | 'position' | 'department' | 'type' | 'applied';

const PENDING_SORT_ACCESSORS: Record<PendingSortKey, (a: ApplicantRecord) => string | number> = {
  qualified:  qualifiedTime,
  name:       (a) => a.full_name,
  position:   (a) => a.position,
  department: (a) => a.office,
  type:       (a) => normalizeType(a.application_type),
  applied:    (a) => toTime(a.created_at),
};

type ScheduledSortKey = 'qualified' | 'name' | 'position' | 'department' | 'exam' | 'interview' | 'interviewer';

/** No sort chosen yet → most recently qualified applicant first. */
const DEFAULT_QUALIFIED_SORT = { key: 'qualified', dir: 'desc' } as const;
const PENDING_DESC_FIRST: readonly PendingSortKey[] = ['qualified', 'applied'];
const SCHEDULED_DESC_FIRST: readonly ScheduledSortKey[] = ['qualified'];

const SCHEDULED_TH = 'px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500';

/** "2026-10-07 09:30" sorts chronologically as text; blank when there is no date. */
const scheduleKey = (date: string | null | undefined, time: string | null | undefined) =>
  date ? `${date} ${time ?? ''}` : '';

export const PendingAssignmentList = ({ applicants, completedEvaluationIds }: PendingAssignmentListProps) => {

  const [subTab, setSubTab] = useState<'pending' | 'scheduled' | 'rater-management'>('pending');
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);
  const [overrides, setOverrides] = useState<Record<string, ApplicantAssignmentFields>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Shared bulk-assignment fields.
  // examDate/examTime cover the Written Examination per spec section 7.
  const [examDate, setExamDate] = useState('');
  const [examTime, setExamTime] = useState('');
  // Oral Examination + Venue + Additional Instructions are spec-added UI
  // fields. They are not yet persisted server-side (the applicants table only
  // has columns for the written exam + interview + interviewer), so they
  // surface in the form and the in-memory override but a DB migration is
  // needed to round-trip them.
  const [oralExamDate, setOralExamDate] = useState('');
  const [oralExamTime, setOralExamTime] = useState('');
  const [venue, setVenue] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
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

  // Filters shared by the Pending and Scheduled tables.
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const qualifiedApplicants = useMemo(
    () => applicants.filter((a) => isQualified(a, completedEvaluationIds)),
    [applicants, completedEvaluationIds],
  );
  const departments = useMemo(
    () => [...new Set(qualifiedApplicants.map((a) => a.office).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [qualifiedApplicants],
  );
  // Positions narrow to the chosen department so the two dropdowns never contradict.
  const positions = useMemo(
    () => [...new Set(
      qualifiedApplicants
        .filter((a) => departmentFilter === 'all' || a.office === departmentFilter)
        .map((a) => a.position)
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b)),
    [qualifiedApplicants, departmentFilter],
  );

  const matchesFilters = useCallback((a: ApplicantRecord) => {
    if (departmentFilter !== 'all' && a.office !== departmentFilter) return false;
    if (positionFilter !== 'all' && a.position !== positionFilter) return false;
    if (typeFilter !== 'all' && normalizeType(a.application_type) !== typeFilter) return false;
    const term = search.trim().toLowerCase();
    if (term) {
      return (
        a.full_name.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term) ||
        a.position.toLowerCase().includes(term) ||
        a.office.toLowerCase().includes(term)
      );
    }
    return true;
  }, [search, departmentFilter, positionFilter, typeFilter]);

  const filtersActive = search.trim() !== '' || departmentFilter !== 'all' || positionFilter !== 'all' || typeFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setDepartmentFilter('all');
    setPositionFilter('all');
    setTypeFilter('all');
  };

  const filteredPending = useMemo(() => pendingApplicants.filter(matchesFilters), [pendingApplicants, matchesFilters]);
  const filteredScheduled = useMemo(() => scheduledApplicants.filter(matchesFilters), [scheduledApplicants, matchesFilters]);

  const { sorted: sortedPending, sort: pendingSort, toggle: togglePendingSort } =
    useTableSort<ApplicantRecord, PendingSortKey>(filteredPending, PENDING_SORT_ACCESSORS, DEFAULT_QUALIFIED_SORT, PENDING_DESC_FIRST);

  // Schedule values come from the merged record so a just-published schedule sorts correctly.
  const scheduledSortAccessors = useMemo<Record<ScheduledSortKey, (a: ApplicantRecord) => string | number>>(() => ({
    qualified:   qualifiedTime,
    name:        (a) => a.full_name,
    position:    (a) => a.position,
    department:  (a) => a.office,
    exam:        (a) => { const m = mergeAssignment(a); return scheduleKey(m.exam_date, m.exam_time); },
    interview:   (a) => { const m = mergeAssignment(a); return scheduleKey(m.interview_date, m.interview_time); },
    interviewer: (a) => {
      const email = mergeAssignment(a).assigned_interviewer_email ?? '';
      return interviewers.find((i) => i.email === email)?.name ?? email;
    },
  }), [mergeAssignment, interviewers]);

  const { sorted: sortedScheduled, sort: scheduledSort, toggle: toggleScheduledSort } =
    useTableSort<ApplicantRecord, ScheduledSortKey>(filteredScheduled, scheduledSortAccessors, DEFAULT_QUALIFIED_SORT, SCHEDULED_DESC_FIRST);

  // Picks survive filter changes so RSP can gather applicants across
  // departments; only ids that left the pending list (already assigned) drop.
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

  // The header checkbox reflects and acts on the rows currently shown.
  const visibleSelectedCount = filteredPending.filter((a) => selectedIds.has(a.id)).length;
  const allSelected = filteredPending.length > 0 && visibleSelectedCount === filteredPending.length;
  const someSelected = visibleSelectedCount > 0 && !allSelected;

  // Selected applicants per department, for the selection bar chips.
  const selectedByDepartment = useMemo(() => {
    const counts = new Map<string, string[]>();
    pendingApplicants.forEach((a) => {
      if (!selectedIds.has(a.id)) return;
      const dept = a.office || 'Unassigned';
      counts.set(dept, [...(counts.get(dept) ?? []), a.id]);
    });
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [pendingApplicants, selectedIds]);

  const unselectIds = (ids: string[]) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      unselectIds(filteredPending.map((a) => a.id));
      return;
    }
    setSelectedIds((prev) => new Set([...prev, ...filteredPending.map((a) => a.id)]));
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
      oral_exam_date: oralExamDate || null,
      oral_exam_time: oralExamTime || null,
      venue: venue.trim() || null,
      schedule_instructions: additionalInstructions.trim() || null,
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

  // Same filter card as Applications, shared by the Pending and Scheduled tables.
  const renderFilterBar = (shown: number, total: number, defaultOrder: boolean) => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, email, position, or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-[#363EE8] focus:outline-none"
          />
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => { setDepartmentFilter(e.target.value); setPositionFilter('all'); }}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none"
        >
          <option value="all">All Departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none"
        >
          <option value="all">All Positions</option>
          {positions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none"
        >
          <option value="all">All Types</option>
          <option value="Original">Original</option>
          <option value="Promotional">Promotional</option>
        </select>
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
        <span>
          {filtersActive ? `${shown} of ${total}` : total} applicant{(filtersActive ? shown : total) === 1 ? '' : 's'}
          {defaultOrder && ' · most recently qualified first'}
        </span>
        {filtersActive && (
          <button type="button" className="text-[#363EE8] hover:underline" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );

  const noMatchRow = (colSpan: number) => (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-slate-500">
        <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
        <p className="font-medium">No applicants match the selected filters.</p>
      </td>
    </tr>
  );

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

          {/* Interview & Exam Schedule panel (spec §7) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold" style={{ color: '#040E6B' }}>Interview &amp; Exam Schedule</h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  Fill in the dates and times for each stage, then publish to the selected applicants.
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                {selectedIds.size} selected
              </span>
            </div>

            {/* Written Examination */}
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Written Examination</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <Calendar size={12} /> Date
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
                    <Clock size={12} /> Time
                  </label>
                  <input
                    type="time"
                    value={examTime}
                    onChange={(e) => setExamTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Oral Examination */}
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Oral Examination</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <Calendar size={12} /> Date
                  </label>
                  <input
                    type="date"
                    value={oralExamDate}
                    onChange={(e) => setOralExamDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <Clock size={12} /> Time
                  </label>
                  <input
                    type="time"
                    value={oralExamTime}
                    onChange={(e) => setOralExamTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Interview */}
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Interview</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <Calendar size={12} /> Date
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
                    <Clock size={12} /> Time
                  </label>
                  <input
                    type="time"
                    value={interviewTime}
                    onChange={(e) => setInterviewTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Venue + Evaluator + Instructions */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Venue
                </label>
                <input
                  type="text"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="e.g. City Hall Conference Room 3"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <UserCheck size={12} /> Assigned Evaluators
                </label>
                <select
                  value={interviewerEmail}
                  onChange={(e) => setInterviewerEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select an evaluator…</option>
                  {interviewers.map((i) => (
                    <option key={i.email} value={i.email}>
                      {i.name}{i.designation ? ` — ${i.designation}` : ''} ({i.email})
                    </option>
                  ))}
                </select>
                {interviewers.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    No active raters found. Grant access in the Rater Management tab first.
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Additional Instructions
                </label>
                <textarea
                  rows={3}
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder="What to bring, dress code, contact person, etc."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
                />
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
            <>
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm">
                <span className="font-semibold" style={{ color: '#363EE8' }}>{selectedIds.size} selected</span>
                {selectedByDepartment.map(([dept, ids]) => (
                  <span
                    key={dept}
                    className="inline-flex items-center overflow-hidden rounded-full border border-indigo-200 bg-white text-xs font-medium text-slate-700"
                  >
                    <button
                      type="button"
                      onClick={() => { setDepartmentFilter(dept === 'Unassigned' ? 'all' : dept); setPositionFilter('all'); }}
                      className="px-2.5 py-1 hover:bg-indigo-50"
                      title={`Show ${dept}`}
                    >
                      {dept} · {ids.length}
                    </button>
                    <button
                      type="button"
                      onClick={() => unselectIds(ids)}
                      className="border-l border-indigo-100 px-1.5 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Unselect ${dept}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="ml-auto text-xs font-medium text-[#363EE8] hover:underline"
                >
                  Clear all
                </button>
              </div>
            )}
            {renderFilterBar(filteredPending.length, pendingApplicants.length, pendingSort.key === 'qualified')}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="w-10 px-5 py-3 text-left">
                      <input
                        type="checkbox"
                        aria-label="Select all pending applicants shown"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleSelectAll}
                        disabled={filteredPending.length === 0}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <SortHeader label="Applicant Name" sortKey="name" sort={pendingSort} onSort={togglePendingSort} />
                    <SortHeader label="Position" sortKey="position" sort={pendingSort} onSort={togglePendingSort} />
                    <SortHeader label="Department" sortKey="department" sort={pendingSort} onSort={togglePendingSort} />
                    <SortHeader label="Type" sortKey="type" sort={pendingSort} onSort={togglePendingSort} />
                    <SortHeader label="Applied" sortKey="applied" sort={pendingSort} onSort={togglePendingSort} />
                  </tr>
                </thead>
                <tbody>
                  {sortedPending.length === 0 && noMatchRow(6)}
                  {sortedPending.map((a) => {
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
            </>
          )}
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
              These applicants have a published exam &amp; interview schedule. Once the interview is complete,
              their scores will be recorded in the <span className="font-semibold">Applicant Score</span> tab.
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
            <>
            {renderFilterBar(filteredScheduled.length, scheduledApplicants.length, scheduledSort.key === 'qualified')}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {/* Fixed layout with set widths so dates never wrap and the table
                  fits at 1366px without a sideways scroll. */}
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[21%]" />
                  <col className="w-[19%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[11%]" />
                  <col className="w-[13%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <SortHeader label="Applicant" sortKey="name" sort={scheduledSort} onSort={toggleScheduledSort} className={SCHEDULED_TH} />
                    <th
                      aria-sort={scheduledSort.key === 'position' || scheduledSort.key === 'department'
                        ? (scheduledSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={SCHEDULED_TH}
                    >
                      <span className="inline-flex items-center gap-1">
                        <SortButton label="Position" sortKey="position" sort={scheduledSort} onSort={toggleScheduledSort} />
                        <span>/</span>
                        <SortButton label="Office" sortKey="department" sort={scheduledSort} onSort={toggleScheduledSort} />
                      </span>
                    </th>
                    <SortHeader label="Exam Schedule" sortKey="exam" sort={scheduledSort} onSort={toggleScheduledSort} className={SCHEDULED_TH} />
                    <SortHeader label="Interview Schedule" sortKey="interview" sort={scheduledSort} onSort={toggleScheduledSort} className={SCHEDULED_TH} />
                    <SortHeader label="Interviewer" sortKey="interviewer" sort={scheduledSort} onSort={toggleScheduledSort} className={SCHEDULED_TH} />
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedScheduled.length === 0 && noMatchRow(6)}
                  {sortedScheduled.map((a) => {
                    const merged = mergeAssignment(a);
                    const interviewer = getInterviewerName(merged.assigned_interviewer_email);
                    const examAt = fmtSchedule(merged.exam_date ?? '', merged.exam_time ?? '');
                    const interviewAt = fmtSchedule(merged.interview_date ?? '', merged.interview_time ?? '');
                    const type = normalizeType(a.application_type);
                    return (
                      <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-sm font-semibold" style={{ color: '#040E6B' }} title={a.full_name || undefined}>{a.full_name || '—'}</p>
                            <span
                              className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                type === 'Promotional' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'
                              }`}
                            >
                              {type}
                            </span>
                          </div>
                          <p className="truncate text-xs text-slate-400" title={a.email || undefined}>{a.email}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="truncate text-sm font-medium text-slate-800" title={a.position || undefined}>{a.position || '—'}</p>
                          <p className="truncate text-xs text-slate-400" title={a.office || undefined}>{a.office || '—'}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="flex items-center gap-1.5 whitespace-nowrap text-[13px] text-slate-800">
                            <Calendar size={13} className="shrink-0 text-slate-400" /> {examAt}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="flex items-center gap-1.5 whitespace-nowrap text-[13px] text-slate-800">
                            <Calendar size={13} className="shrink-0 text-slate-400" /> {interviewAt}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p
                            className="flex min-w-0 items-center gap-1.5 text-sm text-slate-800"
                            title={merged.assigned_interviewer_email || undefined}
                          >
                            <UserCheck size={13} className="shrink-0 text-slate-400" />
                            <span className="truncate">{interviewer}</span>
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => openEditModal(a)}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <Pencil size={12} className="shrink-0" /> Edit Schedule
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </>
      )}

      {/* Save Assignment — bottom-right of page, only shown on pending tab */}
      {subTab === 'pending' && (
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
