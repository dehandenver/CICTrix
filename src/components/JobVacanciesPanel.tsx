import { Briefcase, ChevronLeft, ChevronRight, Lock, Search, Users, XCircle } from 'lucide-react';
import { Combobox } from './combobox';
import { Modal } from './modal';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatOfficeLabel, formatOfficeName } from '../constants/positions';
import { formatPHDate } from '../lib/recruitmentData';
import { plantillaLabel } from '../lib/plantillaRules';
import { isOpenVacancy, manilaToday, matchesTitleOrPlantilla, plantillaNumbers, searchPositions, vacancyStatus, type PositionMatch } from '../lib/vacancySearch';
import type { ActiveVacancy, OpenVacancyInput } from '../lib/vacancies';
import { JobPosting } from '../types/recruitment.types';

const ITEMS_PER_PAGE = 10;

const BADGE_CLASS = { success: 'badge-success', warning: 'badge-warning', neutral: 'badge-neutral' } as const;

const HEADING = 'text-[var(--color-primary-900)]';

const peso = (value: number | undefined) =>
  value ? `₱${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 })}` : '—';

const experienceText = (job: JobPosting) => {
  const years = job.qualifications?.experience?.years ?? 0;
  const field = job.qualifications?.experience?.field;
  if (!years) return 'None required';
  const rounded = Math.round(years * 10) / 10;
  return `${rounded} year${rounded === 1 ? '' : 's'}${field ? ` · ${field}` : ''}`;
};

interface JobVacanciesPanelProps {
  jobs: JobPosting[];
  loading: boolean;
  /** Applications per posting id, as the filtered Applications tab lists them; undefined until loaded. */
  applicantCounts?: Map<string, number>;
  /** Active vacancy rows, for the Date Opened column. */
  activeVacancies: Map<string, ActiveVacancy>;
  /** Opens a closed position as a vacancy. Resolves true when it opened. */
  onOpenVacancy: (job: JobPosting, input: OpenVacancyInput) => Promise<boolean>;
  /** Asks to close an open vacancy early (the page owns the confirmation). */
  onClose: (job: JobPosting) => void;
  /** Opens Applicants › Applications filtered to this position. */
  onApplicants: (job: JobPosting) => void;
  /** No position matched the search: go create one. */
  onCreatePosition: () => void;
}

export const JobVacanciesPanel = ({
  jobs, loading, applicantCounts, activeVacancies, onOpenVacancy, onClose, onApplicants, onCreatePosition,
}: JobVacanciesPanelProps) => {
  const [search, setSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openJobs = useMemo(() => jobs.filter((job) => isOpenVacancy(job)), [jobs]);

  const officeOptions = useMemo(
    () => Array.from(new Set(openJobs.map((job) => formatOfficeName(job.department)))).sort((a, b) => a.localeCompare(b)),
    [openJobs],
  );

  const vacancies = useMemo(() => {
    const openedOn = (job: JobPosting) => activeVacancies.get(job.id)?.openedOn ?? String(job.postedDate ?? '');
    return openJobs
      .filter((job) => matchesTitleOrPlantilla(job, search))
      .filter((job) => officeFilter === 'all' || formatOfficeName(job.department) === officeFilter)
      .sort((a, b) => openedOn(b).localeCompare(openedOn(a)));
  }, [openJobs, search, officeFilter, activeVacancies]);

  const filtering = search.trim() !== '' || officeFilter !== 'all';
  const totalPages = Math.max(1, Math.ceil(vacancies.length / ITEMS_PER_PAGE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const rows = vacancies.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <>
    {/* Primary action sits on its own row at the left, like Create Job Position on the Job Positions tab. */}
    <div className="abyan-ds mb-5 flex justify-start">
      <button type="button" className="btn btn-md btn-primary" onClick={() => setDialogOpen(true)}>
        <Briefcase size={16} />
        Open Vacant Job Position
      </button>
    </div>

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className={`!mb-0.5 text-xl font-semibold ${HEADING}`}>Job Vacancies</h2>
        <p className="!mb-0 text-sm text-slate-500">Positions open for application. They close automatically at the deadline.</p>
      </div>

      {/* Table toolbar (§9.4), left-aligned so it starts at the card's content edge. */}
      <div className="abyan-ds mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm"
            placeholder="Search title or plantilla…"
            aria-label="Search vacancies by title or plantilla"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          />
        </div>
        <select
          className="h-9 min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm"
          aria-label="Filter by office"
          value={officeFilter}
          onChange={(event) => { setOfficeFilter(event.target.value); setPage(1); }}
        >
          <option value="all">All Offices</option>
          {officeOptions.map((office) => <option key={office} value={office}>{office}</option>)}
        </select>
      </div>

      <div className="abyan-table-wrap">
        {/* Fixed layout with set widths; Title and Office share what is left. Below
            the min width the table scrolls and Actions stays pinned on the right. */}
        <table className="abyan-table w-full min-w-[1200px] table-fixed">
          <colgroup>
            <col />
            <col className="w-[96px]" />
            <col />
            <col className="w-[128px]" />
            <col className="w-[168px]" />
            <col className="w-[112px]" />
            <col className="w-[96px]" />
            <col className="w-[300px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {['Position title', 'Plantilla(s)', 'Office / Department', 'Date opened', 'Application deadline'].map((label) => (
                <th key={label} scope="col" className={`whitespace-nowrap px-4 py-3 text-left text-[13px] font-semibold ${HEADING}`}>{label}</th>
              ))}
              <th scope="col" className={`whitespace-nowrap px-4 py-3 text-right text-[13px] font-semibold ${HEADING}`}>Applicants</th>
              <th scope="col" className={`whitespace-nowrap px-4 py-3 text-left text-[13px] font-semibold ${HEADING}`}>Status</th>
              <th scope="col" className={`sticky right-0 whitespace-nowrap border-l border-slate-200 bg-slate-50 px-4 py-3 text-right text-[13px] font-semibold ${HEADING}`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">Loading vacancies…</td></tr>
            )}
            {!loading && rows.map((job) => {
              const status = vacancyStatus(job);
              const openedOn = activeVacancies.get(job.id)?.openedOn || job.postedDate;
              const numbers = plantillaNumbers(job);
              // Office on the first line, division (when there is one) muted below it.
              const division = String(job.division ?? '').trim();
              const office = division ? formatOfficeName(job.department) : formatOfficeLabel(job.department);
              return (
                <tr key={job.id} className="group border-b border-slate-100 last:border-0 hover:bg-[#F8FAFF]">
                  <td className="px-4 py-3 align-middle">
                    <p className={`!mb-0 line-clamp-2 text-sm font-semibold ${HEADING}`} title={job.title}>{job.title}</p>
                  </td>
                  <td className="truncate px-4 py-3 align-middle text-sm text-slate-700" title={numbers.join(', ')}>{numbers.length > 0 ? numbers.join(', ') : '—'}</td>
                  <td className="px-4 py-3 align-middle">
                    <p className="!mb-0 truncate text-sm text-slate-700" title={office}>{office}</p>
                    {division && <p className="!mb-0 truncate text-xs text-slate-500" title={division}>{division}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 align-middle text-sm text-slate-700">{openedOn ? formatPHDate(openedOn) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 align-middle text-sm text-slate-700">{job.applicationDeadline ? formatPHDate(job.applicationDeadline) : 'Not set'}</td>
                  <td className="px-4 py-3 text-right align-middle text-sm text-slate-700">{applicantCounts?.get(job.id) ?? '—'}</td>
                  <td className="px-4 py-3 align-middle"><span className={`badge ${BADGE_CLASS[status.tone]}`}>{status.label}</span></td>
                  <td className="sticky right-0 border-l border-slate-200 bg-white px-4 py-3 align-middle group-hover:bg-[#F8FAFF]">
                    <div className="abyan-ds flex justify-end gap-2 whitespace-nowrap">
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => onApplicants(job)}>
                        <Users size={14} /> Applicants
                      </button>
                      <button type="button" className="btn btn-sm btn-destructive-outline" onClick={() => onClose(job)}>
                        <XCircle size={14} /> Close Vacancy
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  <Briefcase className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <p className="!mb-0 font-medium text-slate-700">
                    {filtering ? 'No open vacancies match your search.' : 'No open vacancies. Click \'Open Vacant Job Position\' to open one.'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between px-1 text-sm text-slate-600">
        <p className="!mb-0 text-xs">{vacancies.length === 0 ? 'No results' : `Showing ${(page - 1) * ITEMS_PER_PAGE + 1}–${Math.min(page * ITEMS_PER_PAGE, vacancies.length)} of ${vacancies.length}`}</p>
        <div className="flex items-center gap-2">
          <button aria-label="Previous page" className="rsp-pager flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 disabled:opacity-40" onClick={() => setPage((c) => Math.max(1, c - 1))} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-medium">Page {page} of {totalPages}</span>
          <button aria-label="Next page" className="rsp-pager flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 disabled:opacity-40" onClick={() => setPage((c) => Math.min(totalPages, c + 1))} disabled={page === totalPages}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {dialogOpen && (
        <OpenVacancyDialog
          jobs={jobs}
          onCancel={() => setDialogOpen(false)}
          onCreatePosition={() => { setDialogOpen(false); onCreatePosition(); }}
          onSubmit={async (job, input) => {
            if (await onOpenVacancy(job, input)) setDialogOpen(false);
          }}
        />
      )}
    </section>
    </>
  );
};

interface OpenVacancyDialogProps {
  jobs: JobPosting[];
  onCancel: () => void;
  onCreatePosition: () => void;
  onSubmit: (job: JobPosting, input: OpenVacancyInput) => Promise<void>;
}

const OpenVacancyDialog = ({ jobs, onCancel, onCreatePosition, onSubmit }: OpenVacancyDialogProps) => {
  const today = manilaToday();
  const [picked, setPicked] = useState<JobPosting | null>(null);
  const [query, setQuery] = useState('');
  const [deadline, setDeadline] = useState('');
  const [openedOn, setOpenedOn] = useState(today);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => searchPositions(jobs, query), [jobs, query]);

  useEffect(() => { if (!picked) inputRef.current?.focus(); }, [picked]);

  const choose = (match: PositionMatch) => {
    setPicked(match.job);
    setQuery('');
  };

  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  // Applications close at 11:59 PM Manila on the deadline, so today is still valid.
  const deadlineValid = isDate(deadline) && deadline >= today;
  const openedOnValid = isDate(openedOn) && (!deadlineValid || openedOn <= deadline);
  const canSubmit = Boolean(picked) && deadlineValid && openedOnValid && !saving;

  const submit = async () => {
    if (!picked || !canSubmit) return;
    setSaving(true);
    try { await onSubmit(picked, { deadline, openedOn, remarks }); } finally { setSaving(false); }
  };

  const fieldClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[rgba(54,62,232,.15)]';

  const readOnly = (label: string, value: string, wide = false) => (
    <div className={wide ? 'col-span-2' : ''}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      <div className="flex min-h-10 items-start gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-700">
        <span className="min-w-0 flex-1">{value || '—'}</span>
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={onCancel}
      dismissible={!saving}
      title="Open Vacant Job Position"
      subtitle="Pick a closed job position. Its details come from Job Positions."
      initialFocusRef={picked ? undefined : inputRef}
      footer={(
        <>
          <button type="button" className="btn btn-md btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button
            type="button"
            className={`btn btn-md btn-primary${saving ? ' is-loading' : ''}`}
            disabled={!canSubmit}
            aria-busy={saving || undefined}
            onClick={() => void submit()}
          >
            Open Vacancy
          </button>
        </>
      )}
    >
        {!picked && (
          <div>
            <label htmlFor={`${listId}-q`} className="mb-1.5 block text-[13px] font-medium text-slate-700">Job position <span className="text-rose-500">*</span></label>
            <Combobox<PositionMatch>
              id={`${listId}-q`}
              inputRef={inputRef}
              placeholder="Search by title or plantilla number"
              query={query}
              onQueryChange={setQuery}
              items={results}
              getKey={(match) => match.job.id}
              isDisabled={(match) => match.eligibility !== 'available'}
              onSelect={choose}
              renderOption={(match, { disabled }) => (
                <>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${disabled ? 'bg-slate-100 text-slate-400' : 'bg-[var(--color-primary-50)] text-[var(--color-primary)]'}`}>
                    <Briefcase className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold ${disabled ? 'text-slate-400' : HEADING}`}>{match.job.title}</span>
                    <span className={`block truncate text-xs ${disabled ? 'text-slate-400' : 'text-slate-500'}`}>
                      {plantillaNumbers(match.job).length > 0 ? `Plantilla ${plantillaNumbers(match.job).join(', ')} · ` : ''}{formatOfficeLabel(match.job.department, match.job.division)}
                    </span>
                  </span>
                  {disabled && <span className="badge badge-success">Already open</span>}
                </>
              )}
              emptyState={(
                <div className="px-3 py-5 text-center text-sm text-slate-500">
                  <p className="!mb-1">No matching job position found.</p>
                  <button
                    type="button"
                    className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                    onMouseDown={(event) => { event.preventDefault(); onCreatePosition(); }}
                  >
                    Create Job Position
                  </button>
                </div>
              )}
              footer={(items) => (
                <p className="!mb-0 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  {items.length} match{items.length === 1 ? '' : 'es'} · ↑↓ to move · Enter to select · Esc to close
                </p>
              )}
            />
            <p className="!mb-0 mt-1 text-xs text-slate-500">Only closed positions can be opened. Open ones are listed but can't be picked.</p>
          </div>
        )}

        {picked && (
          <div>
            <div className="flex items-center gap-3 rounded-xl border border-[var(--color-primary-200)] bg-[var(--color-primary-50)] px-4 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-[var(--color-primary)]"><Briefcase className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className={`!mb-0 text-sm font-semibold ${HEADING}`}>{picked.title}</p>
                <p className="!mb-0 truncate text-xs text-slate-500">{formatOfficeLabel(picked.department, picked.division)}</p>
              </div>
              <button type="button" onClick={() => setPicked(null)} className="ml-auto text-sm font-medium text-[var(--color-primary)] hover:underline">Change</button>
            </div>
            <p className="!mb-3 mt-6 text-xs font-semibold uppercase tracking-[.4px] text-slate-500">From Job Positions</p>
            <div className="grid grid-cols-2 gap-4">
              {readOnly('Salary grade', picked.salaryGrade ? `SG ${picked.salaryGrade} · ${peso(picked.monthlySalary)}` : '—')}
              {readOnly('Employment status', String(picked.employmentStatus ?? ''))}
              {readOnly('Plantillas', (picked.plantillaSlots ?? []).map((slot) => plantillaLabel(slot)).join(', '), true)}
              {readOnly('Education', String(picked.qualifications?.education ?? ''), true)}
              {readOnly('Experience', experienceText(picked))}
              {readOnly('Training', String(picked.training ?? picked.qualifications?.preferred ?? ''))}
              {readOnly('Eligibility', String(picked.eligibility ?? ''), true)}
            </div>
            <p className="!mb-0 mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Lock className="h-4 w-4" /> Read-only. To change these, edit the position in Job Positions.
            </p>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 rounded-xl border-[1.5px] border-[var(--color-primary-200)] bg-[#FAFBFF] p-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${listId}-dl`} className="mb-1.5 block text-[13px] font-medium text-slate-700">Application deadline <span className="text-rose-500">*</span></label>
            <input id={`${listId}-dl`} type="date" min={today} className={fieldClass} value={deadline} onChange={(event) => setDeadline(event.target.value)} />
            <p className="!mb-0 mt-1 text-xs text-slate-500">
              {deadline && !deadlineValid ? 'Pick today or a later date.' : 'Applications close at 11:59 PM (Manila) on this date.'}
            </p>
          </div>
          <div>
            <label htmlFor={`${listId}-on`} className="mb-1.5 block text-[13px] font-medium text-slate-700">Date opened</label>
            <input id={`${listId}-on`} type="date" max={deadlineValid ? deadline : undefined} className={fieldClass} value={openedOn} onChange={(event) => setOpenedOn(event.target.value)} />
            <p className="!mb-0 mt-1 text-xs text-slate-500">{openedOnValid ? 'Defaults to today.' : 'Must be on or before the deadline.'}</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${listId}-rm`} className="mb-1.5 block text-[13px] font-medium text-slate-700">Remarks</label>
            <textarea id={`${listId}-rm`} rows={2} className={`${fieldClass} h-auto py-2`} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Optional" />
          </div>
        </div>

    </Modal>
  );
};
