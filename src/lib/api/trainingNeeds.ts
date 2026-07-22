/**
 * LND "Training Requests & Needs" page data.
 *
 * Section 1 — manual training requests submitted by office accounts, grouped by
 * office. Office/name is resolved via employees_with_department because the base
 * employees table is anon-blocked (a PostgREST embed comes back null).
 *
 * Section 2 — an AI-inferred training-needs assessment: for each competency, how
 * many employees per office show a need for it (from ipcr_competency_matches,
 * the AI target→competency mapping), as a fraction of that office's headcount.
 * Empty until the competency matcher has run.
 */

import { supabase as supabaseClient } from '../supabase';
import { getActiveOfficeNameSet } from './departments';

const supabase = supabaseClient as any;

// ── Section 1: office requests ───────────────────────────────────────────────

export type RequestStatus = 'Pending' | 'Approved' | 'Dismissed';

export type OfficeRequest = {
  id: string;
  title: string;
  requestedBy: string;
  office: string;
  requestedAt: string | null;
  status: RequestStatus;
  justification: string | null;
  competency: string | null;
  category: string | null;
};

const dbToStatus = (s: string): RequestStatus =>
  s === 'approved' ? 'Approved' : s === 'rejected' ? 'Dismissed' : 'Pending';

/**
 * Requests are office-level: since migration 20260810 the office writes
 * `requesting_office` / `requested_by` on submit and `employee_id` is null.
 * Rows predating that were backfilled, but the employee lookup is kept as a
 * fallback so any request that slipped through still resolves an office rather
 * than collapsing into "Unassigned office".
 */
export async function listOfficeRequests(): Promise<OfficeRequest[]> {
  const { data, error } = await supabase
    .from('training_requests')
    .select('id, title, justification, competency, category, status, requested_at, employee_id, requesting_office, requested_by')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('Error loading training requests:', error);
    return [];
  }
  const rows = (data ?? []) as any[];
  if (!rows.length) return [];

  // Fallback identity for legacy rows that still carry an employee.
  const ids = [...new Set(rows.filter((r) => !r.requesting_office).map((r) => String(r.employee_id)).filter(Boolean))];
  const identity = new Map<string, { name: string; office: string }>();
  if (ids.length) {
    const { data: emps } = await supabase
      .from('employees_with_department')
      .select('id, full_name, department')
      .in('id', ids);
    for (const e of (emps ?? []) as any[]) {
      identity.set(String(e.id), {
        name: String(e.full_name ?? '').trim() || 'Office account',
        office: e.department ?? 'Unassigned office',
      });
    }
  }

  return rows.map((r): OfficeRequest => {
    const who = identity.get(String(r.employee_id));
    return {
      id: r.id,
      title: r.title,
      requestedBy: r.requested_by ?? who?.name ?? 'Office account',
      office: r.requesting_office ?? who?.office ?? 'Unassigned office',
      requestedAt: r.requested_at,
      status: dbToStatus(r.status),
      justification: r.justification ?? null,
      competency: r.competency ?? null,
      category: r.category ?? null,
    };
  });
}

export async function decideRequest(
  id: string,
  decision: 'Approved' | 'Dismissed'
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('training_requests')
    .update({ status: decision === 'Approved' ? 'approved' : 'rejected', decided_at: new Date().toISOString() })
    .eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Section 2: AI needs assessment ───────────────────────────────────────────

export type NeedPriority = 'High' | 'Medium' | 'Emerging';

export type OfficeNeed = {
  office: string;
  affected: number;
  total: number;
  /** affected / total, as a percentage. */
  demand: number;
};

export type CompetencyNeed = {
  competency: string;
  /**
   * The competency framework's training stream for this competency, title-cased
   * ("Technical", "Leadership", ...). Read from `competency_standards` rather
   * than a local map so the framework stays the single source of truth for how
   * competencies group.
   */
  category: string;
  /** total affected employees / total LGU headcount, as a percentage. */
  demand: number;
  priority: NeedPriority;
  /** Highest single-office demand — the signal a per-office reading needs. */
  peakOfficeDemand: number;
  offices: OfficeNeed[];
};

const priorityOf = (demand: number): NeedPriority =>
  demand >= 75 ? 'High' : demand >= 50 ? 'Medium' : 'Emerging';

const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 100) : 0);

/**
 * Cross-reference the AI competency matches against office headcounts:
 *   office demand      = distinct employees in office needing competency / office headcount
 *   competency demand  = distinct employees needing competency / total LGU headcount
 * Priority thresholds: >=75 High, 50-74 Medium, <50 Emerging.
 */
export async function computeNeedsAssessment(): Promise<CompetencyNeed[]> {
  const [{ data: emps, error: eErr }, activeOffices] = await Promise.all([
    supabase
      .from('employees_with_department')
      .select('id, department, status')
      .eq('status', 'Active'),
    getActiveOfficeNameSet(),
  ]);
  if (eErr) {
    console.error('Error loading employees for needs assessment:', eErr);
    return [];
  }

  // Only the currently-active offices count toward the assessment. Employees
  // tagged to a deactivated/legacy office are excluded from every aggregate so
  // the dashboard reflects the live 5-office structure, not stale data. An empty
  // active set (lookup failed) means "don't filter" — better to show everyone
  // than blank the whole dashboard on a transient error.
  const isActiveOffice = (office: string) =>
    activeOffices.size === 0 || activeOffices.has(office.trim().toLowerCase());

  const officeByEmp = new Map<string, string>();
  const totalByOffice = new Map<string, number>();
  for (const e of (emps ?? []) as any[]) {
    const office = e.department ?? 'Unassigned office';
    if (!isActiveOffice(office)) continue;
    officeByEmp.set(String(e.id), office);
    totalByOffice.set(office, (totalByOffice.get(office) ?? 0) + 1);
  }
  // LGU-wide headcount = employees in an active office only (matches officeByEmp),
  // so competency-demand percentages divide by the real 5-office population.
  const totalLgu = officeByEmp.size;
  if (!totalLgu) return [];

  const { data: matches, error: mErr } = await supabase
    .from('ipcr_competency_matches')
    .select('employee_id, competency')
    .not('competency', 'is', null)
    .not('employee_id', 'is', null);
  if (mErr) {
    console.error('Error loading competency matches:', mErr);
    return [];
  }

  // competency -> office -> set of distinct employee ids
  const byComp = new Map<string, Map<string, Set<string>>>();
  const affectedByComp = new Map<string, Set<string>>();
  for (const m of (matches ?? []) as any[]) {
    const comp = String(m.competency);
    const emp = String(m.employee_id);
    const office = officeByEmp.get(emp);
    if (!office) continue; // employee not Active / not resolvable
    if (!byComp.has(comp)) byComp.set(comp, new Map());
    const officeMap = byComp.get(comp)!;
    if (!officeMap.has(office)) officeMap.set(office, new Set());
    officeMap.get(office)!.add(emp);
    if (!affectedByComp.has(comp)) affectedByComp.set(comp, new Set());
    affectedByComp.get(comp)!.add(emp);
  }

  // Competency -> training stream, straight from the framework.
  const { data: standards } = await supabase
    .from('competency_standards')
    .select('competency_name, training_stream');
  const titleCase = (s: string) =>
    String(s ?? '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const categoryOf = new Map<string, string>(
    (standards ?? []).map((s: any) => [String(s.competency_name), titleCase(s.training_stream)])
  );

  const needs: CompetencyNeed[] = [];
  for (const [competency, officeMap] of byComp) {
    const offices: OfficeNeed[] = [...officeMap.entries()]
      .map(([office, set]) => {
        const total = totalByOffice.get(office) ?? set.size;
        return { office, affected: set.size, total, demand: pct(set.size, total) };
      })
      .sort((a, b) => b.demand - a.demand || b.affected - a.affected);

    const affected = affectedByComp.get(competency)?.size ?? 0;
    const demand = pct(affected, totalLgu);
    needs.push({
      competency,
      category: categoryOf.get(competency) ?? 'Technical',
      demand,
      priority: priorityOf(demand),
      peakOfficeDemand: offices[0]?.demand ?? 0,
      offices,
    });
  }

  return needs.sort((a, b) => b.demand - a.demand);
}
