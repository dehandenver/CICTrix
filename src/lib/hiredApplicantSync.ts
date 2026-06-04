import { supabase } from './supabase';

const SYNC_FLAG_KEY = 'cictrix_hired_applicant_sync_done';

/**
 * Backfill: ensure every applicant with a row in `newly_hired` has
 * `applicants.status = 'Hired'`. Older hires (before the FastAPI status-flip
 * fallback at commit a7e3ad9) only wrote to newly_hired, leaving the
 * applicant's status stuck on 'New Application' — which made the
 * Application Status Tracker show only stage 1 done for already-hired
 * candidates.
 *
 * Runs once per tab session (sessionStorage flag). Safe to call on every
 * page load; the gate skips it on subsequent calls.
 */
export const syncHiredApplicantStatus = async (): Promise<void> => {
  try {
    if (sessionStorage.getItem(SYNC_FLAG_KEY) === '1') return;
  } catch {
    // sessionStorage unavailable — proceed without gating.
  }

  try {
    const { data: hiredRows, error: hiredErr } = await (supabase as any)
      .from('newly_hired')
      .select('applicant_id');

    if (hiredErr) {
      console.warn('[hiredApplicantSync] newly_hired fetch failed:', hiredErr);
      return;
    }

    const applicantIds = Array.from(
      new Set(
        ((hiredRows ?? []) as Array<{ applicant_id?: string | null }>)
          .map((r) => String(r?.applicant_id ?? '').trim())
          .filter(Boolean),
      ),
    );

    if (applicantIds.length === 0) {
      try { sessionStorage.setItem(SYNC_FLAG_KEY, '1'); } catch { /* ignore */ }
      return;
    }

    // Only flip rows whose status isn't already 'Hired' to avoid pointless
    // writes (and to surface the actual change count in the response).
    const { data: updated, error: updateErr } = await (supabase as any)
      .from('applicants')
      .update({ status: 'Hired' })
      .in('id', applicantIds)
      .neq('status', 'Hired')
      .select('id');

    if (updateErr) {
      console.warn('[hiredApplicantSync] status flip failed:', updateErr);
      return;
    }

    const fixedCount = Array.isArray(updated) ? updated.length : 0;
    if (fixedCount > 0) {
      console.info(`[hiredApplicantSync] synced ${fixedCount} stale applicant status row(s) to 'Hired'.`);
    }

    try { sessionStorage.setItem(SYNC_FLAG_KEY, '1'); } catch { /* ignore */ }
  } catch (err) {
    console.warn('[hiredApplicantSync] unexpected error:', err);
  }
};
