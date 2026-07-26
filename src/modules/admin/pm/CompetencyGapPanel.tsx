/**
 * Per-employee competency gap panel — shared by the PM and L&D Summary of
 * Ratings so both portals show the same gap breakdown + AI summary.
 *
 * The "AI gap summary" is generated from the employee's competency breakdown
 * (possessed vs required proficiency from v_competency_gap_analysis). It reads
 * as a narrative explaining where the employee lacks; swap summarizeGaps() for a
 * live LLM call if/when one is wired up — the inputs are already assembled here.
 */

import { AlertCircle, CheckCircle2, ChevronDown, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { IPCRRatingRecord } from './SummaryOfRatings';
import { supabase } from '../../../lib/supabase';
import { getCompetencyTargetTrace, type CompetencyTargetTrace } from '../../../lib/api/competencyTargetTrace';

type Comp = {
  name: string;
  possessed: number;
  required: number;
  isGap: boolean;
  possessedAvailable?: boolean;
};

/** A narrative summary of where the employee lacks, from their competency gaps. */
export function summarizeGaps(record: IPCRRatingRecord): string {
  const all = (record.competencies ?? []) as Comp[];
  const who = record.name.includes(',')
    ? record.name.split(',').map((s) => s.trim()).reverse().join(' ')
    : record.name;
  if (all.length === 0) return `No competency evaluation is available for ${who} this period.`;

  // "Not yet assessed" competencies (submitted IPCR, AI assessment pending) must
  // not be read as either strengths or gaps — call them out separately.
  const pending = all.filter((c) => c.possessedAvailable === false);
  const comps = all.filter((c) => c.possessedAvailable !== false);
  const pendingClause = pending.length
    ? ` ${pending.length} competenc${pending.length === 1 ? 'y is' : 'ies are'} awaiting competency assessment for this semester.`
    : '';
  if (comps.length === 0) {
    return `${who}'s IPCR is in, but the competency assessment for this semester hasn't run yet, so no possessed scores are available.${pendingClause}`;
  }

  const gaps = comps.filter((c) => c.isGap).sort((a, b) => (b.required - b.possessed) - (a.required - a.possessed));
  const strong = comps.length - gaps.length;

  if (gaps.length === 0) {
    return `${who} meets or exceeds the required proficiency on all ${comps.length} evaluated competencies for the ${record.position} role. No training gap identified this period.${pendingClause}`;
  }

  const phrases = gaps.map(
    (g) => `${g.name} (rated ${g.possessed.toFixed(2)} against a required ${g.required.toFixed(2)} — a ${(g.required - g.possessed).toFixed(2)}-point shortfall)`
  );
  const list = phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join('; ')}; and ${phrases[phrases.length - 1]}`;
  const strongClause = strong > 0 ? ` ${strong} other competenc${strong === 1 ? 'y is' : 'ies are'} at or above standard.` : '';

  return `${who}, ${record.position}, shows a development need in ${gaps.length} competenc${gaps.length === 1 ? 'y' : 'ies'}: ${list}.${strongClause}${pendingClause} Recommended action: targeted training on ${gaps.map((g) => g.name).join(', ')} to raise ${gaps.length === 1 ? 'it' : 'them'} to the required level.`;
}

export const CompetencyGapPanel = ({ record }: { record: IPCRRatingRecord }) => {
  const comps = (record.competencies ?? []) as Comp[];
  const [recommendations, setRecommendations] = useState<string | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const fetchRecommendations = async () => {
      setLoadingRec(true);
      try {
        const { data, error } = await (supabase as any)
          .from('employee_competency_summaries')
          .select('recommendations, employees!inner(employee_number)')
          .eq('employees.employee_number', record.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        if (active) {
          if (data && data.length > 0) {
            setRecommendations(data[0].recommendations);
          } else {
            setRecommendations(null);
          }
        }
      } catch (err) {
        console.error('Error fetching recommendations in CompetencyGapPanel:', err);
      } finally {
        if (active) setLoadingRec(false);
      }
    };

    void fetchRecommendations();
    return () => {
      active = false;
    };
  }, [record.id]);

  if (comps.length === 0) {
    return <p className="text-xs text-slate-400">No competency breakdown available for this employee.</p>;
  }
  const gapCount = comps.filter((c) => c.isGap).length;

  return (
    <div>
      {/* AI gap summary */}
      <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
          <Sparkles className="h-3.5 w-3.5" /> AI gap summary
        </p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{summarizeGaps(record)}</p>
      </div>

      {/* Recommended Learning Interventions */}
      {loadingRec ? (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3 animate-pulse">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
            Loading Recommended Learning Interventions...
          </p>
        </div>
      ) : recommendations ? (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-700">
            <Sparkles className="h-3.5 w-3.5" /> Recommended Learning Interventions
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{recommendations}</p>
        </div>
      ) : null}

      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        Competency gap evaluation {gapCount > 0 && <span className="text-rose-600">· {gapCount} gap{gapCount === 1 ? '' : 's'}</span>}
        <span className="ml-1 font-medium normal-case tracking-normal text-slate-400">· click a competency to see its IPCR source</span>
      </h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {comps.map((comp, i) => {
          const notAssessed = comp.possessedAvailable === false;
          const open = selected === i;
          return (
            <div key={i} className="contents">
              <button
                type="button"
                onClick={() => setSelected(open ? null : i)}
                aria-expanded={open}
                className={`rounded-lg border p-3 text-left transition hover:shadow-sm ${
                  open ? 'ring-2 ring-indigo-300 ' : ''
                }${comp.isGap ? 'border-rose-200 bg-rose-50' : notAssessed ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}
              >
                <div className="mb-2 flex items-start justify-between">
                  <span className="pr-2 text-xs font-bold leading-tight text-slate-800">{comp.name}</span>
                  {comp.isGap ? (
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  ) : notAssessed ? (
                    <ChevronDown className={`h-4 w-4 shrink-0 text-amber-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  )}
                </div>
                <div className="mt-2 flex items-center gap-4">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">Required</span>
                    <span className="text-sm font-semibold text-slate-700">{comp.required.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">Possessed</span>
                    {notAssessed ? (
                      <span className="text-xs font-semibold text-amber-600">Not yet assessed</span>
                    ) : (
                      <span className={`text-sm font-bold ${comp.isGap ? 'text-rose-600' : 'text-emerald-600'}`}>{comp.possessed.toFixed(2)}</span>
                    )}
                  </div>
                  {comp.isGap && (
                    <span className="ml-auto inline-flex rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">Gap</span>
                  )}
                </div>
              </button>
              {open && (
                <div className="md:col-span-2 lg:col-span-3">
                  <TraceDetail
                    employeeNumber={record.id}
                    competencyName={comp.name}
                    cycleId={record.cycleId ?? null}
                    card={comp}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Drill-down under a competency card (Requirement 1): the IPCR target(s) mapped
 * to the competency with their individual scores (A), how they aggregate into
 * the Possessed value (B), and the Required score's source (C). Reads the exact
 * chain the AI assessor used via getCompetencyTargetTrace — no re-derivation.
 */
const TraceDetail = ({
  employeeNumber,
  competencyName,
  cycleId,
  card,
}: {
  employeeNumber: string;
  competencyName: string;
  cycleId: number | null;
  card: Comp;
}) => {
  const [trace, setTrace] = useState<CompetencyTargetTrace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getCompetencyTargetTrace({ employeeNumber, competencyName, cycleId })
      .then((t) => { if (active) setTrace(t); })
      .catch((e) => { console.error('trace error:', e); if (active) setTrace(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [employeeNumber, competencyName, cycleId]);

  if (loading) {
    return <div className="mt-1 animate-pulse rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-indigo-500">Loading IPCR source…</div>;
  }

  const targets = trace?.mappedTargets ?? [];
  const noTargets = targets.length === 0;
  const possessed = card.possessedAvailable === false ? null : card.possessed;

  return (
    <div className="mt-1 space-y-3 rounded-lg border border-indigo-200 bg-white p-4">
      {/* C. Required source */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Required — from Competency Map</p>
        <p className="mt-0.5 text-sm text-slate-700">
          {trace?.position ? `${trace.position} — ` : ''}{competencyName} — Required:{' '}
          {trace?.requiredLevel
            ? `${trace.requiredLevel} (${card.required.toFixed(2)})`
            : `${card.required.toFixed(2)}`}
        </p>
      </div>

      {/* A. Mapped IPCR targets */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Mapped IPCR target{targets.length === 1 ? '' : 's'}</p>
        {noTargets ? (
          <p className="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">
            No IPCR target is currently mapped to this competency — the possessed score is
            {card.possessedAvailable === false ? ' not yet available (assessment pending).' : ' unavailable / defaulted.'}
          </p>
        ) : (
          <ul className="mt-1 space-y-2">
            {targets.map((t, i) => (
              <li key={i} className="rounded border border-slate-200 bg-slate-50 p-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs text-slate-700">
                    {t.functionType && <span className="font-semibold text-slate-500">{t.functionType} — </span>}
                    {t.targetText.replace(/^.*?—\s*/, '')}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-slate-800">
                    {t.individualScore != null ? t.individualScore.toFixed(2) : '—'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
                  {t.quality != null && <span>Q {t.quality}</span>}
                  {t.efficiency != null && <span>E {t.efficiency}</span>}
                  {t.timeliness != null && <span>T {t.timeliness}</span>}
                  {t.confidence != null && <span>· AI confidence {(t.confidence * 100).toFixed(0)}%</span>}
                </div>
                {t.justification && <p className="mt-1 text-[11px] italic text-slate-500">{t.justification}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* B. How Possessed was calculated */}
      {!noTargets && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">How possessed was calculated</p>
          <p className="mt-0.5 text-sm text-slate-700">
            {trace?.aggregationMethod === 'single'
              ? `Possessed ${possessed != null ? possessed.toFixed(2) : '—'} comes directly from the single mapped IPCR target above` +
                (trace?.possessedComputed != null ? ` (scored ${trace.possessedComputed.toFixed(2)}).` : '.')
              : `Possessed ${possessed != null ? possessed.toFixed(2) : '—'} is the average of ${targets.length} IPCR targets mapped to this competency` +
                (trace?.possessedComputed != null ? ` (mean ${trace.possessedComputed.toFixed(2)}, rounded to the 1-5 proficiency scale).` : '.')}
          </p>
        </div>
      )}
    </div>
  );
};

export default CompetencyGapPanel;
