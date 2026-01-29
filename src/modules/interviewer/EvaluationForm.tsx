import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, isMockModeEnabled, ATTACHMENTS_BUCKET } from '../../lib/supabase';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Dialog } from '../../components/Dialog';

interface Applicant {
  id: string;
  name: string;
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

interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
}

interface EvaluationData {
  interviewer_name: string;
  technical_score: number;
  communication_score: number;
  overall_score: number;
  comments: string;
  recommendation: 'Highly Recommended' | 'Recommended' | 'Not Recommended' | '';
}

export function EvaluationForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const [evaluation, setEvaluation] = useState<EvaluationData>({
    interviewer_name: '',
    technical_score: 0,
    communication_score: 0,
    overall_score: 0,
    comments: '',
    recommendation: ''
  });

  useEffect(() => {
    if (id) {
      fetchApplicantData();
    }
  }, [id]);

  const fetchApplicantData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch applicant details
      const { data: applicantData, error: applicantError } = await supabase
        .from('applicants')
        .select('*')
        .eq('id', id)
        .single();

      if (applicantError) throw applicantError;
      if (!applicantData) throw new Error('Applicant not found');

      setApplicant(applicantData);

      // Fetch attachments
      const { data: attachmentsData, error: attachmentsError } = await supabase
        .from('applicant_attachments')
        .select('*')
        .eq('applicant_id', id);

      if (attachmentsError) throw attachmentsError;
      setAttachments(attachmentsData || []);

    } catch (err) {
      console.error('Error fetching applicant:', err);
      setError(err instanceof Error ? err.message : 'Failed to load applicant data');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof EvaluationData, value: string | number) => {
    setEvaluation(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = (): string | null => {
    if (!evaluation.interviewer_name.trim()) return 'Interviewer name is required';
    if (evaluation.technical_score < 1 || evaluation.technical_score > 5) return 'Technical score must be 1-5';
    if (evaluation.communication_score < 1 || evaluation.communication_score > 5) return 'Communication score must be 1-5';
    if (evaluation.overall_score < 1 || evaluation.overall_score > 5) return 'Overall score must be 1-5';
    if (!evaluation.recommendation) return 'Recommendation is required';
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

      // Insert evaluation
      const { error: evalError } = await supabase
        .from('evaluations')
        .insert({
          applicant_id: id,
          ...evaluation
        });

      if (evalError) throw evalError;

      // Update applicant status to "Reviewed"
      const { error: updateError } = await supabase
        .from('applicants')
        .update({ status: 'Reviewed' })
        .eq('id', id);

      if (updateError) throw updateError;

      setShowSuccess(true);
    } catch (err) {
      console.error('Error submitting evaluation:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit evaluation');
    } finally {
      setSubmitting(false);
    }
  };

  const getFileUrl = async (filePath: string) => {
    if (isMockModeEnabled) {
      return filePath; // In mock mode, filePath is the data URL
    }

    const { data } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    return data?.signedUrl || '';
  };

  const handleViewFile = async (attachment: Attachment) => {
    const url = await getFileUrl(attachment.file_path);
    if (url) {
      window.open(url, '_blank');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (loading) {
    return (
      <div className="evaluation-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading applicant data...</p>
        </div>
      </div>
    );
  }

  if (error && !applicant) {
    return (
      <div className="evaluation-container">
        <Card className="error-card">
          <p className="error-message">❌ {error}</p>
          <Button onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="evaluation-container">
      <div className="evaluation-header">
        <div>
          <h1 className="evaluation-title">Applicant Evaluation</h1>
          {isMockModeEnabled && (
            <div className="mock-mode-banner">
              ⚠️ Running in MOCK MODE - Using localStorage
            </div>
          )}
        </div>
        <Button onClick={() => navigate('/dashboard')} variant="secondary">
          Back to Dashboard
        </Button>
      </div>

      {applicant && (
        <div className="evaluation-content">
          {/* Applicant Information Card */}
          <Card className="applicant-info-card">
            <h2 className="section-title">Applicant Information</h2>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Name:</span>
                <span className="info-value">{applicant.name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Email:</span>
                <span className="info-value">{applicant.email}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Contact:</span>
                <span className="info-value">{applicant.contact_number}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Position:</span>
                <span className="info-value">{applicant.position}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Office:</span>
                <span className="info-value">{applicant.office}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Item Number:</span>
                <span className="info-value">{applicant.item_number}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Address:</span>
                <span className="info-value">{applicant.address}</span>
              </div>
              <div className="info-item">
                <span className="info-label">PWD:</span>
                <span className="info-value">{applicant.is_pwd ? 'Yes' : 'No'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Status:</span>
                <span className={`status-badge status-${applicant.status.toLowerCase()}`}>
                  {applicant.status}
                </span>
              </div>
            </div>
          </Card>

          {/* Attachments Card */}
          {attachments.length > 0 && (
            <Card className="attachments-card">
              <h2 className="section-title">Submitted Documents</h2>
              <div className="attachments-list">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="attachment-item">
                    <div className="attachment-info">
                      <span className="attachment-icon">📄</span>
                      <div className="attachment-details">
                        <span className="attachment-name">{attachment.file_name}</span>
                        <span className="attachment-meta">
                          {attachment.file_type} • {formatFileSize(attachment.file_size)}
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleViewFile(attachment)}
                      variant="secondary"
                      size="sm"
                    >
                      View
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Evaluation Form Card */}
          <Card className="evaluation-form-card">
            <h2 className="section-title">Evaluation Form</h2>
            <form onSubmit={handleSubmit}>
              <Input
                label="Interviewer Name"
                value={evaluation.interviewer_name}
                onChange={(e) => handleInputChange('interviewer_name', e.target.value)}
                required
                placeholder="Enter your name"
              />

              <div className="score-inputs">
                <Input
                  label="Technical Score (1-5)"
                  type="number"
                  min="1"
                  max="5"
                  value={evaluation.technical_score || ''}
                  onChange={(e) => handleInputChange('technical_score', parseInt(e.target.value) || 0)}
                  required
                />
                <Input
                  label="Communication Score (1-5)"
                  type="number"
                  min="1"
                  max="5"
                  value={evaluation.communication_score || ''}
                  onChange={(e) => handleInputChange('communication_score', parseInt(e.target.value) || 0)}
                  required
                />
                <Input
                  label="Overall Score (1-5)"
                  type="number"
                  min="1"
                  max="5"
                  value={evaluation.overall_score || ''}
                  onChange={(e) => handleInputChange('overall_score', parseInt(e.target.value) || 0)}
                  required
                />
              </div>

              <Select
                label="Recommendation"
                value={evaluation.recommendation}
                onChange={(e) => handleInputChange('recommendation', e.target.value)}
                options={[
                  { value: '', label: 'Select recommendation' },
                  { value: 'Highly Recommended', label: 'Highly Recommended' },
                  { value: 'Recommended', label: 'Recommended' },
                  { value: 'Not Recommended', label: 'Not Recommended' }
                ]}
                required
              />

              <div className="form-group">
                <label className="form-label">Comments</label>
                <textarea
                  className="form-textarea"
                  value={evaluation.comments}
                  onChange={(e) => handleInputChange('comments', e.target.value)}
                  rows={5}
                  placeholder="Additional comments about the applicant..."
                />
              </div>

              {error && (
                <div className="error-message">
                  ❌ {error}
                </div>
              )}

              <div className="form-actions">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Evaluation'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/dashboard')}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <Dialog
        isOpen={showSuccess}
        onClose={() => {
          setShowSuccess(false);
          navigate('/dashboard');
        }}
        title="Evaluation Submitted"
      >
        <p>✅ Evaluation has been successfully submitted!</p>
        <p>The applicant status has been updated to "Reviewed".</p>
        <Button onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </Button>
      </Dialog>
    </div>
  );
}
