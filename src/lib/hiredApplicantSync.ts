import { supabase } from './supabase';

const SYNC_FLAG_KEY = 'cictrix_hired_applicant_sync_done';
const EMPLOYEE_SYNC_FLAG_KEY = 'cictrix_newly_hired_employee_sync_done';

type PersistedApplicationType = 'job' | 'promotion';

interface ApplicantClassification {
  externalIds: string[];
  promotionCount: number;
  unresolvedCount: number;
}

const normalizePersistedApplicationType = (value: unknown): PersistedApplicationType | null => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'job') return 'job';
  if (normalized === 'promotion') return 'promotion';
  return null;
};

/**
 * Legacy rows are only actionable when the persisted application resolves to
 * exactly one external job. Promotions, missing rows, duplicate rows and
 * unknown types stay out of the old backfills instead of receiving an
 * identity from the newly_hired snapshot.
 */
const classifyApplicantLinks = (
  requestedIds: string[],
  applicantRows: any[],
): ApplicantClassification => {
  const rowsById = new Map<string, any>();
  const duplicateRowIds = new Set<string>();
  for (const row of applicantRows) {
    const id = String(row?.id ?? '').trim();
    if (!id) continue;
    if (rowsById.has(id)) {
      duplicateRowIds.add(id);
      continue;
    }
    rowsById.set(id, row);
  }

  const requestedCounts = new Map<string, number>();
  for (const rawId of requestedIds) {
    const id = String(rawId ?? '').trim();
    if (!id) continue;
    requestedCounts.set(id, (requestedCounts.get(id) ?? 0) + 1);
  }

  const externalIds: string[] = [];
  let promotionCount = 0;
  let unresolvedCount = 0;

  for (const [id, count] of requestedCounts) {
    if (count > 1 || duplicateRowIds.has(id) || !rowsById.has(id)) {
      unresolvedCount++;
      continue;
    }

    const applicationType = normalizePersistedApplicationType(
      rowsById.get(id)?.application_type,
    );
    if (applicationType === 'promotion') {
      promotionCount++;
    } else if (applicationType === 'job') {
      externalIds.push(id);
    } else {
      unresolvedCount++;
    }
  }

  return { externalIds, promotionCount, unresolvedCount };
};

const reportApplicantClassification = (
  scope: string,
  classification: ApplicantClassification,
): void => {
  if (classification.promotionCount > 0) {
    console.info(
      `[hiredApplicantSync] ${scope}: skipped ${classification.promotionCount} promotional application(s).`,
    );
  }
  if (classification.unresolvedCount > 0) {
    console.warn(
      `[hiredApplicantSync] ${scope}: skipped ${classification.unresolvedCount} unresolved or ambiguous application link(s).`,
    );
  }
};

/**
 * Backfill: ensure every applicant with a row in `newly_hired` has
 * `applicants.status = 'Hired'`. Older hires (before the FastAPI status-flip
 * fallback at commit a7e3ad9) only wrote to newly_hired, leaving the
 * applicant's status stuck on 'New Application' — which made the
 * Application Status Tracker show only stage 1 done for already-hired
 * candidates. Promotion applications are excluded: their stored status is
 * owned by the appointment workflow, not this external-hire backfill.
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

    // Keep the source multiplicity so the classifier can reject duplicate
    // newly_hired links; only the database query needs a unique ID list.
    const sourceApplicantIds = ((hiredRows ?? []) as Array<{ applicant_id?: string | null }>)
      .map((r) => String(r?.applicant_id ?? '').trim())
      .filter(Boolean);
    const uniqueApplicantIds = Array.from(new Set(sourceApplicantIds));

    if (uniqueApplicantIds.length === 0) {
      try { sessionStorage.setItem(SYNC_FLAG_KEY, '1'); } catch { /* ignore */ }
      return;
    }

    // Classify from the persisted application before touching statuses: a
    // newly_hired row can belong to a promotion, which must never be flipped
    // to a hire status by this legacy external-hire backfill.
    const { data: applicantRows, error: classificationErr } = await (supabase as any)
      .from('applicants')
      .select('id, application_type')
      .in('id', uniqueApplicantIds);

    if (classificationErr) {
      console.warn('[hiredApplicantSync] applicant classification fetch failed:', classificationErr);
      return;
    }

    const classification = classifyApplicantLinks(
      sourceApplicantIds,
      (applicantRows ?? []) as any[],
    );
    reportApplicantClassification('status backfill', classification);

    if (classification.externalIds.length === 0) {
      try { sessionStorage.setItem(SYNC_FLAG_KEY, '1'); } catch { /* ignore */ }
      return;
    }

    // Only flip rows whose status isn't already 'Hired' to avoid pointless
    // writes (and to surface the actual change count in the response).
    const { data: updated, error: updateErr } = await (supabase as any)
      .from('applicants')
      .update({ status: 'Hired' })
      .in('id', classification.externalIds)
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
      try { sessionStorage.setItem(EMPLOYEE_SYNC_FLAG_KEY, '1'); } catch { /* Storage unavailable (private mode or quota); this flag is only an optimization. */ }
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

    // Multiple credential-bearing newly_hired rows for one applicant are an
    // ambiguous identity link. Skip them all rather than choosing a row.
    const linkedHireCounts = new Map<string, number>();
    for (const h of hires) {
      const applicantId = String(h.applicant_id ?? '').trim();
      const employeeId = String(h.employee_id ?? '').trim();
      if (!applicantId || !employeeId) continue;
      linkedHireCounts.set(applicantId, (linkedHireCounts.get(applicantId) ?? 0) + 1);
    }
    const duplicateApplicantIds = new Set(
      Array.from(linkedHireCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([applicantId]) => applicantId),
    );
    if (duplicateApplicantIds.size > 0) {
      console.warn(
        `[hiredApplicantSync] employee backfill: skipped ${duplicateApplicantIds.size} applicant(s) with duplicate newly_hired links.`,
      );
    }

    // A credential-bearing employee number claimed by more than one applicant
    // UUID is a conflicting identity link. Skip every claimant rather than
    // choosing a winner, even when the number is not in employees yet.
    const employeeNumberClaimants = new Map<string, Set<string>>();
    for (const h of hires) {
      const applicantId = String(h.applicant_id ?? '').trim();
      const employeeId = String(h.employee_id ?? '').trim();
      if (!applicantId || !employeeId) continue;
      const claimants = employeeNumberClaimants.get(employeeId) ?? new Set<string>();
      claimants.add(applicantId);
      employeeNumberClaimants.set(employeeId, claimants);
    }
    const conflictingApplicantIds = new Set<string>();
    for (const claimants of employeeNumberClaimants.values()) {
      if (claimants.size < 2) continue;
      for (const applicantId of claimants) conflictingApplicantIds.add(applicantId);
    }
    if (conflictingApplicantIds.size > 0) {
      console.warn(
        `[hiredApplicantSync] employee backfill: skipped ${conflictingApplicantIds.size} applicant(s) with conflicting employee_number links.`,
      );
    }

    // Filter to hires that are missing in BOTH UUID and employee number
    const missingHires = hires.filter((h) => {
      const applicantId = String(h.applicant_id ?? '').trim();
      const employeeId = String(h.employee_id ?? '').trim();
      return applicantId
        && employeeId
        && !duplicateApplicantIds.has(applicantId)
        && !conflictingApplicantIds.has(applicantId)
        && !existingIdSet.has(applicantId)
        && !existingNumSet.has(employeeId);
    });

    if (missingHires.length === 0) {
      try { sessionStorage.setItem(EMPLOYEE_SYNC_FLAG_KEY, '1'); } catch { /* Storage unavailable (private mode or quota); this flag is only an optimization. */ }
      return;
    }

    // newly_hired rows can be sparse (no middle_name; sometimes blank position/
    // department when the hire was recorded from a stale UI row). The source
    // applicant record is authoritative — look it up so the employees insert
    // keeps the full split name and the actual applied position/office instead
    // of falling back to 'Staff'/'Operations'. Its persisted application_type
    // is the gate: only unique external jobs may be inserted here.
    const applicantById = new Map<string, any>();
    let eligibleHires = missingHires;
    {
      const missingIds = missingHires
        .map((h) => String(h.applicant_id ?? '').trim())
        .filter(Boolean);
      const { data: applicantRows, error: appErr } = await (supabase as any)
        .from('applicants')
        .select('id, first_name, middle_name, last_name, position, office, contact_number, application_type')
        .in('id', missingIds);
      if (appErr) {
        console.warn('[hiredApplicantSync] applicants lookup/classification failed:', appErr);
        return;
      }

      const classification = classifyApplicantLinks(
        missingIds,
        (applicantRows ?? []) as any[],
      );
      reportApplicantClassification('employee backfill', classification);
      const externalIdSet = new Set(classification.externalIds);
      eligibleHires = missingHires.filter((h) => (
        externalIdSet.has(String(h.applicant_id ?? '').trim())
      ));

      if (eligibleHires.length === 0) {
        try { sessionStorage.setItem(EMPLOYEE_SYNC_FLAG_KEY, '1'); } catch { /* Storage unavailable (private mode or quota); this flag is only an optimization. */ }
        return;
      }

      for (const a of (applicantRows ?? []) as any[]) {
        applicantById.set(String(a.id), a);
      }
    }

    // 3. Construct and insert the missing employees
    const toInsert = [];
    for (const h of eligibleHires) {
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

    try { sessionStorage.setItem(EMPLOYEE_SYNC_FLAG_KEY, '1'); } catch { /* Storage unavailable (private mode or quota); this flag is only an optimization. */ }
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
 * Only rows positively linked to a hired external job applicant (employees.id
 * equals the applicant id — how the backfill keys its inserts) with the
 * literal 'Staff' default are touched; promotions, ambiguous links and
 * manually created employee records are left alone.
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
      try { sessionStorage.setItem(EMPLOYEE_REPAIR_FLAG_KEY, '1'); } catch { /* Storage unavailable (private mode or quota); this flag is only an optimization. */ }
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

    const employeeIds = rows.map((r) => String(r.id));
    const classification = classifyApplicantLinks(
      employeeIds,
      (applicants ?? []) as any[],
    );
    reportApplicantClassification('employee defaults repair', classification);

    const applicantById = new Map(((applicants ?? []) as any[]).map((a) => [String(a.id), a]));
    const externalIdSet = new Set(classification.externalIds);
    let repaired = 0;

    for (const emp of rows) {
      const employeeId = String(emp.id);
      // Promotions legitimately change position — don't rewind those. Missing,
      // duplicate and unknown-type links are left alone for the same reason.
      if (!externalIdSet.has(employeeId)) continue;
      const applicant = applicantById.get(employeeId);
      if (!applicant) continue;

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

    try { sessionStorage.setItem(EMPLOYEE_REPAIR_FLAG_KEY, '1'); } catch { /* Storage unavailable (private mode or quota); this flag is only an optimization. */ }
  } catch (err) {
    console.warn('[hiredApplicantSync] unexpected repair error:', err);
  }
};
