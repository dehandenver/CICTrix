const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('employees').select('employee_number, first_name, last_name, email').then(({data}) => console.log(data));
