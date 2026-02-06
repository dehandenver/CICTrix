import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import '../../styles/interviewer.css';

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

interface JobPosting {
  title: string;
  office: string;
  department: string;
}

const getFullName = (applicant: Applicant): string => {
  const parts = [applicant.first_name];
  if (applicant.middle_name) {
    parts.push(applicant.middle_name);
  }
  parts.push(applicant.last_name);
  return parts.join(' ');
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export function InterviewerApplicantsList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobTitle = searchParams.get('position') || '';
  
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [jobDetails, setJobDetails] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApplicantsAndJob();
  }, [jobTitle]);

  const fetchApplicantsAndJob = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch job posting to get details
      const { data: jobData, error: jobErr } = await supabase
        .from('job_postings')
        .select('title, office, department')
        .eq('title', jobTitle)
        .single();

      if (jobErr && jobErr.code !== 'PGRST116') {
        throw jobErr;
      }

      setJobDetails(jobData as JobPosting);

      // Fetch applicants for this job
      const { data: applicantsData, error: applicantsErr } = await supabase
        .from('applicants')
        .select('*')
        .eq('position', jobTitle)
        .order('created_at', { ascending: false });

      if (applicantsErr) throw applicantsErr;

      // Fetch evaluations
      const { data: evaluationsData, error: evaluationsErr } = await supabase
        .from('evaluations')
        .select('*');

      if (evaluationsErr) throw evaluationsErr;

      // Create evaluation status map
      const evaluationMap = new Map();
      evaluationsData?.forEach((e: any) => {
        const isComplete = e.technical_score && e.communication_score && e.overall_score && e.recommendation;
        evaluationMap.set(e.applicant_id, isComplete ? 'Completed' : 'In Progress');
      });

      // Add evaluation status to applicants
      const applicantsWithStatus = (applicantsData || []).map((applicant: any) => ({
        ...applicant,
        evaluation_status: evaluationMap.get(applicant.id) || 'Not Yet Rated'
      }));

      setApplicants(applicantsWithStatus);
    } catch (err: any) {
      console.error('Error fetching applicants:', err);
      setError(err?.message || 'Failed to load applicants');
    } finally {
      setLoading(false);
    }
  };

  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="interviewer-applicants-list-page">
      {/* Header */}
      <div className="applicants-page-header">
        <button
          className="back-button"
          onClick={() => navigate('/interviewer/dashboard')}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="header-content">
          <h1>{jobTitle}</h1>
          <div className="header-details">
            <span>{jobDetails?.office || 'N/A'}</span>
            <span className="divider">•</span>
            <span>{jobDetails?.department || 'N/A'}</span>
            <span className="divider">•</span>
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="applicants-page-container">
        <div className="applicants-page-title-section">
          <h2 className="applicants-page-title">Applicants List</h2>
          <p className="applicants-page-subtitle">{applicants.length} applicants for this position</p>
        </div>

        {loading ? (
          <div className="loading-state">
            <p>Loading applicants...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>❌ Error: {error}</p>
            <button onClick={fetchApplicantsAndJob}>Retry</button>
          </div>
        ) : applicants.length > 0 ? (
          <div className="applicants-table-container">
            <table className="applicants-table">
              <thead>
                <tr>
                  <th>APPLICANT NAME</th>
                  <th>CONTACT NUMBER</th>
                  <th>APPLICATION DATE</th>
                  <th>EVALUATION STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {applicants.map((applicant) => (
                  <tr key={applicant.id}>
                    <td>{getFullName(applicant)}</td>
                    <td>{applicant.contact_number}</td>
                    <td>{formatDate(applicant.created_at)}</td>
                    <td>
                      <span className={`evaluation-status ${
                        applicant.evaluation_status === 'Completed' ? 'completed' : 
                        applicant.evaluation_status === 'In Progress' ? 'in-progress' : 'pending'
                      }`}>
                        {applicant.evaluation_status}
                      </span>
                    </td>
                    <td>
                      {applicant.evaluation_status === 'Completed' ? (
                        <button className="action-btn evaluated" disabled>
                          Evaluated
                        </button>
                      ) : (
                        <button
                          className="action-btn evaluate"
                          onClick={() => navigate(`/interviewer/evaluate/${applicant.id}`)}
                        >
                          Evaluate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <p>No applicants found for this position</p>
          </div>
        )}
      </div>
    </div>
  );
}
