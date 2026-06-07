import { Filter, LogOut, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import abyanLogo from '../../assets/abyan-logo.png';
import { Dialog } from '../../components/Dialog';
import { POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import { isPositionAssignedToInterviewer, resolveAssignedPositionsForInterviewer } from '../../lib/interviewerAccess';
import { mockDatabase } from '../../lib/mockDatabase';
import { ensureRecruitmentSeedData, getAuthoritativeJobPostings, getJobPostingsFromSupabase } from '../../lib/recruitmentData';
import { supabase } from '../../lib/supabase';
import '../../styles/interviewer.css';
import type { JobPosting as RecruitmentJobPosting } from '../../types/recruitment.types';

interface JobPosting {
  id: number;
  title: string;
  item_number: string;
  department: string;
  office: string;
  status: string;
  created_at: string;
  applicant_count: number;
}

interface Applicant {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  position: string;
  office: string;
  contact_number: string;
  status: string;
  created_at: string;
  evaluation_status: 'Completed' | 'In Progress' | 'Not Yet Rated';
}

// Helper function to construct full name
const getFullName = (applicant: Applicant): string => {
  const parts = [applicant.first_name];
  if (applicant.middle_name) {
    parts.push(applicant.middle_name);
  }
  parts.push(applicant.last_name);
  return parts.join(' ');
};

interface Stats {
  totalJobs: number;
  totalApplicants: number;
  upcomingInterviews: number;
}

interface InterviewerSessionInfo {
  email: string;
  name: string;
}

const isDemoApplicant = (applicant: any): boolean => {
  const applicantId = String(applicant?.id || '').toLowerCase();
  const applicantEmail = String(applicant?.email || '').toLowerCase();
  return applicantId.startsWith('mock-') || applicantEmail.endsWith('@example.com');
};

const fetchApplicantsFromClient = async (client: any): Promise<any[]> => {
  // Use backend API to bypass RLS on Supabase
  if (client && typeof client.from === 'function') {
    try {
      const response = await fetch('/api/applicants/?skip=0&limit=1000');
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Fall back to direct query if API fails
      const { data } = await client.from('applicants').select('*');
      return data || [];
    }
  }
  const { data } = await client.from('applicants').select('*');
  return data || [];
};

const fetchEvaluationsFromClient = async (client: any): Promise<any[]> => {
  const { data } = await client.from('evaluations').select('*');
  return data || [];
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const buildJobsFromPostings = (jobRows: RecruitmentJobPosting[], allApplicants: any[]) => {
  // Dedup defensively: same posting may exist twice in Supabase (e.g. created via
  // both job_postings and jobs tables, or a duplicate row was inserted). Keep the
  // first occurrence by jobCode → falls back to normalized title when jobCode is
  // empty. This is a display-layer guard and does not modify the DB.
  const seenKeys = new Set<string>();
  const dedupedRows: RecruitmentJobPosting[] = [];
  for (const job of jobRows || []) {
    const code = String(job?.jobCode || '').trim();
    const title = normalizeText(String(job?.title || ''));
    const key = code || title;
    if (!key) continue;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    dedupedRows.push(job);
  }

  const activeJobs = dedupedRows.filter((job) => String(job?.status || '').toLowerCase() === 'active');
  const activeTitleSet = new Set(activeJobs.map((job) => normalizeText(String(job?.title || ''))).filter(Boolean));

  const visibleApplicants = (allApplicants || []).filter((applicant) => {
    const position = normalizeText(String(applicant?.position || ''));
    return position && activeTitleSet.has(position);
  });

  const applicantCountByTitle = new Map<string, number>();
  visibleApplicants.forEach((applicant) => {
    const key = normalizeText(String(applicant?.position || ''));
    if (!key) return;
    applicantCountByTitle.set(key, (applicantCountByTitle.get(key) || 0) + 1);
  });

  const jobs = activeJobs
    .map((job, index) => {
      const normalizedTitle = normalizeText(String(job?.title || ''));
      const office = String(job?.department || '').trim() || POSITION_TO_DEPARTMENT_MAP[job.title] || 'N/A';
      const numericId = Number(job.id);

      return {
        id: Number.isFinite(numericId) ? numericId : index + 1,
        title: job.title,
        item_number: job.jobCode || 'N/A',
        department: office,
        office,
        status: 'Open',
        created_at: job.postedDate || new Date().toISOString(),
        applicant_count: applicantCountByTitle.get(normalizedTitle) || 0,
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    jobs,
    visibleApplicants,
  };
};

const filterJobsByAssignments = (jobRows: RecruitmentJobPosting[], assignedPositions: string[]) => {
  if (assignedPositions.length === 0) return jobRows;
  return jobRows.filter((job) => isPositionAssignedToInterviewer(String(job?.title ?? ''), assignedPositions));
};

export function InterviewerDashboard({
  session,
  onLogout,
}: {
  session?: InterviewerSessionInfo | null;
  onLogout?: () => void;
}) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalJobs: 0,
    totalApplicants: 0,
    upcomingInterviews: 0
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [applicantToDelete, setApplicantToDelete] = useState<Applicant | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const syncJobs = () => {
      void fetchJobsAndApplicants();
    };

    const onStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === 'cictrix_rater_assigned_positions' ||
        event.key === 'cictrix_job_postings' ||
        event.key === 'cictrix_authoritative_job_postings'
      ) {
        void fetchJobsAndApplicants();
      }
    };

    void fetchJobsAndApplicants();
    
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', syncJobs);
      window.addEventListener('cictrix:job-postings-updated', syncJobs as EventListener);
      window.addEventListener('storage', onStorage);

      return () => {
        window.removeEventListener('focus', syncJobs);
        window.removeEventListener('cictrix:job-postings-updated', syncJobs as EventListener);
        window.removeEventListener('storage', onStorage);
      };
    }
  }, []);

  const fetchJobsAndApplicants = async () => {
    try {
      setLoading(true);
      setError(null);
      // CRITICAL: Always fetch applicants from Supabase (as per user requirement: "all datas must be stored in supabase")
      const primaryClient = supabase; // Always use Supabase for applicants
      const secondaryClient = (mockDatabase as any); // Fallback only if Supabase fails

      let allApplicants: any[] = [];
      let allEvaluations: any[] = [];
      ensureRecruitmentSeedData();
      const { positions } = await resolveAssignedPositionsForInterviewer(session?.email);
      
      // CRITICAL: Fetch job postings from Supabase first (source of truth), fallback to localStorage
      let canonicalJobPostings: RecruitmentJobPosting[] = [];
      try {
        canonicalJobPostings = await getJobPostingsFromSupabase();
        if (canonicalJobPostings.length === 0) {
          console.log('[INTERVIEWER] No jobs from Supabase, falling back to localStorage');
          canonicalJobPostings = getAuthoritativeJobPostings();
        } else {
          console.log('[INTERVIEWER] ✓ Loaded', canonicalJobPostings.length, 'jobs from Supabase');
        }
      } catch (err) {
        console.warn('[INTERVIEWER] Failed to fetch jobs from Supabase, using localStorage:', err);
        canonicalJobPostings = getAuthoritativeJobPostings();
      }
      
      const canonicalJobRows = filterJobsByAssignments(canonicalJobPostings, positions);

      try {
        allApplicants = await fetchApplicantsFromClient(primaryClient);
        allEvaluations = await fetchEvaluationsFromClient(primaryClient);
      } catch (primaryErr) {
        console.warn('Primary interviewer data source failed:', primaryErr);
      }

      if ((!allApplicants || allApplicants.length === 0)) {
        try {
          allApplicants = await fetchApplicantsFromClient(secondaryClient);
          allEvaluations = await fetchEvaluationsFromClient(secondaryClient);
        } catch (secondaryErr) {
          console.warn('Secondary interviewer data source failed:', secondaryErr);
        }
      }

      allApplicants = (allApplicants || []).filter((item) => !isDemoApplicant(item));

      // Single source of truth: use canonical RSP/Admin postings only.
      const { jobs: jobsFromPostings, visibleApplicants } = buildJobsFromPostings(canonicalJobRows, allApplicants);
      const visibleApplicantIds = new Set(
        visibleApplicants.map((applicant: any) => String(applicant?.id ?? '').trim()).filter(Boolean)
      );
      const visibleEvaluationCount = (allEvaluations || []).filter((evaluation: any) =>
        visibleApplicantIds.has(String(evaluation?.applicant_id ?? '').trim())
      ).length;

      setJobs(jobsFromPostings);
      setStats({
        totalJobs: jobsFromPostings.length,
        totalApplicants: visibleApplicants.length,
        upcomingInterviews: visibleEvaluationCount,
      });
    } catch (err) {
      console.error('Error initializing dashboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const uniqueDepartments = useMemo(() => {
    return Array.from(new Set(jobs.map(job => job.office))).sort();
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchesSearch = !searchTerm || 
        job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.office.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesDept = departmentFilter === 'all' || job.office === departmentFilter;
      
      return matchesSearch && matchesDept;
    });
  }, [jobs, searchTerm, departmentFilter]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleViewJobApplicants = (jobTitle: string) => {
    navigate(`/interviewer/applicants?position=${encodeURIComponent(jobTitle)}`);
  };

  const handleDeleteConfirm = async () => {
    if (!applicantToDelete) return;

    try {
      setDeleting(true);
      const { error: deleteError } = await supabase
        .from('applicants')
        .delete()
        .eq('id', applicantToDelete.id);

      if (deleteError) throw deleteError;

      setStats(prev => ({
        ...prev,
        totalApplicants: prev.totalApplicants - 1
      }));

      // Refresh jobs data to update applicant counts
      fetchJobsAndApplicants();
      
      setDeleteConfirmOpen(false);
      setApplicantToDelete(null);
    } catch (err) {
      console.error('Error deleting applicant:', err);
      alert('Failed to delete applicant. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#e5e7eb', fontFamily: "'Poppins', system-ui, sans-serif" }}>

      {/* ── Top Navbar ── */}
      <header className="sticky top-0 z-30 bg-[#363EE8] shadow-md" style={{ color: '#ffffff' }}>
        <div className="flex items-center justify-between px-6 py-3" style={{ color: '#ffffff' }}>
          <button type="button" className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/interviewer/dashboard')}>
            <img
              src={abyanLogo}
              alt="ABYAN HRIS"
              className="h-9 w-auto object-contain"
              style={{ mixBlendMode: 'screen' }}
            />
            <div className="flex flex-col leading-tight">
              <span className="text-base font-bold tracking-tight" style={{ color: '#ffffff' }}>ABYAN HRIS</span>
              <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.80)' }}>
                Interviewer Portal
              </span>
            </div>
          </button>

          <div className="flex items-center gap-4">
            {session?.name && (
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  Signed in as
                </span>
                <span className="text-sm font-semibold" style={{ color: '#ffffff' }}>{session.name}</span>
              </div>
            )}
            {onLogout && (
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition hover:bg-white/20"
                style={{ borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.12)', color: '#ffffff' }}
              >
                <LogOut size={15} />
                <span className="hidden sm:inline">Logout</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Logout Confirmation Dialog ── */}
      {logoutConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(5,13,101,0.55)' }}
          onClick={() => setLogoutConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}
          >
            <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
              <LogOut size={22} className="text-[#363EE8]" />
            </div>
            <h3 className="mt-3 text-lg font-bold text-[#050D65]">Confirm Logout</h3>
            <p className="mt-1 text-sm text-slate-500">
              Are you sure you want to log out of your Interviewer Portal session?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setLogoutConfirmOpen(false); onLogout?.(); }}
                className="flex-1 rounded-xl bg-[#363EE8] py-2.5 text-sm font-semibold text-white transition hover:bg-[#2830c5]"
              >
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}

    <div className="interviewer-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1>Interviewer Dashboard</h1>
          <p>View assigned job postings and manage applicant evaluations</p>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="search-filter-bar">
        <div className="search-wrapper">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Search by job title or office..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-wrapper">
          <Filter size={20} />
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Departments</option>
            {uniqueDepartments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="loading-state">
          <p>Loading job postings...</p>
        </div>
      ) : error ? (
        <div className="error-state">
          <p>❌ Error: {error}</p>
          <button onClick={() => void fetchJobsAndApplicants()}>Retry</button>
        </div>
      ) : (
        <>
          {/* Jobs Table */}
          <div className="jobs-table-wrapper">
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>JOB TITLE / POSITION</th>
                  <th>OFFICE / DEPARTMENT</th>
                  <th>NO. OF APPLICANTS</th>
                  <th>INTERVIEW DATE</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.length > 0 ? (
                  filteredJobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <span className="job-title">{job.title}</span>
                      </td>
                      <td>
                        <div className="office-info">
                          <span className="office-name">{job.office}</span>
                          <span className="department">{job.office}</span>
                        </div>
                      </td>
                      <td>
                        <span className="applicant-count">{job.applicant_count}</span>
                      </td>
                      <td>
                        <span className="interview-date">{formatDate(job.created_at)}</span>
                      </td>
                      <td>
                                        <button
                          type="button"
                          onClick={() => handleViewJobApplicants(job.title)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#363EE8] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#2830c5]"
                        >
                          View Applicants
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-message">
                      {searchTerm
                        ? 'No job postings found matching your search.'
                        : 'No active job postings available.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Stats Footer */}
          <div className="stats-footer">
            <div className="stat-box">
              <span className="stat-label">Total Job Postings</span>
              <span className="stat-value">{stats.totalJobs}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Total Applicants</span>
              <span className="stat-value">{stats.totalApplicants}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Upcoming Interviews</span>
              <span className="stat-value">{stats.upcomingInterviews}</span>
            </div>
          </div>

          {/* Delete Confirmation Dialog */}
          <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
            <div className="modal-header">
              <h2 className="modal-title">Confirm Delete</h2>
              <button 
                onClick={() => setDeleteConfirmOpen(false)}
                className="modal-close-btn"
                disabled={deleting}
              >
                <X size={24} />
              </button>
            </div>
            <div className="modal-content">
              <div className="delete-confirm-content">
                <div className="warning-icon">⚠️</div>
                <p className="delete-warning-text">
                  Are you sure you want to delete <strong>{applicantToDelete ? getFullName(applicantToDelete) : ''}</strong>?
                </p>
                <p className="delete-warning-subtext">
                  This action cannot be undone. All applicant data and attachments will be permanently removed.
                </p>
                <div className="delete-confirm-actions">
                  <button
                    className="cancel-delete-btn"
                    onClick={() => setDeleteConfirmOpen(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                  <button
                    className="confirm-delete-btn"
                    onClick={handleDeleteConfirm}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <>
                        <div className="spinner-small"></div>
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 size={18} />
                        <span>Delete Applicant</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </Dialog>
        </>
      )}
    </div>
    </div>
  );
}
