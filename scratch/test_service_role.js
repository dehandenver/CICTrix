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
// Use the service role key from VERCEL_DEPLOYMENT.md
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5emRmZ3hhYW93anpianB3cmlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5NTcwNywiZXhwIjoyMDg1MjcxNzA3fQ.ZK7i_oUHgJj2cEmDy5UDhLp50BaD_4xo6TJlLJ_iX60';

const supabase = createClient(url, key);

async function run() {
  console.log('--- Fetching with Service Role Key ---');
  const { data: emps, error } = await supabase
    .from('employees')
    .select('id, employee_number, full_name, department')
    .eq('department', 'office of the city accountant');

  if (error) {
    console.error('Error fetching employees:', error);
    return;
  }

  console.log('Employees with lowercase department:', emps);

  if (emps && emps.length > 0) {
    const targetId = emps[0].id;
    console.log(`Updating employee ${targetId} department...`);
    const { data: updateData, error: updateError } = await supabase
      .from('employees')
      .update({ department: 'Office of The City Accountant' })
      .eq('id', targetId)
      .select();

    if (updateError) {
      console.error('Error updating employees:', updateError);
    } else {
      console.log('Successfully updated employees:', updateData);
    }
  }
}

run();
