import { Filter, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '../../components/Dialog';
import { POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import { isPositionAssignedToInterviewer, resolveAssignedPositionsForInterviewer } from '../../lib/interviewerAccess';
import { mockDatabase } from '../../lib/mockDatabase';
import { ensureRecruitmentSeedData, getAuthoritativeJobPostings } from '../../lib/recruitmentData';
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
  const { data } = await client.from('applicants').select('*');
  return data || [];
};

const fetchEvaluationsFromClient = async (client: any): Promise<any[]> => {
  const { data } = await client.from('evaluations').select('*');
  return data || [];
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const buildJobsFromPostings = (jobRows: RecruitmentJobPosting[], allApplicants: any[]) => {
  const activeJobs = (jobRows || []).filter((job) => String(job?.status || '').toLowerCase() === 'active');
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
  if (assignedPositions.length === 0) return [];
  return jobRows.filter((job) => isPositionAssignedToInterviewer(String(job?.title ?? ''), assignedPositions));
};

export function InterviewerDashboard({ session }: { session?: InterviewerSessionInfo | null }) {
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
  const [applicantToDelete, setApplicantToDelete] = useState<Applicant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [assignedPositions, setAssignedPositions] = useState<string[]>([]);

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
    window.addEventListener('focus', syncJobs);
    window.addEventListener('cictrix:job-postings-updated', syncJobs as EventListener);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('focus', syncJobs);
      window.removeEventListener('cictrix:job-postings-updated', syncJobs as EventListener);
      window.removeEventListener('storage', onStorage);
    };
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
      setAssignedPositions(positions);
      const canonicalJobRows = filterJobsByAssignments(getAuthoritativeJobPostings(), positions);

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
    <div className="interviewer-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1>Interviewer Dashboard</h1>
          <p>View assigned job postings and manage applicant evaluations</p>
          {session?.name && (
            <p className="mt-1 text-sm text-gray-600">Signed in as: {session.name}</p>
          )}
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
                          className="view-applicants-link"
                          onClick={() => handleViewJobApplicants(job.title)}
                        >
                          View Applicants →
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-message">
                      {assignedPositions.length === 0
                        ? 'No job positions are assigned to your interviewer account yet.'
                        : searchTerm
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
  );
}
