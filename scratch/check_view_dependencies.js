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
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  const query = `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'employees';
  `;
  const { data, error } = await supabase.rpc('exec_sql', { sql: query });
  if (error) {
    console.error('Error running exec_sql:', error);
    return;
  }
  console.log('Columns in employees table:');
  console.log(JSON.stringify(data, null, 2));
}
run();
