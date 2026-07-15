/**
 * Performance History (Module 2 · Subtab 2.4).
 *
 * Read-only per-employee timeline of completed IPCR cycles, each showing the
 * original targets and the corresponding accomplishments side by side, plus
 * basic trend indicators. Assembled from:
 *   - performance_evaluations  → completed cycles, final score, dates
 *   - ipcr_performance         → target vs accomplishment rows (best-effort)
 *   - locked_targets           → frozen targets when no ipcr_performance rows
 * Nothing is written here — it's a reference/analysis view.
 */

import { supabase as supabaseClient } from '../supabase';
import { bucketForScore } from './performanceEvaluations';

const supabase = supabaseClient as any;

export interface HistoryTargetRow {
  functionType: string | null;
  target: string;
  accomplishment: string;
}

export interface HistoryCycle {
  period: string;
  finalScore: number | null;
  adjectival: string | null;
  status: string | null;
  approvedAt: string | null;
  rows: HistoryTargetRow[];
}

export interface EmployeeHistory {
  cycles: HistoryCycle[]; // most recent first
  trends: string[];
  avgScore: number | null;
  cyclesCompleted: number;
}

const sortKey = (c: HistoryCycle) => c.approvedAt ?? '';

/** Best-effort resolution of an employee's number (schema has drifted). */
async function resolveEmployeeNumber(employeeId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from('employees').select('*').eq('id', employeeId).maybeSingle();
    return data?.employee_id ?? data?.employee_number ?? data?.employee_no ?? data?.employeeNumber ?? null;
  } catch {
    return null;
  }
}

export async function getEmployeeHistory(
  employeeId: string,
): Promise<{ ok: true; data: EmployeeHistory } | { ok: false; error: string }> {
  if (!employeeId) return { ok: false, error: 'No employee selected.' };
  try {
    const employeeNum = await resolveEmployeeNumber(employeeId);

    const [evalRes, lockedRes, perfRes] = await Promise.all([
      supabase
        .from('performance_evaluations')
        .select('period, final_score, status, approved_at, submitted_at')
        .eq('employee_id', employeeId),
      supabase.from('locked_targets').select('period, targets').eq('employee_id', employeeId),
      employeeNum
        ? supabase
            .from('ipcr_performance')
            .select('rating_period, function_type, target_text, accomplishment_text')
            .eq('employee_num', employeeNum)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const evals: any[] = evalRes.error ? [] : evalRes.data ?? [];
    const locked: any[] = lockedRes.error ? [] : lockedRes.data ?? [];
    const perf: any[] = (perfRes as any).error ? [] : (perfRes as any).data ?? [];

    // Index by period.
    const evalByPeriod = new Map<string, any>();
    for (const e of evals) if (e?.period) evalByPeriod.set(String(e.period), e);

    const lockedByPeriod = new Map<string, any[]>();
    for (const l of locked) if (l?.period) lockedByPeriod.set(String(l.period), Array.isArray(l.targets) ? l.targets : []);

    const perfByPeriod = new Map<string, any[]>();
    for (const p of perf) {
      const key = String(p?.rating_period ?? '');
      if (!key) continue;
      const list = perfByPeriod.get(key) ?? [];
      list.push(p);
      perfByPeriod.set(key, list);
    }

    const periods = new Set<string>([...evalByPeriod.keys(), ...lockedByPeriod.keys(), ...perfByPeriod.keys()]);

    const cycles: HistoryCycle[] = Array.from(periods).map((period) => {
      const ev = evalByPeriod.get(period);
      const finalScore = ev && ev.final_score != null ? Number(ev.final_score) : null;

      // Prefer ipcr_performance (has accomplishments); fall back to locked targets.
      let rows: HistoryTargetRow[] = [];
      const perfRows = perfByPeriod.get(period);
      if (perfRows && perfRows.length) {
        rows = perfRows.map((p) => ({
          functionType: p.function_type ?? null,
          target: String(p.target_text ?? ''),
          accomplishment: String(p.accomplishment_text ?? ''),
        }));
      } else {
        const lt = lockedByPeriod.get(period) ?? [];
        rows = lt.map((t: any) => ({
          functionType: t.function_type ?? null,
          target: String(t.target_text ?? ''),
          accomplishment: '',
        }));
      }

      return {
        period,
        finalScore,
        adjectival: finalScore != null ? bucketForScore(finalScore) : null,
        status: ev?.status ?? null,
        approvedAt: ev?.approved_at ?? ev?.submitted_at ?? null,
        rows,
      };
    });

    cycles.sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : sortKey(a) > sortKey(b) ? -1 : b.period.localeCompare(a.period)));

    // Trend indicators (chronological ascending for comparisons).
    const chrono = [...cycles].reverse();
    const scored = chrono.filter((c) => c.finalScore != null) as (HistoryCycle & { finalScore: number })[];
    const trends: string[] = [];
    if (scored.length >= 2) {
      const first = scored[0].finalScore;
      const last = scored[scored.length - 1].finalScore;
      if (last > first + 0.1) trends.push('Improving trend');
      else if (last < first - 0.1) trends.push('Declining trend');
      else trends.push('Steady performance');
      if (scored.every((c) => c.finalScore >= 4.0)) trends.push('Consistently exceeds targets');
    }
    if (scored.some((c) => c.finalScore < 2.0)) trends.push('Cycles below satisfactory — review recommended');

    const avgScore = scored.length ? Number((scored.reduce((s, c) => s + c.finalScore, 0) / scored.length).toFixed(2)) : null;

    return {
      ok: true,
      data: { cycles, trends, avgScore, cyclesCompleted: scored.length },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
