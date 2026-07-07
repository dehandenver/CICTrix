const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const env = envContent.split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  }
  return acc;
}, {});

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

console.log('Connecting using Anon Key...');
const supabase = createClient(url, key);

async function run() {
  console.log('--- Testing employees_with_department view ---');
  const { data, error } = await supabase
    .from('employees_with_department')
    .select('id, employee_id, full_name, current_position');

  if (error) {
    console.error('Error with Anon Key:', error);
  } else {
    console.log('Result count with Anon Key:', data ? data.length : 0);
    console.log('Result rows:', data);
  }
}
run();
