/**
 * Per-employee competency gap panel — shared by the PM and L&D Summary of
 * Ratings so both portals show the same gap breakdown + AI summary.
 *
 * The "AI gap summary" is generated from the employee's competency breakdown
 * (possessed vs required proficiency from v_competency_gap_analysis). It reads
 * as a narrative explaining where the employee lacks; swap summarizeGaps() for a
 * live LLM call if/when one is wired up — the inputs are already assembled here.
 */

import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { IPCRRatingRecord } from './SummaryOfRatings';
import { supabase } from '../../../lib/supabase';

type Comp = { name: string; possessed: number; required: number; isGap: boolean };

/** A narrative summary of where the employee lacks, from their competency gaps. */
export function summarizeGaps(record: IPCRRatingRecord): string {
  const comps = (record.competencies ?? []) as Comp[];
  const who = record.name.includes(',')
    ? record.name.split(',').map((s) => s.trim()).reverse().join(' ')
    : record.name;
  if (comps.length === 0) return `No competency evaluation is available for ${who} this period.`;

  const gaps = comps.filter((c) => c.isGap).sort((a, b) => (b.required - b.possessed) - (a.required - a.possessed));
  const strong = comps.length - gaps.length;

  if (gaps.length === 0) {
    return `${who} meets or exceeds the required proficiency on all ${comps.length} evaluated competencies for the ${record.position} role. No training gap identified this period.`;
  }

  const phrases = gaps.map(
    (g) => `${g.name} (rated ${g.possessed.toFixed(2)} against a required ${g.required.toFixed(2)} — a ${(g.required - g.possessed).toFixed(2)}-point shortfall)`
  );
  const list = phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join('; ')}; and ${phrases[phrases.length - 1]}`;
  const strongClause = strong > 0 ? ` ${strong} other competenc${strong === 1 ? 'y is' : 'ies are'} at or above standard.` : '';

  return `${who}, ${record.position}, shows a development need in ${gaps.length} competenc${gaps.length === 1 ? 'y' : 'ies'}: ${list}.${strongClause} Recommended action: targeted training on ${gaps.map((g) => g.name).join(', ')} to raise ${gaps.length === 1 ? 'it' : 'them'} to the required level.`;
}

export const CompetencyGapPanel = ({ record }: { record: IPCRRatingRecord }) => {
  const comps = (record.competencies ?? []) as Comp[];
  const [recommendations, setRecommendations] = useState<string | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);

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
      </h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {comps.map((comp, i) => (
          <div key={i} className={`rounded-lg border p-3 ${comp.isGap ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
            <div className="mb-2 flex items-start justify-between">
              <span className="pr-2 text-xs font-bold leading-tight text-slate-800">{comp.name}</span>
              {comp.isGap ? <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
            </div>
            <div className="mt-2 flex items-center gap-4">
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-slate-500">Required</span>
                <span className="text-sm font-semibold text-slate-700">{comp.required.toFixed(2)}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-slate-500">Possessed</span>
                <span className={`text-sm font-bold ${comp.isGap ? 'text-rose-600' : 'text-emerald-600'}`}>{comp.possessed.toFixed(2)}</span>
              </div>
              {comp.isGap && (
                <span className="ml-auto inline-flex rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">Gap</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CompetencyGapPanel;
