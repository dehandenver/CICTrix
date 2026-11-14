import { useEffect, useState } from 'react';
import { AdminHeader } from './AdminHeader';
import { ApplicantsTabBar } from './ApplicantsTabBar';
import { PendingAssignmentList } from './PendingAssignmentList';
import { QualifiedApplicantsSection } from './QualifiedApplicantsSection';
import { Sidebar } from './Sidebar';
import { ErrorBanner } from './ErrorBanner';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { supabase } from '../lib/supabase';
import { buildEvaluationSnapshotMap, subscribeToEvaluationChanges, type EvaluationSnapshot } from '../lib/evaluationScores';
import { mockDatabase } from '../lib/mockDatabase';
import { getPreferredDataSourceMode } from '../lib/dataSourceMode';
import { isMockModeEnabled } from '../lib/supabase';
import { mergeLocalSchedules } from '../lib/applicantSchedule';

export interface ApplicantRecord {
  id: string;
  full_name: string;
  email: string;
  contact_number: string;
  position: string;
  office: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
  total_score: number | null;
  application_type?: string | null;
  reference_no?: string | null;
  // Schedule + interviewer assignment (migration 007). Drives
  // /admin/rsp/qualified Pending Assignment → /admin/rsp/applicant-score.
  exam_date?: string | null;
  exam_time?: string | null;
  interview_date?: string | null;
  interview_time?: string | null;
  assigned_interviewer_email?: string | null;
  education_level?: string | null;
  years_of_experience?: number | null;
}

export type QualifiedRspMode = 'pending' | 'score';

export type InterviewerEvaluation = EvaluationSnapshot;

interface QualifiedApplicantsRSPPageProps {
  /** 'pending' = subtab 2 (assign schedule + interviewer).
   *  'score'   = subtab 3 (existing folder/scoring view). */
  mode?: QualifiedRspMode;
}

export const QualifiedApplicantsRSPPage = ({ mode = 'score' }: QualifiedApplicantsRSPPageProps = {}) => {
  const [applicants, setApplicants] = useState<ApplicantRecord[]>([]);
  const [completedEvaluationIds, setCompletedEvaluationIds] = useState<Set<string>>(new Set());
  const [evaluationsByApplicant, setEvaluationsByApplicant] = useState<Record<string, InterviewerEvaluation>>({});
  const [loading, setLoading] = useState(true);
  // A failed load, so the sections never render it as "no applicants".
  const [loadError, setLoadError] = useState<unknown>(null);

  // Live updates: the page and its sections reload on this event.
  useRealtimeRefresh({
    channel: 'rsp-qualified-applicants',
    tables: ['applicants'],
    onChange: () => { window.dispatchEvent(new CustomEvent('cictrix:applicants-updated')); },
  });

  useEffect(() => {
    const loadData = async () => {
      // Only the first load shows the loading screen. Refreshes (e.g. after a
      // batch schedule) keep the page mounted so its success alert survives.
      try {
        // Primary: Supabase. Fallback: Python backend (which currently 500s but
        // remains as a path in case it's brought online). Both errors are logged
        // so silent failures surface.
        // Throws when neither source answers, so a failed load is reported
        // instead of rendering as an empty list.
        const fetchApplicants = async (): Promise<any[]> => {
          let primaryError: unknown = null;
          try {
            const { data, error } = await (supabase as any).from('applicants').select('*');
            if (error) {
              console.warn('[QualifiedApplicantsRSPPage] supabase applicants error:', error);
              primaryError = error;
            } else if (Array.isArray(data)) {
              return data;
            }
          } catch (err) {
            console.warn('[QualifiedApplicantsRSPPage] supabase applicants threw:', err);
            primaryError = err;
          }
          try {
            const res = await fetch('/api/applicants/?skip=0&limit=1000');
            const ct = res.headers.get('content-type') ?? '';
            if (res.ok && ct.includes('application/json')) {
              const payload = await res.json();
              if (Array.isArray(payload)) return payload;
            }
            console.warn('[QualifiedApplicantsRSPPage] backend status', res.status);
          } catch (err) {
            console.warn('[QualifiedApplicantsRSPPage] backend threw:', err);
          }
          if (primaryError) throw primaryError;
          return [];
        };

        const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
        const primaryClient = preferredMode === 'local' ? (mockDatabase as any) : supabase;
        const secondaryClient = preferredMode === 'local' ? supabase : (mockDatabase as any);

        const [dbApplicants, evaluationsRes] = await Promise.all([
          fetchApplicants(),
          Promise.allSettled([
            (primaryClient as any).from('evaluations').select('*'),
            (secondaryClient as any).from('evaluations').select('*'),
          ]),
        ]);
        const [primaryEval, secondaryEval] = evaluationsRes;
        const primaryEvalRows = primaryEval.status === 'fulfilled' && !(primaryEval.value as any)?.error
          ? (((primaryEval.value as any)?.data || []) as any[])
          : [];
        const secondaryEvalRows = secondaryEval.status === 'fulfilled' && !(secondaryEval.value as any)?.error
          ? (((secondaryEval.value as any)?.data || []) as any[])
          : [];
        const dbEvaluations = [...primaryEvalRows, ...secondaryEvalRows];
        console.info('[QualifiedApplicantsRSPPage] loaded', {
          applicants: dbApplicants.length,
          evaluations: dbEvaluations.length,
          sampleEvaluationKeys: dbEvaluations[0] ? Object.keys(dbEvaluations[0]) : null,
          sampleEvaluation: dbEvaluations[0] ?? null,
        });

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
            updated_at: row?.updated_at ? String(row.updated_at) : null,
            total_score: row?.total_score ? Number(row.total_score) : null,
            application_type: row?.application_type ?? null,
            reference_no: row?.reference_no ?? null,
            exam_date: row?.exam_date ?? null,
            exam_time: row?.exam_time ?? null,
            interview_date: row?.interview_date ?? null,
            interview_time: row?.interview_time ?? null,
            assigned_interviewer_email: row?.assigned_interviewer_email ?? null,
            education_level: row?.education_level ?? row?.educational_attainment ?? row?.education ?? null,
            years_of_experience: row?.years_of_experience != null
              ? Number(row.years_of_experience)
              : row?.years_experience != null
              ? Number(row.years_experience)
              : null,
          };
        });

        // Fill any null schedule fields from the localStorage cache written by
        // saveApplicantAssignment — handles cases where Supabase columns are
        // not yet in the DB or the fetch races with a recent save.
        setApplicants(mergeLocalSchedules(mappedApplicants));

        const evaluationMap = buildEvaluationSnapshotMap(dbEvaluations);
        const completedIds = new Set<string>();
        const byApplicant: Record<string, InterviewerEvaluation> = {};

        evaluationMap.forEach((snapshot, key) => {
          if (snapshot.completed) {
            completedIds.add(snapshot.applicantId);
          }
          byApplicant[key] = snapshot;
          byApplicant[snapshot.applicantId] = snapshot;
        });
        setCompletedEvaluationIds(completedIds);
        setEvaluationsByApplicant(byApplicant);
        setLoadError(null);
      } catch (error) {
        console.error('Error loading qualified applicants:', error);
        setLoadError(error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const unsubscribeEvaluations = subscribeToEvaluationChanges(() => {
      void loadData();
    });
    window.addEventListener('cictrix:applicants-updated', loadData);
    return () => {
      unsubscribeEvaluations();
      window.removeEventListener('cictrix:applicants-updated', loadData);
    };
  }, []);

  return (
    <div className="rsp-ds min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
      <div className="admin-layout">
        <Sidebar activeModule="RSP" userRole="rsp" />
        <main className="admin-content bg-slate-50 !p-0">
          <ApplicantsTabBar
            title={mode === 'pending' ? 'Qualified Applicants' : 'Applicant Score'}
            subtitle={mode === 'pending' ? 'Applicants who passed evaluation and are eligible for further processing' : 'View and update applicant evaluation scores for original and promotional applicants'}
          />
          <div className="p-6">
            {loadError && (
              <ErrorBanner
                error={loadError}
                action="load the applicants"
                onRetry={() => window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'))}
                className="mb-4"
              />
            )}
            {loadError && applicants.length === 0 ? null : mode === 'pending' ? (
              <PendingAssignmentList
                loading={loading}
                applicants={applicants}
                completedEvaluationIds={completedEvaluationIds}
              />
            ) : (
              <QualifiedApplicantsSection
                loading={loading}
                applicants={applicants}
                completedEvaluationIds={completedEvaluationIds}
                evaluationsByApplicant={evaluationsByApplicant}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
