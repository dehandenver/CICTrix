import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Sliders,
  FolderSymlink,
  ClipboardCheck,
  TrendingUp,
  UserCheck,
  Edit3,
  CheckCircle,
  Clock,
  ArrowRight,
  Database,
  Shield,
  HelpCircle,
  Bell,
  UserCircle2,
  Lock,
  FileSpreadsheet,
  Send,
  AlertTriangle,
  Info,
  User
} from 'lucide-react';
import { LogoutConfirmPopover } from '../../../components/LogoutConfirmPopover';

interface EmployeeTarget {
  id: string;
  name: string;
  position: string;
  targetMetric: string;
  status: 'Pending Verification' | 'Verified' | 'Transmitted';
  lastEditedBy?: string;
}

interface EmployeeRating {
  id: string;
  name: string;
  position: string;
  selfRating: number;
  supervisorRating: number;
  rationale?: string;
  status: 'Draft' | 'Validated' | 'Overridden';
}

interface TransmittalRecord {
  id: string;
  batchId: string;
  verifiedCount: number;
  transmittedAt: string;
  status: 'In PM Vault' | 'Processing';
}

const INITIAL_TARGETS: EmployeeTarget[] = [
  { id: '101', name: 'Alice Vance', position: 'HR Assistant', targetMetric: 'Process 90% of recruitment requests within 10 days', status: 'Pending Verification' },
  { id: '102', name: 'Bob Miller', position: 'IT Support Specialist', targetMetric: 'Ensure 99% uptime on internal web portals', status: 'Pending Verification' },
  { id: '103', name: 'Charlie Green', position: 'Treasury Clerk', targetMetric: 'Process tax clearance certificates in under 5 minutes', status: 'Verified' },
  { id: '104', name: 'Diana Prince', position: 'Senior Planner', targetMetric: 'Submit monthly development blueprints by 25th', status: 'Verified' }
];

const INITIAL_RATINGS: EmployeeRating[] = [
  { id: '101', name: 'Alice Vance', position: 'HR Assistant', selfRating: 4.8, supervisorRating: 4.8, status: 'Draft' },
  { id: '102', name: 'Bob Miller', position: 'IT Support Specialist', selfRating: 4.5, supervisorRating: 4.5, status: 'Draft' },
  { id: '103', name: 'Charlie Green', position: 'Treasury Clerk', selfRating: 4.9, supervisorRating: 4.2, rationale: 'Self-rating was slightly inflated relative to performance logs.', status: 'Overridden' },
  { id: '104', name: 'Diana Prince', position: 'Senior Planner', selfRating: 4.7, supervisorRating: 4.7, status: 'Validated' }
];

const INITIAL_TRANSMITTALS: TransmittalRecord[] = [
  { id: 'TX-001', batchId: 'BATCH-2025-01', verifiedCount: 4, transmittedAt: '2026-06-28 14:30', status: 'In PM Vault' },
  { id: 'TX-002', batchId: 'BATCH-2025-02', verifiedCount: 3, transmittedAt: '2026-06-29 09:15', status: 'In PM Vault' }
];

export const OfficeAccountConsole: React.FC = () => {
  const navigate = useNavigate();
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  // Navigation tabs: 'targets' | 'ratings'
  const [activeTab, setActiveTab] = useState<'targets' | 'ratings'>('targets');

  // Subtabs
  const [targetsSubtab, setTargetsSubtab] = useState<'verify' | 'transmittal'>('verify');
  const [ratingsSubtab, setRatingsSubtab] = useState<'review' | 'dpcr' | 'opcr'>('review');

  // State arrays
  const [targets, setTargets] = useState<EmployeeTarget[]>(INITIAL_TARGETS);
  const [ratings, setRatings] = useState<EmployeeRating[]>(INITIAL_RATINGS);
  const [transmittals, setTransmittals] = useState<TransmittalRecord[]>(INITIAL_TRANSMITTALS);

  // Edit Mode state
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [editTargetValue, setEditTargetValue] = useState('');

  // Rationale state for Override Controls
  const [activeOverrideId, setActiveOverrideId] = useState<string | null>(null);
  const [overrideScore, setOverrideScore] = useState<number>(4.0);
  const [overrideRationale, setOverrideRationale] = useState('');

  // DPCR & OPCR compiling simulation state
  const [dpcrCompiled, setDpcrCompiled] = useState(false);
  const [opcrCompiled, setOpcrCompiled] = useState(false);
  const [consoleMessage, setConsoleMessage] = useState<string | null>(null);

  // Direct Edit Handlers
  const startEditing = (target: EmployeeTarget) => {
    setEditingTargetId(target.id);
    setEditTargetValue(target.targetMetric);
  };

  const saveTargetEdit = (id: string) => {
    setTargets(prev => prev.map(t => {
      if (t.id === id) {
        return { ...t, targetMetric: editTargetValue, status: 'Verified', lastEditedBy: 'Supervisor' };
      }
      return t;
    }));
    setEditingTargetId(null);
    setConsoleMessage('Employee target successfully updated and verified.');
    setTimeout(() => setConsoleMessage(null), 4000);
  };

  // Push Verified Targets to PM Storage (Transmittal)
  const transmitTargetsToPM = () => {
    const verifiedTargets = targets.filter(t => t.status === 'Verified');
    if (verifiedTargets.length === 0) {
      alert('No verified targets are ready for transmittal.');
      return;
    }

    // Mark as Transmitted
    setTargets(prev => prev.map(t => {
      if (t.status === 'Verified') {
        return { ...t, status: 'Transmitted' };
      }
      return t;
    }));

    // Add to Transmittal Log
    const newTx: TransmittalRecord = {
      id: `TX-00${transmittals.length + 1}`,
      batchId: `BATCH-2025-0${transmittals.length + 1}`,
      verifiedCount: verifiedTargets.length,
      transmittedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      status: 'In PM Vault'
    };
    setTransmittals([newTx, ...transmittals]);
    setConsoleMessage(`Successfully transmitted ${verifiedTargets.length} targets to the PM database vault.`);
    setTimeout(() => setConsoleMessage(null), 4000);
  };

  // Override Controls Handlers
  const handleOpenOverride = (rating: EmployeeRating) => {
    setActiveOverrideId(rating.id);
    setOverrideScore(rating.supervisorRating);
    setOverrideRationale('');
  };

  const submitOverride = (id: string) => {
    if (!overrideRationale.trim()) {
      alert('Please enter a justification for overriding the rating.');
      return;
    }

    setRatings(prev => prev.map(r => {
      if (r.id === id) {
        return {
          ...r,
          supervisorRating: overrideScore,
          rationale: overrideRationale,
          status: r.selfRating !== overrideScore ? 'Overridden' : 'Validated'
        };
      }
      return r;
    }));

    setActiveOverrideId(null);
    setConsoleMessage('Rating overridden successfully and logged.');
    setTimeout(() => setConsoleMessage(null), 4000);
  };

  // DPCR Automation Generator
  const compileDPCR = () => {
    setDpcrCompiled(true);
    setConsoleMessage('DPCR Automation Engine: Pulled 4 employee IPCR records. Compiled Division DPCR Sheet.');
    setTimeout(() => setConsoleMessage(null), 5000);
  };

  // OPCR Master Bundle compiler
  const compileOPCRBundle = () => {
    setOpcrCompiled(true);
    setConsoleMessage('OPCR Master Generation: Condensed division DPCR packages. Transmitted Complete OPCR Package to PM.');
    setTimeout(() => setConsoleMessage(null), 6000);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      
      {/* ── Top Header ── */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm print:hidden">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-indigo-650 text-white grid place-content-center text-lg font-bold">AB</div>
            <div>
              <h1 className="text-lg font-bold leading-none">Abyan HRIS</h1>
              <p className="text-xs text-slate-500">Office Performance Console</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <button className="rounded-full p-2 hover:bg-slate-100" type="button"><HelpCircle className="h-5 w-5" /></button>
            <button className="rounded-full p-2 hover:bg-slate-100 relative" type="button">
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-1 inline-block h-2 w-2 rounded-full bg-indigo-500" />
            </button>
            <div className="h-8 w-px bg-slate-200" />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => setShowSwitchModal(!showSwitchModal)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '40px',
                      width: '40px',
                      borderRadius: '50%',
                      border: '1.5px solid #C8D1FF',
                      background: '#F0F2FD',
                      color: '#363EE8',
                      cursor: 'pointer',
                      padding: 0
                    }}
                    title="Switch Account"
                  >
                    <UserCircle2 className="h-6 w-6 text-indigo-650" />
                  </button>
                  {showSwitchModal && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '44px',
                        zIndex: 100,
                        width: '240px',
                        background: '#ffffff',
                        border: '1.5px solid #C8D1FF',
                        borderRadius: '12px',
                        boxShadow: '0 4px 20px rgba(54,62,232,0.15)',
                        padding: '16px',
                        textAlign: 'left'
                      }}
                    >
                      <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', fontWeight: 655, color: '#040E6B', lineHeight: 1.4 }}>
                        Would you like to switch to your regular Employee Account?
                      </p>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setShowSwitchModal(false);
                            navigate('/employee/dashboard');
                          }}
                          style={{
                            background: '#363EE8',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 650,
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(54,62,232,0.3)'
                          }}
                        >
                          Yes, Switch
                        </button>
                        <button
                          onClick={() => setShowSwitchModal(false)}
                          style={{
                            background: '#F0F2FD',
                            color: '#040E6B',
                            border: '1px solid #C8D1FF',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 650,
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="leading-tight text-left">
                  <p className="text-sm font-semibold text-slate-800">Maria Santos</p>
                  <p className="text-xs text-slate-500">Office Account Console</p>
                </div>
              </div>
            </div>
            <LogoutConfirmPopover />
          </div>
        </div>
      </header>

      {/* ── Main Layout ── */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-white px-3 py-4 min-h-[calc(100vh-70px)] print:hidden">
          <div className="px-3 mb-4">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Office Console</span>
          </div>
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('targets')}
              className={`w-full rounded-lg px-3 py-2.5 text-left transition flex items-center gap-3 ${
                activeTab === 'targets' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              <FileText className={`h-5 w-5 ${activeTab === 'targets' ? 'text-white' : 'text-slate-550'}`} />
              <div>
                <p className="text-sm font-semibold leading-tight">Phase 1: Targets</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Adjust employee targets</p>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('ratings')}
              className={`w-full rounded-lg px-3 py-2.5 text-left transition flex items-center gap-3 ${
                activeTab === 'ratings' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Sliders className={`h-5 w-5 ${activeTab === 'ratings' ? 'text-white' : 'text-slate-550'}`} />
              <div>
                <p className="text-sm font-semibold leading-tight">Phase 2: Ratings</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Validate self-ratings</p>
              </div>
            </button>
          </nav>
        </aside>

        {/* Content Body */}
        <main className="flex-1 p-6 space-y-6">
          
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                {activeTab === 'targets' ? (
                  <>
                    <FileText className="h-7 w-7 text-indigo-600" />
                    Phase 1: Target Interception & Adjustment
                  </>
                ) : (
                  <>
                    <Sliders className="h-7 w-7 text-indigo-600" />
                    Phase 2: Ratings Validation & Cascading Summaries
                  </>
                )}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {activeTab === 'targets' 
                  ? 'Audit and direct-edit employee target submissions before transmitting them to the central PM registrar.' 
                  : 'Verify accomplishments at the 6-month mark, apply rating overrides, and generate automated DPCR/OPCR summaries.'}
              </p>
            </div>
            
            <div className="flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-800">
              <Shield className="h-4 w-4" /> Office Account Authorized
            </div>
          </div>

          {/* Success Banner */}
          {consoleMessage && (
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-850 p-4 text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-indigo-650 shrink-0" />
              {consoleMessage}
            </div>
          )}

          {/* Main Panel Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[450px]">
            
            {/* 📥 TAB 2.1: TARGET INTERCEPTION */}
            {activeTab === 'targets' && (
              <div>
                <div className="flex border-b border-slate-100 bg-slate-50/50 px-4 py-2">
                  <button
                    onClick={() => setTargetsSubtab('verify')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                      targetsSubtab === 'verify' ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Individual Target Verification
                  </button>
                  <button
                    onClick={() => setTargetsSubtab('transmittal')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                      targetsSubtab === 'transmittal' ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    PM Transmittal Log
                  </button>
                </div>

                <div className="p-6">
                  {targetsSubtab === 'verify' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">Direct Target Verification Desk</h3>
                          <p className="text-xs text-slate-500 mt-0.5">Allows rewriting target texts to correct wording or metrics before push.</p>
                        </div>
                        <button
                          onClick={transmitTargetsToPM}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                        >
                          <FolderSymlink className="h-4 w-4" />
                          Transmit Verified Targets to PM
                        </button>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-slate-150">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-150">
                              <th className="px-4 py-3">Employee</th>
                              <th className="px-4 py-3">Proposed Target Metric</th>
                              <th className="px-4 py-3 text-center">Status</th>
                              <th className="px-4 py-3 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {targets.map(t => (
                              <tr key={t.id} className="hover:bg-slate-50/30 transition">
                                <td className="px-4 py-3">
                                  <p className="font-bold text-slate-800">{t.name}</p>
                                  <p className="text-[10px] text-slate-500">{t.position}</p>
                                </td>
                                <td className="px-4 py-3 max-w-md">
                                  {editingTargetId === t.id ? (
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={editTargetValue}
                                        onChange={(e) => setEditTargetValue(e.target.value)}
                                        className="flex-1 rounded border border-indigo-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      />
                                      <button
                                        onClick={() => saveTargetEdit(t.id)}
                                        className="bg-indigo-600 hover:bg-indigo-750 text-white rounded px-2.5 py-1 font-semibold"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => setEditingTargetId(null)}
                                        className="bg-slate-150 text-slate-700 rounded px-2.5 py-1"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <p className="text-slate-700">
                                      {t.targetMetric}
                                      {t.lastEditedBy && (
                                        <span className="ml-2 inline-block rounded bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 text-[9px] text-indigo-700 font-bold uppercase">
                                          Adjusted by {t.lastEditedBy}
                                        </span>
                                      )}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    t.status === 'Transmitted' 
                                      ? 'bg-emerald-50 text-emerald-800' 
                                      : t.status === 'Verified'
                                      ? 'bg-blue-50 text-blue-800'
                                      : 'bg-amber-50 text-amber-800'
                                  }`}>
                                    {t.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {t.status !== 'Transmitted' && (
                                    <button
                                      onClick={() => startEditing(t)}
                                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white hover:bg-slate-50 px-2 py-1 font-semibold text-slate-700"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" /> Adjust
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {targetsSubtab === 'transmittal' && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">Central PM Transmittal Log</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Historical log of batches compiled and locked into PM cold storage.</p>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-slate-150">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-650 font-semibold border-b border-slate-150">
                              <th className="px-4 py-2.5">Transmittal ID</th>
                              <th className="px-4 py-2.5">Batch Code</th>
                              <th className="px-4 py-2.5 text-center">Verified Records</th>
                              <th className="px-4 py-2.5 text-center">Transmittal Date</th>
                              <th className="px-4 py-2.5 text-center">Registrar Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                            {transmittals.map(tx => (
                              <tr key={tx.id}>
                                <td className="px-4 py-3 font-semibold text-indigo-700 font-sans">{tx.id}</td>
                                <td className="px-4 py-3">{tx.batchId}</td>
                                <td className="px-4 py-3 text-center font-sans font-semibold">{tx.verifiedCount}</td>
                                <td className="px-4 py-3 text-center">{tx.transmittedAt}</td>
                                <td className="px-4 py-3 text-center font-sans">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                                    <Database className="h-3 w-3" /> Locked & Frozen
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 📈 TAB 2.2: RATINGS VALIDATION */}
            {activeTab === 'ratings' && (
              <div>
                <div className="flex border-b border-slate-100 bg-slate-50/50 px-4 py-2">
                  <button
                    onClick={() => setRatingsSubtab('review')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                      ratingsSubtab === 'review' ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Accomplishment & Rating Review
                  </button>
                  <button
                    onClick={() => setRatingsSubtab('dpcr')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                      ratingsSubtab === 'dpcr' ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    DPCR Automation Engine
                  </button>
                  <button
                    onClick={() => setRatingsSubtab('opcr')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                      ratingsSubtab === 'opcr' ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    OPCR Master Generation
                  </button>
                </div>

                <div className="p-6">
                  {ratingsSubtab === 'review' && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">Accomplishment Audits & Overrides</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Validate employee accomplishments and override rating inflation.</p>
                      </div>

                      {activeOverrideId && (
                        <div className="rounded-xl border border-indigo-150 bg-indigo-50/40 p-4 space-y-3 text-xs">
                          <p className="font-bold text-slate-800">Override Rating for: {ratings.find(r => r.id === activeOverrideId)?.name}</p>
                          <div className="flex items-center gap-4">
                            <div>
                              <label className="block text-slate-550 mb-0.5">Override Score (1.0 - 5.0)</label>
                              <input
                                type="number"
                                step="0.1"
                                min="1.0"
                                max="5.0"
                                value={overrideScore}
                                onChange={(e) => setOverrideScore(parseFloat(e.target.value) || 0)}
                                className="w-24 rounded border border-slate-200 px-2 py-1 text-xs"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-slate-550 mb-0.5">Rationale / Rationale Log</label>
                              <input
                                type="text"
                                value={overrideRationale}
                                onChange={(e) => setOverrideRationale(e.target.value)}
                                placeholder="State justification for altering the score..."
                                className="w-full rounded border border-slate-200 px-3 py-1.5 text-xs focus:outline-none"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => submitOverride(activeOverrideId)}
                              className="bg-indigo-600 text-white px-3 py-1.5 rounded font-semibold"
                            >
                              Confirm Override
                            </button>
                            <button
                              onClick={() => setActiveOverrideId(null)}
                              className="bg-slate-150 text-slate-700 px-3 py-1.5 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="overflow-x-auto rounded-lg border border-slate-150">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-650 font-semibold border-b border-slate-150">
                              <th className="px-4 py-3">Employee</th>
                              <th className="px-4 py-3 text-center">Self-Rating</th>
                              <th className="px-4 py-3 text-center">Supervisor Rating</th>
                              <th className="px-4 py-3">Rationale Log</th>
                              <th className="px-4 py-3 text-center">Audit Status</th>
                              <th className="px-4 py-3 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {ratings.map(r => (
                              <tr key={r.id} className="hover:bg-slate-55/30 transition">
                                <td className="px-4 py-3">
                                  <p className="font-bold text-slate-800">{r.name}</p>
                                  <p className="text-[10px] text-slate-500">{r.position}</p>
                                </td>
                                <td className="px-4 py-3 text-center font-bold text-slate-700">{r.selfRating.toFixed(1)}</td>
                                <td className="px-4 py-3 text-center font-bold text-indigo-700">{r.supervisorRating.toFixed(1)}</td>
                                <td className="px-4 py-3 max-w-xs text-slate-500 italic">
                                  {r.rationale || '—'}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                    r.status === 'Overridden' 
                                      ? 'bg-red-50 text-red-800' 
                                      : r.status === 'Validated'
                                      ? 'bg-emerald-50 text-emerald-800'
                                      : 'bg-amber-50 text-amber-800'
                                  }`}>
                                    {r.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => handleOpenOverride(r)}
                                    className="inline-flex items-center gap-1 rounded border border-slate-205 bg-white hover:bg-slate-50 px-2 py-1 font-semibold text-slate-700"
                                  >
                                    Override
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {ratingsSubtab === 'dpcr' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">DPCR Division Aggregator</h3>
                          <p className="text-xs text-slate-500 mt-0.5">Workspace for Supervisors to generate their division-wide DPCR sheet from verified IPCR sheets.</p>
                        </div>
                        <button
                          onClick={compileDPCR}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                          Generate DPCR Summary Sheet
                        </button>
                      </div>

                      {dpcrCompiled ? (
                        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <span className="font-bold text-xs text-slate-800">Division: HR Roster Management Division</span>
                            <span className="rounded bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">DPCR COMPILED</span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                            <div className="border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <p className="text-slate-400">Total IPCRs Aggregated</p>
                              <p className="text-xl font-bold text-slate-805">4 Records</p>
                            </div>
                            <div className="border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <p className="text-slate-400">Division Average Score</p>
                              <p className="text-xl font-bold text-indigo-700">4.55 / 5.0</p>
                            </div>
                            <div className="border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <p className="text-slate-400">Outstanding Ratings</p>
                              <p className="text-xl font-bold text-slate-805">3 Employees</p>
                            </div>
                            <div className="border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <p className="text-slate-400">Archived Version ID</p>
                              <p className="text-xl font-bold text-slate-805">#DPCR-2025-HR-1</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-500 text-xs">
                          <FileSpreadsheet className="h-10 w-10 text-slate-350 mx-auto mb-2" />
                          <p className="font-bold">No DPCR summary sheet has been generated for this cycle.</p>
                          <p className="mt-1">Click "Generate DPCR Summary Sheet" above to compile.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {ratingsSubtab === 'opcr' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">OPCR Master Generation Console</h3>
                          <p className="text-xs text-slate-500 mt-0.5">Workspace for Department Heads to condense approved DPCR sheets into the final OPCR package.</p>
                        </div>
                        <button
                          onClick={compileOPCRBundle}
                          className="bg-indigo-650 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                        >
                          <Send className="h-4 w-4" />
                          Compile & Transmit OPCR Package to PM
                        </button>
                      </div>

                      {opcrCompiled ? (
                        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <span className="font-bold text-xs text-slate-800">Office: Human Resource Management Office (HRMO)</span>
                            <span className="rounded bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">TRANSMITTED TO PM</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div className="border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <p className="text-slate-400">Total DPCRs Compiled</p>
                              <p className="text-xl font-bold text-slate-800">2 Divisions</p>
                            </div>
                            <div className="border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <p className="text-slate-400">Overall Office Score</p>
                              <p className="text-xl font-bold text-indigo-700">4.62 / 5.0</p>
                            </div>
                            <div className="border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <p className="text-slate-400">Closeout Verification ID</p>
                              <p className="text-xl font-bold text-slate-800">#OPCR-HRMO-2025-1ST</p>
                            </div>
                          </div>
                          
                          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                            Package compiled successfully: 1 Supervisor DPCR + 1 Dept. Head OPCR + All Employee IPCRs are securely bundled and uploaded to PM.
                          </div>
                        </div>
                      ) : (
                        <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-500 text-xs">
                          <Send className="h-10 w-10 text-slate-355 mx-auto mb-2" />
                          <p className="font-bold">No OPCR package has been generated or transmitted yet.</p>
                          <p className="mt-1">Click "Compile & Transmit OPCR Package to PM" to finalize this cycle.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            </div>
          </main>
        </div>
      </div>
  );
};
