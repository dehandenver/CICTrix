const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  }
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log('=== SYSTEM PHASE SCHEDULES ===');
  const { data: systemSchedules } = await supabase.from('phase_schedules').select('*');
  console.log(systemSchedules);

  console.log('\n=== PROBATIONARY SCHEDULES ===');
  const { data: probSchedules } = await supabase.from('probationary_ipcr_schedules').select('*');
  console.log(probSchedules);

  console.log('\n=== RECENT TARGET SETTINGS ===');
  const { data: targetSettings } = await supabase.from('target_settings').select('*').limit(5);
  console.log(targetSettings);
}
run();
