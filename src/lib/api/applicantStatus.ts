/**
 * The applicant selection workflow — one source of truth.
 *
 * Before this, three things disagreed about what an applicant's status meant:
 * the ApplicantStatus union in recruitment.types.ts, the values actually stored
 * in the database, and a substring matcher in the RSP dashboard that existed to
 * paper over the gap. Live data carried 'Hired', 'Reviewed' and 'Pending', none
 * of which were in the union, and the dashboard's "Qualified" count was really
 * `status.includes('recommended')`.
 *
 * That ambiguity is the reason for this module. "Qualified" in particular now
 * has one meaning — passed the complete selection process — rather than being
 * inferred from whatever string happened to be stored.
 *
 * The flow, per the RSP specification:
 *
 *   Submitted
 *     -> Under Initial Screening
 *       -> Pending                     (correction or resubmission required)
 *       -> Shortlisted                 (awaiting interview/exam schedule)
 *         -> Interview/Exam Scheduled
 *           -> For Evaluation
 *             -> Qualified             (passed the complete process)
 *               -> For Contract Signing  (plantilla reserved; report by a date)
 *                 -> Selected            (credentials generated: hired)
 *
 * Ending anywhere: Disqualified (failed, or failed to attend) or Not Selected
 * (someone else was appointed).
 *
 * For Contract Signing is a reservation, not a hire: RSP picked this applicant
 * and gave them a date to report for contract signing. If they don't, RSP
 * revokes it and the application returns to the status it had (migration
 * 20261021200100). Filling the plantilla moves everyone else on it to Not
 * Selected and archives them.
 *
 * Withdrawn - Hired Elsewhere is the third ending, and the only one no button
 * writes. The database sets it on a person's other open applications the moment
 * one of them is hired (migration 20261021200000), and restores them if that hire is
 * reverted.
 */

export const APPLICANT_STATUSES = [
  'Submitted',
  'Under Initial Screening',
  'Pending',
  'Shortlisted',
  'Interview/Exam Scheduled',
  'For Evaluation',
  'Qualified',
  'For Contract Signing',
  'Selected',
  'Disqualified',
  'Not Selected',
  'Withdrawn - Hired Elsewhere',
] as const;

export type ApplicantWorkflowStatus = (typeof APPLICANT_STATUSES)[number];

/** Nothing follows a terminal status; the application is closed. */
export const TERMINAL_STATUSES: ApplicantWorkflowStatus[] = [
  'Selected',
  'Disqualified',
  'Not Selected',
  'Withdrawn - Hired Elsewhere',
];

export const isTerminal = (s: ApplicantWorkflowStatus): boolean => TERMINAL_STATUSES.includes(s);

/**
 * What the applicant sees in the status tracker.
 *
 * Written for the applicant, not the office: no internal reasoning, no mention
 * of other candidates beyond the fact that the post was filled, and an action
 * where there is one to take.
 */
export const APPLICANT_MESSAGES: Record<ApplicantWorkflowStatus, string> = {
  Submitted: 'Your application has been received.',
  'Under Initial Screening': 'Your application is being reviewed against the position requirements.',
  Pending:
    'Your application is currently pending. Please resubmit the required document or information indicated by the RSP Office.',
  Shortlisted: 'You have passed the initial screening. Waiting for interview/examination schedule.',
  'Interview/Exam Scheduled': 'Your interview/examination has been scheduled. Please see the details below.',
  'For Evaluation': 'Your interview/examination results are being evaluated.',
  Qualified: 'You have successfully completed the selection process and are qualified for this position.',
  'For Contract Signing':
    'Congratulations! You have been selected for this position. Please report to the office for contract signing and verification by the date below.',
  Selected: 'Congratulations. You have been selected for this position.',
  Disqualified: 'We regret to inform you that your application has been disqualified.',
  'Not Selected': 'We regret to inform you that you were not selected for this position.',
  'Withdrawn - Hired Elsewhere':
    'You have been appointed to another position under this Reference No. This application is now closed.',
} as const;

/**
 * Reasons an applicant can be disqualified, recorded alongside the status.
 *
 * Failure to attend is called out separately because the specification asks for
 * it by name and because it carries different evidence — the scheduled activity
 * and its date — than a qualification failure does.
 */
export const DISQUALIFICATION_REASONS = [
  'Failure to attend scheduled interview/examination',
  'Failed to meet qualification requirements',
  'Withdrew application',
  'Other documented reason',
] as const;

export type DisqualificationReason = (typeof DISQUALIFICATION_REASONS)[number];

/**
 * Legacy and live values mapped onto the workflow.
 *
 * Every value observed in production is covered. Two mappings are judgement
 * calls worth stating:
 *
 *   'Recommended for Hiring' -> Shortlisted. This string was written by two
 *   different buttons: document screening, where it meant "documents validated,
 *   may now be scheduled", and the post-ranking action, where it meant the
 *   selection process was complete. Those two have since been separated, so
 *   anything still carrying it is historical and cannot say which it was.
 *   Migration 20260926 resolves the stored rows by looking for an evaluation
 *   record; the rows it cannot resolve are the ones that were never
 *   interviewed. Shortlisted is the cautious reading, and the cautious reading
 *   is the right default here — calling someone Qualified who never sat the
 *   interview overstates where they are, in a status the applicant can see.
 *
 *   'New Application' -> Submitted. It is the entry state under another name.
 *
 * Matching is case- and space-insensitive so stray capitalisation does not fall
 * through to the default.
 */
const LEGACY_MAP: Record<string, ApplicantWorkflowStatus> = {
  // Observed in production
  'new application': 'Submitted',
  submitted: 'Submitted',
  'under review': 'Under Initial Screening',
  reviewed: 'For Evaluation',
  pending: 'Pending',
  shortlisted: 'Shortlisted',
  'recommended for hiring': 'Shortlisted',
  hired: 'Selected',
  'not qualified': 'Disqualified',

  // Present in the old union or elsewhere in the codebase
  'for interview': 'Interview/Exam Scheduled',
  'interview scheduled': 'Interview/Exam Scheduled',
  'interview completed': 'For Evaluation',
  'for deliberation': 'For Evaluation',
  'for evaluation': 'For Evaluation',
  scheduled: 'Interview/Exam Scheduled',
  qualified: 'Qualified',
  'for contract signing': 'For Contract Signing',
  selected: 'Selected',
  rejected: 'Not Selected',
  'not selected': 'Not Selected',
  disqualified: 'Disqualified',
  withdrawn: 'Disqualified',
  'document verified': 'Under Initial Screening',
  'action required': 'Pending',

  // Written by the database, never typed by hand; the en dash variant covers
  // copy pasted from the plan or a document.
  'withdrawn - hired elsewhere': 'Withdrawn - Hired Elsewhere',
  'withdrawn – hired elsewhere': 'Withdrawn - Hired Elsewhere',
};

/**
 * Resolve any stored value to a workflow status.
 *
 * Returns null rather than guessing when a value is unrecognised. A caller that
 * silently defaulted to 'Submitted' would quietly resurrect closed applications
 * and misreport the pipeline — the same class of bug the substring matcher
 * caused. An unmapped value should be visible, not absorbed.
 */
export function normalizeStatus(raw: string | null | undefined): ApplicantWorkflowStatus | null {
  const key = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  if ((APPLICANT_STATUSES as readonly string[]).includes(raw as string)) {
    return raw as ApplicantWorkflowStatus;
  }
  return LEGACY_MAP[key] ?? null;
}

/**
 * Which statuses may follow a given one.
 *
 * Pending returns to screening rather than jumping forward: a corrected
 * application is re-screened, not waved through on the strength of having been
 * fixed. Disqualified and Not Selected are reachable from any live status,
 * because an applicant can withdraw or the post can be filled at any point.
 */
const TRANSITIONS: Record<ApplicantWorkflowStatus, ApplicantWorkflowStatus[]> = {
  Submitted: ['Under Initial Screening'],
  'Under Initial Screening': ['Pending', 'Shortlisted'],
  Pending: ['Under Initial Screening'],
  Shortlisted: ['Interview/Exam Scheduled'],
  'Interview/Exam Scheduled': ['For Evaluation'],
  'For Evaluation': ['Qualified'],
  // Qualified -> Selected stays for the older direct-hire paths.
  Qualified: ['For Contract Signing', 'Selected'],
  // Back to Qualified is the revoke ("did not report").
  'For Contract Signing': ['Selected', 'Qualified'],
  Selected: [],
  Disqualified: [],
  'Not Selected': [],
  'Withdrawn - Hired Elsewhere': [],
};

/**
 * Endings reachable from any status that is not already terminal.
 * Withdrawn - Hired Elsewhere is deliberately absent: only a hire on another
 * plantilla produces it, so no screen should offer it as an action.
 */
const ALWAYS_AVAILABLE: ApplicantWorkflowStatus[] = ['Disqualified', 'Not Selected'];

export function nextStatuses(from: ApplicantWorkflowStatus): ApplicantWorkflowStatus[] {
  if (isTerminal(from)) return [];
  return [...TRANSITIONS[from], ...ALWAYS_AVAILABLE];
}

export function canTransition(from: ApplicantWorkflowStatus, to: ApplicantWorkflowStatus): boolean {
  return nextStatuses(from).includes(to);
}

/**
 * Pipeline bucket for dashboard counts.
 *
 * Derived from the normalised status rather than by matching substrings, which
 * is what previously counted "Not Qualified" as qualified and dropped everyone
 * who was Hired out of the funnel entirely.
 */
export type FunnelBucket =
  | 'pending'
  | 'screening'
  | 'assessment'
  | 'qualified'
  | 'selected'
  | 'closed'
  | 'withdrawn';

export function funnelBucket(status: ApplicantWorkflowStatus): FunnelBucket {
  switch (status) {
    case 'Submitted':
      return 'pending';
    case 'Under Initial Screening':
    case 'Pending':
      return 'screening';
    case 'Shortlisted':
    case 'Interview/Exam Scheduled':
    case 'For Evaluation':
      return 'assessment';
    case 'Qualified':
    case 'For Contract Signing':
      // Reserved, not hired yet: it can still be revoked.
      return 'qualified';
    case 'Selected':
      return 'selected';
    case 'Disqualified':
    case 'Not Selected':
      return 'closed';
    // Not a failure: the person was hired, on another plantilla. Kept out of
    // 'closed' so the dashboard does not count them as Not Qualified.
    case 'Withdrawn - Hired Elsewhere':
      return 'withdrawn';
  }
}

/**
 * The sentence every contract-signing notice ends with, worded as the RSP
 * office gave it.
 */
export const signingForfeitWarning = (deadline: string): string =>
  `Due to failure of securing it by ${deadline} may result to lose your place in the recruitment process or give up your status as selected candidate.`;

/** The organisation and office named in letters to applicants. */
export const HIRING_ORGANIZATION = 'City Government of Iloilo';
export const HIRING_OFFICE_SIGNATURE = 'Recruitment, Selection and Placement Office, CHRMO';

/**
 * The regret letter shown on the tracker when the plantilla an applicant
 * applied for is filled by someone else. The data holds no per-applicant
 * strength or missing requirement, so the letter names neither.
 */
export const regretLetter = (applicantName: string, jobTitle: string): string[] => [
  `Dear ${applicantName || 'Applicant'},`,
  `Thank you so much for taking the time to meet with us to discuss the ${jobTitle || 'position'} role. It was a pleasure learning more about your background and career goals.`,
  'After careful consideration, we have chosen to move forward with another candidate for this position.',
  `We truly enjoyed our conversation and will keep your profile in our talent pool should another suitable position open up in the future. Thank you again for your time and interest in the ${HIRING_ORGANIZATION}.`,
  'Warm regards,',
  HIRING_OFFICE_SIGNATURE,
];
