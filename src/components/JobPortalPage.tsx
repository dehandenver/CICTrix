import { useState, useRef, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Briefcase,
  Users,
  ClipboardCheck,
  ShieldCheck,
  Search,
  LayoutGrid,
  List,
  Calendar,
  MapPin,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Banknote,
  Menu,
  X,
} from 'lucide-react';
import abyanLogo from '../assets/abyan-logo.png';
import { SharedFooter } from './SharedFooter';
import '../styles/job-portal.css';
import { getAuthoritativeJobPostings, loadJobPostings } from '../lib/recruitmentData';
import { plantillaLabel } from '../lib/plantillaRules';
import { vacancySalaryLabel } from '../lib/vacancySalary';
import { useSalarySchedule } from '../hooks/useSalarySchedule';
import { LoadingStatus, Skeleton, TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';

const supportsNativePopover = () =>
  typeof HTMLElement !== 'undefined' &&
  Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');

const supportsAnchorPositionArea = () =>
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('position-area', 'block-end');

/** Compact page list with ellipsis when > 7 pages (DESIGN_IDENTITY §9.6). */
const buildPageList = (current: number, total: number): Array<number | 'ellipsis'> => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return 'Not specified';
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const date = isoMatch
    ? new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    : new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Not specified';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export function JobPortalPage() {
  const navigate = useNavigate();
  const contactRef = useRef<HTMLElement>(null);

  // Header Login popover + mobile nav state (navbar + viewport-aware-dropdowns)
  const nativePopover = useMemo(supportsNativePopover, []);
  const loginTriggerRef = useRef<HTMLButtonElement>(null);
  const loginMenuRef = useRef<HTMLUListElement>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginHoverPreview, setLoginHoverPreview] = useState(false);
  const [fallbackMenuStyle, setFallbackMenuStyle] = useState<CSSProperties | undefined>(undefined);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [jobs, setJobs] = useState<any[]>([]);
  // Loaded once for the whole table so every row shows the same range.
  const salarySchedule = useSalarySchedule();
  const [loading, setLoading] = useState(true);
  const vacanciesLoad = useTableLoading(loading, jobs.length > 0);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedType, setSelectedType] = useState('All');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Position Login popover with JS fallback when CSS Anchor Positioning is unsupported.
  const positionFallbackMenu = useCallback(() => {
    if (supportsAnchorPositionArea()) {
      setFallbackMenuStyle(undefined);
      return;
    }
    const trigger = loginTriggerRef.current;
    const menu = loginMenuRef.current;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const width = menuRect.width || 232;
    const height = menuRect.height || 184;
    const gap = 8;
    const top = rect.bottom + gap + height > window.innerHeight
      ? Math.max(gap, rect.top - gap - height)
      : rect.bottom + gap;
    const left = Math.min(
      Math.max(gap, rect.right - width),
      Math.max(gap, window.innerWidth - width - gap),
    );
    setFallbackMenuStyle({ top, left });
  }, []);

  // Sync native popover toggle events to aria-expanded and fallback coordinates.
  useEffect(() => {
    const menu = loginMenuRef.current;
    if (!nativePopover || !menu) return;
    const onToggle = (event: Event) => {
      const nextOpen = (event as ToggleEvent).newState === 'open';
      setLoginOpen(nextOpen);
      if (!nextOpen) {
        setLoginHoverPreview(false);
      } else {
        window.requestAnimationFrame(positionFallbackMenu);
      }
    };
    menu.addEventListener('toggle', onToggle);
    return () => menu.removeEventListener('toggle', onToggle);
  }, [nativePopover, positionFallbackMenu]);

  // Fallback click-outside + Escape handling when native Popover is absent.
  useEffect(() => {
    if (nativePopover || !loginOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLoginOpen(false);
        loginTriggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !loginMenuRef.current?.contains(target) &&
        !loginTriggerRef.current?.contains(target)
      ) {
        setLoginOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [nativePopover, loginOpen]);

  // Close mobile menu on Escape.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  const handleLoginPointerEnter = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch') return;
    if (typeof window !== 'undefined' && !window.matchMedia('(hover: hover)').matches) return;
    if (loginOpen) return;
    const menu = loginMenuRef.current as (HTMLUListElement & { showPopover?: () => void }) | null;
    if (nativePopover && menu?.showPopover) {
      try {
        menu.showPopover();
        setLoginHoverPreview(true);
      } catch {
        // Ignore if already open.
      }
    } else {
      setLoginOpen(true);
      setLoginHoverPreview(true);
    }
  };

  const handleLoginPointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch' || !loginHoverPreview) return;
    const menu = loginMenuRef.current as (HTMLUListElement & { hidePopover?: () => void }) | null;
    if (nativePopover && menu?.hidePopover) {
      try {
        menu.hidePopover();
      } catch {
        // Ignore if already closed.
      }
    } else {
      setLoginOpen(false);
    }
    setLoginHoverPreview(false);
  };

  const handleLoginTriggerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (loginHoverPreview) {
      // Clicking while hover-previewing pins the menu open instead of closing it.
      event.preventDefault();
      setLoginHoverPreview(false);
      return;
    }
    if (!nativePopover) {
      setLoginOpen((prev) => !prev);
    }
  };

  useEffect(() => {
    const syncJobs = async () => {
      try {
        setLoading(true);
        await loadJobPostings();
        const allJobs = getAuthoritativeJobPostings();

        const displayJobs = allJobs.map((job, idx) => ({
          id: job.id || String(idx + 1),
          title: job.title || '',
          department: job.department || '',
          itemNumber: job.jobCode || job.id || '',
          postingDate: job.postedDate ? new Date(job.postedDate).toISOString().split('T')[0] : '',
          closingDate: job.applicationDeadline
            ? new Date(job.applicationDeadline).toISOString().split('T')[0]
            : '',
          type: job.employmentStatus === 'Permanent' ? 'Plantilla' : 'Contractual',
          positionType: job.positionType || 'Civil Service',
          employmentStatus: job.employmentStatus || 'Permanent',
          status: job.status || 'Active',
          plantillaText: (() => {
            const slots = job.plantillaSlots ?? [];
            if (slots.length === 1) return plantillaLabel(slots[0]);
            if (slots.length === 0) return '';
            const open = slots.filter((slot) => slot.status === 'open').length;
            return `${slots.length} plantillas · ${open} open`;
          })(),
          originalJob: job,
        }));

        setJobs(displayJobs);
      } catch (err) {
        console.error('[JobPortalPage] Error loading jobs:', err);
      } finally {
        setLoading(false);
      }
    };

    void syncJobs();
  }, []);

  const activeJobs = useMemo(
    () => jobs.filter((job) => String(job.status).toLowerCase() === 'active'),
    [jobs],
  );

  const matchesSearch = useCallback(
    (job: any) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        job.title.toLowerCase().includes(query) ||
        job.department.toLowerCase().includes(query) ||
        job.type.toLowerCase().includes(query) ||
        String(job.positionType).toLowerCase().includes(query)
      );
    },
    [searchQuery],
  );

  const departments = useMemo(() => {
    const depts = new Set(
      activeJobs.map((j) => String(j.department ?? '').trim()).filter(Boolean),
    );
    return ['All', ...Array.from(depts).sort()];
  }, [activeJobs]);

  const employmentTypes = useMemo(() => {
    const types = new Set(activeJobs.map((j) => String(j.type ?? '').trim()).filter(Boolean));
    return ['All', ...Array.from(types).sort()];
  }, [activeJobs]);

  const deptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const dept of departments) {
      counts.set(
        dept,
        activeJobs.filter(
          (job) =>
            (dept === 'All' || job.department === dept) &&
            (selectedType === 'All' || job.type === selectedType) &&
            matchesSearch(job),
        ).length,
      );
    }
    return counts;
  }, [departments, activeJobs, selectedType, matchesSearch]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const type of employmentTypes) {
      counts.set(
        type,
        activeJobs.filter(
          (job) =>
            (type === 'All' || job.type === type) &&
            (selectedDept === 'All' || job.department === selectedDept) &&
            matchesSearch(job),
        ).length,
      );
    }
    return counts;
  }, [employmentTypes, activeJobs, selectedDept, matchesSearch]);

  const activeVacancies = useMemo(
    () =>
      activeJobs.filter((job) => {
        if (selectedDept !== 'All' && job.department !== selectedDept) return false;
        if (selectedType !== 'All' && job.type !== selectedType) return false;
        return matchesSearch(job);
      }),
    [activeJobs, selectedDept, selectedType, matchesSearch],
  );

  const totalPages = Math.ceil(activeVacancies.length / itemsPerPage);
  const paginatedVacancies = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return activeVacancies.slice(start, start + itemsPerPage);
  }, [activeVacancies, currentPage]);

  const pageNumbers = useMemo(() => buildPageList(currentPage, totalPages), [currentPage, totalPages]);

  const handlePreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const loginPopoverAttrs = nativePopover ? ({ popover: 'auto' } as Record<string, string>) : {};
  const triggerPopoverAttrs = nativePopover ? ({ popovertarget: 'jp-login-menu' } as Record<string, string>) : {};

  return (
    <div className="ds-remap abyan-tokens jp-page flex flex-col justify-between">
      {/* ─── Top Navbar ─────────────────────────────────────────────── */}
      <header className="jp-header">
        <div className="jp-header-inner">
          <Link to="/" className="jp-brand" aria-label="ABYAN HRIS home">
            <img
              src={abyanLogo}
              alt=""
              width={40}
              height={40}
              className="jp-brand-logo"
            />
            <span className="jp-brand-name">ABYAN</span>
            <span className="jp-brand-sub">Human Resource Information System</span>
          </Link>

          <div className="jp-desktop-actions">
            <nav className="jp-nav" aria-label="Primary">
              <Link to="/" className="jp-nav-link">Home</Link>
              <Link to="/about" className="jp-nav-link">About</Link>
              <Link to="/track" className="jp-nav-link">Track</Link>
            </nav>

            <div
              className="jp-login-wrap"
              onPointerEnter={handleLoginPointerEnter}
              onPointerLeave={handleLoginPointerLeave}
              onBlur={(event) => {
                const next = event.relatedTarget as Node | null;
                if (next && !event.currentTarget.contains(next) && !loginMenuRef.current?.contains(next)) {
                  const menu = loginMenuRef.current as (HTMLUListElement & { hidePopover?: () => void }) | null;
                  if (nativePopover && menu?.hidePopover && loginOpen) {
                    try { menu.hidePopover(); } catch { /* ignore */ }
                  } else {
                    setLoginOpen(false);
                  }
                }
              }}
            >
              <button
                ref={loginTriggerRef}
                type="button"
                className="jp-login-btn"
                aria-controls="jp-login-menu"
                aria-expanded={loginOpen}
                onClick={handleLoginTriggerClick}
                {...triggerPopoverAttrs}
              >
                <Users size={18} aria-hidden="true" />
                <span>Login</span>
                <ChevronDown size={16} className="jp-login-chevron" aria-hidden="true" />
              </button>

              <ul
                ref={loginMenuRef}
                id="jp-login-menu"
                className={`jp-login-menu${fallbackMenuStyle ? ' jp-login-menu--fallback' : ''}`}
                style={fallbackMenuStyle}
                hidden={!nativePopover && !loginOpen}
                {...loginPopoverAttrs}
              >
                <li>
                  <Link to="/employee/login" className="jp-portal-link" onClick={() => setLoginOpen(false)}>
                    <span className="jp-portal-chip" aria-hidden="true"><Users size={15} /></span>
                    Employee Portal
                  </Link>
                </li>
                <li>
                  <Link to="/interviewer/login" className="jp-portal-link" onClick={() => setLoginOpen(false)}>
                    <span className="jp-portal-chip" aria-hidden="true"><ClipboardCheck size={15} /></span>
                    Interviewer Portal
                  </Link>
                </li>
                <li>
                  <Link to="/admin/login" className="jp-portal-link" onClick={() => setLoginOpen(false)}>
                    <span className="jp-portal-chip jp-portal-chip--admin" aria-hidden="true"><ShieldCheck size={15} /></span>
                    HR Administration
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <button
            type="button"
            className="jp-mobile-toggle"
            aria-expanded={mobileMenuOpen}
            aria-controls="jp-mobile-nav"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            <span>{mobileMenuOpen ? 'Close' : 'Menu'}</span>
          </button>
        </div>

        {mobileMenuOpen && (
          <nav id="jp-mobile-nav" className="jp-mobile-panel" aria-label="Mobile navigation">
            <Link to="/" className="jp-mobile-link" onClick={() => setMobileMenuOpen(false)}>Home</Link>
            <Link to="/about" className="jp-mobile-link" onClick={() => setMobileMenuOpen(false)}>About</Link>
            <Link to="/job-portal" className="jp-mobile-link" aria-current="page" onClick={() => setMobileMenuOpen(false)}>Job Portal</Link>
            <Link to="/track" className="jp-mobile-link" onClick={() => setMobileMenuOpen(false)}>Track Application</Link>
            <p className="jp-mobile-section-label">Portal Login</p>
            <Link to="/employee/login" className="jp-mobile-link" onClick={() => setMobileMenuOpen(false)}>
              <Users size={16} aria-hidden="true" /> Employee Portal
            </Link>
            <Link to="/interviewer/login" className="jp-mobile-link" onClick={() => setMobileMenuOpen(false)}>
              <ClipboardCheck size={16} aria-hidden="true" /> Interviewer Portal
            </Link>
            <Link to="/admin/login" className="jp-mobile-link" onClick={() => setMobileMenuOpen(false)}>
              <ShieldCheck size={16} aria-hidden="true" /> HR Administration
            </Link>
          </nav>
        )}
      </header>

      {/* ─── Hero Banner ─────────────────────────────────────────── */}
      <section className="jp-hero">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">Abyan Careers</p>
          <h1 className="jp-hero-title">Job Portal</h1>
          <p className="jp-hero-lead">
            Browse through active job vacancies in public service and start your application process today.
          </p>
        </div>
      </section>

      {/* ─── Main Portal Content ──────────────────────────────────── */}
      <main className="flex-grow mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <search aria-label="Filter vacant positions">
          <div className="jp-toolbar">
            {/* Search Box */}
            <div className="jp-search-wrap">
              <label htmlFor="jp-search" className="jp-sr-only">Search job vacancies</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#515F69]" size={18} aria-hidden="true" />
              <input
                id="jp-search"
                name="q"
                type="search"
                enterKeyHint="search"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Search by title, department, or type..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="jp-input"
              />
            </div>

            {/* Filters & View toggle */}
            <div className="jp-filters">
              <div className="jp-filter-group">
                <label htmlFor="jp-dept-filter" className="jp-filter-label">Department</label>
                <select
                  id="jp-dept-filter"
                  name="department"
                  value={selectedDept}
                  onChange={(e) => {
                    setSelectedDept(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="jp-select"
                >
                  {departments.map((dept) => {
                    const count = deptCounts.get(dept) ?? 0;
                    const empty = count === 0 && dept !== selectedDept;
                    return (
                      <option
                        key={dept}
                        value={dept}
                        disabled={empty}
                        style={empty ? { color: 'var(--neutral-400)' } : undefined}
                      >
                        {dept} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="jp-filter-group">
                <label htmlFor="jp-type-filter" className="jp-filter-label">Type</label>
                <select
                  id="jp-type-filter"
                  name="employmentType"
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="jp-select"
                >
                  {employmentTypes.map((type) => {
                    const count = typeCounts.get(type) ?? 0;
                    const empty = count === 0 && type !== selectedType;
                    return (
                      <option
                        key={type}
                        value={type}
                        disabled={empty}
                        style={empty ? { color: 'var(--neutral-400)' } : undefined}
                      >
                        {type} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="jp-view-toggle" role="group" aria-label="Vacancies layout">
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  aria-pressed={viewMode === 'card'}
                  aria-label="Card view"
                  className="jp-view-btn"
                  title="Grid View"
                >
                  <LayoutGrid size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  aria-pressed={viewMode === 'table'}
                  aria-label="Table view"
                  className="jp-view-btn"
                  title="Table View"
                >
                  <List size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </search>

        {/* Vacancies Display */}
        {vacanciesLoad.initialLoading && viewMode === 'card' ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {vacanciesLoad.showSkeleton && (
              <>
                <LoadingStatus label="Loading vacant positions…" />
                {Array.from({ length: itemsPerPage }, (_, i) => (
                  <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-hidden="true">
                    <Skeleton style={{ width: 80, height: 22, borderRadius: 999 }} />
                    <Skeleton style={{ width: '75%', height: 16, marginTop: 20 }} />
                    <Skeleton style={{ width: '50%', height: 12, marginTop: 10 }} />
                    <Skeleton style={{ width: '100%', height: 36, marginTop: 28, borderRadius: 999 }} />
                  </div>
                ))}
              </>
            )}
          </div>
        ) : !vacanciesLoad.initialLoading && activeVacancies.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm px-6">
            <Briefcase className="mx-auto text-slate-300 mb-4" size={44} aria-hidden="true" />
            <h2 className="text-lg font-bold text-[var(--color-primary-900)]">No Vacancies Found</h2>
            <p className="mt-2 text-slate-500 max-w-md mx-auto">
              There are currently no active job vacancies matching your filters or keywords. Please check back later.
            </p>
            {(searchQuery || selectedDept !== 'All' || selectedType !== 'All') && (
              <div className="abyan-ds mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedDept('All');
                    setSelectedType('All');
                    setCurrentPage(1);
                  }}
                  className="btn btn-sm btn-secondary"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        ) : viewMode === 'card' ? (
          /* GRID OF CARDS */
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedVacancies.map((job) => (
              <article
                key={job.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm transition hover:shadow-md hover:border-indigo-100"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                      job.type === 'Plantilla' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {job.type}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-indigo-50 text-[#363EE8]">
                      Open
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-[var(--color-primary-900)] mb-2">
                    {job.title}
                  </h2>
                  {job.plantillaText && (
                    <p className="text-xs font-semibold text-slate-500 mb-2">{job.plantillaText}</p>
                  )}

                  <p className="text-sm text-slate-500 font-medium flex items-start gap-1.5 mb-4">
                    <MapPin size={15} className="mt-0.5 shrink-0 text-[#363EE8]" aria-hidden="true" />
                    <span>{job.department}</span>
                  </p>

                  <div className="space-y-2 border-t border-slate-100 pt-4 mb-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Banknote size={13} aria-hidden="true" /> Monthly Salary</span>
                      <span className="font-semibold text-slate-700">{vacancySalaryLabel(job.originalJob, salarySchedule)}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Calendar size={13} aria-hidden="true" /> Posted Date</span>
                      <span className="font-semibold text-slate-700">{formatDate(job.postingDate)}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Clock size={13} aria-hidden="true" /> Deadline</span>
                      <span className={job.closingDate ? 'font-semibold text-rose-600' : 'font-medium italic text-slate-400'}>
                        {formatDate(job.closingDate)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card actions (§9.1): Small secondary + Small primary. */}
                <div className="abyan-ds jp-card-actions">
                  <button
                    type="button"
                    onClick={() => navigate(`/job-details/${encodeURIComponent(job.originalJob?.id ?? job.itemNumber)}`, { state: { landingJob: job } })}
                    className="btn btn-sm btn-secondary w-full"
                  >
                    View Details
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/apply', { state: { landingJob: job } })}
                    className="btn btn-sm btn-primary w-full"
                  >
                    Apply Now
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          /* TABLE VIEW (keyboard-scrollable + @container stacked cards on narrow screens) */
          <div
            className="abyan-table-wrap jp-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Active job vacancies"
          >
            <table className="abyan-table jp-table w-full text-left">
              <caption className="jp-sr-only">Active job vacancies</caption>
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-6 py-4 font-semibold text-[var(--color-primary-900)]">Position Title</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-[var(--color-primary-900)]">Department</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-[var(--color-primary-900)]">Employment Type</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-[var(--color-primary-900)]">Monthly Salary</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-[var(--color-primary-900)]">Application Deadline</th>
                  <th scope="col" className="px-6 py-4 text-center font-semibold text-[var(--color-primary-900)]">Status</th>
                  <th scope="col" className="px-6 py-4 text-center font-semibold text-[var(--color-primary-900)]">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-slate-100 ${tableBodyClass(false)}`}>
                {vacanciesLoad.initialLoading ? (
                  <TableSkeletonRows show={vacanciesLoad.showSkeleton} rows={itemsPerPage}
                    columns={['text', 'text', 'text', 'text', 'text', 'badge', 'button']} label="Loading vacant positions…" />
                ) : paginatedVacancies.map((job) => (
                  <tr key={job.id} className="transition hover:bg-slate-50/50">
                    <td data-label="Position" data-primary="true" className="px-6 py-4 font-bold text-[var(--color-primary-900)]">
                      {job.title}
                      {job.plantillaText && (
                        <div className="mt-0.5 text-xs font-medium text-slate-500">{job.plantillaText}</div>
                      )}
                    </td>
                    <td data-label="Department" className="px-6 py-4 text-slate-600">{job.department}</td>
                    <td data-label="Type" className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        job.type === 'Plantilla' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {job.type}
                      </span>
                    </td>
                    <td data-label="Monthly Salary" className="whitespace-nowrap px-6 py-4 text-slate-600">{vacancySalaryLabel(job.originalJob, salarySchedule)}</td>
                    <td data-label="Deadline" className="px-6 py-4 font-medium text-rose-600">{formatDate(job.closingDate)}</td>
                    <td data-label="Status" className="px-6 py-4 text-center">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-indigo-50 text-[#363EE8]">
                        Open
                      </span>
                    </td>
                    <td data-label="Actions" data-actions="true" className="px-6 py-4">
                      <div className="abyan-ds flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/job-details/${encodeURIComponent(job.originalJob?.id ?? job.itemNumber)}`, { state: { landingJob: job } })}
                          className="btn btn-sm btn-secondary"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/apply', { state: { landingJob: job } })}
                          className="btn btn-sm btn-primary"
                        >
                          Apply
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {!vacanciesLoad.initialLoading && totalPages > 1 && (
          <nav className="jp-pagination" aria-label="Vacancies pagination">
            <div className="text-sm text-slate-500">
              Showing <span className="font-semibold text-slate-700">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
              <span className="font-semibold text-slate-700">
                {Math.min(currentPage * itemsPerPage, activeVacancies.length)}
              </span>{' '}
              of <span className="font-semibold text-slate-700">{activeVacancies.length}</span> vacancies
            </div>

            <div className="jp-pager-list">
              <button
                type="button"
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                aria-label="Previous page"
                className="rsp-pager jp-pager-btn"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>

              {pageNumbers.map((item, index) =>
                item === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`} className="jp-pager-ellipsis" aria-hidden="true">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCurrentPage(item)}
                    aria-current={currentPage === item ? 'page' : undefined}
                    className="rsp-pager jp-pager-btn"
                  >
                    {item}
                  </button>
                ),
              )}

              <button
                type="button"
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                aria-label="Next page"
                className="rsp-pager jp-pager-btn"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </nav>
        )}
      </main>

      <SharedFooter ref={contactRef} />
    </div>
  );
}
