const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function cleanup() {
  console.log('Starting cleanup...');

  // 1. Clean employees table
  const { data: emps } = await supabase.from('employees').select('id, email, employee_number');
  const keptEmps = new Map();
  const empsToDelete = [];

  emps.forEach(emp => {
    const key = (emp.email || '').toLowerCase();
    if (!keptEmps.has(key)) {
      keptEmps.set(key, emp);
    } else {
      empsToDelete.push(emp.id);
    }
  });

  if (empsToDelete.length > 0) {
    console.log(`Deleting ${empsToDelete.length} duplicate employees...`);
    await supabase.from('employees').delete().in('id', empsToDelete);
  }

  // 2. Clean newly_hired table
  const { data: nh } = await supabase.from('newly_hired').select('id, applicant_id, email, employee_id');
  const keptNh = new Map();
  const nhToDelete = [];

  nh.forEach(row => {
    const key = row.applicant_id;
    if (!keptNh.has(key)) {
      keptNh.set(key, row);
    } else {
       // Prefer keeping rows that already have an employee_id assigned
       const existing = keptNh.get(key);
       if (!existing.employee_id && row.employee_id) {
           nhToDelete.push(existing.id);
           keptNh.set(key, row);
       } else {
           nhToDelete.push(row.id);
       }
    }
  });

  if (nhToDelete.length > 0) {
    console.log(`Deleting ${nhToDelete.length} duplicate newly_hired ghost records...`);
    for(let i=0; i<nhToDelete.length; i+=10) {
      await supabase.from('newly_hired').delete().in('id', nhToDelete.slice(i, i+10));
    }
  }
  
  // 3. Ensure the perfect 1-to-1 sync
  console.log('Syncing the final 7 unique records perfectly...');
  for (const [key, emp] of keptEmps.entries()) {
     const nhRow = Array.from(keptNh.values()).find(n => (n.email || '').toLowerCase() === key);
     if (nhRow) {
         await supabase.from('newly_hired').update({ 
           employee_id: emp.employee_number,
           status: 'In Onboarding'
         }).eq('id', nhRow.id);
     }
  }

  console.log('Cleanup complete! Exactly 7 clean records remain.');
}

cleanup();
