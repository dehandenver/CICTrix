import { useBackClosesView } from '../../../hooks/useHistoryBack';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Sliders,
  ClipboardCheck,
  TrendingUp,
  UserCheck,
  CheckCircle,
  Clock,
  ArrowRight,
  Database,
  Shield,
  Lock,
  FileSpreadsheet,
  Send,
  AlertTriangle,
  GraduationCap,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Target,
  GitCompare
} from 'lucide-react';
import { PortalHeader } from '../../../components/portal-header';
import { RailNav, type RailNavItem } from '../../../components/RailNav';
import { readEmployeeSession } from '../../../lib/employeeSession';
import { supabase } from '../../../lib/supabase';
import {
  getActiveOfficeRole,
  resolveEmployeeId,
  type ActiveOfficeRole,
} from '../../../lib/api/officeRoles';
import {
  listPendingApprovals,
  approveTargets,
  returnForRevision,
  adminEditTargets,
  type PendingApproval,
} from '../../../lib/api/ipcrApproval';
import { listNotifications, type IpcrNotification } from '../../../lib/api/ipcrSubmissions';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh';
import {
  listOfficeTrainingRequests,
  createTrainingRequest,
  type OfficeTrainingRequest,
  type RequestOutcome
} from '../../../lib/api/trainingRequests';
import { listPipeline, type PipelineRec } from '../../../lib/api/trainingRecommendations';
import { Phase2RatingPanel } from './Phase2RatingPanel';
import { OfficeTrainingCourses } from './OfficeTrainingCourses';
import { CriticalPositionPage } from '../../../components/CriticalPositionPage';
import { CriticalPositionGapAnalysisPage } from '../../../components/CriticalPositionGapAnalysisPage';
import { SkeletonList, useDelayedLoading, useTableLoading } from '../../../components/table-loading';
import { CharacterCount } from '../../../components/CharacterCount';
import { IPCR_LIMITS } from '../../../lib/ipcrLimits';

type Pillar = 'Cultural Transformation' | 'Employee Development' | 'Leadership' | 'Technical';

/**
 * The 12 competency standards, grouped by their training stream.
 *
 * These names are the framework's, verbatim — `competency_standards` (backend
 * migration 024) and its frontend mirror `COMPETENCIES` in constants/positions.
 * An earlier hand-written catalog here had drifted to 13: it renamed two
 * standards, merged "Technical Writing" and "Records Management" into one, and
 * added two competencies the framework has no rows for. Requests written against
 * those names could never match a competency_standards row, so they dropped out
 * of the needs assessment and the IPCR recommendation matcher.
 */
export const COMPETENCY_CATALOG: Record<Pillar, string[]> = {
  'Cultural Transformation': [
    'Transparency and Accountability Practices',
    'Ethical Conduct and Public Service Standards'
  ],
  'Employee Development': [
    'Community Engagement Skills',
    'Public Communication Skills'
  ],
  'Leadership': [
    'Knowledge of Local Governance',
    'Public Administration Principles',
    'Project Management in a Public Setting'
  ],
  'Technical': [
    'Fiscal Management / Budgeting for LGU',
    'Disaster Risk Reduction and Management',
    'Digital Literacy for Government Services',
    'Technical Writing for Government Documents',
    'Data and Records Management and Organization'
  ]
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

/**
 * What L&D did with a recommendation, from the office's point of view. The DB
 * only stores {pending, approved, rejected}; "planned" and "scheduled" are the
 * downstream states the office actually wants to see, resolved in the API layer.
 */
const OutcomeBadge = ({ outcome }: { outcome: RequestOutcome }) => {
  const styles: Record<RequestOutcome['kind'], string> = {
    under_review: 'bg-amber-50 text-amber-700 border-amber-200',
    declined: 'bg-rose-50 text-rose-700 border-rose-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    planned: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    scheduled: 'bg-sky-50 text-sky-700 border-sky-200',
  };
  const labels: Record<RequestOutcome['kind'], string> = {
    under_review: 'Under review by L&D',
    declined: 'Declined',
    approved: 'Approved',
    planned: 'In training plan',
    scheduled: 'Scheduled',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${styles[outcome.kind]}`}>
      {labels[outcome.kind]}
    </span>
  );
};

/** The line under the badge — the detail that makes the status actionable. */
const outcomeDetail = (outcome: RequestOutcome): string => {
  switch (outcome.kind) {
    case 'under_review':
      return 'Awaiting L&D decision';
    case 'declined':
      return `Declined ${fmtDate(outcome.decidedAt)}`;
    case 'approved':
      return `Approved ${fmtDate(outcome.decidedAt)} · not yet planned`;
    case 'planned':
      return `FY ${outcome.planYear} plan · ${outcome.planStatus}`;
    case 'scheduled':
      return `${outcome.sessionTitle} · ${fmtDate(outcome.scheduledDate)}`;
  }
};


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

type OfficeTabId = 'ipcr' | 'training-requests' | 'training-attendees' | 'critical-positions' | 'gap-analysis';

/** Console sections, in rail order. The sublabel is the item's tooltip, as in L&D and PM. */
const OFFICE_TABS: { id: OfficeTabId; label: string; sublabel: string; icon: RailNavItem['icon'] }[] = [
  { id: 'ipcr', label: 'IPCR', sublabel: 'Targets & ratings validation', icon: ClipboardCheck },
  { id: 'training-requests', label: 'Training Request', sublabel: 'Guidance & WSM Prioritization', icon: GraduationCap },
  { id: 'training-attendees', label: 'Training Courses', sublabel: "Review L&D's list, add, send back", icon: UserCheck },
  { id: 'critical-positions', label: 'Critical Positions', sublabel: 'Manage & configure requirements', icon: Target },
  { id: 'gap-analysis', label: 'Gap Analysis', sublabel: 'Compare employees vs. requirements', icon: GitCompare },
];

export const OfficeAccountConsole: React.FC = () => {
  const navigate = useNavigate();

  // Logged-in office account user info
  const [currentUserName, setCurrentUserName] = useState<string>('Office User');
  const [currentUserPosition, setCurrentUserPosition] = useState<string | null>(null);
  // The logged-in office account's employees.id — used as the approver and for
  // the self-approval block (a dual-role user must not approve their own IPCR).
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  /** Derived from office_role_assignments, never from the employee's job title. */
  const [officeRole, setOfficeRole] = useState<ActiveOfficeRole | null>(null);
  const [officeRoleLoading, setOfficeRoleLoading] = useState(true);

  const [bellNotifications, setBellNotifications] = useState<IpcrNotification[]>([]);
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const [bellSeenAt, setBellSeenAt] = useState<string>('');

  const loadBellNotifications = useCallback(async () => {
    try {
      const [tNotifs, rNotifs] = await Promise.all([
        listNotifications('target'),
        listNotifications('rating'),
      ]);
      const combined = [...tNotifs, ...rNotifs];
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const officeId = officeRole?.officeId;
      const filtered = combined.filter(n => n.office_id === null || (officeId && n.office_id === officeId));
      setBellNotifications(filtered);
    } catch (err) {
      console.warn('Failed to load bell notifications:', err);
    }
  }, [officeRole]);

  useEffect(() => {
    if (officeRole?.officeId) {
      const seen = localStorage.getItem(`office_bell_seen_at:${officeRole.officeId}`) || '';
      setBellSeenAt(seen);
      void loadBellNotifications();
    }
  }, [officeRole, loadBellNotifications]);

  const unreadCount = useMemo(() => {
    if (!bellSeenAt) return bellNotifications.length;
    return bellNotifications.filter(n => n.created_at > bellSeenAt).length;
  }, [bellNotifications, bellSeenAt]);

  const handleToggleBell = () => {
    const next = !showBellDropdown;
    setShowBellDropdown(next);
    if (next && officeRole?.officeId) {
      const nowStr = new Date().toISOString();
      localStorage.setItem(`office_bell_seen_at:${officeRole.officeId}`, nowStr);
      setBellSeenAt(nowStr);
    }
  };
  const closeBell = useCallback(() => setShowBellDropdown(false), []);

  useRealtimeRefresh({
    channel: 'office-console-ipcr',
    tables: ['ipcr_notifications', 'target_settings'],
    onChange: useCallback(() => {
      void loadBellNotifications();
      void refreshPendingApprovals();
      // refreshPendingApprovals is declared below with its own state; the realtime
      // hook keeps the latest callback in a ref, so identity does not matter here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadBellNotifications]),
    enabled: !!officeRole,
  });

  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [collapsedPositions, setCollapsedPositions] = useState<Set<string>>(new Set());

  const togglePositionCollapse = (pos: string) => {
    setCollapsedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) {
        next.delete(pos);
      } else {
        next.add(pos);
      }
      return next;
    });
  };

  const groupedApprovals = useMemo(() => {
    const groups: Record<string, PendingApproval[]> = {};
    for (const p of pendingApprovals) {
      const pos = p.position || 'Other Positions';
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Other Positions') return 1;
      if (b === 'Other Positions') return -1;
      return a.localeCompare(b);
    });
  }, [pendingApprovals]);

  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const approvalsLoad = useTableLoading(approvalsLoading, pendingApprovals.length > 0);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [approvalNotice, setApprovalNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [returnDraftId, setReturnDraftId] = useState<string | null>(null);
  const [returnComment, setReturnComment] = useState('');
  // Inline edit/override of a pending submission's MFO / Success Indicator text.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMfo, setEditMfo] = useState<Record<string, string>>({}); // mfoId -> title
  const [editSi, setEditSi] = useState<Record<string, string>>({});   // siId  -> description
  const [savingEdits, setSavingEdits] = useState(false);

  const startEdit = (p: PendingApproval) => {
    const mfo: Record<string, string> = {};
    const si: Record<string, string> = {};
    for (const m of p.mfos) {
      mfo[m.id] = m.title;
      for (const s of m.indicators) si[s.id] = s.description;
    }
    setEditMfo(mfo);
    setEditSi(si);
    setEditingId(p.targetSettingId);
  };

  const saveEdits = async (p: PendingApproval) => {
    setSavingEdits(true);
    setApprovalNotice(null);
    const res = await adminEditTargets({
      targetSettingId: p.targetSettingId,
      approverEmployeeId: currentEmployeeId,
      submitterEmployeeId: p.employeeId,
      mfos: p.mfos.map((m) => ({ id: m.id, title: editMfo[m.id] ?? m.title })),
      indicators: p.mfos.flatMap((m) => m.indicators.map((s) => ({ id: s.id, description: editSi[s.id] ?? s.description }))),
    });
    setSavingEdits(false);
    if (res.ok === false) { setApprovalNotice({ tone: 'err', text: res.error }); return; }
    setApprovalNotice({ tone: 'ok', text: `Saved your edits to ${p.employeeName}'s targets.` });
    setEditingId(null);
    void refreshPendingApprovals();
  };

  const refreshPendingApprovals = async () => {
    setApprovalsLoading(true);
    const res = await listPendingApprovals(
      officeRole ? { officeId: officeRole.officeId, officeName: officeRole.officeName } : null
    );
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
  const [activeTab, setActiveTab] = useState<OfficeTabId>('ipcr');
  const [ipcrSubtab, setIpcrSubtab] = useState<'targets' | 'ratings'>('targets');

  // Subtabs
  const [targetsSubtab, setTargetsSubtab] = useState<'verify' | 'transmittal'>('verify');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  useBackClosesView(selectedTargetId !== null, () => setSelectedTargetId(null), 'office-console-target');
  const [ratingsSubtab, setRatingsSubtab] = useState<'review' | 'dpcr' | 'opcr'>('review');

  // State arrays
  const [ratings, setRatings] = useState<EmployeeRating[]>(INITIAL_RATINGS);
  const [transmittals] = useState<TransmittalRecord[]>(INITIAL_TRANSMITTALS);

  // New Training Requests States
  const [detailedRequests, setDetailedRequests] = useState<OfficeTrainingRequest[]>([]);
  // Starts true: the office-scoped fetch waits for the office role to resolve,
  // and a false start would flash "no requests sent yet" before it runs.
  const [loadingRequests, setLoadingRequests] = useState(true);
  const showRequestsLoader = useDelayedLoading(loadingRequests);

  // L&D's recommendations for this office, mirrored from the shared pipeline.
  const [officeRecs, setOfficeRecs] = useState<PipelineRec[]>([]);

  // Form States — an office requests a topic and the reasoning.
  // Category/competency are intentionally excluded: office admins shouldn't need
  // to know L&D's internal pillar taxonomy. L&D assigns category/competency
  // during their intake triage, not at submission time.
  const [topic, setTopic] = useState<string>('');
  const [reasoning, setReasoning] = useState<string>('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

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
        // Must go through readEmployeeSession — the session is per-tab now, and
        // reading localStorage directly would resolve another tab's Department
        // Head and scope this console to the wrong office.
        const session = readEmployeeSession();
        if (!session) return;
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
    // Mount-only session bootstrap; the role resolution refreshes approvals itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Requests and recommendations are both office-scoped, so they can only load
  // once the office role has resolved — running them on mount would read the
  // whole LGU for the split second before `officeRole` lands.
  const officeName = officeRole?.officeName ?? null;

  const refreshRequests = useCallback(async () => {
    setLoadingRequests(true);
    const reqs = await listOfficeTrainingRequests(officeName);
    setDetailedRequests(reqs);
    setLoadingRequests(false);
  }, [officeName]);

  const refreshOfficeRecs = useCallback(async () => {
    const all = await listPipeline();
    const want = officeName?.trim().toLowerCase();
    setOfficeRecs(
      want ? all.filter((r) => (r.department ?? '').trim().toLowerCase() === want) : all
    );
  }, [officeName]);

  useEffect(() => {
    if (officeRoleLoading) return;
    void refreshRequests();
    void refreshOfficeRecs();
  }, [officeRoleLoading, refreshRequests, refreshOfficeRecs]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      alert('Please give the recommended training a topic.');
      return;
    }
    if (!reasoning.trim()) {
      alert('Please explain the reasoning for this recommendation.');
      return;
    }

    setIsSubmittingRequest(true);
    const result = await createTrainingRequest({
      topic: topic.trim(),
      // category and competency are left null — L&D assigns them during triage.
      category: null,
      competency: null,
      reasoning: reasoning.trim(),
      requestingOffice: officeRole?.officeName ?? null,
      requestedBy: currentUserName || null
    });
    setIsSubmittingRequest(false);

    if (result.ok) {
      setConsoleMessage(`Training request sent to L&D: ${topic.trim()}`);
      setTimeout(() => setConsoleMessage(null), 4000);

      // Reset form
      setTopic('');
      setReasoning('');

      // Re-fetch
      await refreshRequests();
    } else {
      alert(`Error submitting training request: ${result.error}`);
    }
  };

  // Newest first: the office's own submissions, so recency is the useful order.
  // (WSM ranking lived here before; it scored proficiency-gap and rationale-tag
  // fields the office no longer supplies, and prioritising across offices is
  // L&D's call to make on the Requests & Needs page.)
  const sortedRequests = [...detailedRequests].sort(
    (a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime()
  );

  const requestCounts = useMemo(() => {
    const c = { review: 0, moving: 0, declined: 0 };
    for (const r of detailedRequests) {
      if (r.outcome.kind === 'under_review') c.review++;
      else if (r.outcome.kind === 'declined') c.declined++;
      else c.moving++;
    }
    return c;
  }, [detailedRequests]);

  // Recommendations awaiting this office's review vs. already sent back to L&D.
  const recsToReview = officeRecs.filter(
    (r) => r.status === 'LND_APPROVED' || r.status === 'OFFICE_ADDED'
  );
  const recsAwaitingLnd = officeRecs.filter((r) => r.status === 'OFFICE_FINALIZED');

  // Edit Mode state

  // Rationale state for Override Controls
  const [activeOverrideId, setActiveOverrideId] = useState<string | null>(null);
  const [overrideScore, setOverrideScore] = useState<number>(4.0);
  const [overrideRationale, setOverrideRationale] = useState('');

  // DPCR & OPCR compiling simulation state
  const [dpcrCompiled, setDpcrCompiled] = useState(false);
  const [opcrCompiled, setOpcrCompiled] = useState(false);
  const [consoleMessage, setConsoleMessage] = useState<string | null>(null);

  // Direct Edit Handlers


  // Push Verified Targets to PM Storage (Transmittal)

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
    <div className="brand-text min-h-screen bg-slate-100 font-sans text-[#040E6B]">

      {/* ── Top Header: the shared portal bar (§8.2) ── */}
      <PortalHeader
        homeHref="/office/dashboard"
        userName={currentUserName}
        roleLabel={currentUserPosition ?? 'Office Account Console'}
        sessionLabel="Office Account Console"
        notifications={{
          items: bellNotifications.map((n) => ({
            id: String(n.id),
            title: n.phase === 'target' ? 'Targets Needed' : 'Ratings Needed',
            message: n.message,
            createdAt: n.created_at,
            unread: !bellSeenAt || n.created_at > bellSeenAt,
          })),
          unreadCount,
          open: showBellDropdown,
          onToggle: handleToggleBell,
          onClose: closeBell,
        }}
        accountSwitch={switchEnabled
          ? { prompt: 'Would you like to switch to your regular Employee Account?', onConfirm: () => navigate('/employee/dashboard') }
          : undefined}
      />

      {/* ── Main Layout: side rail (§9.12), as in the L&D, RSP and PM portals ── */}
      <div className="flex">
        <RailNav
          label="Office Console"
          items={OFFICE_TABS.map((tab) => ({
            path: `office:${tab.id}`,
            label: tab.label,
            icon: tab.icon,
            isActive: activeTab === tab.id,
            onSelect: () => setActiveTab(tab.id),
            title: `${tab.label} · ${tab.sublabel}`,
            badge: tab.id === 'training-attendees' ? { count: recsToReview.length, label: 'to review' } : undefined,
          }))}
        />

        {/* Content Body */}
        <main className="min-w-0 flex-1 space-y-6 p-4 sm:p-6">

          {/* Section Header */}
          {activeTab === 'critical-positions' || activeTab === 'gap-analysis' ? (
            <div className="flex justify-end border-b border-slate-200 pb-5">
              <div className="flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-800">
                <Shield className="h-4 w-4" /> Office Account Authorized
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                  {activeTab === 'ipcr' ? (
                    ipcrSubtab === 'targets' ? (
                      <>
                        <FileText className="h-7 w-7 text-indigo-600" />
                        Phase 1: Target Interception &amp; Adjustment
                      </>
                    ) : (
                      <>
                        <Sliders className="h-7 w-7 text-indigo-600" />
                        Phase 2: Ratings Validation &amp; Cascading Summaries
                      </>
                    )
                  ) : activeTab === 'training-attendees' ? (
                    <>
                      <UserCheck className="h-7 w-7 text-indigo-600" />
                      Training Courses
                    </>
                  ) : (
                    <>
                      <GraduationCap className="h-7 w-7 text-indigo-600" />
                      Training Request Guidance Desk
                    </>
                  )}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {activeTab === 'ipcr'
                    ? ipcrSubtab === 'targets'
                      ? 'Audit and direct-edit employee target submissions before transmitting them to the central PM registrar.'
                      : 'Verify accomplishments at the 6-month mark, apply rating overrides, and generate automated DPCR/OPCR summaries.'
                    : activeTab === 'training-attendees'
                      ? 'Browse published trainings and review L&D\'s roster recommendations for your office. Add employees L&D missed, then send the list back for enrollment.'
                      : 'Request trainings from L&D and track their decisions.'}
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-800">
                <Shield className="h-4 w-4" /> Office Account Authorized
              </div>
            </div>
          )}

          {/* Success Banner */}
          {consoleMessage && (
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-850 p-4 text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-indigo-650 shrink-0" />
              {consoleMessage}
            </div>
          )}

          {/* Main Panel Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[450px]">
            {activeTab === 'ipcr' && (
              <div className="flex border-b border-slate-200 bg-slate-50/50 px-4 py-2 gap-2">
                <button
                  onClick={() => setIpcrSubtab('targets')}
                  className={`px-4 py-2 text-xs font-bold rounded-md transition ${ipcrSubtab === 'targets' ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  Targets
                </button>
                <button
                  onClick={() => setIpcrSubtab('ratings')}
                  className={`px-4 py-2 text-xs font-bold rounded-md transition ${ipcrSubtab === 'ratings' ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  Ratings
                </button>
              </div>
            )}

            {activeTab === 'training-attendees' && (
              <OfficeTrainingCourses
                officeName={officeRole?.officeName ?? null}
                initialSubtab="recommendations"
              />
            )}

            {activeTab === 'critical-positions' && officeRole?.officeId && (
              <div className="p-6">
                <CriticalPositionPage officeId={officeRole.officeId} officeName={officeRole.officeName ?? ''} currentUserName={currentUserName} />
              </div>
            )}

            {activeTab === 'gap-analysis' && officeRole?.officeId && (
              <div className="p-6">
                <CriticalPositionGapAnalysisPage officeId={officeRole.officeId} officeName={officeRole.officeName ?? ''} />
              </div>
            )}

            {/* 📥 TAB 2.1: TARGET INTERCEPTION */}
            {activeTab === 'ipcr' && ipcrSubtab === 'targets' && (
              <div>
                <div className="flex border-b border-slate-100 bg-slate-50/50 px-4 py-2">
                  <button
                    onClick={() => setTargetsSubtab('verify')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition ${targetsSubtab === 'verify' ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                    Individual Target Verification
                  </button>
                  <button
                    onClick={() => setTargetsSubtab('transmittal')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition ${targetsSubtab === 'transmittal' ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-500 hover:text-slate-700'
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

                      {approvalsLoad.initialLoading ? (
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-busy="true">
                          <SkeletonList show={approvalsLoad.showSkeleton} rows={3} label="Loading submissions…" />
                        </div>
                      ) : pendingApprovals.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
                          <p className="text-sm font-semibold text-slate-600">No IPCRs are awaiting approval.</p>
                          <p className="text-xs text-slate-400 mt-1">Submissions appear here once an employee clicks “Submit Targets for Approval”.</p>
                        </div>
                      ) : selectedTargetId !== null ? (
                        (() => {
                          const p = pendingApprovals.find((x) => x.targetSettingId === selectedTargetId);
                          if (!p) {
                            setSelectedTargetId(null);
                            return null;
                          }
                          const isOwn = !!currentEmployeeId && currentEmployeeId === p.employeeId;
                          const busy = approvalBusyId === p.targetSettingId;

                          return (
                            <div className="space-y-4">

                              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 bg-slate-50/50">
                                  <div>
                                    <h3 className="text-base font-bold text-slate-900">{p.employeeName}</h3>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                      {[p.position, p.department].filter(Boolean).join(' · ') || '—'}
                                    </p>
                                  </div>
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200/60">
                                    Submitted for approval
                                  </span>
                                </div>

                                <div className="px-5 py-5 space-y-6">
                                  {(['core', 'strategic', 'support'] as const).map((ft) => {
                                    const group = p.mfos.filter((m) => m.functionType === ft);
                                    if (group.length === 0) return null;
                                    const label = ft === 'core' ? 'Core Functions' : ft === 'strategic' ? 'Strategic Functions' : 'Support Functions';
                                    return (
                                      <div key={ft} className="space-y-3">
                                        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 border-b border-indigo-100 pb-1.5">{label}</p>
                                        <ul className="space-y-3">
                                          {group.map((m) => {
                                            const editing = editingId === p.targetSettingId;
                                            return (
                                              <li key={m.id} className="rounded-xl bg-slate-50/60 border border-slate-200 p-4 space-y-2">
                                                {editing ? (
                                                  <div>
                                                    <input
                                                      value={editMfo[m.id] ?? ''}
                                                      onChange={(e) => setEditMfo((prev) => ({ ...prev, [m.id]: e.target.value }))}
                                                      maxLength={IPCR_LIMITS.mfo}
                                                      className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                    <CharacterCount value={editMfo[m.id] ?? ''} max={IPCR_LIMITS.mfo} />
                                                  </div>
                                                ) : (
                                                  <p className="text-sm font-bold text-slate-900">{m.title || '(untitled MFO)'}</p>
                                                )}
                                                {m.indicators.length > 0 && (
                                                  <ul className={`mt-2 text-xs text-slate-700 ${editing ? 'space-y-2' : 'list-disc pl-5 space-y-1'}`}>
                                                    {m.indicators.map((si) => (
                                                      <li key={si.id}>
                                                        {editing ? (
                                                          <div>
                                                            <input
                                                              value={editSi[si.id] ?? ''}
                                                              onChange={(e) => setEditSi((prev) => ({ ...prev, [si.id]: e.target.value }))}
                                                              maxLength={IPCR_LIMITS.successIndicator}
                                                              className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                            <CharacterCount value={editSi[si.id] ?? ''} max={IPCR_LIMITS.successIndicator} />
                                                          </div>
                                                        ) : (
                                                          si.description
                                                        )}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                )}
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4 bg-slate-50/30">
                                  {isOwn ? (
                                    <p className="text-xs font-semibold text-slate-500">This is your own IPCR — it must be approved by another office account.</p>
                                  ) : editingId === p.targetSettingId ? (
                                    <div className="flex flex-1 flex-wrap items-center gap-2">
                                      <span className="text-xs font-semibold text-indigo-600">Editing — change any MFO / Success Indicator text, then save your overrides.</span>
                                      <div className="ml-auto flex gap-2">
                                        <button onClick={() => void saveEdits(p)} disabled={savingEdits} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50">{savingEdits ? 'Saving…' : 'Save Edits'}</button>
                                        <button onClick={() => setEditingId(null)} disabled={savingEdits} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                                      </div>
                                    </div>
                                  ) : returnDraftId === p.targetSettingId ? (
                                    <div className="flex flex-1 flex-wrap items-center gap-2">
                                      <div className="min-w-[220px] flex-1">
                                        <input
                                          type="text"
                                          value={returnComment}
                                          onChange={(e) => setReturnComment(e.target.value)}
                                          maxLength={IPCR_LIMITS.reviewComment}
                                          placeholder="Reason for returning (optional)"
                                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                        <CharacterCount value={returnComment} max={IPCR_LIMITS.reviewComment} />
                                      </div>
                                      <button onClick={() => void handleReturn(p)} disabled={busy} className="rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50">Confirm Return</button>
                                      <button onClick={() => { setReturnDraftId(null); setReturnComment(''); }} disabled={busy} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                                    </div>
                                  ) : (
                                    <>
                                      <button onClick={() => void handleApprove(p)} disabled={busy} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50">{busy ? 'Working…' : 'Approve & Freeze'}</button>
                                      <button onClick={() => startEdit(p)} disabled={busy} className="rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 shadow-2xs disabled:opacity-50">Edit / Override</button>
                                      <button onClick={() => { setReturnDraftId(p.targetSettingId); setReturnComment(''); }} disabled={busy} className="rounded-lg border border-amber-300 bg-white hover:bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 shadow-2xs disabled:opacity-50">Return for Revision</button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="space-y-6">
                          {groupedApprovals.map(([pos, items]) => {
                            const isCollapsed = collapsedPositions.has(pos);
                            return (
                              <div key={pos} className="space-y-3">
                                <button
                                  type="button"
                                  onClick={() => togglePositionCollapse(pos)}
                                  className="flex w-full items-center justify-between border-b border-slate-200 pb-2 text-left transition hover:opacity-85"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-slate-800 tracking-tight">{pos}</span>
                                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                      {items.length} {items.length === 1 ? 'pending' : 'pending'}
                                    </span>
                                  </div>
                                  <ChevronDown
                                    size={16}
                                    className={`text-slate-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''
                                      }`}
                                  />
                                </button>

                                {!isCollapsed && (
                                  <div className="grid grid-cols-1 gap-2.5 pl-1">
                                    {items.map((p) => (
                                      <div
                                        key={p.targetSettingId}
                                        onClick={() => setSelectedTargetId(p.targetSettingId)}
                                        className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md cursor-pointer"
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-bold text-indigo-700 text-sm">
                                            {p.employeeName ? p.employeeName.charAt(0).toUpperCase() : 'E'}
                                          </div>
                                          <div>
                                            <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                              {p.employeeName}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                              {[p.position, p.department].filter(Boolean).join(' · ') || '—'}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-200/60">
                                            Submitted for approval
                                          </span>
                                          <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
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

                      <div className="abyan-table-wrap">
                        <table className="abyan-table w-full text-left">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
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
            {activeTab === 'ipcr' && ipcrSubtab === 'ratings' && (
              <div>
                <div className="flex border-b border-slate-100 bg-slate-50/50 px-4 py-2">
                  <button
                    onClick={() => setRatingsSubtab('review')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition ${ratingsSubtab === 'review' ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                    Accomplishment & Rating Review
                  </button>
                  <button
                    onClick={() => setRatingsSubtab('dpcr')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition ${ratingsSubtab === 'dpcr' ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                    DPCR Automation Engine
                  </button>
                  <button
                    onClick={() => setRatingsSubtab('opcr')}
                    className={`px-4 py-2 text-xs font-bold rounded-md transition ${ratingsSubtab === 'opcr' ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                    OPCR Master Generation
                  </button>
                </div>

                <div className="p-6">
                  {ratingsSubtab === 'review' && (
                    <Phase2RatingPanel
                      currentEmployeeId={currentEmployeeId}
                      officeScope={
                        officeRole
                          ? { officeId: officeRole.officeId, officeName: officeRole.officeName }
                          : null
                      }
                    />
                  )}

                  {/* Legacy mock override table — superseded by Phase2RatingPanel above. */}
                  {false && ratingsSubtab === 'review' && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">Accomplishment Audits & Overrides</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Validate employee accomplishments and override rating inflation.</p>
                      </div>

                      {activeOverrideId && (
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3 text-xs">
                          <p className="font-bold text-slate-800">Override Rating for: {ratings.find(r => r.id === activeOverrideId)?.name}</p>
                          <div className="flex items-center gap-4">
                            <div>
                              <label className="block text-slate-500 mb-0.5">Override Score (1.0 - 5.0)</label>
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
                              <label className="block text-slate-500 mb-0.5">Rationale / Rationale Log</label>
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
                              className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="abyan-table-wrap">
                        <table className="abyan-table w-full text-left">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
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
                              <tr key={r.id} className="hover:bg-slate-50 transition">
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
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${r.status === 'Overridden'
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
                              <p className="text-xl font-bold text-slate-800">4 Records</p>
                            </div>
                            <div className="border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <p className="text-slate-400">Division Average Score</p>
                              <p className="text-xl font-bold text-indigo-700">4.55 / 5.0</p>
                            </div>
                            <div className="border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <p className="text-slate-400">Outstanding Ratings</p>
                              <p className="text-xl font-bold text-slate-800">3 Employees</p>
                            </div>
                            <div className="border border-slate-100 bg-slate-50/50 rounded-lg p-3">
                              <p className="text-slate-400">Archived Version ID</p>
                              <p className="text-xl font-bold text-slate-800">#DPCR-2025-HR-1</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-500 text-xs">
                          <FileSpreadsheet className="h-10 w-10 text-slate-400 mx-auto mb-2" />
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
                          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
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
                          <Send className="h-10 w-10 text-slate-400 mx-auto mb-2" />
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
                    Ask L&amp;D to run a training. Describe the topic and why {officeRole?.officeName ?? 'your office'} needs
                    it — L&amp;D reviews every request and decides who attends once the course is scheduled.
                  </p>
                </div>

                <form onSubmit={handleSubmitRequest} className="space-y-6 max-w-4xl bg-slate-50/50 p-6 rounded-xl border border-slate-200">
                  {/* Recommended Topic */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Recommended Topic
                    </label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g., Records Digitization Workshop for Frontline Staff"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400">
                      The training you are proposing. L&amp;D designs the actual course.
                    </p>
                  </div>

                  {/* Reasoning */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Reasoning
                    </label>
                    <textarea
                      rows={3}
                      value={reasoning}
                      onChange={(e) => setReasoning(e.target.value)}
                      placeholder="Why does your office need this training? What gap or upcoming change would it address?"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[10px] text-slate-400 max-w-md">
                      L&amp;D reviews every recommendation against IPCR performance data before
                      scheduling. You will see their decision in the table below.
                    </p>
                    <button
                      type="submit"
                      disabled={isSubmittingRequest}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-6 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="h-4 w-4" />
                      {isSubmittingRequest ? 'Sending...' : 'Send to L&D'}
                    </button>
                  </div>
                </form>

                {/* L&D's recommendations for this office */}
                <div className="space-y-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <UserCheck className="h-5 w-5 text-indigo-600" />
                        L&amp;D Recommended Employees
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Employees L&amp;D identified from IPCR performance data as candidates for
                        upcoming trainings in {officeRole?.officeName ?? 'your office'}.
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('training-attendees')}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 transition cursor-pointer"
                    >
                      Review &amp; send back <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {officeRecs.length === 0 ? (
                    <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500 text-xs">
                      <UserCheck className="h-9 w-9 text-slate-300 mx-auto mb-2" />
                      <p className="font-bold">No recommendations from L&amp;D yet.</p>
                      <p className="mt-1">
                        When L&amp;D approves candidates from your office for a training, they appear
                        here for your review.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                            Needs your review
                          </p>
                          <span className="text-xl font-bold text-amber-800">{recsToReview.length}</span>
                        </div>
                        <ul className="mt-3 space-y-1.5">
                          {recsToReview.slice(0, 5).map((r) => (
                            <li key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-semibold text-slate-800">{r.employeeName}</span>
                              <span className="text-slate-500 truncate max-w-[55%] text-right">{r.sessionTitle}</span>
                            </li>
                          ))}
                          {recsToReview.length === 0 && (
                            <li className="text-[11px] text-slate-500 italic">Nothing waiting on you.</li>
                          )}
                          {recsToReview.length > 5 && (
                            <li className="text-[11px] text-amber-700 font-semibold">
                              +{recsToReview.length - 5} more
                            </li>
                          )}
                        </ul>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                            Sent back to L&amp;D
                          </p>
                          <span className="text-xl font-bold text-slate-700">{recsAwaitingLnd.length}</span>
                        </div>
                        <ul className="mt-3 space-y-1.5">
                          {recsAwaitingLnd.slice(0, 5).map((r) => (
                            <li key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-semibold text-slate-800">{r.employeeName}</span>
                              <span className="text-slate-500 truncate max-w-[55%] text-right">{r.sessionTitle}</span>
                            </li>
                          ))}
                          {recsAwaitingLnd.length === 0 && (
                            <li className="text-[11px] text-slate-500 italic">Nothing awaiting enrollment.</li>
                          )}
                          {recsAwaitingLnd.length > 5 && (
                            <li className="text-[11px] text-slate-600 font-semibold">
                              +{recsAwaitingLnd.length - 5} more
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submitted recommendations + what L&D did with them */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-indigo-650" />
                      Your Recommendations to L&amp;D
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Everything {officeRole?.officeName ?? 'your office'} has sent, newest first, with
                      L&amp;D&rsquo;s response.
                    </p>
                  </div>

                  {!loadingRequests && detailedRequests.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800">
                        <Clock className="h-3.5 w-3.5" /> {requestCounts.review} under review
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800">
                        <CheckCircle className="h-3.5 w-3.5" /> {requestCounts.moving} accepted
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-800">
                        <AlertTriangle className="h-3.5 w-3.5" /> {requestCounts.declined} declined
                      </span>
                    </div>
                  )}

                  {loadingRequests || showRequestsLoader ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-busy="true">
                      <SkeletonList show={showRequestsLoader} rows={3} label="Loading your recommendations…" />
                    </div>
                  ) : sortedRequests.length === 0 ? (
                    <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center text-slate-500 text-xs">
                      <ClipboardCheck className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                      <p className="font-bold">No recommendations sent yet.</p>
                      <p className="mt-1">Use the form above to recommend a training to L&amp;D.</p>
                    </div>
                  ) : (
                    <div className="abyan-table-wrap">
                      <table className="abyan-table w-full text-left">
                        <thead>
                          <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                            <th className="px-4 py-3">Topic</th>
                            <th className="px-4 py-3">Competency</th>
                            <th className="px-4 py-3">Reasoning</th>
                            <th className="px-4 py-3">Requested By</th>
                            <th className="px-4 py-3">Sent</th>
                            <th className="px-4 py-3">L&amp;D Response</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedRequests.map((req) => {
                            return (
                              <tr key={req.id} className="hover:bg-slate-50/30 transition align-top">
                                <td className="px-4 py-3">
                                  <p className="font-semibold text-slate-800 max-w-[180px]">{req.title}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="font-bold text-indigo-900 max-w-[160px]">{req.competency ?? '—'}</p>
                                  {req.category && (
                                    <span
                                      className={`mt-1 inline-block px-2 py-0.5 rounded text-[9px] font-bold ${req.category === 'Cultural Transformation'
                                          ? 'bg-purple-50 text-purple-700 border border-purple-100'
                                          : req.category === 'Employee Development'
                                            ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                            : req.category === 'Leadership'
                                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                        }`}
                                    >
                                      {req.category}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-[11px] text-slate-600 leading-snug max-w-[220px]">
                                    {req.justification ?? '—'}
                                  </p>
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  {req.requestedBy ?? '—'}
                                </td>
                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                                  {fmtDate(req.requested_at)}
                                </td>
                                <td className="px-4 py-3">
                                  <OutcomeBadge outcome={req.outcome} />
                                  <p className="text-[10px] text-slate-500 mt-1 max-w-[180px]">
                                    {outcomeDetail(req.outcome)}
                                  </p>
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
