import { useMemo, useState } from 'react';
import { TrendingUp, CheckCircle2, AlertCircle, ArrowUpRight } from 'lucide-react';
import type { JobPosting } from '../types/recruitment.types';
import {
  compareQualifications,
  findTopPositionInDepartment,
  type CandidateBackground,
  type QualificationComparison,
  type QualificationGap,
} from '../lib/qualificationMatch';

const EDUCATION_OPTIONS = [
  'Elementary Graduate',
  'High School Graduate',
  'College Level',
  'College Graduate',
  'Masteral Units',
  'Graduate School',
  'Doctorate',
];

const GapList = ({ comparison }: { comparison: QualificationComparison }) => {
  if (comparison.noStatedRequirements) {
    return (
      <p className="rounded-lg bg-slate-50 p-4 text-sm italic text-slate-500">
        This position hasn't published its qualification standards yet, so there's nothing to
        compare against.
      </p>
    );
  }

  if (comparison.meetsAll) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <p className="text-sm font-medium text-emerald-900">
          You meet every stated requirement for this position.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {comparison.gaps.map((gap: QualificationGap) => (
        <div
          key={gap.kind}
          className="rounded-lg border border-amber-200 bg-amber-50 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-900">{gap.label}</p>

              {gap.kind === 'skills' && gap.missingSkills && gap.missingSkills.length > 0 ? (
                <>
                  <p className="mt-1 text-sm text-amber-800">You're missing:</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {gap.missingSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-amber-800">
                  Requires <strong>{gap.required}</strong> — you have{' '}
                  <strong>{gap.current}</strong>.
                </p>
              )}
            </div>
          </div>
        </div>
      ))}

      {comparison.met.length > 0 && (
        <p className="pt-1 text-sm text-emerald-700">
          <CheckCircle2 className="mr-1 inline h-4 w-4" />
          You already meet: {comparison.met.map((m) => m.label.toLowerCase()).join(', ')}.
        </p>
      )}
    </div>
  );
};

/**
 * "Where do I stand?" — the visitor describes their background once, and we
 * show what they're missing for (a) this posting and (b) the most senior
 * position in the same department.
 *
 * It's a self-assessment: the public portal has no account to read a real
 * profile from, so the inputs are the candidate's own. Nothing is stored.
 */
export const QualificationGapPanel = ({
  posting,
  allPostings,
  department,
}: {
  posting: JobPosting;
  allPostings: JobPosting[];
  department: string;
}) => {
  const [open, setOpen] = useState(false);
  const [education, setEducation] = useState('');
  const [years, setYears] = useState('');
  const [skills, setSkills] = useState('');

  const background: CandidateBackground = useMemo(
    () => ({
      educationAttainment: education,
      experienceYears: years ? Number(years) : 0,
      skills: skills
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    }),
    [education, years, skills],
  );

  const topPosition = useMemo(
    () => findTopPositionInDepartment(allPostings, department),
    [allPostings, department],
  );

  const thisJobComparison = useMemo(
    () => compareQualifications(background, posting),
    [background, posting],
  );

  const topJobComparison = useMemo(
    () => (topPosition ? compareQualifications(background, topPosition) : null),
    [background, topPosition],
  );

  const isTopPositionThisJob = topPosition?.id === posting.id;
  const hasAnswered = Boolean(education || years || skills.trim());

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border-l-4 border-violet-600 bg-white shadow-lg">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 border-b border-slate-200 bg-violet-50 px-8 py-6 text-left transition hover:bg-violet-100"
      >
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 shrink-0 text-violet-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Where do I stand?</h2>
            <p className="mt-1 text-sm text-slate-600">
              See what you're missing for this role
              {topPosition && !isTopPositionThisJob
                ? ` — and for ${topPosition.title}, the most senior ${department} position.`
                : '.'}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold text-violet-700">
          {open ? 'Hide' : 'Check now'}
        </span>
      </button>

      {open && (
        <div className="space-y-6 px-8 py-8">
          {/* Self-assessment inputs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="gap-education"
                className="mb-1.5 block text-sm font-semibold text-slate-700"
              >
                Your highest educational attainment
              </label>
              <select
                id="gap-education"
                value={education}
                onChange={(event) => setEducation(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              >
                <option value="">Select…</option>
                {EDUCATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="gap-years"
                className="mb-1.5 block text-sm font-semibold text-slate-700"
              >
                Years of relevant work experience
              </label>
              <input
                id="gap-years"
                type="number"
                min={0}
                step={0.5}
                value={years}
                onChange={(event) => setYears(event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="gap-skills" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Your skills
            </label>
            <textarea
              id="gap-skills"
              rows={3}
              value={skills}
              onChange={(event) => setSkills(event.target.value)}
              placeholder="One per line, or comma-separated — e.g. Network administration, SQL, Technical writing"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {!hasAnswered ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              Fill in your background above and your gaps will appear here. Nothing you type is saved
              or submitted.
            </p>
          ) : (
            <div className="space-y-6 border-t border-slate-200 pt-6">
              {/* This posting */}
              <div>
                <h3 className="mb-3 text-base font-bold text-slate-900">
                  For this role — {posting.title}
                </h3>
                <GapList comparison={thisJobComparison} />
              </div>

              {/* The department's most senior position */}
              {topPosition && topJobComparison && !isTopPositionThisJob && (
                <div>
                  <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
                    <ArrowUpRight className="h-5 w-5 text-violet-600" />
                    To reach {topPosition.title}
                  </h3>
                  <p className="mb-3 text-sm text-slate-500">
                    The most senior position in {department}
                    {topPosition.salaryGrade != null ? ` (SG ${topPosition.salaryGrade})` : ''}.
                  </p>
                  <GapList comparison={topJobComparison} />
                </div>
              )}

              {topPosition && isTopPositionThisJob && (
                <p className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
                  This is already the most senior {department} position on record.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
