import { useEffect, useMemo, useState } from 'react';
import { AdminHeader } from './AdminHeader';
import { BackButton } from './BackButton';
import { ErrorBanner } from './ErrorBanner';
import { describeActionFailure } from '../lib/friendlyErrors';
import { ApplicantsTabBar } from './ApplicantsTabBar';
import { Sidebar } from './Sidebar';
import { useBackClosesView } from '../hooks/useHistoryBack';
import {
  ensureRecruitmentSeedData,
  getApplicants,
  getNewlyHiredFromSupabase,
  resolveDepartmentForPosition,
  saveApplicants,
} from '../lib/recruitmentData';
import type { PlantillaSlot } from '../types/recruitment.types';
import { reserveSlotForApplicant } from '../lib/plantillaSlots';
import { plantillaLabel } from '../lib/plantillaRules';
import { isTerminal, normalizeStatus, signingForfeitWarning } from '../lib/api/applicantStatus';
import {
  DEFAULT_SIGNING_INSTRUCTIONS,
  RESERVED_STATUS,
  SIGNING_WINDOW_DAYS,
  fetchHiringContext,
  fetchOtherOpenApplications,
  type OtherApplication,
} from '../lib/hiringFlow';
import { formatDisplayDate, localIsoDate } from '../lib/scheduleSelection';
import { supabase } from '../lib/supabase';
import { TableRefreshBar, TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';
import {
  buildEvaluationSnapshotMap,
  deriveEvaluationSnapshot,
  type EvaluationSnapshot,
} from '../lib/evaluationScores';
import { fetchApplicantScoreSummaries, isUuid } from '../lib/api/applicantScores';
import { fetchWrittenExamTotals } from '../lib/api/examTotalPoints';
import { TopScorerBadge, topScorerIds, topScorerRowClass } from './data-table';
import { convertExamScore, totalForPosition } from '../lib/examTotalPoints';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  ChevronRight,
  Lock,
  UserCheck,
  Users,
} from 'lucide-react';
import { Modal } from './modal';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';

type ApplicationTrack = 'original' | 'promotional';

interface HiringRow {
  id: string;
  fullName: string;
  email: string;
  position: string;
  department: string;
  /** Oral interview rating, kept for original applicants only. */
  interviewScore: number | null;
  /** Written exam raw score, separate from the assessment total. */
  examScore: number | null;
  /** Saved assessment total: five categories for promotions, three for originals. */
  assessmentScore: number | null;
  /** The score this applicant's rank is based on. */
  rankingScore: number | null;
  applicationType: ApplicationTrack;
  status: string;
  /** The one plantilla this application is for; null for legacy unlinked rows. */
  slot: PlantillaSlot | null;
  selectionRevokedAt: string | null;
}

interface LoadedApplicant {
  id: string;
  fullName: string;
  email: string;
  position: string;
  department: string;
  status: string;
  applicationType: ApplicationTrack;
  /** Non-UUID test/demo rows keep the older local-cache scoring path. */
  legacyId: boolean;
}

/** Statuses that close an application for good; they never return to this list. */
const isClosedApplicationStatus = (status: string): boolean => {
  if (isRejected(status)) return true;
  const normalized = normalizeStatus(status);
  return normalized !== null && isTerminal(normalized);
};

const applicationTrackOf = (value: unknown): ApplicationTrack => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized.includes('promot') ? 'promotional' : 'original';
};

// Disqualified, rejected and archived (Not Selected) applicants never surface
// here, regardless of scores.
const isRejected = (status: string) => {
  const s = status.toLowerCase().trim();
  return s.includes('not qualified') || s.includes('disqualif') || s.includes('reject') || s.includes('not selected');
};

const isReserved = (status: string) => status.toLowerCase().trim() === RESERVED_STATUS.toLowerCase();

/** One folder per plantilla: each plantilla is its own vacancy with one hire. */
const positionKeyOf = (row: Pick<HiringRow, 'position' | 'slot'>) =>
  row.slot ? `${row.position || 'No Position'} · ${plantillaLabel(row.slot)}` : row.position || 'No Position';

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
};

type SelectStep = 'loading' | 'notice' | 'confirm';

// Already chosen for the plantilla, or past it. These stay on the list even
// without a readable score: hiding somebody mid-flow would lose the selection
// the page exists to show. Plain "qualified" is not one of these — it only
// means they passed screening.
const SELECTED_STATUSES = ['recommended for hiring', 'accepted', 'for hiring', 'for contract signing', 'hired'];
const isPastSelection = (status: string) => {
  const s = String(status ?? '').toLowerCase().trim();
  return SELECTED_STATUSES.some(q => s.includes(q));
};

const CAT_SCORES_KEY = 'cictrix_category_scores';
const EXAM_SCORES_KEY = 'cictrix_exam_scores';

const oralRawToConvertedScore = (raw: number) => +Math.min(20, Math.max(0, (raw / 5) * 20)).toFixed(2);

const fmtScore = (v: number | null) => (v != null ? v.toFixed(2) : '—');

export const ForHiringPage = () => {
  const [rows, setRows]                         = useState<HiringRow[]>([]);
  const [loading, setLoading]                   = useState(true);
  // The applicant list failed to load; never shown as "No qualified applicants".
  const [loadError, setLoadError]               = useState<unknown>(null);
  const [selectedDept, setSelectedDept]         = useState<string | null>(null);
  // One plantilla takes one hire, so exactly one applicant is selected at a time.
  const [selectedId, setSelectedId]             = useState<string | null>(null);
  useBackClosesView(selectedDept !== null, () => { setSelectedDept(null); setSelectedPosition(null); setSelectedId(null); }, 'for-hiring-dept');
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  useBackClosesView(selectedPosition !== null, () => { setSelectedPosition(null); setSelectedId(null); }, 'for-hiring-position');

  // The select dialog: notice (other applications) → confirm (date, instructions).
  const [selectTarget, setSelectTarget]         = useState<HiringRow | null>(null);
  const [selectStep, setSelectStep]             = useState<SelectStep>('loading');
  const [otherApps, setOtherApps]               = useState<OtherApplication[]>([]);
  const [deadline, setDeadline]                 = useState('');
  const [instructions, setInstructions]         = useState(DEFAULT_SIGNING_INSTRUCTIONS);
  const [acknowledged, setAcknowledged]         = useState(false);
  const [reserving, setReserving]               = useState(false);
  const [selectError, setSelectError]           = useState<string | null>(null);
  // Written Exam total points per position; missing positions read as the default.
  const [examTotals, setExamTotals]             = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    void fetchWrittenExamTotals().then((result) => { if (!cancelled) setExamTotals(result.totals); });
    return () => { cancelled = true; };
  }, []);

  // Bumped by realtime so the loader below re-runs. The page used to watch
  // only `evaluations` plus two same-tab window events, so a status change or
  // a hire made anywhere else — another tab, another admin — left this list
  // showing the old ranking until it was reopened.
  const [reloadKey, setReloadKey] = useState(0);
  useRealtimeRefresh({
    channel: 'for-hiring-applicants',
    tables: ['applicants', 'evaluations', 'plantilla_slots', 'newly_hired'],
    onChange: () => setReloadKey(key => key + 1),
  });

  // ── Data loading ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        ensureRecruitmentSeedData();

        // Build job position -> department lookup from Supabase job postings
        const jobDeptMap = new Map<string, string>();
        try {
          const { data: jobData } = await (supabase as any).from('job_postings').select('*');
          if (Array.isArray(jobData)) {
            jobData.forEach((j: any) => {
              const titleKey = String(j.title || '').trim().toLowerCase();
              const deptName = String(j.department || j.office || '').trim();
              if (titleKey && deptName) jobDeptMap.set(titleKey, deptName);
            });
          }
        } catch { /* ignore */ }

        const isGenericCategory = (val: string) =>
          !val || ['operations', 'finance', 'human resources', 'unassigned', 'unassigned department'].includes(val.toLowerCase().trim());

        const resolveOffice = (pos: string, rawOffice?: string, rawDept?: string): string => {
          const o = String(rawOffice || '').trim();
          const d = String(rawDept || '').trim();
          const titleKey = String(pos || '').trim().toLowerCase();

          if (o && !isGenericCategory(o)) return o;
          if (d && !isGenericCategory(d)) return d;
          if (titleKey && jobDeptMap.has(titleKey)) return jobDeptMap.get(titleKey)!;
          if (o) return o;
          if (d) return d;
          return resolveDepartmentForPosition(pos) || 'Operations';
        };

        // Load evaluation snapshots. The merged map keeps browser-local
        // evaluations for non-UUID demos; real applicants use only rows read
        // from the evaluations table, keyed by their exact applicant UUID.
        let evalSnapshotMap = new Map<string, EvaluationSnapshot>();
        const persistedEvalSnapshots = new Map<string, EvaluationSnapshot>();
        try {
          const { data: evalData } = await (supabase as any).from('evaluations').select('*');
          if (Array.isArray(evalData)) {
            evalSnapshotMap = buildEvaluationSnapshotMap(evalData);
            evalData.forEach((row: any) => {
              const applicantId = String(row?.applicant_id ?? '').trim();
              if (!isUuid(applicantId)) return;
              const snapshot = deriveEvaluationSnapshot(row);
              if (!snapshot) return;
              const current = persistedEvalSnapshots.get(applicantId);
              if (!current || new Date(snapshot.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
                persistedEvalSnapshots.set(applicantId, snapshot);
              }
            });
          } else {
            evalSnapshotMap = buildEvaluationSnapshotMap([]);
          }
        } catch {
          evalSnapshotMap = buildEvaluationSnapshotMap([]);
        }

        // Local caches remain available only for non-UUID test/demo rows.
        let catScores: Record<string, any> = {};
        try {
          catScores = JSON.parse(localStorage.getItem(CAT_SCORES_KEY) ?? '{}');
        } catch { /* ignore */ }

        let examScores: Record<string, Record<string, string>> = {};
        try {
          examScores = JSON.parse(localStorage.getItem(EXAM_SCORES_KEY) ?? '{}');
        } catch { /* ignore */ }

        const resolveLegacyScores = (id: string, position: string) => {
          const savedCat = catScores[id];
          const snap = evalSnapshotMap.get(id);

          let examScore: number | null = null;
          if (savedCat?.writtenExam?.finalScore != null) {
            examScore = Number(savedCat.writtenExam.finalScore);
          } else if (savedCat?.writtenExam?.initialScore != null && savedCat.writtenExam.initialScore > 0) {
            examScore = Number(savedCat.writtenExam.initialScore);
          } else if (position && examScores[position]?.[id]) {
            examScore = Number(examScores[position][id]);
          } else if (typeof snap?.writtenExamRawScore === 'number') {
            examScore = snap.writtenExamRawScore;
          }

          let interviewScore: number | null = null;
          if (savedCat?.oralExam?.finalScore != null) {
            interviewScore = Number(savedCat.oralExam.finalScore);
          } else if (savedCat?.oralExam?.initialScore != null && savedCat.oralExam.initialScore > 0) {
            interviewScore = Number(savedCat.oralExam.initialScore);
          } else if (typeof snap?.oralRawScore === 'number') {
            interviewScore = snap.oralRawScore <= 5 ? oralRawToConvertedScore(snap.oralRawScore) : snap.oralRawScore;
          } else if (typeof snap?.score === 'number' && snap.score > 0) {
            interviewScore = snap.score;
          }

          return { interviewScore, examScore };
        };

        // A generated record closes only its own application UUID. Email is
        // shared by every application a person ever files, so it cannot decide
        // that a new promotion is already complete.
        const generatedApplicantIds = new Set<string>();
        try {
          const newlyHired = await getNewlyHiredFromSupabase();
          if (Array.isArray(newlyHired)) {
            newlyHired.forEach(nh => {
              if (nh.applicantId) generatedApplicantIds.add(String(nh.applicantId));
            });
          }
        } catch { /* the list still loads from the remaining sources */ }

        const remoteData: any[] = [];
        let applicantsError: unknown = null;
        try {
          const { data, error } = await (supabase as any)
            .from('applicants')
            // Only columns public.applicants has: naming a missing one makes
            // PostgREST reject the whole query. The row mapping below already
            // treats the scores as optional.
            .select('id,first_name,last_name,middle_name,email,position,office,status,application_type,deleted_at');
          if (error) throw error;
          if (Array.isArray(data)) remoteData.push(...data);
        } catch (error) {
          // Local rows still show, but the list may be incomplete: say so.
          console.error('[ForHiringPage] applicants failed to load:', error);
          applicantsError = error;
        }

        // Local rows are only a fallback for legacy/demo ids. Remote rows are
        // authoritative and can remove a stale local row by the same UUID.
        const candidates = new Map<string, LoadedApplicant>();

        getApplicants().forEach((a) => {
          const id = String(a.id);
          const status = String(a.status ?? '');
          if (isClosedApplicationStatus(status) || generatedApplicantIds.has(id)) return;

          const position = String((a as any).position ?? '');
          candidates.set(id, {
            id,
            fullName: [a.personalInfo.firstName, a.personalInfo.lastName].filter(Boolean).join(' ')
              || a.personalInfo.email?.split('@')[0] || '—',
            email: String(a.personalInfo.email ?? ''),
            position,
            department: resolveOffice(position, (a as any).office, (a as any).department),
            status,
            applicationType: applicationTrackOf((a as any).applicationType),
            legacyId: !isUuid(id),
          });
        });

        remoteData.forEach((r: any) => {
          const id = String(r.id);
          const status = String(r.status ?? '');
          if (r.deleted_at || isClosedApplicationStatus(status) || generatedApplicantIds.has(id)) {
            candidates.delete(id);
            return;
          }

          const fullName = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')
            || r.full_name || '';
          const position = String(r.position ?? '');
          candidates.set(id, {
            id,
            fullName: fullName || (r.email ? String(r.email).split('@')[0] : '—'),
            email: String(r.email ?? ''),
            position,
            department: resolveOffice(position, r.office, r.department),
            status,
            applicationType: applicationTrackOf(r.application_type),
            legacyId: !isUuid(id),
          });
        });

        // Durable summaries are keyed by the application UUID. A failed read
        // is reported below, never treated as an empty successful ranking.
        const summaryRes = await fetchApplicantScoreSummaries(
          Array.from(candidates.keys()).filter(isUuid),
        );
        const scoreSummaries = summaryRes.data;

        const mergedMap = new Map<string, HiringRow>();

        candidates.forEach((candidate) => {
          const summary = scoreSummaries.get(candidate.id);
          // A score row's appointment type is also evidence; it prevents a
          // promotion from falling back to an oral score.
          const applicationType = candidate.applicationType === 'promotional' || summary?.appointmentType === 'promotional'
            ? 'promotional'
            : 'original';

          let interviewScore: number | null = null;
          let examScore: number | null = null;
          let assessmentScore: number | null = null;

          if (candidate.legacyId) {
            const legacy = resolveLegacyScores(candidate.id, candidate.position);
            interviewScore = legacy.interviewScore;
            examScore = legacy.examScore;
          } else {
            examScore = summary?.writtenExamRawScore ?? null;
            // The total is only usable when the score row was saved for this
            // application's track: a three-category original total is not a
            // five-category promotional assessment.
            assessmentScore = summary?.appointmentType === applicationType
              ? summary.assessmentTotal
              : null;

            if (applicationType === 'original') {
              // Browser caches (cictrix_evaluations and the interviewer score
              // snapshot) are not durable for a real application UUID.
              const snap = persistedEvalSnapshots.get(candidate.id);
              if (typeof snap?.oralRawScore === 'number') {
                interviewScore = snap.oralRawScore <= 5
                  ? oralRawToConvertedScore(snap.oralRawScore)
                  : snap.oralRawScore;
              } else if (typeof snap?.score === 'number' && snap.score > 0) {
                interviewScore = snap.score;
              }
            }
          }

          // Promotions rank on the saved five-category total. Originals keep
          // their interview rating, falling back to the saved total.
          const rankingScore = applicationType === 'promotional'
            ? assessmentScore
            : interviewScore ?? assessmentScore;

          const hasCompleteScores = candidate.legacyId
            ? interviewScore != null && examScore != null
            : summary?.isFinalized === true && assessmentScore != null && examScore != null;

          // A reservation stays visible even when its scores are missing or
          // unreadable. Qualifying for the list alone is not enough to rank.
          if (!hasCompleteScores && !isPastSelection(candidate.status)) return;

          mergedMap.set(candidate.id, {
            id: candidate.id,
            fullName: candidate.fullName,
            email: candidate.email,
            position: candidate.position,
            department: candidate.department,
            interviewScore,
            examScore,
            assessmentScore,
            rankingScore,
            applicationType,
            status: candidate.status,
            slot: null,
            selectionRevokedAt: null,
          });
        });

        // Which plantilla each application is for, its reservation, and any
        // revoked selection.
        const context = await fetchHiringContext(Array.from(mergedMap.keys()));
        mergedMap.forEach((row, id) => {
          row.slot = context.slotByApplicant.get(id) ?? null;
          row.selectionRevokedAt = context.revokedAt.get(id) ?? null;
        });

        const all = Array.from(mergedMap.values())
          // A filled plantilla's hire happens on the Generate Employee
          // Credentials tab; nobody else can be selected for it.
          .filter(r => !r.slot || r.slot.status !== 'filled')
          .sort((a, b) =>
          (a.department || 'zzz').localeCompare(b.department || 'zzz') ||
          (a.position   || 'zzz').localeCompare(b.position   || 'zzz')
        );
        setRows(all);

        if (!context.ok) {
          setLoadError(context.error ?? new Error('Failed to load plantilla slots for applicants'));
        } else if (!summaryRes.ok) {
          setLoadError(summaryRes.error ?? new Error('Failed to load saved assessment scores'));
        } else {
          setLoadError(applicantsError);
        }
      } catch (error) {
        console.error('[ForHiringPage] load failed:', error);
        setLoadError(error);
      } finally {
        setLoading(false);
      }
    };
    void load();
    // Exam and category scores are still written to localStorage, which no
    // subscription can see, so these same-tab events stay.
    window.addEventListener('cictrix:applicants-updated', load);
    window.addEventListener('cictrix:category-scores-updated', load);
    return () => {
      window.removeEventListener('cictrix:applicants-updated', load);
      window.removeEventListener('cictrix:category-scores-updated', load);
    };
  }, [reloadKey]);

  // ── Department folder list ────────────────────────────────────────────────
  const rowsLoad = useTableLoading(loading, rows.length > 0);

  const departmentList = useMemo(() => {
    const map = new Map<string, { positions: Set<string>; count: number }>();
    rows.forEach(r => {
      const dept = r.department || 'No Department';
      if (!map.has(dept)) map.set(dept, { positions: new Set(), count: 0 });
      const entry = map.get(dept)!;
      entry.positions.add(positionKeyOf(r));
      entry.count++;
    });
    return Array.from(map.entries())
      .map(([dept, { positions, count }]) => ({
        dept,
        positionCount:  positions.size,
        applicantCount: count,
      }))
      .sort((a, b) => a.dept.localeCompare(b.dept));
  }, [rows]);

  // ── Position folders (one per plantilla) inside the selected department ───
  const positionList = useMemo(() => {
    if (!selectedDept) return [];
    const byKey = new Map<string, { applicantCount: number; reservedFor: HiringRow | null }>();
    rows
      .filter(r => (r.department || 'No Department') === selectedDept)
      .forEach(r => {
        const key = positionKeyOf(r);
        const entry = byKey.get(key) ?? { applicantCount: 0, reservedFor: null };
        entry.applicantCount++;
        if (isReserved(r.status)) entry.reservedFor = r;
        byKey.set(key, entry);
      });
    return Array.from(byKey.entries())
      .map(([position, entry]) => ({ position, ...entry }))
      .sort((a, b) => a.position.localeCompare(b.position));
  }, [rows, selectedDept]);

  // ── Applicants for the selected plantilla, sorted by interview score ──────
  const deptApplicants = useMemo(() => {
    if (!selectedDept || !selectedPosition) return [];
    return rows
      .filter(r => (r.department || 'No Department') === selectedDept && positionKeyOf(r) === selectedPosition)
      .sort((a, b) => (b.rankingScore ?? -1) - (a.rankingScore ?? -1));
  }, [rows, selectedDept, selectedPosition]);

  // Top scorer for this plantilla, on the same basis the list is ranked by (Task 5).
  const topIds = useMemo(
    () => topScorerIds(deptApplicants, { idOf: (r) => r.id, scoreOf: (r) => r.rankingScore }),
    [deptApplicants],
  );

  /** Who holds this plantilla while they sign; nobody else can be selected. */
  const reservedRow = deptApplicants.find(r => isReserved(r.status)) ?? null;
  const selectedRow = deptApplicants.find(r => r.id === selectedId) ?? null;

  // ── Select for Hiring: notice → confirm → reserve ─────────────────────────
  const closeSelectDialog = () => {
    setSelectTarget(null);
    setOtherApps([]);
    setSelectError(null);
    setAcknowledged(false);
  };

  const handleSelectClick = async () => {
    if (!selectedRow || reservedRow || selectedRow.slot?.status === 'closed') return;
    setSelectTarget(selectedRow);
    setSelectStep('loading');
    setSelectError(null);
    setAcknowledged(false);
    setDeadline(addDays(SIGNING_WINDOW_DAYS));
    setInstructions(DEFAULT_SIGNING_INSTRUCTIONS);
    const others = await fetchOtherOpenApplications(selectedRow.email, selectedRow.id);
    if (others === null) {
      setOtherApps([]);
      setSelectError("We couldn't check whether this applicant has other open applications. Nothing is reserved yet. Confirm it another way before you continue, or close this and try again.");
      setSelectStep('confirm');
      return;
    }
    setOtherApps(others);
    setSelectStep(others.length > 0 ? 'notice' : 'confirm');
  };

  const today = localIsoDate();
  const canConfirm = Boolean(selectTarget?.slot && selectTarget.slot.status === 'open') && deadline >= today && acknowledged && !reserving;

  const handleConfirmSelect = async () => {
    if (!selectTarget || !selectTarget.slot || selectTarget.slot.status !== 'open' || !canConfirm) return;
    setReserving(true);
    setSelectError(null);
    const result = await reserveSlotForApplicant(selectTarget.slot.id, selectTarget.id, deadline, instructions);
    setReserving(false);
    if (!result.ok) {
      const failure = describeActionFailure('reserve this plantilla', result.error);
      setSelectError(`${failure.title} ${failure.message} ${failure.nextStep}`);
      return;
    }
    saveApplicants(getApplicants().map(a => (a.id === selectTarget.id ? { ...a, status: RESERVED_STATUS as any } : a)));
    setRows(prev => prev.map(r => (r.id === selectTarget.id ? { ...r, status: RESERVED_STATUS, selectionRevokedAt: null } : r)));
    setSelectedId(null);
    closeSelectDialog();
    window.dispatchEvent(new Event('cictrix:applicants-updated'));
  };

  // ── Shell layout ──────────────────────────────────────────────────────────
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="rsp-ds min-h-screen bg-[var(--bg-page)]">
      <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
      <div className="admin-layout">
        <Sidebar activeModule="RSP" userRole="rsp" />
        <main className="admin-content bg-slate-50 !p-0">
          <ApplicantsTabBar
            title="For Hiring"
            subtitle="Select one applicant per plantilla. Their credentials are generated after they sign."
          />
          {loadError ? (
            <div className="px-6 pt-6">
              <ErrorBanner
                error={loadError}
                action="load the applicants for hiring"
                onRetry={() => window.dispatchEvent(new Event('cictrix:applicants-updated'))}
              />
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );

  // ── VIEW 1 — Department folder table ──────────────────────────────────────
  if (!selectedDept) return (
    <Shell>
      <div className="p-6">
        {!rowsLoad.initialLoading && departmentList.length === 0 && loadError ? null : !rowsLoad.initialLoading && departmentList.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-slate-400">
            <Users className="mb-3 h-10 w-10" />
            <p className="font-medium">No qualified applicants yet.</p>
            <p className="mt-1 text-sm">Applicants completed in the Applicant Score appear here.</p>
          </div>
        ) : (
          <div className="abyan-table-wrap">
            <table className="abyan-table w-full min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Positions</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Applicants</th>
                  <th className="w-10 px-5 py-3" />
                </tr>
                <TableRefreshBar active={rowsLoad.refreshing} colSpan={4} />
              </thead>
              <tbody className={tableBodyClass(rowsLoad.refreshing)}>
                {rowsLoad.initialLoading ? (
                  <TableSkeletonRows show={rowsLoad.showSkeleton} columns={['text', 'text', 'text', 'text']} label="Loading departments…" />
                ) : departmentList.map(({ dept, positionCount, applicantCount }) => (
                  <tr
                    key={dept}
                    onClick={() => { setSelectedDept(dept); setSelectedId(null); }}
                    className="border-b border-slate-100 last:border-0 cursor-pointer transition-colors hover:bg-blue-50/40 group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 rounded-xl bg-[var(--color-primary-50)] p-2 text-[var(--color-primary)]">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{dept}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center text-sm text-slate-600">
                      {positionCount} {positionCount === 1 ? 'position' : 'positions'}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="badge badge-tint">
                        <Users className="h-3 w-3" />
                        {applicantCount} {applicantCount === 1 ? 'applicant' : 'applicants'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-400 group-hover:text-[var(--color-primary)] transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </Shell>
  );

  // ── VIEW 2 — Plantilla folders for the selected department ────────────────
  if (!selectedPosition) return (
    <Shell>
      <div className="p-6">
        <BackButton className="mb-3" onBack={() => { setSelectedDept(null); setSelectedId(null); }} />
        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900">{selectedDept}</h1>
          <p className="text-sm text-slate-500">
            {positionList.length} position{positionList.length !== 1 ? 's' : ''} with qualified applicants
          </p>
        </div>
        {positionList.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-slate-400">
            <Users className="mb-3 h-10 w-10" />
            <p className="font-medium">No applicants in this department.</p>
          </div>
        ) : (
          <div className="abyan-table-wrap">
            <table className="abyan-table w-full min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Applicants</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Hiring</th>
                  <th className="w-10 px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {positionList.map(({ position, applicantCount, reservedFor }) => (
                  <tr
                    key={position}
                    onClick={() => { setSelectedPosition(position); setSelectedId(null); }}
                    className="border-b border-slate-100 last:border-0 cursor-pointer transition-colors hover:bg-blue-50/40 group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 rounded-xl bg-[var(--color-primary-50)] p-2 text-[var(--color-primary)]">
                          <Briefcase className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{position}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="badge badge-tint">
                        {applicantCount} {applicantCount === 1 ? 'applicant' : 'applicants'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {/* §10 application status: For Interview / pending = Warning, open = Info */}
                      {reservedFor ? (
                        <span className="badge badge-warning" title={`Reserved for ${reservedFor.fullName}`}>
                          <span className="badge-dot" aria-hidden="true" />Reserved
                        </span>
                      ) : (
                        <span className="badge badge-info"><span className="badge-dot" aria-hidden="true" />Open</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-400 group-hover:text-[var(--color-primary)] transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );

  // ── VIEW 3 — Ranked applicants for one plantilla ──────────────────────────
  return (
    <Shell>
      <div className="p-6">
        <BackButton className="mb-3" onBack={() => { setSelectedPosition(null); setSelectedId(null); }} />
        {/* Header */}
        <div className="mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{selectedDept}</p>
            <h1 className="text-xl font-bold text-slate-900">{selectedPosition}</h1>
            <p className="text-sm text-slate-500">
              {deptApplicants.length} qualified applicant{deptApplicants.length !== 1 ? 's' : ''}, ranked by saved assessment score. One is hired.
            </p>
          </div>
          <button
            type="button"
            disabled={!selectedRow || Boolean(reservedRow)}
            onClick={() => { void handleSelectClick(); }}
            className="btn btn-md btn-primary mt-4"
          >
            <UserCheck className="h-4 w-4" aria-hidden="true" />
            Select for Hiring
          </button>
        </div>

        {/* §9.9 warning alert: only one applicant can hold the plantilla. */}
        {reservedRow && (
          <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border-l-4 border-[var(--warning-500)] bg-[var(--warning-100)] p-4">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning-700)]" aria-hidden="true" />
            <div className="text-sm text-[var(--neutral-800)]">
              <p className="font-semibold text-[var(--color-primary-900)]">
                Reserved for {reservedRow.fullName} until {formatDisplayDate(reservedRow.slot?.signingDeadline)}
              </p>
              <p>
                Only one applicant can be selected for this plantilla. Generate their credentials once they sign, or mark them
                "Did not report" on the Generate Employee Credentials tab to select someone else.
              </p>
            </div>
          </div>
        )}

        {deptApplicants.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-slate-400">
            <Users className="mb-3 h-10 w-10" />
            <p className="font-medium">No applicants for this position.</p>
          </div>
        ) : (
          <div className="abyan-table-wrap">
            <table className="abyan-table w-full min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-12 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Rank</th>
                  <th className="w-10 px-3 py-3"><span className="sr-only">Select</span></th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Applicant Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Assessment / Interview Score</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Exam Score</th>
                </tr>
                <TableRefreshBar active={rowsLoad.refreshing} colSpan={6} />
              </thead>
              <tbody className={tableBodyClass(rowsLoad.refreshing)}>
                {deptApplicants.map((row, idx) => {
                  const rank = idx + 1;
                  const isTop = topIds.has(row.id);
                  const reserved = isReserved(row.status);
                  const blockedReason = !row.slot
                    ? 'This application is not linked to a plantilla. Link it from the job post first.'
                    : row.slot.status === 'closed'
                      ? 'This plantilla is closed. Reopen the vacancy from Job Vacancies to select this applicant.'
                      : reservedRow
                        ? `Plantilla reserved for ${reservedRow.fullName}.`
                        : undefined;
                  return (
                    <tr
                      key={row.id}
                      className={`${selectedId === row.id ? 'is-selected' : ''} ${topScorerRowClass(isTop)} ${reservedRow && !reserved ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary-50)] text-xs font-bold text-[var(--color-primary-700)]">
                          {rank}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-center">
                        <input
                          type="radio"
                          name="for-hiring-select"
                          aria-label={`Select ${row.fullName}`}
                          checked={selectedId === row.id}
                          disabled={Boolean(blockedReason)}
                          title={blockedReason}
                          onChange={() => setSelectedId(row.id)}
                          className="h-4 w-4 accent-[var(--color-primary)] disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <span className="abyan-cell-primary flex flex-wrap items-center gap-2">{row.fullName}{isTop && <TopScorerBadge />}</span>
                        <span className="abyan-cell-secondary">{row.email}</span>
                        {row.selectionRevokedAt && !reserved && (
                          <p className="mt-0.5 text-xs text-[var(--neutral-600)]">
                            Selection revoked {formatDisplayDate(row.selectionRevokedAt)}: did not report
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {reserved ? (
                          <span className="badge badge-warning"><span className="badge-dot" aria-hidden="true" />Awaiting signing</span>
                        ) : (
                          <span className="badge badge-success"><span className="badge-dot" aria-hidden="true" />Qualified</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`text-sm font-bold ${row.rankingScore != null ? 'text-[var(--color-primary-900)]' : 'text-slate-300'}`}>
                          {fmtScore(row.rankingScore)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`text-sm font-bold ${row.examScore != null ? 'text-[var(--color-primary-900)]' : 'text-slate-300'}`}>
                          {row.examScore != null ? `${fmtScore(row.examScore)} / ${totalForPosition(examTotals, row.position)}` : fmtScore(row.examScore)}
                        </span>
                        {convertExamScore(row.examScore, totalForPosition(examTotals, row.position)).exceedsTotal && (
                          <span className="mt-0.5 flex items-center justify-center gap-1 whitespace-nowrap text-xs font-semibold text-[var(--error-700)]">
                            <AlertTriangle size={11} aria-hidden="true" /> Score exceeds total
                          </span>
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

      {renderSelectDialog()}
    </Shell>
  );

  // ── Select for Hiring dialog: notice → confirm ────────────────────────────
  function renderSelectDialog() {
    if (!selectTarget) return null;
    const plantilla = selectTarget.slot ? plantillaLabel(selectTarget.slot) : '';
    const deadlineText = deadline ? formatDisplayDate(deadline) : '[date]';
    const title = selectStep === 'notice'
      ? `${selectTarget.fullName} applied to other positions`
      : selectStep === 'confirm'
        ? `Select ${selectTarget.fullName} for ${selectTarget.position}?`
        : 'Select for Hiring';
    const footer = selectStep === 'notice' ? (
      <>
        <button type="button" className="btn btn-md btn-secondary" onClick={closeSelectDialog}>Cancel</button>
        <button type="button" className="btn btn-md btn-primary" onClick={() => setSelectStep('confirm')}>Continue</button>
      </>
    ) : selectStep === 'confirm' ? (
      <>
        <button
          type="button"
          className="btn btn-md btn-secondary"
          disabled={reserving}
          onClick={() => (otherApps.length > 0 ? setSelectStep('notice') : closeSelectDialog())}
        >
          {otherApps.length > 0 ? 'Back' : 'Cancel'}
        </button>
        <button
          type="button"
          className={`btn btn-md btn-primary${reserving ? ' is-loading' : ''}`}
          disabled={!canConfirm}
          aria-busy={reserving || undefined}
          onClick={() => { void handleConfirmSelect(); }}
        >
          Confirm Selection
        </button>
      </>
    ) : undefined;

    return (
      <Modal
        open
        onClose={closeSelectDialog}
        dismissible={!reserving}
        size="sm"
        icon={selectStep === 'notice' ? <AlertTriangle strokeWidth={1.75} /> : undefined}
        title={title}
        subtitle={selectStep === 'confirm' ? `${plantilla || 'No plantilla linked'} · ${selectTarget.department}` : undefined}
        footer={footer}
      >
        {selectStep === 'loading' && (
          <p className="text-sm text-[var(--neutral-600)]" aria-busy="true">Checking the applicant's other applications…</p>
        )}

        {selectStep === 'notice' && (
          <>
            <p className="mb-3 text-sm text-[var(--neutral-600)]">
              They have {otherApps.length} other open application{otherApps.length === 1 ? '' : 's'}:
            </p>
            <ul className="divide-y divide-[var(--neutral-200)] rounded-xl border border-[var(--neutral-200)] text-sm">
              {otherApps.map(app => (
                <li key={app.id} className="px-3 py-2.5">
                  <p className="font-semibold text-[var(--color-primary-900)]">{app.position}</p>
                  <p className="text-xs text-[var(--neutral-600)]">{[app.office, app.plantilla].filter(Boolean).join(' · ')}</p>
                  <span className="badge badge-neutral mt-1">{app.status || 'Submitted'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-[var(--neutral-800)]">
              Continue selecting them for <b>{selectTarget.position}{plantilla ? ` · ${plantilla}` : ''}</b>? Their other
              applications close once their credentials are generated.
            </p>
          </>
        )}

        {selectStep === 'confirm' && (
          <>
            <div className="rounded-xl border-l-4 border-[var(--warning-500)] bg-[var(--warning-100)] p-3 text-sm text-[var(--neutral-800)]">
              <b>This updates the applicant's status and cannot be undone</b>, unless the applicant does not secure the
              slot by the date below.
            </div>

            <label htmlFor="signing-deadline" className="mb-1.5 mt-4 block text-[13px] font-medium text-[var(--neutral-800)]">
              Report to the office on or before <span className="text-[var(--error-500)]">*</span>
            </label>
            <input
              id="signing-deadline"
              type="date"
              min={today}
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--neutral-200)] px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[var(--color-primary-200)]"
            />

            <label htmlFor="signing-instructions" className="mb-1.5 mt-4 block text-[13px] font-medium text-[var(--neutral-800)]">
              Instructions to the applicant
            </label>
            <textarea
              id="signing-instructions"
              rows={4}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              aria-describedby="signing-instructions-help"
              className="w-full rounded-lg border border-[var(--neutral-200)] px-3 py-2 text-sm leading-relaxed focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[var(--color-primary-200)]"
            />
            <p id="signing-instructions-help" className="mt-1 text-xs text-[var(--neutral-600)]">
              Shown on their status tracker as a congratulatory notice, always followed by: "{signingForfeitWarning(deadlineText)}"
            </p>

            <label className="mt-4 flex items-start gap-2 text-sm text-[var(--neutral-800)]">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5 h-[18px] w-[18px] accent-[var(--color-primary)]"
              />
              I understand this cannot be revoked unless the applicant does not secure the slot.
            </label>

            {!selectTarget.slot && (
              <p className="mt-3 text-xs font-medium text-[var(--error-700)]">
                This application is not linked to a plantilla, so it cannot be reserved. Link it from the job post first.
              </p>
            )}
            {selectError && (
              <p role="alert" className="mt-3 text-sm font-medium text-[var(--error-700)]">{selectError}</p>
            )}
          </>
        )}
      </Modal>
    );
  }
};
