import {
  Archive,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Home,
  Lock,
  LogOut,
  RefreshCw,
  Upload,
  User,
  X,
  Plus,
  Trash2,
  AlertCircle,
  FileSpreadsheet,
  Check,
  Info,
  Download,
  Target
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { MyTrainingsSection } from './MyTrainingsSection';
import { MyArchiveSection } from './MyArchiveSection';
import { IdpFormSection } from './IdpFormSection';
import { PersonalDataSheetSection } from './PersonalDataSheetSection';
import { getActiveOfficeRole } from '../../lib/api/officeRoles';
import abyanLogo from '../../assets/abyan-logo.png';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  fetchPortalEmployeeById,
  patchPortalEmployee,
} from '../../lib/api/employeePortal';
import {
  getActivePerformanceCycle,
  getCompetenciesList,
  getEmployeeIPCR,
  saveOrSubmitEmployeeIPCR,
  getEmployeeRawDetails,
  getLatestEmployeeIPCR,
  getEmployeeEvaluations,
  type IPCRRowDraft,
} from '../../lib/api/performanceEvaluations';
import {
  dispatchEmployeeDocumentsUpdated,
  uploadEmployeeDocument,
} from '../../lib/employeeDocuments';
import {
  getWorkspace,
  saveTargets,
  saveAccomplishments,
  attachPdfUrl,
  type IpcrWorkspaceRow,
} from '../../lib/api/ipcrWorkspace';
import {
  FUNCTION_TYPES,
  blankMfo,
  emptyTargets,
  flattenForWorkspace,
  getActiveCycle,
  hasSubmittableTarget,
  loadTargetSetting,
  loadLatestTargetSetting,
  saveTargetSetting,
  type FunctionType,
  type TargetsByFunction,
  type TargetStatus,
} from '../../lib/api/ipcrTargets';
import { generateIpcrPdf } from '../../lib/ipcrPdf';
import { EmployeePhase2 } from './EmployeePhase2';
import { supabase as supabaseClient } from '../../lib/supabase';
import { listEmployeeNotifications, markEmployeeNotificationsRead, type EmployeeNotification } from '../../lib/api/employeeNotifications';

/**
 * Whether a system-scope phase_schedules row is currently "open".
 * `Open`/`Closed` force it; `Auto` follows start_date..deadline_date.
 * A missing row means the PM hasn't configured it yet — don't block the employee.
 */
function isPhaseScheduleOpen(row: any | null): boolean {
  if (!row) return false;
  if (row.mode === 'Open') return true;
  if (row.mode === 'Closed') return false;
  const today = new Date().toISOString().slice(0, 10);
  if (!row.start_date || !row.deadline_date) return false;
  return today >= row.start_date && today <= row.deadline_date;
}

/**
 * Shown in place of the employee-only sections when the signed-in account is an
 * Office Account (a department/office head). The tab stays in the navigation so
 * the portal structure is identical across account types — it is explained, not
 * hidden, so it never reads as a missing feature or a bug.
 */
const OfficeAccountLockedNote = ({ section }: { section: string }) => (
  <div className="mx-auto max-w-3xl px-4 py-10">
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Lock className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-bold text-slate-900">{section} is not available for Office Accounts</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
        Office Accounts are held by department and office heads, who oversee their team's
        performance and training rather than completing individual IPCR targets or training
        requests themselves. Your oversight tools are available in the Office Account portal.
      </p>
    </div>
  </div>
);
import {
  changeEmployeePortalPassword,
  changeEmployeePortalUsername,
  findEmployeeByEmployeeId,
  findEmployeePortalAccount,
  updateEmployeePortalEmployee,
} from '../../lib/employeePortalData';
import { Employee } from '../../types/employee.types';

interface EmployeePageProps {
  currentUser: Employee;
  loginUsername?: string;
  onLogout: () => void;
}

type PortalTab = 'personal' | 'account' | 'ipcr-workspace' | 'new-entrants' | 'trainings' | 'archive' | 'idp';

interface TabConfig {
  id: PortalTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  count?: number;
}

type ContactDraft = {
  email: string;
  mobileNumber: string;
  homeAddress: string;
};

type EmergencyDraft = {
  emergencyContactName: string;
  emergencyRelationship: string;
  emergencyContactNumber: string;
};

type GovernmentDraft = {
  sssNumber: string;
  philhealthNumber: string;
  pagibigNumber: string;
  tinNumber: string;
};

const getContactDraft = (employee: Employee): ContactDraft => ({
  email: employee.email || '',
  mobileNumber: employee.mobileNumber || '',
  homeAddress: employee.homeAddress || '',
});

const getEmergencyDraft = (employee: Employee): EmergencyDraft => ({
  emergencyContactName: employee.emergencyContactName || '',
  emergencyRelationship: employee.emergencyRelationship || '',
  emergencyContactNumber: employee.emergencyContactNumber || '',
});

const getGovernmentDraft = (employee: Employee): GovernmentDraft => ({
  sssNumber: employee.sssNumber || '',
  philhealthNumber: employee.philhealthNumber || '',
  pagibigNumber: employee.pagibigNumber || '',
  tinNumber: employee.tinNumber || '',
});

// Returns the first incomplete wizard step so the CTA jumps to the right place.
const getWizardStartStep = (p: Employee): 1 | 2 | 3 => {
  const step1Done = !!p.email?.trim() && !!p.mobileNumber?.trim() && !!p.homeAddress?.trim();
  const step2Done = !!p.emergencyContactName?.trim() && !!p.emergencyRelationship?.trim() && !!p.emergencyContactNumber?.trim();
  if (!step1Done) return 1;
  if (!step2Done) return 2;
  return 3;
};

// Figma shows ISO-style dates (e.g. "2026-02-20"). Keep it timezone-safe by
// reading the date parts rather than constructing a Date in local time.
const formatPortalDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const iso = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(value).toISOString().slice(0, 10);
};

export const EmployeePage: React.FC<EmployeePageProps> = ({ currentUser, loginUsername, onLogout }) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Employee>(currentUser);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [hasOfficeRole, setHasOfficeRole] = useState(false);
  const location = useLocation();

  // IPCR performance self-evaluation states
  const [activeCycle, setActiveCycle] = useState<any | null>(null);
  const [competencies, setCompetencies] = useState<Array<{ competency_id: number; competency_standard: string }>>([]);
  const [employeeRawDetails, setEmployeeRawDetails] = useState<any | null>(null);
  const [ipcrRows, setIpcrRows] = useState<IPCRRowDraft[]>([]);
  const [ipcrEvaluation, setIpcrEvaluation] = useState<any | null>(null);
  const [isEditingIPCR, setIsEditingIPCR] = useState(false);
  const [ipcrLoading, setIpcrLoading] = useState(false);
  const [ipcrSaving, setIpcrSaving] = useState(false);
  const [ipcrError, setIpcrError] = useState<string | null>(null);
  const [ipcrSuccess, setIpcrSuccess] = useState<string | null>(null);
  const [ipcrRatingPeriod, setIpcrRatingPeriod] = useState<string>('');
  const [employeeEvaluations, setEmployeeEvaluations] = useState<any[]>([]);
  const [probationarySchedule, setProbationarySchedule] = useState<any | null>(null);
  // System-scope PM phase windows (regular employees). Probationary uses probationarySchedule.
  const [systemSchedules, setSystemSchedules] = useState<{ target: any | null; rating: any | null }>({
    target: null,
    rating: null,
  });

  // Office Accounts (department/office heads) oversee their team rather than
  // filing their own IPCR or training requests — those tabs stay visible but
  // render an explanatory note instead of the employee-only content.
  const [isOfficeAccount, setIsOfficeAccount] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const empId = currentUser.supabaseId;
      if (!empId) {
        if (!cancelled) setIsOfficeAccount(false);
        return;
      }
      const role = await getActiveOfficeRole(String(empId));
      if (!cancelled) setIsOfficeAccount(Boolean(role));
    })();
    return () => { cancelled = true; };
  }, [currentUser.supabaseId]);

  const isTargetSettingActive = useMemo(() => {
    const systemOpen = isPhaseScheduleOpen(systemSchedules.target);
    if (probationarySchedule) {
      const nowStr = new Date().toISOString().slice(0, 10);
      const probOpen = nowStr >= probationarySchedule.target_start && nowStr <= probationarySchedule.target_end;
      return systemOpen || probOpen;
    }
    return systemOpen;
  }, [probationarySchedule, systemSchedules]);

  const isAccomplishmentRatingActive = useMemo(() => {
    const systemOpen = isPhaseScheduleOpen(systemSchedules.rating);
    if (probationarySchedule) {
      const nowStr = new Date().toISOString().slice(0, 10);
      const probOpen = nowStr >= probationarySchedule.accomplishment_start && nowStr <= probationarySchedule.accomplishment_end;
      return systemOpen || probOpen;
    }
    return systemOpen;
  }, [probationarySchedule, systemSchedules]);

  // Module 3 IPCR Workspace & New Entrants State
  // Persist the subtab across page refreshes so users stay on Phase 2 when they
  // were working there. Falls back to 'phase2' when accomplishment rating is
  // active and there's no stored preference, so the most relevant tab shows first.
  const [ipcrSubtab, setIpcrSubtab] = useState<'phase1' | 'phase2'>(() => {
    try {
      const stored = sessionStorage.getItem('cictrix_ipcr_subtab');
      if (stored === 'phase1' || stored === 'phase2') return stored;
    } catch { /* sessionStorage unavailable */ }
    return 'phase1';
  });
  useEffect(() => {
    try { sessionStorage.setItem('cictrix_ipcr_subtab', ipcrSubtab); } catch { /* ignore */ }
  }, [ipcrSubtab]);
  // Auto-switch to Phase 2 on first load when accomplishment rating is active
  // and no explicit tab was stored (so the user sees the open phase by default).
  const hasAutoSwitchedRef = useRef(false);
  useEffect(() => {
    if (hasAutoSwitchedRef.current) return;
    if (isAccomplishmentRatingActive && location.pathname.includes('/ipcr-workspace')) {
      try {
        if (!sessionStorage.getItem('cictrix_ipcr_subtab')) {
          setIpcrSubtab('phase2');
        }
      } catch { /* ignore */ }
      hasAutoSwitchedRef.current = true;
    }
  }, [isAccomplishmentRatingActive, location.pathname]);
  const [newEntrantsSubtab, setNewEntrantsSubtab] = useState<'checklist' | 'scheduler'>('checklist');
  const [employeeTargets, setEmployeeTargets] = useState({
    core: '',
    strategic: '',
    support: '',
  });
  // Phase 1 relational model (target_settings -> mfos -> success_indicators).
  // employeeTargets above stays as the flattened text ipcr_workspace/PDF read.
  const [targetRows, setTargetRows] = useState<TargetsByFunction>(emptyTargets());
  const [targetStatus, setTargetStatus] = useState<TargetStatus>('draft');
  const [targetReviewComment, setTargetReviewComment] = useState<string | null>(null);
  const [activeCycleId, setActiveCycleId] = useState<number | null>(null);
  const [ipcrApproved, setIpcrApproved] = useState(false);
  // Per-category Phase 2 accomplishments + Q/E/T self-ratings + % weight.
  const [accomplishments, setAccomplishments] = useState({ core: '', strategic: '', support: '' });
  type CatRating = {
    quality: number | null;
    efficiency: number | null;
    timeliness: number | null;
    weight: number | null;
  };
  const emptyCatRating = (): CatRating => ({
    quality: null,
    efficiency: null,
    timeliness: null,
    weight: null,
  });
  const [selfRatings, setSelfRatings] = useState<{
    core: CatRating;
    strategic: CatRating;
    support: CatRating;
  }>({
    core: emptyCatRating(),
    strategic: emptyCatRating(),
    support: emptyCatRating(),
  });
  // Average (A) of the filled Q/E/T for a category, for live display.
  const catAverage = (c: CatRating): number | null => {
    const filled = [c.quality, c.efficiency, c.timeliness].filter(
      (r): r is number => typeof r === 'number' && !Number.isNaN(r),
    );
    if (filled.length === 0) return null;
    return Number((filled.reduce((a, b) => a + b, 0) / filled.length).toFixed(2));
  };
  const [workspaceRow, setWorkspaceRow] = useState<IpcrWorkspaceRow | null>(null);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [orientationChecked, setOrientationChecked] = useState({
    duties: true,
    policies: true,
    workflow: false,
    setup: false
  });
  const [orientationVerified, setOrientationVerified] = useState(false);

  useEffect(() => {
    if (!currentUser.supabaseId) return;
    const supabase = supabaseClient as any;
    supabase
      .from('office_role_assignments')
      .select('id')
      .eq('employee_id', currentUser.supabaseId)
      .eq('status', 'Active')
      .limit(1)
      .then(({ data }: { data: any[] | null }) => {
        setHasOfficeRole(Array.isArray(data) && data.length > 0);
      });
  }, [currentUser.supabaseId]);

  const lastLoadedSnapshot = useRef<null | {
    targetRowsJson: string;
    employeeTargets: { core: string; strategic: string; support: string };
    accomplishmentsJson: string;
    selfRatingsJson: string;
    ipcrRowsJson: string;
  }>(null);

  const isIpcrFormDirty = useCallback(() => {
    const snap = lastLoadedSnapshot.current;
    if (!snap) return false;
    return (
      JSON.stringify(targetRows) !== snap.targetRowsJson ||
      employeeTargets.core !== snap.employeeTargets.core ||
      employeeTargets.strategic !== snap.employeeTargets.strategic ||
      employeeTargets.support !== snap.employeeTargets.support ||
      JSON.stringify(accomplishments) !== snap.accomplishmentsJson ||
      JSON.stringify(selfRatings) !== snap.selfRatingsJson ||
      JSON.stringify(ipcrRows) !== snap.ipcrRowsJson
    );
  }, [targetRows, employeeTargets, accomplishments, selfRatings, ipcrRows]);

  const [deferredRefresh, setDeferredRefresh] = useState(false);

  const snapshotLoaded = useCallback((
    targets: TargetsByFunction,
    empTargets: { core: string; strategic: string; support: string },
    accomps: { core: string; strategic: string; support: string },
    ratings: { core: CatRating; strategic: CatRating; support: CatRating },
    legacyRows: IPCRRowDraft[]
  ) => {
    lastLoadedSnapshot.current = {
      targetRowsJson: JSON.stringify(targets),
      employeeTargets: { ...empTargets },
      accomplishmentsJson: JSON.stringify(accomps),
      selfRatingsJson: JSON.stringify(ratings),
      ipcrRowsJson: JSON.stringify(legacyRows),
    };
    setDeferredRefresh(false);
  }, []);

  const calculateRowAverage = (q: number | null, e: number | null, t: number | null): number => {
    const ratings = [q, e, t].filter((r): r is number => typeof r === 'number' && r !== null);
    if (ratings.length === 0) return 0;
    const sum = ratings.reduce((acc, val) => acc + val, 0);
    return Number((sum / ratings.length).toFixed(2));
  };

  const latestEmployeeIpcrLoadId = useRef(0);

  const loadIPCRData = useCallback(async (isSilent = false) => {
    if (!currentUser.supabaseId) return;
    const loadId = ++latestEmployeeIpcrLoadId.current;
    if (!isSilent) {
      setIpcrLoading(true);
    }
    setIpcrError(null);
    try {
      const rawDetailsRes = await getEmployeeRawDetails(currentUser.supabaseId);
      if (loadId !== latestEmployeeIpcrLoadId.current) return;
      let employeeNum = currentUser.employeeId;
      let rawData = null;
      if (rawDetailsRes.success && rawDetailsRes.data) {
        rawData = rawDetailsRes.data;
        setEmployeeRawDetails(rawData);
        if (rawData.employee_number) {
          employeeNum = rawData.employee_number;
        }
      }

      // Check if employee is probationary and has a configured cycle schedule
      let activeProbationarySchedule: any = null;
      if (profile.employmentStatus === 'Probationary' && profile.dateHired) {
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const hireMonth = monthNames[new Date(profile.dateHired).getMonth()];
        const supabase = supabaseClient as any;
        const { data: schedData } = await supabase
          .from('probationary_ipcr_schedules')
          .select('*')
          .eq('hired_month', hireMonth)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (loadId !== latestEmployeeIpcrLoadId.current) return;
        if (schedData) {
          activeProbationarySchedule = schedData;
        }
      }
      setProbationarySchedule(activeProbationarySchedule);

      const cycleRes = await getActivePerformanceCycle();
      if (loadId !== latestEmployeeIpcrLoadId.current) return;
      let cycle = null;
      if (cycleRes.success && cycleRes.data) {
        cycle = cycleRes.data;
        setActiveCycle(cycle);
      }

      const compRes = await getCompetenciesList();
      if (loadId !== latestEmployeeIpcrLoadId.current) return;
      if (compRes.success && compRes.data) {
        setCompetencies(compRes.data);
      }

      const ipcrRes = await getLatestEmployeeIPCR(
        currentUser.supabaseId,
        employeeNum,
        cycle ? cycle.id : null
      );
      if (loadId !== latestEmployeeIpcrLoadId.current) return;
      let resolvedPeriod: string;
      if (ipcrRes.success && ipcrRes.data) {
        setIpcrRows(ipcrRes.data.rows);
        setIpcrEvaluation(ipcrRes.data.evaluation);
        resolvedPeriod = activeProbationarySchedule ? activeProbationarySchedule.period_label : ipcrRes.data.ratingPeriod;
      } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const fallbackPeriod = month < 6 ? `January–June ${year}` : `July–December ${year}`;
        resolvedPeriod = activeProbationarySchedule ? activeProbationarySchedule.period_label : fallbackPeriod;
      }
      setIpcrRatingPeriod(resolvedPeriod);

      const evalsRes = await getEmployeeEvaluations(currentUser.supabaseId);
      if (loadId !== latestEmployeeIpcrLoadId.current) return;
      if (evalsRes.success) {
        setEmployeeEvaluations(evalsRes.data);
      }

      // Always load the phase windows so they act as a fallback (probationary
      // employees OR these with their own schedule). Resolve the employee's
      // OFFICE override if one exists, else the system default — so offices can
      // sit on different phases (e.g. Legal stays in Phase 1 while every other
      // office moves to Phase 2).
      {
        const supabase = supabaseClient as any;
        // Resolve the employee's office_id (departments.id) to match an override.
        let officeId: string | null = null;
        const empIdForOffice = currentUser.supabaseId ?? null;
        if (empIdForOffice) {
          const { data: empRow } = await supabase
            .from('employees_with_department')
            .select('department')
            .eq('id', empIdForOffice)
            .maybeSingle();
          const officeName = String(empRow?.department ?? '').trim();
          if (officeName) {
            const { data: dep } = await supabase.from('departments').select('id').eq('name', officeName).maybeSingle();
            officeId = dep?.id ?? null;
          }
        }
        const { data: schedRows } = await supabase
          .from('phase_schedules')
          .select('*')
          .or(officeId ? `scope.eq.system,office_id.eq.${officeId}` : 'scope.eq.system');
        if (loadId !== latestEmployeeIpcrLoadId.current) return;
        const rows: any[] = Array.isArray(schedRows) ? schedRows : [];
        const resolvePhase = (phase: string) =>
          (officeId && rows.find((r) => r.scope === 'office' && r.office_id === officeId && r.phase === phase)) ||
          rows.find((r) => r.scope === 'system' && r.phase === phase) ||
          null;
        setSystemSchedules({ target: resolvePhase('target_setting'), rating: resolvePhase('rating') });
      }

      // Phase 1 relational targets. If the active cycle resolves, load by cycle;
      // otherwise (e.g. performance_cycles not readable by the anon client due to
      // RLS) fall back to loading the employee's frozen targets directly, so the
      // "Frozen Targets" panel still renders instead of "No target configured".
      const activeCycleRes = await getActiveCycle();
      if (loadId !== latestEmployeeIpcrLoadId.current) return;
      let tsRes;
      if (activeCycleRes.ok && activeCycleRes.data) {
        setActiveCycleId(activeCycleRes.data.id);
        tsRes = await loadTargetSetting(currentUser.supabaseId, activeCycleRes.data.id);
      } else {
        tsRes = await loadLatestTargetSetting(currentUser.supabaseId);
      }
      if (loadId !== latestEmployeeIpcrLoadId.current) return;
      if (tsRes.ok) {
        setTargetRows(tsRes.data.targets);
        setTargetStatus(tsRes.data.setting?.status ?? 'draft');
        setTargetReviewComment(tsRes.data.setting?.review_comment ?? null);
      }

      // Load the "My IPCR Workspace" row for this period and hydrate the form.
      const ws = await getWorkspace(currentUser.supabaseId, resolvedPeriod);
      if (loadId !== latestEmployeeIpcrLoadId.current) return;
      setWorkspaceRow(ws);
      if (ws) {
        setEmployeeTargets({
          core: ws.core_target ?? '',
          strategic: ws.strategic_target ?? '',
          support: ws.support_target ?? '',
        });
        setAccomplishments({
          core: ws.core_accomplishment ?? '',
          strategic: ws.strategic_accomplishment ?? '',
          support: ws.support_accomplishment ?? '',
        });
        setSelfRatings({
          core: {
            quality: ws.core_quality ?? null,
            efficiency: ws.core_efficiency ?? null,
            timeliness: ws.core_timeliness ?? null,
            weight: ws.core_weight ?? null,
          },
          strategic: {
            quality: ws.strategic_quality ?? null,
            efficiency: ws.strategic_efficiency ?? null,
            timeliness: ws.strategic_timeliness ?? null,
            weight: ws.strategic_weight ?? null,
          },
          support: {
            quality: ws.support_quality ?? null,
            efficiency: ws.support_efficiency ?? null,
            timeliness: ws.support_timeliness ?? null,
            weight: ws.support_weight ?? null,
          },
        });
        setIpcrApproved(ws.status !== 'Draft Targets');
        snapshotLoaded(
          tsRes.ok ? tsRes.data.targets : emptyTargets(),
          {
            core: ws.core_target ?? '',
            strategic: ws.strategic_target ?? '',
            support: ws.support_target ?? '',
          },
          {
            core: ws.core_accomplishment ?? '',
            strategic: ws.strategic_accomplishment ?? '',
            support: ws.support_accomplishment ?? '',
          },
          {
            core: {
              quality: ws.core_quality ?? null,
              efficiency: ws.core_efficiency ?? null,
              timeliness: ws.core_timeliness ?? null,
              weight: ws.core_weight ?? null,
            },
            strategic: {
              quality: ws.strategic_quality ?? null,
              efficiency: ws.strategic_efficiency ?? null,
              timeliness: ws.strategic_timeliness ?? null,
              weight: ws.strategic_weight ?? null,
            },
            support: {
              quality: ws.support_quality ?? null,
              efficiency: ws.support_efficiency ?? null,
              timeliness: ws.support_timeliness ?? null,
              weight: ws.support_weight ?? null,
            },
          },
          ipcrRes.success && ipcrRes.data ? ipcrRes.data.rows : []
        );
      } else {
        setEmployeeTargets({ core: '', strategic: '', support: '' });
        setAccomplishments({ core: '', strategic: '', support: '' });
        setSelfRatings({
          core: emptyCatRating(),
          strategic: emptyCatRating(),
          support: emptyCatRating(),
        });
        setIpcrApproved(false);
        snapshotLoaded(
          tsRes.ok ? tsRes.data.targets : emptyTargets(),
          { core: '', strategic: '', support: '' },
          { core: '', strategic: '', support: '' },
          {
            core: emptyCatRating(),
            strategic: emptyCatRating(),
            support: emptyCatRating(),
          },
          ipcrRes.success && ipcrRes.data ? ipcrRes.data.rows : []
        );
      }
    } catch (err) {
      console.error('Failed to load IPCR data:', err);
      setIpcrError('Failed to load IPCR performance data. Please try again.');
    } finally {
      if (loadId === latestEmployeeIpcrLoadId.current) {
        setIpcrLoading(false);
      }
    }
  }, [currentUser.supabaseId, currentUser.employeeId, profile.employmentStatus, profile.dateHired]);

  const pendingIpcrRefresh = useRef(false);
  const reloadIpcrIfSafe = useCallback((isSilent: boolean) => {
    if (isIpcrFormDirty()) {
      pendingIpcrRefresh.current = true;
      setDeferredRefresh(true);
      return;
    }
    pendingIpcrRefresh.current = false;
    setDeferredRefresh(false);
    void loadIPCRData(isSilent);
  }, [isIpcrFormDirty, loadIPCRData]);

  /**
   * Lightweight phase-gate refresh: re-fetches only the two system-scope
   * phase_schedules rows and updates systemSchedules without touching any
   * form state. Called unconditionally from the realtime onChange so that
   * isTargetSettingActive / isAccomplishmentRatingActive flip instantly
   * for every employee when the PM opens or closes a phase — even when
   * the full loadIPCRData reload is deferred due to a dirty form.
   */
  const refreshPhaseSchedules = useCallback(async () => {
    if (!currentUser.supabaseId) return;
    try {
      const supabase = supabaseClient as any;
      const { data: schedRows } = await supabase
        .from('phase_schedules')
        .select('*')
        .eq('scope', 'system');
      const rows: any[] = Array.isArray(schedRows) ? schedRows : [];
      setSystemSchedules({
        target: rows.find((r: any) => r.phase === 'target_setting') ?? null,
        rating: rows.find((r: any) => r.phase === 'rating') ?? null,
      });
    } catch (err) {
      console.warn('[EmployeePage] refreshPhaseSchedules failed:', err);
    }
  }, [currentUser.supabaseId]);

  // ── My IPCR Workspace (Phase 1 targets / Phase 2 accomplishments) ──────────
  const workspaceIdentity = () => ({
    employeeId: currentUser.supabaseId as string,
    employeeNum: (employeeRawDetails?.employee_number ?? currentUser.employeeId) || null,
    employeeName: profile.fullName || currentUser.employeeId || null,
    officeId: null as string | null,
    officeName: (employeeRawDetails?.department ?? profile.currentDepartment) || null,
    period: ipcrRatingPeriod,
    updatedBy: profile.email || currentUser.employeeId || 'employee',
  });

  const handleSaveWorkspaceTargets = async (submit: boolean) => {
    if (!currentUser.supabaseId) {
      setIpcrError(
        'Your account isn’t linked to an employee record in the database, so targets can’t be saved. Please contact your PM / administrator.',
      );
      return;
    }
    if (!ipcrRatingPeriod.trim()) {
      setIpcrError('No active rating period.');
      return;
    }
    if (submit && !hasSubmittableTarget(targetRows)) {
      setIpcrError('Add at least one MFO with a success indicator before submitting.');
      return;
    }

    // activeCycleId is populated by loadIPCRData. That runs a long chain of
    // queries before it reaches the cycle, so a slow load — or any earlier step
    // failing — left this null and the submit dead-ended on "No active
    // performance cycle" even though a cycle exists. Resolve it on demand
    // instead of trusting load-time state.
    let cycleId = activeCycleId;
    if (!cycleId) {
      const cycleRes = await getActiveCycle();
      if (cycleRes.ok && cycleRes.data) {
        cycleId = cycleRes.data.id;
        setActiveCycleId(cycleRes.data.id);
      }
    }
    if (!cycleId) {
      setIpcrError('No active performance cycle. Please contact your PM / administrator.');
      return;
    }

    setWorkspaceSaving(true);
    setIpcrError(null);

    // Source of truth: the relational rows Phase 2 will attach ratings to.
    const targetRes = await saveTargetSetting({
      employeeId: currentUser.supabaseId,
      cycleId,
      targets: targetRows,
      submit,
    });
    if (targetRes.ok === false) {
      setWorkspaceSaving(false);
      setIpcrError(targetRes.error);
      return;
    }

    // Update Phase 1 UI state immediately to prevent double-submit if Phase 2 save fails
    setTargetStatus(targetRes.data.status);
    if (submit) setTargetReviewComment(null);

    // Mirror a flattened summary into ipcr_workspace, which Phase 2 and the
    // generated IPCR PDF still read from.
    const flattened = {
      core: flattenForWorkspace(targetRows.core),
      strategic: flattenForWorkspace(targetRows.strategic),
      support: flattenForWorkspace(targetRows.support),
    };
    setEmployeeTargets(flattened);

    const res = await saveTargets({
      ...workspaceIdentity(),
      ...flattened,
      submit,
    });
    setWorkspaceSaving(false);
    if (res.ok === false) {
      setIpcrError(res.error || 'Failed to save targets.');
      return;
    }
    
    setWorkspaceRow(res.row);
    setIpcrApproved(res.row.status !== 'Draft Targets');
    snapshotLoaded(
      targetRows,
      flattened,
      accomplishments,
      selfRatings,
      ipcrRows
    );
    if (pendingIpcrRefresh.current) {
      reloadIpcrIfSafe(true);
    }
    setSaveSuccess(submit ? 'Targets submitted to your Office Account for approval.' : 'Targets saved as draft.');
    setTimeout(() => setSaveSuccess(null), 4000);
  };

  // ── Phase 1 table editing ──────────────────────────────────────────────────
  const targetsLocked = targetStatus === 'submitted_for_approval' || targetStatus === 'approved';

  const mutateTargets = (fn: (draft: TargetsByFunction) => void) => {
    setTargetRows((prev) => {
      const next: TargetsByFunction = {
        core: prev.core.map((m) => ({ ...m, indicators: m.indicators.map((si) => ({ ...si })) })),
        strategic: prev.strategic.map((m) => ({ ...m, indicators: m.indicators.map((si) => ({ ...si })) })),
        support: prev.support.map((m) => ({ ...m, indicators: m.indicators.map((si) => ({ ...si })) })),
      };
      fn(next);
      // A category never renders empty.
      for (const key of FUNCTION_TYPES) if (next[key].length === 0) next[key] = [blankMfo()];
      return next;
    });
  };

  const addMfo = (fn: FunctionType) => mutateTargets((d) => { d[fn].push(blankMfo()); });
  const removeMfo = (fn: FunctionType, i: number) => mutateTargets((d) => { d[fn].splice(i, 1); });
  const setMfoTitle = (fn: FunctionType, i: number, title: string) =>
    mutateTargets((d) => { d[fn][i].title = title; });
  const addIndicator = (fn: FunctionType, i: number) =>
    mutateTargets((d) => { d[fn][i].indicators.push({ description: '' }); });
  const removeIndicator = (fn: FunctionType, i: number, j: number) =>
    mutateTargets((d) => {
      d[fn][i].indicators.splice(j, 1);
      if (d[fn][i].indicators.length === 0) d[fn][i].indicators.push({ description: '' });
    });
  const setIndicator = (fn: FunctionType, i: number, j: number, description: string) =>
    mutateTargets((d) => { d[fn][i].indicators[j].description = description; });

  const handleSubmitWorkspaceAccomplishments = async (submit: boolean) => {
    if (!currentUser.supabaseId) {
      setIpcrError(
        'Your account isn’t linked to an employee record in the database, so the IPCR can’t be saved. Please contact your PM / administrator.',
      );
      return;
    }
    if (!ipcrRatingPeriod.trim()) {
      setIpcrError('No active rating period.');
      return;
    }
    setWorkspaceSaving(true);
    setIpcrError(null);
    const res = await saveAccomplishments({
      ...workspaceIdentity(),
      core: { accomplishment: accomplishments.core, ...selfRatings.core },
      strategic: { accomplishment: accomplishments.strategic, ...selfRatings.strategic },
      support: { accomplishment: accomplishments.support, ...selfRatings.support },
      submit,
    });
    if (res.ok === false) {
      setWorkspaceSaving(false);
      setIpcrError(res.error || 'Failed to save accomplishments.');
      return;
    }
    setWorkspaceRow(res.row);

    if (submit) {
      // Compute done server-side in saveAccomplishments; now generate + upload the PDF.
      try {
        const file = generateIpcrPdf({
          employeeName: profile.fullName || '—',
          employeeNum: (employeeRawDetails?.employee_number ?? currentUser.employeeId) || '—',
          position: (employeeRawDetails?.position ?? profile.currentPosition) || '—',
          department: (employeeRawDetails?.department ?? profile.currentDepartment) || '—',
          period: ipcrRatingPeriod,
          rows: [
            {
              category: 'Strategic Functions',
              target: employeeTargets.strategic,
              accomplishment: accomplishments.strategic,
              quality: selfRatings.strategic.quality,
              efficiency: selfRatings.strategic.efficiency,
              timeliness: selfRatings.strategic.timeliness,
              rating: catAverage(selfRatings.strategic),
              weight: selfRatings.strategic.weight,
            },
            {
              category: 'Core Functions',
              target: employeeTargets.core,
              accomplishment: accomplishments.core,
              quality: selfRatings.core.quality,
              efficiency: selfRatings.core.efficiency,
              timeliness: selfRatings.core.timeliness,
              rating: catAverage(selfRatings.core),
              weight: selfRatings.core.weight,
            },
            {
              category: 'Support Functions',
              target: employeeTargets.support,
              accomplishment: accomplishments.support,
              quality: selfRatings.support.quality,
              efficiency: selfRatings.support.efficiency,
              timeliness: selfRatings.support.timeliness,
              rating: catAverage(selfRatings.support),
              weight: selfRatings.support.weight,
            },
          ],
          overallScore: res.overallScore,
          adjectival: res.adjectival,
        });
        const up = await uploadEmployeeDocument({
          employeeId: currentUser.supabaseId,
          email: profile.email,
          documentType: 'Performance Evaluation Form',
          file,
          category: 'compliance',
        });
        if (up.success === false) {
          setSaveSuccess('Evaluation submitted, but the PDF could not be uploaded.');
          setIpcrError(up.error);
        } else {
          await attachPdfUrl(res.row.id, up.row.file_url);
          setWorkspaceRow({ ...res.row, status: 'Completed', pdf_url: up.row.file_url });
          dispatchEmployeeDocumentsUpdated();
          setSaveSuccess(
            `Evaluation submitted. Overall rating ${res.overallScore?.toFixed(2) ?? '—'}${res.adjectival ? ` (${res.adjectival})` : ''}. IPCR PDF generated.`,
          );
        }
      } catch (err) {
        setSaveSuccess('Evaluation submitted, but PDF generation failed.');
        setIpcrError(err instanceof Error ? err.message : String(err));
      }
    } else {
      setSaveSuccess('Accomplishments saved as draft.');
    }
    snapshotLoaded(
      targetRows,
      employeeTargets,
      accomplishments,
      selfRatings,
      ipcrRows
    );
    if (pendingIpcrRefresh.current) {
      reloadIpcrIfSafe(true);
    }
    setWorkspaceSaving(false);
    setTimeout(() => setSaveSuccess(null), 5000);
  };

  const loadIPCRPeriod = async (period: string, cycleId: number | null) => {
    if (!currentUser.supabaseId) return;
    setIpcrLoading(true);
    setIpcrError(null);
    try {
      let employeeNum = currentUser.employeeId;
      if (employeeRawDetails && employeeRawDetails.employee_number) {
        employeeNum = employeeRawDetails.employee_number;
      }
      
      const ipcrRes = await getEmployeeIPCR(
        employeeNum,
        period,
        currentUser.supabaseId,
        cycleId
      );
      if (ipcrRes.success && ipcrRes.data) {
        setIpcrRows(ipcrRes.data.rows);
        setIpcrEvaluation(ipcrRes.data.evaluation);
        setIpcrRatingPeriod(period);
      }
    } catch (err) {
      console.error('Failed to load IPCR for period:', err);
      setIpcrError('Failed to load IPCR for the selected period.');
    } finally {
      setIpcrLoading(false);
    }
  };

  const updateRowField = (index: number, field: keyof IPCRRowDraft, value: any) => {
    setIpcrRows((prev) => {
      const next = [...prev];
      const updatedRow = { ...next[index], [field]: value };
      
      if (field === 'q_rating' || field === 'e_rating' || field === 't_rating') {
        updatedRow.ave_rating = calculateRowAverage(
          field === 'q_rating' ? value : updatedRow.q_rating,
          field === 'e_rating' ? value : updatedRow.e_rating,
          field === 't_rating' ? value : updatedRow.t_rating
        );
      }

      if (field === 'competency_id') {
        const compId = Number(value);
        const found = competencies.find(c => c.competency_id === compId);
        updatedRow.mapped_competency_standard = found ? found.competency_standard : '';
        updatedRow.competency_id = compId;
      }

      next[index] = updatedRow;
      return next;
    });
  };

  const addIPCRRow = () => {
    const newRow: IPCRRowDraft = {
      function_type: 'CORE',
      target_text: '',
      accomplishment_text: '',
      q_rating: null,
      e_rating: null,
      t_rating: null,
      ave_rating: 0,
      competency_id: competencies[0]?.competency_id || 0,
      mapped_competency_standard: competencies[0]?.competency_standard || '',
      remarks: ''
    };
    setIpcrRows((prev) => [...prev, newRow]);
  };

  const deleteIPCRRow = (index: number) => {
    setIpcrRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveIPCR = async (status: 'Self Evaluation' | 'Supervisor Review') => {
    if (!currentUser.supabaseId) return;
    
    if (!ipcrRatingPeriod.trim()) {
      setIpcrError('You must enter a Rating Period before saving or submitting.');
      return;
    }
    
    if (status === 'Supervisor Review') {
      if (ipcrRows.length === 0) {
        setIpcrError('You must add at least one Major Final Output (MFO) before submitting.');
        return;
      }
      for (let i = 0; i < ipcrRows.length; i++) {
        const row = ipcrRows[i];
        if (!row.target_text.trim()) {
          setIpcrError(`Row #${i + 1} has empty success indicators/targets.`);
          return;
        }
        if (!row.competency_id) {
          setIpcrError(`Row #${i + 1} does not have a mapped competency.`);
          return;
        }
      }
    }

    setIpcrSaving(true);
    setIpcrError(null);
    setIpcrSuccess(null);

    const finalCycleId = (activeCycle && (ipcrRatingPeriod === activeCycle.title || ipcrRatingPeriod === activeCycle.period))
      ? activeCycle.id
      : null;

    const result = await saveOrSubmitEmployeeIPCR({
      employeeUuid: currentUser.supabaseId,
      employeeNum: employeeRawDetails?.employee_number || currentUser.employeeId,
      positionId: employeeRawDetails?.position_id || null,
      position: employeeRawDetails?.position || currentUser.currentPosition || null,
      plantillaNum: employeeRawDetails?.plantilla_num || null,
      ratingPeriod: ipcrRatingPeriod || 'Annual 2026',
      cycleId: finalCycleId,
      status,
      rows: ipcrRows
    });

    setIpcrSaving(false);
    if (!result.success) {
      setIpcrError(result.error || 'Failed to save IPCR. Please try again.');
    } else {
      setIpcrSuccess(status === 'Supervisor Review' ? 'IPCR submitted for review!' : 'IPCR draft saved successfully.');
      setIsEditingIPCR(false);
      await loadIPCRData();
    }
  };

  // Account & Security tab — username + password change forms
  const portalAccountAtMount = useMemo(
    () => (currentUser?.employeeId ? findEmployeeByEmployeeId(currentUser.employeeId) : null),
    [currentUser?.employeeId],
  );
  const [currentPortalUsername, setCurrentPortalUsername] = useState<string>(
    portalAccountAtMount?.username ?? '',
  );
  const [usernameDraft, setUsernameDraft] = useState<string>(portalAccountAtMount?.username ?? '');
  const [usernameMessage, setUsernameMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [currentPasswordInput, setCurrentPasswordInput] = useState<string>('');
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');
  const [passwordMessage, setPasswordMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Re-authentication gate for the Account & Security tab.
  // Locked by default and re-locks every time the user leaves the tab,
  // so a colleague walking up to the screen can't change credentials.
  const [accountTabUnlocked, setAccountTabUnlocked] = useState(false);
  const [confirmLoginUsername, setConfirmLoginUsername] = useState('');
  const [confirmLoginPassword, setConfirmLoginPassword] = useState('');
  const [confirmLoginError, setConfirmLoginError] = useState<string | null>(null);
  const [confirmLoginVerifying, setConfirmLoginVerifying] = useState(false);

  // Per-field "show password" toggles for the four password inputs.
  const [showConfirmLoginPw, setShowConfirmLoginPw] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmNewPw, setShowConfirmNewPw] = useState(false);

  const handleConfirmLogin = (event?: React.FormEvent) => {
    event?.preventDefault();
    setConfirmLoginError(null);

    if (!currentPortalUsername) {
      setConfirmLoginError(
        'No portal account was found for your record. Contact HR to generate your credentials first.',
      );
      return;
    }

    if (!confirmLoginUsername.trim()) {
      setConfirmLoginError('Please enter your username.');
      return;
    }

    if (!confirmLoginPassword) {
      setConfirmLoginError('Please enter your password.');
      return;
    }

    setConfirmLoginVerifying(true);
    const verified = findEmployeePortalAccount(confirmLoginUsername.trim(), confirmLoginPassword);
    setConfirmLoginVerifying(false);

    if (!verified) {
      setConfirmLoginError('Username or password is incorrect.');
      return;
    }

    // The credentials must belong to the *currently logged-in* employee — not any
    // other portal account that happens to authenticate.
    const verifiedEmployeeId = String(verified.employee.employeeId ?? '').trim();
    const sessionEmployeeId = String(currentUser?.employeeId ?? '').trim();
    if (verifiedEmployeeId && sessionEmployeeId && verifiedEmployeeId !== sessionEmployeeId) {
      setConfirmLoginError("These credentials don't match the account you're logged in as.");
      return;
    }

    setAccountTabUnlocked(true);
    setConfirmLoginUsername('');
    setConfirmLoginPassword('');
  };


  const handleSaveUsername = () => {
    setUsernameMessage(null);
    const result = changeEmployeePortalUsername(currentPortalUsername, usernameDraft);
    if (result.ok === false) {
      setUsernameMessage({ kind: 'error', text: result.error });
      return;
    }
    setCurrentPortalUsername(result.account.username);
    setUsernameDraft(result.account.username);
    setUsernameMessage({
      kind: 'success',
      text: `Username updated to "${result.account.username}". Use it the next time you log in.`,
    });
  };

  const handleSavePassword = () => {
    setPasswordMessage(null);

    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordMessage({ kind: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    const result = changeEmployeePortalPassword(
      currentPortalUsername,
      currentPasswordInput,
      newPasswordInput,
    );
    if (result.ok === false) {
      setPasswordMessage({ kind: 'error', text: result.error });
      return;
    }

    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setPasswordMessage({
      kind: 'success',
      text: 'Password updated. Use the new password the next time you log in.',
    });
  };
  // DB-hydration state — true while the initial Supabase fetch is in-flight.
  const [profileLoading, setProfileLoading] = useState(false);
  // Setup wizard
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardTryNext, setWizardTryNext] = useState(false);
  const [wContact, setWContact] = useState<ContactDraft>({ email: '', mobileNumber: '', homeAddress: '' });
  const [wEmergency, setWEmergency] = useState<EmergencyDraft>({ emergencyContactName: '', emergencyRelationship: '', emergencyContactNumber: '' });
  const [wGovt, setWGovt] = useState<GovernmentDraft>({ sssNumber: '', philhealthNumber: '', pagibigNumber: '', tinNumber: '' });
  // Save feedback banners for profile edits.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  // Track whether the initial DB fetch has completed, to suppress the
  // profileSyncVersion watcher from overwriting freshly-fetched data.
  const dbHydrated = useRef(false);

  const profileSyncVersion = `${currentUser.employeeId}|${currentUser.updatedAt ?? ''}`;

  useEffect(() => {
    // Suppress the sync when the DB hydration has already applied fresher data.
    if (dbHydrated.current) return;
    setProfile(currentUser);
  }, [profileSyncVersion]);

  // ── DB hydration (mount-only) ──────────────────────────────────────────────
  // Fetch the live Supabase row once on mount using the internal UUID.
  // This overwrites any stub data that App.tsx passed via `currentUser`.
  useEffect(() => {
    if (!currentUser.supabaseId) return; // No DB row available (demo account)
    setProfileLoading(true);
    fetchPortalEmployeeById(currentUser.supabaseId).then((result) => {
      if (result.ok) {
        const live = result.data;
        dbHydrated.current = true;
        setProfile(live);
      }
      setProfileLoading(false);
    });
    // Intentionally empty deps — run only on mount, regardless of prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open setup wizard once after profile loads if any setup field is missing.
  useEffect(() => {
    if (profileLoading) return;
    // Seed wizard drafts from live profile so already-filled values are pre-populated.
    setWContact(getContactDraft(profile));
    setWEmergency(getEmergencyDraft(profile));
    setWGovt(getGovernmentDraft(profile));
    const missing =
      !profile.email?.trim() ||
      !profile.mobileNumber?.trim() ||
      !profile.emergencyContactName?.trim() ||
      !profile.sssNumber?.trim();
    if (missing) { setWizardStep(getWizardStartStep(profile)); setWizardTryNext(false); setShowSetupWizard(true); }
    // Only fire once on mount after loading resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoading]);

  const SETUP_FIELDS = 10;
  const incompleteSetupCount = useMemo(() => {
    let n = 0;
    if (!profile.email?.trim()) n++;
    if (!profile.mobileNumber?.trim()) n++;
    if (!profile.homeAddress?.trim()) n++;
    if (!profile.emergencyContactName?.trim()) n++;
    if (!profile.emergencyRelationship?.trim()) n++;
    if (!profile.emergencyContactNumber?.trim()) n++;
    if (!profile.sssNumber?.trim()) n++;
    if (!profile.philhealthNumber?.trim()) n++;
    if (!profile.pagibigNumber?.trim()) n++;
    if (!profile.tinNumber?.trim()) n++;
    return n;
  }, [profile]);

  const completionPercent = Math.round(((SETUP_FIELDS - incompleteSetupCount) / SETUP_FIELDS) * 100);

  const tabs: TabConfig[] = useMemo(
    () => {
      const baseTabs: TabConfig[] = [
        { id: 'personal', label: 'Personal Data Sheet', icon: User, route: '/employee/profile' },
        { id: 'ipcr-workspace', label: 'My IPCR Workspace', icon: FileSpreadsheet, route: '/employee/ipcr-workspace' },
        { id: 'trainings', label: 'My Trainings', icon: Calendar, route: '/employee/trainings' },
        { id: 'idp', label: 'Individual Development Plan', icon: Target, route: '/employee/idp' },
        { id: 'archive', label: 'My Archive', icon: Archive, route: '/employee/archive' },
        { id: 'account', label: 'Account & Security', icon: Lock, route: '/employee/account' },
      ];
      // Show new entrants track only for probationary/new hires
      if (profile.employmentStatus === 'Probationary') {
        baseTabs.splice(2, 0, { id: 'new-entrants', label: 'New Entrants Track', icon: Calendar, route: '/employee/new-entrants' });
      }
      return baseTabs;
    },
    [profile.employmentStatus]
  );

  const activeTab = useMemo<PortalTab>(() => {
    if (location.pathname.includes('/ipcr-workspace')) return 'ipcr-workspace';
    if (location.pathname.includes('/trainings')) return 'trainings';
    if (location.pathname.includes('/idp')) return 'idp';
    if (location.pathname.includes('/archive')) return 'archive';
    if (location.pathname.includes('/new-entrants')) return 'new-entrants';
    if (location.pathname.includes('/account')) return 'account';
    if (location.pathname.includes('/profile')) return 'personal';
    return 'personal';
  }, [location.pathname]);

  useEffect(() => {
    if (activeTab === 'ipcr-workspace') {
      reloadIpcrIfSafe(false);
    }
  }, [activeTab, currentUser?.supabaseId, reloadIpcrIfSafe]);

  const [bellNotifications, setBellNotifications] = useState<EmployeeNotification[]>([]);
  const [showBellDropdown, setShowBellDropdown] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!currentUser.supabaseId) return;
    const list = await listEmployeeNotifications(currentUser.supabaseId);
    setBellNotifications(list);
  }, [currentUser.supabaseId]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const unreadCount = useMemo(() => {
    return bellNotifications.filter(n => !n.is_read).length;
  }, [bellNotifications]);

  const handleToggleBell = async () => {
    const next = !showBellDropdown;
    setShowBellDropdown(next);
    if (next && currentUser.supabaseId) {
      await markEmployeeNotificationsRead(currentUser.supabaseId);
      const list = await listEmployeeNotifications(currentUser.supabaseId);
      setBellNotifications(list);
    }
  };

  useRealtimeRefresh({
    channel: 'employee-page-ipcr',
    tables: ['probationary_ipcr_schedules', 'phase_schedules', 'ipcr_submissions', 'employee_notifications'],
    onChange: useCallback(() => {
      // Always refresh phase gate flags immediately — bypasses the dirty-form
      // guard so employees see Phase 1/2 open/close without waiting for a
      // full data reload.
      void refreshPhaseSchedules();
      reloadIpcrIfSafe(true);
      void loadNotifications();
    }, [refreshPhaseSchedules, reloadIpcrIfSafe, loadNotifications]),
    enabled: true,
  });

  // Re-lock the Account & Security tab whenever the user navigates away.
  // Coming back forces another password confirmation.
  useEffect(() => {
    if (activeTab !== 'account') {
      setAccountTabUnlocked(false);
      setConfirmLoginUsername('');
      setConfirmLoginPassword('');
      setConfirmLoginError(null);
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setUsernameMessage(null);
      setPasswordMessage(null);
      setShowConfirmLoginPw(false);
      setShowCurrentPw(false);
      setShowNewPw(false);
      setShowConfirmNewPw(false);
    }
  }, [activeTab]);

  const handleTabSelect = (tab: TabConfig) => {
    navigate(tab.route);
  };

  const persistProfilePatch = async (patch: Partial<Employee>) => {
    const nowIso = new Date().toISOString();
    // Optimistic local update.
    const nextProfile = { ...profile, ...patch, updatedAt: nowIso };
    setProfile(nextProfile);
    setSaveError(null);
    setSaveSuccess(null);

    if (currentUser.supabaseId) {
      // Write to Supabase.
      const result = await patchPortalEmployee(currentUser.supabaseId, patch);
      if (result.ok === false) {
        setSaveError(result.error ?? 'Failed to save changes. Please try again.');
        // Rollback optimistic update.
        setProfile(profile);
        return;
      }
      setSaveSuccess('Changes saved successfully.');
    } else {
      // Fallback: demo account — persist to localStorage only.
      updateEmployeePortalEmployee(profile.employeeId, patch);
    }
  };

  return (
    <div className="brand-text min-h-screen" style={{ background: '#F0F2FD', fontFamily: "'Poppins', sans-serif" }}>
      {/* ── Branded top nav ── */}
      <header style={{ background: 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)', boxShadow: '0 2px 16px rgba(54,62,232,0.18)' }}>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img
              src={abyanLogo}
              alt="Abyan HRIS"
              style={{ height: 40, width: 'auto', objectFit: 'contain', mixBlendMode: 'screen' }}
            />
            <div>
              <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>Employee Self-Service Portal</h1>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#C8D1FF' }}>Human Resources Information System</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Realtime Notification Bell */}
            {currentUser.supabaseId && (
              <div className="relative">
                <button 
                  className="rounded-full p-2 hover:bg-white/10 text-white relative transition" 
                  type="button"
                  onClick={handleToggleBell}
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-extrabold text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {showBellDropdown && (
                  <div 
                    className="absolute right-0 mt-2 w-80 rounded-xl bg-white text-slate-800 shadow-xl border border-slate-100 py-2 z-50 animate-fade-in"
                    style={{ maxHeight: '350px', overflowY: 'auto' }}
                  >
                    <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-700">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="text-[10px] bg-indigo-50 text-indigo-650 px-2 py-0.5 rounded-full font-bold">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {bellNotifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-slate-400">
                        No notifications yet
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {bellNotifications.map((n) => (
                          <div 
                            key={n.id} 
                            className={`px-4 py-3 flex gap-3 hover:bg-slate-50 transition ${!n.is_read ? 'bg-indigo-50/20' : ''}`}
                          >
                            <Bell className={`h-4 w-4 mt-0.5 shrink-0 ${n.type?.includes('returned') ? 'text-rose-500' : 'text-indigo-600'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-700">
                                {n.title}
                              </p>
                              {n.message && (
                                <p className="text-[11px] text-slate-600 mt-0.5 break-words line-clamp-3">
                                  {n.message}
                                </p>
                              )}
                              <p className="text-[9px] text-slate-400 mt-1">
                                {new Date(n.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="hidden text-right sm:block">
                <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#ffffff' }}>Welcome, {currentUser.fullName}</p>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#C8D1FF' }}>Employee ID: {currentUser.employeeId}</p>
              </div>
              {(hasOfficeRole || loginUsername === 'employee01') && (
                <div className="relative">
                  <button
                    onClick={() => setShowSwitchModal(!showSwitchModal)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '34px',
                      width: '34px',
                      borderRadius: '50%',
                      border: '1.5px solid rgba(255,255,255,0.4)',
                      background: 'rgba(255,255,255,0.15)',
                      color: '#ffffff',
                      cursor: 'pointer',
                      padding: 0
                    }}
                    title="Switch Account"
                  >
                    <User className="h-4.5 w-4.5 text-white" />
                  </button>
                  {showSwitchModal && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '40px',
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
                      <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', fontWeight: 650, color: '#040E6B', lineHeight: 1.4 }}>
                        Would you like to switch to your Office Account dashboard?
                      </p>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setShowSwitchModal(false);
                            navigate('/office/dashboard');
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
            </div>
            <button
              onClick={onLogout}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.12)', padding: '0.4rem 0.85rem', fontSize: '0.85rem', fontWeight: 600, color: '#ffffff', cursor: 'pointer', transition: 'background 0.15s' }}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>

        {/* Tab bar inside header */}
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap gap-1.5 pb-3">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabSelect(tab)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    borderRadius: 8, padding: '0.45rem 0.9rem',
                    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                    border: isActive ? '1.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.25)',
                    background: isActive ? '#ffffff' : 'rgba(255,255,255,0.1)',
                    color: isActive ? '#363EE8' : '#ffffff',
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.count ? (
                    <span style={{ borderRadius: 999, padding: '0.1rem 0.45rem', fontSize: '0.72rem', fontWeight: 800, background: isActive ? '#363EE8' : '#ffffff', color: isActive ? '#ffffff' : '#363EE8' }}>
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {activeTab === 'trainings' && (
          isOfficeAccount
            ? <OfficeAccountLockedNote section="Training" />
            : <MyTrainingsSection employeeId={(currentUser.supabaseId as string) ?? ''} />
        )}

        {activeTab === 'idp' && (
          // Office accounts are a shared login, not a person, so there is no
          // individual whose development plan this would be.
          isOfficeAccount
            ? <OfficeAccountLockedNote section="Individual Development Plan" />
            : <IdpFormSection employee={currentUser} />
        )}

        {activeTab === 'archive' && (
          <MyArchiveSection
            employeeNum={String(employeeRawDetails?.employee_number ?? currentUser.employeeId ?? '')}
          />
        )}
        {activeTab === 'personal' && (
          <div className="space-y-5">
            {/* Loading skeleton */}
            {profileLoading && (
              <div className="rounded-xl border bg-white p-5 animate-pulse" style={{ borderColor: '#C8D1FF' }}>
                <div className="h-5 w-48 rounded bg-slate-200 mb-4" />
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="grid grid-cols-[210px_1fr] gap-3">
                      <div className="h-4 rounded bg-slate-200" />
                      <div className="h-8 rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save feedback banners */}
            {saveError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {saveError}
              </p>
            )}
            {saveSuccess && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                {saveSuccess}
              </p>
            )}

            {/* ── Profile Completion Card (when profile has incomplete fields) ── */}
            {incompleteSetupCount > 0 && (() => {
              const R = 54;
              const circ = 2 * Math.PI * R;
              const offset = circ * (1 - completionPercent / 100);
              return (
                <div style={{ background: 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)', borderRadius: 20, padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                  {/* Ring */}
                  <div style={{ position: 'relative', width: 128, height: 128, flexShrink: 0 }}>
                    <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="12" />
                      <circle
                        cx="64" cy="64" r={R} fill="none"
                        stroke="#C8D1FF"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={circ}
                        strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                      />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>{completionPercent}%</span>
                      <span style={{ fontSize: '0.65rem', color: '#C8D1FF', fontWeight: 600, marginTop: 2 }}>Complete</span>
                    </div>
                  </div>
                  {/* Text + CTA */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <p style={{ margin: '0 0 0.25rem', fontWeight: 800, color: '#ffffff', fontSize: '1.15rem' }}>
                      Complete your profile
                    </p>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#C8D1FF', lineHeight: 1.5 }}>
                      {`${incompleteSetupCount} field${incompleteSetupCount !== 1 ? 's' : ''} still missing — fill them in to finish setting up your account.`}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setWContact(getContactDraft(profile));
                        setWEmergency(getEmergencyDraft(profile));
                        setWGovt(getGovernmentDraft(profile));
                        setWizardStep(getWizardStartStep(profile));
                        setWizardTryNext(false);
                        setShowSetupWizard(true);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderRadius: 10, border: 'none', background: '#ffffff', padding: '0.65rem 1.25rem', fontSize: '0.9rem', fontWeight: 700, color: '#363EE8', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}
                    >
                      {getWizardStartStep(profile) === 3 ? 'Complete Account Setup →' : 'Continue set up account →'}
                    </button>
                  </div>
                </div>
              );
            })()}

            <PersonalDataSheetSection
              employeeId={currentUser.supabaseId ?? ''}
              profile={profile}
              onSaved={(patch) => void persistProfilePatch(patch)}
            />
          </div>
        )}

        {activeTab === 'account' && !accountTabUnlocked && (
          <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Confirm It's You</h2>
                  <p className="text-sm text-slate-500">
                    For your security, please re-enter your password before changing your username or password.
                  </p>
                </div>
              </div>

              {!currentPortalUsername && (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  No portal account was found for your record. Contact HR to generate your credentials first.
                </p>
              )}

              <form
                onSubmit={handleConfirmLogin}
                className="space-y-3"
                autoComplete="off"
                data-form-type="other"
              >
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Username
                  </span>
                  <input
                    type="text"
                    value={confirmLoginUsername}
                    onChange={(e) => setConfirmLoginUsername(e.target.value)}
                    disabled={!currentPortalUsername || confirmLoginVerifying}
                    autoFocus
                    autoComplete="off"
                    name="cictrix-confirm-id-field"
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                    placeholder="Enter your username"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Password
                  </span>
                  <div className="relative">
                    {/* Use type="text" with text-security CSS masking instead of
                        type="password" so the browser doesn't recognize this as a
                        login form and offer the saved-credentials dropdown. */}
                    <input
                      type="text"
                      value={confirmLoginPassword}
                      onChange={(e) => setConfirmLoginPassword(e.target.value)}
                      disabled={!currentPortalUsername || confirmLoginVerifying}
                      autoComplete="off"
                      name="cictrix-confirm-secret-field"
                      data-form-type="other"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      style={{
                        // @ts-expect-error: webkit-only text masking
                        WebkitTextSecurity: showConfirmLoginPw ? 'none' : 'disc',
                        textSecurity: showConfirmLoginPw ? 'none' : 'disc',
                        fontFamily: showConfirmLoginPw ? undefined : 'text-security-disc, inherit',
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                      placeholder="Enter your current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmLoginPw((v) => !v)}
                      tabIndex={-1}
                      aria-label={showConfirmLoginPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    >
                      {showConfirmLoginPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                {confirmLoginError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {confirmLoginError}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={
                      !currentPortalUsername ||
                      !confirmLoginUsername.trim() ||
                      !confirmLoginPassword ||
                      confirmLoginVerifying
                    }
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {confirmLoginVerifying ? 'Verifying…' : 'Continue'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {activeTab === 'account' && accountTabUnlocked && (
          <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-900">Change Username</h2>
                <p className="text-sm text-slate-500">
                  Pick a unique username you'll use to log in. Letters, digits, dot, underscore, and hyphen only.
                </p>
              </div>

              {!currentPortalUsername && (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  No portal account was found for your record. Contact HR to generate your credentials first.
                </p>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Current Username
                  </span>
                  <input
                    type="text"
                    value={currentPortalUsername}
                    disabled
                    className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    New Username
                  </span>
                  <input
                    type="text"
                    value={usernameDraft}
                    onChange={(e) => setUsernameDraft(e.target.value)}
                    disabled={!currentPortalUsername}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                    placeholder="e.g. mariasantos"
                  />
                </label>
              </div>

              {usernameMessage && (
                <p
                  className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                    usernameMessage.kind === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {usernameMessage.text}
                </p>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveUsername}
                  disabled={!currentPortalUsername || usernameDraft.trim() === currentPortalUsername}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  Save Username
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-900">Change Password</h2>
                <p className="text-sm text-slate-500">
                  Enter your current password, then choose a new one. Minimum 6 characters.
                </p>
              </div>

              <div className="grid gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Current Password
                  </span>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? 'text' : 'password'}
                      value={currentPasswordInput}
                      onChange={(e) => setCurrentPasswordInput(e.target.value)}
                      disabled={!currentPortalUsername}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw((v) => !v)}
                      tabIndex={-1}
                      aria-label={showCurrentPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    >
                      {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      New Password
                    </span>
                    <div className="relative">
                      <input
                        type={showNewPw ? 'text' : 'password'}
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        disabled={!currentPortalUsername}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw((v) => !v)}
                        tabIndex={-1}
                        aria-label={showNewPw ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      >
                        {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Confirm New Password
                    </span>
                    <div className="relative">
                      <input
                        type={showConfirmNewPw ? 'text' : 'password'}
                        value={confirmPasswordInput}
                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
                        disabled={!currentPortalUsername}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewPw((v) => !v)}
                        tabIndex={-1}
                        aria-label={showConfirmNewPw ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      >
                        {showConfirmNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>
                </div>
              </div>

              {passwordMessage && (
                <p
                  className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                    passwordMessage.kind === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {passwordMessage.text}
                </p>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSavePassword}
                  disabled={
                    !currentPortalUsername ||
                    !currentPasswordInput ||
                    !newPasswordInput ||
                    !confirmPasswordInput
                  }
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  Save Password
                </button>
              </div>
            </section>
          </div>
        )}
        {activeTab === 'ipcr-workspace' && isOfficeAccount && (
          <OfficeAccountLockedNote section="My IPCR Workspace" />
        )}

        {activeTab === 'ipcr-workspace' && !isOfficeAccount && (
          <div className="space-y-6 animate-fade-in" style={{ fontFamily: "'Poppins', sans-serif" }}>
            {/* Subtabs selector */}
            <div className="flex border-b border-slate-200 bg-white rounded-xl p-2 shadow-sm gap-2">
              <button
                onClick={() => setIpcrSubtab('phase1')}
                className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                  ipcrSubtab === 'phase1' ? 'bg-[#363EE8] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Phase 1: Target Setting
              </button>
              <button
                onClick={() => setIpcrSubtab('phase2')}
                className={`px-4 py-2 text-xs font-bold rounded-md transition flex items-center gap-1.5 ${
                  ipcrSubtab === 'phase2' ? 'bg-[#363EE8] text-white shadow-sm' : 'text-slate-650 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Phase 2: Accomplishments &amp; Ratings
                {isAccomplishmentRatingActive && (
                  <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                    ipcrSubtab === 'phase2' ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    Open
                  </span>
                )}
              </button>
            </div>

            {/* Account-not-linked warning: without a Supabase employees row we
                cannot key the workspace, so saves would silently no-op. */}
            {!currentUser.supabaseId && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs font-semibold">
                ⚠️ Your account isn’t linked to an employee record in the database, so your IPCR can’t be saved yet.
                Please ask your PM / administrator to link your account (Supabase <span className="font-mono">employees</span> row) before filling this out.
              </div>
            )}
            {/* Inline feedback for the workspace (Phase 1 + Phase 2 handlers). */}
            {ipcrError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs font-semibold">
                {ipcrError}
              </div>
            )}
            {saveSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg p-3 text-xs font-semibold">
                {saveSuccess}
              </div>
            )}

            {/* Subtab content */}
            {ipcrSubtab === 'phase1' && (
              <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4" style={{ borderColor: '#C8D1FF' }}>
                {!isTargetSettingActive && probationarySchedule && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs font-semibold mb-4">
                    ⚠️ Target setting is currently closed. The scheduled period was from {new Date(probationarySchedule.target_start).toLocaleDateString()} to {new Date(probationarySchedule.target_end).toLocaleDateString()}.
                  </div>
                )}
                {!isTargetSettingActive && !probationarySchedule && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs font-semibold mb-4">
                    ⚠️ Phase 1 (Target Setting) is not yet open. The PM Division will notify you when it opens.
                  </div>
                )}
                
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Phase 1: Target Setting Phase</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Encode your targets for Core, Strategic, and Support Functions.</p>
                  </div>
                  <div>
                    {ipcrApproved ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-100">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Approved & Locked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-100">
                        <AlertCircle className="h-4 w-4 text-amber-600" /> {!isTargetSettingActive ? 'Closed' : 'Open for Editing'}
                      </span>
                    )}
                  </div>
                </div>

                {targetStatus === 'returned_for_revision' && targetReviewComment && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                    <p className="text-xs font-bold text-rose-800">Returned for revision</p>
                    <p className="mt-1 text-sm text-rose-700">{targetReviewComment}</p>
                  </div>
                )}

                <div className="space-y-6">
                  {([
                    { key: 'core', label: 'Core Functions', mfoPlaceholder: 'e.g. Payroll Management', siPlaceholder: 'e.g. Process payroll within 3 days of timesheet approval.' },
                    { key: 'strategic', label: 'Strategic Functions', mfoPlaceholder: 'e.g. Competency Development', siPlaceholder: 'e.g. Formulate training programs based on competency gaps.' },
                    { key: 'support', label: 'Support Functions', mfoPlaceholder: 'e.g. IT Helpdesk', siPlaceholder: 'e.g. Provide IT helpdesk assistance within 15 minutes.' },
                  ] as const).map((fn) => {
                    const rows = targetRows[fn.key];
                    const readOnly = targetsLocked || ipcrApproved || !isTargetSettingActive;
                    return (
                      <div key={fn.key} className="space-y-2">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          {readOnly && <Lock className="h-3.5 w-3.5 text-slate-400" />}
                          {fn.label}
                        </label>
                        <div className={`overflow-x-auto rounded-lg border ${readOnly ? 'opacity-60' : ''}`} style={{ borderColor: '#C8D1FF' }}>
                          <table className="w-full min-w-[640px] border-collapse text-sm">
                            <thead>
                              <tr className="bg-slate-50 text-left">
                                <th className="w-2/5 border-b px-3 py-2 text-xs font-bold text-slate-600" style={{ borderColor: '#C8D1FF' }}>MFO</th>
                                <th className="border-b px-3 py-2 text-xs font-bold text-slate-600" style={{ borderColor: '#C8D1FF' }}>Success Indicators (Targets + Measures)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((mfo, i) => (
                                <tr key={i} className="align-top">
                                  <td className="border-b px-3 py-2" style={{ borderColor: '#EEF0FD' }}>
                                    <div className="flex items-start gap-1.5">
                                      <input
                                        type="text"
                                        value={mfo.title}
                                        onChange={(e) => setMfoTitle(fn.key, i, e.target.value)}
                                        disabled={readOnly}
                                        placeholder={fn.mfoPlaceholder}
                                        style={{ borderColor: '#C8D1FF' }}
                                        className="w-full rounded-lg border px-2.5 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#363EE8] disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-default"
                                      />
                                      {!readOnly && (
                                        <button
                                          type="button"
                                          onClick={() => removeMfo(fn.key, i)}
                                          title="Delete this MFO"
                                          className="mt-1 shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  <td className="border-b px-3 py-2" style={{ borderColor: '#EEF0FD' }}>
                                    <div className="space-y-1.5">
                                      {mfo.indicators.map((si, j) => (
                                        <div key={j} className="flex items-start gap-1.5">
                                          <input
                                            type="text"
                                            value={si.description}
                                            onChange={(e) => setIndicator(fn.key, i, j, e.target.value)}
                                            disabled={readOnly}
                                            placeholder={fn.siPlaceholder}
                                            style={{ borderColor: '#C8D1FF' }}
                                            className="w-full rounded-lg border px-2.5 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#363EE8] disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-default"
                                          />
                                          {!readOnly && (
                                            <button
                                              type="button"
                                              onClick={() => removeIndicator(fn.key, i, j)}
                                              title="Delete this success indicator"
                                              className="mt-1 shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                      {!readOnly && (
                                        <button
                                          type="button"
                                          onClick={() => addIndicator(fn.key, i)}
                                          className="text-xs font-semibold text-[#363EE8] hover:underline"
                                        >
                                          + Add Success Indicator
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => addMfo(fn.key)}
                            className="text-xs font-semibold text-[#363EE8] hover:underline"
                          >
                            + Add MFO
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {deferredRefresh && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800 flex items-center gap-2 mt-4">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    <span>Remote changes detected — the page will refresh to sync data after you save your draft.</span>
                  </div>
                )}

                {/* Repeated next to the buttons on purpose. The banners at the
                    top of the workspace are far above the fold once the three
                    function tables are filled in, so a failed submit down here
                    looked like the button simply doing nothing. */}
                {!targetsLocked && !ipcrApproved && isTargetSettingActive && ipcrError && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                    {ipcrError}
                  </div>
                )}
                {!targetsLocked && !ipcrApproved && isTargetSettingActive && saveSuccess && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                    {saveSuccess}
                  </div>
                )}

                {!targetsLocked && !ipcrApproved && isTargetSettingActive && (
                  <div className="flex justify-end gap-2 pt-3">
                    <button
                      onClick={() => void handleSaveWorkspaceTargets(false)}
                      disabled={workspaceSaving}
                      className="border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg px-4 py-2 text-xs font-semibold transition disabled:opacity-50"
                    >
                      Save Draft
                    </button>
                    <button
                      onClick={() => void handleSaveWorkspaceTargets(true)}
                      disabled={workspaceSaving}
                      className="bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-xs font-semibold shadow transition disabled:opacity-50"
                    >
                      {workspaceSaving ? 'Submitting…' : 'Submit Targets for Approval'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {ipcrSubtab === 'phase2' && isAccomplishmentRatingActive && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <p className="text-xs font-semibold text-emerald-800">
                  Phase 2 (Accomplishment Rating) is now open. Please fill in your accomplishments
                  and self-ratings for each Success Indicator, then submit before the deadline.
                </p>
              </div>
            )}

            {ipcrSubtab === 'phase2' && (
              <EmployeePhase2 employeeId={currentUser.supabaseId ?? null} phaseOpen={isAccomplishmentRatingActive} />
            )}

            {/* Legacy per-group Phase 2 — superseded by EmployeePhase2 (per-indicator + gating). */}
            {false && ipcrSubtab === 'phase2' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Panel */}
                <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4" style={{ borderColor: '#C8D1FF' }}>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <Lock className="h-4 w-4 text-slate-400" />
                      Frozen Targets (Set 6 Months Ago)
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">Reference targets locked during Phase 1 database commit.</p>
                  </div>

                  <div className="space-y-4 divide-y divide-slate-100">
                    {([
                      { key: 'core', label: 'Core Functions' },
                      { key: 'strategic', label: 'Strategic Functions' },
                      { key: 'support', label: 'Support Functions' },
                    ] as const).map((fn) => {
                      const mfos = targetRows[fn.key].filter(
                        (m) => m.title.trim() || m.indicators.some((si) => si.description.trim()),
                      );
                      return (
                        <div key={fn.key} className="pt-3">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{fn.label}</p>
                          {mfos.length === 0 ? (
                            <p className="text-xs text-slate-400 mt-1 italic">No target configured.</p>
                          ) : (
                            <ul className="mt-1 space-y-2">
                              {mfos.map((m, i) => (
                                <li key={i}>
                                  <p className="text-xs font-bold text-slate-800">{m.title || '(untitled MFO)'}</p>
                                  {m.indicators.some((si) => si.description.trim()) && (
                                    <ul className="mt-0.5 list-disc pl-4 text-[11px] text-slate-600">
                                      {m.indicators
                                        .filter((si) => si.description.trim())
                                        .map((si, j) => (<li key={j}>{si.description}</li>))}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Panel */}
                <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4" style={{ borderColor: '#C8D1FF' }}>
                  {!isAccomplishmentRatingActive && workspaceRow?.status !== 'Completed' && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs font-semibold mb-2">
                      ⚠️ Accomplishment rating is currently closed{probationarySchedule
                        ? ` (scheduled ${new Date(probationarySchedule.accomplishment_start).toLocaleDateString()} – ${new Date(probationarySchedule.accomplishment_end).toLocaleDateString()})`
                        : ''}.
                    </div>
                  )}

                  {workspaceRow?.status === 'Completed' ? (
                    <div className="space-y-3">
                      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
                        <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">Final Overall Rating</p>
                        <p className="text-2xl font-extrabold text-emerald-800 mt-1">
                          {workspaceRow.overall_score != null ? Number(workspaceRow.overall_score).toFixed(2) : '—'}
                          {workspaceRow.adjectival ? <span className="text-sm font-semibold ml-2">{workspaceRow.adjectival}</span> : null}
                        </p>
                      </div>
                      {workspaceRow.pdf_url && (
                        <a
                          href={workspaceRow.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-xs font-semibold shadow transition"
                        >
                          <Download className="h-4 w-4" /> Download IPCR PDF
                        </a>
                      )}
                      <p className="text-[11px] text-slate-500">
                        Your IPCR has been submitted and recorded. It also appears under RSP Reports → Performance Evaluation Form.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">Accomplishments & Self-Ratings</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Encode achievements and rate each function on Quality (Q), Efficiency (E) &amp; Timeliness (T), 1–5. The Average (A) is computed automatically. Weights are optional — if set, the overall score is weight-blended; otherwise it is a simple average of the category averages.
                        </p>
                      </div>

                      <div className="space-y-4">
                        {[
                          { key: 'core', label: 'Core Functions' },
                          { key: 'strategic', label: 'Strategic Functions' },
                          { key: 'support', label: 'Support Functions' },
                        ].map((fn) => {
                          const k = fn.key as 'core' | 'strategic' | 'support';
                          const cr = selfRatings[k];
                          const avg = catAverage(cr);
                          const setField = (field: keyof CatRating, raw: string) =>
                            setSelfRatings((prev) => ({
                              ...prev,
                              [k]: { ...prev[k], [field]: raw ? parseFloat(raw) : null },
                            }));
                          return (
                            <div key={fn.key} className="space-y-2 border-b border-slate-100 pb-3">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold text-slate-700">{fn.label}</label>
                                <span className="text-[11px] font-semibold text-slate-500">
                                  Average (A):{' '}
                                  <span className="text-slate-800">{avg != null ? avg.toFixed(2) : '—'}</span>
                                </span>
                              </div>
                              <textarea
                                value={accomplishments[k]}
                                onChange={(e) => setAccomplishments((prev) => ({ ...prev, [k]: e.target.value }))}
                                placeholder="Detail your achievements matching this target..."
                                rows={3}
                                disabled={!isAccomplishmentRatingActive}
                                style={{ borderColor: '#C8D1FF' }}
                                className="w-full rounded-lg border px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#363EE8] disabled:bg-slate-50 disabled:cursor-not-allowed"
                              />
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {([
                                  { f: 'quality', label: 'Quality (Q)' },
                                  { f: 'efficiency', label: 'Efficiency (E)' },
                                  { f: 'timeliness', label: 'Timeliness (T)' },
                                ] as const).map((sub) => (
                                  <div key={sub.f}>
                                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">{sub.label}</label>
                                    <select
                                      value={cr[sub.f] ?? ''}
                                      onChange={(e) => setField(sub.f, e.target.value)}
                                      disabled={!isAccomplishmentRatingActive}
                                      style={{ borderColor: '#C8D1FF' }}
                                      className="w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8] disabled:bg-slate-50 disabled:cursor-not-allowed"
                                    >
                                      <option value="">—</option>
                                      <option value={5}>5</option>
                                      <option value={4}>4</option>
                                      <option value={3}>3</option>
                                      <option value={2}>2</option>
                                      <option value={1}>1</option>
                                    </select>
                                  </div>
                                ))}
                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Weight (%)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={cr.weight ?? ''}
                                    onChange={(e) => setField('weight', e.target.value)}
                                    disabled={!isAccomplishmentRatingActive}
                                    placeholder="—"
                                    style={{ borderColor: '#C8D1FF' }}
                                    className="w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8] disabled:bg-slate-50 disabled:cursor-not-allowed"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {(() => {
                          const totalW = (['core', 'strategic', 'support'] as const).reduce(
                            (s, k) => s + (selfRatings[k].weight ?? 0),
                            0,
                          );
                          return totalW > 0 ? (
                            <p className={`text-[11px] font-semibold ${totalW === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              Total weight: {totalW}%{totalW !== 100 ? ' — weights should total 100%.' : ''}
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-400">
                              No weights set — overall score will be a simple average of the category averages.
                            </p>
                          );
                        })()}

                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            onClick={() => void handleSubmitWorkspaceAccomplishments(false)}
                            disabled={!isAccomplishmentRatingActive || workspaceSaving}
                            className="border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg px-4 py-2 text-xs font-semibold transition disabled:opacity-50"
                          >
                            Save Draft
                          </button>
                          <button
                            onClick={() => void handleSubmitWorkspaceAccomplishments(true)}
                            disabled={!isAccomplishmentRatingActive || workspaceSaving}
                            className="bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-xs font-semibold shadow transition disabled:bg-slate-400 disabled:cursor-not-allowed"
                          >
                            {workspaceSaving ? 'Submitting…' : 'Submit Evaluation'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'new-entrants' && (
          <div className="space-y-6" style={{ fontFamily: "'Poppins', sans-serif" }}>
            {/* Subtab Navigation */}
            <div className="flex border-b border-slate-200 bg-white rounded-xl p-2 shadow-sm gap-2">
              <button
                onClick={() => setNewEntrantsSubtab('checklist')}
                className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                  newEntrantsSubtab === 'checklist' ? 'bg-[#363EE8] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-55'
                }`}
              >
                Orientation Checklist
              </button>
              <button
                onClick={() => setNewEntrantsSubtab('scheduler')}
                className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                  newEntrantsSubtab === 'scheduler' ? 'bg-[#363EE8] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-55'
                }`}
              >
                Probationary IPCR Scheduler
              </button>
            </div>

            {newEntrantsSubtab === 'checklist' && (
              <div className="rounded-xl border bg-white p-6 shadow-sm space-y-6" style={{ borderColor: '#C8D1FF' }}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Job Function Orientation Checklist</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Mandatory orientation checklist of duties. The probationary clock is paused until verified.</p>
                  </div>
                  <div>
                    {orientationVerified ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-100">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Clock Active (Checklist Verified)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-100">
                        <Clock className="h-4 w-4 text-amber-600 animate-spin" /> Clock Paused (Awaiting Orientation Verification)
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { id: 'duties', label: 'Orientation of Duties and Departmental Functions' },
                    { id: 'policies', label: 'Briefing on Civil Service and Agency HR Policies' },
                    { id: 'workflow', label: 'Office workflow briefing & Supervisor alignment' },
                    { id: 'setup', label: 'IT Account setups & Core system orientation' }
                  ].map(item => {
                    const isChecked = orientationChecked[item.id as 'duties' | 'policies' | 'workflow' | 'setup'];
                    return (
                      <label key={item.id} className="flex items-center gap-3 p-3 rounded-lg border bg-slate-50/50 cursor-pointer text-xs" style={{ borderColor: '#C8D1FF' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (orientationVerified) return;
                            setOrientationChecked(prev => ({ ...prev, [item.id]: e.target.checked }));
                          }}
                          disabled={orientationVerified}
                          className="rounded border-slate-350 h-4 w-4 text-[#363EE8]"
                        />
                        <span className={`font-semibold ${isChecked ? 'text-slate-800 line-through' : 'text-slate-600'}`}>
                          {item.label}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {!orientationVerified && (
                  <div className="flex justify-end pt-3">
                    <button
                      onClick={() => {
                        setOrientationVerified(true);
                        setSaveSuccess('Checklist verified. Probationary clock is now ACTIVE.');
                        setTimeout(() => setSaveSuccess(null), 4000);
                      }}
                      className="bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-xs font-semibold shadow transition"
                    >
                      Verify Checklist & Start Clock
                    </button>
                  </div>
                )}
              </div>
            )}

            {newEntrantsSubtab === 'scheduler' && (
              <div className="rounded-xl border bg-white p-6 shadow-sm space-y-6" style={{ borderColor: '#C8D1FF' }}>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Probationary IPCR Scheduler</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Calculated target setting and rating deadlines based on your exact onboarding date.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
                  <div className="border bg-slate-50/50 rounded-xl p-4 space-y-2" style={{ borderColor: '#C8D1FF' }}>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Phase 1: Target Setting Deadline</p>
                    <p className="text-lg font-bold text-slate-800">July 01, 2026</p>
                    <p className="text-xs text-slate-400">Within 30 days of onboarding</p>
                  </div>
                  <div className="border bg-slate-50/50 rounded-xl p-4 space-y-2" style={{ borderColor: '#C8D1FF' }}>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Phase 2: Mid-Period Review</p>
                    <p className="text-lg font-bold text-slate-800">September 01, 2026</p>
                    <p className="text-xs text-slate-400">3 months from onboarding</p>
                  </div>
                  <div className="border bg-slate-50/50 rounded-xl p-4 space-y-2" style={{ borderColor: '#C8D1FF' }}>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Phase 3: 6-Month Rating Due</p>
                    <p className="text-lg font-bold text-slate-800">December 01, 2026</p>
                    <p className="text-xs text-slate-400">Exact 6-month evaluation mark</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 text-xs text-blue-800 flex gap-3">
                  <Info className="h-5 w-5 shrink-0 text-blue-600" />
                  <div>
                    <p className="font-bold">Onboarding Reference Details</p>
                    <p className="mt-0.5">Onboarding Date: June 1, 2026. Deadlines are automatically dynamic and locked in the probationary scheduler track.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Account Setup Wizard ──────────────────────────────────────── */}
      {showSetupWizard && (() => {
        const STEPS = ['Contact Information', 'Emergency Contact', 'Government Identification'];
        const totalSteps = STEPS.length;

        // Steps 1 & 2 gate on wizardTryNext; Step 3 always shows red (persistent nudge).
        const redIf = (val: string, alwaysRed = false) => ({
          border: `1.5px solid ${(alwaysRed || wizardTryNext) && !val.trim() ? '#EF4444' : '#C8D1FF'}`,
          borderRadius: 8, padding: '0.6rem 0.85rem', fontSize: '0.9rem',
          outline: 'none', width: '100%', boxSizing: 'border-box' as const,
          color: '#040E6B', fontFamily: "'Poppins', sans-serif",
          background: (alwaysRed || wizardTryNext) && !val.trim() ? '#FFF5F5' : '#ffffff',
          transition: 'border-color 0.2s ease-in-out, background 0.2s ease-in-out',
        });

        const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#040E6B', marginBottom: '0.3rem' };
        const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 0 };
        const errMsg: React.CSSProperties = { fontSize: '0.72rem', color: '#EF4444', marginTop: '0.2rem', fontWeight: 600 };

        // Partial save helper for Step 3 (only saves filled fields)
        const saveStep3Partial = () => {
          const patch: Partial<Employee> = {};
          if (wGovt.sssNumber.trim()) patch.sssNumber = wGovt.sssNumber.trim();
          if (wGovt.philhealthNumber.trim()) patch.philhealthNumber = wGovt.philhealthNumber.trim();
          if (wGovt.pagibigNumber.trim()) patch.pagibigNumber = wGovt.pagibigNumber.trim();
          if (wGovt.tinNumber.trim()) patch.tinNumber = wGovt.tinNumber.trim();
          if (Object.keys(patch).length > 0) void persistProfilePatch(patch);
        };

        const handleNext = () => {
          setWizardTryNext(true);
          if (wizardStep === 1) {
            if (!wContact.email.trim() || !wContact.mobileNumber.trim() || !wContact.homeAddress.trim()) return;
            void persistProfilePatch({ email: wContact.email.trim(), mobileNumber: wContact.mobileNumber.trim(), homeAddress: wContact.homeAddress.trim() });
            setWizardStep(2); setWizardTryNext(false);
          } else if (wizardStep === 2) {
            if (!wEmergency.emergencyContactName.trim() || !wEmergency.emergencyRelationship.trim() || !wEmergency.emergencyContactNumber.trim()) return;
            void persistProfilePatch({ emergencyContactName: wEmergency.emergencyContactName.trim(), emergencyRelationship: wEmergency.emergencyRelationship.trim(), emergencyContactNumber: wEmergency.emergencyContactNumber.trim() });
            setWizardStep(3); setWizardTryNext(false);
          } else {
            // Step 3 — soft: save whatever is filled, close regardless of empty fields
            saveStep3Partial();
            setShowSetupWizard(false);
          }
        };

        const handleSkip = () => {
          // Explicit escape: save partial, close without showing validation red
          saveStep3Partial();
          setShowSetupWizard(false);
        };

        const StepColumn = ({ n }: { n: number }) => {
          const done = n < wizardStep;
          const active = n === wizardStep;
          const hasLeftLine = n > 1;
          const hasRightLine = n < totalSteps;
          // Left segment connects to previous step; filled if current step is reached
          const leftLineActive = wizardStep >= n;
          // Right segment connects to next step; filled if current step is completed
          const rightLineActive = wizardStep > n;

          return (
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* Left connector segment (runs from left edge to circle left boundary) */}
              {hasLeftLine && (
                <div
                  style={{
                    position: 'absolute',
                    top: 15,
                    left: 0,
                    right: 'calc(50% + 18px)',
                    height: 3,
                    background: leftLineActive ? '#C8D1FF' : 'rgba(255,255,255,0.25)',
                    borderRadius: '99px 0 0 99px',
                    transition: 'background 0.3s ease',
                  }}
                />
              )}

              {/* Right connector segment (runs from circle right boundary to right edge) */}
              {hasRightLine && (
                <div
                  style={{
                    position: 'absolute',
                    top: 15,
                    left: 'calc(50% + 18px)',
                    right: 0,
                    height: 3,
                    background: rightLineActive ? '#C8D1FF' : 'rgba(255,255,255,0.25)',
                    borderRadius: '0 99px 99px 0',
                    transition: 'background 0.3s ease',
                  }}
                />
              )}

              {/* Step Circle */}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  background: done ? '#4ADE80' : active ? '#363EE8' : 'rgba(255,255,255,0.2)',
                  color: '#ffffff',
                  border: done ? 'none' : active ? '2px solid #ffffff' : '2px solid rgba(255,255,255,0.4)',
                  boxShadow: active ? '0 0 0 3px rgba(255,255,255,0.25)' : 'none',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  zIndex: 2,
                }}
              >
                {done ? '✓' : n}
              </div>

              {/* Step Label */}
              <span
                style={{
                  fontSize: '0.65rem',
                  color: active ? '#ffffff' : '#C8D1FF',
                  fontWeight: active ? 700 : 500,
                  textAlign: 'center',
                  marginTop: '0.35rem',
                  lineHeight: 1.2,
                  padding: '0 4px',
                }}
              >
                {STEPS[n - 1]}
              </span>
            </div>
          );
        };

        return (
          <>
            <style>{`
              @keyframes wizardEnter { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
              @keyframes stepFade { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }
              .wizard-panel { animation: wizardEnter 0.25s ease both; }
              .wizard-step-body { animation: stepFade 0.2s ease both; }
            `}</style>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,14,107,0.6)', padding: '1rem', fontFamily: "'Poppins', sans-serif" }}
              onClick={e => { if (e.target === e.currentTarget) setShowSetupWizard(false); }}
            >
              <div className="wizard-panel" style={{ background: '#ffffff', borderRadius: 20, boxShadow: '0 28px 80px rgba(54,62,232,0.28)', width: '100%', maxWidth: 520, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg, #5B65F0 0%, #363EE8 100%)', padding: '1.25rem 1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.72rem', color: '#C8D1FF', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Step {wizardStep} of {totalSteps}</p>
                      <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#ffffff' }}>{STEPS[wizardStep - 1]}</h2>
                    </div>
                    <button type="button" onClick={() => setShowSetupWizard(false)} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', color: '#ffffff', padding: '0.3rem', display: 'flex' }}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                    {[1, 2, 3].map(n => <StepColumn key={n} n={n} />)}
                  </div>
                </div>

                {/* Body — key re-mounts on step change to trigger slide-in animation */}
                <div key={wizardStep} className="wizard-step-body" style={{ padding: '1.5rem', overflowY: 'auto' }}>
                  {wizardStep === 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#5B65F0' }}>Enter your contact details for official communication.</p>
                      <div style={fieldWrap}>
                        <label style={labelStyle}>Email Address *</label>
                        <input type="email" placeholder="your@email.com" value={wContact.email} onChange={e => setWContact(p => ({ ...p, email: e.target.value }))} style={redIf(wContact.email)} />
                        {wizardTryNext && !wContact.email.trim() && <span style={errMsg}>Email address is required.</span>}
                      </div>
                      <div style={fieldWrap}>
                        <label style={labelStyle}>Phone Number *</label>
                        <input type="tel" placeholder="09XXXXXXXXX" value={wContact.mobileNumber} onChange={e => setWContact(p => ({ ...p, mobileNumber: e.target.value }))} style={redIf(wContact.mobileNumber)} />
                        {wizardTryNext && !wContact.mobileNumber.trim() && <span style={errMsg}>Phone number is required.</span>}
                      </div>
                      <div style={fieldWrap}>
                        <label style={labelStyle}>Home Address *</label>
                        <input type="text" placeholder="Street, Barangay, City, Province" value={wContact.homeAddress} onChange={e => setWContact(p => ({ ...p, homeAddress: e.target.value }))} style={redIf(wContact.homeAddress)} />
                        {wizardTryNext && !wContact.homeAddress.trim() && <span style={errMsg}>Home address is required.</span>}
                      </div>
                    </div>
                  )}
                  {wizardStep === 2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#5B65F0' }}>Provide a contact person in case of emergency.</p>
                      <div style={fieldWrap}>
                        <label style={labelStyle}>Contact Person Name *</label>
                        <input type="text" placeholder="Full name" value={wEmergency.emergencyContactName} onChange={e => setWEmergency(p => ({ ...p, emergencyContactName: e.target.value }))} style={redIf(wEmergency.emergencyContactName)} />
                        {wizardTryNext && !wEmergency.emergencyContactName.trim() && <span style={errMsg}>Contact name is required.</span>}
                      </div>
                      <div style={fieldWrap}>
                        <label style={labelStyle}>Relationship *</label>
                        <input type="text" placeholder="e.g. Spouse, Parent, Sibling" value={wEmergency.emergencyRelationship} onChange={e => setWEmergency(p => ({ ...p, emergencyRelationship: e.target.value }))} style={redIf(wEmergency.emergencyRelationship)} />
                        {wizardTryNext && !wEmergency.emergencyRelationship.trim() && <span style={errMsg}>Relationship is required.</span>}
                      </div>
                      <div style={fieldWrap}>
                        <label style={labelStyle}>Phone Number *</label>
                        <input type="tel" placeholder="09XXXXXXXXX" value={wEmergency.emergencyContactNumber} onChange={e => setWEmergency(p => ({ ...p, emergencyContactNumber: e.target.value }))} style={redIf(wEmergency.emergencyContactNumber)} />
                        {wizardTryNext && !wEmergency.emergencyContactNumber.trim() && <span style={errMsg}>Phone number is required.</span>}
                      </div>
                    </div>
                  )}
                  {wizardStep === 3 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ background: '#FFF9E6', border: '1.5px solid #FCD34D', borderRadius: 10, padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#92400E', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                        <AlertCircle className="h-4 w-4 shrink-0" style={{ color: '#D97706', marginTop: 1 }} />
                        <span>Government IDs are required for payroll and benefits. You can skip for now, but please complete this section as soon as possible.</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {([
                          { label: 'SSS Number', field: 'sssNumber' as const, val: wGovt.sssNumber, ph: 'XX-XXXXXXX-X' },
                          { label: 'PhilHealth Number', field: 'philhealthNumber' as const, val: wGovt.philhealthNumber, ph: 'XX-XXXXXXXXX-X' },
                          { label: 'Pag-IBIG Number', field: 'pagibigNumber' as const, val: wGovt.pagibigNumber, ph: 'XXXX-XXXX-XXXX' },
                          { label: 'TIN Number', field: 'tinNumber' as const, val: wGovt.tinNumber, ph: 'XXX-XXX-XXX' },
                        ] as const).map(({ label, field, val, ph }) => (
                          <div key={field} style={fieldWrap}>
                            <label style={labelStyle}>{label} *</label>
                            <input type="text" placeholder={ph} value={val} onChange={e => setWGovt(p => ({ ...p, [field]: e.target.value }))} style={redIf(val, true)} />
                            {!val.trim() && <span style={errMsg}>Required.</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div style={{ padding: '1rem 1.5rem', borderTop: '1.5px solid #EEF0FD', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => { if (wizardStep > 1) { setWizardStep((wizardStep - 1) as 1 | 2 | 3); setWizardTryNext(false); } else setShowSetupWizard(false); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', borderRadius: 8, border: '1.5px solid #C8D1FF', background: '#fff', padding: '0.6rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: '#040E6B', cursor: 'pointer' }}
                  >
                    {wizardStep > 1 ? '← Previous' : 'Remind me later'}
                  </button>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {wizardStep === 3 && (
                      <button
                        type="button"
                        onClick={handleSkip}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', borderRadius: 8, border: '1.5px solid #C8D1FF', background: '#fff', padding: '0.6rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: '#040E6B', cursor: 'pointer' }}
                      >
                        Skip for Now
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleNext}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)', padding: '0.6rem 1.25rem', fontSize: '0.9rem', fontWeight: 700, color: '#ffffff', cursor: 'pointer', boxShadow: '0 4px 14px rgba(54,62,232,0.3)' }}
                    >
                      {wizardStep < 3 ? 'Save & Continue →' : 'Save Changes ✓'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
};

export default EmployeePage;
