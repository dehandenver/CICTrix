const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load both .env (URL / anon) and backend/.env (service-role key)
function loadEnv(path) {
  if (!fs.existsSync(path)) return {};
  return fs.readFileSync(path, 'utf8').split('\n').reduce((acc, l) => {
    const p = l.split('=');
    if (p.length >= 2) acc[p[0].trim()] = p.slice(1).join('=').trim().replace(/['"]/g, '');
    return acc;
  }, {});
}

const env = { ...loadEnv('.env'), ...loadEnv('backend/.env') };
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) { console.error('No SUPABASE_SERVICE_ROLE_KEY found'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});


async function run() {
  console.log('=== Jean Pierre Reassignment ===\n');

  // ── 1. Insert employees row ───────────────────────────────────────────────
  console.log('Step 1: Inserting employees row for Jean Francois Pierre...');
  const { error: e1 } = await supabase
    .from('employees')
    .insert({
      employee_number: 'EMP-2026-9056',
      first_name: 'Jean',
      middle_name: 'Francois',
      last_name: 'Pierre',
      department: 'Information Technology',
      position: 'Computer Science Specialist',
      employment_status: 'Regular',
      status: 'Active',
      nationality: 'Filipino',
      account_status: 'Active',
      email: 'jean.pierre@cityhall.gov.ph',
      date_hired: '2026-07-17',
      created_by: '00000000-0000-0000-0000-000000000000',
    });
  if (e1) {
    // conflict = already exists, skip
    if (e1.code === '23505') console.log('  → Row already exists (skipped).');
    else { console.error('  ✗ Error:', e1.message); return; }
  } else {
    console.log('  ✓ Inserted EMP-2026-9056 (Jean Francois Pierre)');
  }

  // ── 2. Re-link portal account employee_id ────────────────────────────────
  console.log('\nStep 2: Re-linking portal account to EMP-2026-9056...');
  const { error: e2, count: c2 } = await supabase
    .from('employee_portal_accounts')
    .update({ employee_id: 'EMP-2026-9056' })
    .eq('id', 'portal-EMP-2026-8997');
  if (e2) { console.error('  ✗ Error:', e2.message); return; }
  console.log('  ✓ Updated employee_id on portal-EMP-2026-8997');

  // ── 3a. Null out FK in password-reset audit rows ──────────────────────────
  console.log('\nStep 3a: Nulling FK in employee_password_resets...');
  const { error: e3a } = await supabase
    .from('employee_password_resets')
    .update({ account_id: null })
    .eq('account_id', 'portal-EMP-2026-8997');
  if (e3a) { console.error('  ✗ Error:', e3a.message); return; }
  console.log('  ✓ Nulled account_id where account_id = portal-EMP-2026-8997');

  // ── 3b. Rename the PK ─────────────────────────────────────────────────────
  console.log('\nStep 3b: Renaming portal account PK...');
  const { error: e3b } = await supabase
    .from('employee_portal_accounts')
    .update({ id: 'portal-EMP-2026-9056', full_name: 'Jean Francois Pierre' })
    .eq('id', 'portal-EMP-2026-8997');
  if (e3b) { console.error('  ✗ Error:', e3b.message); return; }
  console.log('  ✓ Renamed PK to portal-EMP-2026-9056');

  // ── 3c. Re-attach password-reset audit rows ───────────────────────────────
  console.log('\nStep 3c: Re-linking password-reset rows...');
  const { error: e3c } = await supabase
    .from('employee_password_resets')
    .update({ account_id: 'portal-EMP-2026-9056' })
    .eq('employee_number', 'EMP-2026-9056')
    .is('account_id', null);
  if (e3c) { console.error('  ✗ Error:', e3c.message); return; }
  console.log('  ✓ Re-linked password-reset rows');

  // ── Verification ──────────────────────────────────────────────────────────
  console.log('\n=== Verification ===\n');

  const { data: empRows } = await supabase
    .from('employees')
    .select('employee_number, first_name, middle_name, last_name, department, position')
    .in('employee_number', ['EMP-2026-8997', 'EMP-2026-9056']);
  console.log('employees rows:');
  console.table(empRows);

  const { data: portalRows } = await supabase
    .from('employee_portal_accounts')
    .select('id, username, employee_id, full_name')
    .or('id.eq.portal-EMP-2026-8997,id.eq.portal-EMP-2026-9056,username.eq.jeanfrancoispierre1');
  console.log('portal account rows:');
  console.table(portalRows);
}

run().catch(console.error);
