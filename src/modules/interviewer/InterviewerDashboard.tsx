import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Input } from '../../components/Input';
import '../../styles/interviewer.css';

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

interface Stats {
  totalJobs: number;
  totalApplicants: number;
  upcomingInterviews: number;
}

export function InterviewerDashboard() {
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

  useEffect(() => {
    fetchJobsAndApplicants();
  }, []);

  const fetchJobsAndApplicants = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all applicants count
      const { count: applicantCount } = await supabase
        .from('applicants')
        .select('id', { count: 'exact', head: true });

      // Get evaluations count
      const { count: evaluationCount } = await supabase
        .from('evaluations')
        .select('id', { count: 'exact', head: true });

      // Get jobs data
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'Open')
        .order('created_at', { ascending: false });

      if (jobsError) throw jobsError;

      // Get applicant counts for each job
      const jobsWithCounts = await Promise.all(
        (jobsData || []).map(async (job: any) => {
          const { count } = await supabase
            .from('applicants')
            .select('id', { count: 'exact', head: true })
            .eq('position', job.title);

          return {
            ...job,
            office: job.department,
            applicant_count: count || 0
          };
        })
      );

      setJobs(jobsWithCounts);
      setStats({
        totalJobs: jobsData?.length || 0,
        totalApplicants: applicantCount || 0,
        upcomingInterviews: evaluationCount || 0
      });
    } catch (err) {
      console.error('Error fetching data:', err);
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

  return (
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
          <button onClick={fetchJobsAndApplicants}>Retry</button>
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
                          onClick={() => navigate(`/dashboard?position=${encodeURIComponent(job.title)}`)}
                        >
                          View Applicants →
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-message">
                      {searchTerm ? 'No job postings found matching your search.' : 'No active job postings available.'}
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
        </>
      )}
    </div>
  );
}
