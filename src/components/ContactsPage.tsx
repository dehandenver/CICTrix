import abyanLogo from '../assets/abyan-logo.png';
import { Link } from 'react-router-dom';

export function ContactsPage() {
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
                className="rounded-md px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition-colors"
              >
                About
              </Link>
              <Link
                to="/contacts"
                className="rounded-md px-4 py-2 text-sm font-medium bg-white/20 text-white transition-colors"
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
      <section className="bg-gradient-to-br from-[#363EE8] to-[#050D65] py-16 text-white text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-200">Get in Touch</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Contact Us</h1>
        <p className="mt-4 text-indigo-200 text-base">We'd love to hear from you.</p>
      </section>

      {/* ─── Contact Card ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-2xl px-6 py-20">
        <div className="rounded-2xl border border-indigo-100 bg-white p-10 shadow-md text-center">
          <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#363EE8]/10">
            <svg className="h-8 w-8 text-[#363EE8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#050D65]">Email Us</h2>
          <p className="mt-2 text-sm text-slate-500">
            Have questions about ABYAN HRIS? Our team is ready to help.
          </p>
          <a
            href="mailto:cictrix@gmail.com"
            className="mt-6 inline-block rounded-lg bg-[#363EE8] px-8 py-3 text-sm font-semibold text-white hover:bg-[#2830c5] transition-colors"
          >
            cictrix@gmail.com
          </a>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-sm font-medium text-[#363EE8] hover:underline"
          >
            ← Back to Home
          </Link>
        </div>
      </section>
    </div>
  );
}
