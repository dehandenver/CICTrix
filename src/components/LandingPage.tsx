import { Link, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Briefcase,
  Users,
  ClipboardCheck,
  ShieldCheck,
  Search,
  TrendingUp,
  GraduationCap,
  Network,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import abyanLogo from '../assets/abyan-logo.png';
import { SharedFooter } from './SharedFooter';
import { getAuthoritativeJobPostings, loadJobPostings } from '../lib/recruitmentData';
import type { JobPosting } from '../types/recruitment.types';

/* ── trish UI theme tokens ──────────────────────────────────────────
   Brand: Indigo #363EE8 · Hover #2E35D4 · Soft #EEF2FF
   Ink:   #050D65 · Workspace: #F8FAFC · Surface: #FFFFFF
------------------------------------------------------------------- */

// Fallback: empty - will be populated from Supabase
const FALLBACK_JOB_VACANCIES = [];


const FEATURES = [
  {
    icon: Search,
    title: 'Recruitment & Selection',
    description: 'Publish job postings, screen applicants, and track every stage of hiring.',
  },
  {
    icon: TrendingUp,
    title: 'Performance Management',
    description: 'Run IPCR/DPCR evaluation cycles and monitor employee performance.',
  },
  {
    icon: GraduationCap,
    title: 'Learning & Development',
    description: 'Manage training courses, seminar enrollment, and competency growth.',
  },
  {
    icon: Network,
    title: 'Succession Planning',
    description: 'Identify critical positions and prepare ready-now successors.',
  },
];

export const LandingPage = () => {
  const navigate = useNavigate();
  const jobsTableRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLElement>(null);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);
  const [vacancyJobs, setVacancyJobs] = useState<any[]>(FALLBACK_JOB_VACANCIES);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Load jobs from Supabase and subscribe to updates
  useEffect(() => {
    const syncJobs = async () => {
      try {
        await loadJobPostings();
        const allJobs = getAuthoritativeJobPostings();
        
        console.log('[LandingPage] Fetched jobs from Supabase:', allJobs);
        
        // Convert JobPosting to display format
        const displayJobs = allJobs
          .filter((job) => {
            const statusMatch = String(job?.status ?? '').toLowerCase() === 'active';
            console.log(`[LandingPage] Job "${job.title}" status: "${job.status}" -> "${String(job?.status ?? '').toLowerCase()}" -> matches: ${statusMatch}`);
            return statusMatch;
          })
          .map((job, idx) => ({
            id: idx + 1,
            title: job.title || '',
            department: job.department || '',
            itemNumber: job.jobCode || job.id || '',
            postingDate: job.postedDate ? new Date(job.postedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            closingDate: job.applicationDeadline ? new Date(job.applicationDeadline).toISOString().split('T')[0] : new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            type: job.employmentStatus === 'Permanent' ? 'Plantilla' : 'Contractual',
            positionType: job.positionType || '',
            employmentStatus: job.employmentStatus || '',
          }));
        
        console.log('[LandingPage] Display jobs after filtering:', displayJobs);
        setVacancyJobs(displayJobs);
      } catch (err) {
        console.error('[LandingPage] Error loading jobs:', err);
      }
    };

    // Load on mount
    void syncJobs();

    // Subscribe to job postings updates (only on client side)
    if (typeof window !== 'undefined') {
      window.addEventListener('cictrix:job-postings-updated', syncJobs as EventListener);
      window.addEventListener('focus', syncJobs as EventListener);

      return () => {
        window.removeEventListener('cictrix:job-postings-updated', syncJobs as EventListener);
        window.removeEventListener('focus', syncJobs as EventListener);
      };
    }
  }, []);

  const handleScrollToJobs = () => {
    jobsTableRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Real-time Search and Sorting logic
  const filteredAndSortedJobs = useMemo(() => {
    let result = [...vacancyJobs];

    // Search filter: keywords such as Position Title, Department, Employment Type (type), and Job Category (positionType / employmentStatus)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (job) =>
          job.title.toLowerCase().includes(q) ||
          job.department.toLowerCase().includes(q) ||
          job.type.toLowerCase().includes(q) ||
          job.positionType.toLowerCase().includes(q) ||
          job.employmentStatus.toLowerCase().includes(q)
      );
    }

    // Sort options: Newest to Oldest, Oldest to Newest, Position Title (A-Z), Position Title (Z-A), Department
    if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.postingDate).getTime() - new Date(a.postingDate).getTime());
    } else if (sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.postingDate).getTime() - new Date(b.postingDate).getTime());
    } else if (sortBy === 'title-az') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'title-za') {
      result.sort((a, b) => b.title.localeCompare(a.title));
    } else if (sortBy === 'department') {
      result.sort((a, b) => a.department.localeCompare(b.department));
    }

    return result;
  }, [vacancyJobs, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedJobs.length / itemsPerPage));
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
      className="min-h-screen bg-[#F8FAFC] text-[#050D65]"
      style={{ fontFamily: "'Poppins', system-ui, -apple-system, sans-serif" }}
    >
      {/* ─── Top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[#363EE8]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 text-white">
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
              <button
                type="button"
                onClick={() => contactRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="rounded-md px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition-colors"
              >
                Contacts
              </button>
            </nav>

            {/* Login Dropdown */}
            <div className="relative group">
              <button className="inline-flex items-center gap-2 rounded-[14px] bg-white px-6 py-3 text-sm font-semibold text-[#363EE8] shadow-lg transition hover:bg-[#EEF2FF]">
                <Users size={18} />
                <span>Login</span>
              </button>

              {/* Dropdown Menu */}
              <div className="absolute right-0 top-full mt-2 w-52 bg-white text-slate-900 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 py-2 border border-slate-100">
                <a
                  href="/employee/login"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#EEF2FF] font-medium text-sm text-[#050D65] transition-colors"
                >
                  <span className="grid h-8 w-8 place-content-center rounded-lg bg-[#059669] text-white"><Users size={15} /></span>
                  Employee Portal
                </a>
                <a
                  href="/interviewer/login"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#EEF2FF] font-medium text-sm text-[#050D65] transition-colors"
                >
                  <span className="grid h-8 w-8 place-content-center rounded-lg bg-[#7C3AED] text-white"><ClipboardCheck size={15} /></span>
                  Interviewer Portal
                </a>
                <a
                  href="/admin/login"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#EEF2FF] font-medium text-sm text-[#050D65] transition-colors"
                >
                  <span className="grid h-8 w-8 place-content-center rounded-lg bg-[#050D65] text-white"><ShieldCheck size={15} /></span>
                  HR Administration
                </a>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Hero ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#363EE8] to-[#050D65]" />
        <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full border border-white/15" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full border border-white/10" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 text-center text-white sm:py-28">
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            Your gateway to public service.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-indigo-100 sm:text-lg">
            Discover open positions, track your application, and manage your employee records through our secure, all-in-one platform. Abyan mo sa pag-asenso.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={() => navigate('/job-portal')}
              className="inline-flex items-center gap-2 rounded-[14px] bg-white px-6 py-3 text-sm font-semibold text-[#363EE8] shadow-lg transition hover:bg-[#EEF2FF]"
            >
              <Briefcase size={18} /> Apply for a Job
            </button>
            <Link
              to="/track"
              className="inline-flex items-center gap-2 rounded-[14px] border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <Search size={18} /> Track Application
            </Link>
          </div>
        </div>
      </section>


      {/* ─── Vacant Jobs Table ─────────────────────────────────────────────── */}
      <section ref={jobsTableRef} className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-[#050D65]">Currently Vacant Jobs</h2>
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
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#050D65] focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
              >
                <option value="newest">Newest to Oldest</option>
                <option value="oldest">Oldest to Newest</option>
                <option value="title-az">Position Title (A-Z)</option>
                <option value="title-za">Position Title (Z-A)</option>
                <option value="department">Department</option>
              </select>

              {/* Entries Limit */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-[#050D65]">Show</label>
                <select
                  value={itemsPerPage}
                  onChange={handleItemsPerPageChange}
                  className="rounded-lg border-2 border-[#363EE8] bg-white px-3 py-2 text-sm font-medium text-[#050D65] transition focus:outline-none focus:ring-2 focus:ring-[#363EE8]/20"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
                <span className="text-sm font-medium text-[#050D65]">entries</span>
              </div>
            </div>
          </div>

          {/* Responsive Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold text-[#050D65]">Position Title</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#050D65]">Department</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#050D65]">Plantilla Item No.</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#050D65]">Posting Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-[#050D65]">Closing Date</th>
                  <th className="px-4 py-3 text-center font-semibold text-[#050D65]">Details</th>
                  <th className="px-4 py-3 text-center font-semibold text-[#050D65]">Apply</th>
                </tr>
              </thead>
              <tbody>
                {paginatedJobs.map((job) => (
                  <tr key={job.id} className="border-b border-slate-200 transition hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#050D65]">{job.title}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{job.department}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{job.itemNumber}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(job.postingDate)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(job.closingDate)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => navigate(`/job-details/${job.itemNumber}`, { state: { landingJob: job } })}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:border-slate-400 cursor-pointer"
                      >
                        Details
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => navigate('/apply', { state: { landingJob: job } })}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#363EE8] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#2f35d0] cursor-pointer"
                      >
                        Apply
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Showing {startIdx + 1} to {Math.min(endIdx, filteredAndSortedJobs.length)} of {filteredAndSortedJobs.length} jobs
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
