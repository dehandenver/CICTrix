// Shared by the interviewer applicants list and dashboard so "Evaluate" always
// primes the same score setup before opening /interviewer/evaluate/:id.

const SCORE_SETUP_STORAGE_KEY = 'cictrix_rsp_score_setup';

export type ApplicantEvalType = 'Original' | 'Promotional';

export const getApplicantType = (applicant: {
  application_type?: unknown;
  employee_id?: unknown;
}): ApplicantEvalType => {
  const appType = String(applicant.application_type ?? '').trim().toLowerCase();
  // The application's own type decides. Hiring writes employee_id onto external
  // applicants too, so the employee link only counts for rows saved without a type.
  if (appType) return appType === 'promotion' || appType === 'promotional' ? 'Promotional' : 'Original';
  return applicant.employee_id ? 'Promotional' : 'Original';
};

export const storeApplicantTypeForEval = (applicantId: string, type: ApplicantEvalType) => {
  try {
    const raw = localStorage.getItem(SCORE_SETUP_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[applicantId] = type === 'Promotional' ? 'promotional' : 'original';
    localStorage.setItem(SCORE_SETUP_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // best effort
  }
};
