import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isMockModeEnabled } from '../../lib/supabase';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Select } from '../../components/Select';

interface Applicant {
  id: string;
  name: string;
  email: string;
  position: string;
  office: string;
  contact_number: string;
  status: 'Pending' | 'Reviewed' | 'Accepted' | 'Rejected';
  created_at: string;
}

export function InterviewerDashboard() {
  const navigate = useNavigate();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchApplicants();
  }, [statusFilter]);

  const fetchApplicants = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase.from('applicants').select('*').order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setApplicants(data || []);
    } catch (err) {
      console.error('Error fetching applicants:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch applicants');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    const baseClass = 'status-badge';
    switch (status) {
      case 'Pending':
        return `${baseClass} status-pending`;
      case 'Reviewed':
        return `${baseClass} status-reviewed`;
      case 'Accepted':
        return `${baseClass} status-accepted`;
      case 'Rejected':
        return `${baseClass} status-rejected`;
      default:
        return baseClass;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Interviewer Dashboard</h1>
          <p className="dashboard-subtitle">Review and evaluate applicants</p>
          {isMockModeEnabled && (
            <div className="mock-mode-banner">
              ⚠️ Running in MOCK MODE - Using localStorage
            </div>
          )}
        </div>
        <Button onClick={() => navigate('/')}>
          Back to Applicant Form
        </Button>
      </div>

      <div className="dashboard-filters">
        <Select
          label="Filter by Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All Applicants' },
            { value: 'Pending', label: 'Pending Review' },
            { value: 'Reviewed', label: 'Reviewed' },
            { value: 'Accepted', label: 'Accepted' },
            { value: 'Rejected', label: 'Rejected' }
          ]}
        />
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading applicants...</p>
        </div>
      ) : error ? (
        <Card className="error-card">
          <p className="error-message">❌ {error}</p>
          <Button onClick={fetchApplicants}>Retry</Button>
        </Card>
      ) : applicants.length === 0 ? (
        <Card className="empty-state">
          <p className="empty-message">
            {statusFilter === 'all' 
              ? 'No applicants found. Applications will appear here once submitted.'
              : `No applicants with status "${statusFilter}"`}
          </p>
        </Card>
      ) : (
        <div className="applicants-grid">
          {applicants.map((applicant) => (
            <Card key={applicant.id} className="applicant-card">
              <div className="applicant-header">
                <h3 className="applicant-name">{applicant.name}</h3>
                <span className={getStatusBadgeClass(applicant.status)}>
                  {applicant.status}
                </span>
              </div>
              
              <div className="applicant-details">
                <div className="detail-row">
                  <span className="detail-label">Position:</span>
                  <span className="detail-value">{applicant.position}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Office:</span>
                  <span className="detail-value">{applicant.office}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email:</span>
                  <span className="detail-value">{applicant.email}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Contact:</span>
                  <span className="detail-value">{applicant.contact_number}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Applied:</span>
                  <span className="detail-value">{formatDate(applicant.created_at)}</span>
                </div>
              </div>

              <div className="applicant-actions">
                <Button
                  onClick={() => navigate(`/evaluate/${applicant.id}`)}
                  className="btn-primary"
                >
                  {applicant.status === 'Pending' ? 'Evaluate' : 'View Evaluation'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
