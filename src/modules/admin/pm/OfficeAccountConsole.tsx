import React, { useState, useEffect } from 'react';
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
  User,
  GraduationCap,
  BookOpen,
  ChevronDown,
  Search,
  Check
} from 'lucide-react';
import { LogoutConfirmPopover } from '../../../components/LogoutConfirmPopover';
import abyanLogo from '../../../assets/abyan-logo.png';
import { supabase } from '../../../lib/supabase';
import {
  getActiveOfficeRole,
  resolveEmployeeId,
  ROLE_LABELS,
  type ActiveOfficeRole,
} from '../../../lib/api/officeRoles';
import {
  listPendingApprovals,
  approveTargets,
  returnForRevision,
  type PendingApproval,
} from '../../../lib/api/ipcrApproval';
import {
  listTrainingRequestsDetailed,
  createTrainingRequest,
  logPostTrainingProficiency,
  type TrainingRequest
} from '../../../lib/api/trainingRequests';

type Pillar = 'Cultural Transformation' | 'Employee Development' | 'Leadership' | 'Technical';

export const COMPETENCY_CATALOG: Record<Pillar, string[]> = {
  'Cultural Transformation': [
    'Ethical Conduct and Public Service Standards',
    'Transparency and Accountability Practices',
    'Change Leadership & Advocacy'
  ],
  'Employee Development': [
    'Community Engagement Skills',
    'Public Communication Skills',
    'Professional Mentorship & Coaching'
  ],
  'Leadership': [
    'Knowledge of Local Governance',
    'Public Administration Principles',
    'Strategic Project Management'
  ],
  'Technical': [
    'Fiscal Management & LGU Budgeting',
    'Disaster Risk Reduction and Management',
    'Digital Literacy for Government Services',
    'Technical Writing & Records Management'
  ]
};

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

  // Logged-in office account user info
  const [currentUserName, setCurrentUserName] = useState<string>('Office User');
  const [currentUserPosition, setCurrentUserPosition] = useState<string | null>(null);
  // The logged-in office account's employees.id — used as the approver and for
  // the self-approval block (a dual-role user must not approve their own IPCR).
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  /** Derived from office_role_assignments, never from the employee's job title. */
  const [officeRole, setOfficeRole] = useState<ActiveOfficeRole | null>(null);
  const [officeRoleLoading, setOfficeRoleLoading] = useState(true);

  // Real IPCR submissions awaiting this office's approval.
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [approvalNotice, setApprovalNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [returnDraftId, setReturnDraftId] = useState<string | null>(null);
  const [returnComment, setReturnComment] = useState('');

  const refreshPendingApprovals = async () => {
    setApprovalsLoading(true);
    const res = await listPendingApprovals();
    setApprovalsLoading(false);
    if (res.ok === false) { setApprovalNotice({ tone: 'err', text: res.error }); return; }
    setPendingApprovals(res.data);
  };

  const handleApprove = async (p: PendingApproval) => {
    setApprovalBusyId(p.targetSettingId);
    setApprovalNotice(null);
    const res = await approveTargets({
      targetSettingId: p.targetSettingId,
      approverEmployeeId: currentEmployeeId,
      submitterEmployeeId: p.employeeId,
    });
    setApprovalBusyId(null);
    if (res.ok === false) { setApprovalNotice({ tone: 'err', text: res.error }); return; }
    setApprovalNotice({ tone: 'ok', text: `Approved and frozen: ${p.employeeName}'s targets.` });
    void refreshPendingApprovals();
  };

  const handleReturn = async (p: PendingApproval) => {
    setApprovalBusyId(p.targetSettingId);
    setApprovalNotice(null);
    const res = await returnForRevision({
      targetSettingId: p.targetSettingId,
      approverEmployeeId: currentEmployeeId,
      submitterEmployeeId: p.employeeId,
      comment: returnComment,
    });
    setApprovalBusyId(null);
    if (res.ok === false) { setApprovalNotice({ tone: 'err', text: res.error }); return; }
    setApprovalNotice({ tone: 'ok', text: `Returned to ${p.employeeName} for revision.` });
    setReturnDraftId(null);
    setReturnComment('');
    void refreshPendingApprovals();
  };
  const switchEnabled = officeRole !== null;
  // Navigation tabs: 'targets' | 'ratings' | 'training-requests'
  const [activeTab, setActiveTab] = useState<'targets' | 'ratings' | 'training-requests'>('targets');

  // Subtabs
  const [targetsSubtab, setTargetsSubtab] = useState<'verify' | 'transmittal'>('verify');
  const [ratingsSubtab, setRatingsSubtab] = useState<'review' | 'dpcr' | 'opcr'>('review');

  // State arrays
  const [targets, setTargets] = useState<EmployeeTarget[]>(INITIAL_TARGETS);
  const [ratings, setRatings] = useState<EmployeeRating[]>(INITIAL_RATINGS);
  const [transmittals, setTransmittals] = useState<TransmittalRecord[]>(INITIAL_TRANSMITTALS);

  // New Training Requests States
  const [employees, setEmployees] = useState<any[]>([]);
  const [randomEmployees, setRandomEmployees] = useState<any[]>([]);
  const [detailedRequests, setDetailedRequests] = useState<TrainingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Form States
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [selectedPillar, setSelectedPillar] = useState<Pillar | ''>('');
  const [selectedCompetency, setSelectedCompetency] = useState<string>('');
  const [selectedRationales, setSelectedRationales] = useState<string[]>([]);
  const [currentProficiency, setCurrentProficiency] = useState<number>(3);
  const [desiredProficiency, setDesiredProficiency] = useState<number>(4);
  const [afterTrainingMetric, setAfterTrainingMetric] = useState<string>('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Evaluation States
  const [loggingRequestId, setLoggingRequestId] = useState<string | null>(null);
  const [postTrainingScore, setPostTrainingScore] = useState<number>(4);
  const [isSubmittingEvaluation, setIsSubmittingEvaluation] = useState(false);

  // Load current office account user info and resolve their office role.
  //
  // Eligibility comes from office_role_assignments, which is a revocable,
  // audited, office-scoped grant. It is deliberately NOT derived from
  // current_position: a job title carries no office (so it cannot answer "Dept
  // Head of *which* department?"), cannot be revoked without editing HR
  // records, and was previously matched by substring — one rename away from
  // silently granting or removing portal access.
  useEffect(() => {
    async function loadUserSession() {
      try {
        const raw = localStorage.getItem('cictrix_employee_session');
        if (!raw) return;
        const session = JSON.parse(raw) as { employeeId?: string; fullName?: string; supabaseId?: string; loginUsername?: string };
        if (session.fullName) setCurrentUserName(session.fullName);

        const sessionId = session.supabaseId ?? session.employeeId;
        if (!sessionId) return;

        const employeeId = await resolveEmployeeId(sessionId);
        if (!employeeId) return;
        setCurrentEmployeeId(employeeId);

        // Job title is display-only here.
        const { data } = await (supabase as any)
          .from('employees_with_department')
          .select('current_position')
          .eq('id', employeeId)
          .maybeSingle();
        setCurrentUserPosition(data?.current_position ?? null);

        // The one thing that grants access. `switchEnabled` is derived from this,
        // never stored, and never inferred from the employee's job title.
        const role = await getActiveOfficeRole(employeeId);
        setOfficeRole(role);
        if (role) void refreshPendingApprovals();
      } catch {
        // session missing or malformed — keep defaults (no office role)
      } finally {
        setOfficeRoleLoading(false);
      }
    }
    void loadUserSession();
  }, []);

  // Load active employees and training requests
  useEffect(() => {
    async function loadData() {
      // 1. Fetch employees directly from table per [[feedback_prefer_employees_base_table]]
      const { data: empData, error: empError } = await (supabase as any)
        .from('employees')
        .select('id, first_name, last_name, position, status')
        .eq('status', 'Active')
        .order('last_name');

      if (empError) {
        console.error('Error fetching employees:', empError);
      } else {
        setEmployees(empData ?? []);
        // Select 10 random employees for the initial display when the search bar is empty
        const shuffled = [...(empData ?? [])].sort(() => 0.5 - Math.random());
        setRandomEmployees(shuffled.slice(0, 10));
      }

      // 2. Fetch detailed training requests
      setLoadingRequests(true);
      const reqs = await listTrainingRequestsDetailed();
      setDetailedRequests(reqs);
      setLoadingRequests(false);
    }
    
    void loadData();
  }, []);

  const refreshRequests = async () => {
    setLoadingRequests(true);
    const reqs = await listTrainingRequestsDetailed();
    setDetailedRequests(reqs);
    setLoadingRequests(false);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      alert('Please select an employee.');
      return;
    }
    if (!selectedPillar) {
      alert('Please select a training category (pillar).');
      return;
    }
    if (!selectedCompetency) {
      alert('Please select a competency.');
      return;
    }
    if (selectedRationales.length === 0) {
      alert('Please select at least one rationale tag.');
      return;
    }
    if (currentProficiency < 1 || currentProficiency > 5 || desiredProficiency < 1 || desiredProficiency > 5) {
      alert('Proficiency ratings must be between 1 and 5.');
      return;
    }
    if (!afterTrainingMetric.trim()) {
      alert('Please specify the after-training success evaluation metric.');
      return;
    }

    const employeeObj = employees.find(e => e.id === selectedEmployeeId);
    const employeeName = employeeObj ? `${employeeObj.first_name} ${employeeObj.last_name}` : 'Employee';
    const titleText = `${selectedPillar} · ${selectedCompetency}`;

    setIsSubmittingRequest(true);
    const result = await createTrainingRequest({
      employee_id: selectedEmployeeId,
      title: titleText,
      category: selectedPillar,
      competency: selectedCompetency,
      rationales: selectedRationales,
      current_proficiency: currentProficiency,
      desired_proficiency: desiredProficiency,
      after_training_metric: afterTrainingMetric
    });
    setIsSubmittingRequest(false);

    if (result.ok) {
      setConsoleMessage(`Successfully submitted training request for ${employeeName}.`);
      setTimeout(() => setConsoleMessage(null), 4000);
      
      // Reset form
      setSelectedEmployeeId('');
      setSelectedPillar('');
      setSelectedCompetency('');
      setSelectedRationales([]);
      setCurrentProficiency(3);
      setDesiredProficiency(4);
      setAfterTrainingMetric('');
      
      // Re-fetch
      await refreshRequests();
    } else {
      alert(`Error submitting training request: ${result.error}`);
    }
  };

  const handleLogEvaluation = async (id: string) => {
    if (postTrainingScore < 1 || postTrainingScore > 5) {
      alert('Post-training score must be between 1 and 5.');
      return;
    }
    setIsSubmittingEvaluation(true);
    const result = await logPostTrainingProficiency(id, postTrainingScore);
    setIsSubmittingEvaluation(false);
    
    if (result.ok) {
      setConsoleMessage('Post-training evaluation logged successfully.');
      setTimeout(() => setConsoleMessage(null), 4000);
      setLoggingRequestId(null);
      await refreshRequests();
    } else {
      alert(`Error logging evaluation: ${result.error}`);
    }
  };

  const calculateWSM = (req: TrainingRequest) => {
    if (!req.current_proficiency || !req.desired_proficiency || !req.rationales) return 0;
    
    const gap = req.desired_proficiency - req.current_proficiency;
    const gapScore = gap * 1.5;
    
    let rationaleScore = 0;
    req.rationales.forEach(tag => {
      if (tag === 'Performance Improvement') rationaleScore += 2.0;
      else if (tag === 'Skill Gap / Refresher') rationaleScore += 1.5;
      else if (tag === 'Preparation for Promotion') rationaleScore += 1.0;
      else if (tag === 'New Technology / System Rollout') rationaleScore += 1.0;
    });
    
    return gapScore + rationaleScore;
  };

  const sortedRequests = [...detailedRequests]
    .filter(r => r.category && r.competency && r.current_proficiency !== undefined && r.desired_proficiency !== undefined)
    .sort((a, b) => {
      const scoreA = calculateWSM(a);
      const scoreB = calculateWSM(b);
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      // Tie-breaker: requested_at ascending (older requests first)
      return new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime();
    });

  const filteredEmployees = employeeSearchQuery.trim() === ''
    ? randomEmployees
    : employees.filter((emp) => {
        const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
        const position = (emp.position ?? '').toLowerCase();
        const query = employeeSearchQuery.toLowerCase();
        return fullName.includes(query) || position.includes(query);
      });

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

  // Route guard. /office/dashboard was previously reachable by anyone who knew
  // the URL. Access is now an Active office_role_assignments grant, nothing else.
  if (officeRoleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Checking office access…</p>
      </div>
    );
  }

  if (!officeRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">No Office Account access</h1>
          <p className="mt-2 text-sm text-slate-600">
            The Office Account Console is available to employees holding an active Supervisor or
            Department Head assignment. Your account has none.
          </p>
          <p className="mt-3 text-xs text-slate-400">
            Access is granted in Access &amp; Role Management, not by job title. Ask a system
            administrator to assign you an office role.
          </p>
          <button
            type="button"
            onClick={() => navigate('/employee/dashboard')}
            className="mt-6 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-900"
          >
            Back to Employee Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">

      {/* ── Top Header ── */}
      <header style={{ background: 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)', boxShadow: '0 2px 16px rgba(54,62,232,0.18)' }} className="sticky top-0 z-40 print:hidden">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <img
              src={abyanLogo}
              alt="Abyan HRIS"
              style={{ height: 40, width: 'auto', objectFit: 'contain', mixBlendMode: 'screen' }}
            />
            <div>
              <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>Office Performance Console</h1>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#C8D1FF' }}>Human Resources Information System</p>
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
                {switchEnabled && (
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
                )}
                <div className="leading-tight text-left">
                  <p className="text-sm font-semibold text-slate-800">{currentUserName}</p>
                  <p className="text-xs text-slate-500">{currentUserPosition ?? 'Office Account Console'}</p>
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
            <span className="text-[10px] uppercase font-semibold text-black tracking-wider">Office Console</span>
          </div>
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('targets')}
              className={`w-full rounded-lg px-3 py-2.5 text-left transition flex items-center gap-3 ${
                activeTab === 'targets' ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-600 hover:text-white' : 'text-black hover:bg-slate-200'
              }`}
            >
              <FileText className={`h-5 w-5 ${activeTab === 'targets' ? 'text-white' : 'text-black'}`} />
              <div>
                <p className={`text-sm font-semibold leading-tight ${activeTab === 'targets' ? 'text-white' : 'text-black'}`}>
                  Targets
                </p>
                <p className={`text-[11px] mt-0.5 ${activeTab === 'targets' ? 'text-indigo-200' : 'text-slate-800 font-normal'}`}>
                  Adjust employee targets
                </p>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('ratings')}
              className={`w-full rounded-lg px-3 py-2.5 text-left transition flex items-center gap-3 ${
                activeTab === 'ratings' ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-600 hover:text-white' : 'text-black hover:bg-slate-200'
              }`}
            >
              <Sliders className={`h-5 w-5 ${activeTab === 'ratings' ? 'text-white' : 'text-black'}`} />
              <div>
                <p className={`text-sm font-semibold leading-tight ${activeTab === 'ratings' ? 'text-white' : 'text-black'}`}>
                  Ratings
                </p>
                <p className={`text-[11px] mt-0.5 ${activeTab === 'ratings' ? 'text-indigo-200' : 'text-slate-800 font-normal'}`}>
                  Validate self-ratings
                </p>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('training-requests')}
              className={`w-full rounded-lg px-3 py-2.5 text-left transition flex items-center gap-3 ${
                activeTab === 'training-requests' ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-600 hover:text-white' : 'text-black hover:bg-slate-200'
              }`}
            >
              <GraduationCap className={`h-5 w-5 ${activeTab === 'training-requests' ? 'text-white' : 'text-black'}`} />
              <div>
                <p className={`text-sm font-semibold leading-tight ${activeTab === 'training-requests' ? 'text-white' : 'text-black'}`}>
                  Training Request
                </p>
                <p className={`text-[11px] mt-0.5 ${activeTab === 'training-requests' ? 'text-indigo-200' : 'text-slate-800 font-normal'}`}>
                  Guidance & WSM Prioritization
                </p>
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
                ) : activeTab === 'ratings' ? (
                  <>
                    <Sliders className="h-7 w-7 text-indigo-600" />
                    Phase 2: Ratings Validation & Cascading Summaries
                  </>
                ) : (
                  <>
                    <GraduationCap className="h-7 w-7 text-indigo-600" />
                    Training Request Guidance Desk
                  </>
                )}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {activeTab === 'targets'
                  ? 'Audit and direct-edit employee target submissions before transmitting them to the central PM registrar.'
                  : activeTab === 'ratings'
                  ? 'Verify accomplishments at the 6-month mark, apply rating overrides, and generate automated DPCR/OPCR summaries.'
                  : 'Submit structured training requests for employees, evaluated using a Weighted Sum Model (WSM) for prioritization.'}
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
                          <h3 className="text-sm font-bold text-slate-800">IPCR Targets Awaiting Approval</h3>
                          <p className="text-xs text-slate-500 mt-0.5">Review an employee’s submitted targets, then approve (freeze) or return for revision.</p>
                        </div>
                        <button
                          onClick={() => void refreshPendingApprovals()}
                          className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                        >
                          Refresh
                        </button>
                      </div>

                      {approvalNotice && (
                        <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${approvalNotice.tone === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                          {approvalNotice.text}
                        </div>
                      )}

                      {approvalsLoading ? (
                        <p className="text-xs text-slate-500">Loading submissions…</p>
                      ) : pendingApprovals.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
                          <p className="text-sm font-semibold text-slate-600">No IPCRs are awaiting approval.</p>
                          <p className="text-xs text-slate-400 mt-1">Submissions appear here once an employee clicks “Submit Targets for Approval”.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {pendingApprovals.map((p) => {
                            const isOwn = !!currentEmployeeId && currentEmployeeId === p.employeeId;
                            const busy = approvalBusyId === p.targetSettingId;
                            return (
                              <div key={p.targetSettingId} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                                  <div>
                                    <p className="text-sm font-bold text-slate-800">{p.employeeName}</p>
                                    <p className="text-[11px] text-slate-500">{[p.position, p.department].filter(Boolean).join(' · ') || '—'}</p>
                                  </div>
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">Submitted for approval</span>
                                </div>

                                <div className="px-4 py-3 space-y-3">
                                  {(['core', 'strategic', 'support'] as const).map((ft) => {
                                    const group = p.mfos.filter((m) => m.functionType === ft);
                                    if (group.length === 0) return null;
                                    const label = ft === 'core' ? 'Core Functions' : ft === 'strategic' ? 'Strategic Functions' : 'Support Functions';
                                    return (
                                      <div key={ft}>
                                        <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">{label}</p>
                                        <ul className="mt-1 space-y-1.5">
                                          {group.map((m) => (
                                            <li key={m.id} className="rounded-lg bg-slate-50 px-3 py-2">
                                              <p className="text-xs font-semibold text-slate-800">{m.title || '(untitled MFO)'}</p>
                                              {m.indicators.length > 0 && (
                                                <ul className="mt-1 list-disc pl-5 text-[11px] text-slate-600">
                                                  {m.indicators.map((si) => (<li key={si.id}>{si.description}</li>))}
                                                </ul>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
                                  {isOwn ? (
                                    <p className="text-[11px] font-semibold text-slate-500">This is your own IPCR — it must be approved by another office account.</p>
                                  ) : returnDraftId === p.targetSettingId ? (
                                    <div className="flex flex-1 flex-wrap items-center gap-2">
                                      <input
                                        type="text"
                                        value={returnComment}
                                        onChange={(e) => setReturnComment(e.target.value)}
                                        placeholder="Reason for returning (optional)"
                                        className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      />
                                      <button onClick={() => void handleReturn(p)} disabled={busy} className="rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Confirm Return</button>
                                      <button onClick={() => { setReturnDraftId(null); setReturnComment(''); }} disabled={busy} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Cancel</button>
                                    </div>
                                  ) : (
                                    <>
                                      <button onClick={() => void handleApprove(p)} disabled={busy} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Working…' : 'Approve & Freeze'}</button>
                                      <button onClick={() => { setReturnDraftId(p.targetSettingId); setReturnComment(''); }} disabled={busy} className="rounded-lg border border-amber-300 bg-white hover:bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50">Return for Revision</button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
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

            {/* 🎓 TAB 2.3: TRAINING REQUESTS */}
            {activeTab === 'training-requests' && (
              <div className="p-6 space-y-8">
                {/* Section Title */}
                <div>
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-indigo-600" />
                    New Training Request
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Structure and request target training programs based on core competencies and proficiency gaps.
                  </p>
                </div>

                <form onSubmit={handleSubmitRequest} className="space-y-6 max-w-4xl bg-slate-50/50 p-6 rounded-xl border border-slate-200">
                  {/* Step 0: Select Employee */}
                  <div className="space-y-2 relative">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Step 1: Select Employee
                    </label>
                    
                    {/* Click-away overlay */}
                    {employeeDropdownOpen && (
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => {
                          setEmployeeDropdownOpen(false);
                          setEmployeeSearchQuery('');
                        }}
                      />
                    )}

                    {/* Trigger Button */}
                    <button
                      type="button"
                      onClick={() => setEmployeeDropdownOpen(!employeeDropdownOpen)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 flex justify-between items-center cursor-pointer relative z-10"
                    >
                      <span className="text-slate-800">
                        {selectedEmployeeId
                          ? (() => {
                              const emp = employees.find(e => e.id === selectedEmployeeId);
                              return emp ? `${emp.last_name}, ${emp.first_name} — ${emp.position}` : '-- Choose an Employee --';
                            })()
                          : '-- Choose an Employee --'}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    </button>

                    {/* Dropdown Menu Card */}
                    {employeeDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-white rounded-lg border border-slate-200 shadow-lg p-2 space-y-2">
                        {/* Search Bar at the top of the selection box */}
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                          <input
                            type="text"
                            value={employeeSearchQuery}
                            onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                            placeholder="Search by name or position..."
                            className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            autoFocus
                          />
                        </div>
                        
                        {/* List of employees */}
                        <div className="max-h-48 overflow-y-auto space-y-0.5">
                          {filteredEmployees.length === 0 ? (
                            <div className="text-center text-xs text-slate-500 py-3">No matching employees found</div>
                          ) : (
                            filteredEmployees.map((emp) => {
                              const isSelected = selectedEmployeeId === emp.id;
                              return (
                                <button
                                  key={emp.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedEmployeeId(emp.id);
                                    setEmployeeDropdownOpen(false);
                                    setEmployeeSearchQuery('');
                                  }}
                                  className={`w-full text-left px-2.5 py-2 rounded text-xs transition flex justify-between items-center cursor-pointer ${
                                    isSelected
                                      ? 'bg-indigo-50 text-indigo-900 font-semibold'
                                      : 'hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <div>
                                    <p className="font-semibold text-slate-800">{emp.last_name}, {emp.first_name}</p>
                                    <p className="text-[10px] text-slate-500">{emp.position}</p>
                                  </div>
                                  {isSelected && <Check className="h-4 w-4 text-indigo-650" />}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 1: Category Selection (Pillars) */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Step 2: Category Selection (Broad Pillar Filter)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      {(['Cultural Transformation', 'Employee Development', 'Leadership', 'Technical'] as Pillar[]).map((pillar) => {
                        const isSelected = selectedPillar === pillar;
                        // Colors and themes for each pillar
                        const themes = {
                          'Cultural Transformation': 'border-purple-200 hover:border-purple-400 bg-purple-50/20 text-purple-900',
                          'Employee Development': 'border-blue-200 hover:border-blue-400 bg-blue-50/20 text-blue-900',
                          'Leadership': 'border-indigo-200 hover:border-indigo-400 bg-indigo-50/20 text-indigo-900',
                          'Technical': 'border-emerald-200 hover:border-emerald-400 bg-emerald-50/20 text-emerald-900'
                        };
                        const selectedBorder = {
                          'Cultural Transformation': 'border-purple-600 ring-2 ring-purple-600 bg-purple-50/50',
                          'Employee Development': 'border-blue-600 ring-2 ring-blue-600 bg-blue-50/50',
                          'Leadership': 'border-indigo-600 ring-2 ring-indigo-600 bg-indigo-50/50',
                          'Technical': 'border-emerald-600 ring-2 ring-emerald-600 bg-emerald-50/50'
                        };
                        return (
                          <button
                            key={pillar}
                            type="button"
                            onClick={() => {
                              setSelectedPillar(pillar);
                              setSelectedCompetency('');
                            }}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition cursor-pointer ${
                              isSelected ? selectedBorder[pillar] : themes[pillar]
                            } h-28 bg-white`}
                          >
                            <span className="text-xs font-bold leading-tight">{pillar}</span>
                            <span className="text-[10px] text-slate-400 mt-2">
                              {pillar === 'Cultural Transformation' && 'Ethics & Advocacy'}
                              {pillar === 'Employee Development' && 'Mentorship & Comms'}
                              {pillar === 'Leadership' && 'Governance & Strategy'}
                              {pillar === 'Technical' && 'LGU Systems & Tech'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: Competency Selection */}
                  {selectedPillar && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                        Step 3: Select Competency ({selectedPillar})
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {COMPETENCY_CATALOG[selectedPillar].map((comp) => {
                          const isCompSelected = selectedCompetency === comp;
                          return (
                            <button
                              key={comp}
                              type="button"
                              onClick={() => setSelectedCompetency(comp)}
                              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                isCompSelected
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {comp}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Step 3: Standardized Rationale */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Step 4: Standardized Rationale (Select all that apply)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        'Skill Gap / Refresher',
                        'Preparation for Promotion',
                        'New Technology / System Rollout',
                        'Performance Improvement'
                      ].map((tag) => {
                        const isTagSelected = selectedRationales.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setSelectedRationales(prev =>
                                isTagSelected ? prev.filter(t => t !== tag) : [...prev, tag]
                              );
                            }}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                              isTagSelected
                                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 4: Before & After Seminar Proficiency (1-5) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 flex justify-between">
                        <span>Step 5: Current Proficiency Level</span>
                        <span className="text-indigo-600 font-bold">{currentProficiency} / 5</span>
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={currentProficiency}
                        onChange={(e) => setCurrentProficiency(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 px-1">
                        <span>1 = Basic</span>
                        <span>3 = Competent</span>
                        <span>5 = Expert</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 flex justify-between">
                        <span>Desired Target Proficiency Level</span>
                        <span className="text-indigo-600 font-bold">{desiredProficiency} / 5</span>
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={desiredProficiency}
                        onChange={(e) => setDesiredProficiency(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 px-1">
                        <span>1 = Basic</span>
                        <span>3 = Competent</span>
                        <span>5 = Expert</span>
                      </div>
                    </div>
                  </div>

                  {/* Step 5: After-Training Success Evaluation Metric */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Step 6: Expected After-Training Success Metric
                    </label>
                    <textarea
                      rows={2}
                      value={afterTrainingMetric}
                      onChange={(e) => setAfterTrainingMetric(e.target.value)}
                      placeholder="e.g., Increase department report turnaround time by 15%, or demonstrate autonomous project planning."
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isSubmittingRequest}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-6 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="h-4 w-4" />
                      {isSubmittingRequest ? 'Submitting...' : 'Submit Training Request'}
                    </button>
                  </div>
                </form>

                {/* Prioritized Requests Table */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-indigo-650" />
                      Prioritized Training Needs (WSM Rankings)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Evaluated and sorted desc by WSM Priority Score: <code className="font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded text-indigo-800">Gap × 1.5 + Rationale Weights</code>.
                    </p>
                  </div>

                  {loadingRequests ? (
                    <div className="border border-slate-150 rounded-xl p-12 text-center text-slate-500 text-xs">
                      Loading prioritized training requests...
                    </div>
                  ) : sortedRequests.length === 0 ? (
                    <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-500 text-xs">
                      <ClipboardCheck className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                      <p className="font-bold">No structured training requests found.</p>
                      <p className="mt-1">Fill out and submit the form above to generate records.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-150">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-650 font-semibold border-b border-slate-150">
                            <th className="px-4 py-3">Employee Details</th>
                            <th className="px-4 py-3">Training Competency</th>
                            <th className="px-4 py-3 text-center">Pillar</th>
                            <th className="px-4 py-3 text-center">Proficiency Gap</th>
                            <th className="px-4 py-3 text-center">WSM Priority</th>
                            <th className="px-4 py-3">Rationale & Metrics</th>
                            <th className="px-4 py-3 text-center">Post-Evaluation</th>
                            <th className="px-4 py-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedRequests.map((req) => {
                            const wsmScore = calculateWSM(req);
                            const hasEvaluation = req.post_training_proficiency !== undefined && req.post_training_proficiency !== null;
                            const empName = req.employees ? `${req.employees.last_name}, ${req.employees.first_name}` : 'Unknown';
                            const empDept = req.employees?.department ?? '—';
                            const empPos = req.employees?.position ?? '—';
                            
                            // Calculate improvement only if logged
                            const current = req.current_proficiency ?? 0;
                            const target = req.desired_proficiency ?? 0;
                            const postScore = req.post_training_proficiency ?? 0;
                            const improvement = postScore - current;

                            return (
                              <tr key={req.id} className="hover:bg-slate-50/30 transition">
                                <td className="px-4 py-3">
                                  <p className="font-bold text-slate-800">{empName}</p>
                                  <p className="text-[10px] text-slate-550">{empPos}</p>
                                  <p className="text-[10px] text-slate-400 font-semibold">{empDept}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="font-bold text-indigo-900">{req.competency}</p>
                                  <p className="text-[9px] text-slate-400 uppercase font-mono mt-0.5">Status: {req.status}</p>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    req.category === 'Cultural Transformation' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                                    req.category === 'Employee Development' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                    req.category === 'Leadership' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                                    'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                  }`}>
                                    {req.category}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="font-semibold text-slate-700">
                                    {current} &rarr; {target}
                                  </div>
                                  <span className="text-[9px] text-slate-400 font-mono">Gap: +{target - current}</span>
                                </td>
                                <td className="px-4 py-3 text-center font-bold text-lg text-indigo-750 bg-indigo-50/20">
                                  {wsmScore.toFixed(1)}
                                </td>
                                <td className="px-4 py-3 max-w-xs space-y-1">
                                  <div className="flex flex-wrap gap-1">
                                    {(req.rationales ?? []).map((tag, i) => (
                                      <span key={i} className="bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 text-[9px] font-medium border border-slate-150">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-[10px] text-slate-550 italic leading-tight">
                                    <strong className="text-slate-650 not-italic">Metric:</strong> {req.after_training_metric ?? '—'}
                                  </p>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {hasEvaluation ? (
                                    <div className="space-y-1">
                                      <p className="font-bold text-slate-700 text-xs">Score: {postScore}/5</p>
                                      {improvement > 0 ? (
                                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                                          +{improvement.toFixed(1)} Improved
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-500">
                                          {improvement.toFixed(1)} No Change
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 italic">Not evaluated</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {loggingRequestId === req.id ? (
                                    <div className="flex flex-col gap-1.5 p-2 bg-slate-55 rounded border border-slate-200 min-w-[120px]">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase">Post score</label>
                                      <select
                                        value={postTrainingScore}
                                        onChange={(e) => setPostTrainingScore(parseInt(e.target.value))}
                                        className="rounded border border-slate-200 px-1 py-0.5 text-[11px] focus:outline-none bg-white"
                                      >
                                        <option value="1">1 (Basic)</option>
                                        <option value="2">2</option>
                                        <option value="3">3</option>
                                        <option value="4">4</option>
                                        <option value="5">5 (Expert)</option>
                                      </select>
                                      <div className="flex gap-1 justify-end">
                                        <button
                                          onClick={() => handleLogEvaluation(req.id)}
                                          disabled={isSubmittingEvaluation}
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-2 py-0.5 text-[10px] font-bold cursor-pointer"
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={() => setLoggingRequestId(null)}
                                          className="bg-slate-200 text-slate-700 rounded px-2 py-0.5 text-[10px] cursor-pointer"
                                        >
                                          Exit
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setLoggingRequestId(req.id);
                                        setPostTrainingScore(req.post_training_proficiency ?? (req.desired_proficiency ?? 4));
                                      }}
                                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white hover:bg-slate-50 px-2 py-1 font-semibold text-slate-700 cursor-pointer"
                                    >
                                      <TrendingUp className="h-3 w-3" /> Log Evaluation
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
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
