import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Dialog } from '../../components/Dialog';
import { isPositionAssignedToInterviewer, resolveAssignedPositionsForInterviewer } from '../../lib/interviewerAccess';
import { mockDatabase } from '../../lib/mockDatabase';
import { getApplicants as getRecruitmentApplicants, saveApplicants as saveRecruitmentApplicants } from '../../lib/recruitmentData';
import { isMockModeEnabled, supabase } from '../../lib/supabase';

interface Applicant {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  position: string;
  office: string;
  contact_number: string;
  address: string;
  is_pwd: boolean;
  item_number: string;
  status: string;
  created_at: string;
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

interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
}

interface EvaluationData {
  interviewer_name: string;
  communication_skills_score: number;
  confidence_score: number;
  comprehension_score: number;
  personality_score: number;
  job_knowledge_score: number;
  overall_impression_score: number;
  communication_skills_remarks: string;
  confidence_remarks: string;
  comprehension_remarks: string;
  personality_remarks: string;
  job_knowledge_remarks: string;
  overall_impression_remarks: string;
  interview_notes: string;
  recommendation: 'Highly Recommended' | 'Recommended' | 'Not Recommended' | '';
}

type AppointmentType = 'original' | 'promotional';

const SCORE_SETUP_STORAGE_KEY = 'cictrix_rsp_score_setup';

const getStoredAppointmentType = (applicantId?: string): AppointmentType => {
  if (!applicantId) return 'original';
  try {
    const raw = localStorage.getItem(SCORE_SETUP_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, AppointmentType>) : {};
    return parsed[applicantId] === 'promotional' ? 'promotional' : 'original';
  } catch {
    return 'original';
  }
};

const isPromotionalSource = (applicantRow: Record<string, any> | null | undefined) => {
  const camelType = String(applicantRow?.applicationType ?? '').trim().toLowerCase();
  const snakeType = String(applicantRow?.application_type ?? '').trim().toLowerCase();
  const hasInternalLink = Boolean(applicantRow?.internalApplication?.employeeId || applicantRow?.employee_id);
  return camelType === 'promotion' || snakeType === 'promotion' || hasInternalLink;
};

const resolveInterviewerIdentity = (): { name: string; locked: boolean } => {
  try {
    const raw = localStorage.getItem('cictrix_interviewer_session');
    if (!raw) {
      return { name: '', locked: false };
    }

    const parsed = JSON.parse(raw) as { name?: string; email?: string };
    const fromName = String(parsed?.name ?? '').trim();
    if (fromName) {
      return { name: fromName, locked: true };
    }

    const email = String(parsed?.email ?? '').trim();
    if (email) {
      const localPart = email.split('@')[0] || email;
      return { name: localPart, locked: true };
    }

    return { name: '', locked: false };
  } catch {
    return { name: '', locked: false };
  }
};

export function EvaluationForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'pcpt' | 'oral'>('pcpt');
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('original');
  const [isInterviewerNameLocked, setIsInterviewerNameLocked] = useState(false);
  const [, setAssignedPositions] = useState<string[]>([]);
  
  const [evaluation, setEvaluation] = useState<EvaluationData>({
    interviewer_name: '',
    communication_skills_score: 0,
    confidence_score: 0,
    comprehension_score: 0,
    personality_score: 0,
    job_knowledge_score: 0,
    overall_impression_score: 0,
    communication_skills_remarks: '',
    confidence_remarks: '',
    comprehension_remarks: '',
    personality_remarks: '',
    job_knowledge_remarks: '',
    overall_impression_remarks: '',
    interview_notes: '',
    recommendation: ''
  });

  const [pcptScores, setPcptScores] = useState({
    appearance: 0,
    voice: 0,
    personality: 0,
    alertness: 0,
    confidence: 0,
    composure: 0
  });

  const handlePcptChange = (field: keyof typeof pcptScores, value: number) => {
    setPcptScores(prev => ({ ...prev, [field]: value }));
  };

  // Helper functions inside component to access state
  const renderStars = (score: number, onSelect: (value: number) => void) => {
    return (
      <span className="star-rating">
        {[1, 2, 3, 4, 5].map(i => (
          <span
            key={i}
            className={`star ${i <= score ? 'filled' : 'empty'}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(i);
              }
            }}
          >
            ★
          </span>
        ))}
        <span className="score-value">{score}</span>
      </span>
    );
  };

  const calculateTotalScore = () => {
    const scores = [
      evaluation.communication_skills_score,
      evaluation.confidence_score,
      evaluation.comprehension_score,
      evaluation.personality_score,
      evaluation.job_knowledge_score,
      evaluation.overall_impression_score
    ];
    return scores.reduce((a, b) => a + b, 0);
  };

  const calculatePercentage = () => {
    const total = calculateTotalScore();
    return ((total / 30) * 100).toFixed(2);
  };

  const getQualificationStatus = () => {
    const percentage = parseFloat(calculatePercentage());
    if (percentage >= 75) return 'Qualified';
    if (percentage >= 60) return 'Conditionally Qualified';
    return 'Not Qualified';
  };

  const persistDataSourceMode = (mode: 'local' | 'supabase') => {
    try {
      localStorage.setItem('cictrix_data_source_mode', mode);
    } catch {
      // Ignore localStorage write errors
    }
  };

  useEffect(() => {
    const { name, locked } = resolveInterviewerIdentity();
    if (name) {
      setEvaluation((prev) => ({ ...prev, interviewer_name: name }));
    }
    setIsInterviewerNameLocked(locked);
  }, []);

  useEffect(() => {
    if (id) {
      const type = getStoredAppointmentType(id);
      setAppointmentType(type);
      if (type === 'promotional') {
        setActiveTab('pcpt');
      }
      fetchApplicantData();
    }
  }, [id]);

  const hasOralEvaluation = appointmentType === 'original';

  const fetchApplicantData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { positions } = await resolveAssignedPositionsForInterviewer();
      setAssignedPositions(positions);

      // Fetch applicant details
      const { data: applicantData, error: applicantError } = await supabase
        .from('applicants')
        .select('*')
        .eq('id', id)
        .single();

      if (applicantError) throw applicantError;
      if (!applicantData) throw new Error('Applicant not found');
      if (!isPositionAssignedToInterviewer(String(applicantData.position ?? ''), positions)) {
        throw new Error(
          positions.length === 0
            ? 'No job positions are assigned to your interviewer account yet.'
            : 'You do not have access to evaluate this applicant.'
        );
      }

      setApplicant(applicantData);
      if (id && isPromotionalSource(applicantData)) {
        setAppointmentType('promotional');
        try {
          const raw = localStorage.getItem(SCORE_SETUP_STORAGE_KEY);
          const parsed = raw ? (JSON.parse(raw) as Record<string, AppointmentType>) : {};
          parsed[id] = 'promotional';
          localStorage.setItem(SCORE_SETUP_STORAGE_KEY, JSON.stringify(parsed));
        } catch {
          // Best effort persistence only.
        }
      }

      // Fetch attachments
      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from('applicant_attachments')
        .select('*')
        .eq('applicant_id', id);

      if (attachmentsError) throw attachmentsError;
      setAttachments(attachmentsData || []);

    } catch (err) {
      console.error('Error fetching applicant:', err);
      try {
        const { data: localApplicantData, error: localApplicantError } = await (mockDatabase as any)
          .from('applicants')
          .select('*')
          .eq('id', id)
          .single();

        if (localApplicantError || !localApplicantData) {
          throw localApplicantError || new Error('Applicant not found');
        }
        if (!isPositionAssignedToInterviewer(String(localApplicantData.position ?? ''), positions)) {
          throw new Error(
            positions.length === 0
              ? 'No job positions are assigned to your interviewer account yet.'
              : 'You do not have access to evaluate this applicant.'
          );
        }

        setApplicant(localApplicantData);
        if (id && isPromotionalSource(localApplicantData)) {
          setAppointmentType('promotional');
          try {
            const raw = localStorage.getItem(SCORE_SETUP_STORAGE_KEY);
            const parsed = raw ? (JSON.parse(raw) as Record<string, AppointmentType>) : {};
            parsed[id] = 'promotional';
            localStorage.setItem(SCORE_SETUP_STORAGE_KEY, JSON.stringify(parsed));
          } catch {
            // Best effort persistence only.
          }
        }

        const { data: localAttachmentsData } = await (mockDatabase as any)
          .from('applicant_attachments')
          .select('*')
          .eq('applicant_id', id);

        setAttachments(localAttachmentsData || []);
        setError(null);
      } catch {
        setError(err instanceof Error ? err.message : 'Failed to load applicant data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof EvaluationData, value: string | number) => {
    setEvaluation(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = (): string | null => {
    if (!evaluation.interviewer_name.trim()) return 'Interviewer name is required';
    if (hasOralEvaluation) {
      if (evaluation.communication_skills_score < 1 || evaluation.communication_skills_score > 5) return 'Communication Skills score must be 1-5';
      if (evaluation.confidence_score < 1 || evaluation.confidence_score > 5) return 'Confidence score must be 1-5';
      if (evaluation.comprehension_score < 1 || evaluation.comprehension_score > 5) return 'Comprehension score must be 1-5';
      if (evaluation.personality_score < 1 || evaluation.personality_score > 5) return 'Personality score must be 1-5';
      if (evaluation.job_knowledge_score < 1 || evaluation.job_knowledge_score > 5) return 'Job Knowledge score must be 1-5';
      if (evaluation.overall_impression_score < 1 || evaluation.overall_impression_score > 5) return 'Overall Impression score must be 1-5';
    }
    if (!evaluation.interview_notes.trim()) return 'Interview notes are required';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const insertData: any = {
        applicant_id: id || null,
        interviewer_name: evaluation.interviewer_name || null,
        communication_skills_score: evaluation.communication_skills_score > 0 ? evaluation.communication_skills_score : null,
        confidence_score: evaluation.confidence_score > 0 ? evaluation.confidence_score : null,
        comprehension_score: evaluation.comprehension_score > 0 ? evaluation.comprehension_score : null,
        personality_score: evaluation.personality_score > 0 ? evaluation.personality_score : null,
        job_knowledge_score: evaluation.job_knowledge_score > 0 ? evaluation.job_knowledge_score : null,
        overall_impression_score: evaluation.overall_impression_score > 0 ? evaluation.overall_impression_score : null,
        interview_notes: evaluation.interview_notes || null,
        recommendation: evaluation.recommendation || null
      };

      if (evaluation.communication_skills_remarks.trim()) {
        insertData.communication_skills_remarks = evaluation.communication_skills_remarks;
      }
      if (evaluation.confidence_remarks.trim()) {
        insertData.confidence_remarks = evaluation.confidence_remarks;
      }
      if (evaluation.comprehension_remarks.trim()) {
        insertData.comprehension_remarks = evaluation.comprehension_remarks;
      }
      if (evaluation.personality_remarks.trim()) {
        insertData.personality_remarks = evaluation.personality_remarks;
      }
      if (evaluation.job_knowledge_remarks.trim()) {
        insertData.job_knowledge_remarks = evaluation.job_knowledge_remarks;
      }
      if (evaluation.overall_impression_remarks.trim()) {
        insertData.overall_impression_remarks = evaluation.overall_impression_remarks;
      }

      const submitWithClient = async (client: any) => {
        const { error: evalError } = await client.from('evaluations').insert(insertData);
        if (evalError) throw evalError;
      };

      const updateApplicantStatus = async (client: any) => {
        try {
          await client.from('applicants').update({ status: 'Reviewed' }).eq('id', id);
        } catch {
          // Non-fatal: evaluation save succeeded regardless
        }
      };

      try {
        await submitWithClient(supabase);
        persistDataSourceMode('supabase');
      } catch (primaryErr) {
        if (isMockModeEnabled) {
          throw primaryErr;
        }
        await submitWithClient(mockDatabase as any);
        persistDataSourceMode('local');
      }

      const statusClient = isMockModeEnabled ? mockDatabase as any : supabase;
      await updateApplicantStatus(statusClient);

      // Keep recruitment fallback data in sync so InterviewerApplicantsList can show Reviewed/Evaluated.
      try {
        const recruitmentRows = getRecruitmentApplicants();
        const updatedRows = recruitmentRows.map((row: any) => {
          const idMatch = String(row?.id ?? '') === String(id ?? '');
          const emailMatch = String(row?.personalInfo?.email ?? '').toLowerCase() === String(applicant?.email ?? '').toLowerCase();
          if (!idMatch && !emailMatch) return row;
          return {
            ...row,
            status: 'Reviewed',
          };
        });
        saveRecruitmentApplicants(updatedRows);
      } catch {
        // Non-fatal: evaluation save already succeeded
      }

      setShowSuccess(true);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
      }

      setTimeout(() => {
        navigate('/interviewer/applicants');
      }, 1500);
    } catch (err) {
      console.error('Error submitting evaluation:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit evaluation';
      console.error('Final error message:', errorMessage);
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="evaluation-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading applicant data (ID: {id})...</p>
        </div>
      </div>
    );
  }

  if (error && !applicant) {
    return (
      <div className="evaluation-container">
        <Card className="error-card">
          <p className="error-message">❌ {error}</p>
          <Button onClick={() => navigate('/interviewer/dashboard')}>Back to Dashboard</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="evaluation-container">
      <div className="evaluation-header">
        <div>
          <h1 className="evaluation-title">Applicant Evaluation</h1>
          <p className="evaluation-subtitle">Evaluate the selected applicant</p>
          {isMockModeEnabled && (
            <div className="mock-mode-banner">
              ⚠️ Running in MOCK MODE - Using localStorage
            </div>
          )}
        </div>
        <Button onClick={() => navigate('/interviewer/dashboard')} variant="secondary">
          Back to Dashboard
        </Button>
      </div>

      {applicant && (
        <div className="evaluation-content">
          <div className="evaluation-tabs">
            <button
              type="button"
              className={`evaluation-tab ${activeTab === 'pcpt' ? 'active' : ''}`}
              onClick={() => setActiveTab('pcpt')}
            >
              PCPT Evaluation
            </button>
            {hasOralEvaluation && (
              <button
                type="button"
                className={`evaluation-tab ${activeTab === 'oral' ? 'active' : ''}`}
                onClick={() => setActiveTab('oral')}
              >
                Oral Interview Form
              </button>
            )}
          </div>

          {activeTab === 'pcpt' && (
            <div className="pcpt-tab-content">
              <div className="pcpt-form-header">
                <h1 className="pcpt-title">PHYSICAL CHARACTERISTICS AND PERSONALITY TRAITS</h1>
                <h2 className="pcpt-subtitle">(PCPT) ASSESSMENT FORM</h2>
                <hr className="pcpt-divider" />
              </div>

              <div className="pcpt-info-section">
                <div className="pcpt-info-row">
                  <div className="pcpt-info-group">
                    <label className="pcpt-label">Applicant Name:</label>
                    <span className="pcpt-value">{getFullName(applicant)}</span>
                  </div>
                  <div className="pcpt-info-group">
                    <label className="pcpt-label">Position Applied For:</label>
                    <span className="pcpt-value">{applicant.position}</span>
                  </div>
                </div>

                <div className="pcpt-info-row">
                  <div className="pcpt-info-group">
                    <label className="pcpt-label">Interviewer Name:</label>
                    <input
                      type="text"
                      className="pcpt-input"
                      value={evaluation.interviewer_name}
                      onChange={(e) => handleInputChange('interviewer_name', e.target.value)}
                      placeholder={isInterviewerNameLocked ? 'Auto-filled from your account' : 'Enter your name'}
                      readOnly={isInterviewerNameLocked}
                      required
                    />
                  </div>
                  <div className="pcpt-info-group">
                    <label className="pcpt-label">Date of Interview:</label>
                    <span className="pcpt-value">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                </div>

                <div className="pcpt-info-row">
                  <div className="pcpt-info-group full-width">
                    <label className="pcpt-label">Office / Division:</label>
                    <span className="pcpt-value">{applicant.office}</span>
                  </div>
                </div>

                <div className="pcpt-info-row">
                  <div className="pcpt-info-group full-width">
                    <label className="pcpt-label">Item Number:</label>
                    <span className="pcpt-value">{applicant.item_number || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="pcpt-table-wrapper">
                <table className="pcpt-table">
                  <thead>
                    <tr>
                      <th>TRAITS</th>
                      <th>5 – OUTSTANDING</th>
                      <th>4 – VERY SATISFACTORY</th>
                      <th>3 – SATISFACTORY</th>
                      <th>2 – FAIR</th>
                      <th>1 – POOR</th>
                      <th>SCORE</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>1. Appearance</strong></td>
                      <td>Neat, poised, well-groomed</td>
                      <td>Properly attired and presentable</td>
                      <td>Average grooming</td>
                      <td>Slightly untidy</td>
                      <td>Untidy and unkempt</td>
                      <td>
                        <select
                          className="pcpt-score-select"
                          value={pcptScores.appearance || '-'}
                          onChange={(e) => handlePcptChange('appearance', e.target.value === '-' ? 0 : parseInt(e.target.value, 10))}
                        >
                          <option value="-">-</option>
                          <option value="5">5</option>
                          <option value="4">4</option>
                          <option value="3">3</option>
                          <option value="2">2</option>
                          <option value="1">1</option>
                        </select>
                      </td>
                    </tr>

                    <tr>
                      <td><strong>2. Voice</strong></td>
                      <td>Clear, pleasant, confident</td>
                      <td>Audible and fluent</td>
                      <td>Understandable</td>
                      <td>Weak voice</td>
                      <td>Muffled / unclear</td>
                      <td>
                        <select
                          className="pcpt-score-select"
                          value={pcptScores.voice || '-'}
                          onChange={(e) => handlePcptChange('voice', e.target.value === '-' ? 0 : parseInt(e.target.value, 10))}
                        >
                          <option value="-">-</option>
                          <option value="5">5</option>
                          <option value="4">4</option>
                          <option value="3">3</option>
                          <option value="2">2</option>
                          <option value="1">1</option>
                        </select>
                      </td>
                    </tr>

                    <tr>
                      <td><strong>3. Personality</strong></td>
                      <td>Friendly, enthusiastic</td>
                      <td>Cooperative, approachable</td>
                      <td>Ordinary personality</td>
                      <td>Passive</td>
                      <td>Unpleasant or arrogant</td>
                      <td>
                        <select
                          className="pcpt-score-select"
                          value={pcptScores.personality || '-'}
                          onChange={(e) => handlePcptChange('personality', e.target.value === '-' ? 0 : parseInt(e.target.value, 10))}
                        >
                          <option value="-">-</option>
                          <option value="5">5</option>
                          <option value="4">4</option>
                          <option value="3">3</option>
                          <option value="2">2</option>
                          <option value="1">1</option>
                        </select>
                      </td>
                    </tr>

                    <tr>
                      <td><strong>4. Alertness</strong></td>
                      <td>Quick, responsive</td>
                      <td>Attentive, interested</td>
                      <td>Average alertness</td>
                      <td>Slow</td>
                      <td>Very slow to react</td>
                      <td>
                        <select
                          className="pcpt-score-select"
                          value={pcptScores.alertness || '-'}
                          onChange={(e) => handlePcptChange('alertness', e.target.value === '-' ? 0 : parseInt(e.target.value, 10))}
                        >
                          <option value="-">-</option>
                          <option value="5">5</option>
                          <option value="4">4</option>
                          <option value="3">3</option>
                          <option value="2">2</option>
                          <option value="1">1</option>
                        </select>
                      </td>
                    </tr>

                    <tr>
                      <td><strong>5. Confidence</strong></td>
                      <td>Self-assured, firm</td>
                      <td>Moderately confident</td>
                      <td>Average</td>
                      <td>Timid</td>
                      <td>Insecure / withdrawn</td>
                      <td>
                        <select
                          className="pcpt-score-select"
                          value={pcptScores.confidence || '-'}
                          onChange={(e) => handlePcptChange('confidence', e.target.value === '-' ? 0 : parseInt(e.target.value, 10))}
                        >
                          <option value="-">-</option>
                          <option value="5">5</option>
                          <option value="4">4</option>
                          <option value="3">3</option>
                          <option value="2">2</option>
                          <option value="1">1</option>
                        </select>
                      </td>
                    </tr>

                    <tr>
                      <td><strong>6. Composure</strong></td>
                      <td>Calm and consistent</td>
                      <td>Usually calm</td>
                      <td>Average composure</td>
                      <td>Easily distracted</td>
                      <td>Nervous</td>
                      <td>
                        <select
                          className="pcpt-score-select"
                          value={pcptScores.composure || '-'}
                          onChange={(e) => handlePcptChange('composure', e.target.value === '-' ? 0 : parseInt(e.target.value, 10))}
                        >
                          <option value="-">-</option>
                          <option value="5">5</option>
                          <option value="4">4</option>
                          <option value="3">3</option>
                          <option value="2">2</option>
                          <option value="1">1</option>
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {!hasOralEvaluation && (
                <form onSubmit={handleSubmit}>
                  <div className="rating-scale-box" style={{ marginTop: '1rem' }}>
                    <strong>Promotional Application:</strong>
                    <span>Oral Interview Evaluation is not required for promotional applicants.</span>
                  </div>

                  <div className="form-group interview-notes-group">
                    <label className="form-label">INTERVIEW NOTES:</label>
                    <textarea
                      className="form-textarea interview-notes-textarea"
                      value={evaluation.interview_notes}
                      onChange={(e) => handleInputChange('interview_notes', e.target.value)}
                      rows={6}
                      placeholder="Summarize key points, observations, and overall impressions from the interview..."
                      required
                    />
                  </div>

                  {error && (
                    <div className="error-message">
                      ❌ {error}
                    </div>
                  )}

                  <div className="oral-form-actions">
                    <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                      Save Draft
                    </Button>
                    <Button type="submit" disabled={submitting} className="submit-btn">
                      {submitting ? 'Submitting...' : 'Submit Final Evaluation'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {hasOralEvaluation && activeTab === 'oral' && (
            <>
              <div className="oral-form-header">
                <h1 className="oral-title">ORAL INTERVIEW ASSESSMENT FORM</h1>
                <p className="oral-subtitle">Evaluate the applicant's communication ability, confidence, comprehension, and other oral interview traits</p>
                <hr className="oral-divider" />
              </div>

              <div className="oral-info-section">
                <div className="oral-info-row">
                  <div className="oral-info-group">
                    <label className="oral-label">Applicant Name:</label>
                    <span className="oral-value">{getFullName(applicant)}</span>
                  </div>
                  <div className="oral-info-group">
                    <label className="oral-label">Position Applied For:</label>
                    <span className="oral-value">{applicant.position}</span>
                  </div>
                </div>

                <div className="oral-info-row">
                  <div className="oral-info-group">
                    <label className="oral-label">Interview Schedule:</label>
                    <span className="oral-value">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                  <div className="oral-info-group">
                    <label className="oral-label">Interviewer Name:</label>
                    <input
                      type="text"
                      className="oral-input"
                      value={evaluation.interviewer_name}
                      onChange={(e) => handleInputChange('interviewer_name', e.target.value)}
                      placeholder={isInterviewerNameLocked ? 'Auto-filled from your account' : 'Enter your name'}
                      readOnly={isInterviewerNameLocked}
                      required
                    />
                  </div>
                </div>

                <div className="oral-info-row">
                  <div className="oral-info-group full-width">
                    <label className="oral-label">Department:</label>
                    <span className="oral-value">{applicant.office}</span>
                  </div>
                </div>

                <div className="oral-info-row">
                  <div className="oral-info-group full-width">
                    <label className="oral-label">Item Number:</label>
                    <span className="oral-value">{applicant.item_number || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="rating-scale-box">
                <strong>Rating Scale:</strong>
                <span>5 – Excellent</span>
                <span>4 – Very Good</span>
                <span>3 – Good</span>
                <span>2 – Fair</span>
                <span>1 – Poor</span>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="oral-table-wrapper">
                  <table className="oral-table">
                    <thead>
                      <tr>
                        <th>CRITERIA</th>
                        <th>DESCRIPTION</th>
                        <th>RATING (1-5)</th>
                        <th>REMARKS</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Communication Skills</strong></td>
                        <td>Clarity and organization of thoughts</td>
                        <td className="rating-cell">
                          {renderStars(evaluation.communication_skills_score, (value) =>
                            handleInputChange('communication_skills_score', value)
                          )}
                          <select
                            className="hidden-select"
                            value={evaluation.communication_skills_score || 0}
                            onChange={(e) => handleInputChange('communication_skills_score', parseInt(e.target.value, 10))}
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                          </select>
                        </td>
                        <td>
                          <textarea
                            className="remarks-textarea"
                            value={evaluation.communication_skills_remarks}
                            onChange={(e) => handleInputChange('communication_skills_remarks', e.target.value)}
                            placeholder="Optional remarks..."
                          />
                        </td>
                      </tr>

                      <tr>
                        <td><strong>Confidence</strong></td>
                        <td>Composure, posture, and assurance during interview</td>
                        <td className="rating-cell">
                          {renderStars(evaluation.confidence_score, (value) =>
                            handleInputChange('confidence_score', value)
                          )}
                          <select
                            className="hidden-select"
                            value={evaluation.confidence_score || 0}
                            onChange={(e) => handleInputChange('confidence_score', parseInt(e.target.value, 10))}
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                          </select>
                        </td>
                        <td>
                          <textarea
                            className="remarks-textarea"
                            value={evaluation.confidence_remarks}
                            onChange={(e) => handleInputChange('confidence_remarks', e.target.value)}
                            placeholder="Optional remarks..."
                          />
                        </td>
                      </tr>

                      <tr>
                        <td><strong>Comprehension</strong></td>
                        <td>Understanding of questions and ability to respond logically</td>
                        <td className="rating-cell">
                          {renderStars(evaluation.comprehension_score, (value) =>
                            handleInputChange('comprehension_score', value)
                          )}
                          <select
                            className="hidden-select"
                            value={evaluation.comprehension_score || 0}
                            onChange={(e) => handleInputChange('comprehension_score', parseInt(e.target.value, 10))}
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                          </select>
                        </td>
                        <td>
                          <textarea
                            className="remarks-textarea"
                            value={evaluation.comprehension_remarks}
                            onChange={(e) => handleInputChange('comprehension_remarks', e.target.value)}
                            placeholder="Optional remarks..."
                          />
                        </td>
                      </tr>

                      <tr>
                        <td><strong>Personality</strong></td>
                        <td>Professional attitude, enthusiasm, and behavior</td>
                        <td className="rating-cell">
                          {renderStars(evaluation.personality_score, (value) =>
                            handleInputChange('personality_score', value)
                          )}
                          <select
                            className="hidden-select"
                            value={evaluation.personality_score || 0}
                            onChange={(e) => handleInputChange('personality_score', parseInt(e.target.value, 10))}
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                          </select>
                        </td>
                        <td>
                          <textarea
                            className="remarks-textarea"
                            value={evaluation.personality_remarks}
                            onChange={(e) => handleInputChange('personality_remarks', e.target.value)}
                            placeholder="Optional remarks..."
                          />
                        </td>
                      </tr>

                      <tr>
                        <td><strong>Job Knowledge</strong></td>
                        <td>Awareness of role responsibilities and technical background</td>
                        <td className="rating-cell">
                          {renderStars(evaluation.job_knowledge_score, (value) =>
                            handleInputChange('job_knowledge_score', value)
                          )}
                          <select
                            className="hidden-select"
                            value={evaluation.job_knowledge_score || 0}
                            onChange={(e) => handleInputChange('job_knowledge_score', parseInt(e.target.value, 10))}
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                          </select>
                        </td>
                        <td>
                          <textarea
                            className="remarks-textarea"
                            value={evaluation.job_knowledge_remarks}
                            onChange={(e) => handleInputChange('job_knowledge_remarks', e.target.value)}
                            placeholder="Optional remarks..."
                          />
                        </td>
                      </tr>

                      <tr>
                        <td><strong>Overall Impression</strong></td>
                        <td>General suitability for the position</td>
                        <td className="rating-cell">
                          {renderStars(evaluation.overall_impression_score, (value) =>
                            handleInputChange('overall_impression_score', value)
                          )}
                          <select
                            className="hidden-select"
                            value={evaluation.overall_impression_score || 0}
                            onChange={(e) => handleInputChange('overall_impression_score', parseInt(e.target.value, 10))}
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                          </select>
                        </td>
                        <td>
                          <textarea
                            className="remarks-textarea"
                            value={evaluation.overall_impression_remarks}
                            onChange={(e) => handleInputChange('overall_impression_remarks', e.target.value)}
                            placeholder="Optional remarks..."
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="score-summary-box">
                  <div className="score-item">
                    <span className="score-label">TOTAL SCORE</span>
                    <span className="score-display">{calculateTotalScore()} / 30</span>
                  </div>
                  <div className="score-item">
                    <span className="score-label">EQUIVALENT PERCENTAGE</span>
                    <span className="score-display">{calculatePercentage()}%</span>
                  </div>
                  <div className="score-item">
                    <span className="score-label">QUALIFICATION STATUS</span>
                    <span className={`qualification-status ${getQualificationStatus().toLowerCase().replace(/\s+/g, '-')}`}>
                      {getQualificationStatus()}
                    </span>
                  </div>
                </div>

                <div className="form-group interview-notes-group">
                  <label className="form-label">INTERVIEW NOTES:</label>
                  <textarea
                    className="form-textarea interview-notes-textarea"
                    value={evaluation.interview_notes}
                    onChange={(e) => handleInputChange('interview_notes', e.target.value)}
                    rows={6}
                    placeholder="Summarize key points, observations, and overall impressions from the interview..."
                    required
                  />
                </div>

                {error && (
                  <div className="error-message">
                    ❌ {error}
                  </div>
                )}

                <div className="oral-form-actions">
                  <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                    Save Draft
                  </Button>
                  <Button type="submit" disabled={submitting} className="submit-btn">
                    {submitting ? 'Submitting...' : 'Submit Final Evaluation'}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      <Dialog
        open={showSuccess}
        onClose={() => {
          setShowSuccess(false);
          navigate('/interviewer/applicants');
        }}
        title="Evaluation Submitted"
      >
        <p>✅ Evaluation has been successfully submitted!</p>
        <p>The applicant status has been updated to "Reviewed".</p>
        <Button onClick={() => navigate('/interviewer/applicants')}>
          Back to Applicants List
        </Button>
      </Dialog>
    </div>
  );
}
