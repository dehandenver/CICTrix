/**
 * Backfill IPCR draft records for existing employees.
 *
 * WHY: /admin/pm IPCR Management shows "No IPCR records found" for employees who
 * have no `ipcr_performance` rows for their *current* rating period. The panel
 * (getEmployeeIPCR) matches `ipcr_performance` by (employee_num + rating_period),
 * where rating_period is derived from date_hired by the same logic replicated in
 * computeRatingPeriod() below (kept in sync with PMIPCRManagement.computeStageInfo).
 *
 * WHAT: For every employee with a date_hired, ensure a draft IPCR sheet exists for
 * their current computed rating period — a small skeleton of empty CORE/SUPPORT
 * rows for the employee/supervisor to fill via the UI (no fabricated targets).
 * Department is intentionally NOT stored here: ipcr_performance has no department
 * column; the panel hydrates it from employees_with_department. This sidesteps the
 * (still-paused) department→Job Post FK work.
 *
 * SAFE: idempotent (skips any employee that already has rows for the period),
 * additive, and reversible (backfilled rows carry ipcr_id prefix 'IPCR-BF-').
 * Dry-run by default; pass --apply to write.
 *
 * Employees with no date_hired are skipped and reported (can't compute a period).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-ipcr-current-period.mjs [--apply]
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const APPLY = process.argv.includes('--apply');

if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}
const supabase = createClient(URL, KEY);

// Draft skeleton size per employee (empty rows for the UI to fill).
const CORE_SLOTS = 3;
const SUPPORT_SLOTS = 2;

/**
 * Mirror of PMIPCRManagement.computeStageInfo (period-label portion). Uses the
 * real "now" like the UI does. Must stay in sync with that component.
 */
function computeRatingPeriod(hireDateStr, now = new Date()) {
  const hired = new Date(hireDateStr);
  const months = Math.max(
    0,
    (now.getFullYear() - hired.getFullYear()) * 12 + (now.getMonth() - hired.getMonth()),
  );
  if (months < 6) {
    if (months < 3) return { period: 'Probationary — 1st 3 Months', phase: 'target' };
    return { period: 'Probationary — 2nd 3 Months', phase: 'rating' };
  }
  const regularStart = new Date(hired);
  regularStart.setMonth(regularStart.getMonth() + 6);
  const msSinceRegular = Math.max(
    0,
    (now.getFullYear() - regularStart.getFullYear()) * 12 + (now.getMonth() - regularStart.getMonth()),
  );
  const completedCycles = Math.floor(msSinceRegular / 12);
  const posInCycle = msSinceRegular % 12;
  const cycleStart = new Date(regularStart);
  cycleStart.setMonth(cycleStart.getMonth() + completedCycles * 12);
  const yr = cycleStart.getFullYear();
  const halfLabel = cycleStart.getMonth() < 6 ? '1st Half' : '2nd Half';
  return { period: `${halfLabel} ${yr}`, phase: posInCycle < 6 ? 'target' : 'rating' };
}

const slug = (s) => String(s).replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '');

function buildRows(emp, period) {
  const ipcrId = `IPCR-BF-${emp.employee_number}-${slug(period)}`;
  const rows = [];
  let n = 0;
  const push = (fnType) => {
    n += 1;
    rows.push({
      ipcr_id: ipcrId,
      ipcr_row_id: `ROW-${String(n).padStart(4, '0')}`,
      employee_num: emp.employee_number,
      position_id: emp.position_id ?? null,
      position: emp.position ?? null,
      plantilla_num: emp.plantilla_num ?? null,
      rating_period: period,
      function_type: fnType,
      target_text: '',
      accomplishment_text: '',
      q_rating: null,
      e_rating: null,
      t_rating: null,
      ave_rating: null,
      competency_id: null,
      mapped_competency_standard: null,
    });
  };
  for (let i = 0; i < CORE_SLOTS; i += 1) push('CORE');
  for (let i = 0; i < SUPPORT_SLOTS; i += 1) push('SUPPORT');
  return rows;
}

async function run() {
  const { data: employees, error } = await supabase
    .from('employees')
    .select('id, employee_number, first_name, last_name, position, position_id, plantilla_num, date_hired')
    .order('date_hired');
  if (error) throw error;

  const created = [];
  const skippedExisting = [];
  const skippedMissing = [];
  let rowsToInsert = [];

  for (const emp of employees) {
    const name = `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim();
    if (!emp.employee_number || !emp.date_hired) {
      skippedMissing.push({ name, reason: !emp.date_hired ? 'no date_hired' : 'no employee_number' });
      continue;
    }
    const { period, phase } = computeRatingPeriod(emp.date_hired);
    const { count } = await supabase
      .from('ipcr_performance')
      .select('*', { count: 'exact', head: true })
      .eq('employee_num', emp.employee_number)
      .eq('rating_period', period);
    if ((count ?? 0) > 0) {
      skippedExisting.push({ name, period, existing: count });
      continue;
    }
    const rows = buildRows(emp, period);
    rowsToInsert = rowsToInsert.concat(rows);
    created.push({ name, num: emp.employee_number, period, phase, rows: rows.length });
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`\n=== IPCR backfill ${APPLY ? '(APPLY)' : '(DRY RUN)'} ===`);
  console.log(`Employees processed:        ${employees.length}`);
  console.log(`Will create records for:    ${created.length} employees (${rowsToInsert.length} rows)`);
  console.log(`Skipped (already have data): ${skippedExisting.length}`);
  console.log(`Skipped (missing data):     ${skippedMissing.length}`);
  console.log('\n-- To create --');
  created.forEach((c) => console.log(`  + ${c.name.padEnd(24)} ${c.num.padEnd(13)} ${c.period} [${c.phase}] (${c.rows} rows)`));
  if (skippedExisting.length) {
    console.log('\n-- Skipped: already have rows for the period --');
    skippedExisting.forEach((c) => console.log(`  = ${c.name.padEnd(24)} ${c.period} (${c.existing} rows)`));
  }
  if (skippedMissing.length) {
    console.log('\n-- Skipped: missing data (need attention) --');
    skippedMissing.forEach((c) => console.log(`  ! ${c.name.padEnd(24)} ${c.reason}`));
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write these rows.');
    return;
  }
  if (rowsToInsert.length === 0) {
    console.log('\nNothing to insert.');
    return;
  }

  // Let the serial `id` auto-increment (omit it). Insert in one batch.
  const { error: insErr } = await supabase.from('ipcr_performance').insert(rowsToInsert);
  if (insErr) {
    console.error('\nInsert failed:', insErr.message);
    process.exit(1);
  }
  console.log(`\n✓ Inserted ${rowsToInsert.length} rows for ${created.length} employees.`);
}

run().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
