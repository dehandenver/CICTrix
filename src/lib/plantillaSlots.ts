import { supabase } from './supabase';
import type {
  ApplicationSlotStatus,
  PlantillaSlot,
  PlantillaSlotStatus,
} from '../types/recruitment.types';

/**
 * Plantilla slots — the vacancies inside a job post.
 *
 * One Job Post used to mean one plantilla item number, so filling four
 * identical vacancies meant four postings. Since migration 20260922 the
 * vacancy lives in its own row (`plantilla_slots`) and an application is
 * linked to one or more of them through `application_plantilla_slots`.
 *
 * Everything here degrades quietly when the migration has not been applied
 * yet: reads return empty, writes report `{ ok: false, error }`. The Job Posts
 * page keeps working off `job_postings.item_number` in that state rather than
 * blanking out.
 */

// Flat result shape, matching the rest of src/lib/api (strict:false means a
// discriminated union would not narrow here).
export type SlotResult<T = void> = { ok: boolean; error?: string; data?: T };

const client = supabase as any;

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205', 'PGRST202']);

/** True when the failure is "migration 20260922 has not been applied yet". */
export const isMissingSlotSchema = (error: any): boolean => {
  if (!error) return false;
  const code = String(error?.code ?? '');
  if (MISSING_TABLE_CODES.has(code)) return true;
  const message = String(error?.message ?? '').toLowerCase();
  return (
    message.includes('plantilla_slots') &&
    (message.includes('does not exist') || message.includes('could not find'))
  );
};

export const normalizeItemNumber = (value: string | null | undefined): string =>
  String(value ?? '').trim().toLowerCase();

const toSlot = (row: any): PlantillaSlot => ({
  id: String(row?.id ?? ''),
  jobPostingId: String(row?.job_posting_id ?? ''),
  slotNumber: Number(row?.slot_number ?? 1) || 1,
  itemNumber: String(row?.item_number ?? '').trim(),
  salaryGrade: row?.salary_grade == null ? undefined : Number(row.salary_grade),
  monthlySalary: row?.monthly_salary == null ? undefined : Number(row.monthly_salary),
  status: (String(row?.status ?? 'open') as PlantillaSlotStatus),
  filledByApplicantId: row?.filled_by_applicant_id ? String(row.filled_by_applicant_id) : undefined,
  filledAt: row?.filled_at ? String(row.filled_at) : undefined,
});

// ─── Reads ──────────────────────────────────────────────────────────────────

/** Every slot in the system, grouped by job posting id. */
export const fetchSlotsByJobPosting = async (): Promise<Map<string, PlantillaSlot[]>> => {
  const grouped = new Map<string, PlantillaSlot[]>();
  try {
    const { data, error } = await client
      .from('plantilla_slots')
      .select('*')
      .order('slot_number', { ascending: true });

    if (error) {
      if (!isMissingSlotSchema(error)) {
        console.warn('[plantillaSlots] slot fetch failed:', error);
      }
      return grouped;
    }

    (data ?? []).forEach((row: any) => {
      const slot = toSlot(row);
      if (!slot.jobPostingId) return;
      const bucket = grouped.get(slot.jobPostingId);
      if (bucket) bucket.push(slot);
      else grouped.set(slot.jobPostingId, [slot]);
    });
  } catch (err) {
    console.warn('[plantillaSlots] slot fetch threw:', err);
  }
  return grouped;
};

export const fetchSlotsForJob = async (jobPostingId: string): Promise<PlantillaSlot[]> => {
  if (!jobPostingId) return [];
  try {
    const { data, error } = await client
      .from('plantilla_slots')
      .select('*')
      .eq('job_posting_id', jobPostingId)
      .order('slot_number', { ascending: true });
    if (error) {
      if (!isMissingSlotSchema(error)) console.warn('[plantillaSlots] fetchSlotsForJob failed:', error);
      return [];
    }
    return (data ?? []).map(toSlot);
  } catch (err) {
    console.warn('[plantillaSlots] fetchSlotsForJob threw:', err);
    return [];
  }
};

export type ApplicantSlotLink = {
  applicantId: string;
  slotId: string;
  status: ApplicationSlotStatus;
};

/** Every application -> slot link, keyed by applicant id. */
export const fetchApplicantSlotLinks = async (
  applicantIds?: string[],
): Promise<Map<string, ApplicantSlotLink[]>> => {
  const grouped = new Map<string, ApplicantSlotLink[]>();
  try {
    let query = client.from('application_plantilla_slots').select('applicant_id, plantilla_slot_id, status');
    if (applicantIds && applicantIds.length > 0) {
      query = query.in('applicant_id', applicantIds);
    }
    const { data, error } = await query;
    if (error) {
      if (!isMissingSlotSchema(error)) console.warn('[plantillaSlots] link fetch failed:', error);
      return grouped;
    }
    (data ?? []).forEach((row: any) => {
      const applicantId = String(row?.applicant_id ?? '');
      if (!applicantId) return;
      const link: ApplicantSlotLink = {
        applicantId,
        slotId: String(row?.plantilla_slot_id ?? ''),
        status: (String(row?.status ?? 'applied') as ApplicationSlotStatus),
      };
      const bucket = grouped.get(applicantId);
      if (bucket) bucket.push(link);
      else grouped.set(applicantId, [link]);
    });
  } catch (err) {
    console.warn('[plantillaSlots] link fetch threw:', err);
  }
  return grouped;
};

// ─── Uniqueness ─────────────────────────────────────────────────────────────

/**
 * Item numbers are unique system-wide, not per posting — two different posts
 * cannot both advertise ABYAN-2026-451. `excludeSlotIds` lets the edit modal
 * ignore the rows it is itself saving.
 */
export const findTakenItemNumbers = async (
  itemNumbers: string[],
  excludeSlotIds: string[] = [],
): Promise<Set<string>> => {
  const taken = new Set<string>();
  const candidates = itemNumbers.map((value) => value.trim()).filter(Boolean);
  if (candidates.length === 0) return taken;

  try {
    const { data, error } = await client
      .from('plantilla_slots')
      .select('id, item_number');
    if (error) {
      // Cannot verify -> do not block the save. The unique index is the real
      // guarantee; this check only exists to fail early with a clear message.
      if (!isMissingSlotSchema(error)) console.warn('[plantillaSlots] uniqueness check failed:', error);
      return taken;
    }

    const excluded = new Set(excludeSlotIds.filter(Boolean));
    const used = new Map<string, string>();
    (data ?? []).forEach((row: any) => {
      const id = String(row?.id ?? '');
      if (excluded.has(id)) return;
      used.set(normalizeItemNumber(row?.item_number), id);
    });

    candidates.forEach((candidate) => {
      if (used.has(normalizeItemNumber(candidate))) taken.add(candidate);
    });
  } catch (err) {
    console.warn('[plantillaSlots] uniqueness check threw:', err);
  }
  return taken;
};

// ─── Writes ─────────────────────────────────────────────────────────────────

export type SlotDraft = {
  /** Present when editing an existing row; absent for a newly added slot. */
  id?: string;
  itemNumber: string;
  salaryGrade?: number;
  monthlySalary?: number;
  status?: PlantillaSlotStatus;
};

/**
 * Replace a posting's slot list with `drafts`, in order.
 *
 * Ordinals are assigned from the array index, which is what makes "delete
 * Plantilla 2 and 3/4 shift up" work: the item numbers stay attached to their
 * own rows, only the label moves. Rows the admin removed are deleted last, so
 * the BEFORE DELETE trigger sees the new rows and only flags applicants who
 * genuinely have nothing left on the posting.
 */
export const saveSlotsForJob = async (
  jobPostingId: string,
  drafts: SlotDraft[],
): Promise<SlotResult<PlantillaSlot[]>> => {
  if (!jobPostingId) return { ok: false, error: 'Missing job posting id.' };
  const cleaned = drafts
    .map((draft) => ({ ...draft, itemNumber: String(draft.itemNumber ?? '').trim() }))
    .filter((draft) => draft.itemNumber.length > 0);

  if (cleaned.length === 0) {
    return { ok: false, error: 'A job post needs at least one plantilla slot.' };
  }

  const existing = await fetchSlotsForJob(jobPostingId);
  const keptIds = new Set(cleaned.map((draft) => draft.id).filter(Boolean) as string[]);
  const removedIds = existing.filter((slot) => !keptIds.has(slot.id)).map((slot) => slot.id);

  // Every row carries an id, including brand-new ones. PostgREST rejects a
  // bulk payload whose objects do not all have the same keys (PGRST102), so
  // "id on some rows only" is not an option.
  const withIds = cleaned.map((draft) => ({ ...draft, id: draft.id ?? crypto.randomUUID() }));

  // Two passes. Ordinals are unique per posting, so writing the final numbers
  // straight onto rows that are being reshuffled would collide with the rows
  // still holding those numbers. Park the existing ones above the range first.
  const parkOffset = existing.length + cleaned.length + 100;

  try {
    const reshuffled = withIds.filter((draft) => keptIds.has(draft.id));
    if (reshuffled.length > 0) {
      const parkRows = reshuffled.map((draft, index) => ({
        id: draft.id,
        slot_number: parkOffset + index,
      }));
      // Plain UPDATEs, not an upsert: these rows already exist, and an upsert
      // payload this narrow would reset every column it omits on any row that
      // turned out to be missing.
      for (const parkRow of parkRows) {
        const { error: parkError } = await client
          .from('plantilla_slots')
          .update({ slot_number: parkRow.slot_number })
          .eq('id', parkRow.id);
        if (parkError) throw parkError;
      }
    }

    const rows = withIds.map((draft, index) => ({
      id: draft.id,
      job_posting_id: jobPostingId,
      slot_number: index + 1,
      item_number: draft.itemNumber,
      salary_grade: draft.salaryGrade ?? null,
      monthly_salary: draft.monthlySalary ?? null,
      status: draft.status ?? 'open',
    }));

    const { error: upsertError } = await client
      .from('plantilla_slots')
      .upsert(rows, { onConflict: 'id' });
    if (upsertError) throw upsertError;

    if (removedIds.length > 0) {
      const { error: deleteError } = await client
        .from('plantilla_slots')
        .delete()
        .in('id', removedIds);
      if (deleteError) throw deleteError;
    }

    const saved = await fetchSlotsForJob(jobPostingId);
    return { ok: true, data: saved };
  } catch (err: any) {
    if (isMissingSlotSchema(err)) {
      return {
        ok: false,
        error:
          'Plantilla slots are not available yet — migration 20260922_plantilla_slots.sql has not been applied to this database.',
      };
    }
    const code = String(err?.code ?? '');
    const message = String(err?.message ?? err ?? '');
    if (code === '23505' || message.toLowerCase().includes('duplicate key')) {
      return { ok: false, error: 'One of those plantilla item numbers is already used by another job post.' };
    }
    console.error('[plantillaSlots] saveSlotsForJob failed:', err);
    return { ok: false, error: message || 'Could not save the plantilla slots.' };
  }
};

/** Link one application to the slots the applicant ticked. */
export const linkApplicationToSlots = async (
  applicantId: string,
  slotIds: string[],
): Promise<SlotResult> => {
  const ids = Array.from(new Set(slotIds.filter(Boolean)));
  if (!applicantId || ids.length === 0) return { ok: true };

  try {
    const { error } = await client
      .from('application_plantilla_slots')
      .upsert(
        ids.map((slotId) => ({
          applicant_id: applicantId,
          plantilla_slot_id: slotId,
          status: 'applied',
        })),
        { onConflict: 'applicant_id,plantilla_slot_id' },
      );
    if (error) throw error;
    return { ok: true };
  } catch (err: any) {
    if (isMissingSlotSchema(err)) return { ok: true };
    console.error('[plantillaSlots] linkApplicationToSlots failed:', err);
    return { ok: false, error: String(err?.message ?? err) };
  }
};

/**
 * Place a hire into a specific slot. The DB trigger stamps `filled_at`, marks
 * this applicant 'hired' on that slot and everyone else 'not_selected' — other
 * slots on the same posting stay open and keep taking applications.
 */
export const assignApplicantToSlot = async (
  slotId: string,
  applicantId: string,
): Promise<SlotResult> => {
  if (!slotId || !applicantId) return { ok: false, error: 'Missing slot or applicant.' };
  try {
    const { data: current, error: readError } = await client
      .from('plantilla_slots')
      .select('id, status, filled_by_applicant_id')
      .eq('id', slotId)
      .single();
    if (readError) throw readError;

    if (current?.status === 'filled' && String(current?.filled_by_applicant_id ?? '') !== applicantId) {
      return { ok: false, error: 'That plantilla slot has already been filled by another applicant.' };
    }

    const { error } = await client
      .from('plantilla_slots')
      .update({ status: 'filled', filled_by_applicant_id: applicantId })
      .eq('id', slotId);
    if (error) throw error;

    await client
      .from('applicants')
      .update({ needs_slot_reassignment: false })
      .eq('id', applicantId);

    return { ok: true };
  } catch (err: any) {
    if (isMissingSlotSchema(err)) {
      return { ok: false, error: 'Plantilla slots are not available yet — apply migration 20260922.' };
    }
    console.error('[plantillaSlots] assignApplicantToSlot failed:', err);
    return { ok: false, error: String(err?.message ?? err) };
  }
};

export const setSlotStatus = async (
  slotId: string,
  status: PlantillaSlotStatus,
): Promise<SlotResult> => {
  try {
    const { error } = await client.from('plantilla_slots').update({ status }).eq('id', slotId);
    if (error) throw error;
    return { ok: true };
  } catch (err: any) {
    if (isMissingSlotSchema(err)) return { ok: true };
    return { ok: false, error: String(err?.message ?? err) };
  }
};

// ─── Derived display helpers ────────────────────────────────────────────────

export type SlotSummary = {
  total: number;
  open: number;
  filled: number;
  closed: number;
  /** Aggregate label for the Job Posts list: "2/4 Open", "Fully Filled", … */
  label: string;
  tone: 'open' | 'filled' | 'closed' | 'none';
};

/**
 * Aggregate status for a posting. A post reads as Closed only when no slot is
 * still taking applications; "Fully Filled" is the stronger statement that
 * every slot found its hire.
 */
export const summarizeSlots = (slots: PlantillaSlot[] | undefined): SlotSummary => {
  const list = slots ?? [];
  const total = list.length;
  const open = list.filter((slot) => slot.status === 'open').length;
  const filled = list.filter((slot) => slot.status === 'filled').length;
  const closed = list.filter((slot) => slot.status === 'closed').length;

  if (total === 0) return { total, open, filled, closed, label: 'No slots', tone: 'none' };
  if (filled === total) return { total, open, filled, closed, label: 'Fully Filled', tone: 'filled' };
  if (open === 0) return { total, open, filled, closed, label: 'Closed', tone: 'closed' };
  return { total, open, filled, closed, label: `${open}/${total} Open`, tone: 'open' };
};
