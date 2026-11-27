import { Link } from 'react-router-dom';
import { useState, useRef, useEffect, useMemo, useId, useCallback } from 'react';
import {
  Briefcase,
  Users,
  ClipboardCheck,
  ShieldCheck,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react';
import abyanLogo from '../assets/abyan-logo.png';
import { SharedFooter } from './SharedFooter';
import '../styles/landing-hero.css';
import '../styles/landing-page.css';
import { getAuthoritativeJobPostings, getJobPostingsLoadError, loadJobPostings } from '../lib/recruitmentData';
import type { JobPosting } from '../types/recruitment.types';
import { plantillaLabel, plantillaNumberOf } from '../lib/plantillaRules';
import { vacancySalaryLabel } from '../lib/vacancySalary';
import { useSalarySchedule } from '../hooks/useSalarySchedule';
import { isAdvertised, vacantPlantillaSlots } from '../lib/vacancySearch';
import { TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';

// Same shape JobPortalPage and JobDetailsPage expect as `landingJob`.
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

type PageToken = number | 'ellipsis';

const MAX_INLINE_PAGES = 7;
const DROPDOWN_GAP_PX = 8;
const VIEWPORT_EDGE_MARGIN_PX = 12;

const textCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Uses native Array.prototype.toSorted() when available (ES2023+), with non-mutating fallback for ES2020 TS lib. */
function sortedCopy<T>(items: readonly T[], compare: (a: T, b: T) => number): T[] {
  const candidate = items as readonly T[] & { toSorted?: (fn: (a: T, b: T) => number) => T[] };
  return typeof candidate.toSorted === 'function' ? candidate.toSorted(compare) : [...items].sort(compare);
}

const PORTAL_LINKS = [
  { to: '/employee/login', label: 'Employee Portal', icon: Users, isAdmin: false },
  { to: '/interviewer/login', label: 'Interviewer Portal', icon: ClipboardCheck, isAdmin: false },
  { to: '/admin/login', label: 'HR Administration', icon: ShieldCheck, isAdmin: true },
] as const;

/** Builds DESIGN_IDENTITY §9.6 pagination tokens with `…` when totalPages > 7. */
export function buildPageList(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= MAX_INLINE_PAGES) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }
  const pages: PageToken[] = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);

  if (windowStart > 2) pages.push('ellipsis');
  for (let p = windowStart; p <= windowEnd; p += 1) pages.push(p);
  if (windowEnd < totalPages - 1) pages.push('ellipsis');

  pages.push(totalPages);
  return pages;
}

/** Formats ISO date-only strings (`YYYY-MM-DD`) without UTC-to-local day shifts. */
export function formatClosingDate(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(utcDate.getTime())) {
      return utcDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }
  }
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const supportsNativePopover = (): boolean =>
  typeof HTMLElement !== 'undefined' && Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');

const supportsAnchorPositioning = (): boolean =>
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('position-area: block-end');

export const LandingPage = () => {
  const loginMenuId = useId();
  const mobileMenuId = useId();
  const searchInputId = useId();
  const sortSelectId = useId();
  const entriesSelectId = useId();

  const headerRef = useRef<HTMLElement>(null);
  const loginWrapRef = useRef<HTMLDivElement>(null);
  const loginBtnRef = useRef<HTMLButtonElement>(null);
  const loginMenuRef = useRef<HTMLUListElement>(null);

  const hasNativePopover = useMemo(supportsNativePopover, []);
  const hasAnchorPos = useMemo(supportsAnchorPositioning, []);

  const [loginOpen, setLoginOpen] = useState(false);
  const [loginFallbackPos, setLoginFallbackPos] = useState<{ top: number; left: number } | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const positionLoginFallback = useCallback(() => {
    if (hasAnchorPos || !loginBtnRef.current) return;
    const btnRect = loginBtnRef.current.getBoundingClientRect();
    const menuWidth = loginMenuRef.current?.offsetWidth || 232;
    const menuHeight = loginMenuRef.current?.offsetHeight || 168;

    let left = btnRect.right - menuWidth;
    left = Math.max(VIEWPORT_EDGE_MARGIN_PX, Math.min(left, window.innerWidth - menuWidth - VIEWPORT_EDGE_MARGIN_PX));

    let top = btnRect.bottom + DROPDOWN_GAP_PX;
    if (top + menuHeight > window.innerHeight - VIEWPORT_EDGE_MARGIN_PX && btnRect.top - menuHeight - DROPDOWN_GAP_PX >= VIEWPORT_EDGE_MARGIN_PX) {
      top = btnRect.top - menuHeight - DROPDOWN_GAP_PX;
    }
    setLoginFallbackPos({ top, left });
  }, [hasAnchorPos]);

  const setNativePopoverOpen = useCallback((open: boolean) => {
    const el = loginMenuRef.current as (HTMLUListElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el) return;
    try {
      if (open) {
        if (!el.matches(':popover-open')) el.showPopover?.();
      } else if (el.matches(':popover-open')) {
        el.hidePopover?.();
      }
    } catch {
      // Fall back to React open state if browser rejects imperative call.
      setLoginOpen(open);
    }
  }, []);

  // Keep React `aria-expanded` in sync with native Popover API toggle events.
  useEffect(() => {
    if (!hasNativePopover) return;
    const menu = loginMenuRef.current;
    if (!menu) return;

    const handleToggle = (event: Event) => {
      const nextOpen = (event as Event & { newState?: string }).newState === 'open';
      setLoginOpen(nextOpen);
      if (nextOpen && !hasAnchorPos) {
        requestAnimationFrame(positionLoginFallback);
      }
    };

    menu.addEventListener('toggle', handleToggle);
    return () => menu.removeEventListener('toggle', handleToggle);
  }, [hasNativePopover, hasAnchorPos, positionLoginFallback]);

  // Reposition fallback popover on scroll/resize when open.
  useEffect(() => {
    if (!loginOpen || hasAnchorPos) return;
    positionLoginFallback();
    window.addEventListener('resize', positionLoginFallback);
    window.addEventListener('scroll', positionLoginFallback, true);
    return () => {
      window.removeEventListener('resize', positionLoginFallback);
      window.removeEventListener('scroll', positionLoginFallback, true);
    };
  }, [loginOpen, hasAnchorPos, positionLoginFallback]);

  // Escape & outside-click dismissal for fallback Login menu and mobile drawer.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (mobileNavOpen) {
        setMobileNavOpen(false);
      }
      if (!hasNativePopover && loginOpen) {
        setLoginOpen(false);
        loginBtnRef.current?.focus();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (mobileNavOpen && headerRef.current && !headerRef.current.contains(target)) {
        setMobileNavOpen(false);
      }
      if (!hasNativePopover && loginOpen && loginWrapRef.current && !loginWrapRef.current.contains(target)) {
        setLoginOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [hasNativePopover, loginOpen, mobileNavOpen]);

  const handleFallbackLoginClick = () => {
    setLoginOpen((open) => !open);
  };

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
          .flatMap((job) => sortedCopy(
            vacantPlantillaSlots(job).filter((slot) => slot.status === 'open'),
            (a, b) => a.slotNumber - b.slotNumber,
          )
            .map((slot): VacancyRow => ({
              id: job.id,
              rowKey: slot.id,
              plantillaSlotId: slot.id,
              title: job.title || '',
              department: job.department || '',
              itemNumber: job.jobCode || job.id || '',
              type: job.employmentStatus === 'Permanent' ? 'Plantilla' : 'Contractual',
              status: job.status,
              openSlots: (job.plantillaSlots ?? []).filter((s) => s.status === 'open').length,
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
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? vacancyJobs.filter(
          (job) =>
            (job.title || '').toLowerCase().includes(query) ||
            (job.department || '').toLowerCase().includes(query) ||
            (job.type || '').toLowerCase().includes(query) ||
            (job.positionType || '').toLowerCase().includes(query) ||
            (job.employmentStatus || '').toLowerCase().includes(query),
        )
      : vacancyJobs;

    const postedAt = (row: VacancyRow) => new Date(row.originalJob.postedDate).getTime() || 0;

    if (sortBy === 'newest') return sortedCopy(filtered, (a, b) => postedAt(b) - postedAt(a));
    if (sortBy === 'oldest') return sortedCopy(filtered, (a, b) => postedAt(a) - postedAt(b));
    if (sortBy === 'title-az') return sortedCopy(filtered, (a, b) => textCollator.compare(a.title, b.title));
    if (sortBy === 'title-za') return sortedCopy(filtered, (a, b) => textCollator.compare(b.title, a.title));
    if (sortBy === 'department') {
      return sortedCopy(
        filtered,
        (a, b) => textCollator.compare(a.department, b.department) || textCollator.compare(a.title, b.title),
      );
    }

    return filtered;
  }, [vacancyJobs, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedJobs.length / itemsPerPage));
  // A live refresh can remove rows (a plantilla just filled), so never leave
  // the user on a page past the end.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const paginatedJobs = filteredAndSortedJobs.slice(startIdx, endIdx);
  const pageTokens = useMemo(() => buildPageList(currentPage, totalPages), [currentPage, totalPages]);

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

  const liveStatusText = !vacanciesLoading && !vacanciesError
    ? filteredAndSortedJobs.length === 0
      ? 'No open vacancies match your current search.'
      : `Showing ${startIdx + 1} to ${Math.min(endIdx, filteredAndSortedJobs.length)} of ${filteredAndSortedJobs.length} open jobs.`
    : '';

  const loginMenuClass = `landing-login-menu${hasNativePopover && !hasAnchorPos ? ' landing-login-menu--fallback' : ''}`;
  const loginMenuStyle = hasNativePopover && !hasAnchorPos && loginFallbackPos
    ? { top: `${loginFallbackPos.top}px`, left: `${loginFallbackPos.left}px` }
    : undefined;

  return (
    <div className="ds-remap abyan-tokens landing-page min-h-screen">
      <a href="#main-content" className="landing-skip-link">
        Skip to main content
      </a>

      {/* ─── Top bar ─────────────────────────────────────────────── */}
      <header ref={headerRef} className="landing-header">
        <div className="landing-header-inner">
          <Link to="/" className="landing-brand">
            <img
              src={abyanLogo}
              alt="ABYAN HRIS mark"
              width={29}
              height={40}
              className="landing-brand-logo"
            />
            <span className="flex items-baseline gap-3">
              <span className="landing-brand-wordmark">ABYAN</span>
              <span className="landing-brand-subtitle">
                Human Resource Information System
              </span>
            </span>
          </Link>

          {/* Desktop Navigation + Login Popover */}
          <div className="landing-desktop-actions">
            <nav className="landing-nav" aria-label="Primary">
              <Link to="/" aria-current="page" className="landing-nav-link">
                Home
              </Link>
              <Link to="/about" className="landing-nav-link">
                About
              </Link>
            </nav>

            <div ref={loginWrapRef} className="landing-login-wrap">
              <button
                ref={loginBtnRef}
                type="button"
                aria-expanded={loginOpen}
                aria-controls={loginMenuId}
                {...(hasNativePopover
                  ? ({ popovertarget: loginMenuId } as React.ButtonHTMLAttributes<HTMLButtonElement>)
                  : { onClick: handleFallbackLoginClick })}
                className="landing-login-btn"
              >
                <Users size={18} aria-hidden="true" />
                <span>Login</span>
                <ChevronDown size={16} aria-hidden="true" className="landing-login-chevron" />
              </button>

              {(hasNativePopover || loginOpen) && (
                <ul
                  id={loginMenuId}
                  ref={loginMenuRef}
                  {...(hasNativePopover ? ({ popover: 'auto' } as React.HTMLAttributes<HTMLUListElement>) : {})}
                  className={loginMenuClass}
                  style={loginMenuStyle}
                >
                  {PORTAL_LINKS.map(({ to, label, icon: Icon, isAdmin }) => (
                    <li key={to}>
                      <Link
                        to={to}
                        className="landing-portal-link"
                        onClick={() => {
                          if (hasNativePopover) setNativePopoverOpen(false);
                          else setLoginOpen(false);
                        }}
                      >
                        <span className={`landing-portal-chip${isAdmin ? ' landing-portal-chip--admin' : ''}`}>
                          <Icon size={15} aria-hidden="true" />
                        </span>
                        <span>{label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Mobile Menu Toggle (< 640px) */}
          <button
            type="button"
            className="landing-mobile-toggle"
            aria-expanded={mobileNavOpen}
            aria-controls={mobileMenuId}
            aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            <span>Menu</span>
          </button>
        </div>

        {/* Mobile Navigation Drawer (< 640px) */}
        {mobileNavOpen && (
          <nav id={mobileMenuId} className="landing-mobile-panel" aria-label="Mobile navigation">
            <Link
              to="/"
              aria-current="page"
              className="landing-mobile-link"
              onClick={() => setMobileNavOpen(false)}
            >
              Home
            </Link>
            <Link
              to="/about"
              className="landing-mobile-link"
              onClick={() => setMobileNavOpen(false)}
            >
              About
            </Link>

            <p className="landing-mobile-section-label">Portal Login</p>
            {PORTAL_LINKS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="landing-mobile-link"
                onClick={() => setMobileNavOpen(false)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main id="main-content">
        {/* ─── Hero ────────────────────────────────────────────────── */}
        <section className="landing-hero">
          <div className="landing-hero-bg" aria-hidden="true">
            <div className="landing-hero-ring landing-hero-ring--tr" />
            <div className="landing-hero-ring landing-hero-ring--bl" />
            <div className="landing-hero-ring landing-hero-ring--br" />
            <div className="landing-hero-pulses">
              <div className="landing-hero-pulse" />
              <div className="landing-hero-pulse" />
              <div className="landing-hero-pulse" />
            </div>
          </div>

          <div className="relative mx-auto max-w-7xl px-6 py-20 text-center text-white sm:py-28">
            <h1 className="landing-hero-title">
              Your gateway to public service.
            </h1>
            <p className="landing-hero-lead">
              Official portal of the Office of the City Human Resource Management Officer, Iloilo City Government. Discover open positions, track your application, and manage your employee records.{' '}
              <span lang="fil">Abyan mo sa pag-asenso.</span>
            </p>
            {/* On-blue hero CTAs (§9.1): Solid white + Ghost white, Large. */}
            <div className="abyan-ds mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/job-portal" className="btn btn-lg btn-white">
                <Briefcase size={18} aria-hidden="true" /> Apply for a Job
              </Link>
              <Link to="/track" className="btn btn-lg btn-ghost-white">
                <Search size={18} aria-hidden="true" /> Track Application
              </Link>
            </div>
          </div>
        </section>

        {/* ─── Vacant Jobs Table ──────────────────────────────────── */}
        <section id="vacant-jobs" className="bg-white py-14 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <h2 id="vacant-jobs-heading" className="text-2xl font-bold text-[var(--color-primary-900)]">
                  Currently Vacant Jobs
                </h2>
                <p className="mt-1 max-w-xl text-sm text-[var(--neutral-600)]">
                  Each row is one open civil-service plantilla item. Select Apply to review minimum qualifications before starting your application.
                </p>
              </div>

              <div role="search" className="landing-toolbar" aria-label="Filter and sort vacancies">
                {/* Search Bar */}
                <div className="landing-field-group landing-field-group--search">
                  <label htmlFor={searchInputId} className="landing-field-label">
                    Search vacancies
                  </label>
                  <div className="relative">
                    <Search size={16} aria-hidden="true" className="landing-search-icon" />
                    <input
                      id={searchInputId}
                      name="q"
                      type="search"
                      enterKeyHint="search"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Search title, dept, type..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="landing-control landing-search-input"
                    />
                  </div>
                </div>

                {/* Sort Dropdown */}
                <div className="landing-field-group">
                  <label htmlFor={sortSelectId} className="landing-field-label">
                    Sort by
                  </label>
                  <select
                    id={sortSelectId}
                    name="sort"
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="landing-control px-3 py-2 font-medium text-[var(--color-primary-900)]"
                  >
                    <option value="newest">Newest to Oldest</option>
                    <option value="oldest">Oldest to Newest</option>
                    <option value="title-az">Position Title (A-Z)</option>
                    <option value="title-za">Position Title (Z-A)</option>
                    <option value="department">Department</option>
                  </select>
                </div>

                {/* Entries Limit */}
                <div className="landing-field-group">
                  <label htmlFor={entriesSelectId} className="landing-field-label">
                    Show entries
                  </label>
                  <select
                    id={entriesSelectId}
                    name="entries"
                    value={itemsPerPage}
                    onChange={handleItemsPerPageChange}
                    className="landing-control px-3 py-2 font-medium text-[var(--color-primary-900)]"
                  >
                    <option value={5}>5 per page</option>
                    <option value={10}>10 per page</option>
                  </select>
                </div>
              </div>
            </div>

            <div role="status" aria-live="polite" className="landing-sr-only">
              {liveStatusText}
            </div>

            {/* Responsive Table (@container switches to stacked cards below 600px) */}
            <div className="landing-table-container">
              <div
                className="abyan-table-wrap"
                tabIndex={0}
                role="region"
                aria-labelledby="vacant-jobs-heading"
              >
                <table className="abyan-table w-full">
                  <caption className="landing-sr-only">Currently Vacant Jobs</caption>
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--color-primary-900)]">Position Title</th>
                      <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--color-primary-900)]">Department / Office</th>
                      <th scope="col" className="is-num px-4 py-3 text-right font-semibold text-[var(--color-primary-900)]">Plantilla</th>
                      <th scope="col" className="is-num px-4 py-3 text-right font-semibold text-[var(--color-primary-900)]">Monthly Salary</th>
                      <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--color-primary-900)]">Closing Date</th>
                      <th scope="col" className="is-action px-4 py-3 text-right font-semibold text-[var(--color-primary-900)]">Apply</th>
                    </tr>
                  </thead>
                  <tbody className={tableBodyClass(false)}>
                    {vacanciesLoad.initialLoading ? (
                      <TableSkeletonRows
                        show={vacanciesLoad.showSkeleton}
                        columns={['two-line', 'text', 'text', 'text', 'text', 'button']}
                        label="Loading vacancies…"
                      />
                    ) : vacanciesError ? (
                      <tr>
                        <td colSpan={6} className="abyan-ds px-4 py-10 text-center" role="alert">
                          <p className="font-medium text-[var(--error-700)]">
                            We couldn't load the vacancies. Check your connection and try again.
                          </p>
                          <button
                            type="button"
                            onClick={retryVacancies}
                            className="btn btn-sm btn-secondary mt-3"
                          >
                            Try again
                          </button>
                        </td>
                      </tr>
                    ) : filteredAndSortedJobs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="abyan-ds px-4 py-10 text-center text-[var(--neutral-600)]">
                          <p>
                            {vacancyJobs.length === 0
                              ? 'No vacant positions at the moment. Please check back later.'
                              : 'No vacancies match your search.'}
                          </p>
                          {searchQuery.trim() !== '' && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchQuery('');
                                setCurrentPage(1);
                              }}
                              className="btn btn-sm btn-secondary mt-3"
                            >
                              Clear search
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      paginatedJobs.map((job) => {
                        const isClosed = job.status === 'Closed';
                        const detailsHref = `/job-details/${encodeURIComponent(job.itemNumber)}?slot=${encodeURIComponent(job.plantillaSlotId)}`;
                        return (
                          <tr key={job.rowKey} className="border-b border-slate-200 transition hover:bg-[var(--bg-row-hover)]">
                            <td className="landing-cell-title px-4 py-3">
                              <p className="font-semibold text-[var(--color-primary-900)]">{job.title}</p>
                            </td>
                            <td data-label="Department / Office" className="landing-cell-dept px-4 py-3">
                              {job.department || 'Not specified'}
                            </td>
                            <td data-label="Plantilla" className="is-num px-4 py-3">
                              <span className="font-semibold text-[var(--color-primary-900)]">{job.plantilla.text}</span>
                            </td>
                            <td data-label="Monthly Salary" className="is-num whitespace-nowrap px-4 py-3">
                              {vacancySalaryLabel(job.originalJob, salarySchedule)}
                            </td>
                            <td data-label="Closing Date" className="px-4 py-3">
                              {job.closingDate ? formatClosingDate(job.closingDate) : 'Until filled'}
                            </td>
                            <td className="abyan-ds is-action landing-cell-action px-4 py-3">
                              {isClosed ? (
                                <button
                                  type="button"
                                  disabled
                                  className="btn btn-sm btn-primary"
                                  aria-label={`Application closed for ${job.title}, Plantilla ${job.plantilla.text}`}
                                >
                                  Closed
                                </button>
                              ) : (
                                <Link
                                  to={detailsHref}
                                  state={{ landingJob: job }}
                                  className="btn btn-sm btn-primary"
                                  aria-label={`Apply for ${job.title}, Plantilla ${job.plantilla.text}`}
                                >
                                  Apply
                                </Link>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination Controls (§9.6) — hidden when 0 matches */}
            {filteredAndSortedJobs.length > 0 && (
              <div className="landing-pagination-bar">
                <div className="text-sm text-[var(--neutral-600)]">
                  Showing {startIdx + 1} to {Math.min(endIdx, filteredAndSortedJobs.length)} of {filteredAndSortedJobs.length} jobs
                </div>
                <nav aria-label="Vacancies pagination" className="landing-pagination-nav">
                  <button
                    type="button"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    className="rsp-pager inline-flex items-center gap-1 border px-3 py-2 text-sm"
                  >
                    <ChevronLeft size={16} aria-hidden="true" /> Previous
                  </button>
                  <div className="flex flex-wrap items-center gap-1">
                    {pageTokens.map((token, idx) =>
                      token === 'ellipsis' ? (
                        <span key={`ellipsis-${idx}`} className="landing-pagination-ellipsis" aria-hidden="true">
                          &hellip;
                        </span>
                      ) : (
                        <button
                          key={token}
                          type="button"
                          onClick={() => setCurrentPage(token)}
                          aria-current={currentPage === token ? 'page' : undefined}
                          className={`rsp-pager border px-3 py-2 text-sm${currentPage === token ? ' is-active' : ''}`}
                        >
                          {token}
                        </button>
                      ),
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="rsp-pager inline-flex items-center gap-1 border px-3 py-2 text-sm"
                  >
                    Next <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </nav>
              </div>
            )}
          </div>
        </section>
      </main>

      <SharedFooter />
    </div>
  );
};
