const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  }
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data } = await supabase.from('applicants').select('id, first_name, last_name, status');
  const hired = data.filter(a => (a.status || '').toLowerCase() === 'hired' || (a.status || '').toLowerCase() === 'accept');
  console.log('Hired total:', hired.length);
  console.log(hired.map(a => a.id));
}
run();
