import { useEffect, useMemo, useState } from 'react';
import { AdminHeader } from './AdminHeader';
import { ApplicantsTabBar } from './ApplicantsTabBar';
import { Sidebar } from './Sidebar';
import { supabase } from '../lib/supabase';
import { isMockModeEnabled } from '../lib/supabase';
import { mockDatabase } from '../lib/mockDatabase';
import { getPreferredDataSourceMode } from '../lib/dataSourceMode';
import { ChevronLeft, ChevronRight, Search, Undo2, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchApplicantSlotLinks, fetchSlotsByJobPosting } from '../lib/plantillaSlots';
import { belongsToPosition, isDisqualifiedStatus, isQualifiedStatus, isShortlistedStatus } from '../lib/applicationsByPosition';
import { formatPHDate, getJobPostings, loadJobPostings } from '../lib/recruitmentData';
import { isOpenVacancy, plantillaNumbers } from '../lib/vacancySearch';
import { formatOfficeLabel } from '../constants/positions';
import type { JobPosting } from '../types/recruitment.types';
import { plantillaLabel } from '../lib/plantillaRules';
import { samePositionRows } from '../lib/applicantReviewQueue';
import { SortHeader, toTime, useTableSort } from './tableSort';
import { TableRefreshBar, TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';
import { ErrorBanner } from './ErrorBanner';
import { useFeedback } from './action-feedback';
import { describeActionFailure } from '../lib/friendlyErrors';
import { groupByReference, type ReferenceApplication } from '../lib/referenceApplications';
import { ReferenceAppsChip } from './ReferenceAppsChip';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Applicant {
  id: string;
  full_name: string;
  email: string;
  /** The Plantilla Item No. applied for — a position code. */
  item_number: string;
  /** This application's system-issued tracking code, ABYAN-000-000. */
  reference_no: string;
  position: string;
  office: string;
  status: string;
  created_at: string;
  application_type?: string | null;
  /**
   * The plantilla item(s) this single application is in the running for. A
   * posting can advertise several identical vacancies, and one application can
   * cover more than one of them.
   */
  plantilla_slots: Array<{ slotNumber: number; itemNumber: string; label?: string }>;
  needs_slot_reassignment: boolean;
  /** Links to a position, for the ?positionId= filter (see applicationsByPosition). */
  plantilla_slot_id: string | null;
  job_posting_id: string | null;
  linked_slot_ids: string[];
  /** Set when a hire on another plantilla withdrew this application. */
  hired_elsewhere_application_id: string | null;
  deleted_at: string | null;
}

const ITEMS_PER_PAGE = 10;

const applicationType = (a: Applicant) =>
  (a.application_type ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original';

type ApplicantSortKey = 'name' | 'reference' | 'position' | 'department' | 'type' | 'applied';

const APPLICANT_SORT_ACCESSORS: Record<ApplicantSortKey, (a: Applicant) => string | number> = {
  name:       a => a.full_name,
  reference:  a => a.reference_no,
  position:   a => a.position,
  department: a => a.office,
  type:       applicationType,
  applied:    a => toTime(a.created_at),
};

/** No sort chosen yet → most recent applicant first. */
const DEFAULT_APPLICANT_SORT = { key: 'applied', dir: 'desc' } as const;
const DESC_FIRST_KEYS: readonly ApplicantSortKey[] = ['applied'];

/** Reference numbers get quoted back with arbitrary case and punctuation. */
const normalizeReference = (value: string) =>
  String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
};



/**
 * Which plantilla item(s) an application covers. Renders nothing for the
 * ordinary single-slot posting, where the position title already says it all.
 */
const PlantillaTags = ({ applicant }: { applicant: Applicant }) => {
  if (applicant.plantilla_slots.length < 2 && !applicant.needs_slot_reassignment) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {applicant.plantilla_slots.map(slot => (
        <span
          key={slot.itemNumber}
          className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200"
        >
          {plantillaLabel(slot)}
        </span>
      ))}
      {applicant.needs_slot_reassignment && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          Needs reassignment
        </span>
      )}
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

export const ApplicationsListPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Job Posts › Job Vacancies › Applicants opens this tab with ?positionId=.
  const [searchParams, setSearchParams] = useSearchParams();
  const positionId = searchParams.get('positionId') ?? '';
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  /** Plantilla slot ids per position id. */
  const [slotIdsByPosition, setSlotIdsByPosition] = useState<Map<string, Set<string>>>(new Map());
  const [position, setPosition] = useState<JobPosting | null | undefined>(undefined);
  const [loading, setLoading]       = useState(true);
  // A failed read, so the table never says "No applicants" when it couldn't look.
  const [loadError, setLoadError]   = useState<unknown>(null);
  const feedback = useFeedback();
  const [search, setSearch]         = useState('');
  const [officeFilter, setOfficeFilter]     = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [typeFilter, setTypeFilter]         = useState('all');
  const [page, setPage] = useState(1);
  const [selectedShortlistIds, setSelectedShortlistIds] = useState<Set<string>>(new Set());
  const [removingShortlist, setRemovingShortlist] = useState(false);

  // ── Load applicants ────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
        const client: any = preferredMode === 'local' ? mockDatabase : supabase;
        const { data, error } = await client.from('applicants').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        // Resolve each application's plantilla item(s) in two reads rather than
        // per row. Both return empty before migration 20260922 is applied, and
        // the tags simply do not render.
        const [slotLinks, slotsByJob] = await Promise.all([
          fetchApplicantSlotLinks(),
          fetchSlotsByJobPosting(),
        ]);
        const slotById = new Map<string, { slotNumber: number; itemNumber: string; label?: string }>();
        slotsByJob.forEach(slots => slots.forEach(slot =>
          slotById.set(slot.id, { slotNumber: slot.slotNumber, itemNumber: slot.itemNumber, label: slot.label })));
        setSlotIdsByPosition(new Map([...slotsByJob].map(([jobId, slots]) => [jobId, new Set(slots.map(slot => slot.id))])));

        const rows: Applicant[] = (data ?? []).map((r: any) => ({
          id:               String(r.id ?? ''),
          full_name:        [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ') || String(r.full_name ?? '—'),
          email:            String(r.email ?? ''),
          item_number:      String(r.item_number ?? ''),
          reference_no:     String(r.reference_no ?? ''),
          position:         String(r.position ?? ''),
          office:           String(r.office ?? ''),
          status:           String(r.status ?? ''),
          created_at:       String(r.created_at ?? ''),
          application_type: r.application_type ?? null,
          plantilla_slots:  (slotLinks.get(String(r.id ?? '')) ?? [])
                              .map(link => slotById.get(link.slotId))
                              .filter((slot): slot is { slotNumber: number; itemNumber: string; label?: string } => Boolean(slot))
                              .sort((a, b) => a.slotNumber - b.slotNumber),
          needs_slot_reassignment: Boolean(r.needs_slot_reassignment),
          plantilla_slot_id: r.plantilla_slot_id ? String(r.plantilla_slot_id) : null,
          job_posting_id:   r.job_posting_id ? String(r.job_posting_id) : null,
          linked_slot_ids:  (slotLinks.get(String(r.id ?? '')) ?? []).map(link => link.slotId),
          hired_elsewhere_application_id: r.hired_elsewhere_application_id ? String(r.hired_elsewhere_application_id) : null,
          deleted_at:       r.deleted_at ? String(r.deleted_at) : null,
        }));
        setApplicants(rows);
        setLoadError(null);
      } catch (error) {
        console.error('[ApplicationsListPage] applicants failed to load:', error);
        setLoadError(error);
      } finally {
        setLoading(false);
      }
    };
    void load();
    window.addEventListener('cictrix:applicants-updated', load);
    return () => window.removeEventListener('cictrix:applicants-updated', load);
  }, []);

  // The filtered position. undefined = still looking, null = not found.
  useEffect(() => {
    if (!positionId) { setPosition(undefined); return; }
    let cancelled = false;
    const find = (jobs: JobPosting[]) => jobs.find(job => job.id === positionId);
    const cached = find(getJobPostings());
    if (cached) { setPosition(cached); return; }
    setPosition(undefined);
    void loadJobPostings().then(jobs => {
      if (cancelled) return;
      setPosition(find(jobs) ?? null);
    });
    return () => { cancelled = true; };
  }, [positionId]);

  /** "Office · Plantilla 21, 22 · Deadline Oct 30, 2026" for the filtered header. */
  const positionDetails = position
    ? [
        formatOfficeLabel(position.department, position.division),
        plantillaNumbers(position).length > 0 ? `Plantilla ${plantillaNumbers(position).join(', ')}` : '',
        isOpenVacancy(position)
          ? position.applicationDeadline ? `Deadline ${formatPHDate(position.applicationDeadline)}` : 'Open'
          : 'Closed',
      ].filter(Boolean).join(' · ')
    : '';

  // ── Derived ────────────────────────────────────────────────────────────────
  const inPosition = useMemo(() => {
    if (!positionId) return () => true;
    const slotIds = slotIdsByPosition.get(positionId) ?? new Set<string>();
    const linked = new Map(applicants.map(a => [a.id, a.linked_slot_ids]));
    return (a: Applicant) => belongsToPosition(
      { id: a.id, plantillaSlotId: a.plantilla_slot_id, jobPostingId: a.job_posting_id }, positionId, slotIds, linked);
  }, [positionId, slotIdsByPosition, applicants]);

  const clearPositionFilter = () => { setSearchParams({}); setPage(1); };

  // Every application under each Reference No., for the "N apps" chip. Built
  // from all loaded rows, including the hired-elsewhere ones the lists hide.
  const referenceGroups = useMemo(() => groupByReference(
    applicants
      .filter(a => !a.deleted_at)
      .map((a): ReferenceApplication => ({
        id: a.id,
        referenceNo: a.reference_no,
        position: a.position,
        plantillaLabel: a.plantilla_slots.length > 0 ? a.plantilla_slots.map(plantillaLabel).join(', ') : null,
        status: a.status,
        hiredElsewhereApplicationId: a.hired_elsewhere_application_id,
        createdAt: a.created_at,
      })),
  ), [applicants]);
  const referenceApps = (a: Applicant) => referenceGroups.get(normalizeReference(a.reference_no)) ?? [];

  const offices   = useMemo(() => [...new Set(applicants.map(a => a.office).filter(Boolean))].sort(),    [applicants]);
  const positions = useMemo(() => [...new Set(applicants.map(a => a.position).filter(Boolean))].sort(), [applicants]);

  const normalizeType = (t: string | null | undefined) =>
    (t ?? '').toLowerCase().includes('promot') ? 'promotional' : 'original';

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return applicants.filter(a => {
      // Shortlisted rows live in the dedicated section below the main table.
      if (isShortlistedStatus(a.status)) return false;
      // Qualified applicants move to the Qualified Applicants tab.
      if (isQualifiedStatus(a.status)) return false;
      // Disqualified applicants are removed from all list views.
      if (isDisqualifiedStatus(a.status)) return false;
      if (!inPosition(a)) return false;
      if (officeFilter  !== 'all' && a.office   !== officeFilter)   return false;
      if (positionFilter !== 'all' && a.position !== positionFilter) return false;
      if (typeFilter     !== 'all' && normalizeType(a.application_type) !== typeFilter) return false;
      if (term) {
        // Reference No. is matched on its normalised form so an admin can
        // paste whatever an applicant quoted at them — "abyan 123 456"
        // included. An empty normalisation (the term was all punctuation)
        // must not turn into a match-everything.
        const referenceTerm = normalizeReference(term);
        const matches =
          a.full_name.toLowerCase().includes(term) ||
          a.email.toLowerCase().includes(term) ||
          a.position.toLowerCase().includes(term) ||
          a.item_number.toLowerCase().includes(term) ||
          (referenceTerm.length > 0 && normalizeReference(a.reference_no).includes(referenceTerm));
        if (!matches) return false;
      }
      return true;
    });
  }, [applicants, search, officeFilter, positionFilter, typeFilter, inPosition]);

  const shortlisted = useMemo(
    () => applicants.filter(a => isShortlistedStatus(a.status) && inPosition(a)),
    [applicants, inPosition],
  );

  const { sorted: sortedApplicants, sort: applicantSort, toggle: toggleApplicantSort } =
    useTableSort<Applicant, ApplicantSortKey>(filtered, APPLICANT_SORT_ACCESSORS, DEFAULT_APPLICANT_SORT, DESC_FIRST_KEYS);
  const { sorted: sortedShortlisted, sort: shortlistSort, toggle: toggleShortlistSort } =
    useTableSort<Applicant, ApplicantSortKey>(shortlisted, APPLICANT_SORT_ACCESSORS, DEFAULT_APPLICANT_SORT, DESC_FIRST_KEYS);

  // A new order starts from the first page, like a new filter does.
  const sortApplicants = (key: ApplicantSortKey) => { toggleApplicantSort(key); setPage(1); };

  // Drop stale ids when the underlying list changes (e.g. after a remove).
  useEffect(() => {
    setSelectedShortlistIds(prev => {
      const valid = new Set(shortlisted.map(a => a.id));
      const next = new Set<string>();
      prev.forEach(id => { if (valid.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [shortlisted]);

  const allShortlistedSelected = shortlisted.length > 0 && selectedShortlistIds.size === shortlisted.length;
  const someShortlistedSelected = selectedShortlistIds.size > 0 && !allShortlistedSelected;

  const toggleShortlistSelection = (id: string) => {
    setSelectedShortlistIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllShortlist = () => {
    setSelectedShortlistIds(prev =>
      prev.size === shortlisted.length ? new Set<string>() : new Set(shortlisted.map(a => a.id))
    );
  };

  const removeSelectedFromShortlist = async () => {
    if (selectedShortlistIds.size === 0 || removingShortlist) return;
    setRemovingShortlist(true);
    const ids = Array.from(selectedShortlistIds);

    // Only rows the database accepted move back to the main list; the rest
    // stay selected so the user can try again.
    const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
    const client: any = preferredMode === 'local' ? mockDatabase : supabase;
    const results = await Promise.allSettled(
      ids.map(id => client.from('applicants').update({ status: 'Under Review' }).eq('id', id)),
    );
    const failedIds: string[] = [];
    let firstError: unknown;
    results.forEach((result, index) => {
      const error = result.status === 'rejected' ? result.reason : (result.value as { error?: unknown })?.error;
      if (error) {
        failedIds.push(ids[index]);
        firstError ??= error;
      }
    });
    const doneIds = ids.filter(id => !failedIds.includes(id));

    setApplicants(prev =>
      prev.map(a => (doneIds.includes(a.id) ? { ...a, status: 'Under Review' } : a)),
    );
    setSelectedShortlistIds(new Set(failedIds));
    if (failedIds.length > 0) {
      console.error('removeSelectedFromShortlist: status revert failed', firstError);
      const failure = describeActionFailure('remove them from the shortlist', firstError);
      feedback.error(
        failure.title,
        `${doneIds.length > 0 ? `${doneIds.length} of ${ids.length} were removed; the ${failedIds.length} still selected were not.` : failure.message} ${failure.nextStep}`,
      );
    } else {
      feedback.success('Removed from the shortlist', `${ids.length} applicant${ids.length === 1 ? '' : 's'} moved back to Under Review.`);
    }
    setRemovingShortlist(false);
    window.dispatchEvent(new Event('cictrix:applicants-updated'));
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  // Passes the table's rows for the clicked applicant's position, in shown
  // order, so the details page steps through one position at a time.
  const openApplicant = (id: string, rows: Applicant[]) => {
    const target = rows.find((row) => row.id === id);
    const queueRows = target ? samePositionRows(rows, target) : rows;
    navigate(`/admin/rsp/applicant/${id}`, {
      state: {
        // Keeps ?positionId= so coming back returns to the filtered list.
        from: `/admin/rsp/applications${location.search}`,
        navQueue: queueRows.map((row) => ({ id: row.id, name: row.full_name, status: row.status })),
      },
    });
  };
  const paged      = sortedApplicants.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const applicantsLoad = useTableLoading(loading, applicants.length > 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="rsp-ds min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
      <div className="admin-layout">
        <Sidebar activeModule="RSP" userRole="rsp" />
        <main className="admin-content bg-slate-50 !p-0">
          {positionId ? (
            // Opened from Job Posts › Job Vacancies › Applicants: the title names the vacancy.
            <ApplicantsTabBar
              breadcrumb={(
                <Link to="/admin/rsp/jobs" className="text-xs font-medium text-[var(--color-primary)] hover:underline">
                  ‹ Back to Job Vacancies
                </Link>
              )}
              title={position === null ? 'This position no longer exists' : `Applicants for ${position?.title ?? '…'}`}
              subtitle={positionDetails || ' '}
              actions={(
                <button type="button" onClick={clearPositionFilter}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-primary)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-50)]">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear filter
                </button>
              )}
            />
          ) : (
            <ApplicantsTabBar title="Applications" subtitle="All applicants submitted across all job positions" />
          )}

          <div className="p-6">

            {/* Filters */}
            <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Search name, email, position, or Reference No.…"
                    value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-[#363EE8] focus:outline-none" />
                </div>
                <select value={officeFilter} onChange={e => { setOfficeFilter(e.target.value); setPage(1); }}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none">
                  <option value="all">All Departments</option>
                  {offices.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <select value={positionFilter} onChange={e => { setPositionFilter(e.target.value); setPage(1); }}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none">
                  <option value="all">All Positions</option>
                  {positions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none">
                  <option value="all">All Types</option>
                  <option value="original">Original</option>
                  <option value="promotional">Promotional</option>
                </select>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                <span>{filtered.length} applicant{filtered.length !== 1 ? 's' : ''} found</span>
                <button type="button" className="text-[#363EE8] hover:underline"
                  onClick={() => { setSearch(''); setOfficeFilter('all'); setPositionFilter('all'); setTypeFilter('all'); setPage(1); }}>
                  Clear filters
                </button>
              </div>
            </div>

            {loadError ? (
              <ErrorBanner
                error={loadError}
                action="load the applications"
                onRetry={() => window.dispatchEvent(new Event('cictrix:applicants-updated'))}
                className="mb-4"
              />
            ) : null}

            {/* Table */}
            <div className="abyan-table-wrap">
              <table className="abyan-table w-full min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <SortHeader label="Applicant Name" sortKey="name" sort={applicantSort} onSort={sortApplicants} />
                    <SortHeader label="Reference No." sortKey="reference" sort={applicantSort} onSort={sortApplicants} />
                    <SortHeader label="Position" sortKey="position" sort={applicantSort} onSort={sortApplicants} />
                    <SortHeader label="Department" sortKey="department" sort={applicantSort} onSort={sortApplicants} />
                    <SortHeader label="Type" sortKey="type" sort={applicantSort} onSort={sortApplicants} />
                    <SortHeader label="Applied" sortKey="applied" sort={applicantSort} onSort={sortApplicants} />
                  </tr>
                  <TableRefreshBar active={applicantsLoad.refreshing} colSpan={6} />
                </thead>
                <tbody className={tableBodyClass(applicantsLoad.refreshing)}>
                  {applicantsLoad.initialLoading ? (
                    <TableSkeletonRows show={applicantsLoad.showSkeleton} rows={ITEMS_PER_PAGE}
                      columns={['two-line', 'text', 'text', 'text', 'badge', 'text']} label="Loading applicants…" />
                  ) : paged.map(a => (
                    <tr key={a.id} onClick={() => openApplicant(a.id, sortedApplicants)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0">

                      {/* Name — clickable */}
                      <td className="px-5 py-4">
                        <button type="button" className="group text-left"
                          onClick={() => openApplicant(a.id, sortedApplicants)}>
                          <p className="font-semibold text-sm text-[#363EE8] group-hover:underline underline-offset-2">{a.full_name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{a.email || '—'}</p>
                        </button>
                      </td>

                      {/* Reference No. — what an applicant quotes when they
                          write in asking about their status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="font-mono text-xs text-slate-600">{a.reference_no || '—'}</span>
                        <ReferenceAppsChip applicantName={a.full_name} referenceNo={a.reference_no}
                          applications={referenceApps(a)} currentApplicationId={a.id} className="ml-2" />
                      </td>

                      {/* Position */}
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {a.position || '—'}
                        <PlantillaTags applicant={a} />
                      </td>

                      {/* Department */}
                      <td className="px-5 py-4 text-sm text-slate-700">{a.office || '—'}</td>

                      {/* Type */}
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${(a.application_type ?? '').toLowerCase().includes('promot') ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                          {(a.application_type ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original'}
                        </span>
                      </td>

                      {/* Applied date */}
                      <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(a.created_at)}</td>
                    </tr>
                  ))}
                  {!applicantsLoad.initialLoading && paged.length === 0 && !(loadError && applicants.length === 0) && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                        <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                        <p className="font-medium">
                          {positionId && filtered.length === 0 && shortlisted.length === 0 && !search && officeFilter === 'all' && positionFilter === 'all' && typeFilter === 'all'
                            ? 'No applicants yet for this vacancy.'
                            : 'No applicants found for the selected filters.'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-3 flex items-center justify-between px-1 text-sm text-slate-600">
              <p>
                {applicantsLoad.initialLoading ? 'Loading…' : filtered.length === 0 ? 'No results'
                  : `Showing ${(safePage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of ${filtered.length}`}
              </p>
              <div className="flex items-center gap-2">
                <button aria-label="Previous page" className="rsp-pager flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 disabled:opacity-40 hover:bg-slate-50"
                  onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-medium">Page {safePage} of {totalPages}</span>
                <button aria-label="Next page" className="rsp-pager flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 disabled:opacity-40 hover:bg-slate-50"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Shortlisted Applicants section */}
            <div className="mt-8">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Shortlisted Applicants</h2>
                  <p className="text-xs text-slate-500">
                    Applicants moved here via the Shortlist action. Select rows and click Remove from Shortlist
                    to return them to the main list.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeSelectedFromShortlist()}
                  disabled={selectedShortlistIds.size === 0 || removingShortlist}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Remove from Shortlist
                  {selectedShortlistIds.size > 0 ? ` (${selectedShortlistIds.size})` : ''}
                </button>
              </div>

              <div className="abyan-table-wrap">
                <table className="abyan-table w-full min-w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="w-10 px-5 py-3 text-left">
                        <input
                          type="checkbox"
                          aria-label="Select all shortlisted applicants"
                          checked={allShortlistedSelected}
                          ref={el => { if (el) el.indeterminate = someShortlistedSelected; }}
                          onChange={toggleSelectAllShortlist}
                          disabled={shortlisted.length === 0}
                          className="h-4 w-4 rounded border-slate-300 text-[#363EE8] focus:ring-[#363EE8]"
                        />
                      </th>
                      <SortHeader label="Applicant Name" sortKey="name" sort={shortlistSort} onSort={toggleShortlistSort} />
                      <SortHeader label="Reference No." sortKey="reference" sort={shortlistSort} onSort={toggleShortlistSort} />
                      <SortHeader label="Position" sortKey="position" sort={shortlistSort} onSort={toggleShortlistSort} />
                      <SortHeader label="Department" sortKey="department" sort={shortlistSort} onSort={toggleShortlistSort} />
                      <SortHeader label="Type" sortKey="type" sort={shortlistSort} onSort={toggleShortlistSort} />
                      <SortHeader label="Applied" sortKey="applied" sort={shortlistSort} onSort={toggleShortlistSort} />
                    </tr>
                    <TableRefreshBar active={applicantsLoad.refreshing} colSpan={7} />
                  </thead>
                  <tbody className={tableBodyClass(applicantsLoad.refreshing)}>
                    {applicantsLoad.initialLoading ? (
                      <TableSkeletonRows show={applicantsLoad.showSkeleton} rows={3}
                        columns={['text', 'two-line', 'text', 'text', 'text', 'badge', 'text']} label="Loading shortlisted applicants…" />
                    ) : sortedShortlisted.map(a => (
                      <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0">
                        <td className="px-5 py-4">
                          <input
                            type="checkbox"
                            aria-label={`Select ${a.full_name}`}
                            checked={selectedShortlistIds.has(a.id)}
                            onChange={() => toggleShortlistSelection(a.id)}
                            className="h-4 w-4 rounded border-slate-300 text-[#363EE8] focus:ring-[#363EE8]"
                          />
                        </td>
                        <td className="px-5 py-4">
                          <button type="button" className="group text-left"
                            onClick={() => openApplicant(a.id, sortedShortlisted)}>
                            <p className="font-semibold text-sm text-[#363EE8] group-hover:underline underline-offset-2">{a.full_name}</p>
                            <p className="mt-0.5 text-xs text-slate-400">{a.email || '—'}</p>
                          </button>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="font-mono text-xs text-slate-600">{a.reference_no || '—'}</span>
                          <ReferenceAppsChip applicantName={a.full_name} referenceNo={a.reference_no}
                            applications={referenceApps(a)} currentApplicationId={a.id} className="ml-2" />
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">
                          {a.position || '—'}
                          <PlantillaTags applicant={a} />
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">{a.office || '—'}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${(a.application_type ?? '').toLowerCase().includes('promot') ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                            {(a.application_type ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(a.created_at)}</td>
                      </tr>
                    ))}
                    {!applicantsLoad.initialLoading && shortlisted.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                          <p className="font-medium">No shortlisted applicants yet.</p>
                          <p className="text-xs text-slate-400 mt-1">
                            Click Shortlist on an applicant's profile to move them here.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};
