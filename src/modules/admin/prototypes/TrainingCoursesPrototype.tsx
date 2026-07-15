import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Laptop,
  MapPin,
  Rows3,
  User,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { TRAINING_CATEGORIES, categoryColor } from '../trainingCategories';

/**
 * PROTOTYPE — not wired to Supabase.
 *
 * A standalone mock of the Training Courses + Training Calendar screens, driven
 * by the fixture below. Kept separate from the real, Supabase-backed
 * TrainingCourses.tsx / TrainingCalendar.tsx: this fixture uses a different
 * status vocabulary (Draft / Pending Dept Head Approval / Approved / Rejected)
 * than the live pipeline (Draft / Sent to Dept Head / Returned / Finalized) and
 * carries fields the real schema does not have (mode, duration_hours,
 * rejection_reason, free-text attendees).
 *
 * The fixture's `calendar_color` is deliberately ignored: purple/teal/orange/
 * green are exactly the four category colors, so colour is derived from
 * `category` to keep one source of truth.
 */

export type PrototypeStatus = 'Draft' | 'Pending Dept Head Approval' | 'Approved' | 'Rejected';

export type PrototypeCourse = {
  id: string;
  title: string;
  category: string;
  description: string;
  trainer: string;
  recommended_attendees: string[];
  target_headcount: number;
  mode: 'In-person' | 'Hybrid' | 'Online';
  location: string;
  start_date: string;
  end_date: string;
  duration_hours: number;
  status: PrototypeStatus;
  rejection_reason?: string;
  submitted_by: string;
  dept_head_reviewer: string | null;
};

export const PROTOTYPE_COURSES: PrototypeCourse[] = [
  {
    id: 'TRN-2026-001',
    title: 'Change Champions: Sustaining the Transformation Journey',
    category: 'Cultural Transformation',
    description:
      'Interactive session for designated change champions to reinforce cultural transformation messaging and equip them with peer-coaching techniques for their teams.',
    trainer: 'External — Center for Creative Leadership Asia',
    recommended_attendees: ['Change Champions', 'Team Leads'],
    target_headcount: 30,
    mode: 'In-person',
    location: 'HQ Training Room A',
    start_date: '2026-07-15',
    end_date: '2026-07-15',
    duration_hours: 4,
    status: 'Draft',
    submitted_by: 'L&D Division',
    dept_head_reviewer: null,
  },
  {
    id: 'TRN-2026-002',
    title: 'Time Management and Personal Productivity',
    category: 'Employee Development',
    description:
      'Practical workshop introducing prioritization frameworks and digital tools to help employees manage workload and reduce burnout.',
    trainer: 'Internal — L&D Facilitator, Anna Reyes',
    recommended_attendees: ['All Employees'],
    target_headcount: 45,
    mode: 'Hybrid',
    location: 'HQ Auditorium / Zoom',
    start_date: '2026-07-20',
    end_date: '2026-07-20',
    duration_hours: 3,
    status: 'Pending Dept Head Approval',
    submitted_by: 'L&D Division',
    dept_head_reviewer: 'Carla Mendoza, Dept Head Finance',
  },
  {
    id: 'TRN-2026-003',
    title: 'Executive Presence and Influence',
    category: 'Leadership',
    description:
      'Advanced course on building gravitas, executive communication, and stakeholder influence for senior leaders preparing for cross-functional roles.',
    trainer: 'External — Asian Institute of Management Faculty',
    recommended_attendees: ['Directors', 'Senior Managers'],
    target_headcount: 16,
    mode: 'In-person',
    location: 'Executive Conference Room',
    start_date: '2026-07-27',
    end_date: '2026-07-28',
    duration_hours: 10,
    status: 'Approved',
    submitted_by: 'L&D Division',
    dept_head_reviewer: 'Ramon Cruz, Dept Head HR',
  },
  {
    id: 'TRN-2026-004',
    title: 'Python for Data Reporting: Beginner Track',
    category: 'Technical',
    description:
      'Introductory course covering Python scripting basics, pandas fundamentals, and automated report generation for non-developer staff.',
    trainer: 'Internal — IT Systems Team',
    recommended_attendees: ['Business Analysts', 'Operations Team'],
    target_headcount: 22,
    mode: 'In-person',
    location: 'IT Training Lab',
    start_date: '2026-08-04',
    end_date: '2026-08-05',
    duration_hours: 8,
    status: 'Rejected',
    rejection_reason: 'Overlaps with month-end close period; requested reschedule to mid-August.',
    submitted_by: 'L&D Division',
    dept_head_reviewer: 'Leo Fernandez, Dept Head IT',
  },
  {
    id: 'TRN-2026-005',
    title: 'Inclusive Leadership in a Multicultural Workplace',
    category: 'Cultural Transformation',
    description:
      'Workshop exploring unconscious bias, inclusive decision-making, and practical strategies for fostering belonging across diverse teams.',
    trainer: 'External — Ateneo de Manila Center for Organizational Leadership',
    recommended_attendees: ['People Managers', 'HR Business Partners'],
    target_headcount: 28,
    mode: 'In-person',
    location: 'HQ Training Room B',
    start_date: '2026-08-11',
    end_date: '2026-08-11',
    duration_hours: 5,
    status: 'Approved',
    submitted_by: 'L&D Division',
    dept_head_reviewer: 'Maria Santos, VP Operations',
  },
  {
    id: 'TRN-2026-006',
    title: 'Effective Business Writing and Email Etiquette',
    category: 'Employee Development',
    description:
      'Skills-building session focused on clear, concise professional writing for internal memos, client emails, and reports.',
    trainer: 'Internal — L&D Facilitator, Juan Dela Cruz',
    recommended_attendees: ['All Employees'],
    target_headcount: 35,
    mode: 'Online',
    location: 'MS Teams',
    start_date: '2026-08-18',
    end_date: '2026-08-18',
    duration_hours: 2,
    status: 'Draft',
    submitted_by: 'L&D Division',
    dept_head_reviewer: null,
  },
  {
    id: 'TRN-2026-007',
    title: 'Conflict Resolution for People Managers',
    category: 'Leadership',
    description:
      'Scenario-based training equipping managers with mediation techniques and de-escalation strategies for workplace disputes.',
    trainer: 'Internal — L&D Senior Facilitator',
    recommended_attendees: ['People Managers', 'Team Leads'],
    target_headcount: 20,
    mode: 'In-person',
    location: 'HQ Training Room A',
    start_date: '2026-08-25',
    end_date: '2026-08-25',
    duration_hours: 4,
    status: 'Pending Dept Head Approval',
    submitted_by: 'L&D Division',
    dept_head_reviewer: 'Ramon Cruz, Dept Head HR',
  },
  {
    id: 'TRN-2026-008',
    title: 'Cloud Infrastructure Fundamentals: AWS Essentials',
    category: 'Technical',
    description:
      'Foundational course covering core AWS services, cloud architecture basics, and hands-on lab exercises for IT staff.',
    trainer: 'External — AWS Training Partner Network',
    recommended_attendees: ['IT Infrastructure Team', 'Developers'],
    target_headcount: 15,
    mode: 'Hybrid',
    location: 'IT Training Lab / Zoom',
    start_date: '2026-09-02',
    end_date: '2026-09-03',
    duration_hours: 12,
    status: 'Approved',
    submitted_by: 'L&D Division',
    dept_head_reviewer: 'Leo Fernandez, Dept Head IT',
  },
  {
    id: 'TRN-2026-009',
    title: 'Values in Action: Living Our Corporate Culture',
    category: 'Cultural Transformation',
    description:
      'Company-wide session reinforcing core values through storytelling, case discussions, and team-based activities tied to the cultural transformation roadmap.',
    trainer: 'Internal — L&D Facilitator, Anna Reyes',
    recommended_attendees: ['All Employees'],
    target_headcount: 80,
    mode: 'In-person',
    location: 'HQ Auditorium',
    start_date: '2026-09-09',
    end_date: '2026-09-09',
    duration_hours: 3,
    status: 'Rejected',
    rejection_reason: 'Budget for external facilitator not yet approved for Q3; resubmit after finance review.',
    submitted_by: 'L&D Division',
    dept_head_reviewer: 'Maria Santos, VP Operations',
  },
  {
    id: 'TRN-2026-010',
    title: 'Advanced Excel for Financial Analysis',
    category: 'Technical',
    description:
      'Hands-on course covering pivot tables, advanced formulas, and financial modeling techniques for finance and operations staff.',
    trainer: 'Internal — IT Systems Team',
    recommended_attendees: ['Finance Team', 'Business Analysts'],
    target_headcount: 18,
    mode: 'In-person',
    location: 'IT Training Lab',
    start_date: '2026-09-16',
    end_date: '2026-09-17',
    duration_hours: 8,
    status: 'Approved',
    submitted_by: 'L&D Division',
    dept_head_reviewer: 'Carla Mendoza, Dept Head Finance',
  },
];

const STATUSES: PrototypeStatus[] = ['Draft', 'Pending Dept Head Approval', 'Approved', 'Rejected'];

const STATUS_BADGE: Record<PrototypeStatus, string> = {
  'Draft': 'bg-gray-100 text-gray-700',
  'Pending Dept Head Approval': 'bg-amber-100 text-amber-700',
  'Approved': 'bg-emerald-100 text-emerald-700',
  'Rejected': 'bg-red-100 text-red-700',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Dates are plain "YYYY-MM-DD" with no timezone. Parse them as local calendar
// days — `new Date('2026-07-15')` would parse as UTC midnight and land on the
// 14th for anyone west of Greenwich.
const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatRange = (course: PrototypeCourse) => {
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
  const start = parseDay(course.start_date);
  if (course.start_date === course.end_date) return start.toLocaleDateString('en-US', opts);
  return `${start.toLocaleDateString('en-US', opts)} – ${parseDay(course.end_date).toLocaleDateString('en-US', opts)}`;
};

/** Every calendar day a course touches, so multi-day courses render on each cell. */
const courseDayKeys = (course: PrototypeCourse): string[] => {
  const cursor = parseDay(course.start_date);
  const last = parseDay(course.end_date);
  const keys: string[] = [];
  while (cursor <= last && keys.length < 366) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
};

const monthGrid = (year: number, month: number): (Date | null)[] => {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
};

const selectClass =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

// ── Detail panel ──────────────────────────────────────────────────────────────

const CourseDetail = ({ course, onClose }: { course: PrototypeCourse; onClose: () => void }) => {
  const color = categoryColor(course.category);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 border-b border-gray-100 bg-white px-6 pb-4 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ backgroundColor: `${color}1a`, color }}
                >
                  {course.category}
                </span>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[course.status]}`}>
                  {course.status}
                </span>
                <span className="text-xs text-gray-400">{course.id}</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{course.title}</h2>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 text-gray-400 transition hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-6 px-6 py-5">
          {course.status === 'Rejected' && course.rejection_reason && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Rejection reason</p>
              <p className="mt-1 text-sm text-red-900">{course.rejection_reason}</p>
            </div>
          )}

          <p className="text-sm leading-relaxed text-gray-700">{course.description}</p>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Logistics</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-2.5 text-sm text-gray-700">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <span>{formatRange(course)}</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-gray-700">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <span>{course.duration_hours} hours</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-gray-700">
                <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <span>{course.trainer}</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-gray-700">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <span>{course.location}</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-gray-700">
                <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <span>{course.mode}</span>
              </div>
              <div className="flex items-start gap-2.5 text-sm text-gray-700">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <span>{course.target_headcount} target attendees</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recommended attendees</h3>
            <div className="flex flex-wrap gap-2">
              {course.recommended_attendees.map((a) => (
                <span key={a} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                  {a}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Review</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-40 shrink-0 text-gray-500">Submitted by</dt>
                <dd className="text-gray-800">{course.submitted_by}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-40 shrink-0 text-gray-500">Dept Head reviewer</dt>
                <dd className={course.dept_head_reviewer ? 'text-gray-800' : 'text-gray-400'}>
                  {course.dept_head_reviewer ?? 'Not yet assigned'}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

export const TrainingCoursesPrototype = () => {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [statusFilter, setStatusFilter] = useState<'All' | PrototypeStatus>('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The fixture spans July–September 2026.
  const [cursor, setCursor] = useState({ year: 2026, month: 6 });

  const filtered = useMemo(
    () =>
      PROTOTYPE_COURSES.filter(
        (c) =>
          (statusFilter === 'All' || c.status === statusFilter) &&
          (categoryFilter === 'All' || c.category === categoryFilter)
      ),
    [statusFilter, categoryFilter]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, PrototypeCourse[]>();
    for (const course of filtered) {
      for (const key of courseDayKeys(course)) {
        const list = map.get(key);
        if (list) list.push(course);
        else map.set(key, [course]);
      }
    }
    return map;
  }, [filtered]);

  const selected = useMemo(() => PROTOTYPE_COURSES.find((c) => c.id === selectedId) ?? null, [selectedId]);
  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const monthName = new Date(cursor.year, cursor.month).toLocaleString('en-US', { month: 'long' });

  const shiftMonth = (delta: number) => {
    setCursor(({ year, month }) => {
      const next = month + delta;
      if (next < 0) return { year: year - 1, month: 11 };
      if (next > 11) return { year: year + 1, month: 0 };
      return { year, month: next };
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">
              <span className="text-blue-600">L&D</span> <span className="mx-1 text-gray-400">/</span> Training Courses
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                PROTOTYPE
              </span>
            </p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Training Courses</h1>
            <p className="mt-1 text-sm text-gray-500">
              {filtered.length} of {PROTOTYPE_COURSES.length} courses · sample data, not connected to the database
            </p>
          </div>

          <div className="flex rounded-lg border border-gray-300 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                view === 'list' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Rows3 className="h-3.5 w-3.5" /> List
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                view === 'calendar' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Calendar
            </button>
          </div>
        </section>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'All' | PrototypeStatus)} className={`${selectClass} w-64`}>
            <option value="All">All statuses</option>
            {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={`${selectClass} w-64`}>
            <option value="All">All categories</option>
            {TRAINING_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          {(statusFilter !== 'All' || categoryFilter !== 'All') && (
            <button
              type="button"
              onClick={() => { setStatusFilter('All'); setCategoryFilter('All'); }}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Category legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {TRAINING_CATEGORIES.map((cat) => (
            <div key={cat} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: categoryColor(cat) }} />
              {cat}
            </div>
          ))}
        </div>

        {view === 'list' ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-gray-400">No courses match these filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Course</th>
                      <th className="px-4 py-3 font-semibold">Schedule</th>
                      <th className="px-4 py-3 font-semibold">Trainer</th>
                      <th className="px-4 py-3 font-semibold">Mode</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((course) => {
                      const color = categoryColor(course.category);
                      return (
                        <tr
                          key={course.id}
                          onClick={() => setSelectedId(course.id)}
                          className="cursor-pointer transition hover:bg-gray-50"
                        >
                          <td className="max-w-sm px-4 py-3">
                            <p className="font-semibold text-gray-900">{course.title}</p>
                            <span
                              className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                              style={{ backgroundColor: `${color}1a`, color }}
                            >
                              {course.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            <p>{formatRange(course)}</p>
                            <p className="mt-0.5 text-xs text-gray-500">{course.duration_hours} hrs</p>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{course.trainer}</td>
                          <td className="px-4 py-3 text-gray-700">{course.mode}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[course.status]}`}>
                              {course.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-blue-600">
                            {course.target_headcount}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg border border-gray-300 p-1.5 text-gray-600 transition hover:bg-gray-50">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-semibold text-gray-900">{monthName} {cursor.year}</h2>
              <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg border border-gray-300 p-1.5 text-gray-600 transition hover:bg-gray-50">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200">
              {WEEKDAYS.map((d) => (
                <div key={d} className="bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-gray-500">{d}</div>
              ))}

              {cells.map((date, i) => {
                if (!date) return <div key={`blank-${i}`} className="min-h-[110px] bg-gray-50/50" />;
                const key = dayKey(date);
                const dayCourses = byDay.get(key) ?? [];

                return (
                  <div key={key} className="min-h-[110px] bg-white p-1.5">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-gray-600">
                      {date.getDate()}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayCourses.map((course) => {
                        const color = categoryColor(course.category);
                        const rejected = course.status === 'Rejected';
                        return (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => setSelectedId(course.id)}
                            title={`${course.title} — ${course.status}`}
                            className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-medium transition hover:brightness-95"
                            style={{
                              backgroundColor: `${color}1f`,
                              color,
                              textDecoration: rejected ? 'line-through' : undefined,
                              opacity: rejected ? 0.6 : 1,
                            }}
                          >
                            {course.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-center text-xs text-gray-400">
              Courses run July – September 2026. Rejected courses appear struck through.
            </p>
          </section>
        )}
      </div>

      {selected && <CourseDetail course={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
};
