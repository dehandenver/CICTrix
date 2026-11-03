import { Link, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Briefcase,
  Users,
  ClipboardCheck,
  ShieldCheck,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import abyanLogo from '../assets/abyan-logo.png';
import { SharedFooter } from './SharedFooter';
import '../styles/landing-hero.css';
import { getAuthoritativeJobPostings, getJobPostingsLoadError, loadJobPostings } from '../lib/recruitmentData';
import type { JobPosting } from '../types/recruitment.types';
import { plantillaLabel, plantillaNumberOf } from '../lib/plantillaRules';
import { vacancySalaryLabel } from '../lib/vacancySalary';
import { useSalarySchedule } from '../hooks/useSalarySchedule';
import { isAdvertised, vacantPlantillaSlots } from '../lib/vacancySearch';
import { TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';

/* ── trish UI theme tokens ──────────────────────────────────────────
   Brand: Indigo #363EE8 · Hover var(--color-primary-700) · Soft var(--color-primary-50)
   Ink:   var(--color-primary-900) · Workspace: #F8FAFC · Surface: #FFFFFF
------------------------------------------------------------------- */

// Same shape JobPortalPage hands to /job-details and /apply as `landingJob`.
type VacancyRow = {
  id: string;
  title: string;
  department: string;
  itemNumber: string;
  type: string;
  status: JobPosting['status'];
  openSlots: number;
  /** React key: one row per plantilla, so several rows share a posting id. */
  rowKey: string;
  /** Job details reads this to show the one plantilla this row applies to. */
  plantillaSlotId: string;
  /** This row's plantilla number. Only open plantillas get a row. */
  plantilla: { text: string };
  postingDate: string;
  closingDate: string;
  positionType: string;
  employmentStatus: string;
  originalJob: JobPosting;
};




export const LandingPage = () => {
  const navigate = useNavigate();
  const jobsTableRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLElement>(null);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  // Loaded once for the whole table so every row shows the same range.
  const salarySchedule = useSalarySchedule();
  const [currentPage, setCurrentPage] = useState(1);
  const [vacancyJobs, setVacancyJobs] = useState<VacancyRow[]>([]);
  const [vacanciesLoading, setVacanciesLoading] = useState(true);
  const [vacanciesError, setVacanciesError] = useState<string | null>(null);
  const vacanciesLoad = useTableLoading(vacanciesLoading, vacancyJobs.length > 0);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('department');

  // Load jobs from Supabase and subscribe to updates
  useEffect(() => {
    // Only postings RSP created and left open. No placeholder rows: when the
    // fetch fails the error is shown, and when nothing is open the empty state is.
    //
    // Reads the shared cache. Runs on the job-postings-updated event, which
    // loadJobPostings itself fires, so it must not refetch (that looped).
    const applyCachedJobs = () => {
      try {
        const loadError = getJobPostingsLoadError();
        if (loadError) {
          setVacanciesError(loadError);
          setVacancyJobs([]);
          return;
        }

        // isAdvertised is the predicate Job Vacancies uses too: open vacancy,
        // and a plantilla left to fill. It reads the deadline against the
        // Manila date, as the database does, rather than the visitor's own.
        const rows = getAuthoritativeJobPostings()
          .filter((job) => isAdvertised(job))
          // Only vacant, open plantillas: a filled one is held by an employee
          // and a closed one isn't taking applications, so neither gets a row.
          // One row per plantilla, even when several share a position title.
          .flatMap((job) => vacantPlantillaSlots(job)
            .filter((slot) => slot.status === 'open')
            .sort((a, b) => a.slotNumber - b.slotNumber)
            .map((slot): VacancyRow => ({
            id: job.id,
            rowKey: slot.id,
            plantillaSlotId: slot.id,
            title: job.title || '',
            department: job.department || '',
            itemNumber: job.jobCode || job.id || '',
            type: job.employmentStatus === 'Permanent' ? 'Plantilla' : 'Contractual',
            status: job.status,
            openSlots: (job.plantillaSlots ?? []).filter((slot) => slot.status === 'open').length,
            plantilla: { text: plantillaNumberOf(slot.label) || plantillaLabel(slot) },
            postingDate: job.postedDate ? new Date(job.postedDate).toISOString().split('T')[0] : '',
            closingDate: job.applicationDeadline ? String(job.applicationDeadline).slice(0, 10) : '',
            positionType: job.positionType || '',
            employmentStatus: job.employmentStatus || '',
            originalJob: job,
          })));

        setVacanciesError(null);
        setVacancyJobs(rows);
      } catch (err) {
        console.error('[LandingPage] Error loading jobs:', err);
        setVacanciesError(String((err as Error)?.message ?? err));
        setVacancyJobs([]);
      } finally {
        setVacanciesLoading(false);
      }
    };

    // Fetches; loadJobPostings fires the update event, which applies the result.
    const syncJobs = () => {
      void loadJobPostings().catch((err) => {
        setVacanciesError(String((err as Error)?.message ?? err));
        setVacanciesLoading(false);
      });
    };

    syncJobs();

    // Subscribe to job postings updates (only on client side)
    if (typeof window !== 'undefined') {
      window.addEventListener('cictrix:job-postings-updated', applyCachedJobs);
      window.addEventListener('focus', syncJobs);

      return () => {
        window.removeEventListener('cictrix:job-postings-updated', applyCachedJobs);
        window.removeEventListener('focus', syncJobs);
      };
    }
  }, [reloadKey]);

  const retryVacancies = () => {
    setVacanciesLoading(true);
    setVacanciesError(null);
    setReloadKey((key) => key + 1);
  };


  // Real-time Search and Sorting logic
  const filteredAndSortedJobs = useMemo(() => {
    let result = [...vacancyJobs];

    // Search filter: keywords such as Position Title, Department, Employment Type (type), and Job Category (positionType / employmentStatus)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (job) =>
          (job.title || '').toLowerCase().includes(q) ||
          (job.department || '').toLowerCase().includes(q) ||
          (job.type || '').toLowerCase().includes(q) ||
          (job.positionType || '').toLowerCase().includes(q) ||
          (job.employmentStatus || '').toLowerCase().includes(q)
      );
    }

    // Sort options: Newest to Oldest, Oldest to Newest, Position Title (A-Z), Position Title (Z-A), Department
    // Sort on the full timestamp, not the date column, so two postings made the
    // same day still come out in the order they were created.
    const postedAt = (row: VacancyRow) => new Date(row.originalJob.postedDate).getTime() || 0;
    if (sortBy === 'newest') {
      result.sort((a, b) => postedAt(b) - postedAt(a));
    } else if (sortBy === 'oldest') {
      result.sort((a, b) => postedAt(a) - postedAt(b));
    } else if (sortBy === 'title-az') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'title-za') {
      result.sort((a, b) => b.title.localeCompare(a.title));
    } else if (sortBy === 'department') {
      result.sort((a, b) => a.department.localeCompare(b.department) || a.title.localeCompare(b.title));
    }

    return result;
  }, [vacancyJobs, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedJobs.length / itemsPerPage));
  // A live refresh can remove rows (a plantilla just filled), so never leave
  // the user on a page past the end.
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const paginatedJobs = filteredAndSortedJobs.slice(startIdx, endIdx);

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newItemsPerPage = parseInt(e.target.value, 10);
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div
      className="ds-remap abyan-tokens min-h-screen bg-[#F8FAFC] text-[var(--color-primary-900)]"
      style={{ fontFamily: "'Poppins', system-ui, -apple-system, sans-serif" }}
    >
      {/* ─── Top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[#363EE8]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3 text-white">
          <div className="flex items-center gap-3">
            <img
              src={abyanLogo}
              alt="Abyan Logo"
              className="h-11 w-auto object-contain"
            />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-white">ABYAN</span>
              <span className="hidden text-sm font-medium text-white/90 sm:inline">
                Human Resource Information System
              </span>
            </div>
          </div>

          {/* Nav Tabs + Login */}
          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-1">
              <a
                href="/"
                className="rounded-md px-4 py-2 text-sm font-medium bg-white/20 text-white transition-colors"
              >
                Home
              </a>
              <a
                href="/about"
                className="rounded-md px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition-colors"
              >
                About
              </a>
            </nav>

            {/* Login Dropdown */}
            <div className="relative group">
              <button className="inline-flex items-center gap-2 rounded-[14px] bg-white px-6 py-3 text-sm font-semibold text-[#363EE8] shadow-lg transition hover:bg-[var(--color-primary-50)]">
                <Users size={18} />
                <span>Login</span>
              </button>

              {/* Dropdown Menu */}
              <div className="absolute right-0 top-full mt-2 w-52 bg-white text-slate-900 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 py-2 border border-slate-100">
                <a
                  href="/employee/login"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-primary-50)] font-medium text-sm text-[var(--color-primary-900)] transition-colors"
                >
                  <span className="grid h-8 w-8 place-content-center rounded-lg bg-[#059669] text-white"><Users size={15} /></span>
                  Employee Portal
                </a>
                <a
                  href="/interviewer/login"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-primary-50)] font-medium text-sm text-[var(--color-primary-900)] transition-colors"
                >
                  <span className="grid h-8 w-8 place-content-center rounded-lg bg-[#7C3AED] text-white"><ClipboardCheck size={15} /></span>
                  Interviewer Portal
                </a>
                <a
                  href="/admin/login"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-primary-50)] font-medium text-sm text-[var(--color-primary-900)] transition-colors"
                >
                  <span className="grid h-8 w-8 place-content-center rounded-lg bg-[var(--color-primary-900)] text-white"><ShieldCheck size={15} /></span>
                  HR Administration
                </a>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Hero ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#363EE8] to-[var(--color-primary-900)]" />
        <div className="landing-hero-bg" aria-hidden="true">
          <div className="landing-hero-ring landing-hero-ring--tr" />
          <div className="landing-hero-ring landing-hero-ring--bl" />
          <div className="landing-hero-ring landing-hero-ring--br" />
          <div className="landing-hero-bg">
            <div className="landing-hero-pulse" />
            <div className="landing-hero-pulse" />
            <div className="landing-hero-pulse" />
          </div>
        </div>
        <div className="relative mx-auto max-w-7xl px-6 py-20 text-center text-white sm:py-28">
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            Your gateway to public service.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-indigo-100 sm:text-lg">
            Discover open positions, track your application, and manage your employee records through our secure, all-in-one platform. Abyan mo sa pag-asenso.
          </p>
          {/* On-blue hero CTAs (§9.1): Solid white + Ghost white, Large. */}
          <div className="abyan-ds mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate('/job-portal')}
              className="btn btn-lg btn-white"
            >
              <Briefcase size={18} /> Apply for a Job
            </button>
            <Link
              to="/track"
              className="btn btn-lg btn-ghost-white"
            >
              <Search size={18} /> Track Application
            </Link>
          </div>
        </div>
      </section>


      {/* ─── Vacant Jobs Table ─────────────────────────────────────────────── */}
      <section ref={jobsTableRef} className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-[var(--color-primary-900)]">Currently Vacant Jobs</h2>
              <p className="mt-1 text-sm text-slate-500">Browse and apply for available positions</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Search Bar */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search title, dept, type..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30 focus:border-[#363EE8]"
                />
              </div>

              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[var(--color-primary-900)] focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
              >
                <option value="newest">Newest to Oldest</option>
                <option value="oldest">Oldest to Newest</option>
                <option value="title-az">Position Title (A-Z)</option>
                <option value="title-za">Position Title (Z-A)</option>
                <option value="department">Department</option>
              </select>

              {/* Entries Limit */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-[var(--color-primary-900)]">Show</label>
                <select
                  value={itemsPerPage}
                  onChange={handleItemsPerPageChange}
                  className="rounded-lg border-2 border-[#363EE8] bg-white px-3 py-2 text-sm font-medium text-[var(--color-primary-900)] transition focus:outline-none focus:ring-2 focus:ring-[#363EE8]/20"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
                <span className="text-sm font-medium text-[var(--color-primary-900)]">entries</span>
              </div>
            </div>
          </div>

          {/* Responsive Table */}
          <div className="abyan-table-wrap">
            <table className="abyan-table w-full">
              <thead className="bg-slate-100">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-[var(--color-primary-900)]">Position Title</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--color-primary-900)]">Department / Office</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--color-primary-900)]">Plantilla</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--color-primary-900)]">Monthly Salary</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--color-primary-900)]">Closing Date</th>
                  <th className="px-4 py-3 text-center font-semibold text-[var(--color-primary-900)]">Apply</th>
                </tr>
              </thead>
              <tbody className={tableBodyClass(false)}>
                {vacanciesLoad.initialLoading ? (
                  <TableSkeletonRows show={vacanciesLoad.showSkeleton}
                    columns={['two-line', 'text', 'text', 'text', 'text', 'button']} label="Loading vacancies…" />
                ) : vacanciesError ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center" role="alert">
                      <p className="font-medium text-[#B42323]">We couldn't load the vacancies. Check your connection and try again.</p>
                      <p className="mt-1 text-xs text-slate-500">{vacanciesError}</p>
                      <button
                        type="button"
                        onClick={retryVacancies}
                        className="mt-3 rounded-lg border border-[#363EE8] px-4 py-2 text-xs font-semibold text-[#363EE8] transition hover:bg-[var(--color-primary-50)]"
                      >
                        Try again
                      </button>
                    </td>
                  </tr>
                ) : filteredAndSortedJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      {vacancyJobs.length === 0
                        ? 'No vacant positions at the moment. Please check back later.'
                        : 'No vacancies match your search.'}
                    </td>
                  </tr>
                ) : (
                  paginatedJobs.map((job) => {
                    const isClosed = job.status === 'Closed';
                    return (
                      <tr key={job.rowKey}className="border-b border-slate-200 transition hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[var(--color-primary-900)]">{job.title}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{job.department || 'Not specified'}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <span className="font-semibold text-[var(--color-primary-900)]">{job.plantilla.text}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{vacancySalaryLabel(job.originalJob, salarySchedule)}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {job.closingDate ? formatDate(job.closingDate) : 'Until filled'}
                        </td>
                        {/* Apply = Small primary (§9.5); it opens the job details first. */}
                        <td className="abyan-ds px-4 py-3 text-center">
                          <button
                            type="button"
                            disabled={isClosed}
                            onClick={() => navigate('/apply', { state: { landingJob: job } })}
                            className="btn btn-sm btn-primary"
                          >
                            Apply
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Showing {filteredAndSortedJobs.length === 0 ? 0 : startIdx + 1} to {Math.min(endIdx, filteredAndSortedJobs.length)} of {filteredAndSortedJobs.length} jobs
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      currentPage === page
                        ? 'bg-[#363EE8] text-white'
                        : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>


      <SharedFooter ref={contactRef} />
    </div>
  );
};
