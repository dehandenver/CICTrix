import { useEffect, useState, useMemo } from 'react';
import { Users, Briefcase, UserCheck, Clock, Search, Plus, FileText, ChevronRight, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Sidebar } from '../../components/Sidebar';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Dialog } from '../../components/Dialog';
import { Select } from '../../components/Select';
import '../../styles/admin.css';

interface Job {
  id: number;
  title: string;
  item_number: string;
  salary_grade: string;
  department: string;
  description: string;
  status: 'Open' | 'Closed' | 'On Hold';
  created_at: string;
  applicant_count?: number;
}

interface Applicant {
  id: number;
  name: string;
  email: string;
  contact_number: string;
  position: string;
  office: string;
  status: string;
}

interface Stats {
  totalApplicants: number;
  totalJobs: number;
  shortlistedApplicants: number;
  positionsUnderReview: number;
}

const DEPARTMENTS = ['HR', 'Finance', 'IT', 'Operations', 'Marketing', 'Sales', 'Legal', 'Admin'];
const SALARY_GRADES = ['SG-1', 'SG-2', 'SG-3', 'SG-4', 'SG-5', 'SG-6', 'SG-7', 'SG-8', 'SG-9', 'SG-10'];

export const RSPDashboard = () => {
  const [stats, setStats] = useState<Stats>({
    totalApplicants: 0,
    totalJobs: 0,
    shortlistedApplicants: 0,
    positionsUnderReview: 0
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [officeFilter, setOfficeFilter] = useState('all');
  const [showJobDialog, setShowJobDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [currentJobPage, setCurrentJobPage] = useState(0);
  const [newJob, setNewJob] = useState({
    title: '',
    item_number: '',
    salary_grade: '',
    department: '',
    description: '',
    status: 'Open' as const
  });

  useEffect(() => {
    fetchStats();
    fetchJobs();
    fetchApplicants();
  }, []);

  const fetchStats = async () => {
    try {
      const [applicantsRes, jobsRes, shortlistedRes, reviewRes] = await Promise.all([
        supabase.from('applicants').select('id', { count: 'exact', head: true }),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'Open'),
        supabase.from('applicants').select('id', { count: 'exact', head: true }).eq('status', 'Reviewed'),
        supabase.from('applicants').select('id', { count: 'exact', head: true }).eq('status', 'Pending')
      ]);

      setStats({
        totalApplicants: applicantsRes.count || 0,
        totalJobs: jobsRes.count || 0,
        shortlistedApplicants: shortlistedRes.count || 0,
        positionsUnderReview: reviewRes.count || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false});

      if (jobsError) throw jobsError;

      // Get applicant count for each job
      const jobsWithCounts = await Promise.all(
        (jobsData || []).map(async (job: Job) => {
          const { count } = await supabase
            .from('applicants')
            .select('id', { count: 'exact', head: true })
            .eq('position', job.title);
          
          return { ...job, applicant_count: count || 0 };
        })
      );

      setJobs(jobsWithCounts);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const fetchApplicants = async () => {
    try {
      const { data, error } = await supabase
        .from('applicants')
        .select('id, name, email, contact_number, position, office, status')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApplicants(data || []);
    } catch (error) {
      console.error('Error fetching applicants:', error);
    }
  };

  const handleCreateJob = async () => {
    if (!newJob.title || !newJob.item_number || !newJob.department) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const { error } = await supabase
        .from('jobs')
        .insert([newJob]);

      if (error) throw error;

      setShowJobDialog(false);
      setNewJob({
        title: '',
        item_number: '',
        salary_grade: '',
        department: '',
        description: '',
        status: 'Open'
      });
      fetchJobs();
      fetchStats();
    } catch (error) {
      console.error('Error creating job:', error);
      alert('Failed to create job');
    }
  };

  const handleUpdateJob = async () => {
    if (!editingJob) return;

    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          title: editingJob.title,
          salary_grade: editingJob.salary_grade,
          department: editingJob.department,
          description: editingJob.description,
          status: editingJob.status
        })
        .eq('id', editingJob.id);

      if (error) throw error;

      setEditingJob(null);
      fetchJobs();
    } catch (error) {
      console.error('Error updating job:', error);
      alert('Failed to update job');
    }
  };

  const handleDeleteJob = async (id: number) => {
    if (!confirm('Are you sure you want to delete this job posting?')) return;

    try {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchJobs();
      fetchStats();
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete job');
    }
  };

  const filteredApplicants = useMemo(() => {
    let filtered = applicants;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(applicant =>
        applicant.name.toLowerCase().includes(term) ||
        applicant.email.toLowerCase().includes(term) ||
        applicant.position.toLowerCase().includes(term) ||
        applicant.office.toLowerCase().includes(term) ||
        applicant.contact_number.includes(term)
      );
    }

    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter(applicant => applicant.status.toLowerCase() === statusFilter);
    }

    if (officeFilter && officeFilter !== 'all') {
      filtered = filtered.filter(applicant => applicant.office === officeFilter);
    }

    return filtered;
  }, [applicants, searchTerm, statusFilter, officeFilter]);

  const uniqueOffices = useMemo(() => {
    return Array.from(new Set(applicants.map(a => a.office))).sort();
  }, [applicants]);

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" />
      
      <main className="admin-content">
        <div className="admin-header">
          <h1>Recruitment, Selection & Placement</h1>
          <p className="admin-subtitle">Manage job postings and review applicant submissions</p>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-content">
              <p className="stat-label">Total Job Openings</p>
              <p className="stat-value">{stats.totalJobs}</p>
            </div>
            <div className="stat-icon" style={{ background: '#E3F2FD' }}>
              <FileText size={24} color="#1976D2" />
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-content">
              <p className="stat-label">Total Applicants</p>
              <p className="stat-value">{stats.totalApplicants}</p>
            </div>
            <div className="stat-icon" style={{ background: '#E8F5E9' }}>
              <Users size={24} color="#388E3C" />
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-content">
              <p className="stat-label">Shortlisted Applicants</p>
              <p className="stat-value">{stats.shortlistedApplicants}</p>
            </div>
            <div className="stat-icon" style={{ background: '#F3E5F5' }}>
              <UserCheck size={24} color="#7B1FA2" />
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-content">
              <p className="stat-label">Positions Under Review</p>
              <p className="stat-value">{stats.positionsUnderReview}</p>
            </div>
            <div className="stat-icon" style={{ background: '#FFF3E0' }}>
              <Clock size={24} color="#F57C00" />
            </div>
          </div>
        </div>

        {/* Action Cards */}
        <div className="action-cards-grid">
          <div className="action-card primary">
            <div className="action-card-icon">
              <UserCheck size={24} />
            </div>
            <div className="action-card-content">
              <h3>Qualified Applicants</h3>
              <p>View all qualified candidates</p>
            </div>
            <ChevronRight size={20} />
          </div>

          <div className="action-card">
            <div className="action-card-icon">
              <FileText size={24} />
            </div>
            <div className="action-card-content">
              <h3>Job Postings</h3>
              <p>Manage postings</p>
            </div>
            <ChevronRight size={20} />
          </div>

          <div className="action-card">
            <div className="action-card-icon">
              <Users size={24} />
            </div>
            <div className="action-card-content">
              <h3>All Applicants</h3>
              <p>Review submissions</p>
            </div>
            <ChevronRight size={20} />
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="search-filter-section">
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <Input
              type="text"
              placeholder="Search by job title or item number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="on hold">On Hold</option>
          </select>

          <select
            value={officeFilter}
            onChange={(e) => setOfficeFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Offices</option>
            {uniqueOffices.map(office => (
              <option key={office} value={office}>{office}</option>
            ))}
          </select>
        </div>

        {/* Job Positions Display */}
        <div className="job-positions-section">
          <p className="showing-text">Showing {jobs.length} job positions</p>
          
          {jobs.length > 0 && (
            <>
              <div className="job-card-container">
                <button 
                  className="carousel-btn prev"
                  onClick={() => setCurrentJobPage(Math.max(0, currentJobPage - 1))}
                  disabled={currentJobPage === 0}
                >
                  <ChevronLeft size={24} />
                </button>

                <div className="job-card">
                  <div className="job-card-header">
                    <h3>{jobs[currentJobPage]?.title}</h3>
                    <span className={`job-status ${jobs[currentJobPage]?.status.toLowerCase().replace(' ', '-')}`}>
                      {jobs[currentJobPage]?.status}
                    </span>
                  </div>
                  
                  <p className="job-item-number">Item No. {jobs[currentJobPage]?.item_number}</p>
                  
                  <div className="job-details">
                    <div className="job-detail-item">
                      <Briefcase size={16} />
                      <span>{jobs[currentJobPage]?.department}</span>
                    </div>
                    <div className="job-detail-item">
                      <Clock size={16} />
                      <span>Posted {new Date(jobs[currentJobPage]?.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <div className="job-detail-item">
                      <Users size={16} />
                      <span>{jobs[currentJobPage]?.applicant_count || 0} Applicants</span>
                    </div>
                  </div>

                  <Button className="view-applicants-btn">
                    View Applicants <ChevronRight size={16} />
                  </Button>
                </div>

                <button 
                  className="carousel-btn next"
                  onClick={() => setCurrentJobPage(Math.min(jobs.length - 1, currentJobPage + 1))}
                  disabled={currentJobPage === jobs.length - 1}
                >
                  <ChevronRight size={24} />
                </button>
              </div>

              <div className="carousel-dots">
                {jobs.map((_, index) => (
                  <button
                    key={index}
                    className={`dot ${index === currentJobPage ? 'active' : ''}`}
                    onClick={() => setCurrentJobPage(index)}
                  />
                ))}
              </div>
            </>
          )}

          {jobs.length === 0 && (
            <div className="empty-state">
              <FileText size={48} />
              <p>No job postings yet. Create your first job posting.</p>
              <Button onClick={() => setShowJobDialog(true)}>
                <Plus size={16} />
                Create New Job
              </Button>
            </div>
          )}
        </div>
        {/* Create/Edit Job Dialog */}
        {(showJobDialog || editingJob) && (
          <Dialog
            open={showJobDialog || !!editingJob}
            onClose={() => {
              setShowJobDialog(false);
              setEditingJob(null);
            }}
            title={editingJob ? 'Edit Job Posting' : 'Create New Job'}
          >
            <div className="job-form">
              <Input
                label="Job Title *"
                value={editingJob ? editingJob.title : newJob.title}
                onChange={(e) => editingJob 
                  ? setEditingJob({ ...editingJob, title: e.target.value })
                  : setNewJob({ ...newJob, title: e.target.value })
                }
                placeholder="e.g., Senior Software Engineer"
              />

              {!editingJob && (
                <Input
                  label="Item Number *"
                  value={newJob.item_number}
                  onChange={(e) => setNewJob({ ...newJob, item_number: e.target.value })}
                  placeholder="e.g., ITMO2-2025-001"
                />
              )}

              <Select
                label="Salary Grade"
                value={editingJob ? editingJob.salary_grade : newJob.salary_grade}
                onChange={(e) => editingJob
                  ? setEditingJob({ ...editingJob, salary_grade: e.target.value })
                  : setNewJob({ ...newJob, salary_grade: e.target.value })
                }
                options={SALARY_GRADES.map(grade => ({ value: grade, label: grade }))}
              />

              <Select
                label="Department *"
                value={editingJob ? editingJob.department : newJob.department}
                onChange={(e) => editingJob
                  ? setEditingJob({ ...editingJob, department: e.target.value })
                  : setNewJob({ ...newJob, department: e.target.value })
                }
                options={DEPARTMENTS.map(dept => ({ value: dept, label: dept }))}
              />

              <Select
                label="Status"
                value={editingJob ? editingJob.status : newJob.status}
                onChange={(e) => editingJob
                  ? setEditingJob({ ...editingJob, status: e.target.value as any })
                  : setNewJob({ ...newJob, status: e.target.value as any })
                }
                options={[
                  { value: 'Open', label: 'Open' },
                  { value: 'Closed', label: 'Closed' },
                  { value: 'On Hold', label: 'On Hold' }
                ]}
              />

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={editingJob ? editingJob.description : newJob.description}
                  onChange={(e) => editingJob
                    ? setEditingJob({ ...editingJob, description: e.target.value })
                    : setNewJob({ ...newJob, description: e.target.value })
                  }
                  placeholder="Enter job description, requirements, and qualifications..."
                  rows={6}
                  className="admin-textarea"
                />
              </div>

              <div className="dialog-actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowJobDialog(false);
                    setEditingJob(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={editingJob ? handleUpdateJob : handleCreateJob}>
                  {editingJob ? 'Update Job' : 'Create Job'}
                </Button>
              </div>
            </div>
          </Dialog>
        )}
      </main>
    </div>
  );
};
