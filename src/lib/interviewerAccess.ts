import { supabase } from './supabase';

const INTERVIEWER_SESSION_KEY = 'cictrix_interviewer_session';

export type InterviewerSessionInfo = {
  email: string;
  name: string;
};

const normalizeText = (value: unknown) => String(value ?? '').trim().toLowerCase();

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

export const getStoredInterviewerSession = (): InterviewerSessionInfo | null => {
  try {
    const raw = localStorage.getItem(INTERVIEWER_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<InterviewerSessionInfo>;
    const email = String(parsed?.email ?? '').trim();
    if (!email) return null;

    return {
      email,
      name: String(parsed?.name ?? '').trim(),
    };
  } catch {
    return null;
  }
};

// Kept for callers that still import this name, but assignments live in
// Supabase only — there is no local cache to read.
export const getLocallyAssignedPositionsForEmail = (_email: string): string[] => [];

export const resolveAssignedPositionsForInterviewer = async (
  emailOverride?: string | null
): Promise<{ email: string; positions: string[] }> => {
  const session = getStoredInterviewerSession();
  const email = String(emailOverride ?? session?.email ?? '').trim();

  if (!email) {
    return { email: '', positions: [] };
  }

  const normalizedEmail = normalizeText(email);

  try {
    const { data, error } = await supabase.from('raters').select('email,assigned_positions');
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const positionsFromRows = rows
      .filter((row: any) => normalizeText(row?.email) === normalizedEmail)
      .flatMap((row: any) =>
        Array.isArray(row?.assigned_positions)
          ? row.assigned_positions.filter((value: unknown) => typeof value === 'string')
          : []
      );

    let positionsFromApplicants: string[] = [];
    try {
      const { data: assignedApplicants, error: applicantsError } = await supabase
        .from('applicants')
        .select('position,assigned_interviewer_email');
      
      if (applicantsError) throw applicantsError;

      positionsFromApplicants = (Array.isArray(assignedApplicants) ? assignedApplicants : [])
        .filter((row: any) => normalizeText(row?.assigned_interviewer_email) === normalizedEmail)
        .map((row: any) => row?.position)
        .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0);
    } catch (appErr) {
      console.warn('[interviewerAccess] Failed to fetch assigned positions from applicants:', appErr);
    }

    return { email, positions: uniqueStrings([...positionsFromRows, ...positionsFromApplicants]) };
  } catch (err) {
    console.warn('[interviewerAccess] Failed to fetch assigned_positions from Supabase:', err);
    return { email, positions: [] };
  }
};

export const isPositionAssignedToInterviewer = (position: string, assignedPositions: string[]): boolean => {
  const normalizedPosition = normalizeText(position);
  if (!normalizedPosition) return false;
  return assignedPositions.some((item) => normalizeText(item) === normalizedPosition);
};