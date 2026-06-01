import { ArrowLeft, Briefcase, MapPin, DollarSign, BookOpen, Award, Users, FileText, Calendar, Clock } from 'lucide-react';
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
  const [job, setJob] = useState<JobPosting | null>(null);
  const [landingJob, setLandingJob] = useState<LandingJobData | null>(null);

  useEffect(() => {
    // First, try to get landing page job from location state
    if (location.state?.landingJob) {
      setLandingJob(location.state.landingJob);
      return;
    }

    // Otherwise, try to find from database
    const jobs = getJobPostings();
    const foundJob = jobs.find(j => j.id === jobId);
    setJob(foundJob || null);
  }, [jobId, location]);

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
  const status = landingJob ? 'Open' : job?.status || '';

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
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 border-t-4 border-blue-600">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-10 text-white">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <h1 className="text-4xl font-bold mb-3">{title}</h1>
                <div className="flex items-center gap-3 text-blue-100">
                  <Briefcase className="h-5 w-5" />
                  <span className="text-lg font-semibold">Item No. {itemNo}</span>
                </div>
              </div>
              <div className="text-right">
                <span className={`inline-block px-6 py-2 rounded-full text-sm font-bold ${
                  status === 'Active' || status === 'Open' ? 'bg-emerald-400 text-white' :
                  status === 'Draft' ? 'bg-amber-400 text-white' :
                  status === 'Closed' ? 'bg-red-400 text-white' :
                  'bg-blue-400 text-white'
                }`}>
                  {status}
                </span>\n              </div>\n            </div>\n          </div>

          {/* Key Information Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-8 py-8 border-b border-slate-200">
            {/* Place of Assignment */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-slate-700">Place of Assignment</span>
              </div>
              <p className="text-slate-900 font-medium text-lg">{department}</p>
            </div>

            {/* Position Title / Type */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Briefcase className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-slate-700">{landingJob ? 'Type' : 'Position Level'}</span>
              </div>
              <p className="text-slate-900 font-medium text-lg">{landingJob?.type || job?.positionLevel || 'N/A'}</p>
            </div>

            {/* Posting Date */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-slate-700">Posted</span>
              </div>
              <p className="text-slate-900 font-medium text-lg">{new Date(postingDate).toLocaleDateString()}</p>
            </div>

            {/* Closing/Application Date */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Clock className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-slate-700">Application Closes</span>
              </div>
              <p className="text-slate-900 font-medium text-lg">{new Date(closingDate).toLocaleDateString()}</p>
            </div>

            {job && !landingJob && (
              <>
                {/* Number of Positions */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Users className="h-5 w-5 text-blue-600" />
                    <span className="font-semibold text-slate-700">Number of Positions</span>
                  </div>
                  <p className="text-slate-900 font-medium text-lg">{job.numberOfPositions}</p>
                </div>

                {/* Employment Type */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <span className="font-semibold text-slate-700">Employment Type</span>
                  </div>
                  <p className="text-slate-900 font-medium text-lg">{job.employmentType}</p>
                </div>
              </>
            )}
          </div>
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
            {/* Education */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-600" />
                Education
              </h3>
              <p className="text-slate-700 text-base leading-relaxed bg-blue-50 p-4 rounded-lg">
                {job.education || 'Completion of 2 years studies in College'}
              </p>
            </div>

            {/* Work Experience */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-blue-600" />
                Work Experience
              </h3>
              <p className="text-slate-700 text-base leading-relaxed bg-blue-50 p-4 rounded-lg">
                {job.yearsOfExperience} year(s) of experience {job.experienceField ? `in ${job.experienceField}` : 'required'}
              </p>
            </div>

            {/* Training */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
                Training
              </h3>
              <p className="text-slate-700 text-base leading-relaxed bg-blue-50 p-4 rounded-lg">
                None Required
              </p>
            </div>

            {/* Skills */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-600" />
                Required Skills
              </h3>
              <div className="flex flex-wrap gap-3">
                {(job.skills || 'Communication, Records Management').split(',').map((skill, idx) => (
                  <span key={idx} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full font-medium text-sm">
                    {skill.trim()}
                  </span>
                ))}
              </div>
            </div>

            {/* Certifications */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Certifications
              </h3>
              <p className="text-slate-700 text-base leading-relaxed bg-blue-50 p-4 rounded-lg">
                {job.certifications || 'Civil Service Eligibility'}
              </p>
            </div>

            {/* Eligibility */}
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-600" />
                Eligibility
              </h3>
              <p className="text-slate-700 text-base leading-relaxed bg-blue-50 p-4 rounded-lg">
                Career Service (SubProfessional) 1st level Eligibility
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
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 border-l-4 border-blue-600">
          <div className="bg-blue-50 px-8 py-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <FileText className="h-6 w-6 text-blue-600" />
              Required Documents for Application
            </h2>
          </div>

          <div className="px-8 py-8">
            <div className="space-y-3 mb-6">
              {job && !landingJob ? (
                (job.requiredDocuments || ['Resume/CV', 'Application Letter']).map((doc, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <span className="text-blue-600 font-bold text-lg mt-1">✓</span>
                    <span className="text-slate-700 text-base">{doc}</span>
                  </div>
                ))
              ) : (
                <>
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <span className="text-blue-600 font-bold text-lg mt-1">✓</span>
                    <span className="text-slate-700 text-base">Personal Data Sheet (PDS) with Work Experience Sheet</span>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <span className="text-blue-600 font-bold text-lg mt-1">✓</span>
                    <span className="text-slate-700 text-base">Application Letter</span>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <span className="text-blue-600 font-bold text-lg mt-1">✓</span>
                    <span className="text-slate-700 text-base">Proof of eligibility/rating/license</span>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <span className="text-blue-600 font-bold text-lg mt-1">✓</span>
                    <span className="text-slate-700 text-base">Transcript of Records</span>
                  </div>
                </>
              )}
            </div>

            {/* Important Instructions */}
            <div className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-lg mt-6">
              <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Important Instructions
              </h3>
              <ul className="space-y-2 text-amber-900 text-sm">
                <li className="flex gap-2">
                  <span className="font-bold">1.</span>
                  <span>Interested and qualified applicants should signify their interest in writing through an application letter addressed to the head of office.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">2.</span>
                  <span>Applicants must attach the following documents to the application letter and send these to the address below not later than JUNE 11, 2026.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">3.</span>
                  <span>Fully accomplished Personal Data Sheet (PDS) with Work Experience Sheet and recent passport-sized or authorized digital picture (CS Form No. 212, Revised 2025); digitally signed or electronically signed.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">4.</span>
                  <span>Hard copy or electronic copy of Performance rating in the last rating period (if applicable).</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">5.</span>
                  <span>Hard copy or electronic copy of proof of eligibility/rating/license.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold">6.</span>
                  <span>Hard copy or electronic copy of Transcript of Records.</span>
                </li>
              </ul>
            </div>

            {/* Equal Opportunity Statement */}
            <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-lg mt-6">
              <h3 className="font-bold text-green-900 mb-3">Equal Opportunities for Employment</h3>
              <p className="text-green-900 text-sm mb-3">
                This Office highly encourages all interested and qualified applicants to apply, which include persons with disability (PWD) and members of the indigenous communities, irrespective of sexual orientation and gender identities and/or expression, civil status, religion, and political affiliation
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
            onClick={() => navigate(`/apply?position=${encodeURIComponent(title)}&itemNumber=${encodeURIComponent(itemNo)}`)}
            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-lg rounded-xl hover:shadow-lg transition-shadow"
          >
            Apply for This Position
          </button>
        </div>
      </div>
    </div>
  );
};
