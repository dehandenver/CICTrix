/**
 * Employee Portal — "My trainings" (§8).
 *
 * Lists the trainings the signed-in employee is enrolled in, read from the same
 * training_enrollments rows the L&D "Enroll final attendees" action writes, so a
 * new enrollment shows up here on the next poll (15s) without a re-login.
 */

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, GraduationCap, MapPin, User } from 'lucide-react';
import { listMyTrainings, type MyTraining, type MyTrainingStatus } from '../../lib/api/myTrainings';
import { CATEGORY_COLORS } from '../admin/trainingCategories';

const POLL_MS = 15000;

const STATUS_BADGE: Record<MyTrainingStatus, string> = {
  Upcoming: 'bg-blue-100 text-blue-700',
  Completed: 'bg-emerald-100 text-emerald-700',
  Cancelled: 'bg-red-100 text-red-700',
};

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
const fmtRange = (t: MyTraining) =>
  t.endDate && !sameDay(t.startDate, t.endDate) ? `${fmtDay(t.startDate)} – ${fmtDay(t.endDate)}` : fmtDay(t.startDate);

export const MyTrainingsSection = ({ employeeId }: { employeeId: string }) => {
  const [trainings, setTrainings] = useState<MyTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setTrainings(await listMyTrainings(employeeId));
      setLoading(false);
    };
    void load();
    timer.current = window.setInterval(() => void load(), POLL_MS);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [employeeId]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 flex items-center gap-2.5">
        <GraduationCap className="h-6 w-6 text-indigo-600" />
        <div>
          <h2 className="text-xl font-bold text-slate-900">My Trainings</h2>
          <p className="text-sm text-slate-500">Trainings you're enrolled in. Updates automatically.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : trainings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">No trainings yet</p>
          <p className="mt-1 text-xs text-slate-400">When you're enrolled in a training, it will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trainings.map((t) => {
            const color = CATEGORY_COLORS[t.category ?? ''] ?? '#6366f1';
            return (
              <article key={t.enrollmentId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">{t.title}</h3>
                    {t.category && (
                      <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${color}1a`, color }}>{t.category}</span>
                    )}
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[t.status]}`}>{t.status}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-3">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-slate-400" /> {fmtRange(t)}</span>
                  <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" /> {t.location || 'TBA'}</span>
                  <span className="inline-flex items-center gap-1.5"><User className="h-4 w-4 text-slate-400" /> {t.speaker || 'TBA'}</span>
                </div>
                {t.objectives.length > 0 && (
                  <ul className="mt-3 list-disc pl-5 text-sm text-slate-700">
                    {t.objectives.slice(0, 3).map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyTrainingsSection;
