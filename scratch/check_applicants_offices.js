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
  const { data: apps, error } = await supabase.from('applicants').select('id, office, current_department');
  if (error) {
    console.error('Error fetching applicants:', error);
    return;
  }
  console.log('Total applicants count:', apps.length);
  const uniqueOffices = [...new Set(apps.map(a => a.office).filter(Boolean))];
  const uniqueCurrDepts = [...new Set(apps.map(a => a.current_department).filter(Boolean))];
  console.log('Unique offices in applicants:', uniqueOffices);
  console.log('Unique current_departments in applicants:', uniqueCurrDepts);
}

run();
