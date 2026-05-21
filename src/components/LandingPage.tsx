import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  Briefcase,
  Users,
  ClipboardCheck,
  ShieldCheck,
  ArrowRight,
  Search,
  TrendingUp,
  GraduationCap,
  BarChart3,
  CheckCircle2,
  Lock,
  Phone,
  FileText,
  LogIn,
  ChevronDown,
} from 'lucide-react';
import abyanLogo from '../assets/abyan-logo.png';

/* ── Government HRIS Theme Tokens ──────────────────────────────────
   Primary:      Deep Professional Blue #003D82 (Hover #002D60)
   Secondary:    Clean Slate Gray #6B7280 (text)
   Background:   Off-White #F3F4F6 (workspace)
   Surface:      Pure White #FFFFFF (cards)
   Accent:       Emerald #047857 (CTAs)
   Border:       Light Gray #E5E7EB
   Trust Text:   Dark Navy #111827
   Supporting:   Warm Gray #9CA3AF
─────────────────────────────────────────────────────────────────── */

// Core Pillars showcasing the HRIS modules
const CORE_PILLARS = [
  {
    icon: Briefcase,
    title: 'Recruitment & Selection (RSP)',
    description: 'Track vacancies, evaluate competencies, screen applicants, and onboard talented public servants with full transparency and excellence.',
    color: '#003D82',
  },
  {
    icon: TrendingUp,
    title: 'Performance Management (PM)',
    description: 'Manage government evaluation frameworks, set organizational targets, track employee commitments, and drive continuous excellence.',
    color: '#047857',
  },
  {
    icon: GraduationCap,
    title: 'Learning & Development (LND)',
    description: 'Track training records, analyze competency gaps, assign seminars, and develop future leaders through targeted skill enhancement.',
    color: '#1F2937',
  },
];

// Quick access portals for different user roles
const USER_PORTALS = [
  {
    title: 'Job Applicant',
    description: 'Apply for open government positions and submit your requirements.',
    icon: Briefcase,
    to: '/apply',
    cta: 'Apply Now',
    role: 'applicant',
  },
  {
    title: 'Employee Portal',
    description: 'Access your profile, performance records, and manage documents.',
    icon: Users,
    to: '/employee/login',
    cta: 'Employee Login',
    role: 'employee',
  },
  {
    title: 'Interviewer Dashboard',
    description: 'Evaluate and score applicants assigned to your evaluation pool.',
    icon: ClipboardCheck,
    to: '/interviewer/login',
    cta: 'Interviewer Login',
    role: 'interviewer',
  },
  {
    title: 'HR Administration',
    description: 'Full system management: recruitment, performance, learning, and analytics.',
    icon: ShieldCheck,
    to: '/admin/login',
    cta: 'Admin Login',
    role: 'admin',
  },
];

// System statistics demonstrating scale and capability
const SYSTEM_STATS = [
  { label: '2,000+', value: 'Personnel Managed', icon: Users },
  { label: '100%', value: 'Digital Processing', icon: CheckCircle2 },
  { label: '500+', value: 'Job Positions Tracked', icon: Briefcase },
  { label: '24/7', value: 'System Availability', icon: BarChart3 },
];

export const LandingPage = () => {
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F3F4F6] to-white text-[#111827]">
      {/* ═════════════════════════════════════════════════════════════
          HEADER / NAVIGATION BAR
          Professional government aesthetic with official branding
          ═════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-[#E5E7EB] bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            {/* Left: Logo & System Title */}
            <div className="flex items-center gap-4">
              {/* Government Seal Placeholder */}
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#003D82]">
                <img
                  src={abyanLogo}
                  alt="Government Seal"
                  className="h-10 w-10 rounded object-contain"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#003D82]">GovHRIS</h1>
                <p className="hidden text-xs text-[#6B7280] sm:inline">
                  Government Human Resource Information System
                </p>
              </div>
            </div>

            {/* Right: Navigation & Auth */}
            <div className="flex items-center gap-6">
              {/* Desktop Navigation Links */}
              <nav className="hidden gap-6 md:flex">
                <a
                  href="#about"
                  className="text-sm font-medium text-[#6B7280] transition hover:text-[#003D82]"
                >
                  About
                </a>
                <a
                  href="#portals"
                  className="text-sm font-medium text-[#6B7280] transition hover:text-[#003D82]"
                >
                  Portals
                </a>
                <a
                  href="#support"
                  className="flex items-center gap-1 text-sm font-medium text-[#6B7280] transition hover:text-[#003D82]"
                >
                  <Phone size={14} /> Helpdesk
                </a>
              </nav>

              {/* Sign In with Role Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#003D82] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#002D60] focus:outline-none focus:ring-2 focus:ring-[#003D82] focus:ring-offset-2"
                >
                  <LogIn size={16} />
                  <span className="hidden sm:inline">Sign In</span>
                  <ChevronDown size={16} className={`transition ${isRoleDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Role Selection Dropdown */}
                {isRoleDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-lg border border-[#E5E7EB] bg-white shadow-xl">
                    <div className="p-1">
                      <button
                        onClick={() => {
                          setSelectedRole('employee');
                          setIsRoleDropdownOpen(false);
                        }}
                        className="w-full rounded px-3 py-2 text-left text-sm font-medium text-[#111827] transition hover:bg-[#F3F4F6]"
                      >
                        <Users size={14} className="mb-1 inline mr-2" />
                        Employee Self-Service Portal
                      </button>
                      <button
                        onClick={() => {
                          setSelectedRole('admin');
                          setIsRoleDropdownOpen(false);
                        }}
                        className="w-full rounded px-3 py-2 text-left text-sm font-medium text-[#111827] transition hover:bg-[#F3F4F6]"
                      >
                        <ShieldCheck size={14} className="mb-1 inline mr-2" />
                        HR Admin Portal
                      </button>
                      <button
                        onClick={() => {
                          setSelectedRole('interviewer');
                          setIsRoleDropdownOpen(false);
                        }}
                        className="w-full rounded px-3 py-2 text-left text-sm font-medium text-[#111827] transition hover:bg-[#F3F4F6]"
                      >
                        <ClipboardCheck size={14} className="mb-1 inline mr-2" />
                        Interviewer Dashboard
                      </button>
                      <button
                        onClick={() => {
                          setSelectedRole('applicant');
                          setIsRoleDropdownOpen(false);
                        }}
                        className="w-full rounded px-3 py-2 text-left text-sm font-medium text-[#111827] transition hover:bg-[#F3F4F6]"
                      >
                        <Briefcase size={14} className="mb-1 inline mr-2" />
                        Job Application
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ═════════════════════════════════════════════════════════════
          HERO SECTION
          Authoritative welcome with clear CTAs
          ═════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#003D82] via-[#004A99] to-[#001A3D] px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
        <div className="relative mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-8 items-center">
            {/* Left: Hero Text */}
            <div className="text-white">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white mb-4">
                <CheckCircle2 size={14} />
                <span>Official Government Portal</span>
              </div>

              <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
                Empowering Public Servants, Streamlining Human Resources
              </h1>

              <p className="mt-6 text-lg text-blue-100 leading-relaxed max-w-xl">
                A modern, secure, data-driven HR information system designed for government personnel. Manage recruitment, performance, learning, and development — all with exceptional transparency and integrity.
              </p>

              {/* Primary CTAs */}
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/apply"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#047857] px-6 py-3.5 text-base font-semibold text-white transition hover:bg-[#036843] focus:outline-none focus:ring-2 focus:ring-[#047857] focus:ring-offset-2 focus:ring-offset-[#003D82]"
                >
                  <Briefcase size={18} />
                  Access Employee Portal
                </Link>
                <Link
                  to="/admin/login"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-white/30 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#003D82]"
                >
                  <ShieldCheck size={18} />
                  HR Admin Login
                </Link>
              </div>

              {/* Security Badge */}
              <div className="mt-8 flex items-center gap-2 text-sm text-blue-100">
                <Lock size={16} />
                <span>Secure government-grade encryption | ISO 27001 Compliant</span>
              </div>
            </div>

            {/* Right: Feature Illustration */}
            <div className="hidden lg:block">
              <div className="relative">
                {/* Decorative shapes */}
                <div className="absolute -right-8 top-1/2 h-64 w-64 rounded-full bg-[#047857]/10 blur-3xl" />
                <div className="absolute -left-8 -bottom-8 h-48 w-48 rounded-full bg-white/5 blur-2xl" />

                {/* Feature Cards Stacked */}
                <div className="relative space-y-4">
                  <div className="rounded-xl bg-white/10 border border-white/20 backdrop-blur p-4 text-white">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-[#047857]/20 flex items-center justify-center">
                        <Users size={20} className="text-[#047857]" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-blue-100">2,000+ Personnel</p>
                        <p className="text-sm font-bold">Successfully Managed</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/10 border border-white/20 backdrop-blur p-4 text-white">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-[#047857]/20 flex items-center justify-center">
                        <CheckCircle2 size={20} className="text-[#047857]" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-blue-100">100% Digitized</p>
                        <p className="text-sm font-bold">End-to-End Processing</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/10 border border-white/20 backdrop-blur p-4 text-white">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-[#047857]/20 flex items-center justify-center">
                        <BarChart3 size={20} className="text-[#047857]" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-blue-100">Real-Time Analytics</p>
                        <p className="text-sm font-bold">Instant Insights & Reports</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════════════
          SYSTEM STATISTICS RIBBON
          Showcasing scale and capability
          ═════════════════════════════════════════════════════════════ */}
      <section className="border-y border-[#E5E7EB] bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {SYSTEM_STATS.map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <div key={idx} className="text-center">
                  <div className="flex justify-center mb-2">
                    <Icon size={28} className="text-[#003D82]" />
                  </div>
                  <p className="text-3xl sm:text-4xl font-bold text-[#003D82]">{stat.label}</p>
                  <p className="mt-1 text-sm text-[#6B7280]">{stat.value}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════════════
          CORE PILLARS / MODULES SECTION
          Interactive 3-column grid showcasing key pillars
          ═════════════════════════════════════════════════════════════ */}
      <section id="about" className="px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-[#111827] mb-4">
              Core System Pillars
            </h2>
            <p className="text-lg text-[#6B7280] max-w-2xl mx-auto">
              Our integrated platform covers the complete employee lifecycle with specialized modules designed for government excellence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {CORE_PILLARS.map((pillar, idx) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={idx}
                  className="group rounded-xl border border-[#E5E7EB] bg-white p-8 transition hover:border-[#003D82] hover:shadow-xl hover:shadow-[#003D82]/10"
                >
                  {/* Icon Container */}
                  <div
                    className="h-16 w-16 rounded-lg flex items-center justify-center transition group-hover:scale-110"
                    style={{ backgroundColor: `${pillar.color}15` }}
                  >
                    <Icon size={32} style={{ color: pillar.color }} />
                  </div>

                  {/* Title & Description */}
                  <h3 className="mt-6 text-xl font-bold text-[#111827]">{pillar.title}</h3>
                  <p className="mt-3 text-[#6B7280] leading-relaxed">{pillar.description}</p>

                  {/* Bottom accent line */}
                  <div
                    className="mt-6 h-1 w-12 rounded-full transition group-hover:w-full"
                    style={{ backgroundColor: pillar.color }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════════════
          USER PORTALS / QUICK ACCESS
          Different entry points for various user roles
          ═════════════════════════════════════════════════════════════ */}
      <section id="portals" className="bg-[#F3F4F6] px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-[#111827] mb-4">
              Choose Your Portal
            </h2>
            <p className="text-lg text-[#6B7280] max-w-2xl mx-auto">
              Select your role to access the appropriate system interface.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {USER_PORTALS.map((portal) => {
              const Icon = portal.icon;
              return (
                <Link
                  key={portal.role}
                  to={portal.to}
                  className="group flex flex-col rounded-xl border border-[#E5E7EB] bg-white p-6 transition hover:border-[#003D82] hover:shadow-lg hover:-translate-y-1"
                >
                  <div className="h-12 w-12 rounded-lg bg-[#003D82]/10 flex items-center justify-center group-hover:bg-[#003D82] transition">
                    <Icon size={24} className="text-[#003D82] group-hover:text-white transition" />
                  </div>

                  <h3 className="mt-4 text-base font-bold text-[#111827]">{portal.title}</h3>
                  <p className="mt-2 text-sm text-[#6B7280] flex-1 leading-relaxed">{portal.description}</p>

                  <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#003D82] group-hover:gap-3 transition">
                    {portal.cta}
                    <ArrowRight size={16} className="transition group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════════════
          CALL-TO-ACTION BANNER
          Encouraging action for job applicants
          ═════════════════════════════════════════════════════════════ */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="relative rounded-2xl bg-gradient-to-r from-[#003D82] to-[#004A99] px-8 py-12 sm:px-12 sm:py-16 overflow-hidden">
            {/* Background accent */}
            <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="text-white max-w-2xl">
                <h2 className="text-2xl sm:text-3xl font-bold">
                  Ready to Serve Your Nation?
                </h2>
                <p className="mt-3 text-blue-100 leading-relaxed">
                  Browse current government job openings and submit your application through our secure platform. Your future in public service starts here.
                </p>
              </div>

              <Link
                to="/apply"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#047857] px-6 py-3 text-base font-semibold text-white transition hover:bg-[#036843] focus:outline-none focus:ring-2 focus:ring-[#047857] focus:ring-offset-2 focus:ring-offset-[#003D82] whitespace-nowrap"
              >
                <Briefcase size={18} />
                Explore Positions
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════════════
          FOOTER
          Government compliance, privacy, and support information
          ═════════════════════════════════════════════════════════════ */}
      <footer id="support" className="border-t border-[#E5E7EB] bg-[#1F2937] text-[#D1D5DB]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Footer Content */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 py-12">
            {/* Brand Info */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-[#003D82] flex items-center justify-center">
                  <img
                    src={abyanLogo}
                    alt="GovHRIS"
                    className="h-8 w-8 rounded object-contain"
                  />
                </div>
                <span className="font-bold text-white">GovHRIS</span>
              </div>
              <p className="text-sm text-[#9CA3AF]">
                Government Human Resource Information System v2.0
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-bold text-white mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="transition hover:text-white">
                    System Status
                  </a>
                </li>
                <li>
                  <a href="#" className="transition hover:text-white">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#" className="transition hover:text-white">
                    FAQs
                  </a>
                </li>
                <li>
                  <a href="#" className="transition hover:text-white">
                    Contact HR
                  </a>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="font-bold text-white mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="tel:+1234567890" className="transition hover:text-white">
                    📞 Helpdesk: +1 (234) 567-890
                  </a>
                </li>
                <li>
                  <a href="mailto:support@govhris.gov" className="transition hover:text-white">
                    📧 support@govhris.gov
                  </a>
                </li>
                <li>
                  <a href="#" className="transition hover:text-white">
                    🕐 Mon-Fri: 8AM - 6PM GMT
                  </a>
                </li>
              </ul>
            </div>

            {/* Compliance */}
            <div>
              <h4 className="font-bold text-white mb-4">Compliance</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="inline-flex items-center gap-1 transition hover:text-white">
                    <FileText size={14} /> Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="inline-flex items-center gap-1 transition hover:text-white">
                    <FileText size={14} /> Terms of Use
                  </a>
                </li>
                <li>
                  <a href="#" className="inline-flex items-center gap-1 transition hover:text-white">
                    <Lock size={14} /> Security
                  </a>
                </li>
                <li>
                  <a href="#" className="inline-flex items-center gap-1 transition hover:text-white">
                    <CheckCircle2 size={14} /> Accessibility
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-[#374151] py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#9CA3AF]">
            <div className="flex flex-col gap-2">
              <p>© {new Date().getFullYear()} Official Government HRIS. All rights reserved.</p>
              <p className="text-xs">
                🔒 This is an official government system. Unauthorized access is prohibited and monitored.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span>ISO 27001</span>
              <span>•</span>
              <span>SOC 2 Type II</span>
              <span>•</span>
              <span>WCAG 2.1 AA</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
