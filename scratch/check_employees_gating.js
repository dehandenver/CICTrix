const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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
  const { data, error } = await supabase
    .from('pg_proc')
    .select('proname')
    .limit(10);
  console.log('Direct query pg_proc:', data, error);
}
run();
