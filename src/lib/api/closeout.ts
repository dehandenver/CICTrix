/**
 * Final Review & Closeout (Module 1 · Tab 1.3 · Subtab 2).
 *
 * The terminal step of a cycle. Before PM can close an office out, all three
 * components must be present:
 *   (1) all individual IPCRs verified (from performance_evaluations),
 *   (2) at least one Supervisor-compiled DPCR,
 *   (3) one Dept-Head-compiled OPCR.
 * Closeout locks + timestamps + archives the bundle (ready for Records Search).
 * See migration 013_create_compliance_closeout.sql.
 */

import { supabase as supabaseClient } from '../supabase';
import type { OfficeCompliance } from './compliance';

const supabase = supabaseClient as any;

export type CompilationKind = 'DPCR' | 'OPCR';

export interface Compilation {
  id: string;
  office_id: string | null;
  office_name: string | null;
  period: string | null;
  kind: CompilationKind;
  group_name: string | null;
  compiled_by: string | null;
  created_at: string;
}

export interface Closeout {
  id: string;
  office_id: string | null;
  office_name: string | null;
  period: string | null;
  ipcr_verified: number;
  ipcr_total: number;
  dpcr_count: number;
  opcr_count: number;
  archived: boolean;
  closed_by: string | null;
  closed_at: string;
  created_at: string;
}

export interface MissingPiece {
  piece: string;
  owner: string;
}

export interface CloseoutReadiness {
  officeId: string;
  officeName: string;
  period: string;
  ipcrVerified: number;
  ipcrTotal: number;
  ipcrOk: boolean;
  dpcrCount: number;
  dpcrOk: boolean;
  opcrCount: number;
  opcrOk: boolean;
  canCloseout: boolean;
  closed: Closeout | null;
  missing: MissingPiece[];
}

export async function listCompilations(period: string): Promise<Compilation[]> {
  try {
    const { data, error } = await supabase.from('cycle_compilations').select('*').eq('period', period);
    if (error) return [];
    return (data ?? []) as Compilation[];
  } catch {
    return [];
  }
}

export async function listCloseouts(period: string): Promise<Closeout[]> {
  try {
    const { data, error } = await supabase.from('office_cycle_closeouts').select('*').eq('period', period);
    if (error) return [];
    return (data ?? []) as Closeout[];
  } catch {
    return [];
  }
}

/** Record a Supervisor DPCR or Dept-Head OPCR compilation for an office. */
export async function recordCompilation(input: {
  officeId: string;
  officeName: string;
  period: string;
  kind: CompilationKind;
  groupName?: string | null;
  compiledBy: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { error } = await supabase.from('cycle_compilations').insert([
      {
        office_id: input.officeId,
        office_name: input.officeName,
        period: input.period,
        kind: input.kind,
        group_name: input.groupName ?? null,
        compiled_by: input.compiledBy,
      },
    ]);
    if (error) return { ok: false, error: error.message ?? 'Failed to record compilation.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Close out an office cycle: lock + timestamp + archive. Blocked if incomplete. */
export async function closeoutOffice(input: {
  readiness: CloseoutReadiness;
  closedBy: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = input.readiness;
  if (!r.canCloseout) {
    return { ok: false, error: 'Cannot close out — one or more required components are missing.' };
  }
  try {
    const { error } = await supabase.from('office_cycle_closeouts').insert([
      {
        office_id: r.officeId,
        office_name: r.officeName,
        period: r.period,
        ipcr_verified: r.ipcrVerified,
        ipcr_total: r.ipcrTotal,
        dpcr_count: r.dpcrCount,
        opcr_count: r.opcrCount,
        archived: true,
        closed_by: input.closedBy,
      },
    ]);
    if (error) return { ok: false, error: error.message ?? 'Failed to close out the office.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Combine per-office compliance with compilations + existing closeouts into the
 * readiness rows shown in Final Review. Offices with no employees are excluded
 * (nothing to close out).
 */
export function buildReadiness(
  compliance: OfficeCompliance[],
  compilations: Compilation[],
  closeouts: Closeout[],
  period: string,
): CloseoutReadiness[] {
  const dpcrByOffice = new Map<string, number>();
  const opcrByOffice = new Map<string, number>();
  for (const c of compilations) {
    const key = String(c.office_id ?? '');
    if (!key) continue;
    if (c.kind === 'DPCR') dpcrByOffice.set(key, (dpcrByOffice.get(key) ?? 0) + 1);
    else if (c.kind === 'OPCR') opcrByOffice.set(key, (opcrByOffice.get(key) ?? 0) + 1);
  }
  const closedByOffice = new Map<string, Closeout>();
  for (const c of closeouts) closedByOffice.set(String(c.office_id ?? ''), c);

  return compliance
    .filter((o) => o.totalEmployees > 0)
    .map((o) => {
      const dpcrCount = dpcrByOffice.get(o.officeId) ?? 0;
      const opcrCount = opcrByOffice.get(o.officeId) ?? 0;
      const ipcrOk = o.totalEmployees > 0 && o.verified === o.totalEmployees;
      const dpcrOk = dpcrCount >= 1;
      const opcrOk = opcrCount >= 1;
      const closed = closedByOffice.get(o.officeId) ?? null;

      const missing: MissingPiece[] = [];
      if (!ipcrOk) missing.push({ piece: `IPCRs verified (${o.verified}/${o.totalEmployees})`, owner: 'Supervisor / Dept Head' });
      if (!dpcrOk) missing.push({ piece: 'Supervisor DPCR', owner: 'Supervisor' });
      if (!opcrOk) missing.push({ piece: 'Dept Head OPCR', owner: 'Department Head' });

      return {
        officeId: o.officeId,
        officeName: o.officeName,
        period,
        ipcrVerified: o.verified,
        ipcrTotal: o.totalEmployees,
        ipcrOk,
        dpcrCount,
        dpcrOk,
        opcrCount,
        opcrOk,
        canCloseout: !closed && ipcrOk && dpcrOk && opcrOk,
        closed,
        missing,
      };
    });
}
