// ============================================================================
// Qualification matching & gap analysis
// ============================================================================
// Two jobs:
//   1. Rank educational attainment so "do you meet this?" is answerable.
//   2. Compare a candidate's background against a posting's Qualification
//      Standards and say precisely what is missing — used both on a single
//      posting and against the highest-graded position in a department
//      ("what am I lacking to reach the top IT role?").
//
// Everything degrades to "not specified" rather than inventing a requirement:
// a blank field on the posting is NOT a gap.
// ============================================================================

import type { JobPosting } from '../types/recruitment.types';

// ─── Educational attainment ─────────────────────────────────────────────────
// One ladder covering both vocabularies in the app: the applicant form's
// ("College Graduate", "Masteral Units", …) and employee_education.level
// ("Secondary", "Graduate Studies", …).
const EDUCATION_RANK_MAP = new Map<string, number>([
  ['elementary level', 1],
  ['elementary', 2],
  ['elementary graduate', 2],
  ['high school level', 3],
  ['secondary', 4],
  ['high school graduate', 4],
  ['vocational', 5],
  ['college level', 5],
  ['college', 6],
  ['college graduate', 6],
  ["bachelor's degree", 6],
  ['bachelors degree', 6],
  ['masteral units', 7],
  ['graduate studies', 8],
  ['graduate school', 8],
  ['doctorate', 9],
]);

/** 0 when the attainment is unknown/unspecified. Higher is more advanced. */
export function educationRank(attainment: string | null | undefined): number {
  const key = String(attainment ?? '').trim().toLowerCase();
  if (!key) return 0;
  return EDUCATION_RANK_MAP.get(key) ?? 0;
}

/** The candidate's background, in whatever partial form we have it. */
export interface CandidateBackground {
  educationAttainment?: string | null;
  educationDegree?: string | null;
  experienceYears?: number | null;
  skills?: string[];
  eligibility?: string | null;
  training?: string | null;
}

export type GapKind = 'education' | 'experience' | 'skills' | 'eligibility' | 'training';

export interface QualificationGap {
  kind: GapKind;
  label: string;
  /** What the posting asks for. */
  required: string;
  /** What the candidate currently has, in the same terms. */
  current: string;
  /** Missing skill names — only populated for kind === 'skills'. */
  missingSkills?: string[];
}

export interface QualificationComparison {
  gaps: QualificationGap[];
  /** Requirements the candidate already satisfies (for the "you're good on…" list). */
  met: QualificationGap[];
  /** True when the posting states no requirements at all. */
  noStatedRequirements: boolean;
  meetsAll: boolean;
}

const normalizeSkill = (skill: string): string =>
  skill.trim().toLowerCase().replace(/[^a-z0-9+#. ]/g, '').replace(/\s+/g, ' ');

/**
 * Compare a candidate against one posting's stated requirements.
 * A requirement the posting doesn't state is never counted as a gap.
 */
export function compareQualifications(
  candidate: CandidateBackground,
  posting: Pick<JobPosting, 'qualifications' | 'eligibility' | 'training'>,
): QualificationComparison {
  const gaps: QualificationGap[] = [];
  const met: QualificationGap[] = [];
  let stated = 0;

  const record = (satisfied: boolean, gap: QualificationGap) => {
    stated += 1;
    (satisfied ? met : gaps).push(gap);
  };

  // ── Education ──
  const requiredEducation = String(posting.qualifications?.education ?? '').trim();
  if (requiredEducation) {
    const requiredRank = educationRank(requiredEducation);
    const currentAttainment = String(candidate.educationAttainment ?? '').trim();
    const currentRank = educationRank(currentAttainment);
    record(currentRank > 0 && currentRank >= requiredRank, {
      kind: 'education',
      label: 'Educational attainment',
      required: posting.qualifications?.educationField
        ? `${requiredEducation} — ${posting.qualifications.educationField}`
        : requiredEducation,
      current: currentAttainment || 'Not provided',
    });
  }

  // ── Experience ──
  const requiredYears = Number(posting.qualifications?.experience?.years ?? 0) || 0;
  if (requiredYears > 0) {
    const currentYears = Number(candidate.experienceYears ?? 0) || 0;
    const field = String(posting.qualifications?.experience?.field ?? '').trim();
    record(currentYears >= requiredYears, {
      kind: 'experience',
      label: 'Work experience',
      required: `${requiredYears} year${requiredYears === 1 ? '' : 's'}${field ? ` in ${field}` : ''}`,
      current: `${currentYears} year${currentYears === 1 ? '' : 's'}`,
    });
  }

  // ── Skills ──
  const requiredSkills = (posting.qualifications?.skills ?? []).filter(Boolean);
  if (requiredSkills.length > 0) {
    const have = new Set((candidate.skills ?? []).map(normalizeSkill).filter(Boolean));
    const missingSkills = requiredSkills.filter((skill) => !have.has(normalizeSkill(skill)));
    record(missingSkills.length === 0, {
      kind: 'skills',
      label: 'Skills',
      required: requiredSkills.join(', '),
      current:
        missingSkills.length === 0
          ? 'All required skills covered'
          : `Missing ${missingSkills.length} of ${requiredSkills.length}`,
      missingSkills,
    });
  }

  // ── Eligibility ── (we can't verify it, so it's always surfaced as a to-check)
  const requiredEligibility = String(posting.eligibility ?? '').trim();
  if (requiredEligibility) {
    const currentEligibility = String(candidate.eligibility ?? '').trim();
    record(Boolean(currentEligibility), {
      kind: 'eligibility',
      label: 'Eligibility',
      required: requiredEligibility,
      current: currentEligibility || 'Not on record',
    });
  }

  // ── Training ──
  const requiredTraining = String(posting.training ?? '').trim();
  if (requiredTraining) {
    const currentTraining = String(candidate.training ?? '').trim();
    record(Boolean(currentTraining), {
      kind: 'training',
      label: 'Training',
      required: requiredTraining,
      current: currentTraining || 'Not on record',
    });
  }

  return {
    gaps,
    met,
    noStatedRequirements: stated === 0,
    meetsAll: stated > 0 && gaps.length === 0,
  };
}

/**
 * The most senior position in a department: highest salary grade among its
 * postings. Falls back to educational + experience demands when no posting in
 * the department carries a salary grade. Returns null when the department has
 * no postings with any stated requirements to compare against — we will not
 * invent a "top position" that doesn't exist.
 */
export function findTopPositionInDepartment(
  postings: JobPosting[],
  department: string,
): JobPosting | null {
  const dept = department.trim().toLowerCase();
  if (!dept) return null;

  const candidates = postings.filter(
    (job) => String(job.department ?? '').trim().toLowerCase() === dept,
  );
  if (candidates.length === 0) return null;

  const demand = (job: JobPosting): number => {
    const grade = Number(job.salaryGrade ?? 0) || 0;
    if (grade > 0) return grade * 1000;
    // No salary grade on record — rank by what it demands instead.
    return educationRank(job.qualifications?.education) * 10 +
      (Number(job.qualifications?.experience?.years ?? 0) || 0);
  };

  const top = candidates.reduce((best, job) => (demand(job) > demand(best) ? job : best));

  // A "top position" with nothing stated gives the user nothing to act on.
  const hasRequirements =
    Boolean(String(top.qualifications?.education ?? '').trim()) ||
    (Number(top.qualifications?.experience?.years ?? 0) || 0) > 0 ||
    (top.qualifications?.skills ?? []).length > 0;

  return hasRequirements ? top : null;
}
