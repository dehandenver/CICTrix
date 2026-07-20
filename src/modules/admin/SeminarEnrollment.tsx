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
 * Monthly cadence: a month's rosters must be published before that month
 * begins, so recommendations only ever target next month. The 3-day lock from
 * trainingLifecycle applies here too — a roster cannot be edited once its
 * training is within three days, for any role.
 *
 * Replaces the older Draft → Sent to Dept Head → Approved roster-status flow,
 * which was a second, competing LND↔office handoff in this same module.
 */

import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Lock,
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
  listAllRecommendations,
  listRecommendationCandidates,
  listRecommendationEvents,
  listRosterGroups,
  publishRoster,
  sendBatchToOffice,
  dismissRecommendation,
  monthWindow,
  type PipelineRecFull,
  type RecommendationEvent,
  type RosterGroup,
} from '../../lib/api/trainingRecommendations';
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

const SectionHeader = ({
  group,
  right,
}: {
  group: Group;
  right?: React.ReactNode;
}) => {
  const note = lockNote(group.start);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-gray-900">{group.title}</h3>
        <CategoryTag category={group.category} />
        <span className="text-xs text-gray-400">
          {fmtDate(group.start)} · {group.recs.length} attendee{group.recs.length === 1 ? '' : 's'}
          {group.capacity ? ` / ${group.capacity} slots` : ''}
        </span>
        {note && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
            <Lock className="h-2.5 w-2.5" /> {note}
          </span>
        )}
      </div>
      {right}
    </div>
  );
};

const AttendeeRow = ({
  rec,
  trailing,
}: {
  rec: PipelineRecFull;
  trailing?: React.ReactNode;
}) => (
  <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-900">{rec.employeeName}</span>
        {rec.source === 'office_account_added' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
            <UserPlus className="h-2.5 w-2.5" /> office added
          </span>
        )}
      </div>
      <p className="truncate text-[11px] text-gray-500">
        {rec.department ?? '—'} · {rec.competency}
        {rec.gapDetail ? ` · ${rec.gapDetail}` : ''}
      </p>
    </div>
    {trailing}
  </li>
);

export const SeminarEnrollment = () => {
  const [subtab, setSubtab] = useState<Subtab>('recommendation');
  const [candidates, setCandidates] = useState<PipelineRecFull[]>([]);
  const [all, setAll] = useState<PipelineRecFull[]>([]);
  const [events, setEvents] = useState<RecommendationEvent[]>([]);
  // Enrolled/Published read the roster, not the recommendation pipeline: rosters
  // seeded outside that flow (July's) have no recommendation rows at all.
  const [rosters, setRosters] = useState<RosterGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [cands, everything, rosterGroups] = await Promise.all([
      listRecommendationCandidates(),
      listAllRecommendations(),
      listRosterGroups([0, 1]),
    ]);
    setCandidates(cands);
    setAll(everything);
    setRosters(rosterGroups);
    setEvents(await listRecommendationEvents([...new Set(everything.map((r) => r.sessionId))]));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
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
  const sentGroups = useMemo(() => byStatus(['LND_APPROVED', 'OFFICE_ADDED']), [byStatus]);
  const returnedGroups = useMemo(() => byStatus(['OFFICE_FINALIZED']), [byStatus]);
  // A roster is "enrolled" until it is published; publishing moves it on.
  const enrolledRosters = useMemo(() => rosters.filter((r) => !r.publishedAt), [rosters]);
  const publishedRosters = useMemo(() => rosters.filter((r) => !!r.publishedAt), [rosters]);

  const counts: Record<Subtab, number> = {
    recommendation: recGroups.length,
    sent: sentGroups.length,
    returned: returnedGroups.length,
    enrolled: enrolledRosters.length,
    published: publishedRosters.length,
  };

  // Next month's courses that have not reached Published yet — the cadence rule
  // says they must all be published before that month starts.
  const cadenceWarning = useMemo(() => {
    const { start, end } = monthWindow(1);
    const nextMonth = all.filter((r) => r.sessionStart >= start && r.sessionStart < end);
    const unpublished = new Set(
      nextMonth.filter((r) => r.status !== 'PUBLISHED').map((r) => r.sessionId),
    );
    return unpublished.size;
  }, [all]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
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
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Suggested from each employee's IPCR ratings against the competency framework for the
              course. Select the ones to route, then send — one send may cover several courses.
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

          {recGroups.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title={`No recommendations for ${monthName(1)}`}
              description="Recommendations are generated from finalized IPCR data against next month's scheduled courses. If next month has no courses yet, schedule them in Training Calendar first."
            />
          ) : (
            recGroups.map((g) => (
              <section key={g.sessionId} className="rounded-xl border border-gray-200 bg-white">
                <SectionHeader group={g} />
                <ul className="divide-y divide-gray-100">
                  {g.recs.map((r) => (
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
              </section>
            ))
          )}
        </div>
      ) : subtab === 'sent' ? (
        <div className="space-y-4">
          {sentGroups.length === 0 ? (
            <EmptyState
              icon={Send}
              title="Nothing awaiting office review"
              description="Recommendations you send appear here until the office sends them back."
            />
          ) : (
            sentGroups.map((g) => (
              <section key={g.sessionId} className="rounded-xl border border-gray-200 bg-white">
                <SectionHeader
                  group={g}
                  right={
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      <Check className="h-3.5 w-3.5" /> Awaiting office review
                    </span>
                  }
                />
                <ul className="divide-y divide-gray-100">
                  {g.recs.map((r) => (
                    <AttendeeRow key={r.id} rec={r} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      ) : subtab === 'returned' ? (
        <div className="space-y-4">
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
                <section key={g.sessionId} className="rounded-xl border border-gray-200 bg-white">
                  <SectionHeader
                    group={g}
                    right={
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
                  />
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
                </section>
              );
            })
          )}
        </div>
      ) : subtab === 'enrolled' ? (
        <div className="space-y-4">
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
              const note = lockNote(g.start);
              return (
                <section key={g.sessionId} className="rounded-xl border border-gray-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900">{g.title}</h3>
                      <CategoryTag category={g.category} />
                      <span className="text-xs text-gray-400">
                        {fmtDate(g.start)} · {g.attendees.length} attendee
                        {g.attendees.length === 1 ? '' : 's'}
                        {g.capacity ? ` / ${g.capacity} slots` : ''}
                      </span>
                      {g.finalizedAt && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          <Lock className="h-2.5 w-2.5" /> Finalized
                        </span>
                      )}
                      {note && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          <Lock className="h-2.5 w-2.5" /> {note}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!g.finalizedAt ? (
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
                      )}
                    </div>
                  </div>
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
                </section>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-4">
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
                <section key={g.sessionId} className="rounded-xl border border-gray-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900">{g.title}</h3>
                      <CategoryTag category={g.category} />
                      <span className="text-xs text-gray-400">
                        {fmtDate(g.start)} · {g.attendees.length} attendee
                        {g.attendees.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Published
                    </span>
                  </div>
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
                </section>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};
