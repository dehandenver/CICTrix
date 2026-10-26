// Pure data logic for the Interviewer Dashboard: candidate rows, KPI sets,
// status filtering and date/time formatting. No React in here.

import { getApplicantType, type ApplicantEvalType } from '../../lib/interviewerEvalNavigation';

export type KpiKey = 'pending' | 'today' | 'completed';

export type StatusFilter = 'all' | 'to_evaluate' | 'due_today' | 'completed' | 'upcoming' | 'past';

export const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'to_evaluate', label: 'To evaluate' },
  { value: 'due_today', label: 'Due today' },
  { value: 'completed', label: 'Completed' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];

/** One applicant as the dashboard sees them, joined with their evaluation. */
export interface CandidateRow {
  id: string;
  name: string;
  position: string;
  department: string;
  titleKey: string;
  interviewDate: string;
  interviewTime: string;
  /** Any submitted evaluation, from any interviewer. */
  evaluated: boolean;
  /** Submitted by the signed-in interviewer. */
  evaluatedByMe: boolean;
  evaluatedAt: string;
  recommendation: string;
  rating: number | null;
  appType: ApplicantEvalType;
}

export const normalizeText = (value: string) => value.trim().toLowerCase();

// ── Dates ────────────────────────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0');
export const toLocalKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Date-only strings ("2026-09-28") are calendar dates, not UTC instants, so
// they are parsed as local dates to avoid shifting a day in the viewer's zone.
export const parseDate = (raw: unknown): Date | null => {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const dateKey = (raw: unknown) => {
  const d = parseDate(raw);
  return d ? toLocalKey(d) : '';
};

// Design Identity §9.5: dates render as "MMM DD, YYYY".
export const formatDate = (raw: string) => {
  const d = parseDate(raw);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';
};

/** "14:30" / "14:30:00" / "2:30 PM" → "2:30 PM"; empty when unparseable. */
export const formatTime = (raw: string) => {
  const value = String(raw ?? '').trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  if (/[ap]m/i.test(value)) return value.toUpperCase();
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${match[2]} ${suffix}`;
};

export type DateStatus = 'today' | 'upcoming' | 'past';

export const getDateStatus = (raw: string, todayKey: string): DateStatus | null => {
  const key = dateKey(raw);
  if (!key) return null;
  if (key === todayKey) return 'today';
  return key > todayKey ? 'upcoming' : 'past';
};

// ── Rows ─────────────────────────────────────────────────────────────────
const applicantDisplayName = (applicant: any): string => {
  const name = [applicant?.first_name, applicant?.last_name]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return name || String(applicant?.full_name ?? applicant?.email ?? 'Unnamed applicant');
};

const evaluationTimestamp = (evaluation: any) =>
  String(evaluation?.created_at ?? evaluation?.submitted_at ?? evaluation?.updated_at ?? '').trim();

/**
 * The name EvaluationForm stamps on `interviewer_name`: the session name, or
 * the email's local part when there is no name (see resolveInterviewerIdentity).
 */
export const resolveInterviewerStamp = (session?: { name?: string; email?: string } | null) => {
  const name = String(session?.name ?? '').trim();
  if (name) return normalizeText(name);
  const email = String(session?.email ?? '').trim();
  return email ? normalizeText(email.split('@')[0] || email) : '';
};

export const buildCandidateRows = (
  applicants: any[],
  evaluations: any[],
  officeByTitle: Map<string, string>,
  interviewerStamp: string,
): CandidateRow[] => {
  // Latest evaluation per applicant (any interviewer) and the latest one by me.
  const latest = new Map<string, any>();
  const latestMine = new Map<string, any>();
  const newer = (a: any, b: any | undefined) => !b || evaluationTimestamp(a) > evaluationTimestamp(b);
  evaluations.forEach((evaluation) => {
    const applicantId = String(evaluation?.applicant_id ?? '').trim();
    if (!applicantId) return;
    if (newer(evaluation, latest.get(applicantId))) latest.set(applicantId, evaluation);
    const mine = interviewerStamp && normalizeText(String(evaluation?.interviewer_name ?? '')) === interviewerStamp;
    if (mine && newer(evaluation, latestMine.get(applicantId))) latestMine.set(applicantId, evaluation);
  });

  return applicants.map((applicant) => {
    const id = String(applicant?.id ?? '').trim();
    const position = String(applicant?.position || '').trim();
    const titleKey = normalizeText(position);
    const shown = latestMine.get(id) ?? latest.get(id);
    const rating = Number(shown?.overall_impression_score);
    return {
      id,
      name: applicantDisplayName(applicant),
      position,
      department: officeByTitle.get(titleKey) || String(applicant?.office || '').trim() || 'Unassigned',
      titleKey,
      interviewDate: String(applicant?.interview_date ?? '').trim(),
      interviewTime: String(applicant?.interview_time ?? '').trim(),
      evaluated: latest.has(id),
      evaluatedByMe: latestMine.has(id),
      evaluatedAt: shown ? evaluationTimestamp(shown) : '',
      recommendation: String(shown?.recommendation ?? '').trim(),
      rating: Number.isFinite(rating) && rating > 0 ? rating : null,
      appType: getApplicantType(applicant ?? {}),
    };
  });
};

export const matchesStatus = (row: CandidateRow, status: StatusFilter, todayKey: string) => {
  const key = dateKey(row.interviewDate);
  switch (status) {
    case 'to_evaluate': return !row.evaluated;
    case 'due_today': return key === todayKey;
    case 'completed': return row.evaluated;
    case 'upcoming': return Boolean(key) && key > todayKey;
    case 'past': return Boolean(key) && key < todayKey;
    default: return true;
  }
};

export const matchesSearch = (row: CandidateRow, query: string) =>
  !query ||
  row.name.toLowerCase().includes(query) ||
  row.position.toLowerCase().includes(query) ||
  row.department.toLowerCase().includes(query);

/**
 *   pending   = no submitted evaluation from anyone (soonest interview first)
 *   today     = interview date is today (earliest time first)
 *   completed = evaluated by me this calendar month (most recent first)
 */
export const buildKpiSets = (rows: CandidateRow[], todayKey: string): Record<KpiKey, CandidateRow[]> => {
  const monthKey = todayKey.slice(0, 7);
  const pending = rows
    .filter((row) => !row.evaluated)
    .sort((a, b) => (dateKey(a.interviewDate) || '9999').localeCompare(dateKey(b.interviewDate) || '9999'));
  const today = rows
    .filter((row) => dateKey(row.interviewDate) === todayKey)
    .sort((a, b) => (a.interviewTime || '99').localeCompare(b.interviewTime || '99') || a.name.localeCompare(b.name));
  const completed = rows
    .filter((row) => row.evaluatedByMe && dateKey(row.evaluatedAt).startsWith(monthKey))
    .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
  return { pending, today, completed };
};

// Moved to the shared helpers; re-exported so existing imports keep working.
export { getPageList, paginate } from '../../lib/pagination';
