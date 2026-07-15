// ─────────────────────────────────────────────────────────────────────────────
// Seed: Maria Santos IPCR — Phase 1 (approved / frozen) → Phase 2 (not started)
//
// Synthetic data so the IPCR target-setting + workspace functions can be
// exercised end-to-end with a realistic, self-consistent record.
//
//   Employee account : Maria Santos  (login employee01 / hr2024) — already exists
//   Office Account   : Ramon Dela Cruz (approving authority) — created here
//
// Business rule from the source dataset: a user cannot approve their own IPCR,
// so the approver (reviewed_by) is Ramon, a DIFFERENT user from Maria.
//
// Idempotent: safe to re-run. Reads creds from the project .env (service role).
//
//   node scripts/seed-ipcr-maria.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const die = (msg, error) => { console.error(`\n❌ ${msg}`, error ?? ''); process.exit(1); };

// ── Fixed anchors discovered in the live DB ─────────────────────────────────
const HR_OFFICE_ID = 'f7128cc8-0c9d-4791-bd9f-0e801e702d50'; // departments: "Human Resources"
const HR_OFFICE_NAME = 'Human Resources';
const CYCLE_ID = 2;                                          // performance_cycles: "2026 Performance Cycle" (Active)
const PERIOD = 'January–June 2026';                          // en-dash form the Employee Portal uses

// ── Phase 1 targets (from the source dataset) ───────────────────────────────
const TARGETS = {
  core: [
    { title: 'Payroll Management', indicators: [
      'Process payroll for all department employees within 3 days of timesheet approval, with zero computation errors.',
      'Submit monthly payroll reports to Accounting Office on or before the 5th working day of the following month.',
    ] },
    { title: 'Employee 201 Files Management', indicators: [
      'Update and complete 201 files of all HR-supervised staff with zero missing documents by end of rating period.',
      'Process new employee onboarding documentation within 5 working days of hire date.',
    ] },
  ],
  strategic: [
    { title: 'Competency Development Program', indicators: [
      'Formulate and roll out a department-wide training program addressing at least 3 identified competency gaps.',
    ] },
  ],
  support: [
    { title: 'IT Helpdesk Coordination', indicators: [
      'Coordinate and log all IT support requests from department staff with initial response within 15 minutes.',
    ] },
  ],
};

// Denormalise one category into the legacy ipcr_workspace text column, matching
// flattenForWorkspace() in src/lib/api/ipcrTargets.ts (feeds the IPCR PDF).
const flatten = (mfos) =>
  mfos.map((m) => `${m.title}\n${m.indicators.map((d) => `  - ${d}`).join('\n')}`).join('\n\n');

async function main() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) die('Missing SUPABASE creds in .env');

  // 1) Maria Santos (employee) — must already exist.
  const { data: maria, error: mErr } = await db
    .from('employees')
    .select('id, employee_number, first_name, last_name')
    .eq('employee_number', 'EMP-2024-001')
    .maybeSingle();
  if (mErr) die('lookup Maria failed', mErr);
  if (!maria) die('Maria Santos (EMP-2024-001) not found — expected an existing employee row.');
  console.log(`✓ Maria Santos → employees.id ${maria.id}`);

  // 2) Ramon Dela Cruz (approving authority / Office Account) — create if absent.
  let ramon = (await db.from('employees').select('id').eq('employee_number', 'EMP-2024-000').maybeSingle()).data;
  if (!ramon) {
    const { data, error } = await db.from('employees').insert({
      employee_number: 'EMP-2024-000',
      first_name: 'Ramon',
      last_name: 'Dela Cruz',
      email: 'ramon.delacruz@ilongcity.gov.ph',
      department: HR_OFFICE_NAME,
      position: 'Assistant Department Head / Approving Authority',
      employment_status: 'Regular',
      sex: 'Male',
      date_hired: '2015-06-01',
      status: 'Active',
      created_by: maria.id, // NOT NULL — reuse a real uuid
    }).select('id').single();
    if (error) die('create Ramon failed', error);
    ramon = data;
    console.log(`✓ Ramon Dela Cruz created → employees.id ${ramon.id}`);
  } else {
    console.log(`↩ Ramon Dela Cruz already exists → employees.id ${ramon.id}`);
  }

  // 3) Portal login for Ramon (employee-side auth is username/password, not Supabase Auth).
  {
    const { error } = await db.from('employee_portal_accounts').upsert({
      id: 'employee-account-ramon-delacruz',
      username: 'ramon.delacruz',
      password: 'hr2024',
      employee_id: 'EMP-2024-000',
      full_name: 'Ramon Dela Cruz',
      email: 'ramon.delacruz@ilongcity.gov.ph',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) die('upsert Ramon portal account failed', error);
    console.log('✓ Portal login: ramon.delacruz / hr2024');
  }

  // 4) Office Account for Ramon (distinct approving authority). Supervisor role —
  //    NOT a 2nd DeptHead, which would break getOfficeDeptHead()'s single-row read.
  {
    const existing = await db.from('office_role_assignments')
      .select('id').eq('employee_id', ramon.id).eq('office_id', HR_OFFICE_ID).eq('status', 'Active').maybeSingle();
    if (!existing.data) {
      const { error } = await db.from('office_role_assignments').insert({
        employee_id: ramon.id,
        employee_name: 'Ramon Dela Cruz',
        office_id: HR_OFFICE_ID,
        office_name: HR_OFFICE_NAME,
        role: 'Supervisor',
        account_username: 'ramon_delacruz_office',
        account_password: 'office2024',
        must_change_password: false,
        status: 'Active',
        assigned_by: 'seed-ipcr-maria',
        assigned_at: new Date().toISOString(),
      });
      if (error) die('create Ramon office role failed', error);
      console.log('✓ Office Account: ramon_delacruz_office / office2024 (Supervisor, Human Resources)');
    } else {
      console.log('↩ Ramon already holds an Active office role for Human Resources');
    }
  }

  // 5) Phase 1 target_settings — APPROVED / frozen, approved by Ramon.
  const { data: ts, error: tsErr } = await db.from('target_settings').upsert({
    employee_id: maria.id,
    cycle_id: CYCLE_ID,
    status: 'approved',
    submitted_at: '2026-01-15T09:32:00+08:00',
    reviewed_by: ramon.id,
    reviewed_at: '2026-01-20T14:10:00+08:00',
    review_comment: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'employee_id,cycle_id' }).select('id').single();
  if (tsErr) die('upsert target_settings failed', tsErr);
  console.log(`✓ target_settings (approved) → ${ts.id}`);

  // 6) Replace MFOs + success indicators (children cascade off mfos).
  await db.from('mfos').delete().eq('target_setting_id', ts.id);
  for (const fn of ['core', 'strategic', 'support']) {
    for (let i = 0; i < TARGETS[fn].length; i++) {
      const mfo = TARGETS[fn][i];
      const { data: mfoRow, error: mfoErr } = await db.from('mfos').insert({
        target_setting_id: ts.id, function_type: fn, title: mfo.title, sort_order: i,
      }).select('id').single();
      if (mfoErr) die(`insert mfo (${fn}) failed`, mfoErr);
      const siRows = mfo.indicators.map((description, j) => ({ mfo_id: mfoRow.id, description, sort_order: j }));
      const { error: siErr } = await db.from('success_indicators').insert(siRows);
      if (siErr) die(`insert success_indicators (${fn}) failed`, siErr);
    }
  }
  console.log('✓ MFOs + success indicators inserted (core 2, strategic 1, support 1)');

  // 7) Mirror flattened targets into ipcr_workspace (Phase 2 + PDF read these).
  //    Phase 2 columns left null → status "Targets Submitted" (rating not started).
  const { error: wsErr } = await db.from('ipcr_workspace').upsert({
    employee_id: maria.id,
    employee_num: 'EMP-2024-001',
    employee_name: 'Maria Santos',
    office_id: HR_OFFICE_ID,
    office_name: HR_OFFICE_NAME,
    period: PERIOD,
    status: 'Targets Submitted',
    core_target: flatten(TARGETS.core),
    strategic_target: flatten(TARGETS.strategic),
    support_target: flatten(TARGETS.support),
    targets_submitted_at: '2026-01-15T09:32:00+08:00',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'employee_id,period' });
  if (wsErr) die('upsert ipcr_workspace failed', wsErr);
  console.log(`✓ ipcr_workspace (Targets Submitted) → period "${PERIOD}"`);

  console.log('\n✅ Done. Log in as employee01 / hr2024 → My IPCR Workspace.');
  console.log('   Phase 1 targets are frozen (approved). Phase 2 rating is open and unscored.');
}

main().catch((e) => die('unexpected error', e));
