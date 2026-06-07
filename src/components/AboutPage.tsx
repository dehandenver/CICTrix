import { useRef } from 'react';
import abyanLogo from '../assets/abyan-logo.png';
import { Link } from 'react-router-dom';
import { Users, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { SharedFooter } from './SharedFooter';

export function AboutPage() {
  const contactRef = useRef<HTMLElement>(null);

  return (
    <div
      className="min-h-screen bg-[#F8FAFC] text-[#050D65]"
      style={{ fontFamily: "'Poppins', system-ui, -apple-system, sans-serif" }}
    >
      {/* ─── Navbar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[#363EE8]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 text-white">
          <div className="flex items-center gap-3">
            <img
              src={abyanLogo}
              alt="Abyan Logo"
              className="h-11 w-auto object-contain"
              style={{ mixBlendMode: 'screen' }}
            />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-white">ABYAN</span>
              <span className="hidden text-sm font-medium text-white/90 sm:inline">
                Human Resource Information System
              </span>
            </div>
          </div>

          {/* Nav Tabs + Login */}
          <div className="flex items-center gap-6">
            <nav className="flex items-center gap-1">
              <Link
                to="/"
                className="rounded-md px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition-colors"
              >
                Home
              </Link>
              <Link
                to="/about"
                className="rounded-md px-4 py-2 text-sm font-medium bg-white/20 text-white transition-colors"
              >
                About
              </Link>
              <button
                type="button"
                onClick={() => contactRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="rounded-md px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition-colors"
              >
                Contacts
              </button>
            </nav>

            {/* Login Dropdown */}
            <div className="relative group">
              <button className="inline-flex items-center gap-2 rounded-[14px] bg-white px-6 py-3 text-sm font-semibold text-[#363EE8] shadow-lg transition hover:bg-[#EEF2FF]">
                <Users size={18} />
                <span>Login</span>
              </button>
              <div className="absolute right-0 top-full mt-2 w-52 bg-white text-slate-900 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 py-2 border border-slate-100">
                <a
                  href="/employee/login"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#EEF2FF] font-medium text-sm text-[#050D65] transition-colors"
                >
                  <span className="grid h-8 w-8 place-content-center rounded-lg bg-[#059669] text-white"><Users size={15} /></span>
                  Employee Portal
                </a>
                <a
                  href="/interviewer/login"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#EEF2FF] font-medium text-sm text-[#050D65] transition-colors"
                >
                  <span className="grid h-8 w-8 place-content-center rounded-lg bg-[#7C3AED] text-white"><ClipboardCheck size={15} /></span>
                  Interviewer Portal
                </a>
                <a
                  href="/admin/login"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#EEF2FF] font-medium text-sm text-[#050D65] transition-colors"
                >
                  <span className="grid h-8 w-8 place-content-center rounded-lg bg-[#050D65] text-white"><ShieldCheck size={15} /></span>
                  HR Administration
                </a>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Hero Banner ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#363EE8] to-[#050D65] py-16 text-white">
        <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full border border-white/10" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full border border-white/10" />
        <div className="relative mx-auto max-w-6xl px-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-200">About ABYAN HRIS</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            More Than Just Software —
            <br />
            Your HR Ally.
          </h1>
        </div>
      </section>

      {/* ─── Main Content ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">

          {/* Left — Intro Text */}
          <div className="flex flex-col justify-start space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[#050D65]">What is ABYAN?</h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                In Hiligaynon, <span className="font-semibold text-[#363EE8]">Abyan</span> translates to{' '}
                <span className="font-semibold">"friend"</span> or{' '}
                <span className="font-semibold">"ally."</span> That is the exact philosophy behind our Human
                Resource Information System. We believe that technology shouldn't just store employee records; it
                should actively work alongside HR teams to streamline complex organizational workflows. ABYAN HRIS
                bridges the gap between intricate business logic and the people who drive the organization forward.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-[#050D65]">Why We Built It</h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Traditional HR management often struggles with fragmented data, manual evaluations, and reactive
                planning. ABYAN was engineered to transform these challenges into a unified, proactive process. By
                integrating intelligent decision support into daily operations, we empower management to move beyond
                simple data entry and focus on scalable, long-term growth.
              </p>
            </div>
          </div>

          {/* Right — Four Pillars */}
          <div className="flex flex-col justify-start">
            <h2 className="mb-2 text-2xl font-bold text-[#050D65]">Our Four Pillars of HR</h2>
            <p className="mb-6 text-sm leading-relaxed text-slate-500">
              We broke down the complexities of human resource management into four intuitive, seamlessly integrated modules. Here is how ABYAN HRIS supports your organization at every stage of the employee journey:
            </p>
            <div className="grid gap-4">

              {/* Pillar 1 */}
              <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#363EE8]/10">
                  <svg className="h-5 w-5 text-[#363EE8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[#050D65]">Recruitment, Selection, and Placement</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Finding the right fit shouldn't rely on guesswork. This pillar streamlines how you attract, evaluate, and place talent — matching the right people to the right roles based on fair, standardized data.
                </p>
              </div>

              {/* Pillar 2 */}
              <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#363EE8]/10">
                  <svg className="h-5 w-5 text-[#363EE8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[#050D65]">Learning and Development</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Growth doesn't stop after onboarding. ABYAN tracks current skills, assesses competencies, and automatically highlights where your team needs support — enabling targeted programs that bridge skill gaps.
                </p>
              </div>

              {/* Pillar 3 */}
              <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#363EE8]/10">
                  <svg className="h-5 w-5 text-[#363EE8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[#050D65]">Performance Management</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Move away from subjective annual reviews. This module provides a clear, unified space to track progress and evaluate performance fairly — building a solid, data-driven foundation for succession planning.
                </p>
              </div>

              {/* Pillar 4 */}
              <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#363EE8]/10">
                  <svg className="h-5 w-5 text-[#363EE8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[#050D65]">Rewards and Recognition</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  Hard work deserves to be acknowledged. This pillar helps management track milestones and exceptional performance — recognizing top talent based on clear, objective metrics to foster a culture of fairness and motivation.
                </p>
              </div>

            </div>
          </div>
        </div>
      </section>

      <SharedFooter ref={contactRef} />
    </div>
  );
}
