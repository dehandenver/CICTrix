import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Building2, Users, Target, BookOpen, 
  ShieldCheck, Lock, ChevronDown, Activity, UserCheck, 
  FileText, HelpCircle, Info, FileBarChart
} from 'lucide-react';

export const LandingPage = () => {
  const [showLoginDropdown, setShowLoginDropdown] = useState(false);
  const navigate = useNavigate();

  const handlePortalAccess = (role: 'employee' | 'admin') => {
    navigate('/login', { state: { role } });
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
      
      {/* 1. Header / Navigation Bar */}
      <header className="bg-white border-b-4 border-blue-900 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Left side */}
            <div className="flex items-center gap-4">
              <div className="bg-blue-900 p-2.5 rounded-lg shadow-sm">
                <Building2 className="text-white h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-blue-950 uppercase">
                  GovHRIS
                </h1>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest hidden sm:block">
                  Human Resource Information System
                </p>
              </div>
            </div>

            {/* Right side */}
            <div className="hidden md:flex items-center gap-8">
              <nav className="flex space-x-6 text-sm font-medium text-slate-600">
                <a href="#about" className="hover:text-blue-900 transition-colors flex items-center gap-1.5"><Info className="w-4 h-4"/> About</a>
                <a href="#portals" className="hover:text-blue-900 transition-colors flex items-center gap-1.5"><Building2 className="w-4 h-4"/> Portals</a>
                <a href="#helpdesk" className="hover:text-blue-900 transition-colors flex items-center gap-1.5"><HelpCircle className="w-4 h-4"/> Helpdesk</a>
              </nav>

              <div className="relative">
                <button 
                  onClick={() => setShowLoginDropdown(!showLoginDropdown)}
                  className="bg-blue-900 hover:bg-blue-800 text-white px-5 py-2.5 rounded-md shadow flex items-center gap-2 font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-900 focus:ring-offset-2"
                >
                  <Lock className="w-4 h-4" />
                  Sign In
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showLoginDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showLoginDropdown && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-xl border border-slate-100 py-1 z-50">
                    <div className="px-4 py-2 border-b border-slate-50 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Select Access Level
                    </div>
                    <button 
                      onClick={() => handlePortalAccess('employee')}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-3 transition-colors"
                    >
                      <UserCheck className="w-4 h-4 text-blue-600" />
                      Employee Self-Service
                    </button>
                    <button 
                      onClick={() => handlePortalAccess('admin')}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-3 transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4 text-red-600" />
                      HR Admin Portal
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="bg-slate-900 text-white relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 transform translate-x-1/3 -translate-y-1/2"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28 relative z-10 flex flex-col lg:flex-row items-center gap-12">
          
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-block px-3 py-1 bg-blue-800/80 border border-blue-700/50 rounded-full text-xs font-semibold tracking-wider uppercase mb-6 text-blue-200">
              Official Agency Gateway
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
              Empowering Public Servants, <span className="text-blue-400">Streamlining Human Resources.</span>
            </h2>
            <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl mx-auto lg:mx-0 font-light leading-relaxed">
              A secure, centralized, and data-driven platform designed exclusively to manage personnel operations, build competencies, and foster institutional excellence across the government sector.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <button 
                onClick={() => handlePortalAccess('employee')}
                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-md font-bold shadow-lg flex items-center justify-center gap-3 transition-all text-sm uppercase tracking-wide border border-blue-500 hover:shadow-blue-500/20"
              >
                <Users className="w-5 h-5" />
                Access Employee Portal
              </button>
              <button 
                onClick={() => handlePortalAccess('admin')}
                className="bg-transparent border-2 border-slate-600 hover:border-slate-400 hover:bg-slate-800 text-white px-8 py-4 rounded-md font-bold flex items-center justify-center gap-3 transition-all text-sm uppercase tracking-wide"
              >
                <ShieldCheck className="w-5 h-5" />
                HR Admin Login
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Stats / Overview Ribbon */}
      <section className="bg-blue-950 border-y border-blue-900 shadow-inner z-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-blue-800/50">
            <div className="py-8 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-bold text-white mb-2">2,000+</span>
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-widest">Personnel Managed</span>
            </div>
            <div className="py-8 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-bold text-white mb-2">100%</span>
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-widest">Digital Processing</span>
            </div>
            <div className="py-8 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
                <Activity className="w-6 h-6 text-blue-400" /> Live
              </span>
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-widest">Real-time Analytics</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Core Pillars / Modules Section */}
      <section id="portals" className="py-20 lg:py-24 bg-slate-50 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">Core Functional Pillars</h3>
            <p className="text-slate-600 max-w-2xl mx-auto text-base">
              Comprehensive frameworks designed to optimize the employee lifecycle, from initial recruitment to continuous leadership development.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* RSP Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center mb-6 border border-blue-100">
                <Target className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3 tracking-tight">Recruitment & Selection</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Tracking competitive vacancies, evaluating competencies, and seamlessly onboarding new public talent to ensure a meritocratic hiring process.
              </p>
            </div>

            {/* PM Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 hover:shadow-md transition-shadow relative overflow-hidden">
               <div className="w-14 h-14 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center mb-6 border border-blue-100">
                <FileBarChart className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3 tracking-tight">Performance Management</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Managing government evaluation frameworks, setting clear performance targets, and tracking individual and departmental commitments accurately.
              </p>
            </div>

            {/* LND Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center mb-6 border border-blue-100">
                <BookOpen className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3 tracking-tight">Learning & Development</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Tracking professional training records, analyzing competency gaps, and scheduling centralized seminar and development assignments.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Footer */}
      <footer className="bg-slate-900 text-slate-400 py-10 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            
            <div className="flex items-center gap-4">
              <ShieldCheck className="w-8 h-8 text-blue-600" />
              <div className="text-sm">
                <p className="font-bold text-slate-200 mb-1">Official Government Platform</p>
                <p className="text-xs">Operated in compliance with the Data Privacy Act of 2012.</p>
              </div>
            </div>

            <div className="flex gap-6 text-sm font-medium">
              <a href="#" className="hover:text-blue-400 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-blue-400 transition-colors">Terms of Service</a>
              <a href="#helpdesk" className="hover:text-blue-400 transition-colors">Technical Support</a>
            </div>

            <div className="text-right text-xs font-mono bg-slate-800 px-3 py-2 rounded border border-slate-700">
              <p>v3.0.0-govhris</p>
            </div>
            
          </div>
        </div>
      </footer>

    </div>
  );
};
