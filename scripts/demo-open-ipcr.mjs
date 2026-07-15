// ─────────────────────────────────────────────────────────────────────────────
// Demo setup: open ONE employee's IPCR so the full Phase 1 flow can be run
// end-to-end — employee sets targets → submits → Office Account edits/approves.
//
// Uses the documented demo pair (all existing accounts, nothing invented):
//   Employee     : Maria Santos  (EMP-2024-001)
//   Office Account: Ramon Dela Cruz — Maria's approving authority (HR)
//
// The seeders leave Maria's Phase 1 already APPROVED/frozen, so this resets her
// active-cycle record back to a clean DRAFT (unfreezes + clears targets + resets
// Phase 2), and ensures Ramon's login + office account exist. Idempotent.
//
//   node scripts/demo-open-ipcr.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { loadEnv, serviceClient, die } from './lib/ipcr-shared.mjs';

const env = loadEnv();
const db = serviceClient(env);
const nowIso = () => new Date().toISOString();

async function main() {
  // 1) Maria (employee) must exist.
  const { data: maria, error: mErr } = await db
    .from('employees')
    .select('id, employee_number, first_name, last_name, department')
    .eq('employee_number', 'EMP-2024-001')
    .maybeSingle();
  if (mErr) die('lookup Maria failed', mErr);
  if (!maria) die('Maria Santos (EMP-2024-001) not found. Run: node scripts/seed-ipcr-maria.mjs first.');
  console.log(`✓ Employee: Maria Santos → ${maria.id}`);

  // 2) Maria's portal login (employee-side auth is username/password).
  const { data: mariaAcct } = await db
    .from('employee_portal_accounts')
    .select('username, password')
    .eq('employee_id', 'EMP-2024-001')
    .maybeSingle();

  // 3) Resolve the Human Resources office id by name (don't trust a hardcoded uuid).
  const { data: hrDept } = await db
    .from('departments')
    .select('id, name')
    .ilike('name', 'Human Resources')
    .maybeSingle();
  const HR_OFFICE_ID = hrDept?.id ?? 'f7128cc8-0c9d-4791-bd9f-0e801e702d50';
  const HR_OFFICE_NAME = hrDept?.name ?? 'Human Resources';

  // 4) Ramon (Office Account / approver) — ensure the employee, portal login, and
  //    an Active office role all exist.
  let ramon = (await db.from('employees').select('id').eq('employee_number', 'EMP-2024-000').maybeSingle()).data;
  if (!ramon) {
    const { data, error } = await db.from('employees').insert({
      employee_number: 'EMP-2024-000',
      first_name: 'Ramon', last_name: 'Dela Cruz',
      email: 'ramon.delacruz@ilongcity.gov.ph',
      department: HR_OFFICE_NAME,
      position: 'Assistant Department Head / Approving Authority',
      employment_status: 'Regular', sex: 'Male', date_hired: '2015-06-01',
      status: 'Active', created_by: maria.id,
    }).select('id').single();
    if (error) die('create Ramon failed', error);
    ramon = data;
    console.log(`✓ Office Account holder: Ramon Dela Cruz created → ${ramon.id}`);
  } else {
    console.log(`✓ Office Account holder: Ramon Dela Cruz → ${ramon.id}`);
  }

  await db.from('employee_portal_accounts').upsert({
    id: 'employee-account-ramon-delacruz',
    username: 'ramon.delacruz', password: 'hr2024',
    employee_id: 'EMP-2024-000', full_name: 'Ramon Dela Cruz',
    email: 'ramon.delacruz@ilongcity.gov.ph', updated_at: nowIso(),
  }, { onConflict: 'id' });

  const existingRole = await db.from('office_role_assignments')
    .select('id, account_username, account_password')
    .eq('employee_id', ramon.id).eq('office_id', HR_OFFICE_ID).eq('status', 'Active').maybeSingle();
  let officeUser = existingRole.data?.account_username ?? 'ramon_delacruz_office';
  let officePass = existingRole.data?.account_password ?? 'office2024';
  if (!existingRole.data) {
    const { error } = await db.from('office_role_assignments').insert({
      employee_id: ramon.id, employee_name: 'Ramon Dela Cruz',
      office_id: HR_OFFICE_ID, office_name: HR_OFFICE_NAME,
      role: 'Supervisor',
      account_username: officeUser, account_password: officePass,
      must_change_password: false, status: 'Active',
      assigned_by: 'demo-open-ipcr', assigned_at: nowIso(),
    });
    if (error) die('create Ramon office role failed', error);
    console.log('✓ Office role created for Ramon (Supervisor, HR)');
  }

  // 5) Ramon must be Maria's designated approver (self-approval is blocked).
  await db.from('ipcr_designated_approvers').upsert({
    employee_id: maria.id, approver_employee_id: ramon.id, updated_at: nowIso(),
  }, { onConflict: 'employee_id' }).then(() => undefined, () => undefined);

  // 6) Reset Maria's target_settings back to a clean DRAFT so the full flow can run.
  const { data: settings } = await db
    .from('target_settings')
    .select('id, cycle_id, status')
    .eq('employee_id', maria.id);
  let period = null;
  for (const ts of settings ?? []) {
    // a) Unfreeze the parent FIRST (the immutability trigger reads the parent's
    //    status when children are written, so children can't be cleared while
    //    it is still 'approved').
    const { error: upErr } = await db.from('target_settings').update({
      status: 'draft',
      submitted_at: null, reviewed_by: null, reviewed_at: null,
      approved_by: null, approved_at: null, review_comment: null,
      phase2_status: 'not_started',
      phase2_open_target_date: null, phase2_opened_at: null, phase2_opened_by: null,
      phase2_submitted_at: null, phase2_completed_at: null,
      phase2_closed_at: null, phase2_closed_by: null,
      updated_at: nowIso(),
    }).eq('id', ts.id);
    if (upErr) { console.warn(`  ⚠ unfreeze ${ts.id}: ${upErr.message}`); continue; }

    // b) Clear the frozen targets so the employee sets them from scratch.
    const { error: delErr } = await db.from('mfos').delete().eq('target_setting_id', ts.id);
    if (delErr) console.warn(`  ⚠ clear targets ${ts.id}: ${delErr.message}`);

    // c) Resolve this cycle's period label for the workspace reset.
    const { data: cyc } = await db.from('performance_cycles').select('title').eq('id', ts.cycle_id).maybeSingle();
    period = cyc?.title ?? period;
    console.log(`✓ Reset target_settings ${ts.id} (cycle ${ts.cycle_id}) → draft, targets cleared`);
  }

  // 7) Reset the flat workspace mirror so "My IPCR Workspace" shows a blank Phase 1.
  const periods = ['January–June 2026', 'July–December 2025'];
  if (period) periods.push(period);
  for (const p of [...new Set(periods)]) {
    await db.from('ipcr_workspace').delete().eq('employee_id', maria.id).eq('period', p);
  }
  console.log('✓ Cleared ipcr_workspace mirror for Maria');

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────');
  console.log('DEMO PAIR — IPCR is OPEN (Phase 1, draft) for Maria Santos');
  console.log('──────────────────────────────────────────────');
  console.log('EMPLOYEE (sets + submits targets):');
  console.log(`  Employee Portal login → ${mariaAcct?.username ?? 'employee01'} / ${mariaAcct?.password ?? 'hr2024'}`);
  console.log('  Name: Maria Santos (EMP-2024-001), Human Resources');
  console.log('\nOFFICE ACCOUNT (approves / freezes):');
  console.log(`  Office Account login → ${officeUser} / ${officePass}`);
  console.log('  Holder: Ramon Dela Cruz — Maria’s approving authority (HR)');
  console.log('──────────────────────────────────────────────\n');
}

main().catch((e) => die('demo-open-ipcr failed', e));
