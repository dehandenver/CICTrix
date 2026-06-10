import { ArrowLeft, Briefcase, MapPin, BookOpen, Award, Users, FileText, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getJobPostings } from '../lib/recruitmentData';
import { JobPosting } from '../types/recruitment.types';

interface LandingJobData {
  id: number;
  title: string;
  department: string;
  itemNumber: string;
  postingDate: string;
  closingDate: string;
  type: string;
}

export const JobDetailsPage = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const location = useLocation();
  // Lazy initializer reads location.state immediately, preventing "not found" flash
  const [landingJob] = useState<LandingJobData | null>(() => location.state?.landingJob ?? null);
  const [job, setJob] = useState<JobPosting | null>(null);

  useEffect(() => {
    if (landingJob) return; // already have data from navigation state
    const jobs = getJobPostings();
    const foundJob = jobs.find(j => j.id === jobId);
    setJob(foundJob || null);
  }, [jobId, landingJob]);

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
  const department = landingJob?.department || job?.division || job?.department || '';
  const postingDate = landingJob?.postingDate || job?.postedDate || '';
  const closingDate = landingJob?.closingDate || job?.applicationDeadline || '';

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
                {job?.salaryGrade != null ? job.salaryGrade : 'N/A'}
              </p>
            </div>

            {/* Posting Date */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="h-5 w-5 text-sky-600" />
                <span className="font-semibold text-slate-700">Posted</span>
              </div>
              <p className="text-slate-900 font-medium text-lg">{new Date(postingDate).toLocaleDateString()}</p>
            </div>

            {/* Closing/Application Date */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Clock className="h-5 w-5 text-sky-600" />
                <span className="font-semibold text-slate-700">Application Closes</span>
              </div>
              <p className="text-slate-900 font-medium text-lg">{new Date(closingDate).toLocaleDateString()}</p>
            </div>
          </div>

          {job && !landingJob && job.monthlySalary != null && (
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

        {/* Requirements Section - Only for Database Jobs */}
        {job && !landingJob && (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 border-l-4 border-blue-600">
          <div className="bg-blue-50 px-8 py-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <BookOpen className="h-6 w-6 text-blue-600" />
              Qualifications & Requirements
            </h2>
          </div>

          <div className="px-8 py-8 space-y-8">
            {/* Required group */}
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Required</p>

            {/* Eligibility */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-600" />
                Eligibility
              </h3>
              <p className="text-slate-700 text-base leading-relaxed bg-blue-50 p-4 rounded-lg">
                {job.eligibility
                  ?? (job.qualifications.certifications && job.qualifications.certifications.length > 0
                    ? job.qualifications.certifications.join(', ')
                    : 'None specified')}
              </p>
            </div>

            {/* Education */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-600" />
                Education
              </h3>
              <p className="text-slate-700 text-base leading-relaxed bg-blue-50 p-4 rounded-lg">
                {job.qualifications.education || 'None specified'}
              </p>
            </div>

            {/* Optional group */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 pt-2">Optional</p>

            {/* Degree / Course */}
            {job.qualifications.experience.field && (
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                  Degree / Course
                </h3>
                <p className="text-slate-700 text-base leading-relaxed bg-blue-50 p-4 rounded-lg">
                  {job.qualifications.experience.field}
                </p>
              </div>
            )}

            {/* Training */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
                Training
              </h3>
              <p className="text-slate-700 text-base leading-relaxed bg-blue-50 p-4 rounded-lg">
                {job.training ?? job.qualifications.preferred ?? 'None Required'}
              </p>
            </div>

            {/* Work Experience */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-blue-600" />
                Work Experience
              </h3>
              <p className="text-slate-700 text-base leading-relaxed bg-blue-50 p-4 rounded-lg">
                {(() => {
                  const total = Number(job.qualifications.experience.years || 0);
                  if (total <= 0) return 'None Required';
                  const years = Math.floor(total);
                  const months = Math.round((total - years) * 12);
                  const parts: string[] = [];
                  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
                  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
                  return parts.join(' ') || 'None Required';
                })()}
              </p>
            </div>

            {/* Competency */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-600" />
                Competency
              </h3>
              <p className="text-slate-700 text-base leading-relaxed bg-blue-50 p-4 rounded-lg">
                {job.competency
                  ?? (job.qualifications.skills && job.qualifications.skills.length > 0
                    ? job.qualifications.skills.join(', ')
                    : 'N/A')}
              </p>
            </div>
          </div>
        </div>
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

        {/* CTA Button */}
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
      </div>
    </div>
  );
};
