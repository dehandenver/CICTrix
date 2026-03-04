import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import { mockDatabase } from '../../lib/mockDatabase';
import { isMockModeEnabled, supabase } from '../../lib/supabase';
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

const isDemoApplicant = (applicant: any): boolean => {
  const applicantId = String(applicant?.id || '').toLowerCase();
  const applicantEmail = String(applicant?.email || '').toLowerCase();
  return applicantId.startsWith('mock-') || applicantEmail.endsWith('@example.com');
};

const buildEvaluationStatusMap = (evaluations: any[] = []) => {
  const evaluationMap = new Map();

  evaluations.forEach((e: any) => {
    const hasOralScores = [
      e.communication_skills_score,
      e.confidence_score,
      e.comprehension_score,
      e.personality_score,
      e.job_knowledge_score,
      e.overall_impression_score
    ].every((value) => typeof value === 'number' && value > 0);

    const hasLegacyScores = [
      e.technical_score,
      e.communication_score,
      e.overall_score
    ].every((value) => typeof value === 'number' && value > 0);

    const isComplete = hasOralScores || hasLegacyScores;
    evaluationMap.set(e.applicant_id, isComplete ? 'Completed' : 'In Progress');
  });

  return evaluationMap;
};

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

const fetchApplicantsByPosition = async (client: any, position: string): Promise<any[]> => {
  if (typeof client?.insertApplicant === 'function') {
    const { data } = await client
      .from('applicants')
      .select('*')
      .order('created_at', { ascending: false })
      .eq('position', position);

    return data || [];
  }

  const { data } = await client
    .from('applicants')
    .select('*')
    .eq('position', position)
    .order('created_at', { ascending: false });

  return data || [];
};

const fetchEvaluations = async (client: any): Promise<any[]> => {
  const { data } = await client.from('evaluations').select('*');
  return data || [];
};

export function InterviewerApplicantsList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobTitle = searchParams.get('position') || 'N/A';
  
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [jobDetails, setJobDetails] = useState<JobPosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch when jobTitle is available
    if (jobTitle && jobTitle !== 'N/A') {
      fetchApplicantsAndJob();
    } else {
      setLoading(false);
    }
  }, [jobTitle]);

  const fetchApplicantsAndJob = async () => {
    try {
      setLoading(true);
      setError(null);

      let resolvedJobDetails: JobPosting = {
        title: jobTitle,
        office: POSITION_TO_DEPARTMENT_MAP[jobTitle] || 'N/A',
        department: POSITION_TO_DEPARTMENT_MAP[jobTitle] || 'N/A'
      };

      const mergedApplicantsById = new Map<string, any>();

      try {
        const supabaseApplicants = await fetchApplicantsByPosition(supabase, jobTitle);
        supabaseApplicants.forEach((item) => mergedApplicantsById.set(item.id, item));
      } catch (supabaseApplicantsErr) {
        console.warn('Unable to fetch Supabase applicants for position:', supabaseApplicantsErr);
      }

      if (!isMockModeEnabled) {
        try {
          const localApplicants = await fetchApplicantsByPosition(mockDatabase as any, jobTitle);
          localApplicants.forEach((item) => {
            if (!mergedApplicantsById.has(item.id)) {
              mergedApplicantsById.set(item.id, item);
            }
          });
        } catch (localApplicantsErr) {
          console.warn('Unable to fetch local applicants for position:', localApplicantsErr);
        }
      }

      let allEvaluations: any[] = [];
      try {
        allEvaluations = await fetchEvaluations(supabase);
      } catch (supabaseEvaluationsErr) {
        console.warn('Unable to fetch Supabase evaluations:', supabaseEvaluationsErr);
      }

      if (!isMockModeEnabled) {
        try {
          const localEvaluations = await fetchEvaluations(mockDatabase as any);
          const evalMap = new Map<string, any>();
          [...allEvaluations, ...localEvaluations].forEach((item) => evalMap.set(item.id, item));
          allEvaluations = Array.from(evalMap.values());
        } catch (localEvaluationsErr) {
          console.warn('Unable to fetch local evaluations:', localEvaluationsErr);
        }
      }

      const evaluationMap = buildEvaluationStatusMap(allEvaluations);
      const applicantsWithStatus = Array.from(mergedApplicantsById.values())
        .filter((applicant: any) => !isDemoApplicant(applicant))
        .map((applicant: any) => ({
          ...applicant,
          evaluation_status: evaluationMap.get(applicant.id) || 'Not Yet Rated'
        }))
        .sort(
          (a: Applicant, b: Applicant) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

      if (applicantsWithStatus.length > 0) {
        const office = applicantsWithStatus[0].office || POSITION_TO_DEPARTMENT_MAP[jobTitle] || 'N/A';
        resolvedJobDetails = {
          title: jobTitle,
          office,
          department: office
        };
      }

      setApplicants(applicantsWithStatus);
      setJobDetails(resolvedJobDetails);
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
          title="Back to Dashboard"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="header-content">
          <h1>{jobTitle || 'Job Position'}</h1>
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
        ) : applicants && applicants.length > 0 ? (
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
