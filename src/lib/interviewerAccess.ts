import { supabase } from './supabase';

const INTERVIEWER_SESSION_KEY = 'cictrix_interviewer_session';
const RATER_ASSIGNMENTS_KEY = 'cictrix_rater_assigned_positions';

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

const loadLocalAssignments = (): Record<string, string[]> => {
  try {
    const raw = localStorage.getItem(RATER_ASSIGNMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string[]>) : {};
  } catch {
    return {};
  }
};

export const getLocallyAssignedPositionsForEmail = (email: string): string[] => {
  if (!email) return [];
  const assignments = loadLocalAssignments();
  return uniqueStrings(assignments[normalizeText(email)] ?? []);
};

export const resolveAssignedPositionsForInterviewer = async (
  emailOverride?: string | null
): Promise<{ email: string; positions: string[] }> => {
  const session = getStoredInterviewerSession();
  const email = String(emailOverride ?? session?.email ?? '').trim();

  if (!email) {
    return { email: '', positions: [] };
  }

  const normalizedEmail = normalizeText(email);
  const localPositions = getLocallyAssignedPositionsForEmail(email);

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

    return {
      email,
      positions: uniqueStrings([...positionsFromRows, ...localPositions]),
    };
  } catch {
    return {
      email,
      positions: localPositions,
    };
  }
};

export const isPositionAssignedToInterviewer = (position: string, assignedPositions: string[]): boolean => {
  const normalizedPosition = normalizeText(position);
  if (!normalizedPosition) return false;
  return assignedPositions.some((item) => normalizeText(item) === normalizedPosition);
};