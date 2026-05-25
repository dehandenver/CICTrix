import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  Briefcase,
  Users,
  LogIn,
  Eye,
  EyeOff,
  AlertCircle,
  MapPin,
  Mail,
  Phone,
  Search,
  Filter,
  Calendar,
  X,
  Info,
  Target,
  Zap,
  ExternalLink,
  FileText,
} from 'lucide-react';
import abyanLogo from '../assets/abyan-logo.png';

/* ═══════════════════════════════════════════════════════════════════
   LIGHT MODE FIRST - HIGH CONTRAST WCAG AA COMPLIANT
   Primary Background:    white / bg-slate-50
   Text on Light:         text-slate-900 (deep charcoal)
   Dark Nav/Headers:      bg-slate-900 (trustworthy navy)
   Text on Dark:          text-white (pure white for max contrast)
   Accent:                bg-amber-600 (gold for CTAs)
═══════════════════════════════════════════════════════════════════ */

// JOB VACANCIES - REALISTIC GOVERNMENT POSITIONS
const JOB_VACANCIES = [
  {
    id: 1,
    title: 'Administrative Officer V',
    office: 'Human Resource Management Office',
    itemNumber: 'PS-2026-005',
    salaryGrade: 'SG 19',
    salary: '₱66,530 - ₱72,460',
    eligibility: 'CS Professional (Second Level Exam or equivalent)',
    education: 'Bachelor\'s Degree in any field',
    closing: 'June 30, 2026',
    type: 'Plantilla',
  },
  {
    id: 2,
    title: 'Information Technology Officer I',
    office: 'ICT & Systems Division',
    itemNumber: 'PS-2026-012',
    salaryGrade: 'SG 15',
    salary: '₱43,926 - ₱48,207',
    eligibility: 'CS Professional with IT specialization',
    education: 'Bachelor\'s Degree in IT/CS/Related Field',
    closing: 'June 15, 2026',
    type: 'Plantilla',
  },
  {
    id: 3,
    title: 'Planning Officer II',
    office: 'Strategic Planning Unit',
    itemNumber: 'CON-2026-008',
    salaryGrade: 'SG 17',
    salary: '₱54,840 - ₱59,808',
    eligibility: 'CS Professional or Licensed Engineer',
    education: 'Bachelor\'s Degree in Urban Planning/Governance',
    closing: 'July 5, 2026',
    type: 'Contractual',
  },
  {
    id: 4,
    title: 'Legal Officer IV',
    office: 'Legal & Compliance Division',
    itemNumber: 'PS-2026-003',
    salaryGrade: 'SG 21',
    salary: '₱82,833 - ₱89,833',
    eligibility: 'Attorney with valid PRC license',
    education: 'Juris Doctor (J.D.) with Bar Admission',
    closing: 'June 25, 2026',
    type: 'Plantilla',
  },
];

// DEPARTMENTS FOR FILTER
const DEPARTMENTS = [
  'All Departments',
  'Human Resource Management Office',
  'ICT & Systems Division',
  'Strategic Planning Unit',
  'Legal & Compliance Division',
];

// HRMO INFO
const HRMO_INFO = {
  vision: 'A world-class human resource management system delivering excellence in public service through meritocratic hiring, strategic performance management, and continuous capability building.',
  mission: 'To attract, develop, and retain the best-qualified public servants through transparent, ethical, and competency-based processes aligned with national development goals.',
  values: [
    { title: 'Meritocracy', icon: Target, desc: 'Excellence through merit, fitness, and competence' },
    { title: 'Transparency', icon: Info, desc: 'Open, fair, and accountable recruitment' },
    { title: 'Excellence', icon: Zap, desc: 'Continuous improvement and capability development' },
  ],
};

export const LandingPageNew = () => {
  const [activeView, setActiveView] = useState<'jobs' | 'about'>('jobs');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedLoginTab, setSelectedLoginTab] = useState<'employee' | 'admin' | 'interviewer'>('employee');
  const [selectedDepartment, setSelectedDepartment] = useState('All Departments');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const filteredJobs = JOB_VACANCIES.filter((job) => {
    const matchesDept = selectedDepartment === 'All Departments' || job.office === selectedDepartment;
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.office.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDept && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ═══════════════════════════════════════════════════════════════════
          NAVIGATION BAR - HIGH CONTRAST (Dark Navy with White Text)
          ═══════════════════════════════════════════════════════════════════ */}
      <nav className="sticky top-0 z-50 bg-slate-900 shadow-lg border-b-4 border-amber-600">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            {/* Left: Logo & Branding */}
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-white flex items-center justify-center border-2 border-amber-600 shadow-md">
                <img
                  src={abyanLogo}
                  alt="Government Seal"
                  className="h-10 w-10 object-contain"
                />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold text-white">HRMO Portal</h1>
                <p className="text-xs text-blue-100">Human Resource Management Office</p>
              </div>
            </div>

            {/* Middle: Navigation Links */}
            <div className="hidden md:flex items-center gap-8">
              <button
                onClick={() => setActiveView('jobs')}
                className={`text-sm font-semibold transition ${
                  activeView === 'jobs'
                    ? 'text-white border-b-2 border-amber-600 pb-2'
                    : 'text-blue-100 hover:text-white'
                }`}
              >
                Available Jobs
              </button>
              <button
                onClick={() => setActiveView('about')}
                className={`text-sm font-semibold transition ${
                  activeView === 'about'
                    ? 'text-white border-b-2 border-amber-600 pb-2'
                    : 'text-blue-100 hover:text-white'
                }`}
              >
                About Us
              </button>
              <a
                href="#"
                className="text-sm font-semibold text-blue-100 hover:text-white transition flex items-center gap-1"
              >
                <Phone size={14} /> Support
              </a>
            </div>

            {/* Right: Portal Login Button - High Visibility */}
            <button
              onClick={() => setShowLoginModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
              <LogIn size={16} />
              <span className="hidden sm:inline">Portal Login</span>
            </button>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════
          JOBS VIEW - Public Career & Job Advertisement Portal
          ═══════════════════════════════════════════════════════════════════ */}
      {activeView === 'jobs' && (
        <main className="px-4 sm:px-6 lg:px-8 py-12">
          <div className="mx-auto max-w-7xl">
            {/* Header */}
            <div className="mb-12">
              <h2 className="text-4xl font-bold text-slate-900 mb-3">
                Public Career Opportunities & Job Vacancies
              </h2>
              <p className="text-lg text-slate-700 max-w-3xl">
                Browse available government positions. All vacancies comply with Civil Service Commission (CSC) publication requirements and equal opportunity employment principles.
              </p>
            </div>

            {/* Search & Filter Card */}
            <div className="mb-8 bg-white rounded-xl shadow-md border border-slate-200 p-6">
              <div className="space-y-4 sm:space-y-0 sm:flex gap-4">
                {/* Search Box */}
                <div className="flex-1 relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search position title or office..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 transition focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>

                {/* Department Filter */}
                <div className="sm:w-72 relative">
                  <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-slate-300 rounded-lg text-slate-900 bg-white transition focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer font-medium"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Job Listings Table - Light Header, High Contrast */}
            <div className="overflow-x-auto rounded-xl border-2 border-slate-200 bg-white shadow-lg">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-200 bg-slate-100">
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Position Title
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Office
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Item #
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-900 uppercase tracking-wide">
                      SG / Salary
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Closing Date
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((job) => (
                    <tr key={job.id} className="border-b border-slate-200 hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold text-slate-900">{job.title}</p>
                          <p className="text-xs text-slate-600 mt-1">
                            {job.type === 'Plantilla' ? (
                              <span className="inline-flex items-center gap-1 bg-slate-900/10 text-slate-900 px-2 py-1 rounded text-xs font-semibold">
                                ● Plantilla
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-amber-600/10 text-amber-900 px-2 py-1 rounded text-xs font-semibold">
                                ● Contractual
                              </span>
                            )}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                        {job.office}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-slate-900 font-bold">
                        {job.itemNumber}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <p className="font-bold text-slate-900">{job.salaryGrade}</p>
                          <p className="text-xs text-slate-600">{job.salary}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-amber-600" />
                          {job.closing}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Link
                          to="/apply"
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
                        >
                          <Briefcase size={14} />
                          View & Apply
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Compliance Callout */}
            <div className="mt-8 rounded-xl bg-blue-50 border-l-4 border-slate-900 px-6 py-4 shadow-md">
              <p className="text-sm text-slate-800 leading-relaxed">
                <strong className="text-slate-900">CSC Compliance Statement:</strong> All positions listed herein are posted in accordance with Civil Service Commission Memorandum Circular No. 6, Series 2019 (Publication Requirements), for a minimum of thirty (30) calendar days. The HRMO is an Equal Opportunity Employer committed to merit-based, transparent, and inclusive recruitment.
              </p>
            </div>

            {/* Job Details & Requirements Cards */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Qualification Standards */}
              <div className="rounded-xl bg-white border-2 border-slate-200 p-6 shadow-md">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <FileText size={20} className="text-slate-900" />
                  Sample Qualifications
                </h3>
                <div className="space-y-4">
                  {filteredJobs.slice(0, 2).map((job) => (
                    <div key={job.id} className="border-l-2 border-amber-600 pl-4">
                      <p className="font-bold text-slate-900 text-sm">{job.title}</p>
                      <p className="text-xs text-slate-600 mt-1">
                        <strong>Education:</strong> {job.education}
                      </p>
                      <p className="text-xs text-slate-600">
                        <strong>Eligibility:</strong> {job.eligibility}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Required Documents */}
              <div className="rounded-xl bg-white border-2 border-slate-200 p-6 shadow-md">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <AlertCircle size={20} className="text-slate-900" />
                  Required Documents
                </h3>
                <ul className="text-sm text-slate-700 space-y-2">
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Duly accomplished Personal Data Sheet (PDS)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Certified true copy of National Certificate of Non-Criminal Liability (NCLC)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Professional/Educational Certificates and Credentials</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Medical Certificate of Fitness</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>Proof of passing CS Examination (for eligible positions)</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ABOUT VIEW - HRMO Mission, Vision, Values
          ═══════════════════════════════════════════════════════════════════ */}
      {activeView === 'about' && (
        <main className="px-4 sm:px-6 lg:px-8 py-12">
          <div className="mx-auto max-w-4xl">
            {/* Header */}
            <div className="mb-12">
              <h2 className="text-4xl font-bold text-slate-900 mb-4">
                About the Human Resource Management Office
              </h2>
              <p className="text-lg text-slate-700">
                Delivering excellence in public service through merit-based recruitment, strategic performance management, and continuous capability development.
              </p>
            </div>

            {/* Vision & Mission Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              {/* Vision */}
              <div className="rounded-xl bg-white border-2 border-slate-200 p-8 shadow-md">
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Our Vision</h3>
                <p className="text-slate-700 leading-relaxed text-lg">
                  {HRMO_INFO.vision}
                </p>
              </div>

              {/* Mission */}
              <div className="rounded-xl bg-white border-2 border-slate-200 p-8 shadow-md">
                <h3 className="text-2xl font-bold text-slate-900 mb-4">Our Mission</h3>
                <p className="text-slate-700 leading-relaxed text-lg">
                  {HRMO_INFO.mission}
                </p>
              </div>
            </div>

            {/* Core Values */}
            <div className="mb-12">
              <h3 className="text-2xl font-bold text-slate-900 mb-8">Core Values</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {HRMO_INFO.values.map((value, idx) => {
                  const Icon = value.icon;
                  return (
                    <div key={idx} className="rounded-xl bg-white border-2 border-slate-200 p-8 shadow-md">
                      <div className="mb-4 h-12 w-12 rounded-lg bg-slate-900 flex items-center justify-center">
                        <Icon size={24} className="text-white" />
                      </div>
                      <h4 className="text-lg font-bold text-slate-900 mb-2">{value.title}</h4>
                      <p className="text-slate-700">{value.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Citizen's Charter */}
            <div className="rounded-xl bg-blue-50 border-2 border-slate-900 p-8 shadow-md">
              <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileText size={24} />
                Citizen's Charter
              </h3>
              <p className="text-slate-800 mb-6">
                The HRMO is committed to providing excellent, efficient, and equitable service to all stakeholders. Our Citizen's Charter outlines our service standards, performance targets, and customer feedback mechanisms.
              </p>
              <button className="inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 font-bold transition focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2">
                <ExternalLink size={16} />
                Download Citizen's Charter
              </button>
            </div>

            {/* Contact Information */}
            <div className="mt-12 rounded-xl bg-white border-2 border-slate-200 p-8 shadow-md">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-start gap-4">
                  <Phone size={20} className="text-slate-900 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-bold text-slate-900">Telephone</p>
                    <p className="text-slate-700">+63 (2) 123-4567</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Mail size={20} className="text-slate-900 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-bold text-slate-900">Email</p>
                    <p className="text-slate-700">support@hrmo.gov.ph</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <MapPin size={20} className="text-slate-900 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-bold text-slate-900">Office Hours</p>
                    <p className="text-slate-700">Monday - Friday, 8:00 AM - 5:00 PM</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <AlertCircle size={20} className="text-slate-900 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-bold text-slate-900">Support Desk</p>
                    <p className="text-slate-700">Available during office hours</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          LOGIN MODAL - Three-Way Portal Gateway
          ═══════════════════════════════════════════════════════════════════ */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-slate-900 text-white px-6 py-6 border-b-4 border-amber-600 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Portal Access Gateway</h2>
              <button
                onClick={() => setShowLoginModal(false)}
                className="text-white hover:bg-slate-800 p-2 rounded-lg transition"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-8">
              {/* Tab Navigation */}
              <div className="mb-8 flex gap-2 border-b-2 border-slate-200">
                {['employee', 'admin', 'interviewer'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSelectedLoginTab(tab as 'employee' | 'admin' | 'interviewer')}
                    className={`py-3 px-6 font-bold text-sm uppercase tracking-wide border-b-4 transition ${
                      selectedLoginTab === tab
                        ? 'border-b-4 border-amber-600 text-slate-900'
                        : 'border-b-4 border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab === 'employee' && 'Employee Portal'}
                    {tab === 'admin' && 'HR Admin Portal'}
                    {tab === 'interviewer' && 'Interviewer Portal'}
                  </button>
                ))}
              </div>

              {/* Login Form */}
              <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
                {/* Email/ID Input */}
                <div>
                  <label className="block text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">
                    {selectedLoginTab === 'employee' ? 'Employee ID or Email' : 'Email Address'}
                  </label>
                  <input
                    type="text"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder={selectedLoginTab === 'employee' ? 'EMP-0001234' : 'your.email@gov.ph'}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 font-medium transition focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg text-slate-900 placeholder-slate-500 font-medium transition focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 transition"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-2 border-slate-300 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-slate-700">Remember this device</span>
                </label>

                {/* Sign In Button */}
                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 flex items-center justify-center gap-2"
                >
                  <LogIn size={18} />
                  Sign In
                </button>

                {/* Forgot Password */}
                <div className="text-center">
                  <a href="#" className="text-sm font-bold text-slate-900 hover:text-slate-700 transition">
                    Forgot your password?
                  </a>
                </div>
              </form>

              {/* Security & Compliance Notice */}
              <div className="mt-8 rounded-lg bg-slate-50 border-l-4 border-slate-900 p-4">
                <p className="text-xs text-slate-700 leading-relaxed">
                  <strong className="text-slate-900">Security Notice:</strong> Authorized Government Access Only. This system is protected by government-grade encryption. All login activities are logged and monitored in compliance with RA 10173 (Data Privacy Act). Unauthorized access is prohibited.
                </p>
              </div>

              {/* Divider */}
              <div className="my-6 relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t-2 border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-xs font-bold text-slate-600 uppercase tracking-wide">
                  <span className="px-2 bg-white">Not a registered user?</span>
                </div>
              </div>

              {/* External Links */}
              <div className="space-y-2">
                <Link
                  to="/apply"
                  className="block w-full py-3 px-4 border-2 border-slate-900 text-slate-900 font-bold rounded-lg hover:bg-slate-50 transition text-center"
                >
                  Apply for a Job Position
                </Link>
                <button className="w-full py-3 px-4 border-2 border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition">
                  Request Password Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
