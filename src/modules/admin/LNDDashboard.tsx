import {
  AlertTriangle,
  BarChart2,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Settings,
  Target,
  Users,
  X,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminHeader } from '../../components/AdminHeader';
import { Sidebar } from '../../components/Sidebar';
import { RailNav, type RailNavItem } from '../../components/RailNav';
import { useSectionParam } from '../../hooks/useSectionParam';

import { LndIdpFormSettings } from './LndIdpFormSettings';
import { SeminarEnrollment } from './SeminarEnrollment';
import { TrainingCalendar } from './TrainingCalendar';
import { TrainingPlan } from './TrainingPlan';
import { CATEGORY_COLORS } from './trainingCategories';

import { EmptyState } from '../../components/EmptyState';
import { listCalendarEvents, type CalendarEvent } from '../../lib/api/trainingCalendar';
import { trainingProgress } from '../../lib/trainingProgress';
import { computeNeedsAssessment, listActiveEmployees, type ActiveEmployee, type CompetencyNeed } from '../../lib/api/trainingNeeds';
import { REQUIRED_TRAININGS_PER_YEAR, trainingCompliance } from '../../lib/trainingCompliance';
import { listIncompleteLockedTrainings, listLockingSoonWithoutRoster, type IncompleteLockedTraining, type LockingSoonTraining } from '../../lib/api/trainingLifecycle';
import { OfficeDirectorySection } from '../../components/OfficeDirectorySection';
import { LndSummaryOfRatings } from './LndSummaryOfRatings';
import { LndTrainingNeeds } from './LndTrainingNeeds';
import { LndArchive } from './LndArchive';
import { cycleYearFor, listSubmissions, type IdpSubmission } from '../../lib/api/idpSubmissions';
import { idpOffices, tagSelectionsByOffice } from '../../lib/idpAnalytics';
import '../../styles/dashboard-scale.css';

type MenuId =
  | 'dashboard'
  | 'summary-of-ratings'
  | 'training-calendar'
  | 'training-plan'
  | 'training-needs'
  | 'seminar-enrollment'
  | 'archive'
  | 'office-directory'
  | 'idp-form'
  | 'settings';

type MenuItem = {
  id: MenuId;
  label: string;
  sublabel: string;
  icon: RailNavItem['icon'];
};

// Module-scope mock data arrays removed in favor of component state

const LND_MENU: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', sublabel: 'Overview and KPIs', icon: LayoutDashboard },
  { id: 'summary-of-ratings', label: 'Summary of Ratings', sublabel: 'IPCR performance data', icon: BarChart2 },
  { id: 'training-calendar', label: 'Training Calendar', sublabel: 'This year’s trainings', icon: CalendarDays },
  { id: 'training-plan', label: 'Training Plan', sublabel: 'Next year’s plan', icon: CalendarClock },
  { id: 'training-needs', label: 'Requests & Needs', sublabel: 'Office requests and Training Needs Assessment', icon: ClipboardList },
  { id: 'seminar-enrollment', label: 'Seminar Enrollment', sublabel: 'Registrations and slots', icon: ClipboardCheck },
  { id: 'idp-form', label: 'IDP Form', sublabel: 'Form link and availability window', icon: Target },
  { id: 'archive', label: 'L&D Archive', sublabel: 'Historical training records', icon: FileText },
  { id: 'office-directory', label: 'Office Directory', sublabel: 'All employees', icon: Users },
  { id: 'settings', label: 'Settings', sublabel: 'Division preferences', icon: Settings },
];
const LND_MENU_IDS = LND_MENU.map((item) => item.id);


// Side navigation rail (DESIGN_IDENTITY.md §9.12), same as the RSP portal.
// Sections switch in place, so items are buttons; the sublabel is the tooltip.
const LndSidebar = ({ activeModule, onSelect }: { activeModule: MenuId; onSelect: (id: MenuId) => void }) => (
  <RailNav
    items={LND_MENU.map((item) => ({
      path: `lnd:${item.id}`,
      label: item.label,
      icon: item.icon,
      isActive: activeModule === item.id,
      bottom: item.id === 'settings',
      onSelect: () => onSelect(item.id),
      title: item.sublabel,
    }))}
  />
);

const PlaceholderPage = ({ label }: { label: string }) => {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <FileText className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Under Construction / Implementation</h2>
        <p className="mt-2 text-sm text-gray-500">The {label} module is currently being finalized.</p>
      </div>
    </div>
  );
};

// ── Dashboard constants ───────────────────────────────────────────────────────

// Categories and their colors are defined in ./trainingCategories so that
// TrainingCourses and SeminarEnrollment can share them without importing this
// module (which imports them). Re-exported here for existing callers.
export { CATEGORY_COLORS };

const COMPETENCY_LIST = [
  'Knowledge of Local Governance',
  'Public Administration Principles',
  'Community Engagement Skills',
  'Project Management in a Public Setting',
  'Fiscal Management/Budgeting for LGU',
  'Transparency and Accountability Practices',
  'Disaster Risk Reduction and Management',
  'Digital Literacy for Government Services',
  'Ethical Conduct and Public Service Standards',
  'Technical Writing for Government Documents',
  'Data and Records Management and Organization',
  'Public Communication Skills',
] as const;

const COMPETENCY_SHORT: Record<string, string> = {
  'Knowledge of Local Governance': 'Local governance',
  'Public Administration Principles': 'Public admin principles',
  'Community Engagement Skills': 'Community engagement',
  'Project Management in a Public Setting': 'Project mgmt (public)',
  'Fiscal Management/Budgeting for LGU': 'Fiscal mgmt/budgeting',
  'Transparency and Accountability Practices': 'Transparency/accountability',
  'Disaster Risk Reduction and Management': 'DRRM',
  'Digital Literacy for Government Services': 'Digital literacy',
  'Ethical Conduct and Public Service Standards': 'Ethical conduct',
  'Technical Writing for Government Documents': 'Technical writing',
  'Data and Records Management and Organization': 'Data/records mgmt',
  'Public Communication Skills': 'Public communication',
};

/** Fixed department color palette — separate from category colors to avoid confusion. */
const DEPT_PALETTE = [
  '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed',
  '#db2777', '#0891b2', '#65a30d', '#ea580c', '#6366f1',
];

// ── Dismissible warning (DESIGN_IDENTITY.md §9.9, warning) ───────────────────

type WarningItem = { id: string; title: string; category: string | null; startDate: string };

const readDismissed = (storageKey: string): string[] => {
  try {
    // Clear the key an earlier build wrote to localStorage, which hid these
    // warnings permanently.
    localStorage.removeItem(storageKey);
    const raw = sessionStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

/**
 * An admin can dismiss a warning with its X. The dismissal lasts for the
 * session only: it clears the warning out of the way now, and the warning is
 * back the next time the admin opens the system, to be dismissed again. These
 * say a training went live incomplete, which stays true until someone acts on
 * it, so a permanent dismissal would bury it.
 */
const DismissibleWarning = ({ storageKey, title, message, items }: {
  storageKey: string;
  title: string;
  message: string;
  items: WarningItem[];
}) => {
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed(storageKey));
  if (items.length === 0 || items.every((item) => dismissed.includes(item.id))) return null;

  const dismiss = () => {
    const ids = items.map((item) => item.id);
    setDismissed(ids);
    try { sessionStorage.setItem(storageKey, JSON.stringify(ids)); } catch { /* storage unavailable */ }
  };

  return (
    <section
      className="abyan-ds relative rounded-xl p-4 pr-12"
      role="alert"
      style={{ background: 'var(--warning-100)', borderLeft: '4px solid var(--warning-500)' }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={`Dismiss: ${title}`}
        title="Dismiss"
        className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--warning-700)', backgroundColor: 'transparent', outlineColor: 'var(--color-primary)' }}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--warning-500)' }} aria-hidden />
        <div className="min-w-0">
          <p className="text-headline-m" style={{ color: 'var(--neutral-800)' }}>{title}</p>
          <p className="text-body-m mt-1" style={{ color: 'var(--neutral-800)' }}>{message}</p>
          <ul className="mt-2 space-y-1">
            {items.map((t) => (
              <li key={t.id} className="text-body-s" style={{ color: 'var(--neutral-800)' }}>
                <span style={{ fontWeight: 600 }}>{t.title}</span>
                <span style={{ color: 'var(--warning-700)' }}>
                  {t.category ? ` · ${t.category}` : ''} · starts {new Date(t.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

// ── Dashboard building blocks (Layout A, docs/mockups/2026-10-14-lnd-dashboard-layout-a.html) ──

/** Module accents: TNA = brand, IDP = the purple the IDP panels already use, Trainings = success. */
const MODULE_ACCENT = {
  tna: 'var(--color-primary)',
  idp: '#7c3aed',
  trainings: 'var(--success-500)',
} as const;
type ModuleKey = keyof typeof MODULE_ACCENT;

/** Heatmap buckets: upper bound (exclusive) of % of office headcount with the gap. */
const HEAT_STEPS = [
  { max: 15, label: '0–15%', mix: 8 },
  { max: 30, label: '15–30%', mix: 22 },
  { max: 45, label: '30–45%', mix: 42 },
  { max: 60, label: '45–60%', mix: 62 },
  { max: 75, label: '60–75%', mix: 82 },
  { max: Infinity, label: '75%+', mix: 100 },
] as const;
/** Steps from this index up are dark enough to need white text. */
const HEAT_DARK_FROM = 3;

const heatStep = (pct: number) => HEAT_STEPS.findIndex((s) => pct < s.max);
const heatBg = (i: number) => `color-mix(in srgb, var(--color-primary) ${HEAT_STEPS[i].mix}%, white)`;

const COMPLIANCE_COLORS = { met: 'var(--success-500)', partial: 'var(--warning-500)', none: 'var(--error-500)' } as const;

const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const loadingVeil = <div className="absolute inset-0 z-10 rounded-2xl bg-white/50 backdrop-blur-[1px]" />;

const ModuleLabel = ({ module, children }: { module: ModuleKey; children: React.ReactNode }) => (
  <p className="text-caps" style={{ color: MODULE_ACCENT[module] }}>{children}</p>
);

const Kpi = ({ value, label, sub, tone }: { value: string; label: string; sub: string; tone?: 'muted' | 'alert' }) => (
  <div className="min-w-0">
    <p className="text-[28px] font-extrabold leading-tight" style={{ color: tone === 'muted' ? 'var(--neutral-300)' : 'var(--color-primary-900)' }}>{value}</p>
    <p className="text-body-s mt-0.5" style={{ color: 'var(--neutral-600)' }}>{label}</p>
    <p className="text-[11px] leading-4" style={{ color: tone === 'alert' ? 'var(--error-700)' : 'var(--neutral-400)' }}>{sub}</p>
  </div>
);

const SummaryCard = ({ module, title, children, loading }: { module: ModuleKey; title: string; children: React.ReactNode; loading: boolean }) => (
  <article
    className="relative rounded-2xl border bg-white px-5 py-4"
    style={{ borderColor: 'var(--neutral-200)', borderTop: `3px solid ${MODULE_ACCENT[module]}` }}
  >
    {loading && loadingVeil}
    <ModuleLabel module={module}>{title}</ModuleLabel>
    <div className="mt-2.5 grid grid-cols-3 gap-3">{children}</div>
  </article>
);

const ChartCard = ({ title, caption, children, loading, action }: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  loading: boolean;
  action?: React.ReactNode;
}) => (
  <section className="relative flex min-w-0 flex-col rounded-2xl border bg-white px-5 py-4" style={{ borderColor: 'var(--neutral-200)' }}>
    {loading && loadingVeil}
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold" style={{ color: 'var(--color-primary-900)' }}>{title}</h2>
        {caption && <p className="text-body-s mt-0.5" style={{ color: 'var(--neutral-500)' }}>{caption}</p>}
      </div>
      {action}
    </div>
    <div className="mt-4 flex-1">{children}</div>
  </section>
);

const LegendSwatch = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--neutral-600)' }}>
    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
    {label}
  </span>
);

/** One stacked 0 / 1 / 2-of-2 bar. */
const ComplianceBar = ({ met, partial, none, height, showCounts }: { met: number; partial: number; none: number; height: number; showCounts?: boolean }) => {
  const total = met + partial + none;
  const segs = [
    { key: 'met', n: met, color: COMPLIANCE_COLORS.met },
    { key: 'partial', n: partial, color: COMPLIANCE_COLORS.partial },
    { key: 'none', n: none, color: COMPLIANCE_COLORS.none },
  ].filter((s) => s.n > 0);
  if (total === 0) return <div className="rounded-md" style={{ height, background: 'var(--neutral-100)' }} />;
  return (
    <div className="flex overflow-hidden rounded-md text-xs font-bold text-white" style={{ height }}>
      {segs.map((s) => (
        <div
          key={s.key}
          className="flex items-center overflow-hidden whitespace-nowrap pl-2"
          style={{ width: `${(s.n / total) * 100}%`, backgroundColor: s.color }}
          title={`${s.n} employee${s.n === 1 ? '' : 's'}`}
        >
          {showCounts && `${s.n} · ${pctOf(s.n, total)}%`}
        </div>
      ))}
    </div>
  );
};

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** Employees per page of the "still needs training" table. */
const NEEDS_PAGE_SIZE = 10;
/** Page-number buttons shown around the current page. */
const NEEDS_PAGE_WINDOW = 5;

// ── Dashboard component ───────────────────────────────────────────────────────

const LndDashboardContent = () => {
  const [loading, setLoading] = useState(true);
  const [incompleteLocked, setIncompleteLocked] = useState<IncompleteLockedTraining[]>([]);
  const [lockingSoon, setLockingSoon] = useState<LockingSoonTraining[]>([]);
  /**
   * The AI needs assessment — competency gaps derived from the summary of
   * ratings and mapped onto the competency framework. This, not the manual
   * request queue, is what the TNA section describes.
   */
  const [needs, setNeeds] = useState<CompetencyNeed[]>([]);
  /** Filed IDPs for this cycle. */
  const [idpSubs, setIdpSubs] = useState<IdpSubmission[]>([]);
  const idpCycle = cycleYearFor();
  /** This year's Training Calendar — completion and the 2-training rule. */
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  /** Active employees in active offices — the denominator for every section. */
  const [employees, setEmployees] = useState<ActiveEmployee[]>([]);
  const [trainingDept, setTrainingDept] = useState('');
  const [needsFilter, setNeedsFilter] = useState<'all' | 'none' | 'partial'>('all');
  const [needsPage, setNeedsPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [locked, soon, assessed, idp, events, staff] = await Promise.all([
          listIncompleteLockedTrainings(),
          listLockingSoonWithoutRoster(),
          computeNeedsAssessment(),
          listSubmissions(idpCycle),
          listCalendarEvents(new Date().getFullYear()),
          listActiveEmployees(),
        ]);
        if (cancelled) return;
        setIncompleteLocked(locked);
        setLockingSoon(soon);
        setNeeds(assessed);
        if (idp.ok) setIdpSubs(idp.data);
        setCalendarEvents(events);
        setEmployees(staff);
      } catch (err) {
        console.error('LND dashboard error', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [idpCycle]);

  const currentYear = new Date().getFullYear();

  // ── Shared population ──
  const offices = useMemo(() => Array.from(new Set(employees.map((e) => e.department))).sort(), [employees]);
  const headcount = employees.length;

  // ── TNA ──
  const assessedOffices = useMemo(
    () => Array.from(new Set(needs.flatMap((n) => n.offices.map((o) => o.office)))).sort(),
    [needs]
  );
  const officeTotal = Math.max(offices.length, assessedOffices.length);

  /** Distinct employees with at least one identified competency gap. */
  const employeesWithGaps = useMemo(() => {
    const perOffice = new Map<string, number>();
    for (const n of needs) {
      for (const o of n.offices) {
        // An employee can appear under several competencies; the office's
        // headcount bounds it, so take the max rather than summing.
        perOffice.set(o.office, Math.max(perOffice.get(o.office) ?? 0, o.affected));
      }
    }
    return [...perOffice.values()].reduce((a, b) => a + b, 0);
  }, [needs]);

  /** All 12 framework competencies, most-needed LGU-wide first. */
  const competencyRows = useMemo(() =>
    COMPETENCY_LIST.map((comp) => {
      const need = needs.find((n) => n.competency === comp);
      return {
        competency: comp,
        short: COMPETENCY_SHORT[comp] ?? comp,
        affected: need?.offices.reduce((sum, o) => sum + o.affected, 0) ?? 0,
        byOffice: new Map((need?.offices ?? []).map((o) => [o.office, o.demand])),
      };
    }).sort((a, b) => b.affected - a.affected || a.competency.localeCompare(b.competency)),
    [needs]
  );
  const competenciesWithGaps = competencyRows.filter((r) => r.affected > 0).length;
  const tnaHeadcount = headcount || needs[0]?.offices.reduce((sum, o) => sum + o.total, 0) || 0;

  // ── IDP ──
  const submittedIds = useMemo(() => new Set(idpSubs.map((s) => s.employeeId)), [idpSubs]);
  const idpByOffice = useMemo(() =>
    offices.map((office) => {
      const staff = employees.filter((e) => e.department === office);
      const submitted = staff.filter((e) => submittedIds.has(e.id)).length;
      return { office, total: staff.length, submitted };
    }),
    [offices, employees, submittedIds]
  );
  const officesWithIdps = idpByOffice.filter((o) => o.submitted > 0).length;
  const idpOfficeList = useMemo(() => idpOffices(idpSubs), [idpSubs]);
  const idpTagRows = useMemo(() => tagSelectionsByOffice(idpSubs), [idpSubs]);
  const idpTopTag = useMemo(
    () => idpTagRows.reduce((best, cur) => (cur.total > best.total ? cur : best), idpTagRows[0]),
    [idpTagRows]
  );
  const idpChartData = useMemo(
    () => idpTagRows.map((r) => ({ category: r.label, ...r.byOffice })),
    [idpTagRows]
  );

  // ── Trainings ──
  const progress = useMemo(() => trainingProgress(calendarEvents), [calendarEvents]);
  const compliance = useMemo(() => trainingCompliance(employees, calendarEvents), [employees, calendarEvents]);
  const trainedAtLeastOnce = compliance.met + compliance.partial;

  const deptCompliance = trainingDept
    ? compliance.byDepartment.filter((d) => d.department === trainingDept)
    : compliance.byDepartment;
  const scope = trainingDept
    ? deptCompliance[0] ?? { met: 0, partial: 0, none: 0, total: 0 }
    : compliance;
  const stillNeeds = useMemo(
    () => compliance.employees.filter((e) =>
      e.completed < REQUIRED_TRAININGS_PER_YEAR
      && (!trainingDept || e.department === trainingDept)
      && (needsFilter === 'all' || (needsFilter === 'none' ? e.completed === 0 : e.completed > 0))
    ),
    [compliance, trainingDept, needsFilter]
  );
  const stillNeedsCount = scope.partial + scope.none;
  const needsPageCount = Math.max(1, Math.ceil(stillNeeds.length / NEEDS_PAGE_SIZE));
  // Clamped so a filter that shrinks the list never strands the view on an empty page.
  const needsCurrentPage = Math.min(needsPage, needsPageCount);
  const needsPageStart = (needsCurrentPage - 1) * NEEDS_PAGE_SIZE;
  const needsPageRows = stillNeeds.slice(needsPageStart, needsPageStart + NEEDS_PAGE_SIZE);
  const needsFirstShown = Math.max(1, Math.min(needsCurrentPage - Math.floor(NEEDS_PAGE_WINDOW / 2), needsPageCount - NEEDS_PAGE_WINDOW + 1));
  const needsPageNumbers = Array.from({ length: Math.min(NEEDS_PAGE_WINDOW, needsPageCount) }, (_, i) => needsFirstShown + i);

  const exportStillNeeds = () =>
    downloadCsv(
      `employees-needing-training-${currentYear}${trainingDept ? `-${trainingDept}` : ''}.csv`,
      [
        ['Employee', 'Department', 'Position', `Trainings completed (of ${REQUIRED_TRAININGS_PER_YEAR})`],
        ...stillNeeds.map((e) => [e.name, e.department, e.position, e.completed]),
      ]
    );

  // Stacked IDP tag bar: one line per office in the hovered bar.
  const stackTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="min-w-[160px] rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-lg">
        <p className="mb-2 font-semibold text-gray-800">{label}</p>
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: entry.fill }} />
            <span className="flex-1 truncate text-gray-600">{entry.dataKey}</span>
            <span className="font-semibold text-gray-800">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const fmt = (n: number) => n.toLocaleString('en-US');

  return (
    <div className="abyan-ds space-y-4 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-body-s">
            <span style={{ color: 'var(--color-primary)' }}>L&amp;D</span>
            <span className="mx-1" style={{ color: 'var(--neutral-400)' }}>/</span>
            <span style={{ color: 'var(--neutral-600)' }}>Dashboard</span>
          </p>
          <h1 className="mt-1 text-[28px] font-bold leading-9" style={{ color: 'var(--color-primary-900)' }}>Dashboard &amp; Analytics</h1>
          <p className="text-body-l" style={{ color: 'var(--neutral-500)' }}>
            Needs assessment, development plans and trainings for {currentYear}.
          </p>
        </div>
      </section>

      <DismissibleWarning
        storageKey="abyan:lnd-dismissed-incomplete"
        title={`${incompleteLocked.length} training${incompleteLocked.length === 1 ? '' : 's'} went live incomplete`}
        message="These locked within 3 days of their start while still in planning, so their detail fields were never completed. Complete trainings before the cutoff next time."
        items={incompleteLocked}
      />
      <DismissibleWarning
        storageKey="abyan:lnd-dismissed-locking-soon"
        title={`${lockingSoon.length} training${lockingSoon.length === 1 ? '' : 's'} locking within 3 days, roster not finalized`}
        message="These lock 3 days before they start and still have no enrolled attendees. Finalize their rosters now, before they go live empty."
        items={lockingSoon}
      />

      {/* Summary row — one card per module */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SummaryCard module="tna" title="Training Needs Assessment" loading={loading}>
          <Kpi value={fmt(employeesWithGaps)} label="With skill gaps" sub={`${pctOf(employeesWithGaps, tnaHeadcount)}% of ${fmt(tnaHeadcount)} employees`} />
          <Kpi value={`${assessedOffices.length}/${officeTotal}`} label="Offices assessed" sub="From rated IPCR data" />
          <Kpi value={`${competenciesWithGaps}/${COMPETENCY_LIST.length}`} label="Competencies with gaps" sub={competencyRows[0]?.affected ? `Top: ${competencyRows[0].short}` : 'No gaps found yet'} />
        </SummaryCard>
        <SummaryCard module="idp" title="Individual Development Plans" loading={loading}>
          <Kpi
            value={`${pctOf(idpSubs.length, headcount)}%`}
            label="Submitted"
            sub={`${fmt(idpSubs.length)} of ${fmt(headcount)} · ${idpCycle} cycle`}
            tone={idpSubs.length === 0 ? 'alert' : undefined}
          />
          <Kpi value={`${officesWithIdps}/${offices.length}`} label="Offices with IDPs" sub="At least one submitted" />
          <Kpi
            value={idpTopTag?.total ? fmt(idpTopTag.total) : '—'}
            label="Top requested tag"
            sub={idpTopTag?.total ? idpTopTag.label : 'No IDPs yet'}
            tone={idpTopTag?.total ? undefined : 'muted'}
          />
        </SummaryCard>
        <SummaryCard module="trainings" title="Trainings Done" loading={loading}>
          <Kpi value={`${progress.percent}%`} label="Completion" sub={`${progress.completed} of ${progress.total} trainings`} />
          <Kpi
            value={`${pctOf(compliance.met, compliance.total)}%`}
            label={`Met ${REQUIRED_TRAININGS_PER_YEAR}-training rule`}
            sub={`${fmt(compliance.partial + compliance.none)} still need training`}
          />
          <Kpi value={fmt(trainedAtLeastOnce)} label="Trained at least once" sub={`${pctOf(trainedAtLeastOnce, compliance.total)}% of employees`} />
        </SummaryCard>
      </section>

      {/* ── TNA row ── */}
      <div className="pt-4"><ModuleLabel module="tna">TNA · Assessed gaps · {COMPETENCY_LIST.length} competencies</ModuleLabel></div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard
            title="Competency gaps by category and office"
            caption="% of each office's employees with a gap · rows sorted by LGU-wide need"
            loading={loading}
          >
            {assessedOffices.length === 0 && !loading ? (
              <EmptyState title="No assessed gaps yet" description="Gaps appear once IPCR ratings have been matched to competencies." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <div
                    className="grid min-w-[560px] items-center gap-1 text-[11px]"
                    style={{ gridTemplateColumns: `minmax(150px, 190px) repeat(${assessedOffices.length}, minmax(64px, 1fr))`, color: 'var(--neutral-600)' }}
                  >
                    <div />
                    {assessedOffices.map((o) => (
                      <div key={o} className="truncate px-1 text-center font-semibold" title={o}>{o}</div>
                    ))}
                    {competencyRows.map((row) => (
                      <Fragment key={row.competency}>
                        <div className="truncate pr-2" title={row.competency}>{row.short}</div>
                        {assessedOffices.map((o) => {
                          const v = row.byOffice.get(o) ?? 0;
                          const step = heatStep(v);
                          return (
                            <div
                              key={o}
                              className="flex h-[26px] items-center justify-center rounded font-semibold"
                              style={{ background: heatBg(step), color: step >= HEAT_DARK_FROM ? 'var(--color-white)' : 'var(--neutral-800)' }}
                              title={`${row.competency} · ${o}: ${v}% of employees`}
                            >
                              {v}%
                            </div>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px]" style={{ color: 'var(--neutral-600)' }}>
                  <span className="font-semibold" style={{ color: 'var(--neutral-800)' }}>Legend · % of employees with a gap</span>
                  <div className="flex overflow-hidden rounded text-center font-semibold">
                    {HEAT_STEPS.map((s, i) => (
                      <div
                        key={s.label}
                        className="w-[58px] py-1"
                        style={{ background: heatBg(i), color: i >= HEAT_DARK_FROM ? 'var(--color-white)' : 'var(--neutral-800)' }}
                      >
                        {s.label}
                      </div>
                    ))}
                  </div>
                  <span style={{ color: 'var(--neutral-400)' }}>Low priority ← → High priority</span>
                </div>
                <p className="mt-1.5 text-[11px]" style={{ color: 'var(--neutral-400)' }}>
                  Each cell is one office and one competency: the share of that office&rsquo;s employees whose ratings show a gap in it.
                </p>
              </>
            )}
          </ChartCard>
        </div>
        <ChartCard title="Top competency needs" caption="LGU-wide · employees with the gap / active employees" loading={loading}>
          {competenciesWithGaps === 0 && !loading ? (
            <EmptyState title="No gaps yet" description="Nothing to rank until ratings are matched to competencies." />
          ) : (
            <div className="grid gap-2.5 text-xs" style={{ color: 'var(--neutral-800)' }}>
              {competencyRows.map((row) => (
                <div key={row.competency} title={row.competency}>
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{row.short}</span>
                    <b className="whitespace-nowrap">{fmt(row.affected)} / {fmt(tnaHeadcount)}</b>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded" style={{ background: 'var(--color-primary-50)' }}>
                    <div className="h-full rounded" style={{ width: `${pctOf(row.affected, tnaHeadcount)}%`, background: 'var(--color-primary)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── IDP row ── */}
      <div className="pt-4"><ModuleLabel module="idp">IDP · Development plans · {idpCycle} cycle</ModuleLabel></div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="IDP submission by office" caption="Active employees who have submitted their IDP this cycle" loading={loading}>
            {offices.length === 0 && !loading ? (
              <EmptyState title="No employees" description="No active employees were found in the active offices." />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-4">
                  <LegendSwatch color={MODULE_ACCENT.idp} label="Submitted" />
                  <LegendSwatch color="var(--neutral-200)" label="Not yet submitted" />
                </div>
                <div className="grid items-center gap-x-3 gap-y-2.5 text-[11px]" style={{ gridTemplateColumns: 'minmax(110px, 180px) 1fr 84px', color: 'var(--neutral-600)' }}>
                  {idpByOffice.map((o) => (
                    <Fragment key={o.office}>
                      <div className="truncate" title={o.office}>{o.office}</div>
                      <div className="h-4 overflow-hidden rounded" style={{ background: 'var(--neutral-200)' }}>
                        <div className="h-full" style={{ width: `${pctOf(o.submitted, o.total)}%`, background: MODULE_ACCENT.idp }} />
                      </div>
                      <div className="text-right"><b style={{ color: 'var(--neutral-800)' }}>{o.submitted}</b> / {o.total}</div>
                    </Fragment>
                  ))}
                </div>
                {idpSubs.length === 0 && !loading && (
                  <p className="text-body-s mt-4 rounded-lg px-3 py-2" style={{ background: '#f5f0ff', color: MODULE_ACCENT.idp }}>
                    No IDPs have been submitted for the {idpCycle} cycle yet.
                  </p>
                )}
              </>
            )}
          </ChartCard>
        </div>
        <ChartCard title="Development requests by tag" caption="Employees who ticked each tag · one person can tick several" loading={loading}>
          {idpSubs.length === 0 && !loading ? (
            <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed px-4 text-center text-body-s" style={{ borderColor: 'var(--neutral-300)', color: 'var(--neutral-400)' }}>
              Tag counts appear here once IDPs come in.
            </div>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={idpChartData} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="category" width={110} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#374151' }} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={stackTooltip} />
                  {idpOfficeList.map((office, i) => (
                    <Bar key={office} dataKey={office} stackId="idp" fill={DEPT_PALETTE[i % DEPT_PALETTE.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Trainings row ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <ModuleLabel module="trainings">Trainings done · {REQUIRED_TRAININGS_PER_YEAR}-training requirement</ModuleLabel>
        <label className="flex items-center gap-2 text-body-s" style={{ color: 'var(--neutral-500)' }}>
          Department
          <select
            value={trainingDept}
            onChange={(e) => { setTrainingDept(e.target.value); setNeedsPage(1); }}
            className="rounded-lg border bg-white px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--neutral-300)', color: 'var(--neutral-800)' }}
          >
            <option value="">All departments</option>
            {compliance.byDepartment.map((d) => (
              <option key={d.department} value={d.department}>{d.department}</option>
            ))}
          </select>
        </label>
      </div>
      <ChartCard
        title={`Employees who completed their ${REQUIRED_TRAININGS_PER_YEAR} required trainings`}
        caption={`Each employee must attend ${REQUIRED_TRAININGS_PER_YEAR} trainings per year · counts finished trainings marked Present · ${fmt(scope.total)} employees · ${currentYear}`}
        loading={loading}
      >
        <ComplianceBar met={scope.met} partial={scope.partial} none={scope.none} height={28} showCounts />
        <div className="mt-2 flex flex-wrap gap-4">
          <LegendSwatch color={COMPLIANCE_COLORS.met} label={`Completed ${REQUIRED_TRAININGS_PER_YEAR} of ${REQUIRED_TRAININGS_PER_YEAR}`} />
          <LegendSwatch color={COMPLIANCE_COLORS.partial} label="1 so far, needs 1 more" />
          <LegendSwatch color={COMPLIANCE_COLORS.none} label={`0 so far, needs ${REQUIRED_TRAININGS_PER_YEAR}`} />
        </div>
        <p className="text-body-s mt-5" style={{ color: 'var(--neutral-800)' }}>By department</p>
        <div className="mt-2 grid items-center gap-x-3 gap-y-2.5 text-[11px]" style={{ gridTemplateColumns: 'minmax(110px, 180px) 1fr 72px', color: 'var(--neutral-600)' }}>
          {deptCompliance.map((d) => (
            <Fragment key={d.department}>
              <button
                type="button"
                onClick={() => { setTrainingDept(d.department); setNeedsPage(1); }}
                className="truncate text-left hover:underline"
                title={`Show only ${d.department}`}
              >
                {d.department}
              </button>
              <ComplianceBar met={d.met} partial={d.partial} none={d.none} height={16} />
              <div className="text-right"><b style={{ color: 'var(--neutral-800)' }}>{d.percentMet}%</b> done</div>
            </Fragment>
          ))}
        </div>
        <p className="mt-3 text-[11px]" style={{ color: 'var(--neutral-400)' }}>
          Most complete department first. Click a department to filter this section. Trainings with no attendance marked count for no one.
        </p>
      </ChartCard>
      <ChartCard
        title="Still needs training"
        caption={`${fmt(stillNeedsCount)} employee${stillNeedsCount === 1 ? '' : 's'} below ${REQUIRED_TRAININGS_PER_YEAR} of ${REQUIRED_TRAININGS_PER_YEAR} · fewest trainings first`}
        loading={loading}
        action={
          <button type="button" onClick={exportStillNeeds} disabled={stillNeeds.length === 0} className="btn btn-secondary btn-sm shrink-0 disabled:opacity-40">
            Export list
          </button>
        }
      >
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {([
            ['all', `All ${stillNeedsCount}`],
            ['none', `0 of ${REQUIRED_TRAININGS_PER_YEAR} · ${scope.none}`],
            ['partial', `1 of ${REQUIRED_TRAININGS_PER_YEAR} · ${scope.partial}`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setNeedsFilter(key); setNeedsPage(1); }}
              className="rounded-full border px-2.5 py-1"
              style={needsFilter === key
                ? { background: 'var(--color-primary-900)', borderColor: 'var(--color-primary-900)', color: 'var(--color-white)' }
                : { borderColor: 'var(--neutral-200)', color: 'var(--neutral-600)' }}
            >
              {label}
            </button>
          ))}
        </div>
        {stillNeeds.length === 0 ? (
          <p className="text-body-s py-8 text-center" style={{ color: 'var(--neutral-400)' }}>
            {loading ? 'Loading…' : 'Everyone here has met the requirement.'}
          </p>
        ) : (
          <>
            <div className="abyan-table-wrap mt-3">
              <table className="abyan-table w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--neutral-200)', color: 'var(--neutral-500)' }}>
                    <th className="px-3 py-2.5 font-semibold">Employee</th>
                    <th className="px-3 py-2.5 font-semibold">Department</th>
                    <th className="px-3 py-2.5 font-semibold">Position</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Trainings completed</th>
                  </tr>
                </thead>
                <tbody>
                  {needsPageRows.map((e) => (
                    <tr key={e.id} className="border-b last:border-b-0 hover:bg-[var(--bg-row-hover)]" style={{ borderColor: 'var(--neutral-100)' }}>
                      <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--neutral-800)' }}>{e.name}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--neutral-600)' }}>{e.department}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--neutral-600)' }}>{e.position || '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`badge ${e.completed === 0 ? 'badge-error' : 'badge-warning'}`}>
                          {e.completed} / {REQUIRED_TRAININGS_PER_YEAR}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav
              aria-label="Still needs training pages"
              className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-3"
              style={{ borderColor: 'var(--neutral-200)' }}
            >
              <p className="!mb-0 text-xs" style={{ color: 'var(--neutral-600)' }}>
                Showing {needsPageStart + 1}–{needsPageStart + needsPageRows.length} of {fmt(stillNeeds.length)} entries
              </p>
              {needsPageCount > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNeedsPage(needsCurrentPage - 1)}
                    disabled={needsCurrentPage === 1}
                    className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-[#28343D] hover:border-[#C8D1FF] hover:bg-[#EEF0FF] disabled:cursor-not-allowed disabled:border-[#E2E8F0] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>
                  {needsPageNumbers.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNeedsPage(n)}
                      aria-label={`Page ${n}`}
                      aria-current={n === needsCurrentPage ? 'page' : undefined}
                      className={`h-10 w-10 rounded-lg text-sm font-medium ${
                        n === needsCurrentPage
                          ? 'bg-[#363EE8] text-white'
                          : 'border border-[#E2E8F0] bg-white text-[#28343D] hover:border-[#C8D1FF] hover:bg-[#EEF0FF]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setNeedsPage(needsCurrentPage + 1)}
                    disabled={needsCurrentPage === needsPageCount}
                    className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-[#28343D] hover:border-[#C8D1FF] hover:bg-[#EEF0FF] disabled:cursor-not-allowed disabled:border-[#E2E8F0] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </nav>
          </>
        )}
      </ChartCard>
    </div>
  );
};

/**
 * `viewOnly` is the super admin looking at this division, not operating it.
 * It is NOT the same as isDashboardView, which is true for the L&D admin's own
 * portal route too — keying the rail off that would have taken the navigation
 * away from the people whose portal this is.
 */
export const LNDDashboard = ({
  viewOnly = false,
}: { isDashboardView?: boolean; viewOnly?: boolean }) => {
  // The section lives in ?module= so a refresh returns to it. In view-only mode
  // it is fixed to the dashboard: there is no navigation to leave it with, and
  // on /admin ?module= names the division, not an L&D section.
  const [activeModule, setActiveModule] = useSectionParam(LND_MENU_IDS, 'dashboard', !viewOnly);
  const effectiveModule: MenuId = viewOnly ? 'dashboard' : activeModule;
  // Deep-link support: /admin/lnd?module=archive&office=…&employee=… lands
  // straight on the L&D Archive at a specific office/employee (e.g. from a
  // Succession Planning candidate card). Read once on mount.
  const [archiveDeepLink, setArchiveDeepLink] = useState<{ office: string | null; employee: string | null }>({
    office: null,
    employee: null,
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('module') === 'archive') {
      setArchiveDeepLink({ office: params.get('office'), employee: params.get('employee') });
    }
  }, []);

  return (
    <div className="brand-text min-h-screen bg-slate-100 font-sans text-[#040E6B]">
      <AdminHeader
        userName="L&D Admin"
        divisionLabel="L&D Division"
      />
      <div className="flex">
        {/* A super admin views this module; they do not operate it. Showing the
            L&D rail here handed them L&D's own navigation and let them switch
            into any section. They get their own sidebar instead. */}
        {viewOnly ? (
          <Sidebar activeModule="LND" userRole="super-admin" />
        ) : (
          <LndSidebar activeModule={activeModule} onSelect={setActiveModule} />
        )}
        {/* min-w-0: without it this flex child defaults to min-width:auto and wide
            tables push the whole page (and the sticky header) sideways. */}
        <main className="min-w-0 flex-1">
          {effectiveModule === 'dashboard' ? (
            <div className="dash-lg">
              <LndDashboardContent />
            </div>
          ) : effectiveModule === 'summary-of-ratings' ? (
            <LndSummaryOfRatings />
          ) : effectiveModule === 'training-calendar' ? (
            <TrainingCalendar />
          ) : effectiveModule === 'training-plan' ? (
            <TrainingPlan />
          ) : effectiveModule === 'training-needs' ? (
            <LndTrainingNeeds />
          ) : effectiveModule === 'seminar-enrollment' ? (
            <SeminarEnrollment />
          ) : effectiveModule === 'archive' ? (
            <LndArchive initialOffice={archiveDeepLink.office} focusEmployeeId={archiveDeepLink.employee} />
          ) : effectiveModule === 'office-directory' ? (
            // Same page gutter PM gives this section; without it the table ran into the rail.
            <div className="p-4 sm:p-6">
              <OfficeDirectorySection showBulkRequest={false} />
            </div>
          ) : effectiveModule === 'idp-form' ? (
            <LndIdpFormSettings />
          ) : (
            <PlaceholderPage label={LND_MENU.find((item) => item.id === effectiveModule)?.label || 'Module'} />
          )}
        </main>
      </div>
    </div>
  );
};
