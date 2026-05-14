const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const validTargetApplicants = [
  '729d584e-2f76-49db-bc9f-70ed76f84597',
  '4a2ab9ec-317d-410c-a83e-cab2502c65a8',
  '036e2916-578c-42e5-940b-85dd3717857e',
  'a8fcfa0e-ca1c-4220-9133-d8c325f46239',
  '4cc73932-cf28-44cb-a3eb-46723dddd72c',
  'f78e7d66-eefa-4944-a1c7-ed6ed43713a1',
  '3ad92fb7-666c-4c2d-9660-b3069c6593ab'
];

async function run() {
  await supabase.from('newly_hired').update({ employee_id: null, status: 'Pending Onboarding' }).neq('id', 'DUMMY');

  const { data: emps } = await supabase.from('employees').select('first_name, last_name, employee_number, email');
  const { data: nh } = await supabase.from('newly_hired').select('*');
  
  let mappedSet = new Set();
  
  for (let appId of validTargetApplicants) {
    let nhRows = nh.filter(n => String(n.applicant_id).includes(appId));
    if (nhRows.length > 0) {
      let nhRowToUpdate = nhRows[0]; // grab the first valid newly_hired row for this applicant
      
      let matchEmp = emps.find(emp => {
        let sameEmail = emp.email && emp.email === nhRowToUpdate.email;
        let sameName = emp.first_name === nhRowToUpdate.first_name && emp.last_name === nhRowToUpdate.last_name;
        return (sameEmail || sameName) && !mappedSet.has(emp.employee_number);
      });
      
      if (matchEmp) {
         await supabase.from('newly_hired').update({ employee_id: matchEmp.employee_number, status: 'In Onboarding' }).eq('id', nhRowToUpdate.id);
         mappedSet.add(matchEmp.employee_number);
         console.log('Mapped', appId, 'to', matchEmp.employee_number);
      } else {
         console.log('No employee record for', appId);
      }
    }
  }
}
run();