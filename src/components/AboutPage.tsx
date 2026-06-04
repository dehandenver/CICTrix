import abyanLogo from '../assets/abyan-logo.png';
import { Link, useNavigate } from 'react-router-dom';

export function AboutPage() {
  const navigate = useNavigate();

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
              <Link
                to="/contacts"
                className="rounded-md px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition-colors"
              >
                Contacts
              </Link>
            </nav>

            {/* Login Dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-white hover:bg-white/30 transition-colors font-medium">
                <span>Login</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="absolute right-0 mt-0 w-48 bg-white text-slate-900 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 py-2">
                <a href="/login?portal=employee" className="block px-4 py-2 hover:bg-slate-50 font-medium">
                  Employee Portal
                </a>
                <a href="/login?portal=interviewer" className="block px-4 py-2 hover:bg-slate-50 font-medium">
                  Interviewer Portal
                </a>
                <a href="/login?portal=hr" className="block px-4 py-2 hover:bg-slate-50 font-medium">
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
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            More Than Just Software —
            <br />
            <span className="text-indigo-200">Your HR Ally.</span>
          </h1>
        </div>
      </section>

      {/* ─── Main Content ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">

          {/* Left — Intro Text */}
          <div className="flex flex-col justify-center space-y-6">
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

          {/* Right — Core Pillars Grid */}
          <div className="flex flex-col justify-center">
            <h2 className="mb-6 text-2xl font-bold text-[#050D65]">Our Core Pillars</h2>
            <div className="grid gap-4 sm:grid-cols-1">

              {/* Pillar 1 */}
              <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#363EE8]/10">
                  <svg className="h-5 w-5 text-[#363EE8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[#050D65]">Intelligent Decision Support</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  We take the guesswork out of talent management. ABYAN utilizes data-driven analytics to perform
                  unified competency assessments and accurately classify training needs.
                </p>
              </div>

              {/* Pillar 2 */}
              <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#363EE8]/10">
                  <svg className="h-5 w-5 text-[#363EE8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[#050D65]">Future-Proof Succession Planning</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  An organization is only as strong as its future leaders. Our system provides the structural
                  framework necessary to build smart, data-backed succession plans.
                </p>
              </div>

              {/* Pillar 3 */}
              <div className="rounded-xl border border-indigo-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#363EE8]/10">
                  <svg className="h-5 w-5 text-[#363EE8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[#050D65]">Intuitive by Design</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  We sit at the intersection of technical implementation and human experience. No matter how powerful
                  the back-end logic is, we prioritize a seamless, aesthetically precise UI/UX so your team can
                  navigate the system with zero friction.
                </p>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer CTA ──────────────────────────────────────────── */}
      <section className="bg-[#050D65] py-12 text-center text-white">
        <p className="text-lg font-semibold">Ready to experience ABYAN?</p>
        <p className="mt-2 text-sm text-indigo-200">
          Reach out or log in to get started.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link
            to="/contacts"
            className="rounded-lg bg-white px-6 py-2 text-sm font-semibold text-[#050D65] hover:bg-indigo-50 transition-colors"
          >
            Contact Us
          </Link>
          <Link
            to="/"
            className="rounded-lg border border-white/30 px-6 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </section>
    </div>
  );
}
