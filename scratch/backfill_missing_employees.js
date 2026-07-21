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

const legacyMap = {
  'Human Resource Management Office': 'Human Resources',
  'Information Technology Office': 'Information Technology',
  'City Planning and Development Office': 'Operations',
  'City Health Office': 'Operations',
  'City Engineering Office': 'Operations',
  "Treasurer's Office": 'Finance',
  'Budget Office': 'Finance',
  'General Services Office': 'Operations',
  'Office of the City Engineer': 'Operations',
  'Office of the City Accountant': 'Finance',
  'Office of the City Social Welfare and Development': 'Operations',
  'IT Department': 'Information Technology',
  'HR Department': 'Human Resources',
  'Finance Department': 'Finance',
  'Legal Department': 'Legal',
  'IT Division': 'Information Technology',
  'Health Office': 'Operations',
  'Treasury Department': 'Finance'
};

async function backfill() {
  console.log("Starting missing employees backfill...");

  // 1. Fetch all hired applicants
  const { data: applicants, error: appErr } = await supabase
    .from('applicants')
    .select('*')
    .eq('status', 'Hired');

  if (appErr) {
    console.error("Error fetching applicants:", appErr);
    return;
  }

  // 2. Fetch all employees
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, first_name, last_name, email, employee_number');

  if (empErr) {
    console.error("Error fetching employees:", empErr);
    return;
  }

  // 3. Fetch all departments
  const { data: departments, error: deptErr } = await supabase
    .from('departments')
    .select('id, name');

  if (deptErr) {
    console.error("Error fetching departments:", deptErr);
    return;
  }

  const deptMap = new Map(departments.map(d => [d.name.toLowerCase().trim(), d.id]));

  // Index employees
  const employeeEmails = new Set(employees.map(e => String(e.email).toLowerCase().trim()));
  const employeeNames = new Set(employees.map(e => `${String(e.first_name).toLowerCase().trim()} ${String(e.last_name).toLowerCase().trim()}`));

  let backfillCount = 0;

  for (const app of applicants) {
    const email = String(app.email || '').toLowerCase().trim();
    const fullName = `${String(app.first_name || '').toLowerCase().trim()} ${String(app.last_name || '').toLowerCase().trim()}`;
    
    const hasEmailMatch = email ? employeeEmails.has(email) : false;
    const hasNameMatch = employeeNames.has(fullName);

    if (!hasEmailMatch && !hasNameMatch) {
      console.log(`Backfilling missing employee: ${app.first_name} ${app.last_name} (${app.email || 'No email'})`);

      // 4. Resolve details
      const empId = app.employee_id || `EMP-${app.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
      
      let departmentName = app.office || 'Operations';
      if (legacyMap[departmentName]) {
        departmentName = legacyMap[departmentName];
      }
      
      const deptId = deptMap.get(departmentName.toLowerCase().trim()) || null;

      let appEmail = app.email;
      if (!appEmail) {
        const first = String(app.first_name || '').toLowerCase().replace(/\s+/g, '');
        const last = String(app.last_name || '').toLowerCase().replace(/\s+/g, '');
        appEmail = `${first}.${last}.${empId.toLowerCase()}@employee.local`;
      }

      const insertData = {
        employee_number: empId,
        first_name: app.first_name || '',
        middle_name: app.middle_name || '',
        last_name: app.last_name || '',
        email: appEmail,
        phone: app.contact_number || null,
        current_address_street: app.address || null,
        permanent_address_street: app.address || null,
        sex: app.gender || 'Other',
        position: app.position || 'Staff',
        department: departmentName,
        employment_status: 'Regular',
        date_hired: String(app.updated_at || new Date().toISOString()).split('T')[0],
        status: 'Active',
        user_account_id: null
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('employees')
        .upsert(insertData, { onConflict: 'employee_number' })
        .select();

      if (insertErr) {
        console.error(`❌ Failed to backfill ${fullName}:`, insertErr);
      } else {
        console.log(`✅ Successfully backfilled ${fullName} -> Employee ID: ${empId}`);
        backfillCount++;
      }
    }
  }

  console.log(`\nBackfill Finished. Successfully backfilled ${backfillCount} employee records.`);
}

backfill();
