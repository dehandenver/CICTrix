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
  const { data: cycles } = await supabase.from('performance_cycles').select('*');
  console.log('Cycles:', cycles);

  const { data: empView } = await supabase.from('employees_with_department').select('*').eq('id', '339a4e5a-d4d4-455d-a1e1-48f50de34595');
  console.log('Employee view:', empView);
}
run();
