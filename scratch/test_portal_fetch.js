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

// Map Supabase Row to Employee (copied from employeePortal.ts mapping logic)
function mapRow(row) {
  const firstName = (row.first_name ?? '').trim();
  const middleName = (row.middle_name ?? '').trim();
  const lastName = (row.last_name ?? '').trim();
  const suffix = (row.suffix ?? '').trim();

  const nameParts = [firstName, middleName, lastName, suffix].filter(Boolean);
  const fullName = nameParts.join(' ');

  const addressParts = [
    row.current_address_street,
    row.current_address_barangay,
    row.current_address_city,
    row.current_address_province,
    row.current_address_zipcode,
  ].filter(Boolean);
  const homeAddress = addressParts.join(', ');

  return {
    supabaseId: row.id,
    employeeId: row.employee_number || row.employee_id || '',
    fullName,
    email: row.email || '',
    dateOfBirth: row.date_of_birth || '',
    placeOfBirth: row.place_of_birth || '',
    phone: row.phone || row.mobile_number || '',
    homeAddress,
    sssNumber: row.sss_number || '',
    tinNumber: row.tin_number || '',
    philhealthNumber: row.philhealth_number || '',
    pagibigNumber: row.pagibig_number || '',
    currentPosition: row.position || row.current_position || '',
    currentDepartment: row.department || row.current_department || '',
  };
}

async function test() {
  // Test target: Cristina Alonzo (EMP-7FA5BA9A)
  console.log("Fetching by number from view...");
  const { data: viewData, error: viewErr } = await supabase
    .from('employees_with_department')
    .select('*')
    .eq('employee_id', 'EMP-7FA5BA9A')
    .maybeSingle();

  if (viewErr) {
    console.error("View fetch error:", viewErr);
  } else if (viewData) {
    console.log("View data mapped:", mapRow({
      ...viewData,
      employee_number: viewData.employee_id,
      phone: viewData.mobile_number,
      sex: viewData.gender,
      current_address_street: viewData.home_address,
      position: viewData.current_position ?? viewData.position,
      department: viewData.current_department ?? viewData.department,
    }));
  }

  console.log("\nFetching by UUID from base table...");
  if (viewData) {
    const { data: tableData, error: tableErr } = await supabase
      .from('employees')
      .select('*')
      .eq('id', viewData.id)
      .maybeSingle();

    if (tableErr) {
      console.error("Table fetch error:", tableErr);
    } else if (tableData) {
      console.log("Table data mapped:", mapRow(tableData));
    }
  }
}

test();
