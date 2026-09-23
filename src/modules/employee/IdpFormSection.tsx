/**
 * Employee Portal — Individual Development Plan.
 *
 * The questionnaire is rendered natively here rather than embedded from Google
 * Forms, for the same reason the interviewer evaluation is: L&D's annual output
 * is a per-office breakdown of development needs, and that can only be produced
 * from answers the system can actually read.
 *
 * The page is static — the questions live in lib/idpQuestionnaire.ts and change
 * only in a release. What L&D controls is the window: the form is reachable
 * once a year, when they open it. See lib/api/idpSchedule.ts.
 */

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Lock, Pencil, Save, Send, Target, TriangleAlert } from 'lucide-react';
import type { Employee } from '../../types/employee.types';
import {
  closedReason,
  effectiveIdpState,
  getIdpConfig,
  EMPTY_IDP_CONFIG,
  type IdpFormConfig,
} from '../../lib/api/idpSchedule';
import {
  cycleYearFor,
  emptySubmission,
  getMySubmission,
  missingRequired,
  saveSubmission,
  type IdpSubmission,
} from '../../lib/api/idpSubmissions';
import {
  CAREER_DEVELOPMENT_BLURB,
  CAREER_NEED_OPTIONS,
  IDP_CONFIDENTIALITY_NOTE,
  IDP_GENDERS,
  IDP_OFFICES,
  IDP_QUESTIONS,
  PERSONAL_DEVELOPMENT_BLURB,
  PERSONAL_GOAL_OPTIONS,
} from '../../lib/idpQuestionnaire';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

const labelCls = 'block text-sm font-semibold text-slate-800 mb-1.5';
const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500';
const cardCls = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const sectionHeadCls = 'rounded-t-2xl bg-indigo-700 px-5 py-2.5 text-sm font-bold tracking-wide text-white';

const Required = () => <span className="text-red-500"> *</span>;

export const IdpFormSection = ({ employee }: { employee: Employee }) => {
  const cycleYear = cycleYearFor();
  const employeeId = employee?.employeeId ?? '';

  const [config, setConfig] = useState<IdpFormConfig>(EMPTY_IDP_CONFIG);
  const [form, setForm] = useState<IdpSubmission>(() => emptySubmission(employeeId, cycleYear));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  // A filed form is shown read-only. Revising is deliberate, so it takes a click
  // rather than leaving a submitted sheet editable by accident.
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cfgRes, subRes] = await Promise.all([
        getIdpConfig(),
        getMySubmission(employeeId, cycleYear),
      ]);
      if (cancelled) return;

      if (cfgRes.ok === false) setError(cfgRes.error);
      else setConfig(cfgRes.data);

      if (subRes.ok === false) {
        setError((prev) => prev ?? subRes.error);
      } else if (subRes.data) {
        setForm(subRes.data);
      } else {
        // First visit this cycle — seed the personal data the portal already
        // knows. The paper form had to ask because it had no idea who was
        // filling it in; this page does. Everything stays editable.
        setForm({
          ...emptySubmission(employeeId, cycleYear),
          fullName: employee?.fullName ?? '',
          email: employee?.email ?? '',
          position: employee?.currentPosition ?? '',
          office: IDP_OFFICES.find((o) => o === (employee?.currentDepartment ?? '').toUpperCase()) ?? '',
          division: employee?.currentDivision ?? '',
          age: employee?.age ? String(employee.age) : '',
          gender: employee?.gender && employee.gender !== 'Prefer not to say' ? employee.gender : '',
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [employeeId, cycleYear, employee]);

  const state = effectiveIdpState(config);
  const missing = useMemo(() => missingRequired(form), [form]);
  const alreadySubmitted = Boolean(form.submittedAt);
  const readOnly = alreadySubmitted && !editing;

  const set = <K extends keyof IdpSubmission>(key: K, value: IdpSubmission[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setNotice(null);
  };

  const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const persist = async (submitting: boolean) => {
    if (submitting) {
      setShowErrors(true);
      if (missing.length > 0) {
        setError(`${missing.length} required question${missing.length === 1 ? '' : 's'} still need an answer.`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    const res = await saveSubmission(form, submitting);
    setSaving(false);
    if (res.ok === false) {
      setError(res.error);
      return;
    }
    setForm(res.data);
    setEditing(false);
    setNotice(submitting ? 'Your Individual Development Plan has been submitted.' : 'Draft saved.');
  };

  // ── Gating ────────────────────────────────────────────────────────────────
  if (loading) return <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-slate-400">Loading…</div>;

  const header = (
    <div className="mb-5 flex items-center gap-2.5">
      <Target className="h-6 w-6 text-indigo-600" />
      <div>
        <h2 className="text-xl font-bold text-slate-900">{cycleYear} Individual Development Plan</h2>
        <p className="text-sm text-slate-500">Opens once a year, when Learning &amp; Development schedules it.</p>
      </div>
    </div>
  );

  if (state === 'Closed' && !alreadySubmitted) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        {header}
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <Lock className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">The IDP form isn&rsquo;t open right now</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">{closedReason(config)}</p>
        </div>
      </div>
    );
  }

  const windowClosedButFiled = state === 'Closed' && alreadySubmitted;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {header}

      <div className={`${cardCls} mb-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-slate-600">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            {config.mode === 'Auto'
              ? <>Open {fmtDate(config.opensAt)} &ndash; {fmtDate(config.closesAt)}</>
              : <>Set to <strong className="font-semibold">{config.mode}</strong> by L&amp;D</>}
          </span>
          {alreadySubmitted ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Submitted {fmtDate(form.submittedAt ?? null)}
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Not yet submitted</span>
          )}
        </div>
        {config.instructions && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-700">{config.instructions}</p>
        )}
        <p className="mt-3 border-t border-slate-100 pt-3 text-[0.7rem] leading-relaxed text-slate-500">
          <strong className="text-slate-600">Confidentiality Note:</strong> {IDP_CONFIDENTIALITY_NOTE}
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="mb-4 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> {notice}
        </p>
      )}

      {readOnly && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-600">
            {windowClosedButFiled
              ? 'The window has closed. Your submitted answers are shown below.'
              : 'You have already submitted. You can revise while the window is open.'}
          </span>
          {!windowClosedButFiled && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              <Pencil className="h-3.5 w-3.5" /> Revise
            </button>
          )}
        </div>
      )}

      <fieldset disabled={readOnly} className="space-y-5">
        {/* ── PERSONAL DATA ─────────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h3 className={sectionHeadCls}>PERSONAL DATA</h3>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>FULL NAME (GIVEN NAME, MIDDLE INITIAL, FAMILY NAME)<Required /></label>
              <input className={inputCls} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Office<Required /></label>
              <select className={inputCls} value={form.office} onChange={(e) => set('office', e.target.value)}>
                <option value="">Choose</option>
                {IDP_OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Division<Required /></label>
              <input className={inputCls} value={form.division} onChange={(e) => set('division', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Position<Required /></label>
              <input className={inputCls} value={form.position} onChange={(e) => set('position', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Salary Grade<Required /></label>
              <input className={inputCls} value={form.salaryGrade} onChange={(e) => set('salaryGrade', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Years in Position<Required /></label>
              <input className={inputCls} value={form.yearsInPosition} onChange={(e) => set('yearsInPosition', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Year&rsquo;s Gov&rsquo;t. Service<Required /></label>
              <input className={inputCls} value={form.yearsGovernmentService} onChange={(e) => set('yearsGovernmentService', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Eligibility<Required /></label>
              <input className={inputCls} value={form.eligibility} onChange={(e) => set('eligibility', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Educational Attainment<Required /></label>
              <input className={inputCls} value={form.educationalAttainment} onChange={(e) => set('educationalAttainment', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Age<Required /></label>
              <input className={inputCls} value={form.age} onChange={(e) => set('age', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Gender<Required /></label>
              <div className="flex flex-wrap gap-4 pt-1">
                {IDP_GENDERS.map((g) => (
                  <label key={g} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input type="radio" name="gender" checked={form.gender === g} onChange={() => set('gender', g)} />
                    {g}
                  </label>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Email Address<Required /></label>
              <input type="email" className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
          </div>
        </section>

        {/* ── SELF-EVALUATION ───────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h3 className={sectionHeadCls}>SELF-EVALUATION</h3>
          <div className="space-y-4 p-5">
            <div>
              <label className={labelCls}>{IDP_QUESTIONS.skillsToDevelop}<Required /></label>
              <textarea className={`${inputCls} min-h-[80px] resize-y`} value={form.skillsToDevelop} onChange={(e) => set('skillsToDevelop', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{IDP_QUESTIONS.strengthsToUtilize}<Required /></label>
              <textarea className={`${inputCls} min-h-[80px] resize-y`} value={form.strengthsToUtilize} onChange={(e) => set('strengthsToUtilize', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{IDP_QUESTIONS.worksOutside}<Required /></label>
              <div className="flex gap-5 pt-1">
                {[['YES', true], ['NO', false]].map(([label, val]) => (
                  <label key={String(label)} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="worksOutside"
                      checked={form.worksOutsideJobDescription === val}
                      onChange={() => set('worksOutsideJobDescription', val as boolean)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Part III — only when the answer above is YES ───────────────── */}
        {form.worksOutsideJobDescription === true && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h3 className={sectionHeadCls}>Part III — IF YES</h3>
            <div className="p-5">
              <label className={labelCls}>{IDP_QUESTIONS.outsideTasks}<Required /></label>
              <textarea className={`${inputCls} min-h-[80px] resize-y`} value={form.outsideTasks} onChange={(e) => set('outsideTasks', e.target.value)} />
            </div>
          </section>
        )}

        {/* ── CAREER DEVELOPMENT ────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h3 className={sectionHeadCls}>CAREER DEVELOPMENT</h3>
          <div className="space-y-4 p-5">
            <div className="rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
              <p>{CAREER_DEVELOPMENT_BLURB.intro}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {CAREER_DEVELOPMENT_BLURB.items.map((i) => (
                  <li key={i.label}><strong className="text-slate-700">{i.label}:</strong> {i.text}</li>
                ))}
              </ul>
            </div>
            <div>
              <label className={labelCls}>{IDP_QUESTIONS.careerNeeds}</label>
              <div className="space-y-2 pt-1">
                {CAREER_NEED_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={(form.careerNeeds as string[]).includes(opt)}
                      onChange={() => set('careerNeeds', toggleIn(form.careerNeeds as string[], opt))}
                    />
                    {opt}
                  </label>
                ))}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-700">Other:</label>
                  <input className={`${inputCls} flex-1`} value={form.careerOther} onChange={(e) => set('careerOther', e.target.value)} />
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>{IDP_QUESTIONS.careerSpecifics}</label>
              <textarea className={`${inputCls} min-h-[70px] resize-y`} value={form.careerSpecifics} onChange={(e) => set('careerSpecifics', e.target.value)} />
            </div>
          </div>
        </section>

        {/* ── PERSONAL DEVELOPMENT ──────────────────────────────────────── */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h3 className={sectionHeadCls}>PERSONAL DEVELOPMENT</h3>
          <div className="space-y-4 p-5">
            <div className="rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
              <p>{PERSONAL_DEVELOPMENT_BLURB.intro}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {PERSONAL_DEVELOPMENT_BLURB.items.map((i) => (
                  <li key={i.label}><strong className="text-slate-700">{i.label}:</strong> {i.text}</li>
                ))}
              </ul>
            </div>
            <div>
              <label className={labelCls}>{IDP_QUESTIONS.personalGoals}</label>
              <div className="space-y-2 pt-1">
                {PERSONAL_GOAL_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={(form.personalGoals as string[]).includes(opt)}
                      onChange={() => set('personalGoals', toggleIn(form.personalGoals as string[], opt))}
                    />
                    {opt}
                  </label>
                ))}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-700">Other:</label>
                  <input className={`${inputCls} flex-1`} value={form.personalOther} onChange={(e) => set('personalOther', e.target.value)} />
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>{IDP_QUESTIONS.personalSpecifics}</label>
              <textarea className={`${inputCls} min-h-[70px] resize-y`} value={form.personalSpecifics} onChange={(e) => set('personalSpecifics', e.target.value)} />
            </div>
          </div>
        </section>

        {/* ── RECOMMENDATION ────────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h3 className={sectionHeadCls}>RECOMMENDATION</h3>
          <div className="p-5">
            <label className={labelCls}>{IDP_QUESTIONS.otherTopics}</label>
            <textarea className={`${inputCls} min-h-[80px] resize-y`} value={form.otherTopics} onChange={(e) => set('otherTopics', e.target.value)} />
          </div>
        </section>
      </fieldset>

      {showErrors && missing.length > 0 && !readOnly && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <TriangleAlert className="h-4 w-4" /> Still needs an answer
          </p>
          <ul className="mt-1.5 list-disc pl-5 text-xs text-amber-700">
            {missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      {!readOnly && (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          {/* A draft keeps submitted_at null, so an unfinished form never lands
              in L&D's counts. */}
          <button
            type="button"
            onClick={() => void persist(false)}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> Save draft
          </button>
          <button
            type="button"
            onClick={() => void persist(true)}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            <Send className="h-4 w-4" /> {saving ? 'Saving…' : alreadySubmitted ? 'Submit revision' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  );
};

export default IdpFormSection;
