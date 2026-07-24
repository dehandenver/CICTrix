import { supabase } from './supabase';
import { mockDatabase } from './mockDatabase';

export type EvaluationSnapshot = {
  applicantId: string;
  jobId: string | null;
  score: number | null;
  pcptRawScore: number | null;
  writtenExamRawScore: number | null;
  oralRawScore: number | null;
  completed: boolean;
  updatedAt: string;
  row: Record<string, any>;
};

export const deriveEvaluationSnapshot = (row: any): EvaluationSnapshot | null => {
  const rawId = String(row?.applicant_id ?? row?.applicantId ?? row?.id ?? '').trim();
  const rawEmail = String(row?.applicant_email ?? row?.email ?? '').trim().toLowerCase();
  const rawName = String(row?.applicant_name ?? row?.name ?? row?.full_name ?? '').trim().toLowerCase();
  const applicantId = rawId || (rawEmail ? `email:${rawEmail}` : rawName ? `name:${rawName}` : '');
  if (!applicantId) return null;

  const jobId = String(row?.job_posting_id ?? row?.job_id ?? '').trim() || null;
  const pcptRawScore = typeof row?.personality_score === 'number' ? row.personality_score : null;
  const writtenExamRawScore =
    typeof row?.written_exam_score === 'number'
      ? row.written_exam_score
      : typeof row?.score === 'number'
        ? row.score
        : typeof row?.technical_score === 'number'
          ? row.technical_score
          : null;
  const ORAL_CRITERIA_FIELDS = [
    'communication_skills_score',
    'confidence_score',
    'comprehension_score',
    'personality_score',
    'job_knowledge_score',
    'overall_impression_score',
  ] as const;

  const oralCriteriaScores = ORAL_CRITERIA_FIELDS
    .map((field) => row?.[field])
    .filter((value): value is number => typeof value === 'number' && value > 0);

  const oralRawScore = oralCriteriaScores.length > 0
    ? +(oralCriteriaScores.reduce((sum, value) => sum + value, 0) / oralCriteriaScores.length).toFixed(4)
    : typeof row?.overall_score === 'number'
      ? row.overall_score
      : null;

  const hasAnyScore =
    typeof pcptRawScore === 'number' ||
    typeof writtenExamRawScore === 'number' ||
    typeof oralRawScore === 'number' ||
    typeof row?.communication_skills_score === 'number' ||
    typeof row?.confidence_score === 'number' ||
    typeof row?.comprehension_score === 'number';

  return {
    applicantId,
    jobId,
    score: typeof row?.score === 'number' ? row.score : null,
    pcptRawScore,
    writtenExamRawScore,
    oralRawScore,
    completed: Boolean(
      row?.status === 'completed' ||
      row?.status === 'Completed' ||
      hasAnyScore ||
      String(row?.interview_notes ?? '').trim().length > 0 ||
      String(row?.recommendation ?? '').trim().length > 0
    ),
    updatedAt: String(row?.updated_at ?? row?.created_at ?? new Date().toISOString()),
    row: row ?? {},
  };
};

export const buildEvaluationSnapshotMap = (rows: any[] = []) => {
  const map = new Map<string, EvaluationSnapshot>();

  // 1. Process DB rows
  rows.forEach((row) => {
    const snapshot = deriveEvaluationSnapshot(row);
    if (!snapshot) return;

    const keys = new Set<string>([snapshot.applicantId]);
    if (snapshot.jobId) {
      keys.add(`job:${snapshot.jobId}`);
    }
    const email = String(row?.applicant_email ?? row?.email ?? '').trim().toLowerCase();
    if (email) {
      keys.add(`email:${email}`);
    }
    const name = String(row?.applicant_name ?? row?.name ?? row?.full_name ?? '').trim().toLowerCase();
    if (name) {
      keys.add(`name:${name}`);
    }

    keys.forEach((key) => {
      const current = map.get(key);
      if (!current || new Date(snapshot.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
        map.set(key, snapshot);
      }
    });
  });

  // 2. Process cictrix_evaluations from localStorage (mock/offline evaluations)
  try {
    const localEvalsRaw = typeof window !== 'undefined' ? localStorage.getItem('cictrix_evaluations') : null;
    const localEvals = localEvalsRaw ? JSON.parse(localEvalsRaw) : [];
    if (Array.isArray(localEvals)) {
      localEvals.forEach((row) => {
        const snapshot = deriveEvaluationSnapshot(row);
        if (!snapshot) return;
        const keys = new Set<string>([snapshot.applicantId]);
        const email = String(row?.applicant_email ?? row?.email ?? '').trim().toLowerCase();
        if (email) keys.add(`email:${email}`);
        const name = String(row?.applicant_name ?? row?.name ?? row?.full_name ?? '').trim().toLowerCase();
        if (name) keys.add(`name:${name}`);

        keys.forEach((key) => {
          const current = map.get(key);
          if (!current || new Date(snapshot.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
            map.set(key, snapshot);
          }
        });
      });
    }
  } catch {
    /* Ignore localStorage parse errors */
  }

  // 3. Process cictrix_interviewer_score_snapshot from localStorage
  try {
    const rawSnapshots = typeof window !== 'undefined' ? localStorage.getItem('cictrix_interviewer_score_snapshot') : null;
    const parsedSnapshots = rawSnapshots ? JSON.parse(rawSnapshots) : {};
    Object.entries(parsedSnapshots).forEach(([key, val]: [string, any]) => {
      if (!val || typeof val !== 'object') return;
      const synthSnapshot: EvaluationSnapshot = {
        applicantId: key.replace(/^(id|email|name):/, ''),
        jobId: null,
        score: null,
        pcptRawScore: typeof val.pcptAverage === 'number' ? val.pcptAverage : null,
        writtenExamRawScore: typeof val.writtenExamScore === 'number' ? val.writtenExamScore : null,
        oralRawScore: typeof val.oralAverage === 'number' ? val.oralAverage : null,
        completed: true,
        updatedAt: String(val.updatedAt ?? new Date().toISOString()),
        row: val,
      };
      const current = map.get(key);
      if (!current || new Date(synthSnapshot.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
        map.set(key, synthSnapshot);
      }
    });
  } catch {
    /* Ignore localStorage parse errors */
  }

  return map;
};

export const fetchLatestEvaluations = async (client: any = supabase): Promise<any[]> => {
  const { data, error } = await client
    .from('evaluations')
    .select('*')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

export const fetchLatestEvaluationForApplicant = async (applicantId: string, client: any = supabase) => {
  const { data, error } = await client
    .from('evaluations')
    .select('*')
    .eq('applicant_id', applicantId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? deriveEvaluationSnapshot(row) : null;
};

export const fetchLatestEvaluationForApplicantOrEmail = async (
  applicantId: string,
  applicantEmail?: string,
  client: any = supabase,
) => {
  const direct = await fetchLatestEvaluationForApplicant(applicantId, client);
  if (direct) return direct;

  const email = String(applicantEmail ?? '').trim().toLowerCase();
  if (!email) return null;

  try {
    const { data: applicantsData, error: applicantsError } = await client
      .from('applicants')
      .select('id,email')
      .eq('email', email);

    if (applicantsError) throw applicantsError;
    const aliasIds = Array.isArray(applicantsData)
      ? applicantsData
          .map((row: any) => String(row?.id ?? '').trim())
          .filter(Boolean)
      : [];

    if (aliasIds.length === 0) return null;

    const { data: evalRows, error: evalError } = await client
      .from('evaluations')
      .select('*')
      .in('applicant_id', aliasIds)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);

    if (evalError) throw evalError;

    const row = Array.isArray(evalRows) ? evalRows[0] : null;
    return row ? deriveEvaluationSnapshot(row) : null;
  } catch {
    return null;
  }
};

export const fetchLatestEvaluationForApplicantOrEmailAnySource = async (
  applicantId: string,
  applicantEmail?: string,
  preferredClient: any = supabase,
) => {
  const secondaryClient = preferredClient === supabase ? (mockDatabase as any) : supabase;

  const [primaryResult, secondaryResult] = await Promise.allSettled([
    fetchLatestEvaluationForApplicantOrEmail(applicantId, applicantEmail, preferredClient),
    fetchLatestEvaluationForApplicantOrEmail(applicantId, applicantEmail, secondaryClient),
  ]);

  const primary = primaryResult.status === 'fulfilled' ? primaryResult.value : null;
  const secondary = secondaryResult.status === 'fulfilled' ? secondaryResult.value : null;

  if (!primary) return secondary;
  if (!secondary) return primary;

  return new Date(primary.updatedAt).getTime() >= new Date(secondary.updatedAt).getTime()
    ? primary
    : secondary;
};

export const subscribeToEvaluationChanges = (
  onChange: () => void,
  applicantIds: string[] = [],
) => {
  const normalizedIds = Array.from(new Set(applicantIds.map((value) => String(value ?? '').trim()).filter(Boolean)));
  const channel = supabase.channel('evaluation-scores-realtime');

  channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'evaluations',
    },
    (payload) => {
      const applicantId = String((payload as any)?.new?.applicant_id ?? (payload as any)?.old?.applicant_id ?? '').trim();
      const matches = normalizedIds.length === 0 || normalizedIds.includes(applicantId);
      if (matches) {
        onChange();
      }
    }
  );

  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
};
