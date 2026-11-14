import { normalizeReference } from './applicantTracker';

/**
 * One application under a person's Reference No. Since migration
 * 20261021200000 a person keeps one reference across every plantilla they
 * apply to, so RSP can list all of them from any one row.
 */
export interface ReferenceApplication {
  id: string;
  referenceNo: string;
  position: string;
  /** "Plantilla 5", or null when the application has no linked plantilla. */
  plantillaLabel: string | null;
  status: string;
  /** Set on a withdrawn row: the application whose hire withdrew it. */
  hiredElsewhereApplicationId: string | null;
  createdAt: string;
}

/**
 * Applications keyed by normalised reference, oldest first in each group.
 * Rows without a reference are left out, so applications with no email
 * (which never share a reference) are never merged.
 */
export function groupByReference(rows: ReferenceApplication[]): Map<string, ReferenceApplication[]> {
  const groups = new Map<string, ReferenceApplication[]>();
  for (const row of rows) {
    const key = normalizeReference(row.referenceNo);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => Date.parse(a.createdAt || '') - Date.parse(b.createdAt || '') || 0);
  }
  return groups;
}

/** "Withdrawn: hired on Plantilla 5", naming the plantilla the person was hired on. */
export function withdrawnLabel(app: ReferenceApplication, group: ReferenceApplication[]): string {
  const hire = group.find((row) => row.id === app.hiredElsewhereApplicationId);
  return hire?.plantillaLabel ? `Withdrawn: hired on ${hire.plantillaLabel}` : 'Withdrawn: hired elsewhere';
}
