// Presentational pieces for the Interviewer Dashboard. All styling comes from
// abyan-tokens.css (Design Identity tokens) + interviewer-dashboard.css.

import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock,
  FileText,
  Hourglass,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  STATUS_OPTIONS,
  formatDate,
  formatTime,
  getDateStatus,
  getPageList,
  matchesSearch,
  matchesStatus,
  paginate,
  type CandidateRow,
  type DateStatus,
  type KpiKey,
  type StatusFilter,
} from './interviewerDashboardModel';

// ── KPI configuration ────────────────────────────────────────────────────
interface KpiConfig {
  title: string;
  tone: 'warning' | 'primary' | 'success';
  headerIcon: LucideIcon;
  chipIcon: LucideIcon;
  subtext: (n: number) => string;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyHint: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const KPI_ORDER: KpiKey[] = ['pending', 'today', 'completed'];

export const KPI_CONFIG: Record<KpiKey, KpiConfig> = {
  pending: {
    title: 'To evaluate',
    tone: 'warning',
    headerIcon: ClipboardCheck,
    chipIcon: Hourglass,
    subtext: (n) => `${plural(n, 'applicant')} waiting`,
    emptyIcon: CircleCheck,
    emptyTitle: 'Nothing to evaluate.',
    emptyHint: "You're all caught up.",
  },
  today: {
    title: 'Due today',
    tone: 'primary',
    headerIcon: CalendarClock,
    chipIcon: Clock,
    subtext: (n) => `${plural(n, 'interview')} scheduled`,
    emptyIcon: CalendarClock,
    emptyTitle: 'No interviews scheduled today.',
    emptyHint: 'Upcoming dates are in the postings table.',
  },
  completed: {
    title: 'Completed',
    tone: 'success',
    headerIcon: CircleCheck,
    chipIcon: BadgeCheck,
    subtext: (n) => `${n} submitted this month`,
    emptyIcon: FileText,
    emptyTitle: 'No completed evaluations yet.',
    emptyHint: 'Evaluations you submit this month appear here.',
  },
};

const rowMeta = (kpi: KpiKey, row: CandidateRow) => {
  const when =
    kpi === 'completed'
      ? formatDate(row.evaluatedAt)
      : kpi === 'today'
        ? formatTime(row.interviewTime) || formatDate(row.interviewDate)
        : row.interviewDate ? formatDate(row.interviewDate) : 'Not scheduled';
  return [row.position, row.department, when].filter(Boolean).join(' · ');
};

// ── Small shared pieces ──────────────────────────────────────────────────
export const useDebouncedValue = <T,>(value: T, delay = 250) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

const DATE_BADGE: Record<DateStatus, { label: string; className: string }> = {
  today: { label: 'Today', className: 'badge-warning' },
  upcoming: { label: 'Upcoming', className: 'badge-info' },
  past: { label: 'Past', className: 'badge-neutral' },
};

export function DateCell({ raw, todayKey }: { raw: string; todayKey: string }) {
  if (!raw) return <span className="ivd-muted">Not scheduled</span>;
  const status = getDateStatus(raw, todayKey);
  return (
    <span className="ivd-date">
      <span className="ivd-date-text">{formatDate(raw)}</span>
      {status && (
        <span className={`badge ${DATE_BADGE[status].className}`}>
          <span className="badge-dot" aria-hidden="true" />
          {DATE_BADGE[status].label}
        </span>
      )}
    </span>
  );
}

// §10: For Interview = warning, Qualified/approved-type outcomes = success.
export function EvalStatusBadge({ evaluated }: { evaluated: boolean }) {
  return evaluated ? (
    <span className="badge badge-success"><span className="badge-dot" aria-hidden="true" />Completed</span>
  ) : (
    <span className="badge badge-warning"><span className="badge-dot" aria-hidden="true" />To evaluate</span>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="ivd-field ivd-field--search">
      <span className="sr-only">{label}</span>
      <Search className="ivd-field-icon" size={20} strokeWidth={1.75} aria-hidden="true" />
      <input type="search" className="ivd-input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function SelectField({
  value,
  onChange,
  label,
  options,
  icon: Icon,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: Array<{ value: string; label: string }>;
  icon?: LucideIcon;
}) {
  return (
    <label className={`ivd-field${Icon ? '' : ' ivd-field--plain'}`}>
      <span className="sr-only">{label}</span>
      {Icon && <Icon className="ivd-field-icon" size={20} strokeWidth={1.75} aria-hidden="true" />}
      <select className="ivd-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown className="ivd-field-caret" size={16} strokeWidth={1.75} aria-hidden="true" />
    </label>
  );
}

export const departmentOptions = (departments: string[]) => [
  { value: 'all', label: 'Department: All' },
  ...departments.map((d) => ({ value: d, label: d })),
];

export const statusOptions = STATUS_OPTIONS.map((o) =>
  o.value === 'all' ? { value: o.value, label: 'Status: All' } : { value: o.value, label: o.label },
);

export function Pager({
  total,
  page,
  pageSize,
  onPage,
  label,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  label: string;
}) {
  if (total === 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  return (
    <nav className="ivd-pager" aria-label={label}>
      <span className="ivd-pager-info text-body-s">
        Showing {start + 1}–{Math.min(start + pageSize, total)} of {total} entries
      </span>
      {pageCount > 1 && (
        <div className="ivd-pager-btns">
          <button type="button" className="ivd-page ivd-page--nav" onClick={() => onPage(current - 1)} disabled={current === 1}>
            <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" /> Previous
          </button>
          {getPageList(current, pageCount).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="ivd-page-num ivd-muted" aria-hidden="true">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={`ivd-page ivd-page-num${p === current ? ' is-active' : ''}`}
                onClick={() => onPage(p)}
                aria-current={p === current ? 'page' : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className="ivd-page ivd-page--nav" onClick={() => onPage(current + 1)} disabled={current === pageCount}>
            Next <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────
export function KpiCard({
  kpi,
  rows,
  loading,
  onOpen,
  cardRef,
}: {
  kpi: KpiKey;
  rows: CandidateRow[];
  loading: boolean;
  onOpen: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const config = KPI_CONFIG[kpi];
  const HeaderIcon = config.headerIcon;
  const ChipIcon = config.chipIcon;
  const EmptyIcon = config.emptyIcon;
  const toneClass = config.tone === 'primary' ? '' : ` ivd-kpi--${config.tone}`;

  if (loading) {
    return (
      <div className="ivd-kpi ivd-kpi--skeleton" aria-hidden="true">
        <div className="ivd-kpi-head">
          <span className="ivd-skel" style={{ width: 120, height: 20 }} />
          <span className="ivd-skel" style={{ width: 24, height: 24 }} />
        </div>
        <div className="ivd-kpi-strip">
          <span className="ivd-skel" style={{ width: 40, height: 40, borderRadius: 'var(--radius-chip)' }} />
          <span className="ivd-skel" style={{ width: 140, height: 36 }} />
        </div>
        <div className="ivd-kpi-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="ivd-kpi-row">
              <span className="ivd-skel" style={{ width: 40, height: 40, borderRadius: 'var(--radius-chip)' }} />
              <span style={{ flex: 1 }}>
                <span className="ivd-skel" style={{ width: '60%', height: 14, marginBottom: 6 }} />
                <span className="ivd-skel" style={{ width: '85%', height: 12 }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const activate = () => onOpen();
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  };

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`${config.title}: ${rows.length}. ${config.subtext(rows.length)}. Open the full list.`}
      className={`ivd-kpi${toneClass}`}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      <div className="ivd-kpi-head">
        <h3 className="ivd-kpi-title text-title-s">{config.title}</h3>
        <HeaderIcon className="ivd-kpi-head-icon" size={22} strokeWidth={1.75} aria-hidden="true" />
      </div>

      <div className="ivd-kpi-strip">
        <span className="ivd-kpi-chip" aria-hidden="true"><ChipIcon size={20} strokeWidth={1.75} /></span>
        <span className="ivd-kpi-value text-title-l">{rows.length}</span>
        <span className="ivd-kpi-sub text-body-s">{config.subtext(rows.length)}</span>
      </div>

      {rows.length === 0 ? (
        <div className="ivd-kpi-empty">
          <EmptyIcon size={24} strokeWidth={1.75} aria-hidden="true" />
          <p className="text-headline-m">{config.emptyTitle}</p>
          <p className="text-body-s">{config.emptyHint}</p>
        </div>
      ) : (
        <ul className="ivd-kpi-list">
          {rows.slice(0, 3).map((row) => {
            const meta = rowMeta(kpi, row);
            return (
              <li key={row.id} className="ivd-kpi-row">
                <span className="ivd-row-chip" aria-hidden="true"><FileText size={18} strokeWidth={1.75} /></span>
                <span className="ivd-kpi-row-text">
                  <span className="ivd-kpi-row-name" title={row.name}>{row.name}</span>
                  <span className="ivd-kpi-row-meta text-body-s" title={meta}>{meta}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Visual only: the whole card is the button. */}
      <span className="ivd-kpi-foot btn btn-sm btn-secondary" aria-hidden="true">
        View all ({rows.length}) <ArrowRight size={16} strokeWidth={1.75} />
      </span>
    </div>
  );
}

// ── Wide list modal (§9.10 "large") ──────────────────────────────────────
const MODAL_PAGE_SIZE = 8;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CandidateListModal({
  kpi,
  rows,
  departments,
  todayKey,
  onClose,
  onEvaluate,
  onView,
}: {
  kpi: KpiKey;
  rows: CandidateRow[];
  departments: string[];
  todayKey: string;
  onClose: () => void;
  onEvaluate: (row: CandidateRow) => void;
  onView: (row: CandidateRow) => void;
}) {
  const config = KPI_CONFIG[kpi];
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const query = useDebouncedValue(search.trim().toLowerCase());

  const filtered = useMemo(
    () => rows.filter((row) =>
      matchesSearch(row, query) &&
      (department === 'all' || row.department === department) &&
      matchesStatus(row, status, todayKey)),
    [rows, query, department, status, todayKey],
  );
  useEffect(() => { setPage(1); }, [query, department, status]);
  const { current, pageItems } = paginate(filtered, page, MODAL_PAGE_SIZE);

  // Lock page scroll, focus the first field, trap Tab, close on Esc.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (panelRef.current?.querySelector<HTMLElement>('input') ?? panelRef.current?.querySelector<HTMLElement>('button'))?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusables = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="ivd-modal-overlay ivd-modal-overlay--list" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} className="ivd-modal ivd-modal--large" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ivd-modal-head">
          <div>
            <h2 id={titleId} className="text-title-m">{config.title}</h2>
            <p className="text-body-m">{config.subtext(rows.length)}</p>
          </div>
          <button type="button" className="ivd-icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        <div className="ivd-toolbar ivd-toolbar--modal">
          <SearchField value={search} onChange={setSearch} label="Search candidates" placeholder="Search candidate, position, or office…" />
          <SelectField value={department} onChange={setDepartment} label="Department" options={departmentOptions(departments)} icon={Building2} />
          <SelectField value={status} onChange={(v) => setStatus(v as StatusFilter)} label="Status" options={statusOptions} />
        </div>

        <div className="abyan-table-wrap">
          <table className="abyan-table">
            <thead>
              <tr>
                <th scope="col">Candidate</th>
                <th scope="col">Position</th>
                <th scope="col">Department</th>
                <th scope="col">Interview date</th>
                <th scope="col">Status</th>
                <th scope="col" className="is-action"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="ivd-cell-empty">
                    <div className="ivd-empty">
                      <div className="ivd-empty-icon" aria-hidden="true"><FileText size={24} strokeWidth={1.75} /></div>
                      <h3 className="text-title-s">{rows.length === 0 ? config.emptyTitle : 'No candidates match these filters.'}</h3>
                      <p className="text-body-m">{rows.length === 0 ? config.emptyHint : 'Try another department or status.'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pageItems.map((row) => (
                  <tr key={row.id}>
                    <td className="ivd-cell-primary">
                      <span className="ivd-job-title" title={row.name}>{row.name}</span>
                      {/* §10: application type is a category, so it takes the brand tint */}
                      {row.appType === 'Promotional' && <span className="badge badge-tint ivd-type-tag">Promotional</span>}
                    </td>
                    <td data-label="Position">
                      {row.position}
                      {row.currentPosition && (
                        <span className="ivd-job-meta text-body-s">From: {row.currentPosition}</span>
                      )}
                    </td>
                    <td data-label="Department">{row.department}</td>
                    <td className="ivd-cell-wide" data-label="Interview date">
                      <DateCell raw={row.interviewDate} todayKey={todayKey} />
                      {kpi === 'today' && row.interviewTime && (
                        <span className="ivd-job-meta text-body-s">{formatTime(row.interviewTime)}</span>
                      )}
                    </td>
                    <td data-label="Status"><EvalStatusBadge evaluated={row.evaluated} /></td>
                    <td className="is-action">
                      {row.evaluated ? (
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => onView(row)} aria-label={`View ${row.name}`}>
                          View
                        </button>
                      ) : (
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => onEvaluate(row)} aria-label={`Evaluate ${row.name}`}>
                          Evaluate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pager total={filtered.length} page={current} pageSize={MODAL_PAGE_SIZE} onPage={setPage} label={`${config.title} pages`} />
      </div>
    </div>
  );
}
