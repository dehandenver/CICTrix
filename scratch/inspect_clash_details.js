const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  }
  return acc;
}, {});

const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5emRmZ3hhYW93anpianB3cmlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5NTcwNywiZXhwIjoyMDg1MjcxNzA3fQ.ZK7i_oUHgJj2cEmDy5UDhLp50BaD_4xo6TJlLJ_iX60";
const supabase = createClient(env.VITE_SUPABASE_URL, serviceKey);

async function inspect() {
  // 1. Check for duplicate emails in current employees table
  const { data: emps } = await supabase.from('employees').select('employee_number, first_name, last_name, email');
  
  const emailCounts = {};
  for (const e of emps || []) {
    const key = (e.email || '').toLowerCase().trim();
    if (!emailCounts[key]) emailCounts[key] = [];
    emailCounts[key].push(`${e.first_name} ${e.last_name} (${e.employee_number})`);
  }
  
  console.log("=== DUPLICATE EMAILS IN employees TABLE ===");
  let dupCount = 0;
  for (const [email, holders] of Object.entries(emailCounts)) {
    if (holders.length > 1) {
      console.log(`  ${email}:`);
      holders.forEach(h => console.log(`    - ${h}`));
      dupCount++;
    }
  }
  if (dupCount === 0) console.log("  (none found)");
  
  // 2. Check the 5 overwritten rows — what is the current UUID `id` for each?
  const clashIds = ['EMP-7FA5BA9A', 'EMP-2026-002', 'EMP-09CC4879', 'EMP-F0156D31', 'EMP-2238FD0D'];
  console.log("\n=== CURRENT STATE OF CLASHED employee_numbers ===");
  for (const num of clashIds) {
    const { data: row } = await supabase
      .from('employees')
      .select('id, employee_number, first_name, last_name, email, position, department')
      .eq('employee_number', num)
      .maybeSingle();
    if (row) {
      console.log(`  ${num}: UUID=${row.id} | ${row.first_name} ${row.last_name} | ${row.email} | ${row.position} | ${row.department}`);
    } else {
      console.log(`  ${num}: NOT FOUND`);
    }
  }

  // 3. Check if the 5 clashing applicants have employee_id set in applicants table
  console.log("\n=== APPLICANT employee_id VALUES FOR CLASHING HIRES ===");
  const clashApplicantEmails = ['m@gmail.com', 'rodrigodutae@gmail.com', 'skyedenver@gmail.com', 'dscsd@mail.com', 'chrispbacon.onlyfans@gmail.com'];
  for (const email of clashApplicantEmails) {
    const { data: apps } = await supabase
      .from('applicants')
      .select('id, first_name, last_name, email, employee_id, position, office, status')
      .eq('email', email);
    for (const a of (apps || [])) {
      console.log(`  ${a.first_name} ${a.last_name} (${a.email}): employee_id=${a.employee_id || '(null)'} | status=${a.status} | position=${a.position}`);
    }
  }
  
  // 4. Check if any IPCR records reference the 5 clashed UUIDs
  console.log("\n=== IPCR SUBMISSIONS REFERENCING CLASHED UUIDs ===");
  for (const num of clashIds) {
    const { data: row } = await supabase
      .from('employees')
      .select('id')
      .eq('employee_number', num)
      .maybeSingle();
    if (!row) continue;
    
    const { data: ipcrs } = await supabase
      .from('ipcr_submissions')
      .select('id, employee_id, status')
      .eq('employee_id', row.id);
    if (ipcrs && ipcrs.length > 0) {
      console.log(`  ${num} (UUID ${row.id}): ${ipcrs.length} IPCR submission(s)`);
    }
  }

  // Also check by employee_num field
  console.log("\n=== IPCR SUBMISSIONS BY employee_num ===");
  for (const num of clashIds) {
    const { data: ipcrs } = await supabase
      .from('ipcr_submissions')
      .select('id, employee_num, status')
      .eq('employee_num', num);
    if (ipcrs && ipcrs.length > 0) {
      console.log(`  ${num}: ${ipcrs.length} IPCR submission(s)`);
      for (const i of ipcrs) {
        console.log(`    - ${i.id} (status: ${i.status})`);
      }
    }
  }
}

inspect();
