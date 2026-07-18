// apply_assessment_migration.js
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

if (!key) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY not found');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  try {
    console.log('Reading migration file...');
    const sql = fs.readFileSync('supabase/migrations/20260807_competency_assessment.sql', 'utf8');

    console.log('Executing SQL via RPC exec_sql...');
    const { data, error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
      console.error('Migration failed:', error.message);
      process.exit(1);
    }

    console.log('Migration applied successfully!', data);
  } catch (err) {
    console.error('Unhandled error:', err);
    process.exit(1);
  }
}
run();
