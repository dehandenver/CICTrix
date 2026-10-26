import {
  AlertTriangle,
  BarChart2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  Grid3x3,
  LayoutDashboard,
  Settings,
  Target,
  Users,
  X,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AdminHeader } from '../../components/AdminHeader';
import { Sidebar } from '../../components/Sidebar';
import { RailNav, type RailNavItem } from '../../components/RailNav';
import { useSectionParam } from '../../hooks/useSectionParam';

import { LndIdpFormSettings } from './LndIdpFormSettings';
import { SeminarEnrollment } from './SeminarEnrollment';
import { TrainingCalendar } from './TrainingCalendar';
import { TrainingPlan } from './TrainingPlan';
import { CATEGORY_COLORS } from './trainingCategories';

import { Pagination } from '../../components/Pagination';
import { paginate } from '../../lib/pagination';
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
import { tagSelectionsByOffice } from '../../lib/idpAnalytics';
import { ALL_OFFICES, PERIODS, PERIOD_LABEL, eventsInPeriod, inOffice, scopeNeedsToOffice, type Period } from './lndDashboardModel';
import '../../styles/rsp-dashboard.css';
import '../../styles/lnd-dashboard.css';
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

// ── Dashboard building blocks ─────────────────────────────────────────────────
// Portal dashboard pattern (RspDashboardOverview, rsp-dashboard.css): gradient
// hero with period + office controls, then titled sections with KPI strips.
// Supersedes Layout A's header and summary cards; its chart rows stay, restyled
// (docs/plans/2026-10-26-lnd-dashboard-office-pager-required-icon-work-experience.md).

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

type StatTone = 'warn' | 'risk' | undefined;

/** One KPI cell: muted label over a large value, with an optional inline note (§9.7). */
const Stat = ({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: string; tone?: StatTone }) => (
  <div className={`rd-stat ${tone ?? ''}`}>
    <span className="l">{label}</span>
    <span className="v">
      {value}
      {note && <small> {note}</small>}
    </span>
  </div>
);

const SectionHead = ({ icon: Icon, title, desc, onViewAll }: {
  icon: RailNavItem['icon'];
  title: string;
  desc: string;
  /** Omitted in view-only mode, where there is no section to switch to. */
  onViewAll?: () => void;
}) => (
  <div className="rd-sec-h">
    <span className="rd-ico"><Icon size={16} aria-hidden="true" /></span>
    <h2>{title}</h2>
    <span className="rd-desc">{desc}</span>
    {onViewAll && (
      <button type="button" className="rd-link" onClick={onViewAll} aria-label={`View all: ${title}`}>View all ›</button>
    )}
  </div>
);

const Panel = ({ title, caption, action, children }: {
  title: string;
  caption?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="rd-card ld-panel">
    <div className="rd-h">
      <div className="min-w-0">
        <h3>{title}</h3>
        {caption && <p className="ld-caption">{caption}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

/** Empty panel (§12): icon, short title, and what will fill it. */
const PanelEmpty = ({ icon: Icon, title, text }: { icon: RailNavItem['icon']; title: string; text: string }) => (
  <div className="ld-empty">
    <span className="ld-empty-ico"><Icon size={20} strokeWidth={1.75} aria-hidden="true" /></span>
    <p className="ld-empty-t">{title}</p>
    <p className="ld-empty-d">{text}</p>
  </div>
);

/** A bar-list row: label, bar, right-aligned count. */
const BarRow = ({ label, title, value, percent, color = 'var(--rd-accent)' }: {
  label: string;
  title?: string;
  value: React.ReactNode;
  percent: number;
  color?: string;
}) => (
  <div className="ld-row" title={title ?? label}>
    <span className="ld-row-l">{label}</span>
    <div className="rd-bar"><i style={{ width: `${percent}%`, background: color, borderRadius: 6 }} /></div>
    <b className="ld-row-n">{value}</b>
  </div>
);

/** One stacked 0 / 1 / 2-of-2 bar. */
const ComplianceBar = ({ met, partial, none, large, showCounts }: { met: number; partial: number; none: number; large?: boolean; showCounts?: boolean }) => {
  const total = met + partial + none;
  const segs = [
    { key: 'met', n: met, color: COMPLIANCE_COLORS.met, label: `${REQUIRED_TRAININGS_PER_YEAR} of ${REQUIRED_TRAININGS_PER_YEAR}` },
    { key: 'partial', n: partial, color: COMPLIANCE_COLORS.partial, label: '1 so far' },
    { key: 'none', n: none, color: COMPLIANCE_COLORS.none, label: '0 so far' },
  ];
  return (
    <div
      className={`ld-cbar ${large ? 'ld-cbar-lg' : ''}`}
      role="img"
      aria-label={segs.map((s) => `${s.n} ${s.label}`).join(', ')}
    >
      {total > 0 && segs.filter((s) => s.n > 0).map((s) => (
        <i key={s.key} style={{ width: `${(s.n / total) * 100}%`, background: s.color }} title={`${s.n} employee${s.n === 1 ? '' : 's'}`}>
          {showCounts && `${s.n} · ${pctOf(s.n, total)}%`}
        </i>
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

// ── Dashboard component ───────────────────────────────────────────────────────

const LndDashboardContent = ({ onNavigate }: { onNavigate?: (id: MenuId) => void }) => {
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
  const [period, setPeriod] = useState<Period>('year');
  const [office, setOffice] = useState<string>(ALL_OFFICES);
  const [needsFilter, setNeedsFilter] = useState<'all' | 'none' | 'partial'>('all');
  const [needsPage, setNeedsPage] = useState(1);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

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

  const currentYear = today.getFullYear();
  const chooseOffice = (next: string) => {
    setOffice(next);
    setNeedsPage(1);
  };

  // ── Shared population, scoped to the office filter ──
  const allOffices = useMemo(() => Array.from(new Set(employees.map((e) => e.department))).sort(), [employees]);
  const offices = useMemo(() => allOffices.filter((o) => inOffice(o, office)), [allOffices, office]);
  const scopedEmployees = useMemo(() => employees.filter((e) => inOffice(e.department, office)), [employees, office]);
  const headcount = scopedEmployees.length;
  const scopedNeeds = useMemo(() => scopeNeedsToOffice(needs, office), [needs, office]);

  // ── TNA ──
  const assessedOffices = useMemo(
    () => Array.from(new Set(scopedNeeds.flatMap((n) => n.offices.map((o) => o.office)))).sort(),
    [scopedNeeds]
  );
  const officeTotal = Math.max(offices.length, assessedOffices.length);

  /** Distinct employees with at least one identified competency gap. */
  const employeesWithGaps = useMemo(() => {
    const perOffice = new Map<string, number>();
    for (const n of scopedNeeds) {
      for (const o of n.offices) {
        // An employee can appear under several competencies; the office's
        // headcount bounds it, so take the max rather than summing.
        perOffice.set(o.office, Math.max(perOffice.get(o.office) ?? 0, o.affected));
      }
    }
    return [...perOffice.values()].reduce((a, b) => a + b, 0);
  }, [scopedNeeds]);

  /** All 12 framework competencies, most-needed first. */
  const competencyRows = useMemo(() =>
    COMPETENCY_LIST.map((comp) => {
      const need = scopedNeeds.find((n) => n.competency === comp);
      return {
        competency: comp,
        short: COMPETENCY_SHORT[comp] ?? comp,
        affected: need?.offices.reduce((sum, o) => sum + o.affected, 0) ?? 0,
        byOffice: new Map((need?.offices ?? []).map((o) => [o.office, o.demand])),
      };
    }).sort((a, b) => b.affected - a.affected || a.competency.localeCompare(b.competency)),
    [scopedNeeds]
  );
  const competenciesWithGaps = competencyRows.filter((r) => r.affected > 0).length;
  const tnaHeadcount = headcount || scopedNeeds[0]?.offices.reduce((sum, o) => sum + o.total, 0) || 0;

  // ── IDP ──
  const scopedIdpSubs = useMemo(() => {
    if (office === ALL_OFFICES) return idpSubs;
    const ids = new Set(scopedEmployees.map((e) => e.id));
    return idpSubs.filter((s) => ids.has(s.employeeId) || inOffice(s.office, office));
  }, [idpSubs, scopedEmployees, office]);
  const submittedIds = useMemo(() => new Set(scopedIdpSubs.map((s) => s.employeeId)), [scopedIdpSubs]);
  const idpByOffice = useMemo(() =>
    offices.map((name) => {
      const staff = scopedEmployees.filter((e) => e.department === name);
      const submitted = staff.filter((e) => submittedIds.has(e.id)).length;
      return { office: name, total: staff.length, submitted };
    }),
    [offices, scopedEmployees, submittedIds]
  );
  const officesWithIdps = idpByOffice.filter((o) => o.submitted > 0).length;
  const idpTagRows = useMemo(
    () => tagSelectionsByOffice(scopedIdpSubs).slice().sort((a, b) => b.total - a.total),
    [scopedIdpSubs]
  );
  const idpTopTag = idpTagRows[0];
  const idpTagMax = Math.max(1, ...idpTagRows.map((r) => r.total));

  // ── Trainings ──
  const periodEvents = useMemo(() => eventsInPeriod(calendarEvents, period, today), [calendarEvents, period, today]);
  const progress = useMemo(() => trainingProgress(periodEvents), [periodEvents]);
  const compliance = useMemo(() => trainingCompliance(scopedEmployees, calendarEvents), [scopedEmployees, calendarEvents]);
  const trainedAtLeastOnce = compliance.met + compliance.partial;
  const stillNeedsCount = compliance.partial + compliance.none;
  const stillNeeds = useMemo(
    () => compliance.employees.filter((e) =>
      e.completed < REQUIRED_TRAININGS_PER_YEAR
      && (needsFilter === 'all' || (needsFilter === 'none' ? e.completed === 0 : e.completed > 0))
    ),
    [compliance, needsFilter]
  );
  const needsPaged = paginate(stillNeeds, needsPage, NEEDS_PAGE_SIZE);

  const exportStillNeeds = () =>
    downloadCsv(
      `employees-needing-training-${currentYear}${office === ALL_OFFICES ? '' : `-${office}`}.csv`,
      [
        ['Employee', 'Department', 'Position', `Trainings completed (of ${REQUIRED_TRAININGS_PER_YEAR})`],
        ...stillNeeds.map((e) => [e.name, e.department, e.position, e.completed]),
      ]
    );

  const fmt = (n: number) => n.toLocaleString('en-US');
  const officeScope = office === ALL_OFFICES ? 'all offices' : office;
  const viewAll = (id: MenuId) => (onNavigate ? () => onNavigate(id) : undefined);

  return (
    <div className="abyan-ds rspdash lnddash">
      <section className="rd-hero">
        <div>
          <p className="ld-crumbs">L&amp;D › <b>Dashboard</b></p>
          {/* Not an <h1>: admin.css forces .admin-content h1 to brand blue with !important. */}
          <div className="rd-hero-title" role="heading" aria-level={1}>Dashboard &amp; Analytics</div>
          <p className="rd-hero-sub">Needs assessment, development plans and trainings for {currentYear}</p>
        </div>
        <div className="ld-controls">
          <div className="rd-filters">
            <div className="rd-seg" role="group" aria-label="Period for training completion">
              {PERIODS.map((p) => (
                <button key={p} type="button" className={period === p ? 'on' : ''} aria-pressed={period === p} onClick={() => setPeriod(p)}>
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <label className="rd-select">
              <span className="sr-only">Office</span>
              <select
                value={office}
                onChange={(e) => chooseOffice(e.target.value)}
                aria-label="Filter by office"
                // Global select rules color every select dark; the hero needs white.
                style={{ color: '#fff' }}
              >
                <option value={ALL_OFFICES}>All offices</option>
                {allOffices.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <span className="rd-asof">As of {today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <p className="ld-hero-note">The period applies to training completion only.</p>
        </div>
      </section>

      <div className="rd-main" aria-busy={loading}>
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

        {/* 1. Training Needs Assessment */}
        <section className={`rd-sec ${loading ? 'ld-loading' : ''}`}>
          <SectionHead
            icon={ClipboardList}
            title="Training Needs Assessment"
            desc={`From rated IPCR data · ${officeScope}`}
            onViewAll={viewAll('training-needs')}
          />
          <div className="rd-stats rd-s3 rd-stats-card">
            <Stat
              label="With skill gaps"
              value={fmt(employeesWithGaps)}
              note={`${pctOf(employeesWithGaps, tnaHeadcount)}% of ${fmt(tnaHeadcount)}`}
              tone={employeesWithGaps > 0 ? 'warn' : undefined}
            />
            <Stat
              label="Offices assessed"
              value={<>{assessedOffices.length}<small>/{officeTotal}</small></>}
              note={officeTotal > assessedOffices.length ? `${officeTotal - assessedOffices.length} pending` : undefined}
              tone={officeTotal > assessedOffices.length ? 'warn' : undefined}
            />
            <Stat
              label="Competencies with gaps"
              value={<>{competenciesWithGaps}<small>/{COMPETENCY_LIST.length}</small></>}
              note={competencyRows[0]?.affected ? `top: ${competencyRows[0].short}` : undefined}
            />
          </div>
        </section>

        {/* 2. Competency Gaps */}
        <section className={`rd-sec ${loading ? 'ld-loading' : ''}`}>
          <SectionHead
            icon={AlertTriangle}
            title="Competency Gaps"
            desc={`${COMPETENCY_LIST.length} competencies · share of each office's employees with a gap`}
            onViewAll={viewAll('summary-of-ratings')}
          />
          <div className="ld-two">
            <Panel title="Competency gaps by category and office" caption="Rows sorted by need across the selected offices">
              {assessedOffices.length === 0 ? (
                <PanelEmpty
                  icon={Grid3x3}
                  title="No assessed gaps yet"
                  text="Each office fills in here once its IPCR ratings are matched to competencies."
                />
              ) : (
                <>
                  <div className="ld-heat-scroll">
                    <div
                      className="ld-heat"
                      style={{ gridTemplateColumns: `minmax(150px, 190px) repeat(${assessedOffices.length}, minmax(64px, 1fr))` }}
                    >
                      <div />
                      {assessedOffices.map((o) => (
                        <div key={o} className="ld-heat-col" title={o}>{o}</div>
                      ))}
                      {competencyRows.map((row) => (
                        <Fragment key={row.competency}>
                          <div className="ld-heat-row" title={row.competency}>{row.short}</div>
                          {assessedOffices.map((o) => {
                            const v = row.byOffice.get(o) ?? 0;
                            const step = heatStep(v);
                            return (
                              <div
                                key={o}
                                className="ld-heat-cell"
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
                  <div className="ld-heat-legend">
                    <span className="rd-subtitle">% of employees with a gap</span>
                    <div className="ld-heat-scale">
                      {HEAT_STEPS.map((s, i) => (
                        <span key={s.label} style={{ background: heatBg(i), color: i >= HEAT_DARK_FROM ? 'var(--color-white)' : 'var(--neutral-800)' }}>
                          {s.label}
                        </span>
                      ))}
                    </div>
                    <span className="ld-muted">Low → high priority</span>
                  </div>
                </>
              )}
            </Panel>
            <Panel title="Top competency needs" caption={`Employees with the gap, of ${fmt(tnaHeadcount)} active`}>
              {competenciesWithGaps === 0 ? (
                <PanelEmpty
                  icon={BarChart2}
                  title="No gaps yet"
                  text="Competencies are ranked here once ratings show at least one gap."
                />
              ) : (
                <div className="ld-rows">
                  {competencyRows.map((row) => (
                    <BarRow
                      key={row.competency}
                      label={row.short}
                      title={row.competency}
                      value={fmt(row.affected)}
                      percent={pctOf(row.affected, tnaHeadcount)}
                    />
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </section>

        {/* 3. Individual Development Plans */}
        <section className={`rd-sec ${loading ? 'ld-loading' : ''}`}>
          <SectionHead
            icon={Target}
            title="Individual Development Plans"
            desc={`${idpCycle} cycle · ${officeScope}`}
            onViewAll={viewAll('idp-form')}
          />
          <div className="rd-stats rd-s3 rd-stats-card">
            <Stat
              label="IDPs submitted"
              value={<>{pctOf(scopedIdpSubs.length, headcount)}<small>%</small></>}
              note={`${fmt(scopedIdpSubs.length)} of ${fmt(headcount)}`}
              tone={headcount > 0 && scopedIdpSubs.length === 0 ? 'risk' : undefined}
            />
            <Stat
              label="Offices with IDPs"
              value={<>{officesWithIdps}<small>/{offices.length}</small></>}
              tone={officesWithIdps < offices.length ? 'warn' : undefined}
            />
            <Stat
              label="Top requested tag"
              value={idpTopTag?.total ? fmt(idpTopTag.total) : '—'}
              note={idpTopTag?.total ? idpTopTag.label : 'no IDPs yet'}
            />
          </div>
          <div className="ld-two">
            <Panel title="IDP submission by office" caption="Active employees who submitted this cycle">
              {offices.length === 0 ? (
                <PanelEmpty icon={Users} title="No employees" text="Offices appear here once they have active employees." />
              ) : (
                <div className="ld-rows">
                  {idpByOffice.map((o) => (
                    <BarRow
                      key={o.office}
                      label={o.office}
                      value={<>{o.submitted}<span className="ld-muted"> / {o.total}</span></>}
                      percent={pctOf(o.submitted, o.total)}
                    />
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Development requests by tag" caption="Employees who ticked each tag; one person can tick several">
              {scopedIdpSubs.length === 0 ? (
                <PanelEmpty
                  icon={Target}
                  title="No IDPs yet"
                  text={`Tag counts appear here as employees submit their ${idpCycle} IDPs.`}
                />
              ) : (
                <div className="ld-rows">
                  {idpTagRows.map((r) => (
                    <BarRow key={r.tag} label={r.label} value={fmt(r.total)} percent={pctOf(r.total, idpTagMax)} />
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </section>

        {/* 4. Trainings */}
        <section className={`rd-sec ${loading ? 'ld-loading' : ''}`}>
          <SectionHead
            icon={GraduationCap}
            title="Trainings"
            desc={`Completion ${PERIOD_LABEL[period].toLowerCase()} · ${REQUIRED_TRAININGS_PER_YEAR}-training rule for ${currentYear}`}
            onViewAll={viewAll('training-calendar')}
          />
          <div className="rd-stats rd-s3 rd-stats-card">
            <Stat
              label={`Completion · ${PERIOD_LABEL[period].toLowerCase()}`}
              value={<>{progress.percent}<small>%</small></>}
              note={`${progress.completed} of ${progress.total} trainings`}
            />
            <Stat
              label={`Met ${REQUIRED_TRAININGS_PER_YEAR}-training rule`}
              value={<>{pctOf(compliance.met, compliance.total)}<small>%</small></>}
              note={`${fmt(stillNeedsCount)} still need training`}
              tone={stillNeedsCount > 0 ? 'warn' : undefined}
            />
            <Stat
              label="Trained at least once"
              value={fmt(trainedAtLeastOnce)}
              note={`${pctOf(trainedAtLeastOnce, compliance.total)}% of employees`}
            />
          </div>

          <Panel
            title={`Employees who completed their ${REQUIRED_TRAININGS_PER_YEAR} required trainings`}
            caption={`Counts finished trainings marked Present · ${fmt(compliance.total)} employees · ${currentYear}`}
          >
            <ComplianceBar met={compliance.met} partial={compliance.partial} none={compliance.none} large showCounts />
            <div className="rd-legend ld-legend-gap">
              <span style={{ ['--c' as string]: COMPLIANCE_COLORS.met }}>Completed {REQUIRED_TRAININGS_PER_YEAR} of {REQUIRED_TRAININGS_PER_YEAR}</span>
              <span style={{ ['--c' as string]: COMPLIANCE_COLORS.partial }}>1 so far, needs 1 more</span>
              <span style={{ ['--c' as string]: COMPLIANCE_COLORS.none }}>0 so far, needs {REQUIRED_TRAININGS_PER_YEAR}</span>
            </div>
            <p className="rd-subtitle ld-sub-gap">By office</p>
            <div className="ld-rows">
              {compliance.byDepartment.map((d) => (
                <div key={d.department} className="ld-row">
                  <button
                    type="button"
                    className="ld-row-l ld-row-btn"
                    onClick={() => chooseOffice(d.department)}
                    title={`Show only ${d.department}`}
                  >
                    {d.department}
                  </button>
                  <ComplianceBar met={d.met} partial={d.partial} none={d.none} />
                  <b className="ld-row-n">{d.percentMet}%</b>
                </div>
              ))}
            </div>
            <p className="ld-muted ld-sub-gap">Most complete office first. Select an office to filter the whole dashboard. Trainings with no attendance marked count for no one.</p>
          </Panel>

          <Panel
            title="Still needs training"
            caption={`${fmt(stillNeedsCount)} employee${stillNeedsCount === 1 ? '' : 's'} below ${REQUIRED_TRAININGS_PER_YEAR} of ${REQUIRED_TRAININGS_PER_YEAR} · fewest trainings first`}
            action={
              <button type="button" onClick={exportStillNeeds} disabled={stillNeeds.length === 0} className="btn btn-secondary btn-sm shrink-0">
                Export list
              </button>
            }
          >
            <div className="rd-seg-light ld-filter" role="group" aria-label="Trainings completed">
              {([
                ['all', `All ${stillNeedsCount}`],
                ['none', `0 of ${REQUIRED_TRAININGS_PER_YEAR} · ${compliance.none}`],
                ['partial', `1 of ${REQUIRED_TRAININGS_PER_YEAR} · ${compliance.partial}`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={needsFilter === key ? 'on' : ''}
                  aria-pressed={needsFilter === key}
                  onClick={() => { setNeedsFilter(key); setNeedsPage(1); }}
                >
                  {label}
                </button>
              ))}
            </div>
            {stillNeeds.length === 0 ? (
              <PanelEmpty
                icon={GraduationCap}
                title={loading ? 'Loading…' : 'Everyone here has met the requirement'}
                text={`Employees below ${REQUIRED_TRAININGS_PER_YEAR} trainings this year are listed here.`}
              />
            ) : (
              <>
                <div className="abyan-table-wrap is-flush ld-table-scroll">
                  <table className="abyan-table is-compact ld-table">
                    <thead>
                      <tr>
                        <th scope="col">Employee</th>
                        <th scope="col">Office</th>
                        <th scope="col">Position</th>
                        <th scope="col" className="n">Trainings completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {needsPaged.pageItems.map((e) => (
                        <tr key={e.id}>
                          <td className="ld-strong">{e.name}</td>
                          <td>{e.department}</td>
                          <td>{e.position || '—'}</td>
                          <td className="n">
                            <span className={`rd-pill ${e.completed === 0 ? 'rd-p-risk' : 'rd-p-warn'}`}>
                              {e.completed} / {REQUIRED_TRAININGS_PER_YEAR}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  total={stillNeeds.length}
                  page={needsPaged.current}
                  pageSize={NEEDS_PAGE_SIZE}
                  onPageChange={setNeedsPage}
                  itemLabel="employees"
                  label="Still needs training pages"
                />
              </>
            )}
          </Panel>
        </section>
      </div>
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
              <LndDashboardContent onNavigate={viewOnly ? undefined : setActiveModule} />
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
