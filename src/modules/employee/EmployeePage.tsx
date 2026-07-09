import {
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
  Pencil,
  RefreshCw,
  Save,
  Upload,
  User,
  X,
  Plus,
  Trash2,
  AlertCircle,
  FileSpreadsheet,
  Check,
  Info,
  Download
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import abyanLogo from '../../assets/abyan-logo.png';
import { useLocation, useNavigate } from 'react-router-dom';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
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
  APPLICATION_DOC_TYPES,
  EMPLOYEE_DOCUMENTS_UPDATED_EVENT,
  dispatchEmployeeDocumentsUpdated,
  listEmployeeDocumentsForEmployee,
  uploadEmployeeDocument,
  type ApplicationDocumentType,
  type EmployeeDocumentRow,
  type RequestSource,
} from '../../lib/employeeDocuments';
import {
  getWorkspace,
  saveTargets,
  saveAccomplishments,
  attachPdfUrl,
  type IpcrWorkspaceRow,
} from '../../lib/api/ipcrWorkspace';
import { generateIpcrPdf } from '../../lib/ipcrPdf';
import { supabase as supabaseClient } from '../../lib/supabase';

/**
 * Whether a system-scope phase_schedules row is currently "open".
 * `Open`/`Closed` force it; `Auto` follows start_date..deadline_date.
 * A missing row means the PM hasn't configured it yet — don't block the employee.
 */
function isPhaseScheduleOpen(row: any | null): boolean {
  if (!row) return true;
  if (row.mode === 'Open') return true;
  if (row.mode === 'Closed') return false;
  const today = new Date().toISOString().slice(0, 10);
  if (!row.start_date || !row.deadline_date) return false;
  return today >= row.start_date && today <= row.deadline_date;
}

const SOURCE_BADGE_STYLES: Record<RequestSource, string> = {
  HR: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  PM: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
  LND: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
};

const SOURCE_BADGE_LABEL: Record<RequestSource, string> = {
  HR: 'HR',
  PM: 'PM',
  LND: 'L&D',
};

const resolveSource = (source: RequestSource | null | undefined): RequestSource =>
  source === 'PM' || source === 'LND' ? source : 'HR';
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

type PortalTab = 'personal' | 'documents' | 'submission' | 'account' | 'ipcr-workspace' | 'new-entrants';

interface TabConfig {
  id: PortalTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  count?: number;
}

interface RequirementItem {
  id: ApplicationDocumentType;
  title: string;
  description: string;
}

type EditableSection = 'personal' | 'contact' | 'emergency' | 'government' | null;

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

type PersonalDetailsDraft = {
  fullName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  gender: string;
  homeAddress: string;
};

interface EditableInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}

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

// Whole-day countdown to a due date. Negative => overdue.
const daysUntil = (dueDate: string | null | undefined): number | null => {
  if (!dueDate) return null;
  const due = new Date(`${String(dueDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
};

const dueLabel = (dueDate: string | null | undefined): string => {
  const days = daysUntil(dueDate);
  if (days === null) return '';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'due today';
  return `${days} day${days === 1 ? '' : 's'} left`;
};

const getPersonalDetailsDraft = (employee: Employee): PersonalDetailsDraft => ({
  fullName: employee.fullName || '',
  dateOfBirth: employee.dateOfBirth || '',
  placeOfBirth: employee.placeOfBirth || '',
  gender: employee.gender || '',
  homeAddress: employee.homeAddress || '',
});

const EditableInput: React.FC<EditableInputProps> = ({ label, value, onChange, type = 'text', disabled = false }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
    />
  </label>
);

export const EmployeePage: React.FC<EmployeePageProps> = ({ currentUser, loginUsername, onLogout }) => {
  const navigate = useNavigate();
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [hasOfficeRole, setHasOfficeRole] = useState(false);
  const location = useLocation();
  const [selectedFile, setSelectedFile] = useState<Record<string, File | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [employeeDocuments, setEmployeeDocuments] = useState<EmployeeDocumentRow[]>([]);
  const [previewDocument, setPreviewDocument] = useState<EmployeeDocumentRow | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const isTargetSettingActive = useMemo(() => {
    if (probationarySchedule) {
      const nowStr = new Date().toISOString().slice(0, 10);
      return nowStr >= probationarySchedule.target_start && nowStr <= probationarySchedule.target_end;
    }
    return isPhaseScheduleOpen(systemSchedules.target);
  }, [probationarySchedule, systemSchedules]);

  const isAccomplishmentRatingActive = useMemo(() => {
    if (probationarySchedule) {
      const nowStr = new Date().toISOString().slice(0, 10);
      return nowStr >= probationarySchedule.accomplishment_start && nowStr <= probationarySchedule.accomplishment_end;
    }
    return isPhaseScheduleOpen(systemSchedules.rating);
  }, [probationarySchedule, systemSchedules]);

  // Module 3 IPCR Workspace & New Entrants State
  const [ipcrSubtab, setIpcrSubtab] = useState<'phase1' | 'phase2'>('phase1');
  const [newEntrantsSubtab, setNewEntrantsSubtab] = useState<'checklist' | 'scheduler'>('checklist');
  const [employeeTargets, setEmployeeTargets] = useState({
    core: '',
    strategic: '',
    support: '',
  });
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

  const calculateRowAverage = (q: number | null, e: number | null, t: number | null): number => {
    const ratings = [q, e, t].filter((r): r is number => typeof r === 'number' && r !== null);
    if (ratings.length === 0) return 0;
    const sum = ratings.reduce((acc, val) => acc + val, 0);
    return Number((sum / ratings.length).toFixed(2));
  };

  const loadIPCRData = async () => {
    if (!currentUser.supabaseId) return;
    setIpcrLoading(true);
    setIpcrError(null);
    try {
      const rawDetailsRes = await getEmployeeRawDetails(currentUser.supabaseId);
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
        if (schedData) {
          activeProbationarySchedule = schedData;
        }
      }
      setProbationarySchedule(activeProbationarySchedule);

      const cycleRes = await getActivePerformanceCycle();
      let cycle = null;
      if (cycleRes.success && cycleRes.data) {
        cycle = cycleRes.data;
        setActiveCycle(cycle);
      }

      const compRes = await getCompetenciesList();
      if (compRes.success && compRes.data) {
        setCompetencies(compRes.data);
      }

      const ipcrRes = await getLatestEmployeeIPCR(
        currentUser.supabaseId,
        employeeNum,
        cycle ? cycle.id : null
      );
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
      if (evalsRes.success) {
        setEmployeeEvaluations(evalsRes.data);
      }

      // System-scope PM phase windows (gate regular, non-probationary employees).
      if (!activeProbationarySchedule) {
        const supabase = supabaseClient as any;
        const { data: schedRows } = await supabase
          .from('phase_schedules')
          .select('*')
          .eq('scope', 'system');
        const rows: any[] = Array.isArray(schedRows) ? schedRows : [];
        setSystemSchedules({
          target: rows.find((r) => r.phase === 'target_setting') ?? null,
          rating: rows.find((r) => r.phase === 'rating') ?? null,
        });
      } else {
        setSystemSchedules({ target: null, rating: null });
      }

      // Load the "My IPCR Workspace" row for this period and hydrate the form.
      const ws = await getWorkspace(currentUser.supabaseId, resolvedPeriod);
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
      } else {
        setEmployeeTargets({ core: '', strategic: '', support: '' });
        setAccomplishments({ core: '', strategic: '', support: '' });
        setSelfRatings({
          core: emptyCatRating(),
          strategic: emptyCatRating(),
          support: emptyCatRating(),
        });
        setIpcrApproved(false);
      }
    } catch (err) {
      console.error('Failed to load IPCR data:', err);
      setIpcrError('Failed to load IPCR performance data. Please try again.');
    } finally {
      setIpcrLoading(false);
    }
  };

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
    if (!currentUser.supabaseId) return;
    if (!ipcrRatingPeriod.trim()) {
      setIpcrError('No active rating period.');
      return;
    }
    if (
      submit &&
      !employeeTargets.core.trim() &&
      !employeeTargets.strategic.trim() &&
      !employeeTargets.support.trim()
    ) {
      setIpcrError('Enter at least one target before submitting.');
      return;
    }
    setWorkspaceSaving(true);
    setIpcrError(null);
    const res = await saveTargets({
      ...workspaceIdentity(),
      core: employeeTargets.core,
      strategic: employeeTargets.strategic,
      support: employeeTargets.support,
      submit,
    });
    setWorkspaceSaving(false);
    if (res.ok === false) {
      setIpcrError(res.error || 'Failed to save targets.');
      return;
    }
    setWorkspaceRow(res.row);
    setIpcrApproved(res.row.status !== 'Draft Targets');
    setSaveSuccess(submit ? 'Targets submitted to your Office Account for approval.' : 'Targets saved as draft.');
    setTimeout(() => setSaveSuccess(null), 4000);
  };

  const handleSubmitWorkspaceAccomplishments = async (submit: boolean) => {
    if (!currentUser.supabaseId) return;
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
  const [profile, setProfile] = useState<Employee>(currentUser);
  const [editingSection, setEditingSection] = useState<EditableSection>(null);
  const [contactDraft, setContactDraft] = useState<ContactDraft>(getContactDraft(currentUser));
  const [emergencyDraft, setEmergencyDraft] = useState<EmergencyDraft>(getEmergencyDraft(currentUser));
  const [governmentDraft, setGovernmentDraft] = useState<GovernmentDraft>(getGovernmentDraft(currentUser));
  const [personalDraft, setPersonalDraft] = useState<PersonalDetailsDraft>(getPersonalDetailsDraft(currentUser));

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
    setContactDraft(getContactDraft(currentUser));
    setEmergencyDraft(getEmergencyDraft(currentUser));
    setGovernmentDraft(getGovernmentDraft(currentUser));
    setPersonalDraft(getPersonalDetailsDraft(currentUser));
    setEditingSection(null);
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
        setContactDraft(getContactDraft(live));
        setEmergencyDraft(getEmergencyDraft(live));
        setGovernmentDraft(getGovernmentDraft(live));
        setPersonalDraft(getPersonalDetailsDraft(live));
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

  // HR-created document requests drive the Submission Bin tab.
  const hrRequests = useMemo(
    () => employeeDocuments.filter((d) => d.category === 'hr_request'),
    [employeeDocuments],
  );

  const pendingRequests = useMemo(
    () => hrRequests.filter((d) => d.status === 'Pending' || d.status === 'Rejected'),
    [hrRequests],
  );

  const submittedRequests = useMemo(
    () => hrRequests.filter((d) => d.status === 'Submitted' || d.status === 'Approved'),
    [hrRequests],
  );

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
        { id: 'personal', label: 'Personal Information', icon: User, route: '/employee/profile' },
        { id: 'documents', label: 'Document Requirements', icon: FileText, route: '/employee/documents/requirements' },
        {
          id: 'submission',
          label: 'Submission Bin',
          icon: Bell,
          route: '/employee/documents/submission',
          count: (pendingRequests.length + incompleteSetupCount) || undefined,
        },
        { id: 'ipcr-workspace', label: 'My IPCR Workspace', icon: FileSpreadsheet, route: '/employee/ipcr-workspace' },
        { id: 'account', label: 'Account & Security', icon: Lock, route: '/employee/account' },
      ];
      // Show new entrants track only for probationary/new hires
      if (profile.employmentStatus === 'Probationary') {
        baseTabs.splice(4, 0, { id: 'new-entrants', label: 'New Entrants Track', icon: Calendar, route: '/employee/new-entrants' });
      }
      return baseTabs;
    },
    [pendingRequests.length, incompleteSetupCount, profile.employmentStatus]
  );

  const activeTab = useMemo<PortalTab>(() => {
    if (location.pathname.includes('/documents/requirements')) return 'documents';
    if (location.pathname.includes('/documents/submission')) return 'submission';
    if (location.pathname.includes('/ipcr-workspace')) return 'ipcr-workspace';
    if (location.pathname.includes('/new-entrants')) return 'new-entrants';
    if (location.pathname.includes('/account')) return 'account';
    if (location.pathname.includes('/profile')) return 'personal';
    return 'personal';
  }, [location.pathname]);

  useEffect(() => {
    if (activeTab === 'submission') {
      void loadIPCRData();
    }
  }, [activeTab, currentUser?.supabaseId]);

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

  const requirementItems: RequirementItem[] = useMemo(
    () =>
      APPLICATION_DOC_TYPES.map((type) => ({
        id: type.id,
        title: type.label,
        description: type.description,
      })),
    [],
  );

  // Index of the most-recent application-document submission per type, so the
  // Document Requirements tab can show "Uploaded" / "Replace" without
  // re-rendering the whole list.
  const latestByType = useMemo(() => {
    const map = new Map<string, EmployeeDocumentRow>();
    for (const doc of employeeDocuments) {
      if (doc.category !== 'application') continue;
      const existing = map.get(doc.document_type);
      if (!existing || new Date(doc.uploaded_at) > new Date(existing.uploaded_at)) {
        map.set(doc.document_type, doc);
      }
    }
    return map;
  }, [employeeDocuments]);

  const refreshEmployeeDocuments = async () => {
    // Prefer the internal Supabase UUID (resolves the UUID FK correctly).
    // Fall back to the text employeeId for demo accounts without a DB row.
    const idToUse = currentUser.supabaseId ?? currentUser.employeeId;
    if (!idToUse && !currentUser?.email) return;
    const rows = await listEmployeeDocumentsForEmployee(
      idToUse,
      currentUser.email,
    );
    setEmployeeDocuments(rows);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshEmployeeDocuments();
      await loadIPCRData();
    } catch (err) {
      console.error('Failed to refresh employee documents:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void refreshEmployeeDocuments();
    const handler = () => { void refreshEmployeeDocuments(); };
    window.addEventListener(EMPLOYEE_DOCUMENTS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(EMPLOYEE_DOCUMENTS_UPDATED_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.employeeId]);

  const handleTabSelect = (tab: TabConfig) => {
    navigate(tab.route);
  };

  const handleFileSelect = (id: string, file: File | null) => {
    setSelectedFile((prev) => ({ ...prev, [id]: file }));
  };

  const handleUpload = async (id: ApplicationDocumentType) => {
    const file = selectedFile[id];
    if (!file) {
      setUploadError('Please choose a file before clicking Upload.');
      setUploadSuccess(null);
      return;
    }

    setUploadingId(id);
    setUploadError(null);
    setUploadSuccess(null);

    const result = await uploadEmployeeDocument({
      employeeId: currentUser.employeeId,
      email: currentUser.email,
      documentType: id,
      file,
      category: 'application',
    });

    setUploadingId(null);

    if (result.success === false) {
      setUploadError(result.error);
      return;
    }

    setSelectedFile((prev) => ({ ...prev, [id]: null }));
    setUploadSuccess(`Uploaded "${file.name}" for ${id}.`);
    await refreshEmployeeDocuments();
    dispatchEmployeeDocumentsUpdated();
  };

  // Submission Bin: attach a file to an HR-created request (status -> 'Submitted').
  const handleRequestUpload = async (request: EmployeeDocumentRow, file: File | null) => {
    if (!file) return;

    setUploadingId(request.id);
    setUploadError(null);
    setUploadSuccess(null);

    const result = await uploadEmployeeDocument({
      employeeId: currentUser.employeeId,
      email: currentUser.email,
      documentType: request.document_type,
      file,
      category: 'hr_request',
      requestId: request.id,
    });

    setUploadingId(null);

    if (result.success === false) {
      setUploadError(result.error);
      return;
    }

    setUploadSuccess(`Submitted "${file.name}" for ${request.document_name}.`);
    await refreshEmployeeDocuments();
    dispatchEmployeeDocumentsUpdated();
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

  const startEditing = (section: Exclude<EditableSection, null>) => {
    if (section === 'personal') {
      setPersonalDraft(getPersonalDetailsDraft(profile));
    }
    if (section === 'contact') {
      setContactDraft(getContactDraft(profile));
    }
    if (section === 'emergency') {
      setEmergencyDraft(getEmergencyDraft(profile));
    }
    if (section === 'government') {
      setGovernmentDraft(getGovernmentDraft(profile));
    }
    setEditingSection(section);
  };

  const cancelEditing = () => {
    setContactDraft(getContactDraft(profile));
    setEmergencyDraft(getEmergencyDraft(profile));
    setGovernmentDraft(getGovernmentDraft(profile));
    setPersonalDraft(getPersonalDetailsDraft(profile));
    setEditingSection(null);
  };

  const saveContactInfo = () => {
    void persistProfilePatch({
      email: contactDraft.email.trim(),
      mobileNumber: contactDraft.mobileNumber.trim(),
      homeAddress: contactDraft.homeAddress.trim(),
    });
    setEditingSection(null);
  };

  const saveEmergencyInfo = () => {
    void persistProfilePatch({
      emergencyContactName: emergencyDraft.emergencyContactName.trim(),
      emergencyRelationship: emergencyDraft.emergencyRelationship.trim(),
      emergencyContactNumber: emergencyDraft.emergencyContactNumber.trim(),
    });
    setEditingSection(null);
  };

  const saveGovernmentInfo = () => {
    void persistProfilePatch({
      sssNumber: governmentDraft.sssNumber.trim(),
      philhealthNumber: governmentDraft.philhealthNumber.trim(),
      pagibigNumber: governmentDraft.pagibigNumber.trim(),
      tinNumber: governmentDraft.tinNumber.trim(),
    });
    setEditingSection(null);
  };

  const savePersonalInfo = () => {
    const trimmedGender = personalDraft.gender.trim();
    const allowedGenders: Employee['gender'][] = ['Male', 'Female', 'Other', 'Prefer not to say'];
    const safeGender: Employee['gender'] = (allowedGenders as string[]).includes(trimmedGender)
      ? (trimmedGender as Employee['gender'])
      : 'Prefer not to say';

    void persistProfilePatch({
      fullName: personalDraft.fullName.trim(),
      dateOfBirth: personalDraft.dateOfBirth.trim(),
      placeOfBirth: personalDraft.placeOfBirth.trim(),
      gender: safeGender,
      homeAddress: personalDraft.homeAddress.trim(),
      personalDetailsFinalized: true, // Lock editing after first save
    });
    setEditingSection(null);
  };

  const FieldRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
    <div className="grid grid-cols-1 gap-1 py-2 md:grid-cols-[210px_1fr] md:gap-3">
      <div className="text-sm font-semibold" style={{ color: '#040E6B' }}>{label}:</div>
      <div className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: '#C8D1FF', background: '#F4F5FD', color: value?.trim() ? '#040E6B' : '#A5ACEE', fontStyle: value?.trim() ? 'normal' : 'italic' }}>
        {value?.trim() || 'Not provided'}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: '#F0F2FD', fontFamily: "'Poppins', sans-serif" }}>
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

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="hidden text-right sm:block">
                <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#ffffff' }}>Welcome, {currentUser.fullName}</p>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#C8D1FF' }}>Employee ID: {currentUser.employeeId}</p>
              </div>
              {hasOfficeRole && (
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
            <section className="rounded-xl border bg-white p-5" style={{ borderColor: '#C8D1FF' }}>
              <div className="mb-4">
                <h2 className="text-lg font-bold" style={{ color: '#363EE8' }}>Personal Information</h2>
              </div>
              <FieldRow label="Full Name" value={profile.fullName} />
              <FieldRow label="Employee ID" value={profile.employeeId} />
              <FieldRow label="Date of Birth" value={profile.dateOfBirth} />
              <FieldRow label="Place of Birth" value={profile.placeOfBirth || '--'} />
              <FieldRow label="Gender" value={profile.gender || '--'} />
              <FieldRow label="Address" value={profile.homeAddress} />
              <FieldRow label="Position" value="Employee" />
              <FieldRow label="Department" value="Health Office" />
            </section>

            {/* Contact, Emergency, Gov ID — read-only in Personal Info; editable in Submission Bin */}
            {[
              {
                title: 'Contact Information',
                note: 'Manage your contact details in the Submission Bin.',
                fields: [
                  { label: 'Email Address', value: profile.email },
                  { label: 'Phone Number', value: profile.mobileNumber },
                  { label: 'Home Address', value: profile.homeAddress },
                ],
              },
              {
                title: 'Emergency Contact',
                note: 'Manage your emergency contact in the Submission Bin.',
                fields: [
                  { label: 'Contact Name', value: profile.emergencyContactName },
                  { label: 'Relationship', value: profile.emergencyRelationship },
                  { label: 'Phone Number', value: profile.emergencyContactNumber },
                ],
              },
              {
                title: 'Government Identification',
                note: 'Manage your government IDs in the Submission Bin.',
                fields: [
                  { label: 'SSS Number', value: profile.sssNumber },
                  { label: 'PhilHealth Number', value: profile.philhealthNumber },
                  { label: 'Pag-IBIG Number', value: profile.pagibigNumber },
                  { label: 'TIN Number', value: profile.tinNumber },
                ],
              },
            ].map((section) => (
              <section key={section.title} className="rounded-xl border bg-white p-5" style={{ borderColor: '#C8D1FF' }}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold" style={{ color: '#363EE8' }}>{section.title}</h2>
                    <p className="text-sm" style={{ color: '#040E6B', opacity: 0.65 }}>{section.note}</p>
                  </div>
                </div>
                {section.fields.map(f => <FieldRow key={f.label} label={f.label} value={f.value ?? ''} />)}
              </section>
            ))}
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800">
              Manage your original application documents. You can upload or update the required documents below.
            </div>

            {uploadError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {uploadError}
              </p>
            )}

            {uploadSuccess && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {uploadSuccess}
              </p>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold text-slate-900">Requirements Upload Bin</h2>
              <p className="mt-1 text-sm text-slate-500">
                Upload or update the documents. Only the document types listed below are allowed.
              </p>

              <div className="mt-5 space-y-4">
                {requirementItems.map((item) => {
                  const latest = latestByType.get(item.id);
                  const pickedFile = selectedFile[item.id] ?? null;
                  const isUploading = uploadingId === item.id;

                  return (
                    <article
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-white px-5 py-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 shrink-0 text-indigo-500" />
                            <h3 className="font-semibold text-slate-900">{item.title}</h3>
                          </div>

                          {latest ? (
                            <div className="mt-2 space-y-1 pl-7 text-sm text-slate-500">
                              <p className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-slate-400" />
                                {latest.file_name}
                              </p>
                              <p className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-slate-400" />
                                Uploaded: {formatPortalDate(latest.uploaded_at)}
                              </p>
                            </div>
                          ) : (
                            <p className="mt-2 pl-7 text-sm text-slate-400">No file uploaded yet</p>
                          )}

                          {pickedFile && (
                            <p className="mt-2 pl-7 text-xs text-indigo-600">
                              Selected: {pickedFile.name} ({Math.round(pickedFile.size / 1024)} KB)
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {latest && (
                            <button
                              type="button"
                              onClick={() => setPreviewDocument(latest)}
                              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                            >
                              <Eye className="h-4 w-4" />
                              Preview
                            </button>
                          )}

                          {pickedFile ? (
                            <button
                              type="button"
                              onClick={() => handleUpload(item.id)}
                              disabled={isUploading}
                              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                              <Upload className="h-4 w-4" />
                              {isUploading ? 'Uploading…' : 'Confirm Upload'}
                            </button>
                          ) : (
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => handleFileSelect(item.id, e.target.files?.[0] ?? null)}
                              />
                              <Upload className="h-4 w-4" />
                              {latest ? 'Replace' : 'Upload'}
                            </label>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <span className="font-semibold">Note:</span> Accepted file formats: PDF, DOC, DOCX, JPG, PNG.
                Maximum file size: 10MB. You can replace an uploaded document at any time — please ensure you
                upload the correct file.
              </div>
            </section>
          </div>
        )}

        {activeTab === 'submission' && (
          <div className="space-y-4">

            {/* ── Profile Completion Card ───────────────────────────────── */}
            {(() => {
              const R = 54;
              const circ = 2 * Math.PI * R;
              const offset = circ * (1 - completionPercent / 100);
              const done = completionPercent === 100;
              return (
                <div style={{ background: 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)', borderRadius: 20, padding: '1.5rem 2rem', display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                  {/* Ring */}
                  <div style={{ position: 'relative', width: 128, height: 128, flexShrink: 0 }}>
                    <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="12" />
                      <circle
                        cx="64" cy="64" r={R} fill="none"
                        stroke={done ? '#4ADE80' : '#C8D1FF'}
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
                      {done ? 'Profile Complete!' : 'Complete your profile'}
                    </p>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#C8D1FF', lineHeight: 1.5 }}>
                      {done
                        ? 'All required information has been filled in.'
                        : `${incompleteSetupCount} field${incompleteSetupCount !== 1 ? 's' : ''} still missing — fill them in to finish setting up your account.`}
                    </p>
                    {!done && (
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
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── Contact Information Setup ─────────────────────────────── */}
            <section className="rounded-xl border bg-white p-5" style={{ borderColor: '#C8D1FF' }}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: '#363EE8' }}>Contact Information</h2>
                  <p className="text-sm" style={{ color: '#040E6B', opacity: 0.7 }}>Your contact details for official communication.</p>
                </div>
                {editingSection === 'contact' ? (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={cancelEditing} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', borderRadius: 7, border: '1.5px solid #C8D1FF', background: '#fff', padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 600, color: '#040E6B', cursor: 'pointer' }}>
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                    <button type="button" onClick={saveContactInfo} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', borderRadius: 7, border: 'none', background: '#363EE8', padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                      <Save className="h-3.5 w-3.5" /> Save
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => startEditing('contact')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderRadius: 7, border: '1.5px solid #C8D1FF', background: '#EEF0FD', padding: '0.3rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#363EE8', cursor: 'pointer' }}>
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
              </div>
              {editingSection === 'contact' ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <EditableInput label="Mobile Number" value={contactDraft.mobileNumber} onChange={(v) => setContactDraft((p) => ({ ...p, mobileNumber: v }))} />
                  <EditableInput label="Email Address" value={contactDraft.email} type="email" onChange={(v) => setContactDraft((p) => ({ ...p, email: v }))} />
                  <div className="md:col-span-2">
                    <EditableInput label="Home Address" value={contactDraft.homeAddress} onChange={(v) => setContactDraft((p) => ({ ...p, homeAddress: v }))} />
                  </div>
                </div>
              ) : (
                <>
                  <FieldRow label="Email Address" value={profile.email} />
                  <FieldRow label="Phone Number" value={profile.mobileNumber} />
                  <FieldRow label="Home Address" value={profile.homeAddress} />
                </>
              )}
            </section>

            {/* ── Emergency Contact Setup ───────────────────────────────── */}
            <section className="rounded-xl border bg-white p-5" style={{ borderColor: '#C8D1FF' }}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: '#363EE8' }}>Emergency Contact</h2>
                  <p className="text-sm" style={{ color: '#040E6B', opacity: 0.7 }}>Person to contact in case of emergency.</p>
                </div>
                {editingSection === 'emergency' ? (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={cancelEditing} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', borderRadius: 7, border: '1.5px solid #C8D1FF', background: '#fff', padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 600, color: '#040E6B', cursor: 'pointer' }}>
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                    <button type="button" onClick={saveEmergencyInfo} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', borderRadius: 7, border: 'none', background: '#363EE8', padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                      <Save className="h-3.5 w-3.5" /> Save
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => startEditing('emergency')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderRadius: 7, border: '1.5px solid #C8D1FF', background: '#EEF0FD', padding: '0.3rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#363EE8', cursor: 'pointer' }}>
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
              </div>
              {editingSection === 'emergency' ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <EditableInput label="Contact Person Name" value={emergencyDraft.emergencyContactName} onChange={(v) => setEmergencyDraft((p) => ({ ...p, emergencyContactName: v }))} />
                  <EditableInput label="Relationship" value={emergencyDraft.emergencyRelationship} onChange={(v) => setEmergencyDraft((p) => ({ ...p, emergencyRelationship: v }))} />
                  <EditableInput label="Contact Number" value={emergencyDraft.emergencyContactNumber} onChange={(v) => setEmergencyDraft((p) => ({ ...p, emergencyContactNumber: v }))} />
                </div>
              ) : (
                <>
                  <FieldRow label="Contact Name" value={profile.emergencyContactName} />
                  <FieldRow label="Relationship" value={profile.emergencyRelationship} />
                  <FieldRow label="Phone Number" value={profile.emergencyContactNumber} />
                </>
              )}
            </section>

            {/* ── Government Identification Setup ───────────────────────── */}
            <section className="rounded-xl border bg-white p-5" style={{ borderColor: '#C8D1FF' }}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: '#363EE8' }}>Government Identification</h2>
                  <p className="text-sm" style={{ color: '#040E6B', opacity: 0.7 }}>Your government membership and tax ID numbers.</p>
                </div>
                {editingSection === 'government' ? (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={cancelEditing} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', borderRadius: 7, border: '1.5px solid #C8D1FF', background: '#fff', padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 600, color: '#040E6B', cursor: 'pointer' }}>
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                    <button type="button" onClick={saveGovernmentInfo} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', borderRadius: 7, border: 'none', background: '#363EE8', padding: '0.3rem 0.7rem', fontSize: '0.78rem', fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                      <Save className="h-3.5 w-3.5" /> Save
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => startEditing('government')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderRadius: 7, border: '1.5px solid #C8D1FF', background: '#EEF0FD', padding: '0.3rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#363EE8', cursor: 'pointer' }}>
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
              </div>
              {editingSection === 'government' ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <EditableInput label="SSS Number" value={governmentDraft.sssNumber} onChange={(v) => setGovernmentDraft((p) => ({ ...p, sssNumber: v }))} />
                  <EditableInput label="PhilHealth Number" value={governmentDraft.philhealthNumber} onChange={(v) => setGovernmentDraft((p) => ({ ...p, philhealthNumber: v }))} />
                  <EditableInput label="Pag-IBIG Number" value={governmentDraft.pagibigNumber} onChange={(v) => setGovernmentDraft((p) => ({ ...p, pagibigNumber: v }))} />
                  <EditableInput label="TIN Number" value={governmentDraft.tinNumber} onChange={(v) => setGovernmentDraft((p) => ({ ...p, tinNumber: v }))} />
                </div>
              ) : (
                <>
                  <FieldRow label="SSS Number" value={profile.sssNumber} />
                  <FieldRow label="PhilHealth Number" value={profile.philhealthNumber} />
                  <FieldRow label="Pag-IBIG Number" value={profile.pagibigNumber} />
                  <FieldRow label="TIN Number" value={profile.tinNumber} />
                </>
              )}
            </section>

            {/* ── IPCR SUBMISSION BIN SECTION ─────────────────────────── */}
            {/* IPCR SUBMISSION BIN SECTION */}
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 mb-5 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                    Individual Performance Commitment and Review (IPCR)
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 font-medium">
                    {ipcrRatingPeriod
                      ? `Evaluation Period: ${ipcrRatingPeriod}`
                      : activeCycle
                        ? `Evaluation Period: ${activeCycle.title || activeCycle.period} (${formatPortalDate(activeCycle.start_date)} to ${formatPortalDate(activeCycle.end_date)})`
                        : 'No active performance evaluation cycle.'}
                  </p>
                </div>
                {!isEditingIPCR && (
                  <div className="flex items-center gap-2">
                    {(!ipcrEvaluation || ipcrEvaluation.status === 'Self Evaluation' || ipcrEvaluation.status === 'Rejected') ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (ipcrRows.length === 0) {
                            addIPCRRow();
                          }
                          setIsEditingIPCR(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                        {ipcrEvaluation ? 'Edit IPCR' : 'Create IPCR'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIpcrEvaluation(null);
                          setIpcrRows([]);
                          const now = new Date();
                          const year = now.getFullYear();
                          const month = now.getMonth();
                          const nextPeriod = month < 6 ? `July–December ${year}` : `January–June ${year + 1}`;
                          setIpcrRatingPeriod(nextPeriod);
                          addIPCRRow();
                          setIsEditingIPCR(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        New Period IPCR
                      </button>
                    )}
                  </div>
                )}
              </div>

              {ipcrError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{ipcrError}</span>
                </div>
              )}

              {ipcrSuccess && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{ipcrSuccess}</span>
                </div>
              )}

              {ipcrLoading ? (
                <div className="py-8 text-center text-slate-500 animate-pulse">
                  Loading IPCR details...
                </div>
              ) : isEditingIPCR ? (
                /* EDITING VIEW */
                <div className="space-y-6">
                   {/* Employee Metadata Info Card */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Employee Details</span>
                      <span className="font-semibold text-slate-800 block mt-1">{currentUser.fullName}</span>
                      <span className="text-slate-500 text-xs block">ID: {employeeRawDetails?.employee_number || currentUser.employeeId}</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Position & Department</span>
                      <span className="font-semibold text-slate-800 block mt-1">{employeeRawDetails?.position || currentUser.currentPosition || 'Employee'}</span>
                      <span className="text-slate-500 text-xs block">{employeeRawDetails?.department || 'Health Office'}</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Plantilla & Supervisor ID</span>
                      <span className="font-semibold text-slate-800 block mt-1">Plantilla: {employeeRawDetails?.plantilla_num || 'N/A'}</span>
                      <span className="text-slate-500 text-xs block">Supervisor ID: {employeeRawDetails?.reports_to || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Rating Period</span>
                      <input
                        type="text"
                        value={ipcrRatingPeriod}
                        onChange={(e) => setIpcrRatingPeriod(e.target.value)}
                        placeholder="e.g., January–June 2026"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 bg-white text-sm text-slate-800 font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Overall Score</span>
                        <span className="text-lg font-bold text-blue-600 block mt-1">
                          {ipcrRows.length > 0
                            ? (ipcrRows.map(r => r.ave_rating).filter(Boolean).reduce((a, b) => a + b, 0) / ipcrRows.map(r => r.ave_rating).filter(Boolean).length || 0).toFixed(2)
                            : '0.00'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Rejected Rejection Alert */}
                  {ipcrEvaluation?.status === 'Rejected' && ipcrEvaluation.rejection_reason && (
                    <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
                      <span className="font-bold block mb-1">Supervisor Rejection Reason:</span>
                      <p>{ipcrEvaluation.rejection_reason}</p>
                    </div>
                  )}

                  {/* MFO / IPCR Table */}
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider w-[130px]">Type</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider w-[240px]">MFO & Competency Map</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Success Indicators (Target)</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Accomplishments</th>
                          <th scope="col" className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider w-[180px]">Ratings (Q / E / T)</th>
                          <th scope="col" className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider w-[75px]">Ave</th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider w-[120px]">Remarks</th>
                          <th scope="col" className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider w-[50px]">Delete</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {ipcrRows.map((row, index) => (
                          <tr key={index} className="hover:bg-slate-50/50">
                            <td className="px-3 py-3 align-top">
                              <select
                                value={row.function_type}
                                onChange={(e) => updateRowField(index, 'function_type', e.target.value)}
                                className="w-full text-xs rounded-lg border border-slate-300 bg-white p-1.5 focus:border-blue-500 focus:outline-none"
                              >
                                <option value="CORE">CORE</option>
                                <option value="SUPPORT">SUPPORT</option>
                              </select>
                            </td>
                            <td className="px-3 py-3 align-top space-y-2">
                              {/* Mapped Competency Selector */}
                              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Select Mapped Competency</label>
                              <select
                                value={row.competency_id || ''}
                                onChange={(e) => updateRowField(index, 'competency_id', Number(e.target.value))}
                                className="w-full text-xs rounded-lg border border-slate-300 bg-white p-1.5 focus:border-blue-500 focus:outline-none"
                              >
                                <option value="" disabled>-- Select Competency --</option>
                                {competencies.map(c => (
                                  <option key={c.competency_id} value={c.competency_id}>
                                    {c.competency_standard}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <textarea
                                value={row.target_text}
                                onChange={(e) => updateRowField(index, 'target_text', e.target.value)}
                                placeholder="Enter Major Final Output, Success Indicators, and Target Measures..."
                                className="w-full text-xs rounded-lg border border-slate-300 bg-white p-1.5 focus:border-blue-500 focus:outline-none min-h-[70px] resize-y"
                              />
                            </td>
                            <td className="px-3 py-3 align-top">
                              <textarea
                                value={row.accomplishment_text}
                                onChange={(e) => updateRowField(index, 'accomplishment_text', e.target.value)}
                                placeholder="Enter Actual Accomplishments..."
                                className="w-full text-xs rounded-lg border border-slate-300 bg-white p-1.5 focus:border-blue-500 focus:outline-none min-h-[70px] resize-y"
                              />
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="flex gap-1 justify-center">
                                {/* Q */}
                                <div className="text-center">
                                  <span className="text-[10px] text-slate-500 font-semibold uppercase block mb-1">Q</span>
                                  <select
                                    value={row.q_rating !== null ? row.q_rating : ''}
                                    onChange={(e) => updateRowField(index, 'q_rating', e.target.value ? Number(e.target.value) : null)}
                                    className="text-xs rounded-md border border-slate-300 bg-white p-1 focus:outline-none focus:border-blue-500 w-[45px]"
                                  >
                                    <option value="">—</option>
                                    {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                </div>
                                {/* E */}
                                <div className="text-center">
                                  <span className="text-[10px] text-slate-500 font-semibold uppercase block mb-1">E</span>
                                  <select
                                    value={row.e_rating !== null ? row.e_rating : ''}
                                    onChange={(e) => updateRowField(index, 'e_rating', e.target.value ? Number(e.target.value) : null)}
                                    className="text-xs rounded-md border border-slate-300 bg-white p-1 focus:outline-none focus:border-blue-500 w-[45px]"
                                  >
                                    <option value="">—</option>
                                    {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                </div>
                                {/* T */}
                                <div className="text-center">
                                  <span className="text-[10px] text-slate-500 font-semibold uppercase block mb-1">T</span>
                                  <select
                                    value={row.t_rating !== null ? row.t_rating : ''}
                                    onChange={(e) => updateRowField(index, 't_rating', e.target.value ? Number(e.target.value) : null)}
                                    className="text-xs rounded-md border border-slate-300 bg-white p-1 focus:outline-none focus:border-blue-500 w-[45px]"
                                  >
                                    <option value="">—</option>
                                    {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center align-top pt-8">
                              <span className="text-xs font-bold text-slate-800">
                                {row.ave_rating ? row.ave_rating.toFixed(2) : '0.00'}
                              </span>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <input
                                type="text"
                                value={row.remarks}
                                onChange={(e) => updateRowField(index, 'remarks', e.target.value)}
                                placeholder="Remarks..."
                                className="w-full text-xs rounded-lg border border-slate-300 bg-white p-1.5 focus:border-blue-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-3 py-3 text-center align-top pt-6">
                              <button
                                type="button"
                                onClick={() => deleteIPCRRow(index)}
                                className="p-1 rounded-md text-red-500 hover:bg-red-50 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Table Actions & Scale Legend */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={addIPCRRow}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add MFO Row
                    </button>
                    <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-md p-2 max-w-lg">
                      <span className="font-bold">Rating Legend:</span> 5 - Outstanding (O), 4 - Very Satisfactory (VS), 3 - Satisfactory (S), 2 - Unsatisfactory (US), 1 - Poor (P)
                    </div>
                  </div>

                  {/* Form Submission Controls */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setIsEditingIPCR(false)}
                      disabled={ipcrSaving}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveIPCR('Self Evaluation')}
                      disabled={ipcrSaving}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors disabled:opacity-50"
                    >
                      {ipcrSaving ? 'Saving...' : 'Save Draft'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveIPCR('Supervisor Review')}
                      disabled={ipcrSaving}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                    >
                      {ipcrSaving ? 'Submitting...' : 'Submit to Supervisor'}
                    </button>
                  </div>
                </div>
              ) : (
                /* PREVIEW / READ-ONLY VIEW */
                <div className="space-y-5">
                  {!ipcrEvaluation ? (
                    /* EMPTY STATE */
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                      <FileSpreadsheet className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                      <h4 className="font-bold text-slate-700 text-sm">No IPCR Created Yet</h4>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                        Get started by defining your Major Final Outputs (MFOs), success indicators, and actual accomplishments for this evaluation cycle.
                      </p>
                    </div>
                  ) : (
                    /* SUMMARY STATE */
                    <div className="space-y-5">
                      {/* Period Selector Dropdown */}
                      {employeeEvaluations.length > 0 && (
                        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
                          <span className="font-semibold text-slate-700">Select Rating Period to View/Edit:</span>
                          <select
                            value={ipcrRatingPeriod}
                            onChange={(e) => {
                              const selectedVal = e.target.value;
                              const found = employeeEvaluations.find(ev => ev.period === selectedVal);
                              if (found) {
                                void loadIPCRPeriod(found.period, found.cycle_id);
                              }
                            }}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 bg-white font-semibold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                          >
                            {employeeEvaluations.map((ev) => (
                              <option key={ev.id} value={ev.period || ''}>
                                {ev.period || 'Unknown Period'} ({ev.status === 'Self Evaluation' ? 'Draft' : ev.status})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Summary Metrics Row */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm">
                        <div>
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">IPCR Status</span>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold mt-2 ${
                            ipcrEvaluation.status === 'Approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ipcrEvaluation.status === 'Supervisor Review'
                              ? 'bg-blue-100 text-blue-800'
                              : ipcrEvaluation.status === 'Rejected'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {ipcrEvaluation.status === 'Self Evaluation' ? 'Draft' : ipcrEvaluation.status}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Overall Score</span>
                          <span className="text-xl font-bold text-slate-800 block mt-1">
                            {ipcrEvaluation.final_score ? Number(ipcrEvaluation.final_score).toFixed(2) : '0.00'}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Submitted At</span>
                          <span className="font-semibold text-slate-800 block mt-1">
                            {ipcrEvaluation.submitted_at ? formatPortalDate(ipcrEvaluation.submitted_at) : 'Not Submitted'}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Approved At</span>
                          <span className="font-semibold text-slate-800 block mt-1">
                            {ipcrEvaluation.approved_at ? formatPortalDate(ipcrEvaluation.approved_at) : 'Not Approved'}
                          </span>
                        </div>
                      </div>

                      {/* Rejection alert */}
                      {ipcrEvaluation.status === 'Rejected' && ipcrEvaluation.rejection_reason && (
                        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
                          <span className="font-bold block mb-1">Supervisor Rejection Comments:</span>
                          <p>{ipcrEvaluation.rejection_reason}</p>
                        </div>
                      )}

                      {/* Committed MFO Table Collapsible/View */}
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Committed Performance Rows ({ipcrRows.length})</h3>
                        </div>
                        {ipcrRows.length === 0 ? (
                          <p className="p-4 text-xs text-slate-500 text-center">No rows recorded in this IPCR.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-[100px]">Type</th>
                                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-[200px]">Mapped Competency</th>
                                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Targets & Measures</th>
                                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Accomplishments</th>
                                  <th scope="col" className="px-4 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider w-[120px]">Q / E / T</th>
                                  <th scope="col" className="px-4 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wider w-[70px]">Ave</th>
                                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-[120px]">Remarks</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-slate-200 text-xs">
                                {ipcrRows.map((row, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-3 align-top font-semibold text-slate-600">{row.function_type}</td>
                                    <td className="px-4 py-3 align-top text-slate-700 font-medium">{row.mapped_competency_standard || '—'}</td>
                                    <td className="px-4 py-3 align-top whitespace-pre-line text-slate-700">{row.target_text}</td>
                                    <td className="px-4 py-3 align-top whitespace-pre-line text-slate-700">{row.accomplishment_text || '—'}</td>
                                    <td className="px-4 py-3 align-top text-center">
                                      <div className="flex justify-center gap-2">
                                        <span>{row.q_rating || '—'}</span>
                                        <span className="text-slate-300">/</span>
                                        <span>{row.e_rating || '—'}</span>
                                        <span className="text-slate-300">/</span>
                                        <span>{row.t_rating || '—'}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 align-top text-center font-bold text-slate-800">
                                      {row.ave_rating ? row.ave_rating.toFixed(2) : '0.00'}
                                    </td>
                                    <td className="px-4 py-3 align-top text-slate-600">{row.remarks || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {pendingRequests.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                HR has requested additional documents. Please review and submit the required documents by the due date.
              </div>
            )}

            {uploadError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {uploadError}
              </p>
            )}

            {uploadSuccess && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {uploadSuccess}
              </p>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Submission Bin</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    HR, PM, or L&amp;D may request additional documents from time to time. Upload the requested documents by the due date.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm self-start sm:self-auto"
                >
                  <RefreshCw className={`h-4 w-4 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {/* Pending Submissions */}
              <div className="mt-6 flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                <h3 className="font-semibold text-slate-900">
                  Pending Submissions ({pendingRequests.length})
                </h3>
              </div>

              <div className="mt-3 space-y-3">
                {pendingRequests.length === 0 && (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    No pending document requests.
                  </p>
                )}
                {pendingRequests.map((request) => {
                  const isUploading = uploadingId === request.id;
                  const days = daysUntil(request.due_date);
                  const overdue = days !== null && days < 0;
                  const source = resolveSource(request.request_source);

                  return (
                    <article
                      key={request.id}
                      className="rounded-xl border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50/60 px-5 py-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-slate-900">{request.document_name}</h4>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${SOURCE_BADGE_STYLES[source]}`}>
                              {SOURCE_BADGE_LABEL[source]}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              <Clock className="h-3 w-3" />
                              {request.status === 'Rejected' ? 'Needs Resubmission' : 'Pending'}
                            </span>
                          </div>
                          {request.description && (
                            <p className="mt-1 text-sm text-slate-600">{request.description}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
                            <span>
                              Requested by:{' '}
                              <span className="font-medium text-slate-700">
                                {request.requested_by || 'HR Department'}
                              </span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              Due: {formatPortalDate(request.due_date)}
                              {request.due_date && (
                                <span className={overdue ? 'font-semibold text-red-600' : 'font-semibold text-amber-700'}>
                                  {' '}({dueLabel(request.due_date)})
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                          <input
                            type="file"
                            className="hidden"
                            disabled={isUploading}
                            onChange={(e) => void handleRequestUpload(request, e.target.files?.[0] ?? null)}
                          />
                          <Upload className="h-4 w-4" />
                          {isUploading ? 'Uploading…' : 'Upload'}
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Submitted Documents */}
              <div className="mt-7 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h3 className="font-semibold text-slate-900">
                  Submitted Documents ({submittedRequests.length})
                </h3>
              </div>

              <div className="mt-3 space-y-3">
                {submittedRequests.length === 0 && (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    No submitted documents yet.
                  </p>
                )}
                {submittedRequests.map((request) => {
                  const isUploading = uploadingId === request.id;
                  const source = resolveSource(request.request_source);

                  return (
                    <article
                      key={request.id}
                      className="rounded-xl border border-emerald-200 border-l-4 border-l-emerald-400 bg-emerald-50/60 px-5 py-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-slate-900">{request.document_name}</h4>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${SOURCE_BADGE_STYLES[source]}`}>
                              {SOURCE_BADGE_LABEL[source]}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              {request.status === 'Approved' ? 'Approved' : 'Submitted'}
                            </span>
                          </div>
                          {request.description && (
                            <p className="mt-1 text-sm text-slate-600">{request.description}</p>
                          )}
                          {request.file_name && (
                            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                              <FileText className="h-4 w-4 text-slate-400" />
                              {request.file_name}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
                            <span>Submitted: {formatPortalDate(request.uploaded_at)}</span>
                            {request.due_date && <span>Due date: {formatPortalDate(request.due_date)}</span>}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 self-start">
                          {request.file_url && (
                            <button
                              type="button"
                              onClick={() => setPreviewDocument(request)}
                              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                            >
                              <Eye className="h-4 w-4" />
                              Preview
                            </button>
                          )}
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
                            <input
                              type="file"
                              className="hidden"
                              disabled={isUploading}
                              onChange={(e) => void handleRequestUpload(request, e.target.files?.[0] ?? null)}
                            />
                            <Upload className="h-4 w-4" />
                            {isUploading ? 'Uploading…' : 'Resubmit'}
                          </label>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <span className="font-semibold">Important:</span> Please submit all requested documents before
                the due date. Late submissions may affect your employment records. Contact HR if you need an
                extension or have questions about the requirements.
              </div>
            </section>
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
        {activeTab === 'ipcr-workspace' && (
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
                className={`px-4 py-2 text-xs font-bold rounded-md transition ${
                  ipcrSubtab === 'phase2' ? 'bg-[#363EE8] text-white shadow-sm' : 'text-slate-650 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Phase 2: Accomplishments & Ratings
              </button>
            </div>

            {/* Subtab content */}
            {ipcrSubtab === 'phase1' && (
              <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4" style={{ borderColor: '#C8D1FF' }}>
                {!isTargetSettingActive && probationarySchedule && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs font-semibold mb-4">
                    ⚠️ Target setting is currently closed. The scheduled period was from {new Date(probationarySchedule.target_start).toLocaleDateString()} to {new Date(probationarySchedule.target_end).toLocaleDateString()}.
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

                <div className="space-y-5">
                  {[
                    { key: 'core', label: 'Core Functions', placeholder: 'e.g. Process payroll within 3 days of timesheet approval.' },
                    { key: 'strategic', label: 'Strategic Functions', placeholder: 'e.g. Formulate training programs based on competency gaps.' },
                    { key: 'support', label: 'Support Functions', placeholder: 'e.g. Provide IT helpdesk assistance within 15 minutes.' }
                  ].map(fn => {
                    const val = employeeTargets[fn.key as 'core' | 'strategic' | 'support'];
                    return (
                      <div key={fn.key} className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">{fn.label}</label>
                        <textarea
                          value={val}
                          onChange={(e) => {
                            if (ipcrApproved || !isTargetSettingActive) return;
                            setEmployeeTargets(prev => ({ ...prev, [fn.key]: e.target.value }));
                          }}
                          disabled={ipcrApproved || !isTargetSettingActive}
                          placeholder={fn.placeholder}
                          rows={3}
                          style={{ borderColor: '#C8D1FF' }}
                          className="w-full rounded-lg border px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#363EE8] disabled:bg-slate-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    );
                  })}
                </div>

                {!ipcrApproved && isTargetSettingActive && (
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

            {ipcrSubtab === 'phase2' && (
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
                    <div className="pt-3">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Core Functions</p>
                      <p className="text-xs text-slate-700 mt-1 font-semibold">{employeeTargets.core || 'No target configured.'}</p>
                    </div>
                    <div className="pt-3">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Strategic Functions</p>
                      <p className="text-xs text-slate-700 mt-1 font-semibold">{employeeTargets.strategic || 'No target configured.'}</p>
                    </div>
                    <div className="pt-3">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Support Functions</p>
                      <p className="text-xs text-slate-700 mt-1 font-semibold">{employeeTargets.support || 'No target configured.'}</p>
                    </div>
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

        const StepCircle = ({ n }: { n: number }) => {
          const done = n < wizardStep;
          const active = n === wizardStep;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', background: done ? '#4ADE80' : active ? '#363EE8' : 'rgba(255,255,255,0.2)', color: '#ffffff', border: done || active ? 'none' : '2px solid rgba(255,255,255,0.4)', transition: 'all 0.3s' }}>
                {done ? '✓' : n}
              </div>
              <span style={{ fontSize: '0.65rem', color: active ? '#ffffff' : '#C8D1FF', fontWeight: active ? 700 : 500, whiteSpace: 'nowrap' }}>{STEPS[n - 1]}</span>
            </div>
          );
        };

        const barPct = ((wizardStep - 1) / (totalSteps - 1)) * 100;

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
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ position: 'absolute', top: 15, left: '10%', right: '10%', height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 99, zIndex: 0 }}>
                      <div style={{ width: `${barPct}%`, height: '100%', background: '#C8D1FF', borderRadius: 99, transition: 'width 0.4s ease' }} />
                    </div>
                    {[1, 2, 3].map(n => <StepCircle key={n} n={n} />)}
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

      <DocumentPreviewModal
        open={previewDocument !== null}
        fileUrl={previewDocument?.file_url ?? ''}
        fileName={previewDocument?.file_name ?? ''}
        fileType={previewDocument?.file_type ?? null}
        title={previewDocument ? previewDocument.document_type : ''}
        subtitle={
          previewDocument
            ? `${previewDocument.file_name} — uploaded ${new Date(previewDocument.uploaded_at).toLocaleDateString()} (${previewDocument.status})`
            : ''
        }
        onClose={() => setPreviewDocument(null)}
      />
    </div>
  );
};

export default EmployeePage;
