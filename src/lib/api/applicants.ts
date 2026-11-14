/**
 * Applicants API — RSP corrections to an applicant's submitted details.
 *
 * Column names match what the application form writes (ApplicantWizard):
 * education attainment is stored as `education_level`, experience as
 * `years_of_experience` (decimal years).
 */

import { supabase as supabaseClient } from '../../lib/supabase';
import { normalizeReference } from '../applicantTracker';
import { fetchApplicantSlotLinksChecked, fetchSlotsByJobPostingChecked } from '../plantillaSlots';
import { plantillaLabel } from '../plantillaRules';
import { groupByReference, type ReferenceApplication } from '../referenceApplications';

const supabase = supabaseClient as any;

export interface ApplicantDetailsPatch {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  contact_number: string;
  address: string;
  is_pwd: boolean;
  education_level: string | null;
  education_degree: string | null;
  education_school: string | null;
  years_of_experience: number | null;
}

export async function updateApplicantDetails(
  applicantId: string,
  patch: ApplicantDetailsPatch,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('applicants')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', applicantId);
    if (error) return { ok: false, error: error.message ?? 'Failed to save applicant details.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Every application under the given Reference Nos., grouped by normalised
 * reference and oldest first. One person keeps one reference across plantillas
 * (migration 20261021200000), so this lists all of a person's applications,
 * including the ones withdrawn by a hire elsewhere. Callers hide the chip on a
 * failed read; it never breaks the list that asked.
 */
export async function fetchApplicationsByReference(
  references: string[],
): Promise<{ data: Map<string, ReferenceApplication[]> | null; error?: string }> {
  const normalized = [...new Set(references.map(normalizeReference).filter(Boolean))];
  if (normalized.length === 0) return { data: new Map() };
  try {
    const { data, error } = await supabase
      .from('applicants')
      .select('id, reference_no, position, status, hired_elsewhere_application_id, created_at')
      .in('reference_no_normalized', normalized)
      .is('deleted_at', null);
    if (error) return { data: null, error: error.message ?? 'Failed to load applications by reference.' };
    const rows: any[] = data ?? [];
    // An empty id list would make the slot-link read fetch every link.
    if (rows.length === 0) return { data: new Map() };

    // Plantilla labels: the same two reads the Applications tab uses.
    const links = await fetchApplicantSlotLinksChecked(rows.map((row) => String(row.id ?? '')));
    const slotIds = [...new Set([...(links.data?.values() ?? [])].flat().map((link) => link.slotId))];
    const slots = await fetchSlotsByJobPostingChecked(slotIds);
    const slotById = new Map(
      [...(slots.data?.values() ?? [])].flat().map((slot) => [slot.id, slot] as const),
    );
    const labelFor = (applicantId: string): string | null => {
      const linked = (links.data?.get(applicantId) ?? [])
        .map((link) => slotById.get(link.slotId))
        .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot))
        .sort((a, b) => a.slotNumber - b.slotNumber);
      return linked.length > 0 ? linked.map(plantillaLabel).join(', ') : null;
    };

    return {
      data: groupByReference(rows.map((row) => ({
        id: String(row.id ?? ''),
        referenceNo: String(row.reference_no ?? ''),
        position: String(row.position ?? ''),
        plantillaLabel: labelFor(String(row.id ?? '')),
        status: String(row.status ?? ''),
        hiredElsewhereApplicationId: row.hired_elsewhere_application_id ? String(row.hired_elsewhere_application_id) : null,
        createdAt: String(row.created_at ?? ''),
      }))),
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}
