import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import {
  Briefcase,
  Users,
  ClipboardCheck,
  ShieldCheck,
  ArrowRight,
  Search,
  TrendingUp,
  GraduationCap,
  Network,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import abyanLogo from '../assets/abyan-logo.png';
import { getAuthoritativeJobPostings, loadJobPostings } from '../lib/recruitmentData';
import type { JobPosting } from '../types/recruitment.types';

/* ── trish UI theme tokens ──────────────────────────────────────────
   Brand: Indigo #363EE8 · Hover #2E35D4 · Soft #EEF2FF
   Ink:   #050D65 · Workspace: #F8FAFC · Surface: #FFFFFF
------------------------------------------------------------------- */

// Fallback: empty - will be populated from Supabase
const FALLBACK_JOB_VACANCIES = [];

const PORTALS = [
  {
    title: 'Job Applicant',
    description: 'Apply for open government positions and submit your requirements online.',
    icon: Briefcase,
    to: '/apply',
    cta: 'Apply Now',
    iconBg: 'bg-[#363EE8]',
  },
  {
    title: 'Employee Portal',
    description: 'Access your profile, submit documents, and view performance records.',
    icon: Users,
    to: '/employee/login',
    cta: 'Employee Login',
    iconBg: 'bg-[#059669]',
  },
  {
    title: 'Interviewer',
    description: 'Evaluate and score applicants assigned to you for review.',
    icon: ClipboardCheck,
    to: '/interviewer/login',
    cta: 'Interviewer Login',
    iconBg: 'bg-[#7C3AED]',
  },
  {
    title: 'HR Administration',
    description: 'Manage recruitment, performance, learning, and succession planning.',
    icon: ShieldCheck,
    to: '/admin/login',
    cta: 'Staff Login',
    iconBg: 'bg-[#050D65]',
  },
];

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
  const jobsTableRef = useRef<HTMLDivElement>(null);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);
  const [vacancyJobs, setVacancyJobs] = useState<any[]>(FALLBACK_JOB_VACANCIES);

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

  const totalPages = Math.ceil(vacancyJobs.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const paginatedJobs = vacancyJobs.slice(startIdx, endIdx);

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
              onClick={handleScrollToJobs}
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
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[#050D65]">Currently Vacant Jobs</h2>
              <p className="mt-1 text-sm text-slate-500">Browse and apply for available positions</p>
            </div>
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
                      <p className="text-xs text-slate-500 mt-1">{job.type}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{job.department}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{job.itemNumber}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(job.postingDate)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(job.closingDate)}</td>
                    <td className="px-4 py-3 text-center">
                      <button className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:border-slate-400">
                        Details
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        to="/apply"
                        className="inline-flex items-center gap-1 rounded-lg bg-[#363EE8] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#2f35d0]"
                      >
                        Apply
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Showing {startIdx + 1} to {Math.min(endIdx, vacancyJobs.length)} of {vacancyJobs.length} jobs
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

      {/* ─── Portals ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#050D65]">Choose your portal</h2>
          <p className="mt-2 text-sm text-slate-500">
            Select how you want to access the system.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PORTALS.map((portal) => {
            const Icon = portal.icon;
            return (
              <Link
                key={portal.title}
                to={portal.to}
                className="group flex flex-col rounded-[18px] border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-[#363EE8] hover:shadow-[0_16px_40px_rgba(54,62,232,0.14)]"
              >
                <div
                  className={`grid h-12 w-12 place-content-center rounded-[12px] text-white ${portal.iconBg}`}
                >
                  <Icon size={22} />
                </div>
                <h3 className="mt-4 text-base font-bold text-[#050D65]">{portal.title}</h3>
                <p className="mt-1.5 flex-1 text-sm text-slate-500">{portal.description}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#363EE8]">
                  {portal.cta}
                  <ArrowRight size={15} className="transition group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────────── */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-[#050D65]">What the system manages</h2>
            <p className="mt-2 text-sm text-slate-500">
              One platform covering the full employee lifecycle.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="rounded-[18px] bg-[#F8FAFC] p-6">
                  <div className="grid h-11 w-11 place-content-center rounded-[10px] bg-[#EEF2FF] text-[#363EE8]">
                    <Icon size={20} />
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-[#050D65]">{feature.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-500">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── CTA strip ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col items-center justify-between gap-6 rounded-[22px] bg-gradient-to-r from-[#363EE8] to-[#050D65] px-8 py-10 text-white sm:flex-row sm:text-left">
          <div>
            <h2 className="text-xl font-bold">Ready to join the public service?</h2>
            <p className="mt-1 text-sm text-indigo-100">
              Browse open positions and submit your application today.
            </p>
          </div>
          <Link
            to="/apply"
            className="inline-flex shrink-0 items-center gap-2 rounded-[14px] bg-white px-6 py-3 text-sm font-semibold text-[#363EE8] transition hover:bg-[#EEF2FF]"
          >
            <Briefcase size={18} /> Apply for a Job
          </Link>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <img
              src={abyanLogo}
              alt="Abyan Logo"
              className="h-7 w-auto object-contain"
            />
            <span className="font-semibold text-[#050D65]">ABYAN HRIS</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
