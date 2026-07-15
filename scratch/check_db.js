const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read env variables
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

const supabase = createClient(url, key);

async function run() {
  console.log('--- Querying departments ---');
  const { data: depts, error: deptsErr } = await supabase.from('departments').select('*');
  if (deptsErr) console.error('Error fetching departments:', deptsErr);
  else console.log('Departments:', depts.map(d => ({ id: d.id, name: d.name, code: d.code })));

  console.log('\n--- Querying unique departments in employees ---');
  const { data: emps, error: empsErr } = await supabase.from('employees').select('department');
  if (empsErr) {
    console.error('Error fetching employees:', empsErr);
  } else {
    const uniqueDepts = [...new Set(emps.map(e => e.department))];
    console.log('Unique departments in employees:', uniqueDepts);
  }

  console.log('\n--- Querying unique departments in employees_with_department ---');
  const { data: emps2, error: emps2Err } = await supabase.from('employees_with_department').select('department');
  if (emps2Err) console.error('Error fetching employees_with_department:', emps2Err);
  else {
    const uniqueDepts = [...new Set(emps2.map(e => e.department))];
    console.log('Unique departments in employees_with_department:', uniqueDepts);
  }

  console.log('\n--- Querying unique departments in job_postings ---');
  const { data: jobs, error: jobsErr } = await supabase.from('job_postings').select('department');
  if (jobsErr) console.error('Error fetching job_postings:', jobsErr);
  else {
    const uniqueDepts = [...new Set(jobs.map(j => j.department))];
    console.log('Unique departments in job_postings:', uniqueDepts);
  }
}

run();
