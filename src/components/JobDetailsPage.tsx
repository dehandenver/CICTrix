import { ArrowLeft, Briefcase, MapPin, BookOpen, Award, Users, FileText, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useState, useEffect, type ReactNode } from 'react';
import { getJobPostings } from '../lib/recruitmentData';
import { JobPosting } from '../types/recruitment.types';
import { QualificationGapPanel } from './QualificationGapPanel';

interface LandingJobData {
  id: number;
  title: string;
  department: string;
  itemNumber: string;
  postingDate: string;
  closingDate: string;
  type: string;
}

/**
 * One qualification standard. An unstated requirement renders as muted italic
 * placeholder text rather than a fabricated value.
 */
const RequirementCard = ({
  icon,
  label,
  value,
  emptyText,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  emptyText: string;
}) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <dt className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
      {icon}
      {label}
    </dt>
    <dd className={value ? 'text-base text-slate-700' : 'text-base italic text-slate-400'}>
      {value || emptyText}
    </dd>
  </div>
);

export const JobDetailsPage = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const location = useLocation();
  // Lazy initializer reads location.state immediately, preventing "not found" flash
  const [landingJob] = useState<LandingJobData | null>(() => location.state?.landingJob ?? null);
  const [job, setJob] = useState<JobPosting | null>(
    // The Job Portal navigates by item number and hands us the posting it
    // already loaded. Seed from it so the Qualifications panel renders on that
    // path too — it used to be gated behind `!landingJob`, which meant anyone
    // arriving from the portal never saw the requirements at all.
    () => (location.state?.landingJob?.originalJob as JobPosting | undefined) ?? null,
  );
  const [allPostings, setAllPostings] = useState<JobPosting[]>([]);

  useEffect(() => {
    const jobs = getJobPostings();
    setAllPostings(jobs);
    setJob((current) => {
      if (current) return current;
      // The route param is the item number on the portal path and the id on
      // the admin path — accept either.
      return jobs.find((j) => j.id === jobId || j.jobCode === jobId) ?? null;
    });
  }, [jobId]);

  if (!job && !landingJob) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 text-lg">Job posting not found.</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Use landing job if available, otherwise use database job
  const displayJob = landingJob || job;
  const title = landingJob?.title || job?.title || '';
  const itemNo = landingJob?.itemNumber || job?.jobCode || '';
  const department = job?.department || landingJob?.department || '';
  const postingDate = landingJob?.postingDate || job?.postedDate || '';
  const closingDate = landingJob?.closingDate || job?.applicationDeadline || '';

  // Never print "Invalid Date" or a made-up date for a field the posting
  // simply doesn't have.
  const formatDate = (value: string): string => {
    if (!value) return 'Not specified';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Not specified';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      {/* Header */}
      <button
        onClick={() => navigate(-1)}
        className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Main Container */}
      <div className="max-w-4xl mx-auto">
        {/* Header Section with ABYAN Branding */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 border-t-4 border-sky-500">
          <div className="bg-gradient-to-r from-[#C8D1FF] via-[#7F93FF] to-[#363EE8] px-8 py-10 text-white">
            <div className="flex flex-col gap-6 mb-6">
              <div>
                <h1 className="text-4xl font-bold mb-3">{title}</h1>
                <div className="flex items-center gap-3 text-slate-100">
                  <Briefcase className="h-5 w-5" />
                  <span className="text-lg font-semibold">Plantilla Item No. {itemNo}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Key Information Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-8 py-8 border-b border-slate-200">
            {/* Place of Assignment */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin className="h-5 w-5 text-sky-600" />
                <span className="font-semibold text-slate-700">Place of Assignment</span>
              </div>
              <p className="text-slate-900 font-medium text-lg">{department}</p>
            </div>

            {/* Salary Grade */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Award className="h-5 w-5 text-sky-600" />
                <span className="font-semibold text-slate-700">Salary Grade</span>
              </div>
              <p className="text-slate-900 font-medium text-lg">
                {job?.salaryGrade != null ? `SG ${job.salaryGrade}` : 'Not specified'}
              </p>
            </div>

            {/* Posting Date */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="h-5 w-5 text-sky-600" />
                <span className="font-semibold text-slate-700">Posted</span>
              </div>
              <p className="text-slate-900 font-medium text-lg">{formatDate(postingDate)}</p>
            </div>

            {/* Closing/Application Date */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Clock className="h-5 w-5 text-sky-600" />
                <span className="font-semibold text-slate-700">Application Closes</span>
              </div>
              <p className="text-slate-900 font-medium text-lg">{formatDate(closingDate)}</p>
            </div>
          </div>

          {job && job.monthlySalary != null && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-8 py-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-600">
                  <Briefcase className="h-5 w-5 text-sky-600" />
                  <span className="font-semibold text-slate-700">Monthly Salary</span>
                </div>
                <p className="text-slate-900 font-medium text-lg">
                  Php {Number(job.monthlySalary).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Qualification Standards */}
        {job && (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 border-l-4 border-blue-600">
          <div className="bg-blue-50 px-8 py-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <BookOpen className="h-6 w-6 text-blue-600" />
              Qualification Standards
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              What this position requires. Anything marked "Not specified" has no stated requirement.
            </p>
          </div>

          <div className="px-8 py-8 space-y-6">
            {/* ── Education: the headline requirement, laid out in full ── */}
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-5">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
                <Award className="h-5 w-5 text-blue-600" />
                Educational Attainment
              </h3>

              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-white p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Minimum Level Required
                  </dt>
                  <dd
                    className={`mt-1 text-lg font-bold ${
                      job.qualifications.education ? 'text-[#050D65]' : 'italic font-medium text-slate-400'
                    }`}
                  >
                    {job.qualifications.education || 'Not specified'}
                  </dd>
                </div>

                <div className="rounded-lg bg-white p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Field of Study
                  </dt>
                  <dd
                    className={`mt-1 text-base font-semibold ${
                      job.qualifications.educationField ? 'text-slate-800' : 'italic font-medium text-slate-400'
                    }`}
                  >
                    {job.qualifications.educationField || 'Any field'}
                  </dd>
                </div>
              </dl>

              {job.qualifications.education && (
                <p className="mt-4 text-sm text-slate-600">
                  Applicants must have attained at least{' '}
                  <strong className="text-slate-800">{job.qualifications.education}</strong>
                  {job.qualifications.educationField
                    ? <> in <strong className="text-slate-800">{job.qualifications.educationField}</strong>.</>
                    : '. Any field of study is accepted.'}
                </p>
              )}
            </div>

            {/* ── The rest of the CSC standards ── */}
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <RequirementCard
                icon={<Briefcase className="h-5 w-5 text-blue-600" />}
                label="Work Experience"
                value={(() => {
                  const total = Number(job.qualifications.experience.years || 0);
                  if (total <= 0) return '';
                  const years = Math.floor(total);
                  const months = Math.round((total - years) * 12);
                  const parts: string[] = [];
                  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
                  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
                  const duration = parts.join(' ');
                  const field = job.qualifications.experience.field;
                  return field ? `${duration} in ${field}` : duration;
                })()}
                emptyText="None required"
              />
              <RequirementCard
                icon={<BookOpen className="h-5 w-5 text-blue-600" />}
                label="Training"
                value={job.training ?? ''}
                emptyText="None required"
              />
              <RequirementCard
                icon={<Award className="h-5 w-5 text-blue-600" />}
                label="Eligibility"
                value={job.eligibility ?? ''}
                emptyText="Not specified"
              />
              <RequirementCard
                icon={<Award className="h-5 w-5 text-blue-600" />}
                label="Competency"
                value={job.competency ?? ''}
                emptyText="Not specified"
              />
            </dl>

            {/* ── Skills ── */}
            {job.qualifications.skills.length > 0 && (
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
                  <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  Required Skills
                </h3>
                <div className="flex flex-wrap gap-2">
                  {job.qualifications.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-[#050D65]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Where do I stand? — gap analysis against this posting and against the
            most senior position in the same department. */}
        {job && (
          <QualificationGapPanel posting={job} allPostings={allPostings} department={department} />
        )}

        {/* Responsibilities Section */}
        {job && !landingJob && job.responsibilities && job.responsibilities.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 border-l-4 border-blue-600">
            <div className="bg-blue-50 px-8 py-6 border-b border-slate-200">
              <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                <Briefcase className="h-6 w-6 text-blue-600" />
                Responsibilities
              </h2>
            </div>

            <div className="px-8 py-8">
              <ul className="space-y-3">
                {job.responsibilities.filter(r => r.trim()).map((resp, idx) => (
                  <li key={idx} className="flex gap-3">
                    <span className="text-blue-600 font-bold text-lg">•</span>
                    <span className="text-slate-700 text-base leading-relaxed">{resp}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Application Requirements Section */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 border-l-4 border-sky-500">
          <div className="bg-blue-50 px-8 py-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <FileText className="h-6 w-6 text-sky-600" />
              Required Documents for Application
            </h2>
          </div>

          <div className="px-8 py-8">
            <p className="mb-6 text-slate-700 text-base leading-relaxed">
              Submit these documents before <span className="font-semibold text-slate-900">June 11, 2026</span> as part of your application package.
            </p>

            <div className="grid gap-3">
              {job && !landingJob ? (
                (job.requiredDocuments || ['Resume/CV', 'Application Letter']).map((doc, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <CheckCircle2 className="h-5 w-5 text-sky-600 flex-shrink-0" />
                    <span className="text-slate-700 text-base">{doc}</span>
                  </div>
                ))
              ) : (
                [
                  'Personal Data Sheet (PDS) with Work Experience Sheet',
                  'Application Letter',
                  'Proof of eligibility/rating/license',
                  'Transcript of Records'
                ].map((doc, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <CheckCircle2 className="h-5 w-5 text-sky-600 flex-shrink-0" />
                    <span className="text-slate-700 text-base">{doc}</span>
                  </div>
                ))
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl mt-6">
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-slate-700" />
                Important Instructions
              </h3>
              <p className="text-slate-700 text-sm leading-relaxed mb-3">
                Address your application letter to the head of office and attach the required documents listed above before the deadline.
              </p>
              <p className="text-slate-700 text-sm leading-relaxed">
                Applications received after <span className="font-semibold">June 11, 2026</span> may not be considered.
              </p>
            </div>

            <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-lg mt-6">
              <h3 className="font-bold text-green-900 mb-3">Equal Opportunities for Employment</h3>
              <p className="text-green-900 text-sm mb-3">
                This Office highly encourages all interested and qualified applicants to apply, which include persons with disability (PWD) and members of the indigenous communities, irrespective of sexual orientation and gender identities and/or expression, civil status, religion, and political affiliation.
              </p>
              <p className="text-green-900 text-sm">
                This Office does not discriminate in the selection of employees based on the aforementioned pursuant to Equal Opportunities for Employment Principle (EOP).
              </p>
            </div>
          </div>
        </div>

        {/* Application Deadline Section */}
        {job && !landingJob && job.applicationDeadline && (
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl shadow-lg p-8 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-2">Application Deadline</h3>
                <p className="text-blue-100 text-lg">{job.applicationDeadline}</p>
              </div>
              <Calendar className="h-12 w-12 text-blue-200 opacity-50" />
            </div>
          </div>
        )}

        {/* Summary Section */}
        {job && !landingJob && job.summary && (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 border-l-4 border-blue-600">
            <div className="bg-blue-50 px-8 py-6 border-b border-slate-200">
              <h2 className="text-2xl font-bold text-slate-900">Position Summary</h2>
            </div>
            <div className="px-8 py-8">
              <p className="text-slate-700 text-base leading-relaxed">{job.summary}</p>
            </div>
          </div>
        )}

        {/* CTA Button — hidden on admin routes */}
        {!location.pathname.startsWith('/admin') && (
          <div className="text-center py-6">
            <button
              onClick={() => navigate('/apply', {
                state: {
                  landingJob: {
                    title,
                    department,
                    itemNumber: itemNo,
                  },
                },
              })}
              className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-lg rounded-xl hover:shadow-lg transition-shadow"
            >
              Apply for This Position
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
