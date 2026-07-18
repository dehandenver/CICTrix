const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

function loadEnv(path) {
  if (!fs.existsSync(path)) return {};
  return fs.readFileSync(path, 'utf8').split('\n').reduce((acc, l) => {
    const p = l.split('=');
    if (p.length >= 2) acc[p[0].trim()] = p.slice(1).join('=').trim().replace(/['"]/g, '');
    return acc;
  }, {});
}

const env = { ...loadEnv('.env'), ...loadEnv('backend/.env') };
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function run() {
  // Jean Pierre id
  const { data: emps } = await supabase.from('employees').select('id, employee_number').eq('employee_number', 'EMP-2026-9056');
  console.log('Employee:', emps);
  if (!emps || emps.length === 0) return;

  const jpId = emps[0].id;

  const { data: settings } = await supabase.from('target_settings').select('*').eq('employee_id', jpId);
  console.log('Target settings:', settings);

  const { data: submissions } = await supabase.from('ipcr_submissions').select('*').eq('employee_id', jpId);
  console.log('Submissions:', submissions);
}
run();
