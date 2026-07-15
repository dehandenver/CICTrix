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
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5emRmZ3hhYW93anpianB3cmlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5NTcwNywiZXhwIjoyMDg1MjcxNzA3fQ.ZK7i_oUHgJj2cEmDy5UDhLp50BaD_4xo6TJlLJ_iX60';

const supabase = createClient(url, key);

async function run() {
  console.log('--- Updating employees table department values ---');
  
  // Update 'office of the city accountant' to 'Office of The City Accountant'
  const { data: updateData, error: updateError } = await supabase
    .from('employees')
    .update({ department: 'Office of The City Accountant' })
    .eq('department', 'office of the city accountant')
    .select('id, employee_number, department');

  if (updateError) {
    console.error('Error updating employees:', updateError);
  } else {
    console.log('Successfully updated employees:', updateData);
  }
}

run();
