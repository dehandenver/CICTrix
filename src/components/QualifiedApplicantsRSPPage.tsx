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

        // Use backend API to bypass RLS on Supabase
        const [applicantsRes, evaluationsRes] = await Promise.all([
          fetch('/api/applicants/?skip=0&limit=1000').then(r => r.json()),
          supabase.from('evaluations').select('*'),
        ]);

        const dbApplicants = Array.isArray(applicantsRes) ? applicantsRes : [];
        const dbEvaluations = (evaluationsRes as any)?.data || [];

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
