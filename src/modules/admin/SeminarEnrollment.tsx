/**
 * L&D Seminar Enrollment — the whole attendee pipeline, tabbed by status.
 *
 * The five subtabs are five reads of training_recommendations, ordered to match
 * the workflow they represent:
 *
 *   Recommendation  → AI-suggested attendees for NEXT month's courses.
 *   Sent to Office  → handed to the offices as a batch; awaiting their review.
 *   Returned        → offices sent them back, with an audit trail of changes.
 *   Enrolled        → enrolled, then finalized (roster locked).
 *   Published       → visible to employees. One-way; the DB blocks reopening.
 *
 * Every tab is a collapsed-by-default list of COURSE rows: a scannable month at a
 * glance, expanding inline to the attendee detail. On the Recommendation tab each
 * course also has a manual "+ Add Attendee" picker for people the AI didn't
 * surface (new hires, succession, cross-training) — routed through the same
 * pipeline, tagged as admin-selected.
 *
 * Monthly cadence: a month's rosters must be published before that month begins,
 * so recommendations only ever target next month. The 3-day lock from
 * trainingLifecycle applies here too.
 */

import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Lightbulb,
  Lock,
  Plus,
  Send,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import {
  enrollFinalAttendees,
  finalizeRoster,
  generateRecommendations,
  getManualPickerOffices,
  getOfficeEmployeesWithScores,
  listAllRecommendations,
  listRecommendationCandidates,
  listRecommendationEvents,
  listRosterGroups,
  listNextMonthPublishedCourses,
  lndAddAttendees,
  publishRoster,
  sendBatchToOffice,
  dismissRecommendation,
  type NextMonthCourse,
  type PickerEmployee,
  type PickerOffice,
  type PipelineRecFull,
  type RecommendationEvent,
  type RosterGroup,
} from '../../lib/api/trainingRecommendations';
import { computeNeedsAssessment } from '../../lib/api/trainingNeeds';
import { isLocked, LOCK_LEAD_DAYS } from '../../lib/api/trainingLifecycle';
import { categoryColor } from './trainingCategories';

type Subtab = 'recommendation' | 'sent' | 'returned' | 'enrolled' | 'published';

const SUBTABS: { id: Subtab; label: string }[] = [
  { id: 'recommendation', label: 'Recommendation' },
  { id: 'sent', label: 'Sent to Office Account' },
  { id: 'returned', label: 'Returned to L&D' },
  { id: 'enrolled', label: 'Enrolled / Finalized' },
  { id: 'published', label: 'Published' },
];

const LND_ACTOR = 'L&D Admin';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const monthName = (offset: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const CategoryTag = ({ category }: { category: string | null }) => {
  if (!category) return null;
  const color = categoryColor(category);
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      {category}
    </span>
  );
};

type Group = {
  sessionId: string;
  title: string;
  category: string | null;
  start: string;
  capacity: number;
  recs: PipelineRecFull[];
};

const groupBySession = (recs: PipelineRecFull[]): Group[] => {
  const map = new Map<string, Group>();
  for (const r of recs) {
    let g = map.get(r.sessionId);
    if (!g) {
      g = {
        sessionId: r.sessionId,
        title: r.sessionTitle,
        category: r.sessionCategory,
        start: r.sessionStart,
        capacity: r.sessionCapacity,
        recs: [],
      };
      map.set(r.sessionId, g);
    }
    g.recs.push(r);
  }
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
};

/** "Locked — starts in 2 days", or null when the roster is still editable. */
const lockNote = (start: string): string | null => {
  if (!isLocked(start)) return null;
  const days = Math.ceil((new Date(start).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Locked — already started';
  if (days === 0) return 'Locked — starts today';
  return `Locked — starts in ${days} day${days === 1 ? '' : 's'}`;
};

/**
 * A collapsed course row: the whole header toggles expand/collapse; interactive
 * controls inside it stop propagation so they don't also toggle. Children render
 * only when expanded. `accentAmber` draws the left border that flags a course
 * needing manual attention (0 AI matches).
 */
const CollapsibleCourse = ({
  title,
  category,
  start,
  count,
  capacity,
  badge,
  actions,
  accentAmber,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  category: string | null;
  start: string;
  count: number;
  capacity: number;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  accentAmber?: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => {
  const note = lockNote(start);
  return (
    <section
      className={`overflow-hidden rounded-xl border bg-white ${
        accentAmber ? 'border-gray-200 border-l-4 border-l-amber-400' : 'border-gray-200'
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50/70"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <CategoryTag category={category} />
          <span className="text-xs text-gray-400">
            {fmtDate(start)} · {count} attendee{count === 1 ? '' : 's'}
            {capacity ? ` / ${capacity} slots` : ''}
          </span>
          {note && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
              <Lock className="h-2.5 w-2.5" /> {note}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {badge}
          {actions}
        </div>
      </div>
      {expanded && <div className="border-t border-gray-100">{children}</div>}
    </section>
  );
};

const AttendeeRow = ({
  rec,
  trailing,
}: {
  rec: PipelineRecFull;
  trailing?: React.ReactNode;
}) => {
  const manual = rec.source === 'lnd_manual';
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">{rec.employeeName}</span>
          {manual && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600">
              <UserPlus className="h-2.5 w-2.5" /> Added manually
            </span>
          )}
          {rec.source === 'office_account_added' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
              <UserPlus className="h-2.5 w-2.5" /> office added
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-gray-500">
          {rec.department ?? '—'}
          {manual
            ? ' · Added by L&D (not AI-matched)'
            : `${rec.competency ? ` · ${rec.competency}` : ''}${rec.gapDetail ? ` · ${rec.gapDetail}` : ''}`}
        </p>
      </div>
      {trailing}
    </li>
  );
};

// ── Add Attendee picker ──────────────────────────────────────────────────────

type PickerTarget = {
  sessionId: string;
  title: string;
  competencies: string[];
  capacity: number;
  currentCount: number;
  existingIds: Set<string>;
};

const AddAttendeeModal = ({
  target,
  onClose,
  onAdded,
}: {
  target: PickerTarget;
  onClose: () => void;
  onAdded: (added: number) => void;
}) => {
  const [offices, setOffices] = useState<PickerOffice[]>([]);
  const [loadingOffices, setLoadingOffices] = useState(true);
  const [openOffice, setOpenOffice] = useState<string | null>(null);
  const [employeesByOffice, setEmployeesByOffice] = useState<Record<string, PickerEmployee[]>>({});
  const [loadingOffice, setLoadingOffice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await getManualPickerOffices(target.competencies);
      if (!cancelled) {
        setOffices(list);
        setLoadingOffices(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target.competencies]);

  const openOfficeRow = async (office: string) => {
    if (openOffice === office) {
      setOpenOffice(null);
      return;
    }
    setOpenOffice(office);
    if (!employeesByOffice[office]) {
      setLoadingOffice(office);
      const emps = await getOfficeEmployeesWithScores(office);
      setEmployeesByOffice((prev) => ({ ...prev, [office]: emps }));
      setLoadingOffice(null);
    }
  };

  const toggle = (id: string) => {
    setError(null); // clear any prior error when selection changes
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const projected = target.currentCount + selected.size;
  const overCapacity = target.capacity > 0 && projected > target.capacity;
  const canConfirm = selected.size > 0 && (!overCapacity || override) && !busy;

  const confirm = async () => {
    setError(null);
    setBusy(true);
    const res = await lndAddAttendees({
      sessionId: target.sessionId,
      employeeIds: [...selected],
      competency: target.competencies[0] ?? null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Failed to add attendee(s). Please try again.');
      return;
    }
    onAdded(res.added ?? 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">Add attendees</h2>
            <p className="mt-0.5 truncate text-sm text-gray-500">{target.title}</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Offices ranked by how closely their skill-gap profile matches this course
              {target.competencies.length ? ` (${target.competencies.join(', ')})` : ''}.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loadingOffices ? (
            <p className="py-8 text-center text-sm text-gray-500">Ranking offices by relevance…</p>
          ) : (
            <div className="space-y-2">
              {offices.map((o, i) => {
                const open = openOffice === o.office;
                const emps = employeesByOffice[o.office] ?? [];
                return (
                  <div key={o.office} className="overflow-hidden rounded-xl border border-gray-200">
                    <button
                      type="button"
                      onClick={() => void openOfficeRow(o.office)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
                        />
                        <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
                        <span className="truncate text-sm font-semibold text-gray-900">{o.office}</span>
                        {i === 0 && o.relatedGapCount > 0 && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                            most relevant
                          </span>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          o.relatedGapCount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {o.relatedGapCount} related gap{o.relatedGapCount === 1 ? '' : 's'}
                      </span>
                    </button>
                    {open && (
                      <div className="border-t border-gray-100">
                        {loadingOffice === o.office ? (
                          <p className="px-4 py-3 text-xs text-gray-500">Loading employees…</p>
                        ) : emps.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-gray-500">No active employees in this office.</p>
                        ) : (
                          <ul className="divide-y divide-gray-50">
                            {emps.map((e) => {
                              const already = target.existingIds.has(e.id);
                              const checked = selected.has(e.id);
                              return (
                                <li key={e.id}>
                                  <label
                                    className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${
                                      already ? 'opacity-50' : 'cursor-pointer hover:bg-blue-50/40'
                                    }`}
                                  >
                                    <div className="flex min-w-0 items-center gap-2.5">
                                      <input
                                        type="checkbox"
                                        disabled={already}
                                        checked={checked}
                                        onChange={() => toggle(e.id)}
                                        className="h-3.5 w-3.5 accent-blue-600"
                                      />
                                      <div className="min-w-0">
                                        <span className="font-medium text-gray-900">{e.name}</span>
                                        {e.position && (
                                          <span className="text-[11px] text-gray-400"> · {e.position}</span>
                                        )}
                                      </div>
                                    </div>
                                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-gray-500">
                                      {already ? (
                                        <span className="font-semibold text-gray-400">already on this course</span>
                                      ) : e.hasIpcr ? (
                                        <>
                                          <GraduationCap className="h-3 w-3 text-gray-400" />
                                          IPCR {e.overallLabel}
                                          {e.cycle ? ` · ${e.cycle}` : ''}
                                        </>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                          <GraduationCap className="h-2.5 w-2.5" />
                                          New employee — no rating yet
                                        </span>
                                      )}
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-6 py-3">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {overCapacity && (
            <label className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-amber-600"
              />
              <span>
                This would fill <strong>{projected}</strong> of <strong>{target.capacity}</strong> slots —
                over capacity. Add anyway (you may need to request more slots or waitlist).
              </span>
            </label>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500">
              {selected.size} selected
              {target.capacity ? ` · ${projected}/${target.capacity} slots after adding` : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={() => void confirm()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {busy ? 'Adding…' : `Add ${selected.size || ''} attendee${selected.size === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SeminarEnrollment = () => {
  const [subtab, setSubtab] = useState<Subtab>('recommendation');
  const [candidates, setCandidates] = useState<PipelineRecFull[]>([]);
  const [courses, setCourses] = useState<NextMonthCourse[]>([]);
  const [all, setAll] = useState<PipelineRecFull[]>([]);
  const [events, setEvents] = useState<RecommendationEvent[]>([]);
  // Enrolled/Published read the roster, not the recommendation pipeline: rosters
  // seeded outside that flow (July's) have no recommendation rows at all.
  const [rosters, setRosters] = useState<RosterGroup[]>([]);
  const [topDemand, setTopDemand] = useState<{ competency: string; demand: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [cands, everything, rosterGroups, publishedCourses, needs] = await Promise.all([
      listRecommendationCandidates(),
      listAllRecommendations(),
      listRosterGroups([0, 1]),
      listNextMonthPublishedCourses(),
      computeNeedsAssessment(),
    ]);
    setCandidates(cands);
    setAll(everything);
    setRosters(rosterGroups);
    setCourses(publishedCourses);
    const top = [...needs].sort((a, b) => b.demand - a.demand)[0];
    setTopDemand(top ? { competency: top.competency, demand: top.demand } : null);
    setEvents(await listRecommendationEvents([...new Set(everything.map((r) => r.sessionId))]));
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Sync on open: regenerate recommendations from the latest published
      // calendar courses + IPCR data, so newly published courses arrive here
      // already matched — no manual Regenerate needed. Failures are non-fatal;
      // the pipeline still loads whatever is already there.
      setBusy('regen');
      await generateRecommendations().catch(() => {});
      if (cancelled) return;
      setBusy(null);
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const say = (tone: 'ok' | 'err', text: string) => {
    setNotice({ tone, text });
    window.setTimeout(() => setNotice(null), 5000);
  };

  const byStatus = useCallback(
    (statuses: string[]) => groupBySession(all.filter((r) => statuses.includes(r.status))),
    [all],
  );

  const recGroups = useMemo(() => groupBySession(candidates), [candidates]);

  // Coverage (Task 2): one entry per PUBLISHED next-month course, whether or not
  // the AI matched anyone. A course with no candidates is shown flagged for
  // review rather than silently missing. Courses still in planning (dashed on
  // the calendar) are intentionally excluded — recommendations only cover
  // published courses.
  const coverage = useMemo<{ course: NextMonthCourse; group: Group | null }[]>(() => {
    const byId = new Map(recGroups.map((g) => [g.sessionId, g]));
    return courses
      .map((course) => ({ course, group: byId.get(course.sessionId) ?? null }))
      .sort((a, b) => a.course.start.localeCompare(b.course.start));
  }, [courses, recGroups]);

  // For a published course with no SUGGESTED candidates, distinguish "genuinely
  // nobody matched" from "already routed downstream" (its recommendations moved
  // past SUGGESTED into a later tab) — so an advanced course isn't mislabelled
  // "0 matches".
  const routedBySession = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) {
      if (r.status === 'SUGGESTED') continue;
      m.set(r.sessionId, (m.get(r.sessionId) ?? 0) + 1);
    }
    return m;
  }, [all]);

  const sentGroups = useMemo(() => byStatus(['LND_APPROVED', 'OFFICE_ADDED']), [byStatus]);
  const returnedGroups = useMemo(() => byStatus(['OFFICE_FINALIZED']), [byStatus]);
  // A roster is "enrolled" until it is published; publishing moves it on.
  const enrolledRosters = useMemo(() => rosters.filter((r) => !r.publishedAt), [rosters]);
  const publishedRosters = useMemo(() => rosters.filter((r) => !!r.publishedAt), [rosters]);

  const counts: Record<Subtab, number> = {
    recommendation: coverage.length,
    sent: sentGroups.length,
    returned: returnedGroups.length,
    enrolled: enrolledRosters.length,
    published: publishedRosters.length,
  };

  // Next month's PUBLISHED courses whose roster has not been published yet — the
  // cadence rule says every course's roster must be published before that month
  // starts. Driven by the course list (not just courses that happen to have
  // recommendations), so a published course with zero matches still counts.
  const cadenceWarning = useMemo(() => {
    const rosterPublished = new Set<string>([
      ...all.filter((r) => r.status === 'PUBLISHED').map((r) => r.sessionId),
      ...publishedRosters.map((r) => r.sessionId),
    ]);
    return courses.filter((c) => !rosterPublished.has(c.sessionId)).length;
  }, [courses, all, publishedRosters]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleExpand = (sessionId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(sessionId) ? next.delete(sessionId) : next.add(sessionId);
      return next;
    });

  const openPicker = (course: NextMonthCourse) =>
    setPicker({
      sessionId: course.sessionId,
      title: course.title,
      competencies: course.competencies,
      capacity: course.capacity,
      currentCount: all.filter(
        (r) => r.sessionId === course.sessionId && r.status !== 'DISMISSED',
      ).length,
      existingIds: new Set(
        all.filter((r) => r.sessionId === course.sessionId).map((r) => r.employeeId),
      ),
    });

  /**
   * Recompute the AI pass. Moved here from Training Calendar: the engine is
   * unchanged, but regenerating belongs next to the list it produces.
   */
  const regenerate = async () => {
    setBusy('regen');
    const res = await generateRecommendations();
    setBusy(null);
    if (!res.ok) return say('err', res.error ?? 'Could not regenerate recommendations.');
    say(
      'ok',
      `Recommendations updated — ${res.upserted ?? 0} match(es) across ${res.employeesConsidered ?? 0} employee(s) with finalized-IPCR development gaps.`,
    );
    await refresh();
  };

  const sendSelected = async () => {
    setBusy('send');
    const res = await sendBatchToOffice([...selected], LND_ACTOR);
    setBusy(null);
    if (!res.ok) return say('err', res.error);
    say('ok', `Sent ${selected.size} recommendation(s) to the offices.`);
    setSelected(new Set());
    await refresh();
  };

  const reject = async (id: string) => {
    setBusy(id);
    const res = await dismissRecommendation(id, 'Rejected by L&D during review.');
    setBusy(null);
    if (!res.ok) return say('err', res.error);
    await refresh();
  };

  const enroll = async (sessionId: string) => {
    setBusy(sessionId);
    const res = await enrollFinalAttendees(sessionId, LND_ACTOR);
    setBusy(null);
    if (!res.ok) return say('err', res.error);
    say('ok', `Enrolled ${res.enrolled?.length ?? 0} attendee(s).`);
    await refresh();
  };

  const finalize = async (sessionId: string) => {
    setBusy(sessionId);
    const res = await finalizeRoster(sessionId);
    setBusy(null);
    if (!res.ok) return say('err', res.error);
    say('ok', 'Roster finalized — no further changes.');
    await refresh();
  };

  const publish = async (sessionId: string) => {
    setBusy(sessionId);
    const res = await publishRoster(sessionId);
    setBusy(null);
    if (!res.ok) return say('err', res.error);
    say('ok', 'Roster published to employees.');
    await refresh();
  };

  const onAttendeesAdded = async (added: number) => {
    setPicker(null);
    if (added > 0) say('ok', `Added ${added} attendee${added === 1 ? '' : 's'} manually.`);
    else say('ok', 'No new attendees added (already on the course).');
    await refresh();
  };

  const eventsFor = (sessionId: string) => events.filter((e) => e.sessionId === sessionId);

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Users className="h-6 w-6 text-blue-600" />
          Seminar Enrollment
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Recommend, route, and publish attendee lists. Recommendations target{' '}
          <strong>{monthName(1)}</strong> — next month's rosters are built this month.
        </p>
      </header>

      {cadenceWarning > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{cadenceWarning}</strong> {monthName(1)} course
            {cadenceWarning === 1 ? '' : 's'} not yet published. A month's rosters must be
            published before that month begins.
          </span>
        </div>
      )}

      {notice && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-xs font-semibold ${
            notice.tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
        {SUBTABS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSubtab(s.id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-bold transition ${
              subtab === s.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.label}
            {counts[s.id] > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  subtab === s.id ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-700'
                }`}
              >
                {counts[s.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-500">
          Loading enrollment pipeline…
        </div>
      ) : subtab === 'recommendation' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              One row per published course — click to expand its recommended attendees. Select the
              ones to route, then send; one send may cover several courses.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={busy === 'regen'}
                onClick={() => void regenerate()}
                title="Recompute recommendations from the latest finalized IPCR data"
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {busy === 'regen' ? 'Regenerating…' : 'Regenerate'}
              </button>
              <button
                type="button"
                disabled={selected.size === 0 || busy === 'send'}
                onClick={() => void sendSelected()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {busy === 'send' ? 'Sending…' : `Send to Office Account (${selected.size})`}
              </button>
            </div>
          </div>

          {coverage.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title={`No published courses for ${monthName(1)}`}
              description="Every published course scheduled for next month is listed here for attendee routing. If next month has no published courses yet, schedule and complete them in Training Calendar first."
            />
          ) : (
            coverage.map(({ course, group }) => {
              const zeroMatch = !group || group.recs.length === 0;
              const routed = routedBySession.get(course.sessionId) ?? 0;
              const genuineZero = zeroMatch && routed === 0;
              // Suggest a higher-demand competency when this course targets one
              // nobody currently has a gap in (Task 3).
              const suggestAlt =
                genuineZero &&
                course.competencies.length > 0 &&
                topDemand &&
                !course.competencies.includes(topDemand.competency)
                  ? topDemand
                  : null;
              return (
                <CollapsibleCourse
                  key={course.sessionId}
                  title={course.title}
                  category={course.category}
                  start={course.start}
                  count={group?.recs.length ?? 0}
                  capacity={course.capacity}
                  accentAmber={genuineZero}
                  expanded={expanded.has(course.sessionId)}
                  onToggle={() => toggleExpand(course.sessionId)}
                  badge={
                    !zeroMatch ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        <Sparkles className="h-3.5 w-3.5" /> {group!.recs.length} matched
                      </span>
                    ) : routed > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        <Check className="h-3.5 w-3.5" /> {routed} already routed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> 0 matches — review
                      </span>
                    )
                  }
                >
                  {zeroMatch ? (
                    <div className={`px-4 py-3 text-xs ${routed > 0 ? 'text-slate-500' : 'text-amber-800'}`}>
                      {routed > 0
                        ? `All ${routed} recommendation${routed === 1 ? '' : 's'} for this course have moved past review — see the Sent to Office Account, Returned, Enrolled or Published tabs.`
                        : course.competencies.length === 0
                        ? 'This course has no competency mapping, so no attendees can be matched automatically. Add a “Competency: …” line to its objectives in Training Calendar, then Regenerate — or add attendees manually below.'
                        : `No employee's finalized IPCR data currently shows a gap in ${course.competencies.join(' or ')}. Nothing to auto-route — add attendees manually below, or Regenerate after new IPCR data.`}
                      {suggestAlt && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-blue-800">
                          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Highest unmet need right now is <strong>{suggestAlt.competency}</strong> (
                            {suggestAlt.demand}% demand across offices). Consider re-purposing this slot for a
                            course targeting it.
                          </span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {group!.recs.map((r) => (
                        <AttendeeRow
                          key={r.id}
                          rec={r}
                          trailing={
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                disabled={busy === r.id}
                                onClick={() => void reject(r.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:border-rose-400 hover:text-rose-600"
                              >
                                <X className="h-3 w-3" /> Reject
                              </button>
                              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:border-blue-400">
                                <input
                                  type="checkbox"
                                  checked={selected.has(r.id)}
                                  onChange={() => toggle(r.id)}
                                  className="h-3 w-3 accent-blue-600"
                                />
                                Accept
                              </label>
                            </div>
                          }
                        />
                      ))}
                    </ul>
                  )}
                  <div className="border-t border-gray-100 px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => openPicker(course)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Attendee
                    </button>
                  </div>
                </CollapsibleCourse>
              );
            })
          )}
        </div>
      ) : subtab === 'sent' ? (
        <div className="space-y-3">
          {sentGroups.length === 0 ? (
            <EmptyState
              icon={Send}
              title="Nothing awaiting office review"
              description="Recommendations you send appear here until the office sends them back."
            />
          ) : (
            sentGroups.map((g) => (
              <CollapsibleCourse
                key={g.sessionId}
                title={g.title}
                category={g.category}
                start={g.start}
                count={g.recs.length}
                capacity={g.capacity}
                expanded={expanded.has(g.sessionId)}
                onToggle={() => toggleExpand(g.sessionId)}
                badge={
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    <Check className="h-3.5 w-3.5" /> Awaiting office review
                  </span>
                }
              >
                <ul className="divide-y divide-gray-100">
                  {g.recs.map((r) => (
                    <AttendeeRow key={r.id} rec={r} />
                  ))}
                </ul>
              </CollapsibleCourse>
            ))
          )}
        </div>
      ) : subtab === 'returned' ? (
        <div className="space-y-3">
          {returnedGroups.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nothing returned yet"
              description="Once an office finishes reviewing a batch, its combined list lands here for enrollment."
            />
          ) : (
            returnedGroups.map((g) => {
              const changes = eventsFor(g.sessionId);
              return (
                <CollapsibleCourse
                  key={g.sessionId}
                  title={g.title}
                  category={g.category}
                  start={g.start}
                  count={g.recs.length}
                  capacity={g.capacity}
                  expanded={expanded.has(g.sessionId)}
                  onToggle={() => toggleExpand(g.sessionId)}
                  actions={
                    <button
                      type="button"
                      disabled={busy === g.sessionId}
                      onClick={() => void enroll(g.sessionId)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {busy === g.sessionId ? 'Enrolling…' : 'Enroll'}
                    </button>
                  }
                >
                  {changes.length > 0 && (
                    <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        What the office changed
                      </p>
                      <ul className="space-y-0.5">
                        {changes.map((e) => (
                          <li key={e.id} className="text-[11px] text-gray-600">
                            <span
                              className={`font-semibold ${
                                e.action === 'removed' ? 'text-rose-600' : 'text-indigo-600'
                              }`}
                            >
                              {e.action}
                            </span>{' '}
                            by {e.actor ?? 'office'}
                            {e.actorDepartment ? ` (${e.actorDepartment})` : ''}
                            {e.reason ? ` — ${e.reason}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <ul className="divide-y divide-gray-100">
                    {g.recs.map((r) => (
                      <AttendeeRow key={r.id} rec={r} />
                    ))}
                  </ul>
                </CollapsibleCourse>
              );
            })
          )}
        </div>
      ) : subtab === 'enrolled' ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Grouped by training course, covering {monthName(0)} and {monthName(1)}. Finalizing locks
            a roster; publishing exposes it to employees and cannot be undone. Rosters lock
            automatically {LOCK_LEAD_DAYS} days before their training starts.
          </p>
          {enrolledRosters.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No enrolled rosters"
              description="Rosters with attendees appear here, grouped by course."
            />
          ) : (
            enrolledRosters.map((g) => {
              const locked = isLocked(g.start);
              return (
                <CollapsibleCourse
                  key={g.sessionId}
                  title={g.title}
                  category={g.category}
                  start={g.start}
                  count={g.attendees.length}
                  capacity={g.capacity}
                  expanded={expanded.has(g.sessionId)}
                  onToggle={() => toggleExpand(g.sessionId)}
                  badge={
                    g.finalizedAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <Lock className="h-2.5 w-2.5" /> Finalized
                      </span>
                    ) : undefined
                  }
                  actions={
                    !g.finalizedAt ? (
                      <button
                        type="button"
                        disabled={busy === g.sessionId || locked}
                        title={locked ? 'This training is within the lock window.' : undefined}
                        onClick={() => void finalize(g.sessionId)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-700 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                      >
                        <Lock className="h-3.5 w-3.5" /> Finalize
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === g.sessionId}
                        onClick={() => void publish(g.sessionId)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {busy === g.sessionId ? 'Publishing…' : 'Publish'}
                      </button>
                    )
                  }
                >
                  <ul className="divide-y divide-gray-100">
                    {g.attendees.map((a) => (
                      <li key={a.enrollmentId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{a.name}</span>
                            {a.fromRecommendation && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                                <Sparkles className="h-2.5 w-2.5" /> recommended
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-gray-500">
                            {a.department ?? '—'}
                            {a.position ? ` · ${a.position}` : ''}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CollapsibleCourse>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {publishedRosters.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing published yet"
              description="Published rosters are visible to employees and cannot be reopened."
            />
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-600">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Published rosters are final. There is no reopen — corrections require a manual
                  admin action outside this workflow.
                </span>
              </div>
              {publishedRosters.map((g) => (
                <CollapsibleCourse
                  key={g.sessionId}
                  title={g.title}
                  category={g.category}
                  start={g.start}
                  count={g.attendees.length}
                  capacity={g.capacity}
                  expanded={expanded.has(g.sessionId)}
                  onToggle={() => toggleExpand(g.sessionId)}
                  badge={
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Published
                    </span>
                  }
                >
                  <ul className="divide-y divide-gray-100">
                    {g.attendees.map((a) => (
                      <li key={a.enrollmentId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <div className="min-w-0">
                          <span className="font-semibold text-gray-900">{a.name}</span>
                          <p className="truncate text-[11px] text-gray-500">{a.department ?? '—'}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CollapsibleCourse>
              ))}
            </>
          )}
        </div>
      )}

      {picker && (
        <AddAttendeeModal
          target={picker}
          onClose={() => setPicker(null)}
          onAdded={(added) => void onAttendeesAdded(added)}
        />
      )}
    </div>
  );
};
