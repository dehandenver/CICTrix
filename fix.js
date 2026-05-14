const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => { const parts = line.split('='); if (parts.length >= 2) acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['']/g, ''); return acc; }, {});
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const {data: emps} = await supabase.from('employees').select('id');
  const validIds = emps.map(e => e.id);
  const {data: nh} = await supabase.from('newly_hired').select('id, employee_id');
  let c=0;
  for(let row of nh){
    if(row.employee_id && !validIds.includes(row.employee_id)){
      await supabase.from('newly_hired').update({employee_id: null, status: 'Pending Onboarding'}).eq('id', row.id);
      c++;
    }
  }
  console.log('Fixed:', c);
}
run();