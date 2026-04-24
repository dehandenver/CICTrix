import { useEffect, useState } from 'react';
import { QualifiedApplicantsSection } from './QualifiedApplicantsSection';
import { Sidebar } from './Sidebar';
import { ATTACHMENTS_BUCKET, supabase } from '../lib/supabase';
import { runSingleFlight } from '../lib/singleFlight';

export interface ApplicantRecord {
  id: string;
  full_name: string;
  email: string;
  contact_number: string;
  position: string;
  office: string;
  status: string;
  created_at: string;
  total_score: number | null;
}

export const QualifiedApplicantsRSPPage = () => {
  const [applicants, setApplicants] = useState<ApplicantRecord[]>([]);
  const [completedEvaluationIds, setCompletedEvaluationIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Primary: Supabase. Fallback: Python backend (which currently 500s but
        // remains as a path in case it's brought online). Both errors are logged
        // so silent failures surface.
        const fetchApplicants = async (): Promise<any[]> => {
          try {
            const { data, error } = await (supabase as any).from('applicants').select('*');
            if (error) {
              console.warn('[QualifiedApplicantsRSPPage] supabase applicants error:', error);
            } else if (Array.isArray(data)) {
              return data;
            }
          } catch (err) {
            console.warn('[QualifiedApplicantsRSPPage] supabase applicants threw:', err);
          }
          try {
            const res = await fetch('/api/applicants/?skip=0&limit=1000');
            if (!res.ok) {
              console.warn('[QualifiedApplicantsRSPPage] backend status', res.status);
              return [];
            }
            const ct = res.headers.get('content-type') ?? '';
            if (!ct.includes('application/json')) return [];
            const payload = await res.json();
            return Array.isArray(payload) ? payload : [];
          } catch (err) {
            console.warn('[QualifiedApplicantsRSPPage] backend threw:', err);
            return [];
          }
        };

        const [dbApplicants, evaluationsRes] = await Promise.all([
          fetchApplicants(),
          (supabase as any).from('evaluations').select('*'),
        ]);
        const dbEvaluations = (evaluationsRes as any)?.data || [];
        console.info('[QualifiedApplicantsRSPPage] loaded', { applicants: dbApplicants.length });

        const mappedApplicants: ApplicantRecord[] = dbApplicants.map((row: any) => {
          // Concatenate separate name fields into full_name
          const firstName = String(row?.first_name || '').trim();
          const middleName = String(row?.middle_name || '').trim();
          const lastName = String(row?.last_name || '').trim();
          const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

          return {
            id: String(row?.id || ''),
            full_name: fullName,
            email: String(row?.email || ''),
            contact_number: String(row?.contact_number || ''),
            position: String(row?.position || ''),
            office: String(row?.office || ''),
            status: String(row?.status || ''),
            created_at: String(row?.created_at || ''),
            total_score: row?.total_score ? Number(row.total_score) : null,
          };
        });

        setApplicants(mappedApplicants);

        // Track which evaluations are completed
        const completedIds = new Set<string>();
        dbEvaluations.forEach((evaluation: any) => {
          if (evaluation?.applicant_id && evaluation?.status === 'completed') {
            completedIds.add(String(evaluation.applicant_id));
          }
        });
        setCompletedEvaluationIds(completedIds);
      } catch (error) {
        console.error('Error loading qualified applicants:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    window.addEventListener('cictrix:applicants-updated', loadData);
    return () => {
      window.removeEventListener('cictrix:applicants-updated', loadData);
    };
  }, []);

  if (loading) {
    return (
      <div className="admin-layout">
        <Sidebar activeModule="RSP" userRole="rsp" />
        <main className="admin-content bg-slate-50" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <p>Loading qualified applicants...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />
      <main className="admin-content bg-slate-50">
        <QualifiedApplicantsSection applicants={applicants} completedEvaluationIds={completedEvaluationIds} />
      </main>
    </div>
  );
};
