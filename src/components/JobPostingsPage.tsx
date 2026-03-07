import {
    Briefcase,
    Calendar,
    ChevronLeft,
    ChevronRight,
    MoreVertical,
    Plus,
    Search,
    Users,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEPARTMENTS } from '../constants/positions';
import {
    ensureRecruitmentSeedData,
    formatPHDate,
    getApplicants,
    getJobPostings,
    saveJobPostings,
    toTitleCase,
} from '../lib/recruitmentData';
import { JobPosting } from '../types/recruitment.types';
import { RecruitmentNavigationGuide } from './RecruitmentNavigationGuide';
import { Sidebar } from './Sidebar';

const ITEMS_PER_PAGE = 12;
const POSITION_TYPES = ['Civil Service', 'COS', 'JO', 'Contractual'];

const STATUS_COLORS: Record<JobPosting['status'], string> = {
  Draft: 'bg-slate-100 text-slate-700',
  Active: 'bg-emerald-100 text-emerald-700',
  Closed: 'bg-rose-100 text-rose-700',
  Filled: 'bg-blue-100 text-blue-700',
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
  const [statusFilter, setStatusFilter] = useState<'All Postings' | JobPosting['status']>('All Postings');
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  const [positionTypeFilter, setPositionTypeFilter] = useState<string>('all');
  const [postedFrom, setPostedFrom] = useState('');
  const [postedTo, setPostedTo] = useState('');
  const [page, setPage] = useState(1);
  const [showGuide, setShowGuide] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [form, setForm] = useState<JobPostFormValues>(buildDefaultJobForm());
  const [toast, setToast] = useState('');

  useEffect(() => {
    ensureRecruitmentSeedData();
    setJobs(getJobPostings());
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
      const matchesStatus = statusFilter === 'All Postings' || job.status === statusFilter;
      const matchesDept = departmentFilter.length === 0 || departmentFilter.includes(job.department);
      const matchesType = positionTypeFilter === 'all' || job.positionType === positionTypeFilter;
      const posted = new Date(job.postedDate).getTime();
      const fromOkay = !postedFrom || posted >= new Date(postedFrom).getTime();
      const toOkay = !postedTo || posted <= new Date(postedTo).getTime() + 86400000;
      return matchesSearch && matchesStatus && matchesDept && matchesType && fromOkay && toOkay;
    });
  }, [jobs, search, statusFilter, departmentFilter, positionTypeFilter, postedFrom, postedTo]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / ITEMS_PER_PAGE));
  const currentPageJobs = filteredJobs.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('All Postings');
    setDepartmentFilter([]);
    setPositionTypeFilter('all');
    setPostedFrom('');
    setPostedTo('');
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

  const toggleDepartment = (dept: string) => {
    setDepartmentFilter((current) =>
      current.includes(dept) ? current.filter((item) => item !== dept) : [...current, dept]
    );
  };

  const updateStatus = (id: string, nextStatus: JobPosting['status']) => {
    const nextJobs = jobs.map((job) => (job.id === id ? { ...job, status: nextStatus } : job));
    saveJobs(nextJobs);
    setOpenMenuId(null);
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
    setOpenMenuId(null);
    setToast('Posting duplicated as draft.');
  };

  const deleteDraft = (id: string) => {
    saveJobs(jobs.filter((job) => job.id !== id));
    setOpenMenuId(null);
    setToast('Draft posting deleted.');
  };

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />
      <main className="admin-content bg-slate-50">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Job Postings Management</h1>
            <p className="text-slate-600">Manage and publish job opportunities ({jobs.length} total postings)</p>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700" onClick={() => setShowGuide(true)}>
              How to Navigate
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              New Job Post
            </button>
          </div>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
            <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'All Postings' | JobPosting['status'])}>
              <option>All Postings</option>
              <option>Draft</option>
              <option>Active</option>
              <option>Closed</option>
              <option>Filled</option>
            </select>

            <div className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Departments</p>
              <div className="grid max-h-28 gap-1 overflow-y-auto">
                {DEPARTMENTS.map((dept) => (
                  <label key={dept} className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={departmentFilter.includes(dept)} onChange={() => toggleDepartment(dept)} />
                    <span>{dept}</span>
                  </label>
                ))}
              </div>
            </div>

            <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={positionTypeFilter} onChange={(event) => setPositionTypeFilter(event.target.value)}>
              <option value="all">All Position Types</option>
              {POSITION_TYPES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>

            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={postedFrom} onChange={(event) => setPostedFrom(event.target.value)} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" value={postedTo} onChange={(event) => setPostedTo(event.target.value)} />

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
                placeholder="Search title, code, keywords"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <button className="mt-3 text-sm font-medium text-blue-700" onClick={clearFilters}>Clear Filters</button>
        </section>

        <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {currentPageJobs.map((job) => (
            // Keep card counts aligned with the actual applicants list for each posting.
            (() => {
              const liveCount = applicantCountsByJob.get(job.id) ?? { applicants: 0, qualified: 0 };
              return (
            <article key={job.id} className="relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="mb-2 flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[job.status]}`}>{job.status}</span>
                <div className="relative">
                  <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setOpenMenuId(openMenuId === job.id ? null : job.id)}>
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {openMenuId === job.id && (
                    <div className="absolute right-0 z-10 mt-2 w-44 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg">
                      <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => openEditModal(job)}>Edit Job Post</button>
                      <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => duplicatePosting(job)}>Duplicate Posting</button>
                      {job.status === 'Active' && <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => updateStatus(job.id, 'Closed')}>Close Posting</button>}
                      {job.status === 'Closed' && <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => updateStatus(job.id, 'Active')}>Reopen Posting</button>}
                      {job.status !== 'Filled' && <button className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => updateStatus(job.id, 'Filled')}>Mark As Filled</button>}
                      {job.status === 'Draft' && <button className="block w-full rounded px-2 py-1 text-left text-rose-600 hover:bg-rose-50" onClick={() => deleteDraft(job.id)}>Delete Draft</button>}
                    </div>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-bold text-slate-900">{job.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{job.department} • {job.positionType} • {job.salaryGrade}</p>

              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p className="inline-flex items-center gap-2"><Calendar className="h-4 w-4" /> Posted: {formatPHDate(job.postedDate)}</p>
                <p className="inline-flex items-center gap-2"><Calendar className="h-4 w-4" /> Deadline: {formatPHDate(job.applicationDeadline)}</p>
                <p className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> Applicants: {liveCount.applicants} ({liveCount.qualified} qualified)</p>
              </div>

              <div className="mt-4 flex gap-2">
                <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" onClick={() => openEditModal(job)}>
                  View Details
                </button>
                <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white" onClick={() => navigate(`/admin/rsp/qualified/${job.id}`)}>
                  View Applicants ({liveCount.applicants})
                </button>
              </div>
            </article>
              );
            })()
          ))}

          {currentPageJobs.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              <Briefcase className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-2 font-medium">No job postings found for the selected filters.</p>
              <button className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={openCreateModal}>
                Create New Job Post
              </button>
            </div>
          )}
        </section>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <p>
            Showing {filteredJobs.length === 0 ? 0 : (page - 1) * ITEMS_PER_PAGE + 1}-{Math.min(page * ITEMS_PER_PAGE, filteredJobs.length)} of {filteredJobs.length} postings
          </p>
          <div className="flex items-center gap-2">
            <button className="rounded border border-slate-300 p-1 disabled:opacity-40" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-slate-800">Page {page} / {totalPages}</span>
            <button className="rounded border border-slate-300 p-1 disabled:opacity-40" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </footer>
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
