const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: emps } = await supabase.from('employees').select('first_name, last_name, employee_id, email');
  console.log('Valid employees:', emps);
  
  const { data: nh } = await supabase.from('newly_hired').select('id, first_name, last_name, email');
  
  let c = 0;
  for (let emp of emps) {
    let match = nh.find(n => n.email === emp.email && n.first_name === emp.first_name);
    if (!match) {
        match = nh.find(n => n.first_name === emp.first_name && n.last_name === emp.last_name);
    }
    if (match) {
      await supabase.from('newly_hired').update({ employee_id: emp.employee_id, status: 'In Onboarding' }).eq('id', match.id);
      c++;
      console.log('Restored map:', emp.employee_id, 'to', match.id);
    }
  }
  console.log('Restored total:', c);
}
run();
