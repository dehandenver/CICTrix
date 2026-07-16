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

    // newly_hired rows can be sparse (no middle_name; sometimes blank position/
    // department when the hire was recorded from a stale UI row). The source
    // applicant record is authoritative — look it up so the employees insert
    // keeps the full split name and the actual applied position/office instead
    // of falling back to 'Staff'/'Operations'.
    const applicantById = new Map<string, any>();
    {
      const missingIds = missingHires
        .map((h) => String(h.applicant_id ?? '').trim())
        .filter(Boolean);
      const { data: applicantRows, error: appErr } = await (supabase as any)
        .from('applicants')
        .select('id, first_name, middle_name, last_name, position, office, contact_number')
        .in('id', missingIds);
      if (appErr) {
        console.warn('[hiredApplicantSync] applicants lookup failed:', appErr);
      } else {
        for (const a of (applicantRows ?? []) as any[]) {
          applicantById.set(String(a.id), a);
        }
      }
    }

    // 3. Construct and insert the missing employees
    const toInsert = [];
    for (const h of missingHires) {
      const applicant = applicantById.get(String(h.applicant_id ?? '').trim());
      // Applicant names win: newly_hired names come from naive full-name
      // splitting in the hire UI and can misplace middle names.
      const firstName = String(applicant?.first_name ?? '').trim() || String(h.first_name ?? '').trim();
      const lastName = String(applicant?.last_name ?? '').trim() || String(h.last_name ?? '').trim();
      const middleName = String(applicant?.middle_name ?? '').trim() || null;
      const rawDeptName = String(h.department ?? '').trim() || String(applicant?.office ?? '').trim();
      const rawPosition = String(h.position ?? '').trim() || String(applicant?.position ?? '').trim();

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
        middle_name: middleName,
        last_name: lastName,
        email,
        phone: (h.phone ? String(h.phone).trim() : '') || String(applicant?.contact_number ?? '').trim() || null,
        department: rawDeptName || 'Operations',
        position: rawPosition || 'Staff',
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

const EMPLOYEE_REPAIR_FLAG_KEY = 'cictrix_employee_defaults_repair_done';

/**
 * Repair: earlier versions of syncNewlyHiredToEmployees defaulted missing
 * position/department to 'Staff'/'Operations' when the newly_hired row was
 * sparse, even though the source applicant record held the real applied
 * position and office (e.g. an applicant hired as "Computer Science
 * Specialist" under "Information Technology" surfaced in IPCR Management as
 * "Staff" under "Operations"). Restore those fields from the applicant.
 *
 * Only rows positively linked to a hired applicant (employees.id equals the
 * applicant id — how the backfill keys its inserts) with the literal 'Staff'
 * default are touched; manually created employee records are left alone.
 *
 * Runs once per tab session.
 */
export const repairDefaultedEmployeeRecords = async (): Promise<void> => {
  try {
    if (sessionStorage.getItem(EMPLOYEE_REPAIR_FLAG_KEY) === '1') return;
  } catch {
    // sessionStorage unavailable — proceed without gating.
  }

  try {
    const { data: defaulted, error: empErr } = await (supabase as any)
      .from('employees')
      .select('id, position, department, middle_name')
      .eq('position', 'Staff');

    if (empErr) {
      console.warn('[hiredApplicantSync] defaulted employees fetch failed:', empErr);
      return;
    }

    const rows = (defaulted ?? []) as any[];
    if (rows.length === 0) {
      try { sessionStorage.setItem(EMPLOYEE_REPAIR_FLAG_KEY, '1'); } catch {}
      return;
    }

    const { data: applicants, error: appErr } = await (supabase as any)
      .from('applicants')
      .select('id, position, office, middle_name, application_type')
      .in('id', rows.map((r) => String(r.id)))
      .eq('status', 'Hired');

    if (appErr) {
      console.warn('[hiredApplicantSync] repair applicants fetch failed:', appErr);
      return;
    }

    const applicantById = new Map(((applicants ?? []) as any[]).map((a) => [String(a.id), a]));
    let repaired = 0;

    for (const emp of rows) {
      const applicant = applicantById.get(String(emp.id));
      // Promotions legitimately change position — don't rewind those.
      if (!applicant || applicant.application_type === 'promotion') continue;

      const patch: Record<string, unknown> = {};
      const appPosition = String(applicant.position ?? '').trim();
      const appOffice = String(applicant.office ?? '').trim();
      const appMiddle = String(applicant.middle_name ?? '').trim();

      if (appPosition) patch.position = appPosition;
      if (appOffice && appOffice !== String(emp.department ?? '').trim()) patch.department = appOffice;
      if (appMiddle && !String(emp.middle_name ?? '').trim()) patch.middle_name = appMiddle;

      if (Object.keys(patch).length === 0) continue;

      const { error: updErr } = await (supabase as any)
        .from('employees')
        .update(patch)
        .eq('id', emp.id);

      if (updErr) {
        console.warn(`[hiredApplicantSync] repair update failed for employee ${emp.id}:`, updErr);
      } else {
        repaired++;
      }
    }

    if (repaired > 0) {
      console.info(`[hiredApplicantSync] repaired ${repaired} employee record(s) with defaulted position/department.`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cictrix:employee-accounts-updated'));
      }
    }

    try { sessionStorage.setItem(EMPLOYEE_REPAIR_FLAG_KEY, '1'); } catch {}
  } catch (err) {
    console.warn('[hiredApplicantSync] unexpected repair error:', err);
  }
};
