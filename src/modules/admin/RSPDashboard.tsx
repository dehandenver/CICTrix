import { useEffect, useState, useMemo } from 'react';
import { Users, Briefcase, UserCheck, Search, Plus, Edit2, Trash2 } from 'lucide-react';
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
}

interface Applicant {
  id: number;
  name: string;
  email: string;
  contact_number: string;
  position_applied: string;
  office: string;
  status: string;
}

interface Stats {
  totalApplicants: number;
  totalJobs: number;
  totalRaters: number;
  pendingReviews: number;
}

const DEPARTMENTS = ['HR', 'Finance', 'IT', 'Operations', 'Marketing', 'Sales', 'Legal', 'Admin'];
const SALARY_GRADES = ['SG-1', 'SG-2', 'SG-3', 'SG-4', 'SG-5', 'SG-6', 'SG-7', 'SG-8', 'SG-9', 'SG-10'];

export const RSPDashboard = () => {
  const [stats, setStats] = useState<Stats>({
    totalApplicants: 0,
    totalJobs: 0,
    totalRaters: 0,
    pendingReviews: 0
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showJobDialog, setShowJobDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
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
      const [applicantsRes, jobsRes, ratersRes, pendingRes] = await Promise.all([
        supabase.from('applicants').select('id', { count: 'exact', head: true }),
        supabase.from('jobs').select('id', { count: 'exact', head: true }),
        supabase.from('raters').select('id', { count: 'exact', head: true }),
        supabase.from('applicants').select('id', { count: 'exact', head: true }).eq('status', 'Pending')
      ]);

      setStats({
        totalApplicants: applicantsRes.count || 0,
        totalJobs: jobsRes.count || 0,
        totalRaters: ratersRes.count || 0,
        pendingReviews: pendingRes.count || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const fetchApplicants = async () => {
    try {
      const { data, error } = await supabase
        .from('applicants')
        .select('id, name, email, contact_number, position_applied, office, status')
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
    if (!searchTerm) return applicants;
    
    const term = searchTerm.toLowerCase();
    return applicants.filter(applicant =>
      applicant.name.toLowerCase().includes(term) ||
      applicant.email.toLowerCase().includes(term) ||
      applicant.position_applied.toLowerCase().includes(term) ||
      applicant.office.toLowerCase().includes(term) ||
      applicant.contact_number.includes(term)
    );
  }, [applicants, searchTerm]);

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" />
      
      <main className="admin-content">
        <div className="admin-header">
          <h1>RSP Dashboard</h1>
          <p className="admin-subtitle">Recruitment & Selection Portal</p>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <Users size={24} />
            </div>
            <div className="stat-content">
              <p className="stat-label">Total Applicants</p>
              <p className="stat-value">{stats.totalApplicants}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
              <Briefcase size={24} />
            </div>
            <div className="stat-content">
              <p className="stat-label">Active Jobs</p>
              <p className="stat-value">{stats.totalJobs}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
              <UserCheck size={24} />
            </div>
            <div className="stat-content">
              <p className="stat-label">Active Raters</p>
              <p className="stat-value">{stats.totalRaters}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' }}>
              <Search size={24} />
            </div>
            <div className="stat-content">
              <p className="stat-label">Pending Reviews</p>
              <p className="stat-value">{stats.pendingReviews}</p>
            </div>
          </div>
        </div>

        {/* Job Management Section */}
        <div className="admin-section">
          <div className="section-header">
            <h2>Job Postings</h2>
            <Button onClick={() => setShowJobDialog(true)}>
              <Plus size={16} />
              Create New Job
            </Button>
          </div>

          <div className="jobs-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Item No.</th>
                  <th>Title</th>
                  <th>Salary Grade</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id}>
                    <td>{job.item_number}</td>
                    <td>{job.title}</td>
                    <td>{job.salary_grade}</td>
                    <td>{job.department}</td>
                    <td>
                      <span className={`status-badge status-${job.status.toLowerCase().replace(' ', '-')}`}>
                        {job.status}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="action-btn"
                          onClick={() => setEditingJob(job)}
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="action-btn danger"
                          onClick={() => handleDeleteJob(job.id)}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-state">
                      No job postings yet. Create your first job posting above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Smart Search Section */}
        <div className="admin-section">
          <div className="section-header">
            <h2>Applicant Search</h2>
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" />
              <Input
                type="text"
                placeholder="Search by name, email, position, department, or contact..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          <div className="applicants-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Contact</th>
                  <th>Position</th>
                  <th>Department</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredApplicants.map(applicant => (
                  <tr key={applicant.id}>
                    <td>{applicant.name}</td>
                    <td>{applicant.email}</td>
                    <td>{applicant.contact_number}</td>
                    <td>{applicant.position_applied}</td>
                    <td>{applicant.office}</td>
                    <td>
                      <span className={`status-badge status-${applicant.status.toLowerCase()}`}>
                        {applicant.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredApplicants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-state">
                      {searchTerm ? 'No applicants found matching your search.' : 'No applicants yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create/Edit Job Dialog */}
        {(showJobDialog || editingJob) && (
          <Dialog
            isOpen={showJobDialog || !!editingJob}
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
                  placeholder="e.g., JOB-2024-001"
                />
              )}

              <Select
                label="Salary Grade"
                value={editingJob ? editingJob.salary_grade : newJob.salary_grade}
                onChange={(e) => editingJob
                  ? setEditingJob({ ...editingJob, salary_grade: e.target.value })
                  : setNewJob({ ...newJob, salary_grade: e.target.value })
                }
              >
                <option value="">Select Salary Grade</option>
                {SALARY_GRADES.map(grade => (
                  <option key={grade} value={grade}>{grade}</option>
                ))}
              </Select>

              <Select
                label="Department *"
                value={editingJob ? editingJob.department : newJob.department}
                onChange={(e) => editingJob
                  ? setEditingJob({ ...editingJob, department: e.target.value })
                  : setNewJob({ ...newJob, department: e.target.value })
                }
              >
                <option value="">Select Department</option>
                {DEPARTMENTS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </Select>

              <Select
                label="Status"
                value={editingJob ? editingJob.status : newJob.status}
                onChange={(e) => editingJob
                  ? setEditingJob({ ...editingJob, status: e.target.value as any })
                  : setNewJob({ ...newJob, status: e.target.value as any })
                }
              >
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
                <option value="On Hold">On Hold</option>
              </Select>

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
