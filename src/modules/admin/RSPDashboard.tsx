import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Filter,
  Lock,
  Mail,
  Plus,
  Search,
  Settings,
  Shield,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Sidebar } from '../../components/Sidebar';
import { supabase } from '../../lib/supabase';
import '../../styles/admin.css';

type JobStatus = 'Open' | 'Reviewing' | 'Closed';
type Section = 'dashboard' | 'jobs' | 'qualified' | 'new-hired' | 'raters' | 'accounts' | 'reports' | 'settings';

interface JobRecord {
  id: number | string;
  title: string;
  item_number: string;
  department: string;
  status: JobStatus;
  created_at: string;
  applicant_count: number;
}

interface ApplicantRecord {
  id: string;
  full_name: string;
  email: string;
  contact_number: string;
  position: string;
  office: string;
  status: string;
  created_at: string;
  total_score: number | null;
}

interface RaterRecord {
  id: number;
  name: string;
  email: string;
  department: string;
  is_active: boolean;
  last_login: string | null;
}

const SETTINGS_TABS = [
  { id: 'profile', label: 'Profile Settings', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'system', label: 'System Settings', icon: Settings },
  { id: 'email', label: 'Email Configuration', icon: Mail },
  { id: 'appearance', label: 'Appearance', icon: Briefcase },
  { id: 'localization', label: 'Localization', icon: Building2 },
] as const;

const resolveSection = (pathname: string, search: string): Section => {
  if (pathname === '/admin/rsp/jobs') return 'jobs';
  if (pathname === '/admin/rsp/qualified') return 'qualified';
  if (pathname === '/admin/rsp/new-hired') return 'new-hired';
  if (pathname === '/admin/rsp/raters' || pathname === '/admin/raters') return 'raters';
  if (pathname === '/admin/rsp/accounts') return 'accounts';
  if (pathname === '/admin/rsp/reports') return 'reports';
  if (pathname === '/admin/rsp/settings' || pathname === '/admin/settings') return 'settings';

  const module = new URLSearchParams(search).get('module');
  if (pathname === '/admin' && module === 'rsp') return 'dashboard';

  return 'dashboard';
};

const formatDate = (dateValue: string) => {
  if (!dateValue) return '--';
  return new Date(dateValue).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getStatusClass = (status: string) => {
  const lowered = status.toLowerCase();
  if (lowered.includes('open')) return 'bg-green-100 text-green-700';
  if (lowered.includes('review')) return 'bg-blue-100 text-blue-700';
  if (lowered.includes('closed')) return 'bg-slate-200 text-slate-700';
  if (lowered.includes('qualified') || lowered.includes('completed')) return 'bg-emerald-100 text-emerald-700';
  if (lowered.includes('pending')) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

const applicantNameFromRow = (row: any) => {
  if (typeof row?.name === 'string' && row.name.trim().length > 0) return row.name;
  const first = row?.first_name ?? '';
  const middle = row?.middle_name ?? '';
  const last = row?.last_name ?? '';
  return `${first} ${middle} ${last}`.replace(/\s+/g, ' ').trim() || 'Unnamed Applicant';
};

export const RSPDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const section = resolveSection(location.pathname, location.search);

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [applicants, setApplicants] = useState<ApplicantRecord[]>([]);
  const [raters, setRaters] = useState<RaterRecord[]>([]);
  const [completedEvaluationIds, setCompletedEvaluationIds] = useState<Set<string>>(new Set());

  const [jobsSearch, setJobsSearch] = useState('');
  const [jobsStatus, setJobsStatus] = useState('all');
  const [jobsOffice, setJobsOffice] = useState('all');
  const [jobsPage, setJobsPage] = useState(0);

  const [qualifiedTab, setQualifiedTab] = useState<'all' | 'completed' | 'pending'>('all');
  const [qualifiedSearch, setQualifiedSearch] = useState('');
  const [qualifiedPosition, setQualifiedPosition] = useState('all');
  const [qualifiedOffice, setQualifiedOffice] = useState('all');

  const [raterSearch, setRaterSearch] = useState('');
  const [raterStatus, setRaterStatus] = useState('all');

  const [showJobDialog, setShowJobDialog] = useState(false);
  const [showRaterDialog, setShowRaterDialog] = useState(false);

  const [newJob, setNewJob] = useState({
    title: '',
    item_number: '',
    department: '',
    status: 'Open' as JobStatus,
  });

  const [newRater, setNewRater] = useState({
    name: '',
    email: '',
    department: '',
  });

  const [settingsTab, setSettingsTab] = useState<(typeof SETTINGS_TABS)[number]['id']>('profile');
  const [profileForm, setProfileForm] = useState({
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    email: 'juan.delacruz@iloilo.gov.ph',
    role: 'RSP',
    department: 'Human Resource Management Office',
    bio: '',
  });

  useEffect(() => {
    const load = async () => {
      const [jobPostingsRes, jobsRes, applicantsRes, ratersRes, evaluationsRes] = await Promise.allSettled([
        supabase.from('job_postings').select('*').order('created_at', { ascending: false }),
        supabase.from('jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('applicants').select('*').order('created_at', { ascending: false }),
        supabase.from('raters').select('*').order('created_at', { ascending: false }),
        supabase.from('evaluations').select('*'),
      ]);

      const jobsSource =
        jobPostingsRes.status === 'fulfilled' && !jobPostingsRes.value.error && Array.isArray(jobPostingsRes.value.data)
          ? jobPostingsRes.value.data
          : jobsRes.status === 'fulfilled' && !jobsRes.value.error && Array.isArray(jobsRes.value.data)
            ? jobsRes.value.data
            : [];

      if (jobsSource.length > 0) {
        const normalized = jobsSource.map((item: any, index: number) => ({
          id: item?.id ?? `job-${index + 1}`,
          title: String(item?.title ?? ''),
          item_number: String(item?.item_number ?? ''),
          department: String(item?.department ?? item?.office ?? 'Unassigned'),
          status:
            item?.status === 'Closed'
              ? 'Closed'
              : item?.status === 'On Hold' || item?.status === 'Reviewing'
                ? 'Reviewing'
                : 'Open',
          created_at: String(item?.created_at ?? new Date().toISOString()),
          applicant_count: 0,
        } as JobRecord));
        setJobs(normalized);
      } else {
        setJobs([]);
      }

      if (applicantsRes.status === 'fulfilled' && !applicantsRes.value.error && Array.isArray(applicantsRes.value.data)) {
        const normalized = applicantsRes.value.data.map((item: any) => ({
          id: String(item?.id ?? crypto.randomUUID()),
          full_name: applicantNameFromRow(item),
          email: String(item?.email ?? ''),
          contact_number: String(item?.contact_number ?? ''),
          position: String(item?.position ?? ''),
          office: String(item?.office ?? item?.department ?? 'Unassigned'),
          status: String(item?.status ?? 'Pending'),
          created_at: String(item?.created_at ?? new Date().toISOString()),
          total_score: typeof item?.total_score === 'number' ? item.total_score : null,
        }));
        setApplicants(normalized);
      } else {
        setApplicants([]);
      }

      if (ratersRes.status === 'fulfilled' && !ratersRes.value.error && Array.isArray(ratersRes.value.data)) {
        const normalized = ratersRes.value.data.map((item: any, index: number) => ({
          id: Number(item?.id ?? index + 1),
          name: String(item?.name ?? ''),
          email: String(item?.email ?? ''),
          department: String(item?.department ?? 'Unassigned'),
          is_active: Boolean(item?.is_active ?? true),
          last_login: item?.last_login ? String(item.last_login) : null,
        }));
        setRaters(normalized);
      } else {
        setRaters([]);
      }

      if (evaluationsRes.status === 'fulfilled' && !evaluationsRes.value.error && Array.isArray(evaluationsRes.value.data)) {
        const completed = new Set<string>();
        evaluationsRes.value.data.forEach((item: any) => {
          const hasScore =
            (typeof item?.overall_score === 'number' && item.overall_score > 0) ||
            (typeof item?.overall_impression_score === 'number' && item.overall_impression_score > 0);
          if (hasScore && item?.applicant_id) {
            completed.add(String(item.applicant_id));
          }
        });
        setCompletedEvaluationIds(completed);
      } else {
        setCompletedEvaluationIds(new Set());
      }
    };

    load();
  }, []);

  const jobsWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    applicants.forEach((applicant) => {
      const key = applicant.position;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    return jobs.map((job) => ({
      ...job,
      applicant_count: counts.get(job.title) ?? 0,
    }));
  }, [jobs, applicants]);

  const dashboardStats = useMemo(() => {
    const totalJobs = jobsWithCounts.filter((job) => job.status !== 'Closed').length;
    const totalApplicants = applicants.length;
    const shortlisted = applicants.filter((applicant) =>
      ['shortlisted', 'reviewed', 'qualified', 'accepted'].includes(applicant.status.toLowerCase())
    ).length;
    const underReview = jobsWithCounts.filter((job) => job.status === 'Reviewing').length;

    return { totalJobs, totalApplicants, shortlisted, underReview };
  }, [jobsWithCounts, applicants]);

  const funnelStats = useMemo(() => {
    const pending = applicants.filter((a) => a.status.toLowerCase().includes('pending')).length;
    const reviewed = applicants.filter((a) => a.status.toLowerCase().includes('review')).length;
    const shortlisted = applicants.filter((a) => a.status.toLowerCase().includes('shortlist')).length;
    const qualified = applicants.filter((a) => a.status.toLowerCase().includes('qualif')).length;
    return { pending, reviewed, shortlisted, qualified };
  }, [applicants]);

  const officeOptions = useMemo(() => Array.from(new Set(applicants.map((a) => a.office).filter(Boolean))), [applicants]);
  const positionOptions = useMemo(() => Array.from(new Set(applicants.map((a) => a.position).filter(Boolean))), [applicants]);

  const filteredJobs = useMemo(() => {
    return jobsWithCounts.filter((job) => {
      const term = jobsSearch.toLowerCase();
      const matchesSearch =
        !term ||
        job.title.toLowerCase().includes(term) ||
        job.item_number.toLowerCase().includes(term);
      const matchesStatus = jobsStatus === 'all' || job.status.toLowerCase() === jobsStatus;
      const matchesOffice = jobsOffice === 'all' || job.department === jobsOffice;
      return matchesSearch && matchesStatus && matchesOffice;
    });
  }, [jobsWithCounts, jobsSearch, jobsStatus, jobsOffice]);

  const jobsPerPage = 6;
  const pageCount = Math.max(1, Math.ceil(filteredJobs.length / jobsPerPage));
  const safePage = Math.min(jobsPage, pageCount - 1);
  const pagedJobs = filteredJobs.slice(safePage * jobsPerPage, safePage * jobsPerPage + jobsPerPage);

  const qualifiedApplicants = useMemo(() => {
    const base = applicants.filter((applicant) => {
      const normalized = applicant.status.toLowerCase();
      return normalized.includes('qualified') || normalized.includes('shortlist') || completedEvaluationIds.has(applicant.id);
    });

    const withEvaluationState = base.map((applicant) => ({
      ...applicant,
      evaluation_state: completedEvaluationIds.has(applicant.id) ? 'completed' : 'pending',
    }));

    return withEvaluationState.filter((applicant) => {
      if (qualifiedTab !== 'all' && applicant.evaluation_state !== qualifiedTab) return false;
      if (qualifiedPosition !== 'all' && applicant.position !== qualifiedPosition) return false;
      if (qualifiedOffice !== 'all' && applicant.office !== qualifiedOffice) return false;

      const term = qualifiedSearch.toLowerCase();
      if (!term) return true;

      return (
        applicant.full_name.toLowerCase().includes(term) ||
        applicant.position.toLowerCase().includes(term) ||
        applicant.office.toLowerCase().includes(term)
      );
    });
  }, [applicants, completedEvaluationIds, qualifiedTab, qualifiedPosition, qualifiedOffice, qualifiedSearch]);

  const avgQualifiedScore = useMemo(() => {
    if (qualifiedApplicants.length === 0) return 0;
    const scored = qualifiedApplicants.filter((applicant) => typeof applicant.total_score === 'number') as Array<
      ApplicantRecord & { total_score: number }
    >;
    if (scored.length === 0) return 0;
    return scored.reduce((sum, applicant) => sum + applicant.total_score, 0) / scored.length;
  }, [qualifiedApplicants]);

  const newlyHiredApplicants = useMemo(
    () => applicants.filter((applicant) => ['accepted', 'hired', 'qualified'].includes(applicant.status.toLowerCase())),
    [applicants]
  );

  const departmentsSummary = useMemo(() => {
    const map = new Map<string, { hires: number; pending: number }>();
    newlyHiredApplicants.forEach((applicant) => {
      const current = map.get(applicant.office) ?? { hires: 0, pending: 0 };
      current.hires += 1;
      if (!completedEvaluationIds.has(applicant.id)) {
        current.pending += 1;
      }
      map.set(applicant.office, current);
    });
    return Array.from(map.entries()).map(([department, value]) => ({ department, ...value }));
  }, [newlyHiredApplicants, completedEvaluationIds]);

  const filteredRaters = useMemo(() => {
    return raters.filter((rater) => {
      const term = raterSearch.toLowerCase();
      const matchesSearch =
        !term ||
        rater.name.toLowerCase().includes(term) ||
        rater.email.toLowerCase().includes(term) ||
        rater.department.toLowerCase().includes(term);
      const matchesStatus = raterStatus === 'all' || (raterStatus === 'active' ? rater.is_active : !rater.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [raters, raterSearch, raterStatus]);

  const sectionTitle = {
    dashboard: 'RSP Dashboard',
    jobs: 'Job Postings Management',
    qualified: 'Qualified Applicants',
    'new-hired': 'Newly Hired Employees',
    raters: 'Rater Management & Access Control',
    accounts: 'Account Management',
    reports: 'Reports & Document Generation',
    settings: 'Settings',
  }[section];

  const goToSection = (target: Section) => {
    if (target === 'dashboard') navigate('/admin/rsp');
    if (target === 'jobs') navigate('/admin/rsp/jobs');
    if (target === 'qualified') navigate('/admin/rsp/qualified');
    if (target === 'new-hired') navigate('/admin/rsp/new-hired');
    if (target === 'raters') navigate('/admin/rsp/raters');
    if (target === 'accounts') navigate('/admin/rsp/accounts');
    if (target === 'reports') navigate('/admin/rsp/reports');
    if (target === 'settings') navigate('/admin/rsp/settings');
  };

  const handleCreateJob = async () => {
    if (!newJob.title || !newJob.item_number || !newJob.department) return;

    const payload = {
      title: newJob.title,
      item_number: newJob.item_number,
      department: newJob.department,
      office: newJob.department,
      status: newJob.status,
      created_at: new Date().toISOString(),
    };

    const numericIds = jobs
      .map((job) => (typeof job.id === 'number' ? job.id : Number.NaN))
      .filter((id) => Number.isFinite(id)) as number[];
    const localId = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1;
    setJobs((prev) => [{ ...payload, id: localId, applicant_count: 0 }, ...prev]);

    try {
      await Promise.allSettled([
        supabase.from('job_postings').insert([payload]),
        supabase.from('jobs').insert([payload]),
      ]);
    } catch {
    }

    setShowJobDialog(false);
    setNewJob({ title: '', item_number: '', department: '', status: 'Open' });
  };

  const handleDeleteJob = async (job: JobRecord) => {
    setJobs((prev) => prev.filter((item) => item.id !== job.id));
    try {
      await Promise.allSettled([
        supabase.from('job_postings').delete().eq('id', job.id),
        supabase.from('jobs').delete().eq('id', job.id),
        supabase.from('job_postings').delete().eq('title', job.title).eq('item_number', job.item_number),
        supabase.from('jobs').delete().eq('title', job.title).eq('item_number', job.item_number),
      ]);
    } catch {
    }
  };

  const handleToggleJobStatus = async (job: JobRecord) => {
    const updatedStatus: JobStatus = job.status === 'Closed' ? 'Open' : 'Closed';
    setJobs((prev) => prev.map((item) => (item.id === job.id ? { ...item, status: updatedStatus } : item)));
    try {
      await Promise.allSettled([
        supabase.from('job_postings').update({ status: updatedStatus }).eq('id', job.id),
        supabase.from('jobs').update({ status: updatedStatus }).eq('id', job.id),
        supabase.from('job_postings').update({ status: updatedStatus }).eq('title', job.title).eq('item_number', job.item_number),
        supabase.from('jobs').update({ status: updatedStatus }).eq('title', job.title).eq('item_number', job.item_number),
      ]);
    } catch {
    }
  };

  const handleCreateRater = async () => {
    if (!newRater.name || !newRater.email || !newRater.department) return;

    const localId = raters.length > 0 ? Math.max(...raters.map((rater) => rater.id)) + 1 : 1;
    const payload: RaterRecord = {
      id: localId,
      name: newRater.name,
      email: newRater.email,
      department: newRater.department,
      is_active: true,
      last_login: null,
    };

    setRaters((prev) => [payload, ...prev]);
    try {
      await supabase.from('raters').insert([{ ...payload, id: undefined }]);
    } catch {
    }

    setShowRaterDialog(false);
    setNewRater({ name: '', email: '', department: '' });
  };

  const handleDeleteRater = async (id: number) => {
    setRaters((prev) => prev.filter((rater) => rater.id !== id));
    try {
      await supabase.from('raters').delete().eq('id', id);
    } catch {
    }
  };

  const urgentItems = [
    {
      title: 'Deadline Approaching',
      subtitle:
        jobsWithCounts.length > 0
          ? `${jobsWithCounts[0].title} closes soon`
          : 'No active job deadlines found',
      color: 'border-l-[4px] border-l-orange-500 bg-orange-50',
    },
    {
      title: 'Pending Reviews',
      subtitle: `${funnelStats.pending} applications awaiting initial review`,
      color: 'border-l-[4px] border-l-blue-500 bg-blue-50',
    },
  ];

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />

      <main className="admin-content !p-0">
        <div className="border-b border-[var(--border-color)] bg-white px-10 py-8">
          <h1 className="!mb-1 text-3xl font-bold">{sectionTitle}</h1>
          <p className="!mb-0 text-lg text-[var(--text-secondary)]">
            {section === 'dashboard' && 'Overview of recruitment, selection and placement activities'}
            {section === 'jobs' && 'Manage and monitor all job positions and their applicants'}
            {section === 'qualified' && 'List of applicants who passed the evaluation and are eligible for further processing'}
            {section === 'new-hired' && 'Generate employee accounts for newly hired staff'}
            {section === 'raters' && 'Assign raters and define their evaluation access for specific job positions'}
            {section === 'accounts' && 'Manage employee accounts and information'}
            {section === 'reports' && 'Generate official government reports and access employee documents'}
            {section === 'settings' && 'Manage your personal information and account details'}
          </p>
        </div>

        <div className="space-y-8 p-10">
          {section === 'dashboard' && (
            <>
              <section className="grid grid-cols-1 gap-5 xl:grid-cols-4">
                {[
                  { label: 'Total Job Openings', value: dashboardStats.totalJobs, icon: FileText, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
                  { label: 'Total Applicants', value: dashboardStats.totalApplicants, icon: Users, iconBg: 'bg-green-100', iconColor: 'text-green-600' },
                  { label: 'Shortlisted Applicants', value: dashboardStats.shortlisted, icon: UserCheck, iconBg: 'bg-purple-100', iconColor: 'text-purple-600' },
                  { label: 'Positions Under Review', value: dashboardStats.underReview, icon: Clock3, iconBg: 'bg-orange-100', iconColor: 'text-orange-600' },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <article key={card.label} className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="!mb-2 text-sm text-[var(--text-secondary)]">{card.label}</p>
                          <p className="!mb-0 text-3xl font-bold text-[var(--text-primary)]">{card.value}</p>
                        </div>
                        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${card.iconBg}`}>
                          <Icon className={card.iconColor} size={28} />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>

              <section>
                <h2 className="!mb-4 text-xl font-semibold">Quick Actions</h2>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  {[
                    { title: 'Manage Job Postings', subtitle: 'View and manage all positions', icon: FileText, action: 'jobs' as Section },
                    { title: 'Qualified Applicants', subtitle: 'View all qualified candidates', icon: UserCheck, action: 'qualified' as Section },
                    { title: 'All Applicants', subtitle: 'Review all submissions', icon: Users, path: '/interviewer/dashboard' },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={card.title}
                        type="button"
                        onClick={() => {
                          if ('path' in card && card.path) {
                            navigate(card.path);
                          } else if ('action' in card && card.action) {
                            goToSection(card.action as Section);
                          }
                        }}
                        className="flex items-center gap-4 rounded-2xl border border-[var(--border-color)] bg-white px-6 py-5 text-left transition hover:border-[var(--primary-color)]"
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                          <Icon size={28} />
                        </div>
                        <div className="flex-1">
                          <p className="!mb-1 text-lg font-semibold text-[var(--text-primary)]">{card.title}</p>
                          <p className="!mb-0 text-lg text-[var(--text-secondary)]">{card.subtitle}</p>
                        </div>
                        <ChevronRight size={26} className="text-[var(--text-muted)]" />
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <div className="space-y-4 rounded-2xl border border-[var(--border-color)] bg-white p-6 xl:col-span-2">
                  <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4">
                    <h3 className="!mb-0 text-xl font-semibold">Urgent Items</h3>
                    <Clock3 className="text-orange-500" size={24} />
                  </div>
                  {urgentItems.map((item) => (
                    <article key={item.title} className={`rounded-2xl p-5 ${item.color}`}>
                      <p className="!mb-1 text-lg font-semibold text-[var(--text-primary)]">{item.title}</p>
                      <p className="!mb-0 text-base text-[var(--text-secondary)]">{item.subtitle}</p>
                    </article>
                  ))}
                </div>

                <div className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                  <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4">
                    <h3 className="!mb-0 text-xl font-semibold">Application Funnel</h3>
                    <ChevronRight className="rotate-[-45deg] text-blue-600" size={22} />
                  </div>
                  <div className="space-y-4 pt-5">
                    {[
                      { label: 'Pending', value: funnelStats.pending, color: 'bg-amber-500' },
                      { label: 'Reviewed', value: funnelStats.reviewed, color: 'bg-blue-500' },
                      { label: 'Shortlisted', value: funnelStats.shortlisted, color: 'bg-purple-500' },
                      { label: 'Qualified', value: funnelStats.qualified, color: 'bg-green-500' },
                    ].map((item) => {
                      const maxValue = Math.max(1, funnelStats.pending, funnelStats.reviewed, funnelStats.shortlisted, funnelStats.qualified);
                      const width = `${(item.value / maxValue) * 100}%`;
                      return (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between text-base">
                            <span>{item.label}</span>
                            <span className="font-semibold">{item.value}</span>
                          </div>
                          <div className="h-3 rounded-full bg-slate-200">
                            <div className={`h-3 rounded-full ${item.color}`} style={{ width }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <div className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                  <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-4">
                    <h3 className="!mb-0 text-xl font-semibold">Recent Activity</h3>
                    <Calendar className="text-[var(--text-muted)]" size={24} />
                  </div>
                  <div className="space-y-4">
                    {applicants.slice(0, 5).map((applicant) => (
                      <div key={applicant.id} className="flex items-start gap-4 border-b border-[var(--border-color)] pb-3 last:border-b-0">
                        <div className="rounded-xl bg-blue-100 p-3 text-blue-600">
                          <FileText size={20} />
                        </div>
                        <div>
                          <p className="!mb-1 text-lg text-[var(--text-primary)]">{applicant.full_name}</p>
                          <p className="!mb-0 text-lg text-[var(--text-secondary)]">{formatDate(applicant.created_at)}</p>
                        </div>
                      </div>
                    ))}
                    {applicants.length === 0 && <p className="!mb-0 text-lg text-[var(--text-secondary)]">No recent activity found.</p>}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                  <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-4">
                    <h3 className="!mb-0 text-xl font-semibold">Positions by Department</h3>
                    <Building2 className="text-[var(--text-muted)]" size={24} />
                  </div>
                  <div className="space-y-3">
                    {officeOptions.map((office) => {
                      const officeApplicants = applicants.filter((applicant) => applicant.office === office);
                      const officePositions = new Set(officeApplicants.map((applicant) => applicant.position)).size;
                      return (
                        <div key={office} className="flex items-center justify-between rounded-2xl bg-slate-50 px-5 py-4">
                          <div>
                            <p className="!mb-1 text-lg font-semibold text-[var(--text-primary)]">{office}</p>
                            <p className="!mb-0 text-lg text-[var(--text-secondary)]">{officePositions} position{officePositions === 1 ? '' : 's'}</p>
                          </div>
                          <p className="!mb-0 text-right text-2xl font-bold text-blue-600">{officeApplicants.length}</p>
                        </div>
                      );
                    })}
                    {officeOptions.length === 0 && <p className="!mb-0 text-lg text-[var(--text-secondary)]">No department data available.</p>}
                  </div>
                </div>
              </section>
            </>
          )}

          {section === 'jobs' && (
            <>
              <div className="flex justify-end">
                <Button onClick={() => setShowJobDialog(true)} className="!px-6 !py-3 text-base">
                  <Plus size={20} /> Add New Position
                </Button>
              </div>

              <section className="rounded-2xl border border-[var(--border-color)] bg-white">
                <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-3">
                  <div className="relative xl:col-span-1">
                    <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      value={jobsSearch}
                      onChange={(e) => {
                        setJobsSearch(e.target.value);
                        setJobsPage(0);
                      }}
                      placeholder="Search by job title or item number..."
                      className="w-full rounded-xl border border-[var(--border-color)] py-3 pl-11 pr-4 text-lg"
                    />
                  </div>
                  <div className="relative">
                    <Filter size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <select
                      value={jobsStatus}
                      onChange={(e) => {
                        setJobsStatus(e.target.value);
                        setJobsPage(0);
                      }}
                      className="w-full rounded-xl border border-[var(--border-color)] py-3 pl-11 pr-4 text-lg"
                    >
                      <option value="all">All Status</option>
                      <option value="open">Open</option>
                      <option value="reviewing">Reviewing</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                  <div>
                    <select
                      value={jobsOffice}
                      onChange={(e) => {
                        setJobsOffice(e.target.value);
                        setJobsPage(0);
                      }}
                      className="w-full rounded-xl border border-[var(--border-color)] p-3 text-lg"
                    >
                      <option value="all">All Offices</option>
                      {officeOptions.map((office) => (
                        <option key={office} value={office}>{office}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="border-t border-[var(--border-color)] px-5 py-4 text-base text-[var(--text-secondary)]">
                  Showing <span className="font-semibold text-[var(--text-primary)]">{filteredJobs.length}</span> job positions
                </div>
              </section>

              <div className="text-center text-lg text-[var(--text-secondary)]">
                Position {filteredJobs.length === 0 ? 0 : safePage * jobsPerPage + 1} to {Math.min((safePage + 1) * jobsPerPage, filteredJobs.length)} of {filteredJobs.length}
              </div>

              <section className="flex items-start gap-4">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setJobsPage((prev) => Math.max(0, prev - 1))}
                  className="rounded-xl border border-[var(--border-color)] bg-white p-3 text-[var(--text-muted)] disabled:opacity-40"
                >
                  <ChevronLeft size={28} />
                </button>

                <div className="grid flex-1 grid-cols-1 gap-5 xl:grid-cols-3">
                  {pagedJobs.map((job) => (
                    <article key={job.id} className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <h3 className="!mb-0 text-2xl font-semibold text-[var(--text-primary)]">{job.title}</h3>
                        <span className={`rounded-full px-4 py-1 text-base font-semibold ${getStatusClass(job.status)}`}>{job.status}</span>
                      </div>
                      <p className="!mb-3 text-lg text-[var(--text-secondary)]">Item No. {job.item_number}</p>
                      <p className="!mb-1 flex items-center gap-2 text-base text-[var(--text-secondary)]"><Building2 size={18} /> {job.department}</p>
                      <p className="!mb-1 flex items-center gap-2 text-base text-[var(--text-secondary)]"><Calendar size={18} /> Posted {formatDate(job.created_at)}</p>
                      <p className="!mb-5 flex items-center gap-2 text-base text-[var(--text-secondary)]"><Users size={18} /> {job.applicant_count} Applicants</p>

                      <Button className="mb-3 w-full !py-3 text-base" onClick={() => navigate(`/interviewer/applicants?position=${encodeURIComponent(job.title)}`)}>
                        View Applicants <ChevronRight size={16} />
                      </Button>

                      <button
                        type="button"
                        className="mb-3 w-full rounded-xl border border-orange-300 py-3 text-base text-orange-600"
                        onClick={() => handleToggleJobStatus(job)}
                      >
                        <Lock size={16} className="mr-2 inline-block" />
                        {job.status === 'Closed' ? 'Reopen Application' : 'Close Application'}
                      </button>

                      <button
                        type="button"
                        className="w-full rounded-xl border border-red-300 py-3 text-base text-red-600"
                        onClick={() => handleDeleteJob(job)}
                      >
                        <Trash2 size={16} className="mr-2 inline-block" /> Delete
                      </button>
                    </article>
                  ))}
                  {pagedJobs.length === 0 && <p className="col-span-full text-center text-base text-[var(--text-secondary)]">No job postings found.</p>}
                </div>

                <button
                  type="button"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setJobsPage((prev) => Math.min(pageCount - 1, prev + 1))}
                  className="rounded-xl border border-[var(--border-color)] bg-white p-3 text-[var(--text-muted)] disabled:opacity-40"
                >
                  <ChevronRight size={28} />
                </button>
              </section>
            </>
          )}

          {section === 'qualified' && (
            <>
              <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="!mb-2 text-base text-[var(--text-secondary)]">Total Qualified</p>
                      <p className="!mb-0 text-3xl font-bold">{qualifiedApplicants.length}</p>
                    </div>
                    <div className="rounded-2xl bg-blue-100 p-4 text-blue-600"><UserCheck size={28} /></div>
                  </div>
                </article>
                <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="!mb-2 text-base text-[var(--text-secondary)]">Average Score</p>
                      <p className="!mb-0 text-3xl font-bold">{avgQualifiedScore.toFixed(1)}</p>
                    </div>
                    <div className="rounded-2xl bg-purple-100 p-4 text-purple-600"><Calculator size={28} /></div>
                  </div>
                </article>
              </section>

              <section className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                <div className="mb-5 flex flex-wrap gap-3 border-b border-[var(--border-color)] pb-4">
                  {[
                    { key: 'all', label: 'All Applicants', count: qualifiedApplicants.length },
                    { key: 'completed', label: 'Completed', count: qualifiedApplicants.filter((a) => completedEvaluationIds.has(a.id)).length },
                    { key: 'pending', label: 'Pending', count: qualifiedApplicants.filter((a) => !completedEvaluationIds.has(a.id)).length },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setQualifiedTab(tab.key as 'all' | 'completed' | 'pending')}
                      className={`rounded-xl px-5 py-2 text-base font-semibold ${qualifiedTab === tab.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-[var(--text-primary)]'}`}
                    >
                      {tab.label} <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 text-base text-[var(--text-primary)]">{tab.count}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <div className="relative xl:col-span-1">
                    <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      value={qualifiedSearch}
                      onChange={(e) => setQualifiedSearch(e.target.value)}
                      placeholder="Search by name, position, or office..."
                      className="w-full rounded-xl border border-[var(--border-color)] py-3 pl-11 pr-4 text-lg"
                    />
                  </div>
                  <div>
                    <select value={qualifiedPosition} onChange={(e) => setQualifiedPosition(e.target.value)} className="w-full rounded-xl border border-[var(--border-color)] p-3 text-lg">
                      <option value="all">All Positions</option>
                      {positionOptions.map((position) => (
                        <option key={position} value={position}>{position}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <select value={qualifiedOffice} onChange={(e) => setQualifiedOffice(e.target.value)} className="w-full rounded-xl border border-[var(--border-color)] p-3 text-lg">
                      <option value="all">All Offices</option>
                      {officeOptions.map((office) => (
                        <option key={office} value={office}>{office}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <p className="text-base text-[var(--text-secondary)]">Showing <span className="font-semibold text-[var(--text-primary)]">{qualifiedApplicants.length}</span> qualified applicants</p>

              <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-white">
                <table className="w-full border-collapse">
                  <thead className="bg-slate-50 text-left text-sm uppercase tracking-wide text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-5 py-4">Applicant Name</th>
                      <th className="px-5 py-4">Position Applied For</th>
                      <th className="px-5 py-4">Office / Department</th>
                      <th className="px-5 py-4">Total Score</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4">Date Qualified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qualifiedApplicants.map((applicant) => (
                      <tr key={applicant.id} className="border-t border-[var(--border-color)] text-lg">
                        <td className="px-5 py-4 font-semibold text-blue-600">
                          <button type="button" className="hover:underline" onClick={() => navigate(`/interviewer/evaluate/${applicant.id}`)}>
                            {applicant.full_name}
                          </button>
                        </td>
                        <td className="px-5 py-4">{applicant.position || '--'}</td>
                        <td className="px-5 py-4">{applicant.office || '--'}</td>
                        <td className="px-5 py-4 font-semibold text-emerald-600">
                          {typeof applicant.total_score === 'number' ? `${applicant.total_score.toFixed(1)} / 100` : '--'}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${completedEvaluationIds.has(applicant.id) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {completedEvaluationIds.has(applicant.id) ? 'Completed' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-5 py-4">{formatDate(applicant.created_at)}</td>
                      </tr>
                    ))}
                    {qualifiedApplicants.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-base text-[var(--text-secondary)]">No qualified applicants found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {section === 'new-hired' && (
            <>
              <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="!mb-2 text-base text-[var(--text-secondary)]">Total Newly Hired</p>
                      <p className="!mb-0 text-3xl font-bold">{newlyHiredApplicants.length}</p>
                    </div>
                    <div className="rounded-2xl bg-blue-100 p-4 text-blue-600"><UserPlus size={28} /></div>
                  </div>
                </article>
                <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="!mb-2 text-base text-[var(--text-secondary)]">With Credentials</p>
                      <p className="!mb-0 text-3xl font-bold text-green-600">{newlyHiredApplicants.filter((a) => completedEvaluationIds.has(a.id)).length}</p>
                    </div>
                    <div className="rounded-2xl bg-green-100 p-4 text-green-600"><UserCheck size={28} /></div>
                  </div>
                </article>
                <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="!mb-2 text-base text-[var(--text-secondary)]">Pending Credentials</p>
                      <p className="!mb-0 text-3xl font-bold text-orange-600">{newlyHiredApplicants.filter((a) => !completedEvaluationIds.has(a.id)).length}</p>
                    </div>
                    <div className="rounded-2xl bg-orange-100 p-4 text-orange-600"><Lock size={28} /></div>
                  </div>
                </article>
              </section>

              <h2 className="!mb-3 text-xl font-semibold">Departments</h2>
              <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                {departmentsSummary.map((department) => (
                  <article key={department.department} className="flex items-center gap-4 rounded-2xl border border-[var(--border-color)] bg-white p-6">
                    <div className="rounded-2xl bg-blue-100 p-4 text-blue-600"><Building2 size={28} /></div>
                    <div className="flex-1">
                      <p className="!mb-1 text-2xl font-semibold text-[var(--text-primary)]">{department.department}</p>
                      <p className="!mb-0 text-base text-[var(--text-secondary)]">{department.hires} Newly Hired</p>
                      <p className="!mb-0 text-base text-[var(--text-secondary)]">{department.pending} pending</p>
                    </div>
                    <ChevronRight size={24} className="text-[var(--text-muted)]" />
                  </article>
                ))}
                {departmentsSummary.length === 0 && <p className="col-span-full text-base text-[var(--text-secondary)]">No newly hired records found.</p>}
              </section>
            </>
          )}

          {section === 'raters' && (
            <>
              <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="!mb-2 text-base text-[var(--text-secondary)]">Total Raters</p>
                      <p className="!mb-0 text-3xl font-bold">{raters.length}</p>
                    </div>
                    <div className="rounded-2xl bg-blue-100 p-4 text-blue-600"><Users size={28} /></div>
                  </div>
                </article>
                <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="!mb-2 text-base text-[var(--text-secondary)]">Active Raters</p>
                      <p className="!mb-0 text-3xl font-bold text-green-600">{raters.filter((r) => r.is_active).length}</p>
                    </div>
                    <div className="rounded-2xl bg-green-100 p-4 text-green-600"><UserCheck size={28} /></div>
                  </div>
                </article>
                <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="!mb-2 text-base text-[var(--text-secondary)]">Inactive Raters</p>
                      <p className="!mb-0 text-3xl font-bold text-slate-600">{raters.filter((r) => !r.is_active).length}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-100 p-4 text-slate-600"><Clock3 size={28} /></div>
                  </div>
                </article>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-3">
                  <Button className="!px-6 !py-3 text-base" onClick={() => setShowRaterDialog(true)}>
                    <Plus size={18} /> Add New Rater
                  </Button>
                  <button type="button" className="rounded-xl border border-[var(--border-color)] bg-white px-6 py-3 text-base text-[var(--text-secondary)]">
                    <Download size={18} className="mr-2 inline-block" /> Download Rater List
                  </button>
                </div>
                <div className="flex w-full gap-3 xl:w-auto">
                  <div className="relative flex-1 xl:w-80">
                    <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      value={raterSearch}
                      onChange={(e) => setRaterSearch(e.target.value)}
                      placeholder="Search raters..."
                      className="w-full rounded-xl border border-[var(--border-color)] py-3 pl-11 pr-4 text-lg"
                    />
                  </div>
                  <select value={raterStatus} onChange={(e) => setRaterStatus(e.target.value)} className="rounded-xl border border-[var(--border-color)] px-4 py-3 text-lg">
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-white">
                <table className="w-full border-collapse">
                  <thead className="bg-slate-50 text-left text-sm uppercase tracking-wide text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-5 py-4">Rater Name</th>
                      <th className="px-5 py-4">Designation / Position</th>
                      <th className="px-5 py-4">Access Role</th>
                      <th className="px-5 py-4">Assigned Job Position(s)</th>
                      <th className="px-5 py-4">Last Login</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRaters.map((rater) => (
                      <tr key={rater.id} className="border-t border-[var(--border-color)] text-lg">
                        <td className="px-5 py-4 font-semibold text-[var(--text-primary)]">{rater.name}</td>
                        <td className="px-5 py-4 text-[var(--text-secondary)]">{rater.department}</td>
                        <td className="px-5 py-4"><span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-700">Interviewer</span></td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            {jobsWithCounts.slice(0, 2).map((job) => (
                              <span key={`${rater.id}-${job.id}`} className="rounded-md bg-blue-50 px-2 py-1 text-sm text-blue-700">{job.title}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-[var(--text-secondary)]">{rater.last_login ? formatDate(rater.last_login) : '--'}</td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${rater.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'}`}>
                            {rater.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <button type="button" className="mr-2 rounded-lg border border-[var(--border-color)] px-3 py-1 text-blue-600" onClick={() => setRaters((prev) => prev.map((item) => (item.id === rater.id ? { ...item, is_active: !item.is_active } : item)))}>Edit</button>
                          <button type="button" className="rounded-lg border border-red-300 px-3 py-1 text-red-600" onClick={() => handleDeleteRater(rater.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                    {filteredRaters.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-8 text-center text-base text-[var(--text-secondary)]">No raters found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {section === 'accounts' && (
            <>
              <section className="rounded-2xl border border-[var(--border-color)] bg-white p-6 xl:w-3/5">
                <button
                  type="button"
                  onClick={() => navigate('/employee/dashboard')}
                  className="flex w-full items-center gap-4 rounded-2xl border border-[var(--border-color)] px-6 py-6 text-left transition hover:border-[var(--primary-color)]"
                >
                  <div className="rounded-2xl bg-blue-100 p-4 text-blue-600"><Users size={28} /></div>
                  <div className="flex-1">
                    <p className="!mb-1 text-2xl font-semibold text-[var(--text-primary)]">Employee Directory</p>
                    <p className="!mb-0 text-lg text-[var(--text-secondary)]">View and manage all employee accounts, personal information, and document requirements</p>
                  </div>
                  <ChevronRight size={30} className="text-[var(--text-muted)]" />
                </button>
              </section>

              <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6 xl:w-3/5">
                <h3 className="!mb-3 text-xl font-semibold text-blue-900">What you can do:</h3>
                <ul className="list-disc space-y-2 pl-6 text-base text-blue-800">
                  <li>View all employees organized by position</li>
                  <li>Access detailed employee profiles with personal information</li>
                  <li>Request and manage employee document submissions</li>
                  <li>Approve or request resubmission of documents</li>
                </ul>
              </section>
            </>
          )}

          {section === 'reports' && (
            <>
              <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {[
                  {
                    title: 'Application Ranking Report',
                    subtitle: 'Generate comparative assessment reports with applicant rankings',
                    icon: FileText,
                    color: 'bg-blue-100 text-blue-600',
                    path: '/interviewer/dashboard',
                  },
                  {
                    title: 'Assessment Forms',
                    subtitle: 'View and print individual applicant assessment reports',
                    icon: Briefcase,
                    color: 'bg-green-100 text-green-600',
                    path: '/interviewer/applicants',
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.title}
                      type="button"
                      onClick={() => navigate(card.path)}
                      className="rounded-2xl border border-[var(--border-color)] bg-white p-6 text-left transition hover:border-[var(--primary-color)]"
                    >
                      <div className="mb-8 flex items-start justify-between">
                        <div className={`rounded-2xl p-4 ${card.color}`}><Icon size={30} /></div>
                        <ChevronRight size={28} className="text-[var(--text-muted)]" />
                      </div>
                      <h3 className="!mb-2 text-2xl font-semibold">{card.title}</h3>
                      <p className="!mb-4 text-lg text-[var(--text-secondary)]">{card.subtitle}</p>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-lg text-[var(--text-secondary)]">Official Template</span>
                    </button>
                  );
                })}
              </section>

              <section>
                <h2 className="!mb-1 text-2xl font-semibold">Employee Documents</h2>
                <p className="text-lg text-[var(--text-secondary)]">Access and download documents submitted by employees</p>
              </section>
            </>
          )}

          {section === 'settings' && (
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-[var(--border-color)] bg-white p-3">
                {SETTINGS_TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSettingsTab(tab.id)}
                      className={`mb-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base ${settingsTab === tab.id ? 'bg-blue-100 text-blue-700' : 'text-[var(--text-primary)] hover:bg-slate-50'}`}
                    >
                      <Icon size={22} /> {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
                <h3 className="!mb-1 text-2xl font-semibold">Profile Settings</h3>
                <p className="!mb-5 text-lg text-[var(--text-secondary)]">Manage your personal information and account details</p>

                <div className="mb-6 flex items-center gap-4">
                  <div className="rounded-full bg-blue-100 p-4 text-blue-600"><User size={42} /></div>
                  <div>
                    <Button>Change Photo</Button>
                    <p className="!mb-0 mt-2 text-lg text-[var(--text-secondary)]">JPG, PNG or GIF. Max size 2MB</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-base font-semibold">First Name</label>
                    <input className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base" value={profileForm.firstName} onChange={(e) => setProfileForm((prev) => ({ ...prev, firstName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-2 block text-base font-semibold">Last Name</label>
                    <input className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base" value={profileForm.lastName} onChange={(e) => setProfileForm((prev) => ({ ...prev, lastName: e.target.value }))} />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-base font-semibold">Email Address</label>
                  <input className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base" value={profileForm.email} onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))} />
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-base font-semibold">Role</label>
                  <input className="w-full rounded-xl border border-[var(--border-color)] bg-slate-50 p-3 text-base" value={profileForm.role} readOnly />
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-base font-semibold">Department</label>
                  <select className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base" value={profileForm.department} onChange={(e) => setProfileForm((prev) => ({ ...prev, department: e.target.value }))}>
                    <option>Human Resource Management Office</option>
                    <option>Information Technology</option>
                    <option>Finance</option>
                    <option>Operations</option>
                  </select>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-base font-semibold">Bio</label>
                  <textarea className="w-full rounded-xl border border-[var(--border-color)] p-3 text-base" rows={4} value={profileForm.bio} onChange={(e) => setProfileForm((prev) => ({ ...prev, bio: e.target.value }))} placeholder="Tell us about yourself..." />
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      <Dialog open={showJobDialog} onClose={() => setShowJobDialog(false)} title="Add New Position">
        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-[var(--border-color)] p-3"
            placeholder="Job Title"
            value={newJob.title}
            onChange={(e) => setNewJob((prev) => ({ ...prev, title: e.target.value }))}
          />
          <input
            className="w-full rounded-lg border border-[var(--border-color)] p-3"
            placeholder="Item Number"
            value={newJob.item_number}
            onChange={(e) => setNewJob((prev) => ({ ...prev, item_number: e.target.value }))}
          />
          <input
            className="w-full rounded-lg border border-[var(--border-color)] p-3"
            placeholder="Department"
            value={newJob.department}
            onChange={(e) => setNewJob((prev) => ({ ...prev, department: e.target.value }))}
          />
          <select className="w-full rounded-lg border border-[var(--border-color)] p-3" value={newJob.status} onChange={(e) => setNewJob((prev) => ({ ...prev, status: e.target.value as JobStatus }))}>
            <option value="Open">Open</option>
            <option value="Reviewing">Reviewing</option>
            <option value="Closed">Closed</option>
          </select>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowJobDialog(false)} className="w-full">Cancel</Button>
            <Button onClick={handleCreateJob} className="w-full">Save Position</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={showRaterDialog} onClose={() => setShowRaterDialog(false)} title="Add New Rater">
        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-[var(--border-color)] p-3"
            placeholder="Full Name"
            value={newRater.name}
            onChange={(e) => setNewRater((prev) => ({ ...prev, name: e.target.value }))}
          />
          <input
            className="w-full rounded-lg border border-[var(--border-color)] p-3"
            placeholder="Email Address"
            value={newRater.email}
            onChange={(e) => setNewRater((prev) => ({ ...prev, email: e.target.value }))}
          />
          <input
            className="w-full rounded-lg border border-[var(--border-color)] p-3"
            placeholder="Department"
            value={newRater.department}
            onChange={(e) => setNewRater((prev) => ({ ...prev, department: e.target.value }))}
          />
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowRaterDialog(false)} className="w-full">Cancel</Button>
            <Button onClick={handleCreateRater} className="w-full">Save Rater</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
