import { supabase } from './supabase';

const SYNC_FLAG_KEY = 'cictrix_hired_applicant_sync_done';
const EMPLOYEE_SYNC_FLAG_KEY = 'cictrix_newly_hired_employee_sync_done';

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

/**
 * Backfill: ensure every newly hired applicant with generated credentials
 * in `newly_hired` has a corresponding active record in the central
 * `employees` database table. This makes them show up in PM (IPCR Management)
 * and other operational modules automatically.
 *
 * Runs once per tab session.
 */
export const syncNewlyHiredToEmployees = async (): Promise<void> => {
  try {
    if (sessionStorage.getItem(EMPLOYEE_SYNC_FLAG_KEY) === '1') return;
  } catch {
    // sessionStorage unavailable — proceed without gating.
  }

  try {
    // 1. Fetch newly_hired employees that have credentials (employee_id is present)
    const { data: newlyHired, error: nhErr } = await (supabase as any)
      .from('newly_hired')
      .select('*')
      .not('employee_id', 'is', null);

    if (nhErr) {
      console.warn('[hiredApplicantSync] newly_hired fetch for employees sync failed:', nhErr);
      return;
    }

    const hires = (newlyHired ?? []) as any[];
    if (hires.length === 0) {
      try { sessionStorage.setItem(EMPLOYEE_SYNC_FLAG_KEY, '1'); } catch {}
      return;
    }

    // 2. Fetch existing employees to find who is missing
    const { data: existingEmployees, error: empErr } = await (supabase as any)
      .from('employees')
      .select('id, employee_number');

    if (empErr) {
      console.warn('[hiredApplicantSync] employees fetch failed:', empErr);
      return;
    }

    const existingIdSet = new Set((existingEmployees ?? []).map((e: any) => String(e.id)));
    const existingNumSet = new Set((existingEmployees ?? []).map((e: any) => String(e.employee_number)));

    // Filter to hires that are missing in BOTH UUID and employee number
    const missingHires = hires.filter((h) => {
      const applicantId = String(h.applicant_id ?? '').trim();
      const employeeId = String(h.employee_id ?? '').trim();
      return applicantId && employeeId && !existingIdSet.has(applicantId) && !existingNumSet.has(employeeId);
    });

    if (missingHires.length === 0) {
      try { sessionStorage.setItem(EMPLOYEE_SYNC_FLAG_KEY, '1'); } catch {}
      return;
    }

    // 3. Construct and insert the missing employees
    const toInsert = [];
    for (const h of missingHires) {
      const firstName = String(h.first_name ?? '').trim();
      const lastName = String(h.last_name ?? '').trim();
      const rawDeptName = String(h.department ?? '').trim();

      if (!firstName || !lastName) continue;

      // Construct a valid email if not present
      let email = String(h.email ?? '').trim();
      if (!email) {
        const first = firstName.toLowerCase().replace(/\s+/g, '');
        const last = lastName.toLowerCase().replace(/\s+/g, '');
        email = `${first}.${last}.${h.employee_id.toLowerCase()}@employee.local`;
      }

      toInsert.push({
        id: h.applicant_id,
        employee_number: h.employee_id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: h.phone ? String(h.phone).trim() : null,
        department: rawDeptName || 'Operations',
        position: h.position ? String(h.position).trim() : 'Staff',
        employment_status: h.employment_type === 'Permanent' ? 'Regular' : 'Probationary',
        date_hired: h.date_hired ? h.date_hired.split('T')[0] : new Date().toISOString().split('T')[0],
        status: 'Active',
        created_by: '00000000-0000-0000-0000-000000000000'
      });
    }

    if (toInsert.length > 0) {
      const { data: inserted, error: insertErr } = await (supabase as any)
        .from('employees')
        .insert(toInsert)
        .select('employee_number');

      if (insertErr) {
        console.warn('[hiredApplicantSync] failed to insert missing employees:', insertErr);
      } else {
        const count = Array.isArray(inserted) ? inserted.length : 0;
        console.info(`[hiredApplicantSync] Successfully backfilled ${count} missing employee(s) to central database.`);
      }
    }

    try { sessionStorage.setItem(EMPLOYEE_SYNC_FLAG_KEY, '1'); } catch {}
  } catch (err) {
    console.warn('[hiredApplicantSync] unexpected newly hired sync error:', err);
  }
};
