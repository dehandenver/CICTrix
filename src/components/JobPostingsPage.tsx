import {
    Briefcase,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Lock,
    MapPin,
    Plus,
    Search,
    Trash2,
    Users,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    archiveDeletedJobPosting,
    ensureRecruitmentSeedData,
    excludeApplicantIdsFromBackfill,
    formatPHDate,
    getApplicants,
    getJobPostings,
    saveApplicants,
    saveJobPostings,
    toTitleCase,
} from '../lib/recruitmentData';
import { supabase } from '../lib/supabase';
import { JobPosting } from '../types/recruitment.types';
import { RecruitmentNavigationGuide } from './RecruitmentNavigationGuide';
import { Sidebar } from './Sidebar';

const ITEMS_PER_PAGE = 3;

const STATUS_COLORS: Record<JobPosting['status'], string> = {
  Draft: 'bg-slate-100 text-slate-700',
  Active: 'bg-emerald-100 text-emerald-700',
  Closed: 'bg-rose-100 text-rose-700',
  Filled: 'bg-blue-100 text-blue-700',
};

const STATUS_LABELS: Record<JobPosting['status'], string> = {
  Draft: 'Reviewing',
  Active: 'Open',
  Closed: 'Closed',
  Filled: 'Filled',
};

interface JobPostFormValues {
  title: string;
  jobCode: string;
  department: string;
  division: string;
  positionType: JobPosting['positionType'];
  salaryGrade: string;
  salaryMin: number;
  salaryMax: number;
  numberOfPositions: number;
  employmentStatus: JobPosting['employmentStatus'];
  summary: string;
  responsibilities: string[];
  education: string;
  yearsOfExperience: number;
  experienceField: string;
  skills: string;
  certifications: string;
  preferred: string;
  requiredDocuments: string[];
  otherDocument: string;
  applicationDeadline: string;
  interviewStart: string;
  interviewEnd: string;
  expectedStartDate: string;
}

const buildDefaultJobForm = (): JobPostFormValues => ({
  title: '',
  jobCode: `LGU-2026-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`,
  department: '',
  division: '',
  positionType: 'Civil Service',
  salaryGrade: 'SG-11',
  salaryMin: 28000,
  salaryMax: 36000,
  numberOfPositions: 1,
  employmentStatus: 'Permanent',
  summary: '',
  responsibilities: [''],
  education: "Bachelor's Degree",
  yearsOfExperience: 1,
  experienceField: 'Public Administration',
  skills: 'Communication, Records Management',
  certifications: 'Civil Service Eligibility',
  preferred: '',
  requiredDocuments: ['Resume/CV', 'Application Letter'],
  otherDocument: '',
  applicationDeadline: '',
  interviewStart: '',
  interviewEnd: '',
  expectedStartDate: '',
});

export const JobPostingsPage = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [liveApplicants, setLiveApplicants] = useState<ReturnType<typeof getApplicants>>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | JobPosting['status']>('all');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [showGuide, setShowGuide] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<JobPostFormValues>(buildDefaultJobForm());
  const [toast, setToast] = useState('');

  useEffect(() => {
    ensureRecruitmentSeedData();
    const loadedJobs = getJobPostings();
    setJobs(loadedJobs);
    // Normalize derived stores (legacy jobs/options) from the current source-of-truth list.
    saveJobPostings(loadedJobs);
    setLiveApplicants(getApplicants());
  }, []);

  const applicantCountsByJob = useMemo(() => {
    const counts = new Map<string, { applicants: number; qualified: number }>();
    for (const applicant of liveApplicants) {
      const current = counts.get(applicant.jobPostingId) ?? { applicants: 0, qualified: 0 };
      current.applicants += 1;
      if (applicant.status === 'Recommended for Hiring') {
        current.qualified += 1;
      }
      counts.set(applicant.jobPostingId, current);
    }
    return counts;
  }, [liveApplicants]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const query = `${job.title} ${job.jobCode} ${job.summary}`.toLowerCase();
      const matchesSearch = !search || query.includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
      const office = job.division || `${job.department} Department`;
      const matchesOffice = officeFilter === 'all' || office === officeFilter;
      return matchesSearch && matchesStatus && matchesOffice;
    });
  }, [jobs, officeFilter, search, statusFilter]);

  const officeOptions = useMemo(
    () => Array.from(new Set(jobs.map((job) => job.division || `${job.department} Department`))).sort((a, b) => a.localeCompare(b)),
    [jobs]
  );

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / ITEMS_PER_PAGE));
  const currentPageJobs = filteredJobs.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setOfficeFilter('all');
    setPage(1);
  };

  const saveJobs = (nextJobs: JobPosting[]) => {
    setJobs(nextJobs);
    saveJobPostings(nextJobs);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setActiveStep(1);
    setForm(buildDefaultJobForm());
    setShowModal(true);
  };

  const openEditModal = (job: JobPosting) => {
    setEditingId(job.id);
    setActiveStep(1);
    setForm({
      title: job.title,
      jobCode: job.jobCode,
      department: job.department,
      division: job.division ?? '',
      positionType: job.positionType,
      salaryGrade: job.salaryGrade ?? '',
      salaryMin: job.salaryRange?.min ?? 20000,
      salaryMax: job.salaryRange?.max ?? 30000,
      numberOfPositions: job.numberOfPositions,
      employmentStatus: job.employmentStatus,
      summary: job.summary,
      responsibilities: job.responsibilities.length ? job.responsibilities : [''],
      education: job.qualifications.education,
      yearsOfExperience: job.qualifications.experience.years,
      experienceField: job.qualifications.experience.field,
      skills: job.qualifications.skills.join(', '),
      certifications: job.qualifications.certifications.join(', '),
      preferred: job.qualifications.preferred ?? '',
      requiredDocuments: job.requiredDocuments.filter((item) => item !== 'Other'),
      otherDocument: job.requiredDocuments.find((item) => item !== 'Resume/CV' && item !== 'Application Letter' && item !== 'Transcript of Records' && item !== 'NBI Clearance' && item !== 'Birth Certificate' && item !== 'SALN') ?? '',
      applicationDeadline: job.applicationDeadline.slice(0, 10),
      interviewStart: job.interviewPeriod?.start.slice(0, 10) ?? '',
      interviewEnd: job.interviewPeriod?.end.slice(0, 10) ?? '',
      expectedStartDate: job.expectedStartDate?.slice(0, 10) ?? '',
    });
    setShowModal(true);
  };

  const submitForm = (status: JobPosting['status']) => {
    if (!form.title || !form.department || !form.summary || !form.applicationDeadline) {
      setToast('Please complete required fields in Basic Information and Timeline.');
      setActiveStep(1);
      return;
    }

    const normalizedResponsibilities = form.responsibilities.map((entry) => entry.trim()).filter(Boolean);
    const requiredDocuments = [...form.requiredDocuments];
    if (form.otherDocument.trim()) {
      requiredDocuments.push(form.otherDocument.trim());
    }

    const payload: JobPosting = {
      id: editingId ?? crypto.randomUUID(),
      jobCode: form.jobCode.trim() || `LGU-2026-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`,
      title: toTitleCase(form.title),
      department: form.department,
      division: form.division || undefined,
      positionType: form.positionType,
      salaryGrade: form.salaryGrade,
      salaryRange: { min: form.salaryMin, max: form.salaryMax },
      numberOfPositions: form.numberOfPositions,
      employmentStatus: form.employmentStatus,
      summary: form.summary,
      responsibilities: normalizedResponsibilities,
      qualifications: {
        education: form.education,
        experience: { years: form.yearsOfExperience, field: form.experienceField },
        skills: form.skills.split(',').map((item) => item.trim()).filter(Boolean),
        certifications: form.certifications.split(',').map((item) => item.trim()).filter(Boolean),
        preferred: form.preferred || undefined,
      },
      requiredDocuments,
      applicationDeadline: new Date(form.applicationDeadline).toISOString(),
      interviewPeriod:
        form.interviewStart && form.interviewEnd
          ? { start: new Date(form.interviewStart).toISOString(), end: new Date(form.interviewEnd).toISOString() }
          : undefined,
      expectedStartDate: form.expectedStartDate ? new Date(form.expectedStartDate).toISOString() : undefined,
      status,
      postedDate: editingId ? jobs.find((job) => job.id === editingId)?.postedDate ?? new Date().toISOString() : new Date().toISOString(),
      postedBy: 'HR Admin',
      applicantCount: editingId ? jobs.find((job) => job.id === editingId)?.applicantCount ?? 0 : 0,
      qualifiedCount: editingId ? jobs.find((job) => job.id === editingId)?.qualifiedCount ?? 0 : 0,
    };

    const nextJobs = editingId
      ? jobs.map((job) => (job.id === editingId ? payload : job))
      : [payload, ...jobs];

    saveJobs(nextJobs);
    setShowModal(false);
    setToast(editingId ? 'Job post updated successfully.' : 'Job post created successfully.');
  };

  const updateStatus = (id: string, nextStatus: JobPosting['status']) => {
    const nextJobs = jobs.map((job) => (job.id === id ? { ...job, status: nextStatus } : job));
    saveJobs(nextJobs);
    setToast(`Posting marked as ${nextStatus}.`);
  };

  const duplicatePosting = (job: JobPosting) => {
    const duplicated: JobPosting = {
      ...job,
      id: crypto.randomUUID(),
      title: `${job.title} (Copy)`,
      jobCode: `${job.jobCode}-COPY`,
      status: 'Draft',
      postedDate: new Date().toISOString(),
    };
    saveJobs([duplicated, ...jobs]);
    setToast('Posting duplicated as draft.');
  };

  const deleteJobPosting = async (job: JobPosting) => {
    const linkedApplicants = liveApplicants.filter((row) => row.jobPostingId === job.id);
    const linkedCount = linkedApplicants.length;

    const confirmMessage = linkedCount > 0
      ? `Delete job post \"${job.title}\"? ${linkedCount} applicant record(s) and their document references will be archived to Reports.`
      : `Delete job post \"${job.title}\"? This action cannot be undone.`;
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    if (linkedCount > 0) {
      excludeApplicantIdsFromBackfill(linkedApplicants.map((row) => row.id));

      archiveDeletedJobPosting({
        job,
        applicants: linkedApplicants,
        deletedBy: 'HR Admin',
      });

      const remainingApplicants = liveApplicants.filter((row) => row.jobPostingId !== job.id);
      setLiveApplicants(remainingApplicants);
      saveApplicants(remainingApplicants);
    }

    saveJobs(jobs.filter((row) => row.id !== job.id));

    await Promise.allSettled([
      supabase.from('job_postings').delete().eq('id', job.id),
      supabase.from('jobs').delete().eq('id', job.id),
      supabase.from('job_postings').delete().eq('title', job.title).eq('item_number', job.jobCode),
      supabase.from('jobs').delete().eq('title', job.title).eq('item_number', job.jobCode),
    ]);

    setToast(linkedCount > 0 ? 'Job post deleted and applicant data archived to Reports.' : 'Job post deleted.');
  };

  const closeApplication = (job: JobPosting) => {
    if (job.status === 'Active') {
      updateStatus(job.id, 'Closed');
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />
      <main className="admin-content bg-slate-50">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-2 text-base font-semibold text-blue-600">RSP Dashboard <span className="mx-2 text-slate-400">&gt;</span> <span className="text-slate-900">Job Postings</span></p>
            <h1 className="text-2xl font-bold text-slate-900">Job Postings Management</h1>
            <p className="text-sm text-slate-600">Manage and monitor all job positions and their applicants</p>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white" onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Add New Position
            </button>
          </div>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-0 shadow-sm">
          <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,0.75fr)_minmax(0,0.75fr)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                className="h-10 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-sm"
                placeholder="Search by job title or item number..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <select className="h-10 rounded-xl border border-slate-300 px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | JobPosting['status'])}>
              <option value="all">All Status</option>
              <option value="Active">Open</option>
              <option value="Draft">Reviewing</option>
              <option value="Closed">Closed</option>
              <option value="Filled">Filled</option>
            </select>

            <select className="h-10 rounded-xl border border-slate-300 px-3 text-sm" value={officeFilter} onChange={(event) => setOfficeFilter(event.target.value)}>
              <option value="all">All Offices</option>
              {officeOptions.map((office) => (
                <option key={office} value={office}>{office}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-700">
            <p>Showing <span className="font-semibold text-slate-900">{filteredJobs.length}</span> job positions</p>
            <button className="text-sm font-medium text-blue-700" onClick={clearFilters}>Clear Filters</button>
          </div>
        </section>

        <section className="mt-5">
          <p className="mb-2 text-center text-base font-semibold text-slate-700">
            {filteredJobs.length === 0 ? 'Position 0 to 0 of 0' : `Position ${(page - 1) * ITEMS_PER_PAGE + 1} to ${Math.min(page * ITEMS_PER_PAGE, filteredJobs.length)} of ${filteredJobs.length}`}
          </p>

          <div className="grid grid-cols-[48px_minmax(0,1fr)_48px] items-start gap-3">
            <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-slate-500 disabled:opacity-40" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {currentPageJobs.map((job) => {
                const liveCount = applicantCountsByJob.get(job.id) ?? { applicants: 0, qualified: 0 };
                const officeLabel = job.division || `${job.department} Department`;
                const statusLabel = STATUS_LABELS[job.status];

                return (
                  <article key={job.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h3 className="!mb-0 text-2xl font-semibold text-slate-900">{job.title}</h3>
                      <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${STATUS_COLORS[job.status]}`}>{statusLabel}</span>
                    </div>

                    <p className="!mb-2 text-sm text-slate-500">Item No. {job.jobCode}</p>

                    <div className="space-y-1.5 text-sm text-slate-700">
                      <p className="!mb-0 flex items-center gap-2.5"><MapPin className="h-4 w-4 shrink-0 text-slate-400" /> <span>{officeLabel}</span></p>
                      <p className="!mb-0 flex items-center gap-2.5"><Calendar className="h-4 w-4 shrink-0 text-slate-400" /> <span>Posted {formatPHDate(job.postedDate)}</span></p>
                      <p className="!mb-0 flex items-center gap-2.5"><Users className="h-4 w-4 shrink-0 text-slate-400" /> <span><span className="font-bold text-slate-900">{liveCount.applicants}</span> Applicants</span></p>
                    </div>

                    <div className="mt-4 space-y-2">
                      <button className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-base font-semibold text-white" onClick={() => navigate(`/admin/rsp/qualified/${job.id}`)}>
                        View Applicants <ChevronRight className="ml-2 inline h-4 w-4" />
                      </button>

                      {job.status === 'Active' && (
                        <button
                          type="button"
                          onClick={() => closeApplication(job)}
                          className="w-full rounded-xl border border-orange-300 bg-white px-4 py-2.5 text-base font-medium text-orange-600"
                        >
                          <Lock className="mr-2 inline h-4 w-4" /> Close Application
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void deleteJobPosting(job)}
                        className="w-full rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-base font-medium text-rose-600"
                      >
                        <Trash2 className="mr-2 inline h-4 w-4" /> Delete
                      </button>
                    </div>
                  </article>
                );
              })}

              {currentPageJobs.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                  <Briefcase className="mx-auto h-10 w-10 text-slate-400" />
                  <p className="mt-2 font-medium">No job postings found for the selected filters.</p>
                </div>
              )}
            </div>

            <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-slate-500 disabled:opacity-40" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </section>
      </main>

      <RecruitmentNavigationGuide open={showGuide} onClose={() => setShowGuide(false)} />

      {showModal && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 p-4" onClick={() => setShowModal(false)}>
          <div className="mx-auto h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{editingId ? 'Edit Job Post' : 'Create New Job Post'}</h2>
                <p className="text-sm text-slate-500">Step {activeStep} of 4</p>
              </div>
              <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setShowModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-4 border-b border-slate-200 text-sm">
              {['Basic Information', 'Job Description', 'Requirements & Timeline', 'Review & Publish'].map((label, index) => (
                <button
                  type="button"
                  key={label}
                  className={`px-3 py-2 text-left ${activeStep === index + 1 ? 'border-b-2 border-blue-600 font-semibold text-blue-700' : 'text-slate-500'}`}
                  onClick={() => setActiveStep(index + 1)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-4 px-6 py-5">
              {activeStep === 1 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Job Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                  <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Job Code" value={form.jobCode} onChange={(event) => setForm({ ...form, jobCode: event.target.value })} />
                  <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>
                    <option value="">Select Department</option>
                    {DEPARTMENTS.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                  </select>
                  <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Division/Office" value={form.division} onChange={(event) => setForm({ ...form, division: event.target.value })} />
                  <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.positionType} onChange={(event) => setForm({ ...form, positionType: event.target.value as JobPosting['positionType'] })}>
                    {POSITION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Salary Grade" value={form.salaryGrade} onChange={(event) => setForm({ ...form, salaryGrade: event.target.value })} />
                  <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" min={1} value={form.numberOfPositions} onChange={(event) => setForm({ ...form, numberOfPositions: Number(event.target.value) || 1 })} />
                  <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.employmentStatus} onChange={(event) => setForm({ ...form, employmentStatus: event.target.value as JobPosting['employmentStatus'] })}>
                    <option value="Permanent">Permanent</option>
                    <option value="Temporary">Temporary</option>
                    <option value="Contractual">Contractual</option>
                  </select>
                </div>
              )}

              {activeStep === 2 && (
                <div className="space-y-4">
                  <textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={500} placeholder="Position Summary" value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 text-sm font-semibold text-slate-700">Key Responsibilities</p>
                    <div className="space-y-2">
                      {form.responsibilities.map((item, index) => (
                        <div key={`${item}-${index}`} className="flex gap-2">
                          <input className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" value={item} onChange={(event) => {
                            const next = [...form.responsibilities];
                            next[index] = event.target.value;
                            setForm({ ...form, responsibilities: next });
                          }} />
                          <button className="rounded-lg border border-slate-300 px-2 text-sm" onClick={() => {
                            const next = form.responsibilities.filter((_, idx) => idx !== index);
                            setForm({ ...form, responsibilities: next.length ? next : [''] });
                          }}>Remove</button>
                        </div>
                      ))}
                    </div>
                    <button className="mt-2 rounded-lg border border-blue-300 px-3 py-1 text-sm text-blue-700" onClick={() => setForm({ ...form, responsibilities: [...form.responsibilities, ''] })}>+ Add Responsibility</button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Education" value={form.education} onChange={(event) => setForm({ ...form, education: event.target.value })} />
                    <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" min={0} placeholder="Required Experience (years)" value={form.yearsOfExperience} onChange={(event) => setForm({ ...form, yearsOfExperience: Number(event.target.value) || 0 })} />
                    <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Experience Field" value={form.experienceField} onChange={(event) => setForm({ ...form, experienceField: event.target.value })} />
                    <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Required Skills (comma-separated)" value={form.skills} onChange={(event) => setForm({ ...form, skills: event.target.value })} />
                    <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Required Certifications" value={form.certifications} onChange={(event) => setForm({ ...form, certifications: event.target.value })} />
                    <textarea className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Preferred Qualifications" value={form.preferred} onChange={(event) => setForm({ ...form, preferred: event.target.value })} />
                  </div>
                </div>
              )}

              {activeStep === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    {['Resume/CV', 'Application Letter', 'Transcript of Records', 'NBI Clearance', 'Birth Certificate', 'SALN'].map((doc) => (
                      <label key={doc} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.requiredDocuments.includes(doc)}
                          onChange={() =>
                            setForm((current) => ({
                              ...current,
                              requiredDocuments: current.requiredDocuments.includes(doc)
                                ? current.requiredDocuments.filter((entry) => entry !== doc)
                                : [...current.requiredDocuments, doc],
                            }))
                          }
                        />
                        {doc}
                      </label>
                    ))}
                  </div>
                  <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Other required document" value={form.otherDocument} onChange={(event) => setForm({ ...form, otherDocument: event.target.value })} />

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={form.applicationDeadline} onChange={(event) => setForm({ ...form, applicationDeadline: event.target.value })} />
                    <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={form.interviewStart} onChange={(event) => setForm({ ...form, interviewStart: event.target.value })} />
                    <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={form.interviewEnd} onChange={(event) => setForm({ ...form, interviewEnd: event.target.value })} />
                    <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-3" type="date" value={form.expectedStartDate} onChange={(event) => setForm({ ...form, expectedStartDate: event.target.value })} />
                  </div>
                </div>
              )}

              {activeStep === 4 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Preview</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">{form.title || 'Untitled Position'}</h3>
                  <p className="text-sm text-slate-600">{form.department || 'Department not set'} • {form.positionType} • {form.salaryGrade}</p>
                  <p className="mt-3 text-sm text-slate-700">{form.summary || 'No summary provided yet.'}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {form.responsibilities.filter(Boolean).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                  <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
                    Notification settings are included in this MVP using in-app toast confirmation.
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-6 py-4">
              <div className="flex gap-2">
                <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setActiveStep((current) => Math.max(1, current - 1))}>
                  Previous
                </button>
                <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setActiveStep((current) => Math.min(4, current + 1))}>
                  Next
                </button>
              </div>
              <div className="flex gap-2">
                <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium" onClick={() => submitForm('Draft')}>Save As Draft</button>
                <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white" onClick={() => submitForm('Active')}>Publish Immediately</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
};
