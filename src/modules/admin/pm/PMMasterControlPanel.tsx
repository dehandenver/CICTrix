import React, { useState } from 'react';
import {
  Shield,
  Users,
  SlidersHorizontal,
  FolderLock,
  Building2,
  GitCompare,
  Clock,
  Database,
  ArrowRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  CheckCircle2,
  TrendingUp,
  FileCheck,
  RefreshCw,
  Lock,
  Unlock,
  AlertCircle,
  Info
} from 'lucide-react';

interface OfficeInfo {
  id: string;
  name: string;
  headName: string;
  supervisorName: string;
  totalPersonnel: number;
}

interface PerformanceBundle {
  officeId: string;
  officeName: string;
  employeeCount: number;
  submittedIPCRs: number; // count of employees submitted
  hasSupervisorDPCR: boolean;
  hasDeptHeadOPCR: boolean;
  status: 'Incomplete' | 'Ready for Review' | 'Closed Out';
}

const INITIAL_OFFICES: OfficeInfo[] = [
  { id: '1', name: 'Office of the Mayor', headName: 'Hon. Mayor Jose Calida', supervisorName: 'Atty. Maria Santos', totalPersonnel: 15 },
  { id: '2', name: 'Human Resource Management Office (HRMO)', headName: 'Dir. Angela B. Victoria', supervisorName: 'Mrs. Rebecca Ramos', totalPersonnel: 12 },
  { id: '3', name: 'Information Technology Division (ITD)', headName: 'Engr. David C. Lim', supervisorName: 'Mr. Kenneth Fernandez', totalPersonnel: 8 },
  { id: '4', name: 'City Treasury Department', headName: 'Ms. Clara Diaz-Santos', supervisorName: 'Mr. Ricardo Puno', totalPersonnel: 22 },
  { id: '5', name: 'City Planning & Development Office', headName: 'Arch. Fernando Torres', supervisorName: 'Ms. Teresa Reyes', totalPersonnel: 10 }
];

const INITIAL_BUNDLES: PerformanceBundle[] = [
  { officeId: '1', officeName: 'Office of the Mayor', employeeCount: 15, submittedIPCRs: 15, hasSupervisorDPCR: true, hasDeptHeadOPCR: true, status: 'Ready for Review' },
  { officeId: '2', officeName: 'Human Resource Management Office (HRMO)', employeeCount: 12, submittedIPCRs: 11, hasSupervisorDPCR: true, hasDeptHeadOPCR: false, status: 'Incomplete' },
  { officeId: '3', officeName: 'Information Technology Division (ITD)', employeeCount: 8, submittedIPCRs: 8, hasSupervisorDPCR: true, hasDeptHeadOPCR: true, status: 'Closed Out' },
  { officeId: '4', officeName: 'City Treasury Department', employeeCount: 22, submittedIPCRs: 18, hasSupervisorDPCR: false, hasDeptHeadOPCR: false, status: 'Incomplete' },
  { officeId: '5', officeName: 'City Planning & Development Office', employeeCount: 10, submittedIPCRs: 10, hasSupervisorDPCR: true, hasDeptHeadOPCR: true, status: 'Ready for Review' }
];

export const PMMasterControlPanel: React.FC = () => {
  // Main tabs: 'roster' | 'cycle' | 'bundle'
  const [activeTab, setActiveTab] = useState<'roster' | 'cycle' | 'bundle'>('roster');

  // Subtabs
  const [rosterSubtab, setRosterSubtab] = useState<'directory' | 'iam'>('directory');
  const [cycleSubtab, setCycleSubtab] = useState<'timeline' | 'storage'>('timeline');
  const [bundleSubtab, setBundleSubtab] = useState<'pipeline' | 'dock'>('pipeline');

  // Directory Search
  const [searchQuery, setSearchQuery] = useState('');
  const [offices, setOffices] = useState<OfficeInfo[]>(INITIAL_OFFICES);

  // IAM / Emergency Rerouting State
  const [selectedOfficeId, setSelectedOfficeId] = useState('1');
  const [outgoingSupervisor, setOutgoingSupervisor] = useState('');
  const [incomingSupervisor, setIncomingSupervisor] = useState('');
  const [reroutingAlert, setReroutingAlert] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Cycle Hard-locks
  const [targetPhaseOpen, setTargetPhaseOpen] = useState(true);
  const [ratingPhaseOpen, setRatingPhaseOpen] = useState(false);

  // Performance Bundles State
  const [bundles, setBundles] = useState<PerformanceBundle[]>(INITIAL_BUNDLES);
  const [auditMessage, setAuditMessage] = useState<string | null>(null);

  // Filtered offices
  const filteredOffices = offices.filter(o =>
    o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.headName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.supervisorName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Emergency Rerouting Handler
  const handleEmergencyReroute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!outgoingSupervisor.trim() || !incomingSupervisor.trim()) {
      setReroutingAlert({ type: 'error', message: 'Please enter both outgoing and successor names.' });
      return;
    }

    // Update supervisor in Roster
    setOffices(prev => prev.map(o => {
      if (o.id === selectedOfficeId) {
        return { ...o, supervisorName: incomingSupervisor };
      }
      return o;
    }));

    setReroutingAlert({
      type: 'success',
      message: `Successfully transitioned all pending submissions from ${outgoingSupervisor} to ${incomingSupervisor}. All Office Account privileges migrated.`
    });
    setOutgoingSupervisor('');
    setIncomingSupervisor('');
    setTimeout(() => setReroutingAlert(null), 6000);
  };

  // Closeout Bundle Handler
  const handleCloseout = (officeId: string) => {
    const bundle = bundles.find(b => b.officeId === officeId);
    if (!bundle) return;

    if (bundle.submittedIPCRs < bundle.employeeCount || !bundle.hasSupervisorDPCR || !bundle.hasDeptHeadOPCR) {
      setAuditMessage(`Cannot close out ${bundle.officeName}. Validation failed: All component forms (IPCRs, DPCR, OPCR) must be submitted.`);
      return;
    }

    setBundles(prev => prev.map(b => {
      if (b.officeId === officeId) {
        return { ...b, status: 'Closed Out' };
      }
      return b;
    }));
    setAuditMessage(`Successfully locked, compiled, and closed out performance bundle for ${bundle.officeName}.`);
    setTimeout(() => setAuditMessage(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* ── Dashboard Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-sm text-blue-650 font-medium mb-1">
            <span>Performance Management</span>
            <span className="text-slate-400">&gt;</span>
            <span className="text-slate-500">PM Master Control Panel</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Shield className="h-7 w-7 text-blue-600" />
            PM Master Control Panel
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Global administrative console to enforce timelines, map office hierarchies, and verify final performance packages.
          </p>
        </div>

        {/* Global Overview Indicators */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-805">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            System Secure
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-805">
            <Clock className="h-4 w-4 text-blue-600" />
            1st Sem Cycle Active
          </div>
        </div>
      </div>

      {/* ── Main Tab Navigation ── */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('roster')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 font-semibold text-sm transition-all ${
            activeTab === 'roster'
              ? 'border-blue-650 text-blue-655 bg-blue-50/30'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-55'
          }`}
        >
          <Building2 className="h-4 w-4" />
          Office Architecture & Roster
        </button>
        <button
          onClick={() => setActiveTab('cycle')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 font-semibold text-sm transition-all ${
            activeTab === 'cycle'
              ? 'border-blue-650 text-blue-655 bg-blue-50/30'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-55'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Employee Cycle Controls
        </button>
        <button
          onClick={() => setActiveTab('bundle')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 font-semibold text-sm transition-all ${
            activeTab === 'bundle'
              ? 'border-blue-650 text-blue-655 bg-blue-50/30'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-55'
          }`}
        >
          <FolderLock className="h-4 w-4" />
          Performance Bundle Audit
        </button>
      </div>

      {/* ── Tab Content Area ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[450px]">
        
        {/* 🏢 TAB 1: ROSTER MANAGER */}
        {activeTab === 'roster' && (
          <div>
            <div className="flex border-b border-slate-100 bg-slate-50/50 px-4 py-2">
              <button
                onClick={() => setRosterSubtab('directory')}
                className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                  rosterSubtab === 'directory' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Office Directory Matrix
              </button>
              <button
                onClick={() => setRosterSubtab('iam')}
                className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                  rosterSubtab === 'iam' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Access & Identity Management (IAM)
              </button>
            </div>

            <div className="p-6">
              {rosterSubtab === 'directory' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-800">Office Directory Matrix</h3>
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search office or personnel..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-100">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100 text-xs">
                          <th className="px-4 py-3">Office Name</th>
                          <th className="px-4 py-3">Department Head</th>
                          <th className="px-4 py-3">Designated Supervisor</th>
                          <th className="px-4 py-3 text-center">Total Personnel</th>
                          <th className="px-4 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredOffices.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-slate-400 italic">No offices matched query</td>
                          </tr>
                        ) : (
                          filteredOffices.map((office) => (
                            <tr key={office.id} className="hover:bg-slate-50/50 transition">
                              <td className="px-4 py-3.5 font-bold text-slate-800">{office.name}</td>
                              <td className="px-4 py-3.5 text-slate-600">{office.headName}</td>
                              <td className="px-4 py-3.5 text-slate-600">{office.supervisorName}</td>
                              <td className="px-4 py-3.5 text-center font-semibold text-slate-705">{office.totalPersonnel}</td>
                              <td className="px-4 py-3.5 text-center">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active Roster
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {rosterSubtab === 'iam' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 mb-1">Access & Identity Management</h3>
                    <p className="text-xs text-slate-500">Configure administrative access for Office Accounts or trigger emergency routing.</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Emergency Rerouting Form */}
                    <div className="rounded-xl border border-slate-200 p-5 space-y-4">
                      <div className="flex items-center gap-2 text-amber-800 bg-amber-50 border border-amber-100 p-3 rounded-lg text-xs">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                        <div>
                          <p className="font-bold">Emergency Rerouting Tool</p>
                          <p className="mt-0.5">Transition pending employee IPCR evaluations when a designated Supervisor or Department Head leaves the office.</p>
                        </div>
                      </div>

                      <form onSubmit={handleEmergencyReroute} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-655 mb-1">Target Office</label>
                          <select
                            value={selectedOfficeId}
                            onChange={(e) => setSelectedOfficeId(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            {offices.map(o => (
                              <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-655 mb-1">Outgoing Supervisor/Head</label>
                            <input
                              type="text"
                              value={outgoingSupervisor}
                              onChange={(e) => setOutgoingSupervisor(e.target.value)}
                              placeholder="e.g. John Doe"
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-655 mb-1">Successor Rater/Head</label>
                            <input
                              type="text"
                              value={incomingSupervisor}
                              onChange={(e) => setIncomingSupervisor(e.target.value)}
                              placeholder="e.g. Atty. Jane Smith"
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-xs font-semibold transition flex items-center justify-center gap-1.5"
                        >
                          <GitCompare className="h-4 w-4" />
                          Execute Rerouting Transition
                        </button>
                      </form>

                      {reroutingAlert && (
                        <div className={`p-3.5 rounded-lg border text-xs flex gap-2 ${
                          reroutingAlert.type === 'success' 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-808' 
                            : 'bg-red-50 border-red-200 text-red-808'
                        }`}>
                          {reroutingAlert.type === 'success' ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-red-650 shrink-0" />
                          )}
                          <div>{reroutingAlert.message}</div>
                        </div>
                      )}
                    </div>

                    {/* Active IAM Personnel Matrix */}
                    <div className="rounded-xl border border-slate-200 p-5 space-y-4">
                      <h4 className="text-sm font-bold text-slate-800">IAM Office Authority Map</h4>
                      <p className="text-xs text-slate-500">Currently authorized sign-offs for evaluation cycles.</p>
                      
                      <div className="space-y-3">
                        {offices.map(o => (
                          <div key={o.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-105 bg-slate-50/50 text-xs">
                            <div>
                              <p className="font-bold text-slate-800">{o.name}</p>
                              <p className="text-slate-500 mt-0.5">Head: {o.headName}</p>
                            </div>
                            <div className="text-right">
                              <span className="inline-block rounded-md bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-0.5 font-semibold">
                                Supervisor: {o.supervisorName}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ⚙️ TAB 2: EMPLOYEE CYCLE CONTROLS */}
        {activeTab === 'cycle' && (
          <div>
            <div className="flex border-b border-slate-100 bg-slate-50/50 px-4 py-2">
              <button
                onClick={() => setCycleSubtab('timeline')}
                className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                  cycleSubtab === 'timeline' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Timeline & Switchboard Engine
              </button>
              <button
                onClick={() => setCycleSubtab('storage')}
                className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                  cycleSubtab === 'storage' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Cold Storage Target Registry
              </button>
            </div>

            <div className="p-6">
              {cycleSubtab === 'timeline' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 mb-1">Timeline & Switchboard Engine</h3>
                    <p className="text-xs text-slate-500">Configure global hard-locks on target submission and evaluation phases.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Switchboard Toggles */}
                    <div className="rounded-xl border border-slate-200 p-5 space-y-6">
                      <h4 className="text-sm font-bold text-slate-800">Hard-Lock Switchboard</h4>
                      
                      {/* Phase 1 Switch */}
                      <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/30">
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            {targetPhaseOpen ? <Unlock className="h-3.5 w-3.5 text-blue-600" /> : <Lock className="h-3.5 w-3.5 text-slate-500" />}
                            Phase 1: Target Setting Phase
                          </p>
                          <p className="text-[11px] text-slate-500">Allows employees to create and edit performance targets.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTargetPhaseOpen(!targetPhaseOpen)}
                          className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 focus:outline-none ${
                            targetPhaseOpen ? 'bg-blue-600' : 'bg-slate-300'
                          }`}
                        >
                          <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ${targetPhaseOpen ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                      </div>

                      {/* Phase 2 Switch */}
                      <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/30">
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            {ratingPhaseOpen ? <Unlock className="h-3.5 w-3.5 text-blue-600" /> : <Lock className="h-3.5 w-3.5 text-slate-500" />}
                            Phase 2: 6-Month Rating Phase
                          </p>
                          <p className="text-[11px] text-slate-500">Unlocks employee ratings and supervisor validation.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRatingPhaseOpen(!ratingPhaseOpen)}
                          className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 focus:outline-none ${
                            ratingPhaseOpen ? 'bg-blue-600' : 'bg-slate-300'
                          }`}
                        >
                          <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ${ratingPhaseOpen ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </div>

                    {/* Timeline Progression Status */}
                    <div className="rounded-xl border border-slate-200 p-5 space-y-4 flex flex-col justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-2">Cycle Status Summary</h4>
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                            <span className="text-slate-500">Current Semester:</span>
                            <span className="font-semibold text-slate-800">1st Semester (Jan - Jun 2025)</span>
                          </div>
                          <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                            <span className="text-slate-500">Cycle Lock Status:</span>
                            <span className={`font-semibold ${!targetPhaseOpen && !ratingPhaseOpen ? 'text-red-600' : 'text-blue-600'}`}>
                              {!targetPhaseOpen && !ratingPhaseOpen ? 'Hard Locked' : 'Active (Open Phase)'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">Next Automatic Freeze:</span>
                            <span className="font-semibold text-slate-800">Dec 31, 2025</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 bg-blue-50/50 rounded-lg border border-blue-100 text-xs text-blue-805">
                        <p className="font-bold flex items-center gap-1.5 mb-0.5">
                          <Info className="h-4 w-4 text-blue-650" />
                          Timeline Automation Rule
                        </p>
                        Once targets are submitted and the 6-month rating phase is opened, the Phase 1 target settings are automatically committed to Cold Storage.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {cycleSubtab === 'storage' && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-slate-900 text-slate-100 p-5 border border-slate-800 flex items-start gap-4">
                    <Database className="h-8 w-8 text-blue-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm text-slate-50">Cold Storage Database Vault</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        This is the un-editable database vault where Phase 1 target templates are securely frozen and locked for 6 months.
                        Alterations to baseline targets require special administrative credentials.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                          <th className="px-4 py-2.5">Office</th>
                          <th className="px-4 py-2.5">Employee Name</th>
                          <th className="px-4 py-2.5">Locked Target Metric</th>
                          <th className="px-4 py-2.5 text-center">Version ID</th>
                          <th className="px-4 py-2.5 text-center">Freeze Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                        <tr className="hover:bg-slate-50/40">
                          <td className="px-4 py-3 font-semibold text-slate-850 font-sans">HRMO</td>
                          <td className="px-4 py-3 font-sans">Alice Vance</td>
                          <td className="px-4 py-3">Process 90% of recruitment requests within 10 days</td>
                          <td className="px-4 py-3 text-center">#T-2025-A21</td>
                          <td className="px-4 py-3 text-center">2025-01-15</td>
                        </tr>
                        <tr className="hover:bg-slate-50/40">
                          <td className="px-4 py-3 font-semibold text-slate-850 font-sans">ITD</td>
                          <td className="px-4 py-3 font-sans">Bob Miller</td>
                          <td className="px-4 py-3">Ensure 99.9% uptime on internal web portals</td>
                          <td className="px-4 py-3 text-center">#T-2025-B42</td>
                          <td className="px-4 py-3 text-center">2025-01-18</td>
                        </tr>
                        <tr className="hover:bg-slate-50/40">
                          <td className="px-4 py-3 font-semibold text-slate-850 font-sans">Treasury</td>
                          <td className="px-4 py-3 font-sans">Carol Smith</td>
                          <td className="px-4 py-3">Disburse tax statements in under 3 minutes average wait</td>
                          <td className="px-4 py-3 text-center">#T-2025-C11</td>
                          <td className="px-4 py-3 text-center">2025-01-20</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 📦 TAB 3: PERFORMANCE BUNDLE AUDIT */}
        {activeTab === 'bundle' && (
          <div>
            <div className="flex border-b border-slate-100 bg-slate-50/50 px-4 py-2">
              <button
                onClick={() => setBundleSubtab('pipeline')}
                className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                  bundleSubtab === 'pipeline' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Office Tracking Pipeline
              </button>
              <button
                onClick={() => setBundleSubtab('dock')}
                className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                  bundleSubtab === 'dock' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Bundle Review Dock
              </button>
            </div>

            <div className="p-6">
              {bundleSubtab === 'pipeline' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 mb-1">Office Tracking Pipeline</h3>
                    <p className="text-xs text-slate-500">Real-time progress overview tracking office account compilations.</p>
                  </div>

                  <div className="space-y-4">
                    {bundles.map(b => {
                      const ipcrPct = Math.round((b.submittedIPCRs / b.employeeCount) * 100);
                      const isVerified = b.status === 'Closed Out';
                      
                      return (
                        <div key={b.officeId} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/30">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-slate-850">{b.officeName}</h4>
                              <p className="text-[11px] text-slate-500 mt-0.5">Compliance Level: {b.submittedIPCRs}/{b.employeeCount} IPCRs</p>
                            </div>
                            <div>
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                isVerified 
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                                  : b.status === 'Ready for Review'
                                  ? 'bg-blue-50 text-blue-800 border border-blue-100'
                                  : 'bg-amber-50 text-amber-800 border border-amber-100'
                              }`}>
                                {b.status}
                              </span>
                            </div>
                          </div>

                          {/* Progress Line */}
                          <div className="relative">
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-500 ${isVerified ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${ipcrPct}%` }} />
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                              <span>Submitted: {ipcrPct}%</span>
                              <span className="font-semibold text-slate-655">Office Verified: {isVerified ? '100%' : 'Pending Closeout'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {bundleSubtab === 'dock' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 mb-1">Bundle Review Dock</h3>
                    <p className="text-xs text-slate-500">Perform compliance checks on compiled office bundles before archiving.</p>
                  </div>

                  {auditMessage && (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 text-blue-800 p-4 text-xs font-semibold flex items-center gap-2">
                      <Info className="h-5 w-5 shrink-0" />
                      {auditMessage}
                    </div>
                  )}

                  <div className="space-y-5">
                    {bundles.map(b => {
                      const allIPCRsDone = b.submittedIPCRs === b.employeeCount;
                      const allPresent = allIPCRsDone && b.hasSupervisorDPCR && b.hasDeptHeadOPCR;

                      return (
                        <div key={b.officeId} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                          <header className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-850">{b.officeName}</h4>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                              allPresent ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {allPresent ? 'Compliant & Audit-Ready' : 'Incomplete Package'}
                            </span>
                          </header>

                          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Checklist */}
                            <div className="space-y-2">
                              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Required Package Contents</h5>
                              <ul className="space-y-1.5 text-xs">
                                <li className="flex items-center gap-2">
                                  {allIPCRsDone ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                                  <span>Individual IPCRs ({b.submittedIPCRs}/{b.employeeCount})</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  {b.hasSupervisorDPCR ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                                  <span>1 Supervisor DPCR</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  {b.hasDeptHeadOPCR ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                                  <span>1 Department Head OPCR</span>
                                </li>
                              </ul>
                            </div>

                            {/* Status Indicator */}
                            <div className="flex flex-col justify-center">
                              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Bundle Audit Status</span>
                              {b.status === 'Closed Out' ? (
                                <p className="text-emerald-700 font-bold text-xs flex items-center gap-1">
                                  <CheckCircle className="h-4 w-4" /> Locked & Completed
                                </p>
                              ) : allPresent ? (
                                <p className="text-blue-705 font-bold text-xs flex items-center gap-1">
                                  <Info className="h-4 w-4 text-blue-600" /> Package verified. Ready for closeout.
                                </p>
                              ) : (
                                <p className="text-amber-708 font-bold text-xs flex items-center gap-1">
                                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Deficiencies detected. Cannot closeout.
                                </p>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end">
                              {b.status !== 'Closed Out' ? (
                                <button
                                  onClick={() => handleCloseout(b.officeId)}
                                  disabled={!allPresent}
                                  className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                                    allPresent 
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm' 
                                      : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                                  }`}
                                >
                                  Approve Bundle & Closeout
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 font-semibold italic flex items-center gap-1">
                                  <FolderLock className="h-4 w-4" /> Archived
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
