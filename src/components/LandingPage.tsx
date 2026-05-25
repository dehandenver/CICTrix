import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  Briefcase,
  Users,
  ClipboardCheck,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
  GraduationCap,
  BarChart3,
  CheckCircle2,
  Lock,
  Phone,
  FileText,
  LogIn,
  Eye,
  EyeOff,
  AlertCircle,
  MapPin,
  Mail,
} from 'lucide-react';
import abyanLogo from '../assets/abyan-logo.png';

/* ═══════════════════════════════════════════════════════════════════
   OFFICIAL GOVERNMENT COLOR PALETTE (Gov.ph Inspired)
   Primary Navy:      #0f172a (Deep Navy for authority)
   Secondary Navy:    #1e3a8a (Professional Blue)
   Accent Gold:       #d97706 (Official seals/active states)
   Slate Gray:        #475569 (Body text)
   Light Gray:        #e2e8f0 (Borders)
   Off-White:         #f8fafc (Background)
   Pure White:        #ffffff (Cards/surfaces)
═══════════════════════════════════════════════════════════════════ */

// HR PILLARS - INSTITUTIONAL FOCUS
const HR_PILLARS = [
  {
    icon: Briefcase,
    title: 'Recruitment, Selection & Placement (RSP)',
    description: 'Meritocratic hiring aligned with Civil Service regulations. Manage vacant positions, competency assessments, candidate screening, and ethical recruitment to ensure qualified public servants.',
    color: '#0f172a',
  },
  {
    icon: TrendingUp,
    title: 'Performance Management (PM)',
    description: 'Strategic Performance Management System (SPMS) implementation. Track individual performance targets, evaluation cycles, and organizational alignment with government strategic outcomes.',
    color: '#1e3a8a',
  },
  {
    icon: GraduationCap,
    title: 'Learning & Development (LND)',
    description: 'Continuous capability building for the public sector workforce. Monitor training interventions, competency development, and professional advancement in accordance with agency HR plans.',
    color: '#475569',
  },
];

// ANNOUNCEMENTS FOR THE TICKER
const ANNOUNCEMENTS = [
  'HRMO Memorandum 2026-001: Updated Leave Benefits Guidelines effective this quarter.',
  'Transparency Report Q4 2025 now available. Review citizen performance metrics and agency initiatives.',
  'System Maintenance: Scheduled update on May 26, 2026, 11 PM - 1 AM. Expected downtime 2 hours.',
];

// OPERATIONAL METRICS
const OPERATIONAL_METRICS = [
  { label: 'Total Plantilla Positions', value: '2,847', icon: Users },
  { label: 'Active Personnel', value: '2,031', icon: CheckCircle2 },
  { label: 'Filled Positions', value: '71.4%', icon: BarChart3 },
];

export const LandingPage = () => {
  const [currentAnnouncement, setCurrentAnnouncement] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showPassword, setShowPassword] = useState(false);
  const [emailOrId, setEmailOrId] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPortal, setSelectedPortal] = useState('employee');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const announcementTimer = setInterval(() => {
      setCurrentAnnouncement((prev) => (prev + 1) % ANNOUNCEMENTS.length);
    }, 5000);
    return () => clearInterval(announcementTimer);
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b]">
      {/* ═══════════════════════════════════════════════════════════════════
          TOP GOVERNMENT UTILITY BAR
          Institutional affiliation + accessibility + clock
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-50 border-b border-[#e2e8f0] bg-[#0f172a] text-[#e2e8f0] py-2 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex items-center justify-between text-xs sm:text-sm">
          <div>
            <p className="font-semibold">An Official Website of the Local Government Unit</p>
            <p className="text-[#cbd5e1] text-xs mt-0.5">Republic of the Philippines • Human Resource Management Office</p>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div className="hidden sm:flex flex-col items-end">
              <p className="font-mono font-bold">
                {currentTime.toLocaleTimeString()}
              </p>
              <p className="text-[#cbd5e1] text-xs">
                {currentTime.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <button className="hover:text-white transition">
                Accessibility
              </button>
              <span className="text-[#475569]">•</span>
              <button className="hover:text-white transition">
                Text Size
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN HEADER & NAVIGATION
          Official branding + institutional navigation
          ═══════════════════════════════════════════════════════════════════ */}
      <header className="border-b border-[#e2e8f0] bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            {/* Left: Logos & Title */}
            <div className="flex items-center gap-4">
              {/* Official Seals */}
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-lg bg-[#0f172a] flex items-center justify-center border-2 border-[#d97706] shadow-md">
                  <img
                    src={abyanLogo}
                    alt="Government Seal"
                    className="h-12 w-12 rounded object-contain"
                  />
                </div>
                <div className="h-14 w-14 rounded-lg bg-white border-2 border-[#0f172a] flex items-center justify-center shadow-md">
                  <span className="text-xs font-bold text-[#0f172a]">HRMO</span>
                </div>
              </div>

              {/* Title */}
              <div className="hidden sm:block">
                <h1 className="text-2xl font-bold text-[#0f172a]">
                  Human Resource Information System
                </h1>
                <p className="text-xs text-[#64748b] font-medium">
                  Human Resource Management Office
                </p>
              </div>
            </div>

            {/* Right: Navigation & Auth */}
            <div className="flex items-center gap-6">
              {/* Navigation Menu */}
              <nav className="hidden lg:flex items-center gap-8">
                <a
                  href="#"
                  className="text-sm font-semibold text-[#475569] hover:text-[#0f172a] transition"
                >
                  Home
                </a>
                <a
                  href="#"
                  className="text-sm font-semibold text-[#475569] hover:text-[#0f172a] transition"
                >
                  Transparency
                </a>
                <a
                  href="#"
                  className="text-sm font-semibold text-[#475569] hover:text-[#0f172a] transition"
                >
                  Issuances
                </a>
                <a
                  href="#"
                  className="text-sm font-semibold text-[#475569] hover:text-[#0f172a] transition flex items-center gap-1"
                >
                  <Phone size={14} /> Support
                </a>
              </nav>

              {/* Portal Login Button */}
              <Link
                to="/employee/login"
                className="inline-flex items-center gap-2 rounded-lg bg-[#0f172a] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e3a8a] focus:outline-none focus:ring-2 focus:ring-[#d97706] focus:ring-offset-2"
              >
                <LogIn size={16} />
                <span className="hidden sm:inline">Portal Login</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          ANNOUNCEMENTS TICKER
          Official memorandums and system notices
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="bg-[#0f172a] text-white py-3 px-4 sm:px-6 lg:px-8 border-b border-[#1e3a8a]">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 rounded-full bg-[#d97706] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold">!</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium animate-pulse">
                {ANNOUNCEMENTS[currentAnnouncement]}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          HERO SECTION - SPLIT LAYOUT
          Left: Welcome + Announcements | Right: Secure Login Card
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#0f172a] px-4 sm:px-6 lg:px-8 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Left Panel: Welcome & Announcements */}
            <div className="text-white">
              <div className="mb-8">
                <h2 className="text-4xl sm:text-5xl font-bold leading-tight mb-4">
                  Welcome to the Official HRIS
                </h2>
                <p className="text-lg text-[#cbd5e1] leading-relaxed">
                  A secure, integrated platform for government personnel management. Access your employee profile, performance records, and HR services with government-grade encryption and transparency.
                </p>
              </div>

              {/* Official Announcements Section */}
              <div className="bg-white/10 border border-white/20 rounded-xl p-6 backdrop-blur">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                  <AlertCircle size={18} className="text-[#d97706]" />
                  Official Announcements & Memorandums
                </h3>
                <div className="space-y-3">
                  {ANNOUNCEMENTS.map((ann, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg transition ${
                        idx === currentAnnouncement
                          ? 'bg-[#d97706]/20 border border-[#d97706] scale-105'
                          : 'bg-transparent border border-white/10 opacity-60'
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{ann}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-xs text-[#cbd5e1]">
                  Auto-rotating • Last updated {currentTime.toLocaleTimeString()}
                </div>
              </div>

              {/* Security Statement */}
              <div className="mt-8 flex items-start gap-3 text-sm text-[#cbd5e1]">
                <Lock size={18} className="flex-shrink-0 text-[#d97706]" />
                <p>
                  <strong>Authorized Access Only.</strong> This system is protected by government-grade encryption. All activities are logged and monitored under the Data Privacy Act of 2012.
                </p>
              </div>
            </div>

            {/* Right Panel: Secure Login Card */}
            <div className="lg:flex lg:items-center">
              <div className="w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
                {/* Card Header */}
                <div className="bg-[#0f172a] px-8 py-6 border-b-4 border-[#d97706]">
                  <h3 className="text-2xl font-bold text-white mb-1">
                    Portal Access
                  </h3>
                  <p className="text-sm text-[#cbd5e1]">
                    Secure employee login
                  </p>
                </div>

                {/* Login Form */}
                <form className="p-8 space-y-5" onSubmit={(e) => e.preventDefault()}>
                  {/* Role Selector */}
                  <div>
                    <label className="block text-xs font-bold text-[#0f172a] uppercase tracking-wide mb-2">
                      Portal Type
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedPortal('employee')}
                        className={`py-2 px-3 rounded-lg font-semibold text-sm transition ${
                          selectedPortal === 'employee'
                            ? 'bg-[#0f172a] text-white border-2 border-[#d97706]'
                            : 'bg-[#f1f5f9] text-[#475569] border-2 border-transparent hover:border-[#cbd5e1]'
                        }`}
                      >
                        Employee
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPortal('admin')}
                        className={`py-2 px-3 rounded-lg font-semibold text-sm transition ${
                          selectedPortal === 'admin'
                            ? 'bg-[#0f172a] text-white border-2 border-[#d97706]'
                            : 'bg-[#f1f5f9] text-[#475569] border-2 border-transparent hover:border-[#cbd5e1]'
                        }`}
                      >
                        Admin
                      </button>
                    </div>
                  </div>

                  {/* Employee ID / Email */}
                  <div>
                    <label className="block text-xs font-bold text-[#0f172a] uppercase tracking-wide mb-2">
                      {selectedPortal === 'admin' ? 'Email Address' : 'Employee ID or Email'}
                    </label>
                    <input
                      type="text"
                      value={emailOrId}
                      onChange={(e) => setEmailOrId(e.target.value)}
                      className="w-full rounded-lg border-2 border-[#e2e8f0] px-4 py-3 text-[#0f172a] placeholder-[#cbd5e1] transition focus:border-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#0f172a]/10"
                      placeholder={selectedPortal === 'admin' ? 'your.email@gov.ph' : 'EMP-0001234'}
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-bold text-[#0f172a] uppercase tracking-wide mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-lg border-2 border-[#e2e8f0] px-4 py-3 text-[#0f172a] placeholder-[#cbd5e1] transition focus:border-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#0f172a]/10"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#0f172a] transition"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Remember Me & Forgot Password */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded border-2 border-[#e2e8f0] w-4 h-4 cursor-pointer"
                      />
                      <span className="text-sm text-[#64748b]">Remember this device</span>
                    </label>
                    <a
                      href="#"
                      className="text-sm font-semibold text-[#1e3a8a] hover:text-[#0f172a] transition"
                    >
                      Forgot Password?
                    </a>
                  </div>

                  {/* Login Button */}
                  <button
                    type="submit"
                    className="w-full py-3 px-4 bg-[#0f172a] hover:bg-[#1e3a8a] text-white font-bold rounded-lg transition focus:outline-none focus:ring-2 focus:ring-[#d97706] focus:ring-offset-2 flex items-center justify-center gap-2"
                  >
                    <LogIn size={18} />
                    Sign In to Portal
                  </button>

                  {/* Security Notice */}
                  <div className="pt-4 border-t border-[#e2e8f0] text-center">
                    <p className="text-xs text-[#64748b] mb-2">
                      <strong>Security Compliance:</strong>
                    </p>
                    <p className="text-xs text-[#64748b] leading-relaxed">
                      Authorized Access Only. All activities are logged and monitored under RA 10173 (Data Privacy Act). Unauthorized access is prohibited.
                    </p>
                  </div>

                  {/* Job Applicant Link */}
                  <div className="pt-4 border-t border-[#e2e8f0] text-center">
                    <p className="text-sm text-[#64748b] mb-2">
                      Not an employee?
                    </p>
                    <Link
                      to="/apply"
                      className="inline-flex items-center gap-2 text-sm font-bold text-[#0f172a] hover:text-[#1e3a8a] transition"
                    >
                      Apply for a Job Position
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          OPERATIONAL METRICS & TRANSPARENCY BANNER
          Key institutional metrics
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="bg-white border-y border-[#e2e8f0] px-4 sm:px-6 lg:px-8 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-[#0f172a] mb-2">
              Operational Transparency
            </h2>
            <p className="text-[#64748b]">
              Key institutional metrics and personnel statistics
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {OPERATIONAL_METRICS.map((metric, idx) => {
              const Icon = metric.icon;
              return (
                <div
                  key={idx}
                  className="rounded-xl border-2 border-[#e2e8f0] bg-gradient-to-br from-[#f8fafc] to-white p-6 hover:border-[#0f172a] hover:shadow-lg transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#64748b] uppercase tracking-wide">
                        {metric.label}
                      </p>
                      <p className="text-4xl font-bold text-[#0f172a] mt-2">
                        {metric.value}
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-lg bg-[#0f172a]/10 flex items-center justify-center">
                      <Icon size={24} className="text-[#0f172a]" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Download Citizen's Charter */}
          <div className="rounded-xl bg-gradient-to-r from-[#0f172a] to-[#1e3a8a] px-6 py-6 flex items-center justify-between">
            <div className="text-white">
              <h3 className="font-bold text-lg mb-1">
                HRMO Citizen's Charter
              </h3>
              <p className="text-[#cbd5e1] text-sm">
                View our official commitment to service standards and performance targets
              </p>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-bold text-[#0f172a] transition hover:bg-[#f1f5f9] flex-shrink-0">
              <FileText size={18} />
              <span className="hidden sm:inline">Download</span>
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          HR PILLARS / CORE MODULES
          3-column grid: RSP, PM, LND with institutional focus
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="px-4 sm:px-6 lg:px-8 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-[#0f172a] mb-3">
              Strategic HR Directorates
            </h2>
            <p className="text-lg text-[#64748b] max-w-2xl">
              Core functional areas aligned with civil service excellence and organizational mandate
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HR_PILLARS.map((pillar, idx) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={idx}
                  className="rounded-xl border-2 border-[#e2e8f0] bg-white p-8 transition hover:border-[#0f172a] hover:shadow-xl group"
                >
                  {/* Icon */}
                  <div
                    className="h-16 w-16 rounded-lg flex items-center justify-center transition group-hover:scale-110"
                    style={{ backgroundColor: `${pillar.color}15` }}
                  >
                    <Icon size={32} style={{ color: pillar.color }} />
                  </div>

                  {/* Content */}
                  <h3 className="mt-6 text-xl font-bold text-[#0f172a]">
                    {pillar.title}
                  </h3>
                  <p className="mt-3 text-[#64748b] leading-relaxed text-sm">
                    {pillar.description}
                  </p>

                  {/* Accent Line */}
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

      {/* ═══════════════════════════════════════════════════════════════════
          FOOTER - OFFICIAL GOVERNMENT STANDARD
          Contact, compliance, and system information
          ═══════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-[#e2e8f0] bg-[#0f172a] text-[#cbd5e1]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Main Footer Content */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 py-12">
            {/* Agency Info */}
            <div>
              <h4 className="font-bold text-white mb-4">About HRMO</h4>
              <p className="text-sm leading-relaxed mb-4">
                Human Resource Management Office provides strategic HR leadership and civil service excellence across all government agencies.
              </p>
              <p className="text-xs text-[#94a3b8]">
                System Version: 2.1.0-build • Last Updated: May 2026
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-bold text-white mb-4">Official Links</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="hover:text-white transition">
                    Transparency Portal
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Issuances & Memorandums
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Citizen's Charter
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    System Status
                  </a>
                </li>
              </ul>
            </div>

            {/* Support Contact */}
            <div>
              <h4 className="font-bold text-white mb-4">Support Desk</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Phone size={14} className="flex-shrink-0 mt-0.5" />
                  <a href="tel:+63-2-123-4567" className="hover:text-white transition">
                    +63 (2) 123-4567
                  </a>
                </li>
                <li className="flex items-start gap-2">
                  <Mail size={14} className="flex-shrink-0 mt-0.5" />
                  <a href="mailto:support@hrmo.gov.ph" className="hover:text-white transition">
                    support@hrmo.gov.ph
                  </a>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin size={14} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Mon-Fri: 8:00 AM - 5:00 PM
                    <br />
                    Philippine Time
                  </span>
                </li>
              </ul>
            </div>

            {/* Compliance & Privacy */}
            <div>
              <h4 className="font-bold text-white mb-4">Compliance</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="hover:text-white transition flex items-center gap-1">
                    <FileText size={14} /> Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition flex items-center gap-1">
                    <Lock size={14} /> Security Statement
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition flex items-center gap-1">
                    <CheckCircle2 size={14} /> Accessibility
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition flex items-center gap-1">
                    <FileText size={14} /> Terms of Use
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-[#1e3a8a] py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#94a3b8]">
            <div className="flex flex-col gap-2">
              <p>
                © {new Date().getFullYear()} Human Resource Management Office. All rights reserved.
              </p>
              <p>
                🔒 Official Government System. Authorized access only. All activities logged under RA 10173.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span>ISO 27001</span>
              <span>•</span>
              <span>WCAG 2.1 AA</span>
              <span>•</span>
              <span>RA 10173</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
