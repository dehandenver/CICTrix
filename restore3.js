const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});
// Note: using Service Role key
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: emps, error: err1 } = await supabase.from('employees').select('first_name, last_name, employee_number, email');
  if (err1) console.error('emps err:', err1);
  console.log('Valid employees count:', emps?.length);
  
  const { data: nh, error: err2 } = await supabase.from('newly_hired').select('id, first_name, last_name, email');
  if (err2) console.error('nh err:', err2);
  
  let c = 0;
  for (let emp of (emps || [])) {
    let match = nh.find(n => n.email === emp.email && n.first_name === emp.first_name);
    if (!match) {
        match = nh.find(n => n.first_name === emp.first_name && n.last_name === emp.last_name);
    }
    if (match) {
      await supabase.from('newly_hired').update({ employee_id: emp.employee_number, status: 'In Onboarding' }).eq('id', match.id);
      c++;
      console.log('Restored map:', emp.employee_number, 'to', match.id);
    } else {
      console.log('No match found in newly_hired for:', emp);
    }
  }
  console.log('Restored total:', c);
}
run();