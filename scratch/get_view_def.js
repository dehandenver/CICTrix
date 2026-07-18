// get_view_def.js
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
  const { data, error } = await supabase.rpc('get_view_definition', { view_name: 'v_competency_gap_analysis' });
  if (error) {
    // If RPC isn't available, try executing direct SQL or checking pg_views via select
    console.log('Error with RPC:', error.message);
    const { data: viewData, error: viewError } = await supabase
      .from('pg_views') // might not be exposed to PostgREST
      .select('*')
      .eq('viewname', 'v_competency_gap_analysis');
    console.log('pg_views result:', viewData, 'error:', viewError?.message);
  } else {
    console.log('Definition:', data);
  }
}
run();
