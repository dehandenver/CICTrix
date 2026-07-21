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

async function check() {
  // Get all hired applicants
  const { data: applicants, error: appErr } = await supabase
    .from('applicants')
    .select('id, first_name, last_name, email, position, office, status')
    .eq('status', 'Hired');

  if (appErr) {
    console.error("Error fetching applicants:", appErr);
    return;
  }

  // Get all employees
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, first_name, last_name, email, employee_number, position, department');

  if (empErr) {
    console.error("Error fetching employees:", empErr);
    return;
  }

  console.log(`Found ${applicants.length} Hired Applicants in the database.`);
  console.log(`Found ${employees.length} Employees in the database.`);

  const employeeEmails = new Set(employees.map(e => String(e.email).toLowerCase().trim()));
  const employeeNames = new Set(employees.map(e => `${String(e.first_name).toLowerCase().trim()} ${String(e.last_name).toLowerCase().trim()}`));

  console.log("\nHired Applicants who are NOT in the employees table:");
  let count = 0;
  for (const app of applicants) {
    const email = String(app.email).toLowerCase().trim();
    const fullName = `${String(app.first_name).toLowerCase().trim()} ${String(app.last_name).toLowerCase().trim()}`;
    
    const hasEmailMatch = employeeEmails.has(email);
    const hasNameMatch = employeeNames.has(fullName);

    if (!hasEmailMatch && !hasNameMatch) {
      console.log(`- ${app.first_name} ${app.last_name} (${app.email}) | Position: ${app.position} | Office: ${app.office}`);
      count++;
    }
  }
  console.log(`Total missing: ${count}`);
}

check();
