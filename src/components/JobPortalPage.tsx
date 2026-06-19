import { useState, useRef, useEffect, useMemo } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import abyanLogo from '../assets/abyan-logo.png';
import { SharedFooter } from './SharedFooter';
import { getAuthoritativeJobPostings, loadJobPostings } from '../lib/recruitmentData';

export function JobPortalPage() {
  const navigate = useNavigate();
  const contactRef = useRef<HTMLElement>(null);
  
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  useEffect(() => {
    const syncJobs = async () => {
      try {
        setLoading(true);
        await loadJobPostings();
        const allJobs = getAuthoritativeJobPostings();
        
        // Convert JobPosting to display format, including inactive jobs just in case,
        // but sorting/filtering them appropriately. The requirement says:
        // "The Job Portal should automatically display all active and available job vacancies."
        // Let's filter for 'Active' status.
        const displayJobs = allJobs.map((job, idx) => ({
          id: job.id || String(idx + 1),
          title: job.title || '',
          department: job.department || '',
          itemNumber: job.jobCode || job.id || '',
          postingDate: job.postedDate ? new Date(job.postedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          closingDate: job.applicationDeadline ? new Date(job.applicationDeadline).toISOString().split('T')[0] : new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          type: job.employmentStatus === 'Permanent' ? 'Plantilla' : 'Contractual',
          positionType: job.positionType || 'Civil Service',
          employmentStatus: job.employmentStatus || 'Permanent',
          status: job.status || 'Active',
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

  // Filter options
  const departments = useMemo(() => {
    const depts = new Set(jobs.map((j) => j.department));
    return ['All', ...Array.from(depts).sort()];
  }, [jobs]);

  const employmentTypes = useMemo(() => {
    const types = new Set(jobs.map((j) => j.type));
    return ['All', ...Array.from(types).sort()];
  }, [jobs]);

  // Filtered & Active vacancies
  const activeVacancies = useMemo(() => {
    return jobs.filter((job) => {
      // Must be active status
      const isActive = String(job.status).toLowerCase() === 'active';
      if (!isActive) return false;

      // Filter by department
      if (selectedDept !== 'All' && job.department !== selectedDept) return false;

      // Filter by type
      if (selectedType !== 'All' && job.type !== selectedType) return false;

      // Search keyword filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = job.title.toLowerCase().includes(query);
        const matchesDept = job.department.toLowerCase().includes(query);
        const matchesType = job.type.toLowerCase().includes(query);
        const matchesCategory = String(job.positionType).toLowerCase().includes(query);
        return matchesTitle || matchesDept || matchesType || matchesCategory;
      }

      return true;
    });
  }, [jobs, selectedDept, selectedType, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(activeVacancies.length / itemsPerPage);
  const paginatedVacancies = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return activeVacancies.slice(start, start + itemsPerPage);
  }, [activeVacancies, currentPage]);

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
      className="min-h-screen bg-[#F8FAFC] text-[#050D65] flex flex-col justify-between"
      style={{ fontFamily: "'Poppins', system-ui, -apple-system, sans-serif" }}
    >
      {/* ─── Top Navbar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[#363EE8] shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 text-white">
          <div className="flex items-center gap-3">
            <img
              src={abyanLogo}
              alt="Abyan Logo"
              className="h-11 w-auto object-contain"
              style={{ mixBlendMode: 'screen' }}
            />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-white">ABYAN</span>
              <span className="hidden text-sm font-medium text-white/90 sm:inline">
                Human Resource Information System
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-1">
              <Link
                to="/"
                className="rounded-md px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition-colors"
              >
                Home
              </Link>
              <Link
                to="/about"
                className="rounded-md px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition-colors"
              >
                About
              </Link>
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

      {/* ─── Hero Banner ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#363EE8] to-[#050D65] py-12 text-white">
        <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full border border-white/10" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full border border-white/10" />
        <div className="relative mx-auto max-w-6xl px-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-200">Abyan Careers</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Job Portal
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-indigo-100">
            Browse through active job vacancies in public service and start your application process today.
          </p>
        </div>
      </section>

      {/* ─── Main Portal Content ──────────────────────────────────── */}
      <main className="flex-grow mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between mb-8">
          {/* Search Box */}
          <div className="relative flex-grow max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by Title, Department, Type..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-[#050D65] shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30 focus:border-[#363EE8]"
            />
          </div>

          {/* Filters & View toggle */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Department Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dept:</span>
              <select
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-[#050D65] shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Type:</span>
              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-[#050D65] shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
              >
                {employmentTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Layout Toggle Buttons */}
            <div className="flex items-center border border-slate-200 rounded-xl bg-white p-1 shadow-sm">
              <button
                onClick={() => setViewMode('card')}
                className={`p-2 rounded-lg transition ${viewMode === 'card' ? 'bg-[#363EE8]/10 text-[#363EE8]' : 'text-slate-400 hover:text-slate-600'}`}
                title="Grid View"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-lg transition ${viewMode === 'table' ? 'bg-[#363EE8]/10 text-[#363EE8]' : 'text-slate-400 hover:text-slate-600'}`}
                title="Table View"
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Vacancies Display */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-t-[#363EE8] border-slate-200 mb-4" />
            <p className="font-medium">Loading vacant positions...</p>
          </div>
        ) : activeVacancies.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm px-6">
            <Briefcase className="mx-auto text-slate-300 mb-4" size={48} />
            <h3 className="text-lg font-bold text-[#050D65]">No Vacancies Found</h3>
            <p className="mt-2 text-slate-500 max-w-md mx-auto">
              There are currently no active job vacancies matching your filters or keywords. Please check back later.
            </p>
          </div>
        ) : viewMode === 'card' ? (
          /* GRID OF CARDS */
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedVacancies.map((job) => (
              <div
                key={job.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-indigo-100"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                      job.type === 'Plantilla' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {job.type}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-indigo-50 text-[#363EE8]">
                      Open
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-bold text-[#050D65] line-clamp-2 mb-2">
                    {job.title}
                  </h3>
                  
                  <p className="text-sm text-slate-500 font-medium flex items-center gap-1.5 mb-4">
                    <MapPin size={15} className="text-[#363EE8]" />
                    {job.department}
                  </p>
                  
                  <div className="space-y-2 border-t border-slate-100 pt-4 mb-6">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Calendar size={13} /> Posted Date</span>
                      <span className="font-semibold text-slate-700">{formatDate(job.postingDate)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Clock size={13} /> Deadline</span>
                      <span className="font-semibold text-rose-600">{formatDate(job.closingDate)}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/job-details/${job.itemNumber}`, { state: { landingJob: job } })}
                    className="inline-flex justify-center items-center rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
                  >
                    View Details
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/apply', { state: { landingJob: job } })}
                    className="inline-flex justify-center items-center rounded-xl bg-[#363EE8] py-2.5 text-sm font-semibold text-white transition hover:bg-[#2e35d4] shadow-sm shadow-[#363EE8]/10"
                  >
                    Apply Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* TABLE VIEW */
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold text-[#050D65]">Position Title</th>
                  <th className="px-6 py-4 font-semibold text-[#050D65]">Department</th>
                  <th className="px-6 py-4 font-semibold text-[#050D65]">Employment Type</th>
                  <th className="px-6 py-4 font-semibold text-[#050D65]">Application Deadline</th>
                  <th className="px-6 py-4 text-center font-semibold text-[#050D65]">Status</th>
                  <th className="px-6 py-4 text-center font-semibold text-[#050D65]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedVacancies.map((job) => (
                  <tr key={job.id} className="transition hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-bold text-[#050D65]">{job.title}</td>
                    <td className="px-6 py-4 text-slate-600">{job.department}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        job.type === 'Plantilla' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {job.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-rose-600">{formatDate(job.closingDate)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-indigo-50 text-[#363EE8]">
                        Open
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/job-details/${job.itemNumber}`, { state: { landingJob: job } })}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/apply', { state: { landingJob: job } })}
                          className="rounded-lg bg-[#363EE8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2e35d4] transition"
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
        {!loading && totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              Showing <span className="font-semibold text-slate-700">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
              <span className="font-semibold text-slate-700">
                {Math.min(currentPage * itemsPerPage, activeVacancies.length)}
              </span>{' '}
              of <span className="font-semibold text-slate-700">{activeVacancies.length}</span> vacancies
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`h-9 min-w-[36px] rounded-xl px-2.5 text-sm font-semibold transition ${
                    currentPage === page
                      ? 'bg-[#363EE8] text-white shadow-sm shadow-[#363EE8]/10'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </main>

      <SharedFooter ref={contactRef} />
    </div>
  );
}
