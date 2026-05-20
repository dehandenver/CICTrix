import { Link } from 'react-router-dom';
import {
  Briefcase,
  Users,
  ClipboardCheck,
  ShieldCheck,
  ArrowRight,
  Search,
  TrendingUp,
  GraduationCap,
  Network,
  CheckCircle2,
} from 'lucide-react';

const PORTALS = [
  {
    title: 'Job Applicant',
    description: 'Apply for open government positions and submit your requirements online.',
    icon: Briefcase,
    to: '/apply',
    cta: 'Apply Now',
    accent: 'bg-blue-600',
  },
  {
    title: 'Employee Portal',
    description: 'Access your profile, submit documents, and view performance records.',
    icon: Users,
    to: '/employee/login',
    cta: 'Employee Login',
    accent: 'bg-emerald-600',
  },
  {
    title: 'Interviewer',
    description: 'Evaluate and score applicants assigned to you for review.',
    icon: ClipboardCheck,
    to: '/interviewer/login',
    cta: 'Interviewer Login',
    accent: 'bg-violet-600',
  },
  {
    title: 'HR Administration',
    description: 'Manage recruitment, performance, learning, and succession planning.',
    icon: ShieldCheck,
    to: '/admin/login',
    cta: 'Staff Login',
    accent: 'bg-slate-800',
  },
];

const FEATURES = [
  {
    icon: Search,
    title: 'Recruitment & Selection',
    description: 'Publish job postings, screen applicants, and track every stage of hiring.',
  },
  {
    icon: TrendingUp,
    title: 'Performance Management',
    description: 'Run IPCR/DPCR evaluation cycles and monitor employee performance.',
  },
  {
    icon: GraduationCap,
    title: 'Learning & Development',
    description: 'Manage training courses, seminar enrollment, and competency growth.',
  },
  {
    icon: Network,
    title: 'Succession Planning',
    description: 'Identify critical positions and prepare ready-now successors.',
  },
];

export const LandingPage = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* ─── Top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-content-center rounded-xl bg-blue-600 text-lg font-bold text-white">
              HR
            </div>
            <div className="leading-tight">
              <p className="text-base font-bold text-slate-900">Government HRIS</p>
              <p className="text-xs text-slate-500">Human Resource Information System</p>
            </div>
          </div>
          <Link
            to="/admin/login"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Staff Login
          </Link>
        </div>
      </header>

      {/* ─── Hero ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-700" />
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-white/15" />
        <div className="absolute -bottom-28 -left-16 h-80 w-80 rounded-full border border-white/10" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 text-center text-white sm:py-28">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium">
            <CheckCircle2 size={14} /> Official Human Resource Portal
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            A modern HR system for recruitment, performance, and people development
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-blue-100 sm:text-lg">
            Apply for government positions, track your application, and access your
            employee records — all in one secure platform.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/apply"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-blue-700 shadow-lg transition hover:bg-blue-50"
            >
              <Briefcase size={18} /> Apply for a Job
            </Link>
            <Link
              to="/track"
              className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <Search size={18} /> Track Application
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Portals ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900">Choose your portal</h2>
          <p className="mt-2 text-sm text-slate-500">
            Select how you want to access the system.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PORTALS.map((portal) => {
            const Icon = portal.icon;
            return (
              <Link
                key={portal.title}
                to={portal.to}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg"
              >
                <div
                  className={`grid h-12 w-12 place-content-center rounded-xl text-white ${portal.accent}`}
                >
                  <Icon size={22} />
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">{portal.title}</h3>
                <p className="mt-1.5 flex-1 text-sm text-slate-500">{portal.description}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600">
                  {portal.cta}
                  <ArrowRight size={15} className="transition group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────────── */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900">What the system manages</h2>
            <p className="mt-2 text-sm text-slate-500">
              One platform covering the full employee lifecycle.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="rounded-2xl bg-slate-50 p-6">
                  <div className="grid h-11 w-11 place-content-center rounded-lg bg-blue-100 text-blue-700">
                    <Icon size={20} />
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-slate-900">{feature.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-500">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── CTA strip ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col items-center justify-between gap-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-10 text-white sm:flex-row sm:text-left">
          <div>
            <h2 className="text-xl font-bold">Ready to join the public service?</h2>
            <p className="mt-1 text-sm text-blue-100">
              Browse open positions and submit your application today.
            </p>
          </div>
          <Link
            to="/apply"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            <Briefcase size={18} /> Apply for a Job
          </Link>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-content-center rounded-lg bg-blue-600 text-xs font-bold text-white">
              HR
            </div>
            <span className="font-semibold text-slate-700">Government HRIS</span>
          </div>
          <p>© {new Date().getFullYear()} Government HRIS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};
